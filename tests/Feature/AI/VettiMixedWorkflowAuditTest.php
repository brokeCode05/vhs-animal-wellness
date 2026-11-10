<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Http\Middleware\RecordUserAccess;
use App\Services\AI\{AiProviderInterface,AiGateway,BookingConversationService,UserVettiFacts,PublicClinicFacts,VettiPetDraftSession};
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Tests\TestCase;
final class VettiMixedWorkflowAuditTest extends TestCase {
 private object $provider;
 protected function setUp():void {
  parent::setUp();Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00','Asia/Manila'));
  $this->withoutMiddleware(RecordUserAccess::class);$u=new User;$u->setRawAttributes(['id'=>123,'role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01']);$this->actingAs($u)->withSession(['auth_version'=>1]);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $facts=$this->mock(UserVettiFacts::class);$facts->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'FictionalBornok','species'=>'Cat','gender'=>'Male']]);$facts->shouldReceive('ownsPet')->andReturnUsing(fn($u,$id)=>$id===7);$facts->shouldReceive('upcoming')->never();
  $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'services'=>['Consultation'],'service_details'=>['Consultation'=>['category'=>'Wellness']],'booking_services'=>[['value'=>'consultation','label'=>'Consultation']]]);
  $this->provider=new class implements AiProviderInterface {public array $steps=[],$calls=[];public function generate(string $i,string $m,?array $schema=null):array {$this->calls[]=compact('i','m','schema');if(!$this->steps)throw new \RuntimeException('Unexpected call');$next=array_shift($this->steps);return ['text'=>is_array($next)?json_encode($next):$next,'usage'=>[]];}};
  $this->app->instance(AiProviderInterface::class,$this->provider);
  $booking=\Mockery::mock(new BookingConversationService(new AiGateway($this->provider)));$booking->shouldReceive('prepare')->andReturnUsing(fn($u,$pets,$id,$hint,$date,$pref,$q,$time=null)=>['status'=>'ready','service_value'=>$hint,'service_label'=>$hint,'text'=>'Please review the available starts.','preferred_time'=>$time,'slots'=>['09:00']]);$this->app->instance(BookingConversationService::class,$booking);
 }
 protected function tearDown():void {Carbon::setTestNow();parent::tearDown();}
 private function data(array $extra=[]):array {return array_merge(['intent'=>'pet_add','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'pet_form_requested'=>true],$extra);}
 private function chat(string $q,bool $open=false,array $extra=[]){return $this->postJson('/api/ai/semantic-vetti',array_merge(['message'=>$q,'conversation_id'=>'mixed_workflow_123','pet_form_open'=>$open],$extra))->assertOk();}
 private function draft():array {return VettiPetDraftSession::read(request(),123,'mixed_workflow_123');}
 public function test_name_survives_when_interpreter_does_not_open_form_and_followup_says_new():void {
  $this->provider->steps=[$this->data(['pet_form_requested'=>false,'registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];
  $this->chat('I want to add a pet named Brody')->assertJsonPath('data.pet_draft.name','Brody')->assertJsonPath('data.open_form',false);
  $this->provider->steps=[$this->data(['registration_mode'=>'new','registration_fields'=>['species'=>'Bird','gender'=>'Male']]),'What breed is your pet?'];
  $this->chat('He is a male bird')->assertJsonPath('data.replace_draft',false)->assertJsonPath('data.pet_draft.species','Bird');
  self::assertSame(['name'=>'Brody','species'=>'Bird','gender'=>'Male'],$this->draft());
  $input=$this->provider->calls[2]['m'];self::assertStringContainsString('fields already provided: ["name"]',$input);self::assertStringNotContainsString('Brody',json_encode($this->provider->calls));
 }
 public function test_cancel_draft_then_book_and_followup_never_reactivates_registration():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $this->provider->steps=[$this->data(['intent'=>'pet_add_cancel','negated'=>true,'cancel_target'=>'pet_registration']),['action'=>'cancel','discard_quote'=>'Cancel adding pet'],'The pet draft is cancelled. No pet was added.'];
  $this->chat('Cancel adding pet',true)->assertJsonPath('data.kind','pet_add_cancelled')->assertJsonPath('data.draft_cleared',true)->assertJsonPath('data.pet_created',false);self::assertSame([],$this->draft());
  $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'consultation'])];$this->chat('Book FictionalBornok for consultation')->assertJsonPath('data.proposal_pending',true);
  $this->provider->steps=[$this->data(['intent'=>'booking_availability','date_expression'=>'bukas','time_preference'=>'morning','schedule_update'=>['mode'=>'replace','source_quote'=>'busy ako ng hapon do you have morning schedules','blocked'=>[['daypart'=>'afternoon','start'=>'','end'=>'']],'allowed'=>[['daypart'=>'morning','start'=>'','end'=>'']]]])];
  $this->chat('bukas sana kaso busy ako ng hapon do you have morning schedules',true)->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-12')->assertJsonPath('data.pet_id',7);
  $input=end($this->provider->calls)['m'];self::assertStringContainsString('Active user workflow: booking',$input);self::assertStringNotContainsString('Pet registration draft active',$input);self::assertStringContainsString('busy ako ng hapon',$input);
  $this->provider->steps=[$this->data(['intent'=>'booking_followup','date_expression'=>'bukas'])];$this->chat('bukas ngani',true)->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.pet_id',7);self::assertSame([],$this->draft());
 }
 public function test_browser_dismissal_reset_is_idempotent_and_does_not_erase_next_draft():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $token=['pet_draft_reset_id'=>'reset_fictional_123'];
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Willow',false,$token);self::assertSame('Willow',$this->draft()['name']);
  $this->provider->steps=[$this->data(['registration_mode'=>'new','registration_fields'=>['species'=>'Bird']]),'What breed is your pet?'];$this->chat('A bird',false,$token);self::assertSame('Willow',$this->draft()['name']);self::assertSame('Bird',$this->draft()['species']);
 }
 public function test_ambiguous_cancel_while_registering_cannot_list_appointments():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $before=$this->draft();$this->provider->steps=[$this->data(['intent'=>'cancel'])];$this->chat('Cancel')->assertJsonPath('data.kind','information');self::assertSame($before,$this->draft());
 }

 public function test_repeated_private_name_keeps_name_identity_instead_of_becoming_breed():void {
  $e=(new \App\Services\AI\VettiPetPrivacyEnvelope)->protect('I told you before its Brody',[],true,'breed',[],['name'=>'Brody','species'=>'Bird','gender'=>'Male']);
  self::assertStringContainsString('I told you before its',$e['safe']);self::assertStringNotContainsString('Brody',$e['safe']);
  self::assertCount(1,$e['metadata']);self::assertSame('name',$e['metadata']['PRIVATE_VALUE_1']['field_hint']);
 }
 public function test_missing_service_booking_followups_keep_date_and_do_not_ask_pet_age():void {
  $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1'])];$this->chat('I want to book an appointment for FictionalBornok')->assertJsonPath('data.proposal_pending',true);
  $this->provider->steps=[$this->data(['intent'=>'booking_availability','date_expression'=>'bukas','time_preference'=>'morning','schedule_update'=>['mode'=>'replace','source_quote'=>'busy ako ng hapon','blocked'=>[['daypart'=>'afternoon','start'=>'','end'=>'']]]])];
  $r=$this->chat('bukas sana kaso busy ako ng hapon do you have morning schedules');self::assertStringContainsString('service',$r->json('data.text'));
  $this->provider->steps=[$this->data(['intent'=>'booking_availability','date_expression'=>'bukas','schedule_update'=>['mode'=>'replace','source_quote'=>'bukas','blocked'=>[['daypart'=>'afternoon','start'=>'','end'=>'']],'allowed'=>[['daypart'=>'morning','start'=>'','end'=>'']]]])];$r=$this->chat('bukas ngani');self::assertStringContainsString('service',$r->json('data.text'));self::assertSame([],$this->draft());
  $this->provider->steps=[$this->data(['intent'=>'booking_followup','service'=>'consultation','changed_fields'=>['service']])];$this->chat('Consultation')->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.preferred_date','2026-11-12')->assertJsonPath('data.pet_id',7)->assertJsonPath('data.time_preference','morning');
 }
 public function test_browser_dismissal_clears_registration_focus_before_next_message():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','date_expression'=>'tomorrow'])];$this->chat('Book tomorrow',false,['pet_draft_reset_id'=>'dismiss_fictional_123']);
  $input=end($this->provider->calls)['m'];self::assertStringContainsString('Active user workflow: none',$input);self::assertStringNotContainsString('Pet registration draft active',$input);self::assertSame([],$this->draft());
 }
 public function test_registration_collection_cancel_cannot_reach_appointment_route():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $this->provider->steps=[$this->data(['pet_collection_action'=>'cancel']),['action'=>'cancel','discard_quote'=>'Stop adding this pet'],'The pet draft is cancelled. No pet was added.'];$this->chat('Stop adding this pet',true)->assertJsonPath('data.kind','pet_add_cancelled')->assertJsonPath('data.draft_cleared',true);self::assertSame([],$this->draft());
 }
 public function test_date_reply_misrouted_to_clinic_information_is_audited_before_response():void {
  $this->provider->steps=[$this->data(['intent'=>'booking','pet_ref'=>'PET_1','date_expression'=>'tomorrow'])];$this->chat('Book FictionalBornok tomorrow');
  $this->provider->steps=[$this->data(['intent'=>'clinic_info','public_operation'=>'hours']),['decision'=>'continue_booking','change_quote'=>'']];
  $r=$this->chat('tomorrow, as I said');self::assertStringContainsString('service',$r->json('data.text'));self::assertStringNotContainsString('hours',$r->json('data.text'));self::assertSame([],$this->draft());
 }
 public function test_first_form_render_receives_all_details_collected_while_form_was_hidden():void {
  $this->provider->steps=[$this->data(['pet_form_requested'=>false,'registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $this->provider->steps=[$this->data(['pet_form_requested'=>false,'registration_fields'=>['species'=>'Bird','gender'=>'Male']]),'What breed is your pet?'];$this->chat('A male bird')->assertJsonPath('data.open_form',false);
  $this->provider->steps=[$this->data(['pet_form_requested'=>true,'pet_collection_action'=>'review']),'Please review the form.'];
  $this->chat('Show the form')->assertJsonPath('data.open_form',true)->assertJsonPath('data.pet_draft.name','Brody')->assertJsonPath('data.pet_draft.species','Bird')->assertJsonPath('data.pet_draft.gender','Male');
 }
 public function test_open_form_receives_only_new_changes_to_preserve_unrelated_manual_edits():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');
  $this->provider->steps=[$this->data(['registration_fields'=>['species'=>'Bird','gender'=>'Male']]),'What breed is your pet?'];
  $r=$this->chat('A male bird',true);self::assertSame(['species'=>'Bird','gender'=>'Male'],$r->json('data.pet_draft'));
 }
 public function test_stop_questions_misclassified_as_cancel_preserves_draft_and_reviews_form():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');$before=$this->draft();
  $this->provider->steps=[$this->data(['intent'=>'pet_add_cancel','negated'=>true]),['action'=>'review','discard_quote'=>''],'You can review the form now.'];
  $this->chat('Stop asking now, let me review the form',true)->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.draft_cleared',false)->assertJsonPath('data.review_form',true);self::assertSame($before,$this->draft());
 }
 public function test_cancellation_without_grounded_discard_evidence_cannot_erase_draft():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');$before=$this->draft();
  $this->provider->steps=[$this->data(['intent'=>'pet_add_cancel']),['action'=>'cancel','discard_quote'=>'invented source'],'Please review the form.'];
  $this->chat('Let me look at it',true)->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.draft_cleared',false);self::assertSame($before,$this->draft());
 }
 public function test_negated_registration_review_is_not_a_booking_rejection():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What species is your pet?'];$this->chat('Add a pet named Brody');$before=$this->draft();
  $this->provider->steps=[$this->data(['negated'=>true,'pet_collection_action'=>'review']),['action'=>'review','discard_quote'=>''],'You can review the form now.'];
  $this->chat('Do not ask more, I will review it',true)->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.review_form',true);self::assertSame($before,$this->draft());
 }
}
