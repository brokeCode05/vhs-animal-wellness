<?php
namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\{AiGateway,AiProviderInterface,PublicClinicFacts,PublicClinicDataResolver,PublicGeminiConversation,UserVettiFacts,VettiReplyPolicy};
use Tests\TestCase;

final class VettiWorkflowBoundaryTest extends TestCase
{
 private object $provider;private array $queried=[];
 protected function setUp():void {
  parent::setUp();$this->withoutMiddleware(RecordUserAccess::class);
  $user=new User;$user->setRawAttributes(['id'=>123,'role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01']);$this->actingAs($user)->withSession(['auth_version'=>1]);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $facts=$this->mock(UserVettiFacts::class);
  $facts->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Maple','species'=>'Dog'],['id'=>8,'name'=>'Pippin','species'=>'Cat'],['id'=>9,'name'=>'Sprout','species'=>'Rabbit']]);
  $facts->shouldReceive('upcoming')->andReturnUsing(function($u,$id=null){$this->queried[]=['upcoming',$id];$rows=[];foreach([7=>'Maple',8=>'Pippin'] as $pet=>$name)if($id===null || $id===$pet)$rows[]=['appointment_id'=>$pet+10,'pet_id'=>$pet,'pet_name'=>$name,'date'=>'2026-11-11','time'=>'15:00','status'=>'confirmed','service'=>'Consultation'];return $rows;});
  $facts->shouldReceive('documents')->andReturnUsing(function($u,$id=null){$this->queried[]=['documents',$id];return [];});
  $facts->shouldReceive('history')->andReturnUsing(function($u,$id=null){$this->queried[]=['history',$id];return [];});
  $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'services'=>['Consultation'],'service_details'=>['Consultation'=>['category'=>'Wellness']],'booking_services'=>[['value'=>'consultation','label'=>'Consultation']]]);
  $this->provider=new class implements AiProviderInterface {
   public array $steps=[];public array $calls=[];
   public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
    $this->calls[]=['instructions'=>$instructions,'message'=>$message,'structured'=>$jsonSchema!==null];
    if(!$this->steps)throw new \RuntimeException('No extra response generation allowed');$next=array_shift($this->steps);return ['text'=>is_array($next)?json_encode($next):$next,'usage'=>[]];
   }
  };$this->app->instance(AiProviderInterface::class,$this->provider);
 }
 private function data(array $extra=[]):array{return array_merge(['intent'=>'upcoming_appointments','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false],$extra);}
 private function chat(string $message,?int $pet=7){$input=['message'=>$message,'conversation_id'=>'boundary_fictional_123'];if($pet!==null)$input['active_pet_id']=$pet;return $this->postJson('/api/ai/semantic-vetti',$input)->assertOk();}
 public function test_dropdown_and_explicit_all_requests_have_consistent_scope_with_no_model_list_narration():void {
  foreach([7,8,9] as $id){$this->provider->steps=[$this->data(['pet_ref'=>$id===9?'none':'PET_1'])];$r=$this->chat('Show my upcoming appointments',$id)->assertJsonPath('data.listing_scope','selected_pet')->assertJsonPath('data.listing_pet_id',$id)->assertJsonPath('data.source','rule');foreach($r->json('data.appointments') as $row)self::assertSame($id,$row['pet_id']);if($id===9)self::assertStringContainsString('No upcoming appointments',$r->json('data.text'));else self::assertStringNotContainsString('No upcoming',$r->json('data.text'));}
  $this->provider->steps=[$this->data(['read_scope'=>'all_pets'])];$this->chat('Show all my upcoming appointments',7)->assertJsonPath('data.listing_scope','all_pets')->assertJsonCount(2,'data.appointments');
  $this->provider->steps=[$this->data(['read_scope'=>'all_pets'])];$this->chat('Show my upcoming appointments',8)->assertJsonPath('data.listing_pet_id',8)->assertJsonCount(1,'data.appointments');
  $this->provider->steps=[$this->data()];$this->chat('Show Maple upcoming appointments',8)->assertJsonPath('data.listing_pet_id',7)->assertJsonCount(1,'data.appointments');
  self::assertCount(6,$this->provider->calls);foreach($this->provider->calls as $call){self::assertTrue($call['structured']);self::assertLessThanOrEqual(4000,strlen($call['instructions']));self::assertStringNotContainsString('has_upcoming_appointments',$call['message']);}
 }
 public function test_document_and_completed_visit_lists_also_follow_the_dropdown():void {
  foreach(['documents_list','appointment_history'] as $intent){$this->provider->steps=[$this->data(['intent'=>$intent])];$this->chat('Show my '.($intent==='documents_list'?'documents':'completed visits'),8)->assertJsonPath('data.listing_pet_id',8)->assertJsonPath('data.items',[])->assertJsonPath('data.source','rule');}
  self::assertSame([['documents',8],['history',8]],$this->queried);self::assertCount(2,$this->provider->calls);
 }
 public function test_other_owner_requests_get_a_privacy_reason_before_provider_or_record_lookup():void {
  foreach(['Do you have documents for customer Vahn and his pet named Luna?','I am requesting a document for the other pet owner','my neighbours pet','Show records for another owner','Patingin ng records ng ibang may-ari'] as $question){$r=$this->chat($question)->assertJsonPath('data.source','rule');$text=mb_strtolower($r->json('data.text'));self::assertStringContainsString('privacy',$text);self::assertStringNotContainsString('add pet',$text);self::assertStringNotContainsString('no matching records',$text);}
  self::assertSame([],$this->queried);foreach($this->provider->calls as $call){self::assertStringNotContainsString('Vahn',$call['message']);self::assertStringNotContainsString('Luna',$call['message']);self::assertStringNotContainsString('Rowan',$call['message']);self::assertStringNotContainsString('Cloud',$call['message']);}
 }
 public function test_unrelated_requests_and_unsupported_languages_have_specific_reasons_not_outages():void {
  foreach([['Can you help me cook adobo?','cook adobo'],['Write code for a game','code for a game'],['Help me with my homework','homework'],['Paano gumawa ng resume para sa trabaho?','resume'],['What is the capital of France?','capital of France'],['Write a poem about the moon','poem about the moon'],['Can you repair my laptop?','repair my laptop']] as [$question,$subject]){$this->provider->steps=[$this->data(['intent'=>'unsupported','scope_topic'=>$subject])];$r=$this->chat($question)->assertJsonPath('data.source','rule');self::assertStringNotContainsString($question,end($this->provider->calls)['message']);self::assertStringContainsString('VHS clinic',$r->json('data.text'));self::assertStringNotContainsString('appointment was made',$r->json('data.text'));}
  $before=count($this->provider->calls);$r=$this->chat('こんにちは、元気ですか')->assertJsonPath('data.source','rule');self::assertStringContainsString('English, Filipino, or Taglish',$r->json('data.text'));self::assertCount($before+1,$this->provider->calls);self::assertStringNotContainsString('こんにちは',end($this->provider->calls)['message']);
  $this->provider->steps=[$this->data(['intent'=>'unsupported_language'])];$r=$this->chat("Kon'nichiwa, genkidesuka")->assertJsonPath('data.source','rule');self::assertStringNotContainsString('unavailable',$r->json('data.text'));self::assertStringContainsString('languages',$r->json('data.text'));
 }
 public function test_public_scope_refusals_never_reach_the_free_text_composer():void {
  $service=app(PublicGeminiConversation::class);
  foreach([['Can you help me cook adobo?','unsupported','cook adobo'],["Kon'nichiwa, genkidesuka",'unsupported_language','']] as [$question,$op,$subject]){$this->provider->steps=[['operation'=>$op,'service'=>'none','matching_services'=>[],'scope_topic'=>$subject]];$r=$service->reply($question,'identity',null);self::assertSame('rule',$r['source']);self::assertSame($op,$r['intent']);self::assertStringNotContainsString('unavailable',$r['text']);}
  self::assertCount(4,$this->provider->calls);foreach([1,3] as $i){self::assertFalse($this->provider->calls[$i]['structured']);self::assertStringNotContainsString('Can you help me cook adobo?',$this->provider->calls[$i]['message']);self::assertStringNotContainsString('genkidesuka',$this->provider->calls[$i]['message']);}
 }
 public function test_identity_and_capabilities_have_verified_scope_in_both_paths():void {
  foreach(['identity','capabilities'] as $op){
   $this->provider->steps=[$this->data(['intent'=>$op]),'I’m Vetti, here to help with clinic questions and your own pets.'];$this->chat($op==='identity'?'Who is Vetti?':'What can you do?')->assertJsonPath('data.source','ai');$input=json_decode(end($this->provider->calls)['message'],true);self::assertSame('signed-in owner only',$input['verified_clinic_data']['requested_information']['access']);
   $this->provider->steps=[['operation'=>$op,'service'=>'none','matching_services'=>[]],'I’m Vetti, here to help with VHS clinic information.'];$r=app(PublicGeminiConversation::class)->reply($op==='identity'?'Who is Vetti?':'What can you do?',null,null);self::assertSame('ai',$r['source']);$input=json_decode(end($this->provider->calls)['message'],true);self::assertSame('public information only',$input['verified_clinic_data']['access']);
  }
 }
 public function test_public_entrypoint_explains_privacy_and_language_without_a_provider_call():void {
  $public=app(\App\Services\AI\PublicVettiService::class);
  foreach(['Show documents for customer Rowan and his pet named Cloud','my neighbours pet'] as $message){$r=$public->reply($message,true);self::assertSame('private',$r['intent']);self::assertStringContainsString('privacy',$r['text']);self::assertStringContainsString('another owner',$r['text']);}
  $r=$public->reply('こんにちは、元気ですか',true);self::assertSame('unsupported_language',$r['intent']);self::assertStringContainsString('English, Filipino, or Taglish',$r['text']);foreach($this->provider->calls as $call){self::assertStringNotContainsString('Vahn',$call['message']);self::assertStringNotContainsString('Luna',$call['message']);self::assertStringNotContainsString('Rowan',$call['message']);self::assertStringNotContainsString('Cloud',$call['message']);}
 }

}
