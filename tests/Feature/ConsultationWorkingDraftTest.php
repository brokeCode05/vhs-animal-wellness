<?php
namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Consultation;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class ConsultationWorkingDraftTest extends TestCase
{
    use RefreshDatabase;

    public function test_working_draft_is_encrypted_doctor_scoped_and_revision_protected(): void
    {
        config(['vhs.scribe_transcript_retention_days'=>30]);
        $doctorUser=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
        $doctor=DoctorProfile::forceCreate(['user_id'=>$doctorUser->id,'display_name'=>'Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        $otherUser=User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
        DoctorProfile::forceCreate(['user_id'=>$otherUser->id,'display_name'=>'Other Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        $owner=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $pet=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Fictional','species'=>'Dog','gender'=>'Female']);
        $service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
        $appointment=Appointment::forceCreate(['reference_no'=>'DRAFT-TEST-01','user_id'=>$owner->id,'pet_id'=>$pet->id,
            'assigned_vet_id'=>$doctor->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,
            'appointment_date'=>now()->toDateString(),'appointment_time'=>'10:00:00','status'=>'in_consultation','created_via'=>'admin']);
        $consultation=Consultation::forceCreate(['appointment_id'=>$appointment->id,'pet_id'=>$pet->id,'veterinarian_id'=>$doctor->id,'status'=>'in_consultation']);
        $url='/api/consultations/'.$consultation->id.'/working-draft';
        $longTranscript=str_repeat('Fictional transcript ',1500);
        $longTranscript=substr($longTranscript,0,30000);
        self::assertSame(30000,strlen($longTranscript));
        $draft=['fields'=>['subjective'=>'Fictional sensitive note'],'scribe'=>['transcript'=>$longTranscript,'transcriptAtGenerate'=>$longTranscript,'soap'=>['plan'=>'Review']]];
        $this->getJson($url)->assertUnauthorized();
        $this->actingAs($otherUser)->getJson($url)->assertForbidden();
        $this->actingAs($otherUser)->putJson($url,['revision'=>0,'draft'=>$draft])->assertForbidden();
        $this->actingAs($doctorUser)->getJson($url)->assertOk()->assertJsonPath('data.revision',0)->assertHeader('Cache-Control','no-store, private');
        $this->putJson($url,['revision'=>0,'draft'=>$draft])->assertOk()->assertJsonPath('data.revision',1);
        $raw=DB::table('consultation_working_drafts')->where('consultation_id',$consultation->id)->value('payload');
        self::assertStringNotContainsString('Fictional transcript',$raw);
        $this->getJson($url)->assertOk()->assertJsonPath('data.draft.scribe.transcript',$longTranscript);
        $this->putJson($url,['revision'=>0,'draft'=>$draft])->assertStatus(409);
        $this->putJson($url,['revision'=>1,'draft'=>$draft])->assertOk()->assertJsonPath('data.revision',2);
        // Regenerating a draft must not refresh the transcript retention clock.
        DB::table('consultation_working_drafts')->where('consultation_id',$consultation->id)->update(['transcript_updated_at'=>now()->subDays(31)]);
        $draft['scribe']['transcriptAtGenerate']='Another fictional generated snapshot';
        $this->putJson($url,['revision'=>2,'draft'=>$draft])->assertOk()->assertJsonPath('data.revision',3);
        self::assertTrue(\Carbon\Carbon::parse(DB::table('consultation_working_drafts')->where('consultation_id',$consultation->id)->value('transcript_updated_at'))->lessThan(now()->subDays(30)));
        $consultation->status='completed'; $consultation->save();
        $this->putJson($url,['revision'=>3,'draft'=>$draft])->assertStatus(422);
        $this->assertDatabaseHas('consultation_working_drafts',['consultation_id'=>$consultation->id,'revision'=>3]);
        DB::table('consultation_working_drafts')->where('consultation_id',$consultation->id)->update(['transcript_updated_at'=>now()]);
        self::assertSame(0, app(\App\Services\ScribeTranscriptRetention::class)->purge());
        DB::table('consultation_working_drafts')->where('consultation_id',$consultation->id)->update(['updated_at'=>now(), 'transcript_updated_at'=>now()->subDays(31)]);
        self::assertSame(1, app(\App\Services\ScribeTranscriptRetention::class)->purge());
        $stored=\App\Models\ConsultationWorkingDraft::where('consultation_id',$consultation->id)->firstOrFail();
        self::assertArrayNotHasKey('transcript',$stored->payload['scribe']);
        self::assertArrayNotHasKey('transcriptAtGenerate',$stored->payload['scribe']);
        self::assertSame('Fictional sensitive note',$stored->payload['fields']['subjective']);
        self::assertSame('Review',$stored->payload['scribe']['soap']['plan']);
        self::assertSame(4,$stored->revision);
        $this->assertDatabaseHas('consultations',['id'=>$consultation->id,'status'=>'completed']);
        self::assertSame(0, app(\App\Services\ScribeTranscriptRetention::class)->purge());
    }
}
