<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Services\AppointmentCheckIn;
use App\Support\{ApiResponse, VhsPresenter};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;

final class ClinicCheckInController extends Controller
{
    use ApiResponse;

    public function validateToken(?string $token): void
    {
        $valid = is_string($token) && parse_url($token, PHP_URL_PATH) === '/clinic-check-in'
            && (URL::hasValidSignature(Request::create($token)) || URL::hasValidRelativeSignature(Request::create($token)));
        abort_unless($valid, 422, 'This reception QR is invalid or expired. Please scan the current QR at reception.');
    }

    public function issue(Request $r)
    {
        $expires = now()->addMinutes(10);
        return $this->ok('Reception QR ready.', ['relative_url'=>URL::temporarySignedRoute('clinic.checkin',$expires,[],absolute:false), 'url' => URL::temporarySignedRoute('clinic.checkin', $expires), 'expires_at' => $expires->toIso8601String(), 'refresh_after_seconds' => 300])
            ->header('Cache-Control', 'no-store');
    }

    public function enter(Request $r)
    {
        $token = $r->fullUrl();
        $this->validateToken($token);
        // The token stays in the HTTP-only session through sign-in; it is not sent to AI.
        $r->session()->put('clinic_checkin_token', $token);
        $r->session()->forget(['arrival_pending','arrival_grant']);
        // A relative Location preserves HTTPS at the public tunnel even when
        // the local origin sees HTTP. Never downgrade the browser's scheme.
        $u=$r->user();
        $signedIn=$u && $u->role==='User' && $u->mayLogin() && $u->isVerified()
            && (int)$r->session()->get('auth_version')===(int)$u->auth_version;
        $target=$signedIn ? '/user/?clinic-checkin=1' : '/arrival';
        return new \Illuminate\Http\RedirectResponse($target,302,['Referrer-Policy'=>'no-referrer','Cache-Control'=>'private, no-store']);
    }

    public function appointments(Request $r, AppointmentCheckIn $checkIn)
    {
        $this->validateToken($r->session()->get('clinic_checkin_token'));
        $appointments = Appointment::with(['pet', 'service', 'user', 'veterinarian.user'])
            ->where('user_id', $r->user()->id)->whereDate('appointment_date', today())->where('status', 'confirmed')->get()
            ->filter(fn ($a) => $checkIn->eligible($a))->map(fn ($a) => VhsPresenter::appointment($a))->values();
        return $this->ok('Eligible appointments loaded.', ['appointments' => $appointments])->header('Cache-Control', 'no-store');
    }

    public function store(Request $r, Appointment $appointment, AppointmentCheckIn $checkIn)
    {
        $this->validateToken($r->session()->get('clinic_checkin_token'));
        $a = $checkIn->checkIn($appointment->id, $r->user(), 'clinic_qr');
        return $this->ok('You are checked in.', ['appointment' => VhsPresenter::appointment($a->load(['pet', 'service', 'user', 'veterinarian.user']))])->header('Cache-Control', 'no-store');
    }
}
