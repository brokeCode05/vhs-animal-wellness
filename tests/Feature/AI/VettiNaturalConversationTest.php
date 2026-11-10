<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Http\Middleware\RecordUserAccess;
use App\Services\AI\{AiProviderInterface,PublicClinicFacts,UserVettiFacts,VettiPetPrivacyEnvelope,VettiPetDraftSession};
use Tests\TestCase;
final class VettiNaturalConversationTest extends TestCase {
 private object $provider;
 protected function setUp():void {
  parent::setUp();$this->withoutMiddleware(RecordUserAccess::class);$u=new User;$u->setRawAttributes(['id'=>123,'role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01']);$this->actingAs($u)->withSession(['auth_version'=>1]);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([]);
  $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'services'=>[],'service_details'=>[]]);
  $this->provider=new class implements AiProviderInterface {public array $steps=[],$calls=[];public function generate(string $i,string $m,?array $schema=null):array{$this->calls[]=compact('i','m','schema');if(!$this->steps)throw new \RuntimeException('Unexpected call');$next=array_shift($this->steps);return ['text'=>is_array($next)?json_encode($next):$next,'usage'=>[]];}};$this->app->instance(AiProviderInterface::class,$this->provider);
 }
 private function data(array $extra=[]):array{return array_merge(['intent'=>'pet_add','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'response_language'=>'english','pet_form_requested'=>true],$extra);}
 private function chat(string $message,bool $open=true,string $chat='natural_pet_chat_123'){return $this->postJson('/api/ai/semantic-vetti',['message'=>$message,'conversation_id'=>$chat,'pet_form_open'=>$open])->assertOk();}
 public function test_social_acknowledgment_is_ai_worded_and_preserves_the_verified_context():void {
  $key='vetti_recent_topic_'.hash('sha256','123|natural_pet_chat_123');$saved=['topic'=>'booking','pet_id'=>null,'expires_at'=>time()+600];session()->put($key,$saved);
  $this->provider->steps=[$this->data(['intent'=>'social','social_act'=>'gratitude']),"You're very welcome!"];
  $this->chat('alright thanks')->assertJsonPath('data.source','ai')->assertJsonPath('data.text',"You're very welcome!")->assertJsonPath('data.context_unchanged',true)->assertSessionHas($key,$saved);
  self::assertCount(2,$this->provider->calls);self::assertStringContainsString('social',$this->provider->calls[0]['i']);
 }
 public function test_natural_pet_followups_resolve_private_references_and_merge_drafts_without_saving():void {
  $this->provider->steps=[$this->data(),"Sure, let's fill in the form together."];$this->chat('I want to add another pet',false)->assertJsonPath('data.kind','pet_add');
  $this->provider->steps=[$this->data(['registration_mode'=>'update','registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1','species'=>'Dog','weight_ref'=>'PRIVATE_VALUE_2','age_ref'=>'PRIVATE_VALUE_3','age_unit'=>'months']]),'I’ve filled those details in. What breed and sex should I put down?'];
  $r=$this->chat('his name is Quill, he is a dog, and his weight is currently 4kg, a 2 months old pup')->assertJsonPath('data.source','ai')->assertJsonPath('data.pet_draft.name','Quill')->assertJsonPath('data.pet_draft.weightKg',4)->assertJsonPath('data.pet_draft.age',2)->assertJsonPath('data.pet_draft.ageUnit','months')->assertJsonPath('data.pet_draft.species','Dog')->assertJsonPath('data.pet_created',false);
  $wire=json_encode($this->provider->calls);self::assertStringNotContainsString('Quill',$wire);self::assertDoesNotMatchRegularExpression('/\b4\s*kg\b|\b2\s*months\b/i',$wire);
  $encrypted=json_encode(session()->get('vetti.pet.registration'));self::assertStringNotContainsString('Quill',$encrypted);self::assertStringNotContainsString('weightKg',$encrypted);
  $this->provider->steps=[$this->data(['registration_mode'=>'update','registration_fields'=>['weight_ref'=>'PRIVATE_VALUE_1']]),'I’ve updated the weight in the draft.'];
  $this->chat('actually he weighs .75kg')->assertJsonPath('data.replace_draft',false)->assertJsonPath('data.pet_draft.weightKg',0.75)->assertJsonMissingPath('data.pet_draft.name');
  $this->provider->steps=[$this->data(['intent'=>'social','social_act'=>'gratitude']),"You're welcome!"];$this->chat('thank you, got it')->assertJsonPath('data.context_unchanged',true);
  $this->provider->steps=[$this->data(['registration_mode'=>'update','registration_fields'=>['gender'=>'Male','breed_text'=>'Unknown']]),'Great, please review the form before adding your pet.'];$this->chat('Male, breed Unknown')->assertJsonPath('data.pet_draft.gender','Male')->assertJsonPath('data.replace_draft',false);
  $draft=VettiPetDraftSession::read(request(),123,'natural_pet_chat_123');self::assertSame('Quill',$draft['name']);self::assertSame(0.75,$draft['weightKg']);self::assertSame(2,$draft['age']);
 }
 public function test_private_source_validation_rejects_wrong_units_and_hallucinated_references():void {
  $privacy=new VettiPetPrivacyEnvelope;$e=$privacy->protect('Name: Willow Age: 3 months Weight: .35kg');
  self::assertStringNotContainsString('Willow',$e['safe']);self::assertStringNotContainsString('.35',$e['safe']);
  $bad=$privacy->resolve(['name_ref'=>'PRIVATE_VALUE_99','age_ref'=>'PRIVATE_VALUE_2','age_unit'=>'years','weight_ref'=>'PRIVATE_VALUE_3'],$e);
  self::assertNotContains('Willow',$bad['changes']);self::assertNull($bad['changes']['age']);self::assertSame(0.35,$bad['changes']['weightKg']);self::assertContains('age',$bad['issues']);
 }
 public function test_public_courtesy_preserves_the_verified_service_for_a_followup():void {
  config(['ai.public_conversation_enabled'=>true,'ai.public_vetti_enabled'=>true]);
  $key='public_courtesy_chat_123';$req=\Illuminate\Http\Request::create('/','POST');$req->setLaravelSession(session()->driver());
  \App\Services\AI\VettiConversationSession::write($req,null,$key,['topic'=>'identity','service'=>null,'choices'=>[],'category'=>null]);
  $before=\App\Services\AI\VettiConversationSession::read($req,null,$key);
  foreach([['alright thanks','gratitude','You’re welcome!'],['okay that makes sense','acknowledgment','Glad that helped.'],['thanks po gets ko na','gratitude','Walang anuman!'],['sorry ang dami kong tanong','apology','No worries, ask away.']] as [$message,$act,$reply]){
   $this->provider->steps=[['operation'=>'social','service'=>'none','matching_services'=>[],'social_act'=>$act,'response_language'=>'english'],$reply];
   $res=$this->postJson('/api/ai/public-vetti',['message'=>$message,'conversation_id'=>$key]);
   $res->assertOk()->assertJsonPath('data.source','ai')->assertJsonPath('data.text',$reply)->assertJsonPath('data.intent','social');
   self::assertSame($before,\App\Services\AI\VettiConversationSession::read($req,null,$key));
  }
 }

 public function test_out_of_scope_reply_can_acknowledge_only_a_literal_sanitized_topic():void {
  $this->provider->steps=[$this->data(['intent'=>'unsupported','scope_topic'=>'cooking recipes']),'Cooking recipes are outside what I can help with here, but I can help with clinic questions.'];
  $this->chat('Do you know cooking recipes?')->assertJsonPath('data.source','ai');$wire=json_decode(end($this->provider->calls)['m'],true);self::assertSame('cooking recipes',$wire['verified_reply_purpose']['topic']);self::assertArrayNotHasKey('social_message',$wire);
  $this->provider->steps=[$this->data(['intent'=>'unsupported','scope_topic'=>'an invented topic']),"That’s outside my clinic-assistant role."];
  $this->chat('Can you write a game?')->assertJsonPath('data.source','ai');$wire=json_decode(end($this->provider->calls)['m'],true);self::assertArrayNotHasKey('topic',$wire['verified_reply_purpose']);
 }

 public function test_invalid_age_and_weight_values_clear_only_the_corresponding_draft_fields():void {
  $this->provider->steps=[$this->data(['registration_mode'=>'new','registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1','age_ref'=>'PRIVATE_VALUE_2','age_unit'=>'months','weight_ref'=>'PRIVATE_VALUE_3']]),'Please review the pet form.'];
  $this->chat('Add a pet named Willow, 3 months old, weighs .35kg')->assertJsonPath('data.pet_draft.name','Willow')->assertJsonPath('data.pet_draft.weightKg',0.35);
  $this->provider->steps=[$this->data(['registration_mode'=>'update','registration_fields'=>['weight_ref'=>'PRIVATE_VALUE_1']]),'Could you check the weight in the form?'];
  $this->chat('weight is .123kg')->assertJsonPath('data.replace_draft',false)->assertJsonPath('data.pet_draft.weightKg',null)->assertJsonPath('data.draft_needs_review.0','weightKg');
  $draft=VettiPetDraftSession::read(request(),123,'natural_pet_chat_123');self::assertSame('Willow',$draft['name']);self::assertSame(3,$draft['age']);self::assertNull($draft['weightKg']);
 }
 public function test_pet_draft_is_bounded_expiring_encrypted_and_isolated_by_owner_and_chat():void {
  $req=\Illuminate\Http\Request::create('/','POST');$req->setLaravelSession(session()->driver());VettiPetDraftSession::write($req,123,'privacy_a',['name'=>'Fictional Secret Name','age'=>2,'ageUnit'=>'months','weightKg'=>.35,'owner_id'=>999]);
  self::assertSame([],VettiPetDraftSession::read($req,124,'privacy_a'));self::assertSame([],VettiPetDraftSession::read($req,123,'privacy_b'));
  $fields=VettiPetDraftSession::read($req,123,'privacy_a');self::assertSame('Fictional Secret Name',$fields['name']);self::assertArrayNotHasKey('owner_id',$fields);
  $all=$req->session()->get('vetti.pet.registration');$key=hash('sha256','123|privacy_a');$all[$key]['until']=time()-1;$req->session()->put('vetti.pet.registration',$all);self::assertSame([],VettiPetDraftSession::read($req,123,'privacy_a'));
  for($i=0;$i<8;$i++)VettiPetDraftSession::write($req,123,'bounded_'.$i,['name'=>'Fictional']);self::assertCount(6,$req->session()->get('vetti.pet.registration'));
 }


 public function test_first_turn_and_opaque_breed_followups_retain_all_pet_details():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['species'=>'Cat','gender'=>'Male']]),'What name would you like to use?'];
  $this->chat('I want to add a male cat.',false)->assertJsonPath('data.pet_draft.species','Cat')->assertJsonPath('data.pet_draft.gender','Male');
  self::assertArrayHasKey('registration_fields',$this->provider->calls[0]['schema']['properties']);
  $this->provider->steps=[$this->data(['registration_mode'=>'new','registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1']]),'What breed is your cat?'];
  $this->chat('His name is Birdie.')->assertJsonPath('data.pet_draft.name','Birdie')->assertJsonPath('data.replace_draft',false);
  $this->provider->steps=[$this->data(['registration_fields'=>['breed_ref'=>'PRIVATE_VALUE_1']]),'How old is your pet?'];
  $this->chat('He is Persian.')->assertJsonPath('data.pet_draft.breed','Persian');
  $this->provider->steps=[$this->data(['registration_fields'=>['age_ref'=>'PRIVATE_VALUE_1','age_unit'=>'months','weight_ref'=>'PRIVATE_VALUE_2']]),'Please review the form before adding your pet.'];
  $this->chat('He is 3 months old and weighs .75 kg.')->assertJsonPath('data.pet_draft.age',3)->assertJsonPath('data.pet_draft.ageUnit','months')->assertJsonPath('data.pet_draft.weightKg',0.75)->assertJsonPath('data.pet_created',false);
  $draft=VettiPetDraftSession::read(request(),123,'natural_pet_chat_123');
  self::assertSame(['species'=>'Cat','gender'=>'Male','name'=>'Birdie','breed'=>'Persian','age'=>3,'ageUnit'=>'months','weightKg'=>0.75],$draft);
  $wire=json_encode($this->provider->calls);self::assertStringNotContainsString('Birdie',$wire);self::assertStringNotContainsString('Persian',$wire);self::assertStringNotContainsString('.75',$wire);
 }
 public function test_unlabelled_registration_values_are_protected_and_never_truncated_back_to_raw_text():void {
  $privacy=new VettiPetPrivacyEnvelope;
  foreach(['Birdie','He is Persian.','Name is Cumulus, breed is Nebula','His name Birdie'] as $message){$e=$privacy->protect($message,[],true);foreach(['Birdie','Persian','Cumulus','Nebula'] as $private)self::assertStringNotContainsString($private,$e['safe']);}
  $e=$privacy->protect(implode(' ',array_fill(0,20,'FictionalIdentifier')),[],true);self::assertStringNotContainsString('FictionalIdentifier',$e['safe']);self::assertCount(20,$e['vault']);
 }

 public function test_completed_draft_is_returned_for_review_without_creating_pet():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1','species'=>'Cat','gender'=>'Male','breed_ref'=>'PRIVATE_VALUE_2','age_ref'=>'PRIVATE_VALUE_3','age_unit'=>'months','weight_ref'=>'PRIVATE_VALUE_4']]),'Please review the details below before pressing Add pet.'];
  $this->chat('Name: Birdie, Breed: Persian, male cat, 3 months old, weighs .75 kg',false)
   ->assertJsonPath('data.open_form',true)->assertJsonPath('data.review_form',true)->assertJsonPath('data.pet_created',false);
 }
 public function test_pausing_partial_registration_shows_same_draft_without_more_questions():void {
  $this->provider->steps=[$this->data(['registration_fields'=>['name_ref'=>'PRIVATE_VALUE_1','species'=>'Cat']]),'What breed should go in the form?'];
  $this->chat('Name: Birdie, cat',false)->assertJsonPath('data.review_form',false);
  $before=VettiPetDraftSession::read(request(),123,'natural_pet_chat_123');
  $this->provider->steps=[$this->data(['pet_form_requested'=>false,'pet_collection_action'=>'pause']),'Sure, you can finish the form below whenever you are ready.'];
  $this->chat('Stop, I will fill the rest manually')->assertJsonPath('data.open_form',true)->assertJsonPath('data.review_form',true)->assertJsonPath('data.replace_draft',false)->assertJsonPath('data.pet_created',false);
  self::assertSame($before,VettiPetDraftSession::read(request(),123,'natural_pet_chat_123'));
  $wire=json_decode(end($this->provider->calls)['m'],true);self::assertTrue($wire['verified_workflow']['collection_paused']);
  self::assertStringContainsString('without asking more questions',end($this->provider->calls)['i']);
  $e=(new VettiPetPrivacyEnvelope)->protect('stop',[],true,'name');self::assertSame('stop',$e['safe']);
 }
}
