<?php
namespace Tests\Feature\AI;
use App\Models\{Appointment,Consultation,DoctorProfile,Pet,Service,User};
use App\Services\AI\AiProviderInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
final class DoctorScribeExperimentalPortalTest extends TestCase
{
 use RefreshDatabase;
 public function test_authorized_experimental_proposal_remains_unsaved_and_keeps_vitals_manual():void {
  $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
  config(['ai.scribe_single_pass_enabled'=>false,'ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_semantic_summary_enabled'=>true,'ai.scribe_grounded_summary_enabled'=>true]);
  $doctorUser=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);$doctor=DoctorProfile::forceCreate(['user_id'=>$doctorUser->id,'display_name'=>'Test Doctor','account_status'=>'active','availability_status'=>'on_duty']);
  $owner=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);$pet=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Fictional','species'=>'Dog','gender'=>'Female']);$service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
  $appointment=Appointment::forceCreate(['reference_no'=>'SCRIBE-PILOT-01','user_id'=>$owner->id,'pet_id'=>$pet->id,'assigned_vet_id'=>$doctor->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>now()->toDateString(),'appointment_time'=>'10:00:00','status'=>'in_consultation','created_via'=>'admin']);Consultation::forceCreate(['appointment_id'=>$appointment->id,'pet_id'=>$pet->id,'veterinarian_id'=>$doctor->id,'status'=>'in_consultation']);
  $provider=new class implements AiProviderInterface {private int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$responses=[['segments'=>[['segment_id'=>1,'quotes'=>[['text'=>'Owner reports a cough.','category'=>'subjective']]]]],['subjective'=>'Owner reports a cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'],['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]],['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']];return ['text'=>json_encode($responses[$this->calls++]??[]),'usage'=>[]];}};
  $this->app->instance(AiProviderInterface::class,$provider);
  $other=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);DoctorProfile::forceCreate(['user_id'=>$other->id,'display_name'=>'Other Doctor','account_status'=>'active','availability_status'=>'on_duty']);
  $this->actingAs($other)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>'Owner reports a cough.','mode'=>'summary'])->assertForbidden();
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>'Call 0917 123 4567 please.','mode'=>'summary'])->assertStatus(422)->assertJsonPath('code','privacy_contact_detected');
  $r=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>'Owner reports a cough.','mode'=>'summary']);
  $r->assertOk()->assertJsonPath('data.saved',false)->assertJsonPath('data.consultation_completed',false)->assertJsonPath('data.summaryMethod','grounded')->assertJsonPath('data.soap.objective.weightKg',null)->assertJsonPath('data.claimLinks.0.references.0.text','Owner reports a cough.')->assertHeader('Cache-Control','no-store, private');
  $r->assertJsonPath('data.reviewItems',[]);
  $this->actingAs($doctorUser)->getJson('/api/ai/doctor-scribe-audio-limits')->assertOk()->assertJsonPath('data.draft_max_chars',8000);
  $long=str_repeat('Fictional history without identifying details. ',90);
  $failed=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$long,'mode'=>'summary'])->assertStatus(503)->assertJsonPath('code','experimental_incomplete')->assertHeader('Cache-Control','no-store, private');
  $token=$failed->json('data.retryToken');self::assertIsString($token);self::assertNotEmpty($failed->json('data.failedChunks'));self::assertStringNotContainsString('Fictional history',$token);
  $retry=['appointment_id'=>$appointment->id,'transcript'=>$long,'mode'=>'summary','retry_token'=>$token];
  $this->actingAs($other)->postJson('/api/ai/doctor-scribe',$retry)->assertForbidden();
  $changed=$retry;$changed['transcript'].=' changed';$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$changed)->assertStatus(422)->assertJsonPath('code','retry_expired');
  $tampered=$retry;$tampered['retry_token'].='changed';$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$tampered)->assertStatus(422)->assertJsonPath('code','retry_expired');
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$retry)->assertStatus(503)->assertJsonPath('code','experimental_incomplete');
  config(['ai.scribe_grounded_summary_enabled'=>false]);
  $this->actingAs($doctorUser)->getJson('/api/ai/doctor-scribe-audio-limits')->assertOk()->assertJsonPath('data.draft_max_chars',3500);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$long,'mode'=>'summary'])->assertStatus(422);
  config(['ai.scribe_summary_input_bytes'=>2500,'ai.scribe_max_input_bytes'=>4000]);
  // A complete source inventory larger than the section budget is not retryable
  // with the same input; it must not become an apparently complete draft.
  config(['ai.scribe_grounded_summary_enabled'=>true]);
  $oversized=''; for($i=0;$i<150;$i++) $oversized.='Fictional observation '.$i.' with no vomiting. ';
  $oversized=trim($oversized);
  $chunks=(new \App\Services\AI\ScribeTranscriptChunker())->plan($oversized,800)['chunks'];
  foreach($chunks as &$chunk) {
   $chunk['status']='complete';
   $chunk['segments']=[['id'=>1,'offset'=>$chunk['offset'],'text'=>$chunk['text'],'quotes'=>[['text'=>trim($chunk['text']),'category'=>'subjective']]]];
  } unset($chunk);
  $inventory=['ok'=>true,'complete'=>true,'transcript'=>$oversized,'chunks'=>$chunks];
  $oversizedToken=(new \App\Services\AI\ScribeRetryToken())->issue($doctor->id,$appointment->id,$oversized,$inventory);
  $noCalls=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++; return ['text'=>'{}','usage'=>[]];}};
  $this->app->instance(AiProviderInterface::class,$noCalls);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $tooLarge=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$oversized,'mode'=>'summary','retry_token'=>$oversizedToken]);
  $tooLarge->assertStatus(503)->assertJsonPath('code','experimental_incomplete')->assertJsonPath('data.summaryStage','source_too_large')->assertJsonPath('data.retryable',false)->assertJsonPath('data.retryToken',null);
  self::assertSame(0,$noCalls->calls);self::assertStringNotContainsString('Fictional observation',$tooLarge->getContent());
  // A separate retry token for a fully extracted fictional transcript exercises
  // recovery after summary failure without repeating extraction.
  config(['ai.scribe_grounded_summary_enabled'=>true]);
  $text='Owner reports a cough.';
  $manifest=['ok'=>true,'complete'=>true,'transcript'=>$text,'chunks'=>[['id'=>1,'offset'=>0,'length'=>strlen($text),'text'=>$text,'status'=>'complete','segments'=>[['id'=>1,'offset'=>0,'text'=>$text,'quotes'=>[['text'=>$text,'category'=>'subjective']]]]]]];
  $token=(new \App\Services\AI\ScribeRetryToken())->issue($doctor->id,$appointment->id,$text,$manifest);
  $limitedProvider=new class implements AiProviderInterface {public function generate(string $instructions,string $message,?array $jsonSchema=null):array {throw new \App\Services\AI\AiProviderException('rate_limit',429);}};
  $this->app->instance(AiProviderInterface::class,$limitedProvider);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $limited=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary','retry_token'=>$token]);
  $limited->assertStatus(503)->assertJsonPath('data.completedChunks',1)->assertJsonPath('data.totalChunks',1)->assertJsonPath('data.resumedChunks',1)->assertJsonPath('data.summaryFailure','rate_limit')->assertJsonPath('data.summaryStage','generation')->assertJsonPath('data.providerAttempts.0.provider','configured')->assertJsonPath('data.providerAttempts.0.category','rate_limit');
  self::assertIsString($limited->json('data.retryToken'));
  $answers=[['subjective'=>'Owner reports a cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'],['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]],['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']];
  $retryProvider=new class($answers) implements AiProviderInterface {public int $calls=0;public function __construct(private array $answers){} public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;return ['text'=>json_encode(array_shift($this->answers)??[]),'usage'=>[]];}};
  $this->app->instance(AiProviderInterface::class,$retryProvider);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary','retry_token'=>$token])->assertOk()->assertJsonPath('data.saved',false)->assertJsonPath('data.soap.objective.weightKg',null);
  self::assertSame(3,$retryProvider->calls);
  // A draft that invents content for an empty section must remain incomplete
  // and provide a useful status rather than a generic format message.
  $badSection=new class implements AiProviderInterface {public function generate(string $instructions,string $message,?array $schema=null):array {
   return ['text'=>json_encode(['subjective'=>'Owner reports a cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Unstated plan.']),'usage'=>[]];
  }};
  $this->app->instance(AiProviderInterface::class,$badSection);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary','retry_token'=>$token])
   ->assertStatus(503)->assertJsonPath('data.summaryStage','draft_section_mismatch')->assertJsonMissingPath('data.soap');
  $uncovered=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $schema=null):array {
   $this->calls++;$data=$this->calls===1 ? ['subjective'=>'Owner reports a cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'] : ['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[],'relevant'=>true,'covered'=>false]]];
   return ['text'=>json_encode($data),'usage'=>[]];
  }};
  $this->app->instance(AiProviderInterface::class,$uncovered);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary','retry_token'=>$token])
   ->assertStatus(503)->assertJsonPath('data.summaryStage','source_coverage')->assertJsonPath('data.reviewSources.0.text',$text)->assertJsonPath('data.reviewSources.0.section','subjective')->assertHeader('Cache-Control','no-store, private')->assertJsonMissingPath('data.soap');
  // A fixed source-check limit cannot be solved by retrying the same input.
  $many=trim(str_repeat('A. ',101));
  $manyManifest=['ok'=>true,'complete'=>true,'transcript'=>$many,'chunks'=>[['id'=>1,'offset'=>0,'length'=>strlen($many),'text'=>$many,'status'=>'complete','segments'=>[['id'=>1,'offset'=>0,'text'=>$many,'quotes'=>[['text'=>$many,'category'=>'subjective']]]]]]];
  $manyToken=(new \App\Services\AI\ScribeRetryToken())->issue($doctor->id,$appointment->id,$many,$manyManifest);
  $manyProvider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $schema=null):array {$this->calls++;return ['text'=>json_encode(['subjective'=>'Summary.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];}};
  $this->app->instance(AiProviderInterface::class,$manyProvider);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$many,'mode'=>'summary','retry_token'=>$manyToken])
   ->assertStatus(503)->assertJsonPath('data.summaryStage','source_too_large')->assertJsonPath('data.retryable',false)->assertJsonPath('data.retryToken',null)->assertJsonMissingPath('data.soap');
  self::assertSame(1,$manyProvider->calls);
  // A real endpoint round trip with a simulated outage in meaning review:
  // source inventory, draft, and source audit must survive the encrypted token.
  $stagedProvider=new class implements AiProviderInterface {
   public int $calls=0;
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $this->calls++;
    if($this->calls===1) $data=['subjective'=>'Owner reports a cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
    elseif($this->calls===2) $data=['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]];
    elseif($this->calls===3) throw new \App\Services\AI\AiProviderException('rate_limit',429);
    else $data=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
    return ['text'=>json_encode($data),'usage'=>[]];
   }
  };
  $this->app->instance(AiProviderInterface::class,$stagedProvider);$this->app->forgetInstance(\App\Services\AI\AiGateway::class);
  $first=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary','retry_token'=>$token]);
  $first->assertStatus(503)->assertJsonPath('data.summaryStage','meaning_check')->assertJsonPath('data.summaryFailure','rate_limit');
  $resumeToken=$first->json('data.retryToken');self::assertIsString($resumeToken);self::assertStringNotContainsString($text,$resumeToken);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary','retry_token'=>$resumeToken])->assertOk()->assertJsonPath('data.saved',false)->assertJsonPath('data.soap.subjective','Owner reports a cough.')->assertJsonPath('data.soap.objective.weightKg',null);
  self::assertSame(4,$stagedProvider->calls);
  $this->assertDatabaseHas('consultations',['appointment_id'=>$appointment->id,'status'=>'in_consultation']);
 }
}
