<?php
namespace Tests\Feature\AI;
use App\Models\{Appointment,Consultation,DoctorProfile,Pet,Service,User};
use App\Services\AI\AiProviderInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
final class ScribeSinglePassPortalTest extends TestCase
{
 use RefreshDatabase;
 public function test_fictional_full_transcript_requires_assigned_doctor_and_returns_review_only():void {
  $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
  config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
  $doctorUser=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);$doctor=DoctorProfile::forceCreate(['user_id'=>$doctorUser->id,'display_name'=>'Doctor','account_status'=>'active','availability_status'=>'on_duty']);
  $other=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);DoctorProfile::forceCreate(['user_id'=>$other->id,'display_name'=>'Other','account_status'=>'active','availability_status'=>'on_duty']);
  $owner=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);$pet=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Fictional','species'=>'Dog','gender'=>'Female']);$service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
  $appointment=Appointment::forceCreate(['reference_no'=>'SCRIBE-SINGLE-01','user_id'=>$owner->id,'pet_id'=>$pet->id,'assigned_vet_id'=>$doctor->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>now()->toDateString(),'appointment_time'=>'10:00:00','status'=>'in_consultation','created_via'=>'admin']);$consult=Consultation::forceCreate(['appointment_id'=>$appointment->id,'pet_id'=>$pet->id,'veterinarian_id'=>$doctor->id,'status'=>'in_consultation']);
  $provider=new \Tests\Support\ScribePipelineFixture();
  $this->app->instance(AiProviderInterface::class,$provider);
  $text=substr(str_repeat('Fictional owner reports coughing and no vomiting. ',650),0,29999).'X';$payload=['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>'summary'];
  $this->actingAs($other)->postJson('/api/ai/doctor-scribe',$payload)->assertForbidden();self::assertSame(0,$provider->calls);
  $r=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$payload);
  $r->assertOk()->assertJsonPath('data.summaryMethod','single_pass')->assertJsonPath('data.summaryLanguage','english')->assertJsonPath('data.providerMeta.backupUsed',false)->assertJsonPath('data.saved',false)->assertJsonPath('data.consultation_completed',false)->assertJsonPath('data.soap.objective.weightKg',null)->assertJsonPath('data.claimLinks.0.status','needs_review')->assertHeader('Cache-Control','no-store, private');
  self::assertSame(2,$provider->calls);self::assertSame($text,implode('',array_column($provider->requests[0]['payload']['passages'],'text')));self::assertNotEmpty($r->json('data.unlinkedSources'));self::assertNotEmpty($r->json('data.sourceViews.subjective.0.runs'));self::assertSame('in_consultation',$consult->fresh()->status);
  self::assertStringContainsString('Write the SOAP sections in clear professional English',$provider->requests[count($provider->requests)-2]['instructions']);
  $this->actingAs($other)->postJson('/api/ai/doctor-scribe',$payload)->assertForbidden();self::assertSame(2,$provider->calls);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$payload)->assertOk()->assertJsonPath('data.reused',true);self::assertSame(2,$provider->calls);
  $payload['draft_language']='source';
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$payload)->assertOk()->assertJsonPath('data.summaryLanguage','source');
  self::assertStringContainsString('Taglish for Taglish',$provider->requests[count($provider->requests)-2]['instructions']);self::assertSame(4,$provider->calls);
  $payload['draft_language']='invalid';
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$payload)->assertUnprocessable();self::assertSame(4,$provider->calls);
  unset($payload['draft_language']);
  $this->actingAs($doctorUser)->getJson('/api/ai/doctor-scribe-audio-limits')->assertOk()->assertJsonPath('data.draft_max_chars',30000);
  config(['ai.scribe_independent_review_enabled'=>true,'ai.groq_scribe_backup_enabled'=>false]);
  $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$payload)->assertStatus(503)->assertJsonPath('code','clinical_blocked');self::assertSame(4,$provider->calls);
 }
}
