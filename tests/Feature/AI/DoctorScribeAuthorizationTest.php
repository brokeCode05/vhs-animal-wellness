<?php
namespace Tests\Feature\AI;

use App\Models\Appointment;
use App\Models\Consultation;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class DoctorScribeAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_assigned_doctor_with_active_consultation_can_generate_unsaved_draft(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $doctorUser=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
        $doctor=DoctorProfile::forceCreate(['user_id'=>$doctorUser->id,'display_name'=>'Doctor One','account_status'=>'active','availability_status'=>'on_duty']);
        $otherUser=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
        DoctorProfile::forceCreate(['user_id'=>$otherUser->id,'display_name'=>'Doctor Two','account_status'=>'active','availability_status'=>'on_duty']);
        $owner=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $pet=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Fictional','species'=>'Dog','gender'=>'Female']);
        $service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
        $appointment=Appointment::forceCreate(['reference_no'=>'SCRIBE-TEST-01','user_id'=>$owner->id,'pet_id'=>$pet->id,
            'assigned_vet_id'=>$doctor->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation',
            'price_at_booking'=>100,'appointment_date'=>now()->toDateString(),'appointment_time'=>'10:00:00',
            'status'=>'in_consultation','created_via'=>'admin']);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls++;
                return ['text'=>json_encode(['subjective'=>'Owner reports a cough.',
                    'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],
                    'assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $body=['appointment_id'=>$appointment->id,'transcript'=>'Owner reports a cough.'];
        $this->actingAs($otherUser)->postJson('/api/ai/doctor-scribe',$body)->assertForbidden();
        $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$body)->assertStatus(422);
        self::assertSame(0,$provider->calls);
        Consultation::forceCreate(['appointment_id'=>$appointment->id,'pet_id'=>$pet->id,'veterinarian_id'=>$doctor->id,'status'=>'in_consultation']);
        $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',$body)->assertOk()
            ->assertJsonPath('data.saved',false)->assertJsonPath('data.consultation_completed',false);
        self::assertSame(1,$provider->calls);
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        // Both external text operations must block common contact details
        // before reaching the provider; the response never echoes the value.
        foreach (['draft','summary','punctuation'] as $mode) {
            foreach (['Please call 0917 123 4567 for an update.', 'Please email test@example.com for an update.'] as $text) {
                $response=$this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$text,'mode'=>$mode]);
                $response->assertStatus(422)->assertJsonPath('code','privacy_contact_detected')->assertHeader('Cache-Control','no-store, private');
                self::assertStringNotContainsString($text,$response->getContent());
            }
        }
        self::assertSame(1,$provider->calls);
        $this->assertDatabaseHas('consultations',['appointment_id'=>$appointment->id,'status'=>'in_consultation']);
        $punctuationProvider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++; return ['text'=>$message,'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$punctuationProvider);
        $this->app->forgetInstance(\App\Services\AI\AiGateway::class);
        $long=trim(str_repeat('Fictional history with no vomiting. ',300));
        $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$long,'mode'=>'punctuation'])
            ->assertOk()->assertJsonPath('data.suggestion',$long)->assertJsonPath('data.saved',false)->assertHeader('Cache-Control','no-store, private');
        self::assertGreaterThan(1,$punctuationProvider->calls);
        $calls=$punctuationProvider->calls;
        $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$long.' test@example.com','mode'=>'punctuation'])
            ->assertStatus(422)->assertJsonPath('code','privacy_contact_detected');
        self::assertSame($calls,$punctuationProvider->calls);
        $this->actingAs($otherUser)->postJson('/api/ai/doctor-scribe',['appointment_id'=>$appointment->id,'transcript'=>$long,'mode'=>'punctuation'])->assertForbidden();
        self::assertSame($calls,$punctuationProvider->calls);
        // A valid five-minute synthetic silent WAV, never sent to a real provider.
        config(['ai.groq_scribe_transcription_enabled'=>true,'ai.groq_api_key'=>'fictional']);
        $pcm=str_repeat("\0",8000*2*300);
        $wav='RIFF'.pack('V',36+strlen($pcm)).'WAVEfmt '.pack('VvvVVvv',16,1,1,8000,16000,2,16).'data'.pack('V',strlen($pcm)).$pcm;
        $audio=\Illuminate\Http\UploadedFile::fake()->createWithContent('fictional-five-minute.wav',$wav);
        $upload=['appointment_id'=>$appointment->id,'audio'=>$audio];
        \Illuminate\Support\Facades\Http::fake(['api.groq.com/*'=>\Illuminate\Support\Facades\Http::response(['text'=>'Owner reports a fictional cough.'],200)]);
        $this->actingAs($owner)->getJson('/api/ai/doctor-scribe-audio-limits')->assertForbidden();
        $this->actingAs($doctorUser)->getJson('/api/ai/doctor-scribe-audio-limits')->assertOk()->assertHeader('Cache-Control','no-store, private')->assertJsonStructure(['data'=>['max_audio_bytes']])->assertJsonPath('data.transcript_max_chars',30000);
        $this->actingAs($owner)->postJson('/api/ai/doctor-scribe-audio',$upload)->assertForbidden();
        $this->actingAs($otherUser)->postJson('/api/ai/doctor-scribe-audio',$upload)->assertForbidden();
        \Illuminate\Support\Facades\Http::assertNothingSent();
        $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe-audio',[
            'appointment_id'=>$appointment->id,'audio'=>\Illuminate\Http\UploadedFile::fake()->create('oversized.wav',10241,'audio/wav')
        ])->assertStatus(422);
        \Illuminate\Support\Facades\Http::assertNothingSent();
        $this->actingAs($doctorUser)->postJson('/api/ai/doctor-scribe-audio',$upload)->assertOk()
            ->assertJsonPath('data.transcript','Owner reports a fictional cough.')
            ->assertHeader('Cache-Control','no-store, private');
        \Illuminate\Support\Facades\Http::assertSentCount(1);
        config(['ai.clinical_clearance'=>false]);
        $this->postJson('/api/ai/doctor-scribe-audio',$upload)->assertStatus(503);
        config(['ai.clinical_clearance'=>true]);
        $appointment->forceFill(['status'=>'completed'])->save();
        $this->postJson('/api/ai/doctor-scribe-audio',$upload)->assertStatus(422);
        \Illuminate\Support\Facades\Http::assertSentCount(1);
        $this->assertDatabaseHas('consultations',['appointment_id'=>$appointment->id,'status'=>'in_consultation']);

    }
}
