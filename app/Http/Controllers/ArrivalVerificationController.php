<?php
namespace App\Http\Controllers;
use App\Models\{User,Appointment};
use App\Services\{OtpService,AppointmentCheckIn};
use App\Support\{ApiResponse,Identity,ContactLookup};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{RateLimiter,Schema};
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/** Possession proof scoped to reception arrival only; never logs into the portal. */
final class ArrivalVerificationController extends Controller {
    use ApiResponse;
    public function __construct(private OtpService $otp,private AppointmentCheckIn $checkIn){}
    private function token(Request $r):string {
        $token=$r->session()->get('clinic_checkin_token');
        app(ClinicCheckInController::class)->validateToken($token);
        return hash_hmac('sha256',$token,config('app.key'));
    }
    private function channels():array {
        $mail=config('mail.default');$sms=config('vhs.twilio');
        return ['email'=>in_array($mail,['smtp','ses','postmark','resend','sendmail','mailgun'],true),
            'sms'=>config('vhs.sms_driver')==='twilio' && !empty($sms['sid']) && !empty($sms['token']) && (!empty($sms['from']) || !empty($sms['messaging_service_sid']))];
    }
    public function page(Request $r){
        return response()->view('arrival')->header('Cache-Control','no-store, private')->header('Referrer-Policy','no-referrer')->header('X-Content-Type-Options','nosniff');
    }
    private function contact(Request $r):array {
        $v=$r->validate(['channel'=>['required','in:email,sms'],'identifier'=>['required','string','max:254']]);
        $v['identifier']=Identity::identifier($v['identifier'],$v['channel']);
        validator($v,['identifier'=>$v['channel']==='email'?['required','email:rfc','max:254']:['required','regex:/\A\+639\d{9}\z/D']])->validate();
        return $v;
    }
    private function owner(Request $r):User {
        $binding=$this->token($r);$g=$r->session()->get('arrival_grant',[]);
        abort_unless(($g['qr']??null)===$binding && ($g['expires']??0)>now()->timestamp,403,'Verify a new check-in code to continue.');
        $u=User::find($g['owner']??0);
        abort_unless($u && $u->role==='User' && $u->mayLogin() && (int)$u->auth_version===(int)($g['version']??-1),403,'Check-in verification is no longer valid.');
        $current=Identity::identifier($g['channel']==='email'?$u->email:$u->phone,$g['channel']);
        abort_unless(hash_equals($g['identifier'],$current) && ($g['channel']==='email'?$u->email_verified_at:$u->phone_verified_at),403,'Contact changed. Verify a new code.');
        return $u;
    }
    private function eligible(User $u) {
        return Appointment::with(['pet','service'])->where('user_id',$u->id)->whereDate('appointment_date',today())->where('status','confirmed')->get()->filter(fn($a)=>$this->checkIn->eligible($a))->values();
    }
    private function present(Appointment $a):array {
        $a->loadMissing(['pet','service']);
        return ['id'=>$a->id,'referenceNo'=>$a->reference_no,'petName'=>$a->pet?->name,'service'=>$a->service_label_at_booking,'time'=>substr((string)$a->appointment_time,0,5),'status'=>$a->status];
    }
    public function options(Request $r){
        $this->token($r);$verified=false;
        try{$u=$this->owner($r);$verified=true;}catch(\Symfony\Component\HttpKernel\Exception\HttpException $e){if($e->getStatusCode()!==403)throw $e;}
        $pending=$r->session()->get('arrival_pending',[]);
        $resume=($pending['qr']??null)===$this->token($r) && ($pending['expires']??0)>now()->timestamp
            ? ['request_id'=>$pending['request_id'],'channel'=>$pending['channel']] : null;
        return $this->ok('Check-in options loaded.',['channels'=>$this->channels(),'verified'=>$verified,'pending'=>$resume,'resend_seconds'=>config('vhs.otp_resend_seconds')]);
    }
    public function requestCode(Request $r){
        $qr=$this->token($r);$v=$this->contact($r);
        abort_unless($this->channels()[$v['channel']],503,'This delivery option is unavailable. Choose another option or ask reception.');
        $limit='arrival:contact:'.hash_hmac('sha256',$v['channel'].':'.$v['identifier'],config('app.key'));
        foreach([$limit.':minute'=>[1,config('vhs.otp_resend_seconds')],$limit.':hour'=>[5,3600]] as $key=>$rule){
            abort_if(RateLimiter::tooManyAttempts($key,$rule[0]),429,'Please wait before requesting another code.');
        }
        RateLimiter::hit($limit.':minute',config('vhs.otp_resend_seconds'));RateLimiter::hit($limit.':hour',3600);
        $query=User::where('role','User')->where('status','active');
        if($v['channel']==='email')$query->where('email',$v['identifier'])->whereNotNull('email_verified_at');
        else {
            abort_unless(Schema::hasColumn('users','phone_lookup_hash'),503,'SMS check-in is not configured yet. Choose email or ask reception.');
            $query->where('phone_lookup_hash',ContactLookup::phoneHash($v['identifier']))->whereNotNull('phone_verified_at');
        }
        // Shared phone numbers are ambiguous; never choose an arbitrary account.
        $matches=$query->limit(2)->get(['id','auth_version']);$u=$matches->count()===1?$matches->first():null;
        $pending=$v+['qr'=>$qr,'request_id'=>bin2hex(random_bytes(16)),'expires'=>now()->addMinutes(config('vhs.otp_minutes'))->timestamp];
        $r->session()->forget(['arrival_pending','arrival_grant']);
        try { $this->otp->issue($r,$v['identifier'],$v['channel'],'clinic_checkin',$u?->id,$u!==null); }
        catch(\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            if($e->getStatusCode()!==503)throw $e;
            return response()->json(['success'=>false,'message'=>'Code delivery could not be confirmed. Wait a minute and try again, or ask reception.'],503);
        }
        $r->session()->put('arrival_pending',$pending);
        return $this->ok('If this is a verified contact on an eligible client account, a code has been sent.',['request_id'=>$pending['request_id'],'expires_in'=>config('vhs.otp_minutes')*60,'resend_seconds'=>config('vhs.otp_resend_seconds')]);
    }
    public function resend(Request $r){
        $qr=$this->token($r);$p=$r->session()->get('arrival_pending',[]);
        abort_unless(($p['qr']??null)===$qr,422,'Enter your registered contact to request a new code.');
        $r->merge(['channel'=>$p['channel'],'identifier'=>$p['identifier']]);
        return $this->requestCode($r);
    }
    public function verify(Request $r){
        $qr=$this->token($r);$v=$r->validate(['request_id'=>['required','string','size:32'],'code'=>['required','regex:/\A\d{6}\z/D']]);
        $p=$r->session()->get('arrival_pending',[]);
        abort_unless(($p['qr']??null)===$qr && hash_equals($p['request_id']??'',$v['request_id']),422,'Request a new check-in code in this browser.');
        $owner=$this->otp->consume($r,$p['identifier'],$p['channel'],'clinic_checkin',$v['code'],function($row)use($p){
            $u=User::whereKey($row->user_id)->lockForUpdate()->first();
            abort_unless($u && $u->role==='User' && $u->mayLogin(),422,'Request a new code or ask reception.');
            $current=Identity::identifier($p['channel']==='email'?$u->email:$u->phone,$p['channel']);
            abort_unless(hash_equals($p['identifier'],$current) && ($p['channel']==='email'?$u->email_verified_at:$u->phone_verified_at),422,'Contact changed. Request a new code.');
            return $u;
        });
        $r->session()->regenerate();
        $r->session()->put('arrival_grant',['owner'=>$owner->id,'version'=>$owner->auth_version,'qr'=>$qr,'identifier'=>$p['identifier'],'channel'=>$p['channel'],'expires'=>now()->addMinutes(5)->timestamp]);
        $r->session()->forget('arrival_pending');
        return $this->ok('Code verified.',['verified'=>true]);
    }
    public function appointments(Request $r){
        $u=$this->owner($r);$last=null;$id=$r->session()->get('arrival_last_checkin');
        if($id){$a=Appointment::whereKey($id)->where('user_id',$u->id)->whereDate('appointment_date',today())->first();if($a?->checked_in_at && in_array($a->status,['checked_in','in_consultation','completed'],true))$last=$this->present($a);}
        return $this->ok('Eligible visits loaded.',['appointments'=>$this->eligible($u)->map(fn($a)=>$this->present($a)),'last_checkin'=>$last]);
    }
    public function checkIn(Request $r,Appointment $appointment){
        $u=$this->owner($r);$a=$this->checkIn->checkIn($appointment->id,$u,'clinic_qr_otp');$r->session()->put('arrival_last_checkin',$a->id);
        return $this->ok('You are checked in.',['appointment'=>$this->present($a)]);
    }
}
