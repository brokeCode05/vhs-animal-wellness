<?php
namespace Tests\Feature;

use App\Models\{User, Pet, DoctorProfile, Service, Appointment, AppointmentEvent};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{URL, DB, Http, Mail};
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SystemAuditRepairsTest extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void
    {
        parent::setUp();
        if (DB::connection()->getDriverName() !== 'sqlite' || config('database.connections.sqlite.database') !== ':memory:') throw new \RuntimeException('Isolated database required');
        Http::preventStrayRequests(); Mail::fake();
        $this->travelTo(Carbon::parse('2026-11-10 10:00:00'));
    }
    private function fixture(): array
    {
        $owner = User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $admin = User::factory()->create(['role'=>'Admin','status'=>'active','email_verified_at'=>now()]);
        $du = User::factory()->create(['role'=>'Doctor','status'=>'active','email_verified_at'=>now()]);
        $doctor = DoctorProfile::forceCreate(['user_id'=>$du->id,'display_name'=>'Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        $pet = Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Fictional Pet','species'=>'Dog','gender'=>'Female']);
        $service = Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
        $appt = Appointment::forceCreate(['reference_no'=>'AUDIT-QR-1','user_id'=>$owner->id,'pet_id'=>$pet->id,'assigned_vet_id'=>$doctor->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>today(),'appointment_time'=>'10:00:00','status'=>'confirmed','created_via'=>'admin']);
        return compact('owner','admin','du','doctor','pet','service','appt');
    }
    private function login(User $u): void { $u->refresh(); $this->actingAs($u)->withSession(['auth_version'=>$u->auth_version]); }
    private function token(int $expires = 600): string { return URL::temporarySignedRoute('clinic.checkin',now()->addSeconds($expires)); }

    public function test_authenticated_legacy_writes_reject_missing_csrf(): void
    {
        $f=$this->fixture(); $this->login($f['owner']); $this->app->instance('env','local');
        foreach (['php_files/update_profile.php','php_files/book-appointment.php','php_files/update_appointment_status.php','php_files/reschedule_appointment.php','api/pets/save_pet.php','api/pets/delete_pet.php','api/appointments/request_otp.php','api/appointments/verify_otp.php','api/auth/logout'] as $path) $this->postJson('/'.$path,[])->assertStatus(419);
        $this->withSession(['_token'=>'fictional-csrf'])->withHeader('X-CSRF-TOKEN','fictional-csrf')->postJson('/php_files/update_profile.php',['address'=>'Fictional address'])->assertOk();
        self::assertSame('Fictional address',$f['owner']->fresh()->address);
    }
    public function test_doctor_pet_listing_excludes_unassigned_sibling_pet(): void
    {
        $f=$this->fixture(); $other=Pet::forceCreate(['owner_id'=>$f['owner']->id,'name'=>'Unassigned','species'=>'Cat','gender'=>'Female']); $this->login($f['du']);
        $ids=array_column($this->getJson('/php_files/get_pets.php')->assertOk()->json(),'id');
        self::assertContains($f['pet']->id,$ids); self::assertNotContains($other->id,$ids);
    }
    public function test_qr_issue_requires_admin_and_rejects_anonymous(): void
    {
        $this->getJson('/api/check-in/qr')->assertUnauthorized(); $f=$this->fixture(); $this->login($f['owner']); $this->getJson('/api/check-in/qr')->assertForbidden();
        $this->login($f['admin']); $response=$this->getJson('/api/check-in/qr')->assertOk();
        self::assertTrue(URL::hasValidSignature(\Illuminate\Http\Request::create($response->json('data.url'))));
        self::assertLessThan(220,strlen($response->json('data.url')));
        $response->assertHeader('Cache-Control','no-store, private');
    }
    public function test_scan_survives_login_and_persists_only_owners_checkin(): void
    {
        $f=$this->fixture(); $token=$this->token();
        $this->get($token)->assertRedirect('/arrival')->assertSessionHas('clinic_checkin_token',$token);
        $this->login($f['owner']); $this->getJson('/api/check-in/appointments')->assertOk()->assertJsonPath('data.appointments.0.id',$f['appt']->id);
        $this->postJson('/api/check-in/'.$f['appt']->id,[])->assertOk()->assertJsonPath('data.appointment.status','checked_in');
        self::assertSame('checked_in',$f['appt']->fresh()->status); self::assertNotNull($f['appt']->fresh()->checked_in_at);
        self::assertSame($f['doctor']->id,$f['appt']->fresh()->assigned_vet_id);
        $this->postJson('/api/check-in/'.$f['appt']->id,[])->assertOk();
        self::assertSame(1,AppointmentEvent::where('appointment_id',$f['appt']->id)->where('event_type','checked_in')->count());
        Mail::assertNothingSent(); Http::assertNothingSent();
    }
    public function test_qr_rejects_expiry_tampering_and_direct_entry(): void
    {
        $f=$this->fixture(); $this->login($f['owner']);
        $this->getJson('/api/check-in/appointments')->assertUnprocessable();
        $this->withSession(['clinic_checkin_token'=>'tampered'])->postJson('/api/check-in/'.$f['appt']->id)->assertUnprocessable();
        $this->withSession(['clinic_checkin_token'=>$this->token(-1)])->postJson('/api/check-in/'.$f['appt']->id)->assertUnprocessable();
        self::assertSame('confirmed',$f['appt']->fresh()->status);
    }
    public function test_qr_does_not_authorize_another_owner_or_plain_status_patch(): void
    {
        $f=$this->fixture(); $other=User::factory()->create(['role'=>'User','status'=>'active']); $this->login($other);
        $this->withSession(['clinic_checkin_token'=>$this->token()])->getJson('/api/check-in/appointments')->assertOk()->assertJsonCount(0,'data.appointments');
        $this->postJson('/api/check-in/'.$f['appt']->id)->assertForbidden();
        $this->login($f['owner']); $this->patchJson('/api/appointments/'.$f['appt']->id.'/status',['status'=>'checked_in'])->assertForbidden();
    }
    public function test_qr_respects_date_window_and_terminal_status(): void
    {
        $f=$this->fixture(); $this->login($f['owner']); $this->withSession(['clinic_checkin_token'=>$this->token()]);
        $f['appt']->forceFill(['appointment_time'=>'15:00:00'])->save(); $this->postJson('/api/check-in/'.$f['appt']->id)->assertUnprocessable();
        $f['appt']->forceFill(['appointment_time'=>'10:00:00','appointment_date'=>today()->addDay()])->save(); $this->postJson('/api/check-in/'.$f['appt']->id)->assertUnprocessable();
        $f['appt']->forceFill(['appointment_date'=>today(),'status'=>'canceled'])->save(); $this->postJson('/api/check-in/'.$f['appt']->id)->assertUnprocessable();
    }
    public function test_manual_reception_uses_same_transactional_checkin(): void
    {
        $f=$this->fixture();$this->login($f['admin']);
        $this->patchJson('/api/appointments/'.$f['appt']->id.'/status',['status'=>'checked_in'])->assertOk();
        self::assertSame(1,AppointmentEvent::where('event_type','checked_in')->count());
        self::assertSame($f['doctor']->id,$f['appt']->fresh()->assigned_vet_id);
    }
    public function test_clinical_revision_conflict_keeps_first_save_and_children(): void
    {
        $f=$this->fixture();$f['appt']->forceFill(['status'=>'in_consultation'])->save();$this->login($f['du']);
        $c=\App\Models\Consultation::forceCreate(['appointment_id'=>$f['appt']->id,'pet_id'=>$f['pet']->id,'veterinarian_id'=>$f['doctor']->id,'status'=>'in_consultation']);
        $url='/api/consultations/'.$c->id;
        $this->patchJson($url,['soap'=>['objective'=>'Missing revision']])->assertUnprocessable();
        $this->patchJson($url,['expected_revision'=>0,'soap'=>['objective'=>'Fictional first examination'],'prescriptions'=>[['medicine'=>'Fictional prescribed item']]])->assertOk()->assertJsonPath('data.consultation.revision',1);
        $this->patchJson($url,['expected_revision'=>0,'soap'=>['objective'=>'Stale overwrite'],'prescriptions'=>[]])->assertConflict();
        self::assertSame('Fictional first examination',$c->fresh()->soap_objective);self::assertSame(1,$c->prescriptions()->count());
        $this->postJson($url.'/complete',['expected_revision'=>1])->assertUnprocessable();
        $this->postJson($url.'/complete',['expected_revision'=>0,'reviewed'=>true])->assertConflict();
        $this->postJson($url.'/complete',['expected_revision'=>1,'reviewed'=>true])->assertOk();
        self::assertSame('completed',$f['appt']->fresh()->status);
        $this->patchJson($url,['expected_revision'=>2,'soap'=>['objective'=>'After completion']])->assertUnprocessable();
    }
    public function test_empty_completion_and_status_shortcut_cannot_finalize_clinical_visit(): void
    {
        $f=$this->fixture();$f['appt']->forceFill(['status'=>'in_consultation'])->save();$this->login($f['du']);
        $c=\App\Models\Consultation::forceCreate(['appointment_id'=>$f['appt']->id,'pet_id'=>$f['pet']->id,'veterinarian_id'=>$f['doctor']->id,'status'=>'in_consultation']);
        $this->postJson('/api/consultations/'.$c->id.'/complete',['reviewed'=>true,'expected_revision'=>0])->assertUnprocessable();
        $this->patchJson('/api/appointments/'.$f['appt']->id.'/status',['status'=>'completed'])->assertForbidden();
        self::assertSame('in_consultation',$c->fresh()->status);self::assertSame(0,\App\Models\Document::count());
    }
    public function test_profile_photo_persists_privately_and_is_owner_scoped(): void
    {
        \Illuminate\Support\Facades\Storage::fake('local');
        $f=$this->fixture();$this->login($f['owner']);
        $file=\Illuminate\Http\UploadedFile::fake()->createWithContent('avatar.png',base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='));
        $this->post('/php_files/update_profile.php',['profile_photo'=>$file])->assertOk()->assertJsonPath('photo','/api/users/'.$f['owner']->id.'/photo');
        $path=$f['owner']->fresh()->photo_path;self::assertNotEmpty($path);\Illuminate\Support\Facades\Storage::disk('local')->assertExists($path);
        $this->get('/api/users/'.$f['owner']->id.'/photo')->assertOk()->assertHeader('X-Content-Type-Options','nosniff');
        $this->login($f['owner']);
        $this->getJson('/api/auth/me')->assertJsonPath('data.user.photo','/api/users/'.$f['owner']->id.'/photo');
        $other=User::factory()->create(['role'=>'User','status'=>'active']);$this->login($other);$this->get('/api/users/'.$f['owner']->id.'/photo')->assertForbidden();
        $this->login($f['owner']);$this->post('/php_files/update_profile.php',['remove_photo'=>1])->assertOk()->assertJsonPath('photo','');
        self::assertNull($f['owner']->fresh()->photo_path);\Illuminate\Support\Facades\Storage::disk('local')->assertMissing($path);
    }
    public function test_public_host_cannot_use_disabled_sms_development_bypass(): void
    {
        config(['vhs.sms_driver'=>'disabled','vhs.expose_dev_otp'=>true]);$this->app->instance('env','local');
        $response=$this->postJson('https://fictional-clinic.example/php_files/sms_otp.php',['phone2'=>'09170000000']);
        self::assertNotEquals(200,$response->status());self::assertNull($response->json('dev_otp'));Mail::assertNothingSent();Http::assertNothingSent();
    }

    public function test_unconfigured_retention_does_not_delete_source_and_approved_policy_does(): void
    {
        $f=$this->fixture();$c=\App\Models\Consultation::forceCreate(['appointment_id'=>$f['appt']->id,'pet_id'=>$f['pet']->id,'veterinarian_id'=>$f['doctor']->id,'status'=>'in_consultation']);
        $draft=\App\Models\ConsultationWorkingDraft::forceCreate(['consultation_id'=>$c->id,'veterinarian_id'=>$f['doctor']->id,'revision'=>1,'payload'=>['scribe'=>['transcript'=>'Fictional old transcript']], 'transcript_updated_at'=>now()->subDays(400)]);
        config(['vhs.scribe_transcript_retention_days'=>null]);self::assertSame(0,app(\App\Services\ScribeTranscriptRetention::class)->purge());
        self::assertSame('Fictional old transcript',$draft->fresh()->payload['scribe']['transcript']);
        config(['vhs.scribe_transcript_retention_days'=>30]);self::assertSame(1,app(\App\Services\ScribeTranscriptRetention::class)->purge());
        self::assertArrayNotHasKey('transcript',$draft->fresh()->payload['scribe']);
    }
    public function test_operational_health_is_admin_only_and_reports_scheduler_heartbeat(): void
    {
        $f=$this->fixture();$this->login($f['owner']);$this->getJson('/api/operations/health')->assertForbidden();
        $this->login($f['admin']);$this->getJson('/api/operations/health')->assertOk()->assertJsonPath('data.scheduler_reporting',false);
        \Illuminate\Support\Facades\Cache::forever('vhs:scheduler:last_no_show_run',now()->toIso8601String());
        $this->getJson('/api/operations/health')->assertOk()->assertJsonPath('data.scheduler_reporting',true);
        $this->travel(4)->minutes();$this->getJson('/api/operations/health')->assertOk()->assertJsonPath('data.scheduler_reporting',false);
    }

    public function test_authenticated_private_data_is_not_http_cached(): void
    {
        $f=$this->fixture();$this->login($f['owner']);
        foreach (['/api/auth/me','/api/appointments','/api/users/me/pets','/php_files/get_pets.php'] as $url) {
            $this->getJson($url)->assertOk()->assertHeader('Cache-Control','no-store, private')->assertHeader('X-Content-Type-Options','nosniff');
        }
    }

    public function test_clinical_revision_survives_autosave_and_reload_without_adopting_newer_record(): void
    {
        $f=$this->fixture();$f['appt']->forceFill(['status'=>'in_consultation'])->save();$this->login($f['du']);
        $c=\App\Models\Consultation::forceCreate(['appointment_id'=>$f['appt']->id,'pet_id'=>$f['pet']->id,'veterinarian_id'=>$f['doctor']->id,'status'=>'in_consultation']);
        $url='/api/consultations/'.$c->id;
        $this->putJson($url.'/working-draft',['revision'=>0,'draft'=>['clinicalRevision'=>0,'fields'=>['exam'=>'Fictional unsaved changes']]])->assertOk();
        $this->patchJson($url,['expected_revision'=>0,'soap'=>['objective'=>'A newer fictional clinic examination']])->assertOk();
        $this->getJson($url.'/working-draft')->assertOk()->assertJsonPath('data.draft.clinicalRevision',0)->assertJsonPath('data.draft.fields.exam','Fictional unsaved changes');
        $this->patchJson($url,['expected_revision'=>0,'soap'=>['objective'=>'Fictional stale recovered draft']])->assertConflict();
        self::assertSame('A newer fictional clinic examination',$c->fresh()->soap_objective);
    }

}
