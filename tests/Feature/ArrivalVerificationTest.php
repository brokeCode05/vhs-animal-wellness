<?php
namespace Tests\Feature;
use App\Models\{User,Pet,Service,DoctorProfile,Appointment,AppointmentEvent,AccountVerification};
use App\Services\{OtpDelivery,OtpService};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{URL,Auth,RateLimiter};
use Illuminate\Support\Carbon;
use Tests\TestCase;
class ArrivalVerificationTest extends TestCase {
    use RefreshDatabase;
    private User $owner;private Appointment $visit;private array $codes=[];private string $token;private bool $failDelivery=false;
    protected function setUp():void {
        parent::setUp();$this->travelTo(Carbon::parse('2026-11-10 10:00:00'));
        config(['mail.default'=>'smtp','vhs.sms_driver'=>'twilio','vhs.twilio'=>['sid'=>'fictional','token'=>'fictional','from'=>'+15005550006','messaging_service_sid'=>null]]);
        $delivery=\Mockery::mock(OtpDelivery::class);$delivery->shouldReceive('send')->andReturnUsing(function($channel,$identifier,$code,$context){
            if($this->failDelivery)throw new \RuntimeException('Fictional outage');$this->codes[]=['channel'=>$channel,'identifier'=>$identifier,'code'=>$code,'context'=>$context];
        });$this->app->instance(OtpDelivery::class,$delivery);
        $this->owner=User::factory()->create(['role'=>'User','email'=>'fictional-owner@example.test','phone'=>'+639170000001','phone_verified_at'=>now()]);
        $du=User::factory()->create(['role'=>'Doctor']);$d=DoctorProfile::forceCreate(['user_id'=>$du->id,'display_name'=>'Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        $pet=Pet::forceCreate(['owner_id'=>$this->owner->id,'name'=>'Fictional Pet','species'=>'Dog','gender'=>'Female']);$service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
        $this->visit=Appointment::forceCreate(['reference_no'=>'ARRIVAL-FICTIONAL-1','user_id'=>$this->owner->id,'pet_id'=>$pet->id,'assigned_vet_id'=>$d->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>today(),'appointment_time'=>'11:00:00','status'=>'confirmed','created_via'=>'admin','is_test'=>true]);
        $this->token=URL::temporarySignedRoute('clinic.checkin',now()->addMinutes(10),[],absolute:false);
        $this->get($this->token)->assertRedirect('/arrival');
    }
    private function requestCode(string $channel='email',?string $identifier=null){return $this->postJson('/api/arrival/request-code',['channel'=>$channel,'identifier'=>$identifier??($channel==='email'?$this->owner->email:'09170000001')]);}
    private function verify(?string $request=null,?string $code=null){return $this->postJson('/api/arrival/verify-code',['request_id'=>$request??session('arrival_pending.request_id'),'code'=>$code??end($this->codes)['code']]);}
    private function grant():void {$this->requestCode()->assertOk();$this->verify()->assertOk();}
    public function test_email_code_grants_only_arrival_and_one_owned_checkin_is_idempotent():void {
        $this->requestCode()->assertOk()->assertJsonMissingPath('data.code');self::assertSame('clinic_checkin',$this->codes[0]['context']);
        $this->verify()->assertOk();$this->assertGuest();
        $this->getJson('/api/appointments')->assertUnauthorized();$this->getJson('/api/arrival/appointments')->assertOk()->assertJsonCount(1,'data.appointments')->assertJsonMissingPath('data.appointments.0.owner');
        $this->postJson('/api/arrival/check-in/'.$this->visit->id,[])->assertOk()->assertJsonPath('data.appointment.status','checked_in');
        $this->postJson('/api/arrival/check-in/'.$this->visit->id,[])->assertOk();self::assertSame(1,AppointmentEvent::where('event_type','checked_in')->count());
        $this->getJson('/api/arrival/appointments')->assertOk()->assertJsonPath('data.last_checkin.id',$this->visit->id);
        $this->getJson('/api/arrival/options')->assertOk()->assertJsonPath('data.verified',true);
    }
    public function test_sms_normalizes_phone_and_never_returns_code_or_phone_hash():void {
        $this->requestCode('sms')->assertOk()->assertJsonMissingPath('data.code');self::assertSame('+639170000001',$this->codes[0]['identifier']);
        self::assertSame('sms',$this->codes[0]['channel']);$this->verify()->assertOk();$this->postJson('/api/arrival/check-in/'.$this->visit->id)->assertOk();
        self::assertArrayNotHasKey('phone_lookup_hash',$this->owner->fresh()->toArray());
    }
    public function test_relative_signed_qr_survives_https_proxy_scheme_and_rejects_tampering():void {
        $url='https://example-tunnel.test'.$this->token;$this->get($url)->assertRedirect('/arrival')->assertHeader('Location','/arrival');
        $this->get($this->token.'&extra=changed')->assertUnprocessable();
        $this->getJson('/api/arrival/options')->assertOk();
        $this->withSession(['clinic_checkin_token'=>'http://localhost/wrong-path?signature=x'])->getJson('/api/arrival/options')->assertUnprocessable();
    }
    public function test_unknown_and_duplicate_contacts_never_choose_or_message_an_owner():void {
        $this->requestCode('email','unknown@example.test')->assertOk();self::assertCount(0,$this->codes);self::assertNull(AccountVerification::latest('id')->first()->user_id);
        $this->verify(null,'000000')->assertUnprocessable();$this->getJson('/api/arrival/appointments')->assertForbidden();
        User::factory()->create(['role'=>'User','phone'=>$this->owner->phone,'phone_verified_at'=>now()]);
        $this->requestCode('sms')->assertOk();self::assertCount(0,$this->codes);
    }
    public function test_staff_inactive_and_unverified_contacts_do_not_receive_arrival_codes():void {
        $this->owner->forceFill(['role'=>'Admin'])->save();$this->requestCode()->assertOk();self::assertCount(0,$this->codes);
        $this->travel(61)->seconds();$this->owner->forceFill(['role'=>'User','status'=>'inactive'])->save();$this->requestCode()->assertOk();self::assertCount(0,$this->codes);
        $this->travel(61)->seconds();$this->owner->forceFill(['status'=>'active','email_verified_at'=>null,'phone_verified_at'=>null])->save();$this->requestCode()->assertOk();self::assertCount(0,$this->codes);
        $this->requestCode('sms')->assertOk();self::assertCount(0,$this->codes);
    }
    public function test_pending_code_entry_can_resume_and_resend_invalidates_old_code():void {
        $this->requestCode()->assertOk();$id=session('arrival_pending.request_id');$old=$this->codes[0]['code'];
        $this->getJson('/api/arrival/options')->assertOk()->assertJsonPath('data.pending.request_id',$id);
        $this->postJson('/api/arrival/resend-code')->assertStatus(429);$this->travel(61)->seconds();
        $this->postJson('/api/arrival/resend-code')->assertOk();$new=session('arrival_pending.request_id');self::assertNotSame($id,$new);
        $this->verify($id,$old)->assertUnprocessable();$this->verify($new,$this->codes[1]['code'])->assertOk();
        $this->verify($new,$this->codes[1]['code'])->assertUnprocessable();
    }
    public function test_code_is_bound_to_browser_and_attempts_are_limited():void {
        $this->requestCode()->assertOk();$p=session('arrival_pending');$code=$this->codes[0]['code'];
        $wrong=$code==='999999'?'888888':'999999';for($i=0;$i<5;$i++)$this->verify($p['request_id'],$wrong)->assertUnprocessable();
        $this->verify($p['request_id'],$code)->assertUnprocessable();self::assertSame(5,AccountVerification::latest('id')->first()->attempts);
    }
    public function test_a_code_from_another_browser_or_login_context_cannot_grant_arrival():void {
        $this->requestCode()->assertOk();$id=session('arrival_pending.request_id');$code=$this->codes[0]['code'];
        $this->withSession(['otp_binding'=>'different-browser-binding'])->verify($id,$code)->assertUnprocessable();
        $this->withSession(['otp_binding'=>'another-binding']);$r=\Illuminate\Http\Request::create('/');$r->setLaravelSession($this->app['session.store']);
        $loginCode=app(OtpService::class)->issue($r,$this->owner->email,'email','login',$this->owner->id);
        $this->verify($id,$loginCode)->assertUnprocessable();$this->assertGuest();
    }
    public function test_expired_code_grant_qr_and_changed_account_fail_closed():void {
        $this->requestCode()->assertOk();$code=$this->codes[0]['code'];$id=session('arrival_pending.request_id');$this->travel(301)->seconds();$this->verify($id,$code)->assertUnprocessable();
        $this->requestCode()->assertOk();$this->verify()->assertOk();$this->owner->forceFill(['auth_version'=>2])->save();
        $this->getJson('/api/arrival/appointments')->assertForbidden();
        $this->travel(301)->seconds();$this->getJson('/api/arrival/options')->assertUnprocessable();self::assertSame('confirmed',$this->visit->fresh()->status);
    }
    public function test_grant_expires_without_expanding_portal_permissions():void {
        $this->grant();$this->travel(301)->seconds();$this->getJson('/api/arrival/appointments')->assertForbidden();$this->getJson('/api/auth/me')->assertUnauthorized();
    }
    public function test_owner_or_contact_changes_after_code_issue_are_rechecked():void {
        $this->requestCode()->assertOk();$this->owner->forceFill(['email'=>'changed@example.test'])->save();$this->verify()->assertUnprocessable();
        $this->getJson('/api/arrival/appointments')->assertForbidden();
    }
    public function test_another_owners_visit_and_canceled_or_outside_window_are_rejected():void {
        $this->grant();$other=User::factory()->create();$this->visit->forceFill(['user_id'=>$other->id])->save();$this->postJson('/api/arrival/check-in/'.$this->visit->id)->assertForbidden();
        $this->visit->forceFill(['user_id'=>$this->owner->id,'appointment_time'=>'15:00:00'])->save();$this->postJson('/api/arrival/check-in/'.$this->visit->id)->assertUnprocessable();
        $this->visit->forceFill(['appointment_time'=>'11:00:00','status'=>'canceled'])->save();$this->postJson('/api/arrival/check-in/'.$this->visit->id)->assertUnprocessable();self::assertSame(0,AppointmentEvent::count());
    }
    public function test_multiple_visits_require_selection_without_auto_checking_every_visit():void {
        $a=$this->visit->replicate();$a->reference_no='ARRIVAL-FICTIONAL-2';$a->save();$this->grant();
        $this->getJson('/api/arrival/appointments')->assertOk()->assertJsonCount(2,'data.appointments');self::assertSame(0,AppointmentEvent::count());
        $this->postJson('/api/arrival/check-in/'.$a->id)->assertOk();self::assertSame('confirmed',$this->visit->fresh()->status);
    }
    public function test_unconfigured_delivery_and_provider_failure_never_claim_sent_or_verified():void {
        config(['vhs.sms_driver'=>'disabled']);$this->getJson('/api/arrival/options')->assertOk()->assertJsonPath('data.channels.sms',false);
        $this->requestCode('sms')->assertStatus(503);self::assertCount(0,$this->codes);
        $this->failDelivery=true;$this->requestCode()->assertStatus(503);self::assertNull(session('arrival_pending'));self::assertNotNull(AccountVerification::latest('id')->first()->consumed_at);
    }
    public function test_valid_user_session_keeps_fast_path_and_stale_session_uses_short_otp_page():void {
        $this->withSession(['auth_version'=>1])->actingAs($this->owner->fresh())->get($this->token)->assertRedirect('/user/?clinic-checkin=1')->assertHeader('Location','/user/?clinic-checkin=1');
        $this->withSession(['auth_version'=>0])->get($this->token)->assertRedirect('/arrival')->assertHeader('Location','/arrival');
    }
    public function test_plain_entry_csrf_and_rescanned_qr_do_not_reuse_a_grant():void {
        $this->grant();$this->get($this->token)->assertRedirect('/arrival');$this->getJson('/api/arrival/appointments')->assertForbidden();
        $this->withSession(['clinic_checkin_token'=>null])->requestCode()->assertUnprocessable();
        $this->app->instance('env','local');$this->postJson('/api/arrival/verify-code',[])->assertStatus(419);
    }
}
