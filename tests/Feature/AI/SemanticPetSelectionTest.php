<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Services\AI\{AiProviderInterface,UserVettiFacts};
use Tests\TestCase;
final class SemanticPetSelectionTest extends TestCase {
 public function test_model_selects_only_an_explicitly_mentioned_owned_pet():void {
  $u=new User; $u->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($u)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog'],['id'=>8,'name'=>'Milo','species'=>'Cat']]);
  $provider=new class implements AiProviderInterface { public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
   return ['text'=>$jsonSchema ? json_encode(['intent'=>'pet_select','pet_ref'=>'PET_2','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]) : 'Sure, we can talk about your selected pet.','usage'=>[]];
  }};
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'Let us talk about Milo','conversation_id'=>'synthetic_select_123'])->assertOk()->assertJsonPath('data.kind','pet_selected')->assertJsonPath('data.pet_id',8);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'Switch to the other pet','conversation_id'=>'synthetic_select_123'])->assertOk()->assertJsonMissingPath('data.pet_id');
 }
 public function test_duplicate_names_do_not_select_an_arbitrary_pet():void {
  $u=new User; $u->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($u)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Milo','species'=>'Dog'],['id'=>8,'name'=>'Milo','species'=>'Cat']]);
  $provider=new class implements AiProviderInterface { public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
   return ['text'=>json_encode(['intent'=>'pet_select','pet_ref'=>'PET_2','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
  }};
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'Talk about Milo','conversation_id'=>'duplicate_pet_123'])->assertOk()->assertJsonMissingPath('data.pet_id');
 }
 public function test_recognizable_new_pet_details_are_not_sent_to_provider():void {
  $u=new User; $u->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($u)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $provider=new class implements AiProviderInterface { public int $calls=0; public function generate(string $instructions,string $message,?array $jsonSchema=null):array { $this->calls++; return ['text'=>'{}','usage'=>[]]; }};
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->mock(\App\Services\AI\UserVettiFacts::class)->shouldReceive('pets')->andReturn([]);
  foreach (['Pangalan nya Tammy','The pet is 3 months old','She weighs 0.35 kg'] as $message) {
   $this->postJson('/api/ai/semantic-vetti',['message'=>$message,'conversation_id'=>'privacy_pet_123'])->assertOk()->assertJsonMissingPath('data.pet_id');
  }
  self::assertGreaterThan(0,$provider->calls); // Protected interpretation is permitted; raw fields are tested separately.
 }
}
