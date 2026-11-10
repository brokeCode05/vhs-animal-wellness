<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Http\Middleware\RecordUserAccess;
use App\Services\AI\{AiGateway,AiProviderInterface,UserVettiFacts,PublicClinicFacts,PublicClinicDataResolver,PublicGeminiConversation,BookingConversationService};
use Illuminate\Support\Carbon;
use Tests\TestCase;

final class VettiUniversalContextRepairTest extends TestCase {
    private object $provider;private array $bookings=[];
    protected function setUp():void {
        parent::setUp();Carbon::setTestNow(Carbon::parse('2026-11-10 18:24:00','Asia/Manila'));
        $this->withoutMiddleware(RecordUserAccess::class);
        $u=new User;$u->setRawAttributes(['id'=>123,'name'=>'Fictional Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);$this->actingAs($u)->withSession(['auth_version'=>1]);
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $facts=$this->mock(UserVettiFacts::class);$facts->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Maple','species'=>'Dog','gender'=>'Female'],['id'=>8,'name'=>'Pippin','species'=>'Cat','gender'=>'Male']]);$facts->shouldReceive('ownsPet')->andReturnUsing(fn($u,$id)=>in_array($id,[7,8],true));
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'services'=>['Dog Grooming','Cat Grooming','Consultation'],'service_details'=>['Dog Grooming'=>['category'=>'Pet Care','pricing_type'=>'single','price_min'=>'500.00','currency'=>'PHP'],'Cat Grooming'=>['category'=>'Pet Care'],'Consultation'=>['category'=>'Wellness']],'services_by_category'=>['Pet Care'=>['Dog Grooming','Cat Grooming']],'booking_services'=>[['value'=>'dog_grooming','label'=>'Dog Grooming'],['value'=>'cat_grooming','label'=>'Cat Grooming'],['value'=>'consultation','label'=>'Consultation']],'address'=>'42 Fictional Lane']);
        $this->provider=new class implements AiProviderInterface {
            public array $steps=[];public array $calls=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls[]=['input'=>$message,'instructions'=>$instructions,'structured'=>$jsonSchema!==null];
                if(!$this->steps)throw new \RuntimeException('Unexpected provider call');$next=array_shift($this->steps);
                return ['text'=>is_array($next)?json_encode($next):$next,'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$this->provider);
        $booking=\Mockery::mock(new BookingConversationService(new AiGateway($this->provider)));
        $booking->shouldReceive('prepare')->andReturnUsing(function($u,$pets,$id,$hint,$date,$preference,$q,$time=null){$this->bookings[]=compact('id','hint','date','preference','time');return ['status'=>'ready','service_value'=>$hint==='grooming'?($id===7?'dog_grooming':'cat_grooming'):$hint,'service_label'=>$hint,'text'=>'Let’s review the details before you continue.','slots'=>['20:00'],'preferred_time'=>$time];});$this->app->instance(BookingConversationService::class,$booking);
    }
    protected function tearDown():void {Carbon::setTestNow();parent::tearDown();}
    private function data(array $fields=[]):array {return array_merge(['intent'=>'other','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false],$fields);}
    private function chat(string $message,string $id='universal_context_123',array $extra=[]){return $this->postJson('/api/ai/semantic-vetti',array_merge(['message'=>$message,'conversation_id'=>$id],$extra))->assertOk();}
    public function test_equivalent_time_fields_are_one_update_and_missing_model_pet_does_not_lose_unique_name():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','service'=>'grooming','date_expression'=>'today','time_preference'=>'evening','exact_time_expression'=>'19:00','changed_fields'=>['service','date','time_preference','exact_time_expression']])];
        $this->chat('I want to book Maple for grooming today at 7pm')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.pet_id',7)->assertJsonPath('data.preferred_time','19:00');
        self::assertSame('19:00',$this->bookings[0]['time']);self::assertStringNotContainsString('Maple',$this->provider->calls[0]['input']);
    }
    public function test_short_time_followup_can_change_only_time_after_complete_proposal():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>'today','exact_time_expression'=>'20:00','changed_fields'=>['pet','service','date','exact_time_expression']]),$this->data(['intent'=>'booking_followup','time_preference'=>'afternoon','exact_time_expression'=>'17:00','changed_fields'=>['time_preference','exact_time_expression']])];
        $this->chat('Book Maple for consultation today at 8pm')->assertJsonPath('data.kind','booking_proposal');
        $this->chat('What about 5pm?')->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_value','consultation')->assertJsonPath('data.preferred_time','17:00');
        self::assertSame('2026-11-10',$this->bookings[1]['date']);
    }
    public function test_literal_time_equivalents_and_early_clock_are_source_grounded_not_hardcoded_clinic_hours():void {
        foreach([['7 pm','19:00','19:00'],['07:30 AM','7:30am','07:30'],['6am','06:00','06:00'],['21:00','9 pm','21:00']] as $i=>[$said,$model,$expected]){
            $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'consultation','date_expression'=>'tomorrow','exact_time_expression'=>$model])];
            $this->chat('Book Pippin consultation tomorrow at '.$said,'equivalence_chat_'.$i)->assertJsonPath('data.preferred_time',$expected);
        }
        $before=count($this->bookings);$this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>'tomorrow','exact_time_expression'=>'19:00'])];
        $this->chat('Book Maple consultation tomorrow at 8pm','ungrounded_chat_123')->assertJsonPath('data.clarification_field','time');self::assertCount($before,$this->bookings);
    }
    public function test_rule_clarification_keeps_latest_topic_and_pet_in_a_general_frame():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'grooming']),$this->data(['intent'=>'booking_followup','date_expression'=>'tomorrow'])];
        $this->chat('Book Maple for grooming')->assertJsonPath('data.proposal_pending',true);
        $this->chat('Tomorrow please')->assertJsonPath('data.kind','booking_proposal');
        self::assertStringContainsString('Most recent response topic: booking',$this->provider->calls[1]['input']);
        self::assertStringContainsString('Previous subject pet: PET_1',$this->provider->calls[1]['input']);
    }
    public function test_documents_pronoun_and_language_followup_reuses_authorized_pet_without_transmitting_records():void {
        $facts=app(UserVettiFacts::class);$facts->shouldReceive('documents')->twice()->withArgs(fn($u,$id)=>$id===8)->andReturn([['id'=>4,'pet_id'=>8,'pet_name'=>'Pippin','type'=>'Consultation Summary','status'=>'issued','issued_at'=>'2026-11-01']]);
        $this->provider->steps=[$this->data(['intent'=>'documents_list','pet_ref'=>'PET_2']),$this->data(['intent'=>'documents_list','pet_ref'=>'PET_2','response_language'=>'filipino','restate_previous'=>true])];
        $this->chat('Show Pippin documents')->assertJsonPath('data.kind','documents_list');
        $this->chat('Can you explain that in Tagalog?')->assertJsonPath('data.kind','documents_list');
        $wire=json_encode($this->provider->calls);self::assertStringNotContainsString('Pippin',$wire);self::assertStringNotContainsString('2026-11-01',$wire);self::assertStringContainsString('Most recent response topic: documents list',$this->provider->calls[1]['input']);self::assertStringContainsString('Previous subject pet: PET_2',$this->provider->calls[1]['input']);
    }
    public function test_verified_public_subject_survives_text_history_trimming_and_new_topic_replaces_it():void {
        $this->provider->steps=[$this->data(['intent'=>'services_info','public_operation'=>'price','public_service'=>'Dog Grooming']),'Dog Grooming is listed at PHP 500.',$this->data(['intent'=>'clinic_info','public_operation'=>'location']),'The clinic is at 42 Fictional Lane.',$this->data(['intent'=>'clinic_info','public_operation'=>'location','restate_previous'=>true,'response_language'=>'filipino']),'Ang clinic ay nasa 42 Fictional Lane.'];
        $this->chat('How much is dog grooming?')->assertJsonPath('data.source','ai');
        session()->forget('vetti_public_history_'.hash('sha256','123|universal_context_123'));
        $this->chat('Where is the clinic?')->assertJsonPath('data.source','ai');
        self::assertStringContainsString('Previous verified public subject:',$this->provider->calls[2]['input']);self::assertStringContainsString('Dog Grooming',$this->provider->calls[2]['input']);
        $this->chat('Can you explain that in Tagalog?')->assertJsonPath('data.source','ai');
        $input=json_decode($this->provider->calls[5]['input'],true);self::assertSame('location',$input['latest_public_exchange']['subject']['topic']);self::assertArrayHasKey('address',$input['verified_clinic_data']['requested_information']);self::assertStringNotContainsString('500',$this->provider->calls[5]['input']);
    }
    public function test_frames_never_cross_chat_and_expiry_cannot_recover_private_subject():void {
        $facts=app(UserVettiFacts::class);$facts->shouldReceive('documents')->andReturn([]);
        $this->provider->steps=[$this->data(['intent'=>'documents_list','pet_ref'=>'PET_1']),$this->data(['intent'=>'other'])];
        $this->chat('Show Maple documents')->assertJsonPath('data.kind','documents_list');
        $this->chat('How about that?','another_context_123')->assertJsonPath('data.source','rule');
        self::assertStringNotContainsString('Previous subject pet:',$this->provider->calls[1]['input']);
    }
    public function test_expired_general_subject_does_not_enter_a_new_interpretation():void {
        $key='vetti_recent_topic_'.hash('sha256','123|universal_context_123');
        session()->put($key,['topic'=>'documents_list','pet_id'=>8,'expires_at'=>time()-1]);
        $this->provider->steps=[$this->data(['intent'=>'other']),'Which topic would you like to revisit?'];
        $this->chat('Can you explain that?')->assertJsonPath('data.source','rule');
        self::assertStringNotContainsString('Previous subject pet:',$this->provider->calls[0]['input']);self::assertStringNotContainsString('Most recent response topic:',$this->provider->calls[0]['input']);
    }
    public function test_shared_public_operation_contract_covers_preparation_registration_and_combined_clinic_topics():void {
        foreach(['preparation','register','hours_location','clinic_info'] as $i=>$operation){
            $this->provider->steps=[$this->data(['intent'=>'clinic_info','public_operation'=>$operation]),'I can help with that.',$this->data(['intent'=>'clinic_info','restate_previous'=>true,'response_language'=>'filipino']),'Puwede kitang tulungan.'];
            $chat='public_operation_'.$i;
            $this->chat('Please explain the visit information',$chat)->assertJsonPath('data.source','ai');
            $this->chat('Can you explain that in Tagalog?',$chat)->assertJsonPath('data.source','ai');
            $last=json_decode(end($this->provider->calls)['input'],true);self::assertTrue($last['restate_verified_information']);
        }
    }
    public function test_friendly_puppy_voice_is_shared_without_an_extra_provider_call():void {
        $gateway=new AiGateway($this->provider);$this->provider->steps=['Here’s how to get started.','Puwede kitang tulungan.'];
        $gateway->text('public_vetti','How do I book?','Use verified facts only.','sanitized');$gateway->text('semantic_vetti','Paano?','Use verified facts only.','sanitized');
        self::assertCount(2,$this->provider->calls);foreach($this->provider->calls as $call){self::assertStringContainsString('friendly puppy mascot',$call['instructions']);self::assertStringContainsString('not a formal receptionist or a baby',$call['instructions']);}
    }
    public function test_dates_accept_equivalent_source_formats_without_requiring_literal_model_copy():void {
        $cases=[
            ['tomorrow','2026-11-11'],['bukas','tomorrow'],
            ['tomorrow (11/11/2026)','11/11/2026'],
            ['tomorrow (11/11/2026)','tomorrow (11/11/2026)'],
            ['11/11/2026','2026-11-11'],['November 11, 2026','2026-11-11'],
            ['11 November 2026','Nov 11, 2026'],['Nov. 11th','tomorrow'],
        ];
        foreach($cases as $i=>[$said,$extracted]) {
            $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>$extracted,'exact_time_expression'=>'15:00','changed_fields'=>['pet','service','date','time']])];
            $this->chat('I want a new appointment for '.$said.' at 3PM, consultation for Maple','date_format_chat_'.$i)
                ->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.preferred_time','15:00');
        }
    }
    public function test_conflicting_ambiguous_invalid_and_hallucinated_dates_do_not_change_pending_proposal():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>'tomorrow','exact_time_expression'=>'15:00'])];
        $this->chat('Book Maple consultation tomorrow at 3pm')->assertJsonPath('data.kind','booking_proposal');
        foreach([
            ['tomorrow (11/12/2026)','tomorrow','different days'],
            ['11/12/2026','2026-11-12','two different days'],
            ['November 31, 2026','November 31, 2026','next 30 days'],
            ['tomorrow','2026-11-12','next 30 days'],
            ['today or tomorrow','today','different days'],
        ] as [$said,$extracted,$notice]) {
            $this->provider->steps=[$this->data(['intent'=>'booking_followup','date_expression'=>$extracted,'changed_fields'=>['date']])];
            $r=$this->chat('Change the date to '.$said)->assertJsonPath('data.clarification_field','date')->assertJsonPath('data.proposal_pending',true);
            self::assertStringContainsString($notice,$r->json('data.text'));
        }
        $this->provider->steps=[$this->data(['intent'=>'booking_followup','exact_time_expression'=>'16:00','changed_fields'=>['time']])];
        $this->chat('What about 4pm?')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.preferred_time','16:00');
        self::assertCount(2,$this->bookings);
    }

    public function test_checking_slots_resumes_only_the_validated_server_proposal():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>'tomorrow','exact_time_expression'=>'15:00'])];
        $this->chat('Book Maple consultation tomorrow at 3pm')->assertJsonPath('data.kind','booking_proposal');
        $this->provider->steps=[$this->data(['intent'=>'booking_availability','service'=>'dog_grooming','date_expression'=>'today','exact_time_expression'=>'18:00','changed_fields'=>['service','date','time']])];
        $this->chat('Check available slots')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.service_value','consultation')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.preferred_time','15:00');
        self::assertCount(2,$this->bookings);
        $this->provider->steps=[$this->data(['intent'=>'booking_availability'])];
        $r=$this->chat('Are there times for my proposal?','empty_slot_chat_123')->assertJsonPath('data.source','rule');
        self::assertStringContainsString('prepare a booking proposal first',$r->json('data.text'));self::assertCount(2,$this->bookings);
    }

    public function test_new_booking_does_not_drop_supplied_fields_when_change_metadata_is_empty():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>'tomorrow','exact_time_expression'=>'15:00','changed_fields'=>[]])];
        $this->chat('Book Maple consultation tomorrow at 3pm')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.preferred_time','15:00')->assertJsonPath('data.service_value','consultation');
        $this->provider->steps=[$this->data(['intent'=>'booking_followup','date_expression'=>'today','exact_time_expression'=>'16:00','changed_fields'=>[]])];
        $this->chat('Can I check my proposal?')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.preferred_time','15:00');
    }


    public function test_service_answer_keeps_date_even_when_interpreter_labels_it_booking():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','date_expression'=>'tomorrow']),$this->data(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'consultation','changed_fields'=>['pet','service']])];
        $this->chat('Can you book an appointment tomorrow?')->assertJsonPath('data.proposal_pending',true);
        $this->chat('I want consultation for Pippin')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.pet_id',8);
        self::assertStringContainsString('awaiting_answer=service',$this->provider->calls[1]['input']);
    }
    public function test_answer_to_scope_question_starts_new_without_repeating_scope_question():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','date_expression'=>'tomorrow','pet_ref'=>'PET_2','service'=>'consultation']),$this->data(['intent'=>'booking','needs_clarification'=>true,'clarification_field'=>'booking_scope']),$this->data(['intent'=>'booking','booking_mode'=>'new','needs_clarification'=>true]),$this->data(['intent'=>'booking','date_expression'=>'November 20, 2026'])];
        $this->chat('Book Pippin consultation tomorrow')->assertJsonPath('data.kind','booking_proposal');
        $this->chat('Can we do a booking?')->assertJsonPath('data.proposal_pending',true);
        $this->chat('A separate one please')->assertJsonPath('data.kind','information');
        $saved=array_values(session('vetti_semantic_proposals'))[0]; self::assertNull($saved['date']); self::assertSame('none',$saved['service']);
        self::assertStringContainsString('awaiting_answer=booking_scope',$this->provider->calls[2]['input']);
        $this->chat('November 20, 2026')->assertJsonPath('data.proposal_pending',true);
        $saved=array_values(session('vetti_semantic_proposals'))[0]; self::assertSame('2026-11-20',$saved['date']);
    }
    public function test_busy_period_and_alternative_preferences_survive_followups():void {
        $part=fn($p)=>['daypart'=>$p,'start'=>'','end'=>''];
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'consultation','date_expression'=>'tomorrow']),$this->data(['intent'=>'booking_followup','schedule_update'=>['mode'=>'replace','source_quote'=>'busy in the afternoon','blocked'=>[$part('afternoon')]]]),$this->data(['intent'=>'booking_availability','changed_fields'=>['time'],'schedule_update'=>['mode'=>'replace','source_quote'=>'Morning or evening','allowed'=>[$part('morning'),$part('evening')]]])];
        $this->chat('Book Pippin consultation tomorrow')->assertJsonPath('data.kind','booking_proposal');
        $this->chat('I am busy in the afternoon')->assertJsonPath('data.kind','booking_proposal');
        $this->chat('Morning or evening please')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.pet_id',8);
        $saved=array_values(session('vetti_semantic_proposals'))[0];self::assertSame([[720,1080]],$saved['schedule']['blocked']);self::assertSame([[0,720],[1080,1440]],$saved['schedule']['allowed']);
    }
    public function test_hallucinated_busy_range_and_provider_failure_preserve_proposal():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation','date_expression'=>'tomorrow']),$this->data(['intent'=>'booking_followup','schedule_update'=>['mode'=>'replace','source_quote'=>'not in message','blocked'=>[['daypart'=>'afternoon','start'=>'','end'=>'']]]])];
        $this->chat('Book Maple consultation tomorrow')->assertJsonPath('data.kind','booking_proposal');$before=session('vetti_semantic_proposals');
        $this->chat('I have some commitments')->assertJsonPath('data.proposal_pending',true);self::assertSame($before,session('vetti_semantic_proposals'));
        $this->provider->steps=[];$this->chat('Can you check again?')->assertJsonPath('data.mode','fallback');self::assertSame($before,session('vetti_semantic_proposals'));
    }

    public function test_availability_query_can_supply_a_current_source_grounded_date():void {
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'consultation']),$this->data(['intent'=>'booking_availability','date_expression'=>'today','time_preference'=>'evening'])];
        $this->chat('Book Pippin for consultation')->assertJsonPath('data.proposal_pending',true);
        $this->chat('Check available evening times today')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-10')->assertJsonPath('data.pet_id',8);
    }

    public function test_omitted_alternative_period_relationship_is_reinterpreted_before_availability():void {
        $part=fn($p)=>['daypart'=>$p,'start'=>'','end'=>''];
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'consultation','date_expression'=>'tomorrow']),$this->data(['intent'=>'booking_availability','changed_fields'=>['time']]),['mode'=>'replace','source_quote'=>'morning or evening','allowed'=>[$part('morning'),$part('evening')]]];
        $this->chat('Book Pippin consultation tomorrow')->assertJsonPath('data.kind','booking_proposal');
        $this->chat('Do you have morning or evening times?')->assertJsonPath('data.kind','booking_proposal');
        $saved=array_values(session('vetti_semantic_proposals'))[0];self::assertSame([[0,720],[1080,1440]],$saved['schedule']['allowed']);
        self::assertCount(3,$this->provider->calls);
    }

    public function test_period_changes_replace_allowed_periods_and_keep_busy_intervals():void {
        $part=fn($p)=>['daypart'=>$p,'start'=>'','end'=>''];
        $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_2','service'=>'consultation','date_expression'=>'tomorrow','schedule_update'=>['mode'=>'replace','source_quote'=>'busy in the afternoon','blocked'=>[$part('afternoon')]]]),$this->data(['intent'=>'booking_availability','time_preference'=>'morning','changed_fields'=>['availability']]),$this->data(['intent'=>'booking_availability','time_preference'=>'evening','changed_fields'=>['availability']])];
        $this->chat('Book Pippin consultation tomorrow; busy in the afternoon')->assertJsonPath('data.kind','booking_proposal');
        $this->chat('What times are available in the morning?')->assertJsonPath('data.kind','booking_proposal');
        $saved=array_values(session('vetti_semantic_proposals'))[0];self::assertSame([[0,720]],$saved['schedule']['allowed']);
        $this->chat('What times are available in the evening?')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-11')->assertJsonPath('data.pet_id',8);
        $saved=array_values(session('vetti_semantic_proposals'))[0];self::assertSame([[1080,1440]],$saved['schedule']['allowed']);self::assertSame([[720,1080]],$saved['schedule']['blocked']);
    }
}
