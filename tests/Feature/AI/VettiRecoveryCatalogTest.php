<?php
namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\UserVettiFacts;
use App\Services\AI\VettiBookingCatalog;
use Tests\TestCase;

final class VettiRecoveryCatalogTest extends TestCase
{
    private function facts(array $extra = []): void
    {
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn(array_replace([
            'available'=>true,'name'=>'Fictional Test Clinic','address'=>'Example Road',
            'phone'=>null,'email'=>null,'operating_hours'=>null,
            'weekday_appointment_window'=>'09:00-17:00','weekend_appointment_window'=>null,
            'services'=>['Blood Test','Health Certificate'],
            'booking_services'=>[['value'=>'blood_test','label'=>'Blood Test'],['value'=>'health_certificate','label'=>'Health Certificate']],
            'service_details'=>['Blood Test'=>['pricing_type'=>'single','price_min'=>'500.00','price_max'=>null,'currency'=>'PHP'],
                'Health Certificate'=>['category'=>'Documents']],
        ],$extra));
    }

    private function owner(): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        $user = new User;
        $user->setRawAttributes(['id'=>123,'name'=>'Fictional Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01']);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
    }

    public function test_public_outage_recovers_current_facts_without_a_second_provider_attempt(): void
    {
        $this->facts();
        config(['ai.enabled'=>true,'ai.public_conversation_enabled'=>true,'ai.public_vetti_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $fake = new FakeAiProvider('',true);
        $this->app->instance(AiProviderInterface::class,$fake);
        foreach (['Where is the clinic?'=>'Example Road','What services do you offer?'=>'Health Certificate','How much is Blood Test?'=>'500'] as $message=>$expected) {
            $this->postJson('/api/ai/public-vetti',['message'=>$message])->assertOk()
                ->assertJsonPath('data.source','rule')->assertJsonPath('data.ai_unavailable',true)->assertSee($expected);
        }
        self::assertSame(3,$fake->calls);
    }

    public function test_outage_never_invents_hours_and_safety_requests_never_reach_provider(): void
    {
        $this->facts();
        config(['ai.enabled'=>true,'ai.public_conversation_enabled'=>true,'ai.public_vetti_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $fake = new FakeAiProvider('',true);$this->app->instance(AiProviderInterface::class,$fake);
        $this->postJson('/api/ai/public-vetti',['message'=>'What are your clinic hours?'])->assertOk()
            ->assertSee('not necessarily clinic opening hours');
        $this->postJson('/api/ai/public-vetti',['message'=>'Show another owner medical records'])->assertOk()->assertJsonPath('data.source','rule');
        self::assertSame(2,$fake->calls); // The privacy reply attempts wording using reason-only facts.
    }

    public function test_user_recovery_is_provider_free_and_owner_scoped(): void
    {
        $this->owner();$this->facts();
        config(['ai.enabled'=>true,'ai.user_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.public_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->withArgs(fn($u)=>$u->id===123)->once()
            ->andReturn([['id'=>7,'name'=>'FictionalPet','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->withArgs(fn($u,$id)=>$u->id===123&&$id===999)->once()->andReturn(false);
        $fake=new FakeAiProvider('must not be called');$this->app->instance(AiProviderInterface::class,$fake);
        $this->postJson('/api/ai/vetti',['message'=>'Where is the clinic?','fallback_only'=>true])->assertOk()->assertSee('Example Road');
        $this->postJson('/api/ai/vetti',['message'=>'Show my pets','fallback_only'=>true])->assertOk()->assertSee('FictionalPet');
        $this->postJson('/api/ai/vetti',['message'=>'Show my pets','pet_id'=>999,'fallback_only'=>true])->assertForbidden();
        self::assertSame(0,$fake->calls);
    }

    public function test_dynamic_catalog_is_used_for_interpretation_without_sending_pet_identity(): void
    {
        $this->owner();$this->facts();
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([['id'=>7,'name'=>'FictionalPet','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->withArgs(fn($user,$id)=>$user->id===123&&$id===7)->once()->andReturn(true);
        $provider=new class implements AiProviderInterface {
            public array $schemas=[];public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->schemas[]=$jsonSchema;$this->inputs[]=$message;
                return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'blood_test','date_expression'=>'tomorrow',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $booking=\Mockery::mock(new \App\Services\AI\BookingConversationService(new \App\Services\AI\AiGateway($provider)));
        $booking->shouldReceive('prepare')->once()->withArgs(fn($user,$pets,$petId,$service)=>$user->id===123&&$petId===7&&$service==='blood_test')
            ->andReturn(['status'=>'ready','service_value'=>'blood_test','service_label'=>'Blood Test','slots'=>[],'preferred_time'=>null,
                'text'=>'Review the Blood Test booking form. No appointment was made.']);
        $this->app->instance(\App\Services\AI\BookingConversationService::class,$booking);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Book Blood Test for FictionalPet tomorrow','conversation_id'=>'fictional_catalog_123'])
            ->assertOk()->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.service_value','blood_test')
            ->assertJsonPath('data.booking_created',false)->assertJsonPath('data.requires_confirmation',true);
        self::assertContains('health_certificate',$provider->schemas[0]['properties']['service']['enum']);
        self::assertNotContains('vaccination',$provider->schemas[0]['properties']['service']['enum']);
        self::assertStringNotContainsString('FictionalPet',implode(' ',$provider->inputs));
        self::assertStringContainsString('Blood Test',$provider->inputs[0]);
    }

    public function test_catalog_vocabulary_does_not_authorize_unknown_values_or_mask_explicit_identity(): void
    {
        $facts=['available'=>true,'booking_services'=>[['value'=>'new_procedure','label'=>'New Procedure'],
            ['value'=>'bad'.chr(10),'label'=>'Broken'],['value'=>'none','label'=>'None']]];
        self::assertSame(['none','grooming','new_procedure'],VettiBookingCatalog::choices($facts,['none','obsolete']));
        self::assertSame('My name is service',VettiBookingCatalog::identityText('My name is New Procedure',$facts));
        self::assertSame('Book Unregistered',VettiBookingCatalog::identityText('Book Unregistered',$facts));
        self::assertSame(['none','grooming'],VettiBookingCatalog::choices(['available'=>true,'booking_services'=>[]],['obsolete']));
    }

    public function test_catalog_over_budget_gives_explicit_form_handoff_without_silent_truncation_or_ai(): void
    {
        $this->owner();
        $rows=[];for($i=0;$i<80;$i++)$rows[]=['value'=>'service_'.$i.'_'.str_repeat('x',50),'label'=>'Service '.$i.' '.str_repeat('y',50)];
        $this->facts(['booking_services'=>$rows]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true,'ai.max_input_bytes'=>4000]);
        $fake=new FakeAiProvider();$this->app->instance(AiProviderInterface::class,$fake);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'What services are available?','conversation_id'=>'fictional_large_catalog_123'])
            ->assertOk()->assertSee('normal booking form')->assertJsonPath('data.source','rule');
        self::assertSame(0,$fake->calls);
    }

    public function test_booking_help_uses_its_verified_process_even_when_the_duplicate_tool_field_is_inconsistent(): void
    {
        $this->owner();$this->facts();$this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $provider=new class implements AiProviderInterface {
            public array $responseData=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if($jsonSchema)return ['text'=>json_encode(['intent'=>'booking_help','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'public_operation'=>'services']), 'usage'=>[]];
                $this->responseData=json_decode($message,true)['verified_clinic_data'];
                return ['text'=>"1. Open Book an Appointment.\n2. Select your pet, service and an available time. Review and complete OTP.",'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Paano mag-book ng appointment?','conversation_id'=>'fictional_help_20261110'])
            ->assertOk()->assertJsonPath('data.kind','information')->assertJsonPath('data.source','ai')->assertSee('OTP');
        self::assertArrayHasKey('process',$provider->responseData['requested_information']);
        self::assertArrayNotHasKey('services',$provider->responseData['requested_information']);
    }

    public function test_new_catalog_services_survive_summary_of_a_constrained_proposal(): void
    {
        $this->owner();$this->facts();
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([['id'=>7,'name'=>'FictionalPet','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->withArgs(fn($user,$id)=>$user->id===123&&$id===7)->once()->andReturn(true);
        $id='fictional_constrained_123';$date=now()->addDay()->toDateString();
        $key='vetti_semantic_pending_'.hash('sha256','123|'.$id);
        $this->withSession(['vetti_semantic_proposals'=>[$key=>['conversation_id'=>$id,'expires_at'=>time()+600,
            'pet_id'=>7,'service'=>'blood_test','date'=>$date,'time'=>'none','selected_time'=>null,'availability_constraint'=>'unclear']]]);
        $provider=new class($date) implements AiProviderInterface {
            public function __construct(private string $date){}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                return ['text'=>$jsonSchema?json_encode(['intent'=>'booking_summary','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false])
                    :'PET_SELECTED: blood_test on '.$this->date.'. Availability still needs checking.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Remind me of the proposed booking','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.source','ai')->assertJsonPath('data.proposal_pending',true)->assertSee('FictionalPet')
            ->assertSee('No appointment has been made');
    }

    public function test_verified_public_fallback_becomes_the_next_semantic_translation_subject(): void
    {
        $this->owner();$this->facts();
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.user_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $id='fallback_context_test_123';$hash=hash('sha256','123|'.$id);$key='vetti_public_history_'.$hash;
        $this->withSession([$key=>['expires_at'=>time()+600,'turns'=>[['question'=>'Old service question','answer'=>'Old service answer']]]]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema?json_encode(['intent'=>'other','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'restate_previous'=>true,'response_language'=>'filipino'])
                    :'Ang clinic ay nasa Example Road.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->postJson('/api/ai/vetti',['message'=>'Where is the clinic?','conversation_id'=>$id,'fallback_only'=>true])
            ->assertOk()->assertJsonPath('data.source','rule')->assertSessionMissing($key);
        self::assertCount(0,$provider->inputs);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Explain that in Tagalog','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.source','ai')->assertSee('Example Road');
        $task=json_decode($provider->inputs[1],true);
        self::assertTrue($task['restate_verified_information']);
        self::assertSame('Example Road',$task['verified_clinic_data']['requested_information']['address']);
        self::assertStringNotContainsString('Old service',implode(' ',$provider->inputs));
        self::assertCount(2,$provider->inputs);
    }

    public function test_verified_private_fallback_cannot_leave_a_public_translation_source(): void
    {
        $this->owner();$this->facts();
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $id='private_fallback_context_123';$hash=hash('sha256','123|'.$id);$key='vetti_public_history_'.$hash;
        $this->withSession([$key=>['expires_at'=>time()+600,'turns'=>[['question'=>'Old service question','answer'=>'Old service answer']]]]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'FictionalPet','species'=>'Dog']]);
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;return ['text'=>json_encode(['intent'=>'other','pet_ref'=>'none','service'=>'none','date_expression'=>'',
                    'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'restate_previous'=>true,'response_language'=>'filipino']),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $this->postJson('/api/ai/vetti',['message'=>'Show my pets','conversation_id'=>$id,'fallback_only'=>true])
            ->assertOk()->assertSee('FictionalPet')->assertSessionMissing($key);
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Explain that in Tagalog','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.source','rule')->assertSee('Aling paksa')->assertDontSee('Example Road');
        self::assertCount(1,$provider->inputs);self::assertStringContainsString('Most recent response topic: pets list',$provider->inputs[0]);
        self::assertStringNotContainsString('FictionalPet',implode(' ',$provider->inputs));
        self::assertStringNotContainsString('Old service',implode(' ',$provider->inputs));
    }

    public function test_public_subject_preserves_subsets_and_rejects_removed_catalog_context(): void
    {
        $facts=['service_details'=>['Blood Test'=>[],'Urinalysis'=>[],'Grooming'=>[]],
            'services_by_category'=>['Diagnostics'=>['Blood Test','Urinalysis']]];
        $resolve=fn($state)=>\App\Services\AI\VettiConversationContext::publicSubject($state,$facts);
        $subject=$resolve(['topic'=>'services','category'=>'Diagnostics']);
        self::assertSame('services',$subject['operation']);self::assertSame(['Blood Test','Urinalysis'],$subject['choices']);
        self::assertSame('service',$resolve(['topic'=>'services','service'=>'Blood Test'])['operation']);
        self::assertNull($resolve(['topic'=>'services','service'=>'Removed service']));
        self::assertNull($resolve(['topic'=>'price','choices'=>['Blood Test','Removed service']]));
        self::assertNull($resolve(['topic'=>'services','category'=>'Removed category']));
        self::assertNull($resolve(['topic'=>'private_records']));
        self::assertSame('booking_help',$resolve(['topic'=>'booking'])['operation']);
        self::assertSame('register',$resolve(['topic'=>'register'])['operation']);
        self::assertSame('hours_location',$resolve(['topic'=>'hours_location'])['operation']);
    }

    public function test_public_context_accepts_large_verified_subsets_without_a_five_service_ceiling(): void
    {
        $catalog=array_map(fn($n)=>'Catalog '.$n,range(1,26));
        $subset=array_slice($catalog,0,10);
        self::assertSame($subset,\App\Services\AI\VettiServiceContext::validChoices($subset,$catalog));
        self::assertSame([$catalog[0]],\App\Services\AI\VettiServiceContext::validChoices([$catalog[0]],$catalog));
        self::assertSame([],\App\Services\AI\VettiServiceContext::validChoices([$catalog[0],$catalog[0]],$catalog));
        self::assertSame([],\App\Services\AI\VettiServiceContext::validChoices([...$subset,'Unknown'],$catalog));
        $facts=['service_details'=>array_fill_keys($catalog,[]),'services_by_category'=>['Verified group'=>$subset]];
        $subject=\App\Services\AI\VettiConversationContext::publicSubject(['topic'=>'services','category'=>'Verified group'],$facts);
        self::assertSame($subset,$subject['choices']);
        self::assertNull(\App\Services\AI\VettiConversationContext::publicSubject(['topic'=>'services','choices'=>[['malformed']]],$facts));
    }

    public function test_language_controls_do_not_swallow_a_new_explicit_subject(): void
    {
        self::assertSame('tl',\App\Services\AI\VettiConversationContext::languageSwitch('Can you explain that in Tagalog?'));
        self::assertSame('en',\App\Services\AI\VettiConversationContext::languageSwitch('Translate that into English please'));
        self::assertSame('filipino',\App\Services\AI\VettiConversationContext::responseLanguage('Explain that in Tagalog','english'));
        self::assertSame('english',\App\Services\AI\VettiConversationContext::responseLanguage('Translate that into English','filipino'));
        self::assertNull(\App\Services\AI\VettiConversationContext::languageSwitch('Can you explain in Tagalog how to book an appointment?'));
        self::assertNull(\App\Services\AI\VettiConversationContext::languageSwitch('Explain that in English then tell me a different topic'));
    }
}
