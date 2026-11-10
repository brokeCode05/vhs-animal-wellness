<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Services\AI\{AiProviderInterface,UserVettiFacts};
use Tests\TestCase;
final class SemanticPetAdditionTest extends TestCase {
 public function test_model_interprets_addition_and_server_never_creates_pet():void {
  $user=new User; $user->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($user)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([]);
  $provider=new class implements AiProviderInterface {
   public array $inputs=[];
   public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
    $this->inputs[]=$message;
    if ($jsonSchema) return ['text'=>json_encode(['intent'=>'pet_add','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'pet_form_requested'=>!str_contains($message,'tomorrow')]),'usage'=>[]];
    return ['text'=>'You can add a pet using the form here. No pet has been added.','usage'=>[]];
   }
  };
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'I want to add a pet tomorrow','conversation_id'=>'fictional_pet_123'])->assertOk()->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.open_form',false)->assertJsonPath('data.pet_created',false);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'Please add a pet now','conversation_id'=>'fictional_pet_123'])->assertOk()->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.open_form',true)->assertJsonPath('data.pet_created',false);
  self::assertStringContainsString('in_chat_form_available',$provider->inputs[1]);
 }
 public function test_model_interprets_protected_profile_references_without_database_writes():void {
  $user=new User;$user->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($user)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([]);
  $provider=new class implements AiProviderInterface {
   public array $calls=[];
   public function generate(string $i,string $m,?array $schema=null):array {
    $this->calls[]=$m;
    if(!$schema)return ['text'=>'Please review these details in the form before adding your pet.','usage'=>[]];
    preg_match('/Protected source values \(no original values\): (.+)/',$m,$hit);$refs=json_decode($hit[1]??'{}',true);$fields=[];
    foreach($refs as $ref=>$meta){$field=match($meta['field_hint']??null){'name'=>'name_ref','breed'=>'breed_ref','speciesCustom'=>'species_custom_ref','age'=>'age_ref','weightKg'=>'weight_ref',default=>null};if($field)$fields[$field]=$ref;if($field==='age_ref')$fields['age_unit']=$meta['unit'];if($field==='species_custom_ref')$fields['species']='Other';}
    if(preg_match('/\bfemale\b|babae/iu',$m))$fields['gender']='Female';elseif(preg_match('/\bmale\b/iu',$m))$fields['gender']='Male';
    if(preg_match('/\brabbit\b/iu',$m))$fields['species']='Rabbit';
    return ['text'=>json_encode(['intent'=>'pet_add','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'pet_form_requested'=>true,'registration_mode'=>'new','registration_fields'=>$fields]),'usage'=>[]];
   }
  };
  $this->app->instance(AiProviderInterface::class,$provider);
  foreach ([
   ["I want to add another pet\nName: Daboh\nBreed: Persian\nSex: Male\nAge: 8 months\nWeight: 2kg",['name'=>'Daboh','breed'=>'Persian','gender'=>'Male','age'=>8,'ageUnit'=>'months','weightKg'=>2]],
   ['Add another pet Name: Finch Breed: Unknown Species: Hamster Sex: Female Age: 3 months Weight: .35kg',['name'=>'Finch','species'=>'Other','speciesCustom'=>'Hamster','breed'=>'Unknown','gender'=>'Female','age'=>3,'ageUnit'=>'months','weightKg'=>0.35]],
   ['Please register a female rabbit called Snow Drop, 4 months old, weighs .75 kg',['name'=>'Snow Drop','species'=>'Rabbit','gender'=>'Female','age'=>4,'ageUnit'=>'months','weightKg'=>0.75]],
   ['Magdagdag ng pet Pangalan: Tala Lahi: Puspin Kasarian: Babae Edad: 2 buwan Timbang: .25 kg',['name'=>'Tala','breed'=>'Puspin','gender'=>'Female','age'=>2,'ageUnit'=>'months','weightKg'=>0.25]],
  ] as [$message,$expected]) {
   $res=$this->postJson('/api/ai/semantic-vetti',['message'=>$message,'conversation_id'=>'fictional_prefill_123'])->assertOk()->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.source','ai')->assertJsonPath('data.open_form',true)->assertJsonPath('data.pet_created',false);
   foreach($expected as $key=>$value)self::assertEquals($value,$res->json('data.pet_draft.'.$key),$key);
   self::assertArrayNotHasKey('owner_id',$res->json('data.pet_draft'));
  }
  self::assertCount(8,$provider->calls);$wire=implode(' ', $provider->calls);foreach(['Daboh','Finch','Snow Drop','Tala','.35','.75','.25'] as $private)self::assertStringNotContainsString($private,$wire);
 }

 public function test_names_that_look_like_species_or_sex_do_not_supply_unstated_fields():void {
  $privacy=new \App\Services\AI\VettiPetPrivacyEnvelope;$e=$privacy->protect('Add another pet Name: Female Dog Breed: Persian Age: 8 months Weight: .3kg');
  $draft=$privacy->resolve(['name_ref'=>'PRIVATE_VALUE_1','breed_ref'=>'PRIVATE_VALUE_2','species'=>'Dog','gender'=>'Female','age_ref'=>'PRIVATE_VALUE_3','age_unit'=>'months','weight_ref'=>'PRIVATE_VALUE_4'],$e);
  self::assertSame('Female Dog',$draft['changes']['name']);self::assertArrayNotHasKey('species',$draft['changes']);self::assertArrayNotHasKey('gender',$draft['changes']);self::assertSame(.3,$draft['changes']['weightKg']);
 }

 public function test_open_form_does_not_reset_existing_draft_if_model_says_new():void {
  $user=new User;$user->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($user)->withSession(['auth_version'=>1])->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([]);
  $key=hash('sha256','123|fictional_context_123');$this->withSession(['vetti.pet.registration'=>[$key=>['until'=>time()+600,'value'=>\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['name'=>'Birdie','species'=>'Cat','breed'=>'Persian','gender'=>'Male']))]]]);
  $provider=new class implements AiProviderInterface {public function generate(string $i,string $m,?array $schema=null):array { if(!$schema)return ['text'=>'Please review the details in the form.','usage'=>[]]; preg_match('/Protected source values \(no original values\): (.+)/',$m,$hit);$refs=json_decode($hit[1]??'{}',true);$fields=[];foreach($refs as $ref=>$meta){if(($meta['field_hint']??'')==='age'){$fields['age_ref']=$ref;$fields['age_unit']=$meta['unit'];}if(($meta['field_hint']??'')==='weightKg')$fields['weight_ref']=$ref;}return ['text'=>json_encode(['intent'=>'pet_add','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'pet_form_requested'=>true,'registration_mode'=>'new','registration_fields'=>$fields]),'usage'=>[]];}};
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'He is 3 months old and weighs 1 kg','conversation_id'=>'fictional_context_123','pet_form_open'=>true])->assertOk()->assertJsonPath('data.kind','pet_add')->assertJsonPath('data.replace_draft',false)->assertJsonPath('data.pet_created',false);
  $entries=session('vetti.pet.registration');$draft=json_decode(\Illuminate\Support\Facades\Crypt::decryptString($entries[$key]['value']),true);self::assertSame('Birdie',$draft['name']);self::assertSame('Persian',$draft['breed']);self::assertSame('Male',$draft['gender']);self::assertEquals(3,$draft['age']);self::assertEquals(1,$draft['weightKg']);
 }
}

