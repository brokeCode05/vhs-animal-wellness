<?php
namespace Tests\Feature\AI;
use App\Services\AI\{AiGateway,AiProviderInterface,PublicClinicDataResolver,PublicClinicFacts,PublicGeminiConversation};
use Tests\TestCase;
final class PublicClinicIdentityDoctorsTest extends TestCase {
 public function test_identity_and_public_doctor_directory_reach_model_and_do_not_assert_assignment(): void {
  config(['ai.enabled'=>true]);
  $facts=new class extends PublicClinicFacts {public function load():array {return ['available'=>true,'service_details'=>[],'public_doctors'=>[['name'=>'Dr Fictional','specialization'=>'General']]];}};
  foreach (['identity','doctors'] as $operation) {
   $provider=new class($operation) implements AiProviderInterface {
    public array $requests=[]; public function __construct(private string $operation){}
    public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
     $this->requests[]=[$instructions,$message];
     return ['text'=>$jsonSchema ? json_encode(['operation'=>$this->operation,'service'=>'none','matching_services'=>[]]) : ($this->operation==='identity' ? 'I am Vetti.' : 'The clinic lists Dr Fictional. Please contact the clinic to confirm who is available.'),'usage'=>[]];
    }
   };
   $response=(new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts)))->reply('Question',null,null);
   self::assertSame('ai',$response['source']); self::assertCount(2,$provider->requests);
   self::assertStringContainsString($operation==='identity' ? 'Vetti' : 'Dr Fictional',$provider->requests[1][1]);
   if ($operation==='doctors') self::assertStringContainsString('assigned_doctor',$provider->requests[1][1]);
  }
 }
 public function test_missing_directory_does_not_invent_a_doctor():void {
  $facts=new class extends PublicClinicFacts {public function load():array {return ['available'=>true,'service_details'=>[]];}};
  self::assertNull((new PublicClinicDataResolver($facts))->resolve(['type'=>'doctors'])['public_doctors']);
 }
 public function test_public_symptom_message_is_screened_before_provider():void {
  $message = 'Yung hamster ko nanginginig na siya for hours. May services ba kayo?';
  self::assertSame('medical', \App\Services\AI\PublicVettiSafetyGate::privateOrMedical($message));
  self::assertNull(\App\Services\AI\PublicVettiSafetyGate::providerMessage($message));
 }
 public function test_user_vetti_receives_verified_doctor_data_for_model_response():void {
  $user = new \App\Models\User;
  $user->setRawAttributes(['id'=>123,'name'=>'Owner','role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
  $this->actingAs($user)->withSession(['auth_version'=>1]);
  $this->withoutMiddleware(\App\Http\Middleware\RecordUserAccess::class);
  config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
  $this->mock(\App\Services\AI\UserVettiFacts::class)->shouldReceive('pets')->andReturn([]);
  $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn(['available'=>true,'service_details'=>[], 'public_doctors'=>[['name'=>'Dr Fictional','specialization'=>'General']]]);
  $provider = new class implements AiProviderInterface {
   public array $inputs=[];
   public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
    $this->inputs[]=$message;
    return ['text'=>$jsonSchema ? json_encode(['intent'=>'clinic_info','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,'public_operation'=>'doctors']) : 'The clinic lists Dr Fictional. Contact the clinic to check availability.', 'usage'=>[]];
   }
  };
  $this->app->instance(AiProviderInterface::class,$provider);
  $this->postJson('/api/ai/semantic-vetti',['message'=>'Who are the veterinarians?','conversation_id'=>'fictional_test_123'])->assertOk()->assertJsonPath('data.source','ai');
  self::assertStringContainsString('Dr Fictional',$provider->inputs[1]);
  self::assertStringContainsString('assigned_doctor',$provider->inputs[1]);
 }
}
