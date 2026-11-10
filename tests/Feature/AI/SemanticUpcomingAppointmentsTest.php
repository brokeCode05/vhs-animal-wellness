<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Services\AI\{AiProviderInterface,UserVettiFacts};
use Tests\TestCase;
final class SemanticUpcomingAppointmentsTest extends TestCase {
 public function test_owner_scoped_appointments_are_returned_without_sending_private_details_to_provider():void {
  $user=new User; $user->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($user)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $facts=$this->mock(UserVettiFacts::class); $facts->shouldReceive('pets')->andReturn([]);
  $facts->shouldReceive('upcoming')->once()->withArgs(fn($u)=>$u->id===123)->andReturn([['pet_id'=>2,'pet_name'=>'Fictional','service'=>'Consultation','date'=>'2026-12-15','time'=>'15:00','status'=>'confirmed']]);
  $provider=new class implements AiProviderInterface { public array $messages=[]; public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
   $this->messages[]=$message; return ['text'=>$jsonSchema ? json_encode(['intent'=>'upcoming_appointments','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Here are your upcoming appointments.','usage'=>[]]; }};
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'Show my upcoming appointments','conversation_id'=>'upcoming_test_123'])->assertOk()->assertJsonPath('data.kind','upcoming_appointments')->assertJsonPath('data.appointments.0.pet_name','Fictional');
  self::assertStringNotContainsString('Fictional',implode(' ',$provider->messages)); self::assertStringNotContainsString('2026-12-15',implode(' ',$provider->messages));
 }
 public function test_pet_followups_retain_topic_and_query_only_that_owned_pet():void {
  $user=new User; $user->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($user)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $facts=$this->mock(UserVettiFacts::class);
  $facts->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog'],['id'=>8,'name'=>'Milo','species'=>'Cat']]);
  $facts->shouldReceive('upcoming')->once()->withArgs(fn($u)=>$u->id===123)->andReturn([]);
  $facts->shouldReceive('upcoming')->once()->withArgs(fn($u,$id)=>$u->id===123 && $id===7)->andReturn([]);
  $facts->shouldReceive('upcoming')->once()->withArgs(fn($u,$id)=>$u->id===123 && $id===8)->andReturn([]);
  $provider=new class implements AiProviderInterface {public array $messages=[];public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
   $this->messages[]=$message;
   if (!$jsonSchema) return ['text'=>'No upcoming appointments were found.','usage'=>[]];
   $pet=str_contains($message,'PET_1')?'PET_1':(str_contains($message,'PET_2')?'PET_2':'none');
   return ['text'=>json_encode(['intent'=>'upcoming_appointments','pet_ref'=>$pet,'service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
  }};
  $this->app->instance(AiProviderInterface::class,$provider);
  foreach (['Show all upcoming appointments','How about Luna?','Or Milo?'] as $message)
   $this->postJson('/api/ai/semantic-vetti',['message'=>$message,'conversation_id'=>'followup_test_123'])->assertOk()->assertJsonPath('data.kind','upcoming_appointments');
  self::assertStringContainsString('Most recent response topic: upcoming appointments',$provider->messages[1]);
  self::assertStringContainsString('Most recent response topic: upcoming appointments',$provider->messages[2]);
  self::assertStringNotContainsString('Luna',implode(' ',$provider->messages));
 }
}
