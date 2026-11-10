<?php
namespace Tests\Feature\AI;
use App\Models\{Appointment,Consultation,DoctorProfile,Pet,Service,User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
final class GroqAudioAuthorizationTest extends TestCase {
 use RefreshDatabase;
 public function test_audio_requires_clinical_approval_assigned_doctor_and_active_consultation(): void {
  config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.groq_scribe_transcription_enabled'=>true,'ai.groq_api_key'=>'fictional']);
  $u=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
  $dr=DoctorProfile::forceCreate(['user_id'=>$u->id,'display_name'=>'Doctor One','account_status'=>'active','availability_status'=>'on_duty']);
  $other=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
  DoctorProfile::forceCreate(['user_id'=>$other->id,'display_name'=>'Doctor Two','account_status'=>'active','availability_status'=>'on_duty']);
  $owner=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
  $pet=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Fictional','species'=>'Dog','gender'=>'Female']);
  $svc=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
  $appt=Appointment::forceCreate(['reference_no'=>'AUDIO-TEST-01','user_id'=>$owner->id,'pet_id'=>$pet->id,'assigned_vet_id'=>$dr->id,'service_id'=>$svc->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>now()->toDateString(),'appointment_time'=>'10:00:00','status'=>'in_consultation','created_via'=>'admin']);
  Http::fake(['api.groq.com/*'=>Http::response(['text'=>'fictional audio'],200)]);
  $audio=fn()=>UploadedFile::fake()->create('recording.webm',10,'audio/webm');
  config(['ai.groq_scribe_transcription_enabled'=>false]);
  $this->actingAs($u)->post('/api/ai/doctor-scribe-audio',['appointment_id'=>$appt->id,'audio'=>$audio()])->assertStatus(503);
  config(['ai.groq_scribe_transcription_enabled'=>true]);
  $this->actingAs($other)->post('/api/ai/doctor-scribe-audio',['appointment_id'=>$appt->id,'audio'=>$audio()])->assertForbidden();
  $this->actingAs($u)->post('/api/ai/doctor-scribe-audio',['appointment_id'=>$appt->id,'audio'=>$audio()])->assertStatus(422);
  Http::assertNothingSent();
  Consultation::forceCreate(['appointment_id'=>$appt->id,'pet_id'=>$pet->id,'veterinarian_id'=>$dr->id,'status'=>'in_consultation']);
  $this->actingAs($u)->post('/api/ai/doctor-scribe-audio',['appointment_id'=>$appt->id,'audio'=>$audio()])->assertOk()->assertJsonPath('data.transcript','fictional audio');
  Http::assertSentCount(1);
 }
}
