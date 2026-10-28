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

    public function test_unsafe_third_party_and_multiple_pet_requests_bypass_provider(): void
    {
        $this->asUser();
        $this->enabled();
        $fake = new \App\Services\AI\Providers\FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->chat("Book grooming for my neighbor's dog tomorrow")
            ->assertOk()->assertJsonPath('data.kind','information');
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
            ['id'=>8,'name'=>'John','species'=>'Dog'],
        ]);
        $this->chat('I want Bornok vaccinated and John groomed tomorrow')
            ->assertOk()->assertJsonPath('data.kind','information');
        $this->assertSame(0, $fake->calls);
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
                return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>$first?'PET_1':'PET_2',
                    'service'=>$first?'vaccination':'grooming','date_expression'=>'',
                    'time_preference'=>$first?'afternoon':'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->chat('Book Luna vaccination in the afternoon')->assertOk()->assertJsonPath('data.kind','information');
        $this->chat('Book grooming for Milo')->assertOk()->assertJsonPath('data.kind','information');
        $saved = array_values(session('vetti_semantic_proposals'))[0];
        $this->assertSame(8, $saved['pet_id']);
        $this->assertSame('grooming', $saved['service']);
        $this->assertNull($saved['date']);
        $this->assertSame('none', $saved['time']);
    }

    public function test_ambiguous_booking_does_not_change_existing_proposal(): void
    {
        $this->asUser();
        $this->enabled();
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
        $this->assertSame($before, session('vetti_semantic_proposals'));
    }

    public function test_booking_followups_retain_pet_service_and_time_when_date_changes(): void
    {
        $this->asUser();
        $this->enabled();
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
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->inputs[] = $message;
                $first = count($this->inputs) === 1;
                return ['text'=>json_encode(['intent'=>'booking', 'pet_ref'=>'PET_1',
                    'service'=>$first?'grooming':'none', 'date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>$first?'afternoon':'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Book Luna grooming tomorrow afternoon')->assertOk()->assertJsonPath('data.kind','booking_proposal');
        $this->chat('I want to book Luna')->assertOk()->assertJsonPath('data.kind','information')
            ->assertJsonPath('data.text','Please choose a specific appointment date within the next 30 days. No booking form was opened.');
        $this->assertStringContainsString('Previous proposed booking', $spy->inputs[1]);
    }

    public function test_interleaved_conversations_do_not_erase_or_share_semantic_proposals(): void
    {
        $this->asUser();
        $this->enabled();
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
}
