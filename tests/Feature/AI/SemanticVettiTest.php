<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\UserVettiFacts;
use Tests\TestCase;

final class SemanticVettiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
    }

    /** These intent/state tests isolate the booking-facts boundary. The actual
     * catalog and availability integration is tested in BookingConversationTest. */
    private function useSyntheticBookingFacts(): void
    {
        $provider = new class implements AiProviderInterface {
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array { return ['text'=>'unused','usage'=>[]]; }
        };
        $booking = \Mockery::mock(new \App\Services\AI\BookingConversationService(new \App\Services\AI\AiGateway($provider)));
        $booking->shouldReceive('prepare')->andReturnUsing(static fn ($user, $pets, $petId, $hint, $date, $preference, $question, $time = null) => [
            'status'=>'ready', 'service_value'=>$hint, 'service_label'=>$hint,
            'slots'=>[], 'preferred_time'=>$time, 'text'=>'Synthetic proposal for review.',
        ]);
        $this->app->instance(\App\Services\AI\BookingConversationService::class, $booking);
    }

    private function asUser(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id'=>123,'name'=>'Owner','role'=>'User','status'=>'active',
            'auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
    }

    private function enabled(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.semantic_vetti_enabled', true);
        config()->set('ai.paid_data_approved', true);
        config()->set('ai.semantic_privacy_cleared', true);
    }

    private function chat(string $message): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/ai/semantic-vetti', [
            'message'=>$message,'conversation_id'=>'chat_abc123456789',
        ]);
    }

    public function test_gemini_navigation_only_offers_the_authorized_portal_page(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        app(UserVettiFacts::class)->shouldReceive('documents')->once()->andReturn([]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) return ['text'=>json_encode(['intent'=>str_contains($message,'profile')?'account_profile':'records','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
                return ['text'=>str_contains($message,'My Profile')?'You can open My Profile.':'You can open My Documents.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Show my documents')->assertOk()->assertJsonPath('data.kind','documents_list')->assertJsonPath('data.source','rule');
        $this->chat('Open my profile')->assertOk()->assertJsonPath('data.kind','portal_navigation')->assertJsonPath('data.destination','profile');
        self::assertCount(3,$provider->inputs);
        self::assertStringNotContainsString('private record content',implode(' ',$provider->inputs));
    }

    public function test_appointment_guidance_uses_gemini_without_modifying_records(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([]);
        app(UserVettiFacts::class)->shouldReceive('history')->once()->andReturn([]);
        app(UserVettiFacts::class)->shouldReceive('upcoming')->twice()->andReturn([]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                if ($jsonSchema) {
                    $intent = str_contains($message, 'reschedule') ? 'reschedule'
                        : (str_contains($message, 'cancel') ? 'cancel' : 'appointment_history');
                    return ['text'=>json_encode(['intent'=>$intent,'pet_ref'=>'none','service'=>'none',
                        'date_expression'=>'','time_preference'=>'none','negated'=>false,
                        'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
                }
                return ['text'=>'Please check My Appointments for available options.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Show my appointments')->assertOk()->assertJsonPath('data.source','rule')->assertJsonPath('data.kind','appointment_history');
        foreach (['How can I reschedule?', 'How can I cancel?'] as $question) {
            $this->chat($question)->assertOk()->assertJsonPath('data.source','rule')
                ->assertJsonPath('data.kind','upcoming_appointments');
        }
        self::assertCount(3, $provider->inputs);
        self::assertStringNotContainsString('has_upcoming_appointments', implode(' ', $provider->inputs));
        self::assertStringNotContainsString('private record content', implode(' ', $provider->inputs));
    }

    public function test_cancel_and_reschedule_list_only_the_named_pets_appointments_without_modifying_them(): void
    {
        $this->asUser(); $this->enabled();
        $facts = $this->mock(UserVettiFacts::class);
        $facts->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Cat']]);
        $facts->shouldReceive('upcoming')->twice()->with(\Mockery::any(), 7)->andReturn([
            ['appointment_id'=>21,'pet_id'=>7,'pet_name'=>'Luna','service'=>'Consultation','date'=>'2026-12-15','time'=>'10:00','status'=>'confirmed'],
        ]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                $intent = str_contains(strtolower($message), 'reschedule') ? 'reschedule' : 'cancel';
                return ['text'=>$jsonSchema ? json_encode(['intent'=>$intent,'pet_ref'=>'PET_1','service'=>'none',
                    'date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,
                    'needs_clarification'=>false]) : 'Please choose an appointment to review.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        foreach (['cancel', 'reschedule'] as $operation) {
            $this->chat("Please $operation Luna appointment")->assertOk()
                ->assertJsonPath('data.kind','upcoming_appointments')
                ->assertJsonPath('data.requested_operation',$operation)
                ->assertJsonPath('data.appointments.0.appointment_id',21);
        }
        self::assertStringNotContainsString('Luna', implode(' ', $provider->inputs));
        self::assertStringNotContainsString('2026-12-15', implode(' ', $provider->inputs));
    }

    public function test_reschedule_preferences_are_grounded_in_the_users_message(): void
    {
        $this->asUser(); $this->enabled();
        \Illuminate\Support\Carbon::setTestNow('2026-11-08 08:00:00');
        try {
            $facts = $this->mock(UserVettiFacts::class);
            $facts->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Cat']]);
            $facts->shouldReceive('upcoming')->twice()->with(\Mockery::any(), 7)->andReturn([]);
            $provider = new class implements AiProviderInterface {
                public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                    return ['text'=>$jsonSchema ? json_encode(['intent'=>'reschedule','pet_ref'=>'PET_1','service'=>'none',
                        'date_expression'=>'November 10','exact_time_expression'=>'10am','time_preference'=>'none',
                        'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Please review the list below.', 'usage'=>[]];
                }
            };
            $this->app->instance(AiProviderInterface::class, $provider);
            $this->chat('Please reschedule Luna on November 10 at 10am')->assertOk()
                ->assertJsonPath('data.requested_date','2026-11-10')->assertJsonPath('data.requested_time','10:00');
            $this->chat('Please reschedule Luna')->assertOk()
                ->assertJsonPath('data.requested_date',null)->assertJsonPath('data.requested_time',null);
        } finally { \Illuminate\Support\Carbon::setTestNow(); }
    }

    public function test_selected_pet_is_owner_checked_and_sent_only_as_alias(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([
            ['id'=>7,'name'=>'Luna','species'=>'Dog','gender'=>'Female'],
            ['id'=>8,'name'=>'Bornok','species'=>'Cat','gender'=>'Male'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->with(\Mockery::any(),8)->andReturn(true);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'grooming',
                    'date_expression'=>'tomorrow','time_preference'=>'none','negated'=>false,
                    'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $base=['message'=>'Book my pet for grooming tomorrow','conversation_id'=>'chat_selected_pet_12345'];
        $this->postJson('/api/ai/semantic-vetti',$base+['active_pet_id'=>8])->assertOk()
            ->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.pet_id',8)
            ->assertJsonPath('data.booking_created',false);
        self::assertStringContainsString('Selected pet context: PET_2',$provider->inputs[0]);
        self::assertStringNotContainsString('Bornok',$provider->inputs[0]);
        $this->postJson('/api/ai/semantic-vetti',$base+['active_pet_id'=>9999])->assertOk()
            ->assertJsonPath('data.kind','information')->assertJsonMissingPath('data.pet_id');
        self::assertCount(1,$provider->inputs);
    }

    public function test_explicit_pet_conflicting_with_model_selection_cannot_open_proposal(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Luna','species'=>'Dog'],
            ['id'=>8,'name'=>'Bornok','species'=>'Cat'],
        ]);
        $this->app->instance(AiProviderInterface::class,new \App\Services\AI\Providers\FakeAiProvider(json_encode([
            'intent'=>'booking','pet_ref'=>'PET_2','service'=>'grooming','date_expression'=>'tomorrow',
            'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
        ])));
        $this->postJson('/api/ai/semantic-vetti',[
            'message'=>'Book Luna for grooming tomorrow','conversation_id'=>'chat_pet_conflict_123',
            'active_pet_id'=>8,
        ])->assertOk()->assertJsonPath('data.kind','information')->assertJsonMissingPath('data.pet_id');
    }

    public function test_navigation_markdown_is_rendered_as_plain_text(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'account_profile','pet_ref'=>'none','service'=>'none',
                    'date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,
                    'needs_clarification'=>false]) : 'Open [My Profile](verified_navigation:My Profile).','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Open my profile')->assertOk()->assertJsonPath('data.text','Open My Profile.')
            ->assertJsonPath('data.destination','profile');
    }

    public function test_pet_specific_records_intent_lists_the_matched_owned_pet(): void
    {
        $this->asUser(); $this->enabled();
        $facts = $this->mock(UserVettiFacts::class);
        $facts->shouldReceive('pets')->once()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Cat']]);
        $facts->shouldReceive('documents')->once()->with(\Mockery::any(), 7)->andReturn([
            ['id'=>12,'pet_name'=>'Luna','type'=>'prescription','status'=>'finalized','issued_at'=>'2026-10-30'],
        ]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'records','pet_ref'=>'PET_1','service'=>'none',
                    'date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,
                    'needs_clarification'=>false]) : 'Please see your documents below.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Show documents for Luna.')->assertOk()->assertJsonPath('data.kind','documents_list')
            ->assertJsonPath('data.items.0.pet_name','Luna');
        self::assertStringNotContainsString('Luna', implode(' ', $provider->inputs));
        self::assertStringNotContainsString('prescription', implode(' ', $provider->inputs));
    }

    public function test_other_owners_records_never_reach_provider(): void
    {
        $this->asUser();$this->enabled();
        $provider=new class implements AiProviderInterface {public array $messages=[];public function generate(string $i,string $m,?array $s=null):array{$this->messages[]=$m;return ['text'=>'I can only help with your own account to protect everyone’s privacy.','usage'=>[]];}};
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat("Show someone else's records")->assertOk()->assertJsonPath('data.source','ai');
        self::assertCount(1,$provider->messages);self::assertStringNotContainsString("someone else's",$provider->messages[0]);self::assertStringContainsString('privacy boundary',$provider->messages[0]);
    }

    public function test_broad_service_request_gives_gemini_all_active_catalog_labels(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->twice()->andReturn([
            'available'=>true, 'service_details'=>['Dog Grooming'=>['category'=>'Pet Care'], 'Cat Grooming'=>['category'=>'Pet Care']],
        ]);
        $provider = new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) return ['text'=>json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'public_operation'=>'service','public_service'=>'Dog Grooming']), 'usage'=>[]];
                return ['text'=>'We offer Dog Grooming and Cat Grooming.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Do you offer grooming?')->assertOk()->assertJsonPath('data.source','ai');
        $this->assertStringContainsString('Dog Grooming',$provider->inputs[1]);
        $this->assertStringContainsString('Cat Grooming',$provider->inputs[1]);
    }

    public function test_gemini_composes_clinic_reply_from_laravel_facts(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->once()->andReturn([
            'available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[],
        ]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                if ($jsonSchema !== null) return ['text'=>json_encode([
                    'intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                ]), 'usage'=>[]];
                return ['text'=>'You can find the clinic at 42 Fictional Avenue.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Where can I locate the clinic?')->assertOk()
            ->assertJsonPath('data.source','ai')->assertJsonPath('data.text','You can find the clinic at 42 Fictional Avenue.')
            ->assertJsonMissingPath('data.action');
        $this->assertCount(2,$provider->inputs);
        $this->assertStringContainsString('42 Fictional Avenue',$provider->inputs[1]);
    }

    public function test_public_gemini_response_never_exposes_internal_pet_markers(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->twice()->andReturn([
            'available'=>true,'service_details'=>[],
        ]);
        $provider = new class implements AiProviderInterface {
            public string $reply = 'PET_SELECTED is ready.';
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                if ($jsonSchema !== null) return ['text'=>json_encode([
                    'intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                ]), 'usage'=>[]];
                return ['text'=>$this->reply, 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Where is the clinic?')->assertOk()
            ->assertJsonPath('data.mode','fallback')->assertJsonMissingPath('data.text');
        $provider->reply = 'PET_1 can help with that.';
        $this->chat('What services do you offer?')->assertOk()
            ->assertJsonPath('data.mode','fallback')->assertJsonMissingPath('data.text');
    }

    public function test_public_follow_up_uses_bounded_prior_context(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->twice()->andReturn(['available'=>true,'service_details'=>['Dog Grooming'=>['price'=>null]]]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Dog Grooming is listed in the clinic catalog.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Do you offer grooming?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('How much is it?')->assertOk()->assertJsonPath('data.source','ai');
        $this->assertCount(4,$provider->inputs);
        $this->assertStringContainsString('Do you offer grooming?', $provider->inputs[2]);
        $this->assertStringContainsString('Dog Grooming', $provider->inputs[3]);
    }

    public function test_followup_receives_latest_exchange_after_a_topic_change(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(3)->andReturn([
            'available'=>true, 'service_details'=>[],
        ]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public int $turn = 0;
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                if ($jsonSchema) return ['text'=>json_encode([
                    'intent'=>$this->turn===0?'services_info':'booking_help','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                ]),'usage'=>[]];
                return ['text'=>['First service explanation.','Booking guidance.','Booking guidance repeated.'][$this->turn++], 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Explain the service')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('How do I book?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('Explain that again')->assertOk()->assertJsonPath('data.source','ai');
        self::assertStringContainsString('Previous public-information turns (most recent last):', $provider->inputs[4]);
        $responseInput = json_decode($provider->inputs[5], true);
        self::assertSame('How do I book?', $responseInput['latest_public_exchange']['question']);
        self::assertSame('Booking guidance.', $responseInput['latest_public_exchange']['answer']);
        self::assertStringNotContainsString('First service explanation.', $provider->inputs[5]);
    }

    public function test_unclear_busy_time_is_not_presented_as_a_matching_slot(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->twice()->andReturn(true);
        $provider = new class implements AiProviderInterface {
            public array $inputs=[]; public int $structuredCalls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema === null) return ['text'=>'When are you available? I cannot check your full appointment against your commitments; please review the booking form.', 'usage'=>[]];
                $first=++$this->structuredCalls===1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_followup','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'vaccination':'none','date_expression'=>$first?'tomorrow':'day after tomorrow',
                    'time_preference'=>'none','exact_time_expression'=>$first?'3 PM':'',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'availability_constraint'=>$first?'unclear':'none']), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna vaccination tomorrow at 3 PM but I am busy tomorrow')
            ->assertOk()->assertJsonPath('data.proposal_pending',true)->assertJsonMissingPath('data.pet_id');
        $this->chat('Change the date to day after tomorrow')->assertOk()
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.booking_created',false);
        $this->assertStringContainsString('availability_constraint=unclear',$provider->inputs[2]);
        $this->assertStringContainsString('service=vaccination',$provider->inputs[2]);
    }

    public function test_busy_followup_records_validated_time_without_repeating_clarification(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(4)->andReturn([
            ['id'=>7,'name'=>'Luna','species'=>'Dog'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->times(3)->andReturn(true);
        $provider=new class implements AiProviderInterface {
            public int $turn=0;
            public array $responses=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                if ($jsonSchema) {
                    $this->turn++;
                    $turn=$this->turn;
                    return ['text'=>json_encode([
                        'intent'=>$turn===1?'booking':'booking_followup',
                        'pet_ref'=>$turn===1?'PET_1':'none',
                        'service'=>$turn===2?'grooming':'none',
                        'date_expression'=>$turn===1?'tomorrow':'',
                        'time_preference'=>$turn===3?'evening':'none',
                        'exact_time_expression'=>$turn===4?'6pm':'',
                        'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                        'availability_constraint'=>$turn===1?'unclear':'none',
                        'changed_fields'=>match($turn) {
                            1=>['pet','date','availability'], 2=>['service'], default=>['time'],
                        },
                    ]),'usage'=>[]];
                }
                $this->responses[]=json_decode($message,true);
                return ['text'=>'I noted your preference. Please review the form; I cannot verify whether the full appointment fits.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna tomorrow but I am busy')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $this->chat('groom')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $this->chat('evening')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->chat('6pm')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        self::assertTrue($provider->responses[0]['needs_clarification']);
        self::assertCount(1,$provider->responses,'A supplied period proceeds to verified slots instead of repeating the busy-hours warning');
        $saved=array_values(session('vetti_semantic_proposals'))[0];
        self::assertSame(7,$saved['pet_id']);
        self::assertSame('grooming',$saved['service']);
        self::assertSame('18:00',$saved['selected_time']);
        self::assertSame('none',$saved['availability_constraint']);
        self::assertTrue($saved['availability_clarified']);
    }

    public function test_constrained_proposal_can_be_summarized_without_offering_slots(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->twice()->andReturn(true);
        $provider = new class implements AiProviderInterface {
            public array $inputs=[]; public int $structuredCalls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema === null) {
                    $data=json_decode($message,true);
                    if (!isset($data['proposal'])) return ['text'=>'When are you available? I cannot check the full appointment against your commitments.', 'usage'=>[]];
                    $date=$data['proposal']['date'];
                    return ['text'=>'PET_SELECTED: vaccination on '.$date.' at requested time TIME_SELECTED. Your availability needs checking.', 'usage'=>[]];
                }
                $first=++$this->structuredCalls===1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_summary','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'vaccination':'none','date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>'none','exact_time_expression'=>$first?'3 PM':'','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'availability_constraint'=>$first?'unclear':'none']), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna vaccination tomorrow at 3 PM but I am busy')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $response=$this->chat('Ano na ulit ang booking details?')->assertOk()->assertJsonPath('data.source','ai')
            ->assertJsonPath('data.proposal_pending',true)->assertJsonMissingPath('data.pet_id');
        $this->assertStringContainsString('Luna', $response->json('data.text'));
        $this->assertStringContainsString('3:00 PM', $response->json('data.text'));
        $this->assertStringContainsString('No appointment has been made.', $response->json('data.text'));
        $this->assertStringNotContainsString('Luna', $provider->inputs[3]);
        $this->assertStringNotContainsString('unavailable_day', $provider->inputs[3]);
    }

    public function test_requested_time_survives_missing_date_followup(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $provider = new class implements AiProviderInterface {
            public array $inputs=[]; public int $structured=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema === null) return ['text'=>'Please review the booking form; I cannot verify the complete appointment fits your commitments.', 'usage'=>[]];
                $first=++$this->structured===1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_followup','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'grooming':'none','date_expression'=>$first?'':'tomorrow',
                    'time_preference'=>'none','exact_time_expression'=>'3 PM','negated'=>false,
                    'multiple_services'=>false,'needs_clarification'=>false,'availability_constraint'=>$first?'unclear':'none']), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna for grooming at 3 PM but I am busy')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $this->chat('Tomorrow')->assertOk()->assertJsonPath('data.proposal_pending',true)->assertJsonMissingPath('data.pet_id');
        $this->assertStringContainsString('requested_time=15:00',$provider->inputs[1]);
        $this->assertStringContainsString('availability_constraint=unclear',$provider->inputs[1]);
    }

    public function test_booking_updates_merge_only_declared_and_grounded_fields(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([['id'=>7,'name'=>'Luna','species'=>'Cat']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->with(\Mockery::any(),7)->andReturn(true);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $i=$this->calls++;
                $rows=[
                    ['booking','PET_1','grooming','','3 PM',['pet','service','time']],
                    ['booking_followup','none','none','bukas','15:00',['date']],
                    ['booking_followup','none','none','','16:00',['time']],
                ];
                [$intent,$pet,$service,$date,$time,$fields]=$rows[$i];
                return ['text'=>json_encode(['intent'=>$intent,'pet_ref'=>$pet,'service'=>$service,'date_expression'=>$date,
                    'time_preference'=>'none','exact_time_expression'=>$time,'negated'=>false,'multiple_services'=>false,
                    'needs_clarification'=>false,'changed_fields'=>$fields]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna grooming at 3 PM')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $this->chat('Bukas po')->assertOk()->assertJsonPath('data.pet_id',7)->assertJsonPath('data.preferred_time','15:00');
        $before=session('vetti_semantic_proposals');
        $this->chat('Can you change it?')->assertOk()->assertJsonPath('data.proposal_pending',true)->assertJsonMissingPath('data.pet_id');
        $this->assertSame($before,session('vetti_semantic_proposals'));
    }

    public function test_unverified_numeric_claim_is_not_shown(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->once()->andReturn(['available'=>true,'service_details'=>[]]);
        $provider = new class implements AiProviderInterface {
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'It costs 99999 pesos.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much for grooming?')->assertOk()->assertJsonPath('data.mode','fallback')->assertJsonMissingPath('data.text');
    }

    public function test_language_followup_reaches_provider_without_sending_private_disclosures(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(4)->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(4)->andReturn(['available'=>true,'service_details'=>[]]);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'other','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Ano ang gusto mong ipaliwanag ko?', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Pwede mo bang sabihin sa Tagalog?')->assertOk()->assertJsonPath('data.source','rule');
        $this->assertStringContainsString('Tagalog',$provider->inputs[0]);
        $this->chat('My name is Fictional Person')->assertOk()->assertJsonPath('data.source','rule');
        $this->chat('Book Unregistered tomorrow')->assertOk()->assertJsonPath('data.source','rule');
        $this->chat('Book si Unregistered')->assertOk()->assertJsonPath('data.source','rule');
        $this->chat('My email is fictional@example.test')->assertOk()->assertJsonPath('data.source','rule');
        $this->assertCount(1,$provider->inputs);
    }

    public function test_pricing_data_and_taglish_followup_reach_the_model(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->twice()->andReturn([
            'available'=>true,'service_details'=>['Dog Grooming'=>['pricing_type'=>'range','price_min'=>'100.00','price_max'=>'800.00','currency'=>'PHP']]]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Dog Grooming is listed from 100.00 to 800.00 PHP; please confirm the final fee with the clinic.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much is dog grooming?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('Magkano po iyon?')->assertOk()->assertJsonPath('data.source','ai');
        $this->assertCount(4,$provider->inputs);
        $this->assertStringContainsString('price_max', $provider->inputs[1]);
        $this->assertStringContainsString('How much is dog grooming?', $provider->inputs[2]);
    }

    public function test_model_interpretation_uses_only_laravel_verified_requested_price(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->twice()->andReturn([
            'available'=>true, 'address'=>'42 Fictional Road', 'service_details'=>[
                'Cat Grooming'=>['category'=>'Pet Care','pricing_type'=>'starting','price_min'=>'500.00','price_max'=>null,'currency'=>'PHP','price'=>null],
                'Other'=>['category'=>'Test','pricing_type'=>'single','price_min'=>'900.00','price_max'=>null,'currency'=>'PHP','price'=>null],
            ],
        ]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'public_operation'=>'price','public_service'=>'Cat Grooming']) : 'Cat Grooming starts at PHP 500.00.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Magkano ang cat grooming?')->assertOk()->assertJsonPath('data.source','ai')
            ->assertJsonPath('data.text','Cat Grooming starts at PHP 500.00.');
        self::assertCount(2,$provider->inputs);
        self::assertStringContainsString('"pricing_type":"starting"',$provider->inputs[1]);
        self::assertStringContainsString('500.00',$provider->inputs[1]);
        self::assertStringNotContainsString('900.00',$provider->inputs[1]);
        self::assertStringNotContainsString('42 Fictional Road',$provider->inputs[1]);
    }

    public function test_model_resolves_service_reference_against_verified_catalog_and_history(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(8)->andReturn([
            'available'=>true,'service_details'=>['Cat Grooming'=>['category'=>'Pet Care','pricing_type'=>'starting','price_min'=>'500.00','price_max'=>null,'currency'=>'PHP']],
        ]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema !== null && isset($jsonSchema['properties']['intent'])) return ['text'=>json_encode([
                    'intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'public_operation'=>'price','public_service'=>'grooming']), 'usage'=>[]];
                if ($jsonSchema !== null) return ['text'=>'{"services":["Cat Grooming"]}','usage'=>[]];
                return ['text'=>'Cat Grooming starts at PHP 500.00.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much is cat grooming?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('Magkano po iyon?')->assertOk()->assertJsonPath('data.source','ai');
        self::assertCount(6,$provider->inputs);
        self::assertStringContainsString('active_service_labels',$provider->inputs[1]);
        self::assertStringContainsString('How much is cat grooming?', $provider->inputs[4]);
        self::assertStringContainsString('500.00',$provider->inputs[5]);
    }

    public function test_followup_service_selection_can_use_two_gemini_calls(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(3)->andReturn([
            'available'=>true,'service_details'=>['Cat Grooming'=>['category'=>'Pet Care','pricing_type'=>'starting','price_min'=>'500.00','currency'=>'PHP']],
        ]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema !== null) return ['text'=>json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'public_operation'=>count($this->inputs)===1 ? 'none' : 'price','public_service'=>'',
                    'public_services'=>count($this->inputs)===1 ? [] : ['Cat Grooming']]),'usage'=>[]];
                return ['text'=>count($this->inputs)===2 ? 'Which service do you mean?' : 'Cat Grooming starts at PHP 500.00.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much is grooming?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('Para sa pusa')->assertOk()->assertJsonPath('data.source','ai')->assertSee('500.00');
        self::assertCount(4,$provider->inputs);
        self::assertStringContainsString('Active public service labels', $provider->inputs[2]);
        self::assertStringContainsString('500.00',$provider->inputs[3]);
    }

    public function test_broad_service_selection_keeps_all_verified_matches(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(3)->andReturn([
            'available'=>true,'service_details'=>['Dog Grooming'=>['category'=>'Pet Care'],'Cat Grooming'=>['category'=>'Pet Care']],
        ]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema !== null && isset($jsonSchema['properties']['intent'])) return ['text'=>json_encode([
                    'intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'public_operation'=>'service','public_service'=>'grooming']), 'usage'=>[]];
                if ($jsonSchema !== null) return ['text'=>'{"services":["Dog Grooming","Cat Grooming"]}','usage'=>[]];
                return ['text'=>'We offer Dog Grooming and Cat Grooming.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Do you offer grooming?')->assertOk()->assertJsonPath('data.source','ai');
        self::assertStringContainsString('Dog Grooming',$provider->inputs[2]);
        self::assertStringContainsString('Cat Grooming',$provider->inputs[2]);
    }

    public function test_model_selected_unverified_service_never_reaches_response_generation(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(3)->andReturn([
            'available'=>true,'service_details'=>[],
        ]);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls++;
                return ['text'=>json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'public_operation'=>'price','public_service'=>'Unlisted service']), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much does the unlisted service cost?')->assertOk()->assertSee('cannot verify');
        self::assertSame(1,$provider->calls);
    }

    public function test_price_answer_failure_is_honest(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->once()->andReturn(['available'=>true,'service_details'=>[]]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if ($jsonSchema===null) throw new \App\Services\AI\AiProviderException('timeout');
                return ['text'=>json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much is grooming?')->assertOk()->assertJsonPath('data.mode','fallback')->assertJsonMissingPath('data.text');
    }

    public function test_public_catalog_and_followup_fit_provider_input_limit(): void
    {
        $this->asUser(); $this->enabled(); config()->set('ai.max_input_bytes',4000);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $catalog=[];
        for ($i=0;$i<26;$i++) $catalog['Fictional Service '.$i]=['category'=>'Wellness','pricing_type'=>null,'price_min'=>null,'price_max'=>null,'currency'=>null,'price'=>null];
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->twice()->andReturn(['available'=>true,'service_details'=>$catalog]);
        $provider = new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls++;
                return ['text'=>$jsonSchema ? json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Please contact the clinic to confirm the current price.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How much is grooming?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('Pwede mo bang sabihin sa Tagalog?')->assertOk()->assertJsonPath('data.source','ai');
        $this->assertSame(4,$provider->calls);
    }

    public function test_auth_and_feature_gates_fail_closed(): void
    {
        config()->set('ai.semantic_vetti_enabled', false);
        $this->postJson('/api/ai/semantic-vetti', [
            'message'=>'Book a bath','conversation_id'=>'chat_abc123456789',
        ])->assertUnauthorized();
        $this->asUser();
        $this->chat('Can Bornok get a bath tomorrow?')
            ->assertOk()->assertJsonPath('data.mode','disabled');
        $this->enabled();
        config()->set('ai.semantic_privacy_cleared', false);
        $this->chat('Can Bornok get a bath tomorrow?')
            ->assertOk()->assertJsonPath('data.mode','disabled');
    }

    public function test_anonymized_booking_may_propose_but_never_write(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->withArgs(
            fn (User $user, int $id): bool => $user->id===123 && $id===7
        )->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                $this->inputs[] = $message;
                return ['text'=>json_encode([
                    'intent'=>'booking','pet_ref'=>'PET_1','service'=>'grooming',
                    // Gemini normalizes the original Tagalog 'bukas' into English.
                    'date_expression'=>'tomorrow','time_preference'=>'none',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                ]), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Gusto ko sana paliguan si Bornok bukas.')
            ->assertOk()->assertJsonPath('data.mode','semantic')
            ->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.pet_id',7)
            ->assertJsonPath('data.booking_created',false)
            ->assertJsonPath('data.requires_confirmation',true);
        $this->assertCount(1, $spy->inputs);
        $this->assertStringNotContainsString('Bornok', $spy->inputs[0]);
        $this->assertStringContainsString('PET_1', $spy->inputs[0]);
    }

    public function test_model_cannot_invent_a_date_for_a_dated_booking(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
        ]);
        $this->app->instance(AiProviderInterface::class,
            new \App\Services\AI\Providers\FakeAiProvider(json_encode([
                'intent'=>'booking', 'pet_ref'=>'PET_1', 'service'=>'grooming',
                'date_expression'=>'tomorrow', 'time_preference'=>'none',
                'negated'=>false, 'multiple_services'=>false, 'needs_clarification'=>false,
            ])));
        // There is no date in the original request, despite the model output.
        $this->chat('Gusto ko sana paliguan si Bornok.')
            ->assertOk()->assertJsonPath('data.mode', 'semantic')
            ->assertJsonPath('data.kind', 'information');
    }

    public function test_day_after_tomorrow_cannot_be_reduced_to_tomorrow(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
        ]);
        $this->app->instance(AiProviderInterface::class,
            new \App\Services\AI\Providers\FakeAiProvider(json_encode([
                'intent'=>'booking', 'pet_ref'=>'PET_1', 'service'=>'grooming',
                'date_expression'=>'tomorrow', 'time_preference'=>'none',
                'negated'=>false, 'multiple_services'=>false, 'needs_clarification'=>false,
            ])));
        $this->chat('Book Bornok for grooming the day after tomorrow.')
            ->assertOk()->assertJsonPath('data.mode', 'semantic')
            ->assertJsonPath('data.kind', 'information');
    }

    public function test_unsafe_third_party_requests_never_reach_interpretation_or_lookup(): void
    {
        $this->asUser();$this->enabled();
        $provider=new class implements AiProviderInterface {public array $messages=[];public function generate(string $i,string $m,?array $s=null):array{$this->messages[]=$m;return ['text'=>'I can only help with pets on your own account to protect other owners’ privacy.','usage'=>[]];}};
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat("Book grooming for my neighbor's dog tomorrow")->assertOk()->assertJsonPath('data.kind','information')->assertJsonPath('data.source','ai');
        self::assertCount(1,$provider->messages);self::assertStringNotContainsString('neighbor',$provider->messages[0]);self::assertStringNotContainsString('grooming',$provider->messages[0]);
    }

    public function test_pet_correction_is_interpreted_using_aliases_and_verified(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([
            ['id'=>7,'name'=>'Luna','species'=>'Dog'], ['id'=>8,'name'=>'Bornok','species'=>'Cat'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->twice()->with(\Mockery::any(), 8)->andReturn(true);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                $ambiguous = count($this->inputs) === 3;
                return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>$ambiguous?'none':'PET_2',
                    'service'=>'grooming','date_expression'=>'tomorrow','time_preference'=>'none',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>$ambiguous]), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        foreach (['Book Bornok instead of Luna for grooming tomorrow', 'Instead of Luna, book Bornok for grooming tomorrow'] as $message) {
            $this->chat($message)->assertOk()->assertJsonPath('data.pet_id', 8)
                ->assertJsonPath('data.booking_created', false)->assertJsonPath('data.requires_confirmation', true);
        }
        $this->chat('Book Luna and Bornok for grooming tomorrow')->assertOk()
            ->assertJsonPath('data.kind', 'information')->assertJsonMissingPath('data.pet_id');
        $this->assertCount(3, $provider->inputs);
        foreach ($provider->inputs as $input) {
            $this->assertStringNotContainsString('Luna', $input);
            $this->assertStringNotContainsString('Bornok', $input);
            $this->assertStringContainsString('PET_1', $input);
            $this->assertStringContainsString('PET_2', $input);
        }
    }

    public function test_multiple_service_clarification_preserves_existing_booking_context(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([
            ['id'=>7,'name'=>'Luna','species'=>'Dog','gender'=>'Female'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public int $interpretations = 0;
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                $this->inputs[] = $message;
                if (!$jsonSchema) return ['text'=>'Which service would you like to choose?','usage'=>[]];
                $this->interpretations++;
                $step=$this->interpretations;
                return ['text'=>json_encode([
                    'intent'=>$step===1?'booking':'booking_followup',
                    'pet_ref'=>$step===1?'PET_1':'none',
                    'service'=>$step===1?'spay':'none',
                    'date_expression'=>$step===3?'tomorrow':'',
                    'time_preference'=>$step===3?'morning':'none',
                    'negated'=>false,'multiple_services'=>$step===2,
                    'needs_clarification'=>$step===2,
                    'changed_fields'=>$step===1?['pet','service']:($step===3?['date','time']:[]),
                ]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna for spay')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $this->chat('I am considering spay and grooming')->assertOk()
            ->assertJsonPath('data.source','ai')->assertJsonPath('data.proposal_pending',true);
        $this->chat('Tomorrow morning')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_hint','spay')
            ->assertJsonPath('data.booking_created',false);
        self::assertStringContainsString('service=spay', end($provider->inputs));
        self::assertStringNotContainsString('Luna', implode(' ', $provider->inputs));
    }

    public function test_spay_uses_owner_scoped_recorded_sex_before_proposal(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat','gender'=>'Male'],
            ['id'=>8,'name'=>'Luna','species'=>'Dog','gender'=>'Female'],
            ['id'=>9,'name'=>'Fictional','species'=>'Cat','gender'=>''],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->with(\Mockery::any(),8)->andReturn(true);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) {
                    $firstLine=explode("\n",$message)[0];
                    $ref=str_contains($firstLine,'PET_1')?'PET_1':(str_contains($firstLine,'PET_2')?'PET_2':'PET_3');
                    return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>$ref,'service'=>'spay',
                        'date_expression'=>'tomorrow','time_preference'=>'none','negated'=>false,
                        'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
                }
                return ['text'=>'The selected pet is recorded as [SEX_VALUE]. Spaying ordinarily applies to female animals; please check the record or contact the clinic.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Bornok for spay tomorrow')->assertOk()
            ->assertJsonPath('data.kind','information')->assertJsonPath('data.proposal_pending',true)
            ->assertJsonPath('data.text','The selected pet is recorded as male. Spaying ordinarily applies to female animals; please check the record or contact the clinic.')
            ->assertJsonMissingPath('data.pet_id');
        $this->chat('Book Luna for spay tomorrow')->assertOk()
            ->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.pet_id',8)
            ->assertJsonPath('data.booking_created',false);
        $this->chat('Book Fictional for spay tomorrow')->assertOk()
            ->assertJsonPath('data.kind','information')->assertJsonMissingPath('data.pet_id');
        self::assertStringContainsString('[SEX_VALUE]',$provider->inputs[1]);
        self::assertStringNotContainsString('"recorded_sex":"male"',$provider->inputs[1]);
        self::assertStringNotContainsString('Bornok',implode(' ',$provider->inputs));
    }

    public function test_unsuitable_service_change_preserves_previous_proposal(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([
            ['id'=>7,'name'=>'FictionalPet','species'=>'Cat','gender'=>'Male'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->andReturn(true);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available'=>true, 'services'=>['Consultation','Spay'],
            'service_details'=>['Consultation'=>['category'=>'Wellness'],'Spay'=>['category'=>'Surgery']],
            'booking_services'=>[['value'=>'consultation','label'=>'Consultation'],['value'=>'spay','label'=>'Spay']],
        ]);
        $provider=new class implements AiProviderInterface {
            public int $step=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if (!$jsonSchema) return ['text'=>'The selected pet is recorded as [SEX_VALUE]. Please check with the clinic.','usage'=>[]];
                $first=++$this->step===1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_followup','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'consultation':'spay','date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>'none','changed_fields'=>$first?['pet','service','date']:['service'],
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book FictionalPet for consultation tomorrow')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $before=session('vetti_semantic_proposals');
        $this->chat('Actually, spay')->assertOk()->assertJsonPath('data.kind','information');
        self::assertSame($before,session('vetti_semantic_proposals'));
    }
    public function test_invalid_model_json_falls_back_without_book_action(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Dog'],
        ]);
        $this->app->instance(AiProviderInterface::class,
            new \App\Services\AI\Providers\FakeAiProvider('not JSON'));
        $this->chat('Book Bornok grooming tomorrow')
            ->assertOk()->assertJsonPath('data.mode','fallback');
    }

    public function test_missing_pet_followup_preserves_only_validated_booking_preferences(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                $follow = count($this->inputs) === 2;
                return ['text'=>json_encode(['intent'=>$follow?'booking_followup':'booking', 'pet_ref'=>$follow?'PET_1':'none',
                    'service'=>$follow?'none':'grooming', 'date_expression'=>$follow?'':'tomorrow',
                    'time_preference'=>$follow?'none':'afternoon','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Book grooming tomorrow afternoon')->assertOk()->assertJsonPath('data.kind','information');
        $this->chat('Si Luna po')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_hint','grooming')
            ->assertJsonPath('data.time_preference','afternoon')->assertJsonPath('data.booking_created',false);
        $this->assertStringContainsString('Previous proposed booking', $spy->inputs[1]);
        $this->assertStringNotContainsString('Luna', $spy->inputs[1]);
    }

    public function test_new_booking_for_another_pet_does_not_inherit_old_preferences(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog'],['id'=>8,'name'=>'Milo','species'=>'Dog']]);
        $provider = new class implements AiProviderInterface {
            public int $calls = 0;
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $first = ++$this->calls === 1;
                return ['text'=>json_encode(['intent'=>'booking','booking_mode'=>'new','pet_ref'=>$first?'PET_1':'PET_2',
                    'service'=>$first?'vaccination':'grooming','date_expression'=>'',
                    'time_preference'=>$first?'afternoon':'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Book Luna vaccination in the afternoon')->assertOk()->assertJsonPath('data.kind','information');
        $this->chat('Start a separate booking for Milo grooming')->assertOk()->assertJsonPath('data.kind','information');
        $saved = array_values(session('vetti_semantic_proposals'))[0];
        $this->assertSame(8, $saved['pet_id']);
        $this->assertSame('grooming', $saved['service']);
        $this->assertNull($saved['date']);
        $this->assertSame('none', $saved['time']);
    }

    public function test_unavailable_and_empty_slots_return_natural_read_only_alternatives(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->times(3)->andReturn(true);
        $provider = new \App\Services\AI\Providers\FakeAiProvider(json_encode([
            'intent'=>'booking','pet_ref'=>'PET_1','service'=>'vaccination','date_expression'=>'tomorrow',
            'time_preference'=>'afternoon','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
        ]));
        $this->app->instance(AiProviderInterface::class,$provider);
        $booking=\Mockery::mock(new \App\Services\AI\BookingConversationService(new \App\Services\AI\AiGateway($provider)));
        $booking->shouldReceive('prepare')->times(3)->andReturn(
            ['status'=>'time_unavailable','text'=>'That time is unavailable. Please consider another time.'],
            ['status'=>'time_unavailable','failure_category'=>'timeout'],
            ['status'=>'no_slots','text'=>'No times match. Please consider another date.']
        );
        $this->app->instance(\App\Services\AI\BookingConversationService::class,$booking);
        $this->chat('Book Luna vaccination tomorrow afternoon')->assertOk()
            ->assertJsonPath('data.kind','booking_alternatives')->assertJsonPath('data.reason','time_unavailable')
            ->assertJsonPath('data.source','ai')->assertJsonPath('data.proposal_pending',true)->assertJsonMissingPath('data.action');
        $this->chat('Book Luna vaccination tomorrow afternoon')->assertOk()
            ->assertJsonPath('data.kind','information')->assertJsonPath('data.proposal_pending',true);
        $this->chat('Book Luna vaccination tomorrow afternoon')->assertOk()
            ->assertJsonPath('data.kind','booking_alternatives')->assertJsonPath('data.reason','no_slots')->assertJsonPath('data.proposal_pending',true);
    }

    public function test_explicit_time_followup_replaces_an_older_daypart(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->twice()->andReturn(true);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $first=++$this->calls===1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_followup','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'vaccination':'none','date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>$first?'morning':'none','exact_time_expression'=>$first?'':'2 PM',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $observed=[];
        $booking=\Mockery::mock(new \App\Services\AI\BookingConversationService(new \App\Services\AI\AiGateway($provider)));
        $booking->shouldReceive('prepare')->twice()->andReturnUsing(static function($user,$pets,$petId,$hint,$date,$preference,$question,$time=null) use (&$observed) {
            $observed[]=[$preference,$time];
            return ['status'=>'ready','service_value'=>'vaccination','text'=>'Review this proposal.','preferred_time'=>$time];
        });
        $this->app->instance(\App\Services\AI\BookingConversationService::class,$booking);
        $this->chat('Book Luna vaccination tomorrow morning')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->chat('2 PM instead')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.preferred_time','14:00')->assertJsonPath('data.time_preference','afternoon');
        $this->assertSame([['morning',null],['afternoon','14:00']],$observed);
    }

    public function test_ungrounded_date_does_not_erase_existing_proposal(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        $provider = new class implements AiProviderInterface {
            public int $calls = 0;
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $first = ++$this->calls === 1;
                return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'vaccination':'none','date_expression'=>$first?'':'tomorrow',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Book Luna vaccination')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $before = session('vetti_semantic_proposals');
        $this->chat('Please try the same booking again')->assertOk()->assertJsonPath('data.proposal_pending',true)
            ->assertJsonPath('data.kind','information');
        $this->assertSame($before, session('vetti_semantic_proposals'));
    }

    public function test_rejection_and_misclassified_date_do_not_clear_booking_context(): void
    {
        $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([
            ['id'=>7,'name'=>'Luna','species'=>'Dog','gender'=>'Female'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->andReturn(true);
        $provider = new class implements AiProviderInterface {
            private int $step=0;
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                $this->step++;
                return ['text'=>json_encode([
                    'intent'=>'booking','pet_ref'=>$this->step===1?'PET_1':'none',
                    'service'=>$this->step===1?'spay':'none',
                    'date_expression'=>$this->step===3?'tomorrow':'',
                    'time_preference'=>$this->step===3?'morning':'none',
                    'negated'=>$this->step===2,'multiple_services'=>false,'needs_clarification'=>false,
                ]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna for spay')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $before=session('vetti_semantic_proposals');
        $this->chat('No')->assertOk()->assertJsonPath('data.proposal_pending',true);
        self::assertSame($before,session('vetti_semantic_proposals'));
        $this->chat('Tomorrow morning')->assertOk()->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.service_hint','spay')->assertJsonPath('data.pet_id',7);
    }

    public function test_language_request_is_not_intercepted_by_pending_booking(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog','gender'=>'Female']]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'service_details'=>[]]);
        $provider = new class implements AiProviderInterface {
            public int $interpretations=0;
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                if ($jsonSchema) { $first=++$this->interpretations===1; return ['text'=>json_encode([
                    'intent'=>$first?'booking':'unsupported_language','pet_ref'=>$first?'PET_1':'none','service'=>$first?'spay':'none',
                    'date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>!$first]),'usage'=>[]]; }
                return ['text'=>'I can respond in English, Filipino, or Taglish.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Book Luna for spay')->assertOk()->assertJsonPath('data.proposal_pending',true);
        $before=session('vetti_semantic_proposals');
        $this->chat('Please answer in Spanish.')->assertOk()->assertJsonPath('data.source','ai')
            ->assertJsonPath('data.text','I can respond in English, Filipino, or Taglish.');
        self::assertSame($before,session('vetti_semantic_proposals'));
    }

    public function test_ambiguous_booking_does_not_change_existing_proposal(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $provider = new class implements AiProviderInterface {
            public int $calls = 0;
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $first = ++$this->calls === 1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_followup','pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'vaccination':'none','date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>$first?'afternoon':'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>!$first]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Book Luna vaccination tomorrow afternoon')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $before = session('vetti_semantic_proposals');
        $this->chat('What about another one?')->assertOk()->assertJsonPath('data.kind','information')
            ->assertJsonPath('data.text','Do you want to change the current proposal or start a new booking? No appointment has been made.');
        $after=session('vetti_semantic_proposals');
        foreach($after as &$proposal) { self::assertSame('booking_scope',$proposal['awaiting_answer']); $proposal['awaiting_answer']='none'; } unset($proposal);
        self::assertSame($before,$after);
    }

    public function test_booking_followups_retain_pet_service_and_time_when_date_changes(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(4)->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->times(3)->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public int $calls = 0;
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->calls++;
                $rows = [
                    ['booking','PET_1','vaccination','','none'],
                    ['booking_followup','PET_1','none','bukas','afternoon'],
                    ['booking_summary','PET_1','none','','none'],
                    ['booking_followup','PET_1','none','the day after tomorrow','none'],
                ];
                [$intent,$pet,$service,$date,$time] = $rows[$this->calls - 1];
                return ['text'=>json_encode(['intent'=>$intent,'pet_ref'=>$pet,'service'=>$service,'date_expression'=>$date,
                    'time_preference'=>$time,'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Gusto ko ipa-vaccine si Luna.')->assertOk()->assertJsonPath('data.kind','information');
        $first = $this->chat('Bukas ng hapon sana.')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_hint','vaccination')->assertJsonPath('data.time_preference','afternoon');
        $this->chat('Ano na ulit yung booking details?')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.preferred_date',$first->json('data.preferred_date'));
        $last = $this->chat('Change the date to the day after tomorrow')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_hint','vaccination')
            ->assertJsonPath('data.time_preference','afternoon')->assertJsonPath('data.booking_created',false);
        $this->assertNotSame($first->json('data.preferred_date'), $last->json('data.preferred_date'));
    }

    public function test_provider_failure_does_not_erase_incomplete_booking(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                if (count($this->inputs) === 2) throw new \RuntimeException('synthetic outage');
                $first = count($this->inputs) === 1;
                return ['text'=>json_encode(['intent'=>$first?'booking':'booking_followup','pet_ref'=>$first?'none':'PET_1',
                    'service'=>$first?'grooming':'none','date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>$first?'afternoon':'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Book grooming tomorrow afternoon')->assertOk()->assertJsonPath('data.kind','information');
        $this->chat('Si Luna po')->assertOk()->assertJsonPath('data.mode','fallback');
        $this->chat('Si Luna po')->assertOk()->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.time_preference','afternoon')->assertJsonPath('data.booking_created',false);
        $this->assertStringContainsString('service=grooming', $spy->inputs[2]);
    }

    public function test_new_booking_after_complete_proposal_does_not_reuse_previous_details(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                $first = count($this->inputs) === 1;
                return ['text'=>json_encode(['intent'=>'booking', 'booking_mode'=>'new', 'pet_ref'=>'PET_1',
                    'service'=>$first?'grooming':'none', 'date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>$first?'afternoon':'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Book Luna grooming tomorrow afternoon')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->chat('Start a new booking for Luna')->assertOk()->assertJsonPath('data.kind','information')
            ->assertJsonPath('data.text','Please choose a specific appointment date within the next 30 days. No booking form was opened.');
        $this->assertStringContainsString('Previous proposed booking', $spy->inputs[1]);
    }

    public function test_interleaved_conversations_do_not_erase_or_share_semantic_proposals(): void
    {
        $this->asUser();
        $this->enabled();
        $this->useSyntheticBookingFacts();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Luna','species'=>'Cat']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                $follow = str_contains($message, 'Previous proposed booking');
                return ['text'=>json_encode(['intent'=>$follow?'booking_followup':'booking', 'pet_ref'=>'PET_1',
                    'service'=>$follow?'none':'grooming', 'date_expression'=>$follow?'':'tomorrow',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Book Luna grooming tomorrow','conversation_id'=>'chat_first_123456'])->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Book Luna grooming tomorrow','conversation_id'=>'chat_second_12345'])->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->postJson('/api/ai/semantic-vetti',['message'=>'For Luna please','conversation_id'=>'chat_first_123456'])->assertOk()->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.booking_created',false);
        $this->assertStringContainsString('Previous proposed booking', $spy->inputs[2]);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Book Luna grooming tomorrow','conversation_id'=>'chat_third_123456'])->assertOk();
        $this->assertStringNotContainsString('Previous proposed booking', $spy->inputs[3]);
        $this->postJson('/api/ai/semantic-vetti',['message'=>"Don't book",'conversation_id'=>'chat_first_123456'])->assertOk();
        $this->postJson('/api/ai/semantic-vetti',['message'=>'For Luna please','conversation_id'=>'chat_second_12345'])->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->assertStringContainsString('Previous proposed booking', $spy->inputs[4]);
        $key = 'vetti_semantic_pending_'.hash('sha256', '123|chat_second_12345');
        $saved = session('vetti_semantic_proposals');
        $saved[$key]['expires_at'] = time() - 1;
        $this->withSession(['vetti_semantic_proposals' => $saved]);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Book Luna grooming tomorrow','conversation_id'=>'chat_second_12345'])->assertOk();
        $this->assertStringNotContainsString('Previous proposed booking', $spy->inputs[5]);
    }
    public function test_public_contact_followup_preserves_context_without_storing_contact_details(): void
    {
        $this->asUser(); $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->times(4)->andReturn([
            'available'=>true,'phone'=>'09171234567','service_details'=>[],
        ]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public int $turn=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) {
                    $this->turn++;
                    return ['text'=>json_encode(['intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                        'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                        'public_operation'=>'contact']), 'usage'=>[]];
                }
                return ['text'=>$this->turn===1?'Call 09171234567.':'Please contact the clinic.', 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('How can I call the clinic?')->assertOk()->assertJsonPath('data.source','ai');
        $this->chat('Can you repeat that in Filipino?')->assertOk()->assertJsonPath('data.source','ai');
        self::assertStringContainsString('Previous public-information turns', $provider->inputs[2]);
        self::assertStringNotContainsString('09171234567', $provider->inputs[2]);
        self::assertStringContainsString('[clinic contact]', $provider->inputs[2]);
    }


    public function test_chained_language_changes_keep_the_resolved_public_question(): void
    {
        $this->asUser();$this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[]]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];public int $turn=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;
                if($jsonSchema){$this->turn++;return ['text'=>json_encode(['intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'public_operation'=>'location','response_language'=>$this->turn===2?'filipino':'english','restate_previous'=>$this->turn>1]),'usage'=>[]];}
                return ['text'=>$this->turn===2?'Ang klinika ay nasa 42 Fictional Avenue.':'The clinic is at 42 Fictional Avenue.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        foreach(['Where is the clinic?','Explain that in Tagalog','Back to English please'] as $q)$this->chat($q)->assertOk()->assertJsonPath('data.source','ai');
        foreach([3,5] as $index){$task=json_decode($provider->inputs[$index],true);
            self::assertSame('Where is the clinic?',$task['question']);self::assertTrue($task['restate_verified_information']);
            self::assertSame('Where is the clinic?',$task['latest_public_exchange']['question']);}
        self::assertCount(6,$provider->inputs);
    }

    public function test_private_pet_turn_retires_old_public_history_and_keeps_only_a_topic_hint(): void
    {
        $this->asUser();$this->enabled();
        $key='vetti_public_history_'.hash('sha256','123|chat_abc123456789');
        $this->withSession([$key=>['expires_at'=>time()+600,'turns'=>[['question'=>'Old catalog question','answer'=>'Old catalog answer']]]]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[]]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];public int $turn=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;
                if($jsonSchema){$this->turn++;return ['text'=>json_encode(['intent'=>$this->turn===1?'pets_list':'other','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'response_language'=>'filipino','restate_previous'=>$this->turn>1]),'usage'=>[]];}
                return ['text'=>'There are no registered pets.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Show my pets')->assertOk()->assertJsonPath('data.kind','pets_list')->assertSessionMissing($key);
        $this->chat('Can you explain that in Tagalog?')->assertOk()->assertJsonPath('data.source','rule')->assertSee('Aling paksa')->assertDontSee('Fictional Avenue');
        self::assertStringContainsString('Most recent response topic: pets list',$provider->inputs[2]);
        self::assertStringNotContainsString('Old catalog',$provider->inputs[2]);self::assertCount(3,$provider->inputs);
    }

    public function test_expired_or_other_chat_public_history_cannot_supply_a_translation_subject(): void
    {
        $this->asUser();$this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[]]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;return ['text'=>json_encode(['intent'=>'other','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'response_language'=>'filipino','restate_previous'=>true]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $key='vetti_public_history_'.hash('sha256','123|chat_abc123456789');
        $this->withSession([$key=>['expires_at'=>time()-1,'turns'=>[['question'=>'Expired secret subject','answer'=>'old']]]]);
        $this->chat('Explain that in Tagalog')->assertOk()->assertSee('Aling paksa')->assertDontSee('Fictional Avenue');
        $this->withSession([$key=>['expires_at'=>time()+600,'turns'=>[['question'=>'Other chat subject','answer'=>'old']]]]);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Explain that in Tagalog','conversation_id'=>'new_chat_context_123'])
            ->assertOk()->assertSee('Aling paksa')->assertDontSee('Fictional Avenue');
        $otherOwnerKey='vetti_public_history_'.hash('sha256','999|chat_abc123456789');
        $this->withSession([$key=>null,$otherOwnerKey=>['expires_at'=>time()+600,'turns'=>[['question'=>'Another owner subject','answer'=>'old']]]]);
        $this->chat('Explain that in Tagalog')->assertOk()->assertSee('Aling paksa');
        self::assertCount(3,$provider->inputs);self::assertStringNotContainsString('Other chat subject',implode(' ',$provider->inputs));
        self::assertStringNotContainsString('Another owner subject',implode(' ',$provider->inputs));
    }

    public function test_a_rejected_public_reply_does_not_replace_the_last_usable_context(): void
    {
        $this->asUser();$this->enabled();$key='vetti_public_history_'.hash('sha256','123|chat_abc123456789');
        $saved=['expires_at'=>time()+600,'turns'=>[['question'=>'A valid public subject','answer'=>'A valid answer']]];
        $this->withSession([$key=>$saved]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'service_details'=>[]]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                return ['text'=>$jsonSchema?json_encode(['intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false])
                    :'PET_SELECTED should not become conversation context.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->chat('Tell me about the clinic')->assertOk()->assertJsonPath('data.mode','fallback')->assertSessionHas($key,$saved);
    }

    public function test_new_subject_in_a_requested_language_is_not_replaced_by_old_location_context(): void
    {
        $this->asUser();$this->enabled();
        $key='vetti_public_history_'.hash('sha256','123|chat_abc123456789');
        $this->withSession([$key=>['expires_at'=>time()+600,'turns'=>[['question'=>'Where is the clinic?','answer'=>'Old location answer']]]]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'address'=>'42 Fictional Avenue',
            'service_details'=>['Consultation'=>[],'Vaccination'=>[]]]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;return ['text'=>$jsonSchema?json_encode(['intent'=>'services_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'restate_previous'=>false,'response_language'=>'filipino','public_operation'=>'services'])
                    :'May Consultation at Vaccination sa clinic.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $question='Can you explain the services in Tagalog?';
        $this->chat($question)->assertOk()->assertJsonPath('data.source','ai')->assertSee('Consultation');
        $task=json_decode($provider->inputs[1],true);self::assertSame($question,$task['question']);
        self::assertFalse($task['restate_verified_information']);self::assertArrayNotHasKey('address',$task['verified_clinic_data']['requested_information']);
    }

    public function test_restatement_reuses_verified_subject_even_if_the_new_interpretation_proposes_another_tool(): void
    {
        $this->asUser();$this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->times(3)->andReturn([]);
        $this->mock(\App\Services\AI\PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available'=>true,'address'=>'42 Fictional Avenue','service_details'=>['Consultation'=>[]]]);
        $provider=new class implements AiProviderInterface {
            public int $turn=0;public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;
                if($jsonSchema){$this->turn++;return ['text'=>json_encode(['intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                    'public_operation'=>$this->turn===1?'location':'services','restate_previous'=>$this->turn>1,
                    'response_language'=>$this->turn===2?'filipino':'english']),'usage'=>[]];}
                return ['text'=>'The verified location is 42 Fictional Avenue.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        foreach(['Where is the clinic?','Explain that in Tagalog','English please'] as $q)$this->chat($q)->assertOk()->assertJsonPath('data.source','ai');
        foreach([3,5] as $i){$data=json_decode($provider->inputs[$i],true)['verified_clinic_data']['requested_information'];
            self::assertSame('42 Fictional Avenue',$data['address']);self::assertArrayNotHasKey('services',$data);}
        self::assertCount(6,$provider->inputs);
    }
 public function test_availability_followup_preserves_stated_afternoon(): void {
  $this->asUser(); $this->enabled(); $this->useSyntheticBookingFacts();
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
  app(UserVettiFacts::class)->shouldReceive('ownsPet')->twice()->andReturn(true);
  $provider=new class implements AiProviderInterface { public int $calls=0; public function generate(string $instructions,string $message,?array $jsonSchema=null):array { $first=++$this->calls===1; return ['text'=>json_encode(['intent'=>$first?'booking':'booking_availability','pet_ref'=>$first?'PET_1':'none','service'=>$first?'vaccination':'none','date_expression'=>$first?'tomorrow':'','time_preference'=>$first?'none':'afternoon','exact_time_expression'=>'','changed_fields'=>$first?[]:['time'],'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]]; }};
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->chat('Book Luna for vaccination tomorrow')->assertOk()->assertJsonPath('data.kind','booking_proposal');
  $this->chat('Is there availability in the afternoon?')->assertOk()->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.time_preference','afternoon')->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_hint','vaccination')->assertJsonPath('data.booking_created',false);
 }
}

