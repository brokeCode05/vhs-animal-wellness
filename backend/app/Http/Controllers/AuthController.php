<?php

namespace App\Http\Controllers;

use App\Http\Requests\RegisterRequest;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\UserConsent;
use App\Services\OtpService;
use App\Support\Identity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private OtpService $otp) {}

    private function ok(string $message, mixed $data = null, int $status = 200)
    {
        return response()->json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    private function establish(Request $r, User $u): void
    {
        Auth::login($u);
        $r->session()->regenerate();
        $r->session()->put('auth_version', $u->auth_version);
    }

    private function checkChannel(Request $r): array
    {
        $v = $r->validate(['channel' => ['required', 'in:email,sms'], 'identifier' => ['required', 'string', 'max:254']]);
        $v['identifier'] = Identity::identifier($v['identifier'], $v['channel']);
        validator($v, ['identifier' => $v['channel'] === 'email' ? ['required', 'email:rfc', 'max:254'] : ['required', 'regex:/^\+639\d{9}$/D']])->validate();

        return $v;
    }

    private function audit(User $u, string $action, string $description): void
    {
        $log = new AuditLog;
        $log->forceFill(['actor_type' => $u->role, 'actor_id' => $u->id, 'actor_name' => $u->name, 'action' => $action, 'entity_type' => 'user', 'entity_id' => $u->id, 'description' => $description])->save();
    }

    public function register(RegisterRequest $r)
    {
        $v = $r->validated();
        abort_if(User::where('email', $v['email'])->exists(), 409, 'Email is already registered.');
        $create = function () use ($v) {
            $u = new User;
            $u->forceFill(collect($v)->only(['first_name', 'middle_name', 'last_name', 'email', 'phone', 'birthdate', 'address', 'password'])->all());
            $u->role = 'User';
            $u->status = 'active';
            $u->name = $u->first_name.' '.$u->last_name;
            if ($v['verification_method'] === 'sms') {
                $u->phone_verified_at = now();
            }
            $u->save();
            $this->audit($u, 'user_created', 'Owner registered.');
            $consent = new UserConsent;
            $consent->forceFill(['user_id' => $u->id, 'consent_type' => 'terms', 'document_version' => config('vhs.terms_version'), 'accepted_at' => now()])->save();

            return $u;
        };
        if ($v['verification_method'] === 'sms') {
            $u = $this->otp->consume($r, $v['phone'], 'sms', 'registration', $v['otp_code'], fn ($row) => $row->user_id === null ? $create() : abort(422, 'Request a signup code first.'));
        } else {
            $u = DB::transaction($create);
            $this->otp->issue($r, $u->email, 'email', 'registration', $u->id);
        }

        return $this->ok($v['verification_method'] === 'sms' ? 'Account verified. You can log in.' : 'Account created. Enter the email code to verify it.', ['user' => $u->identity(), 'requires_verification' => $v['verification_method'] === 'email'], 201);
    }

    public function resend(Request $r)
    {
        $v = $this->checkChannel($r);
        $r->validate(['context' => ['required', 'in:registration,login']]);
        $context = $r->string('context')->toString();
        if ($context === 'login') {
            $pending = $r->session()->get('pending_login');
            abort_unless($pending && $pending['expires'] > time() && $pending['identifier'] === $v['identifier'] && $pending['channel'] === $v['channel'], 422, 'Start login again.');
            $u = User::find($pending['id']);
            abort_unless($u?->mayLogin(), 422, 'Start login again.');
            $this->otp->issue($r, $v['identifier'], $v['channel'], 'login', $u->id);
        } elseif ($v['channel'] === 'sms') {
            // Before registration, SMS verifies possession only; it never selects an existing account by shared phone.
            $this->otp->issue($r, $v['identifier'], 'sms', 'registration');
        } else {
            $u = User::where('email', $v['identifier'])->first();
            if ($u && ! $u->email_verified_at && $u->mayLogin()) {
                $this->otp->issue($r, $u->email, 'email', 'registration', $u->id);
            }
        }

        return $this->ok('If eligible, a code has been sent. Wait 60 seconds before requesting another.');
    }

    public function verify(Request $r)
    {
        $v = $this->checkChannel($r);
        $r->validate(['context' => ['required', 'in:registration,login'], 'code' => ['required', 'regex:/^\d{6}$/D']]);
        $context = $r->string('context')->toString();
        $u = $this->otp->consume($r, $v['identifier'], $v['channel'], $context, $r->input('code'), function ($row) use ($r, $context, $v) {
            abort_unless($row->user_id, 422, 'Submit the SMS code with your signup form.');
            $u = User::whereKey($row->user_id)->lockForUpdate()->first();
            abort_unless($u?->mayLogin(), 403, 'Account unavailable.');
            abort_unless(($v['channel'] === 'email' ? $u->email : $u->phone) === $v['identifier'], 422, 'Contact changed. Request a new code.');
            if ($context === 'login') {
                $pending = $r->session()->get('pending_login');
                abort_unless($pending && $pending['expires'] > time() && $pending['id'] === $u->id && $pending['version'] === $u->auth_version && $u->isVerified(), 422, 'Start login again.');
            } else {
                $field = $v['channel'] === 'email' ? 'email_verified_at' : 'phone_verified_at';
                $u->$field = now();
                $u->save();
                $this->audit($u, 'account_verified', ucfirst($v['channel']).' account verification completed.');
            }

            return $u;
        });
        if ($context === 'login') {
            $this->establish($r, $u);
            $r->session()->forget('pending_login');
            $this->audit($u, 'login', $u->name.' logged in.');
        }

        return $this->ok($context === 'login' ? 'Logged in.' : 'Account verified. You can log in.', ['user' => $u->identity()]);
    }

    public function login(Request $r)
    {
        $rawIdentifier = trim((string) ($r->input('identifier') ?: $r->input('email')));
        $v = $r->validate([
            'password' => ['required', 'string', 'max:72'],
            'channel' => ['sometimes', 'in:email,sms'],
        ]);

        abort_if($rawIdentifier === '' || mb_strlen($rawIdentifier) > 254, 422, 'Email/Employee ID is required.');

        $isEmail = filter_var($rawIdentifier, FILTER_VALIDATE_EMAIL) !== false;
        $identifier = $isEmail
            ? Identity::email($rawIdentifier)
            : Identity::employeeId($rawIdentifier);

        $key = 'login:'.hash_hmac('sha256', $identifier, config('app.key'));
        abort_if(RateLimiter::tooManyAttempts($key, 5), 429, 'Too many login attempts. Try again in 15 minutes.');
        RateLimiter::hit($key, 900);

        if ($isEmail) {
            $u = User::with('doctorProfile')->where('email', $identifier)->first();
        } elseif (Identity::isEmployeeId($identifier)) {
            $u = User::with('doctorProfile')
                ->whereIn('role', ['Admin', 'Doctor'])
                ->where('employee_id', $identifier)
                ->first();
        } else {
            $u = null;
        }

        $hash = $u?->password ?? '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        if (! Hash::check($v['password'], $hash) || ! $u || ! $u->mayLogin()) {
            throw ValidationException::withMessages(['identifier' => ['Invalid credentials or unavailable account.']]);
        }
        abort_unless($u->isVerified(), 403, 'Verify your account before logging in.');
        RateLimiter::clear($key);
        if (config('vhs.login_otp')) {
            $channel = $v['channel'] ?? ($u->email_verified_at ? 'email' : 'sms');
            abort_unless($channel === 'email' ? $u->email_verified_at : $u->phone_verified_at, 422, 'Choose a verified contact channel.');
            $identifier = $channel === 'email' ? $u->email : $u->phone;
            $r->session()->put('pending_login', ['id' => $u->id, 'version' => $u->auth_version, 'identifier' => $identifier, 'channel' => $channel, 'expires' => time() + 600]);
            $this->otp->issue($r, $identifier, $channel, 'login', $u->id);

            return $this->ok('Enter the login code.', ['otp_required' => true, 'identifier' => $identifier, 'channel' => $channel, 'context' => 'login']);
        }
        $this->establish($r, $u);
        $this->audit($u, 'login', $u->name.' logged in.');

        return $this->ok('Logged in.', ['user' => $u->identity()]);
    }

    public function me(Request $r)
    {
        return $this->ok('Current account.', ['user' => $r->user()->identity()]);
    }

    public function logout(Request $r)
    {
        $u = $r->user();

        if ($u) {
            $this->audit($u, 'logout', $u->name.' logged out.');
        }

        Auth::logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return $this->ok('Logged out.');
    }

    public function requestReset(Request $r)
    {
        $r->merge(['email' => Identity::email($r->input('email'))]);
        $v = $r->validate(['email' => ['required', 'email:rfc', 'max:254']]);
        $u = User::where('email', $v['email'])->first();
        if ($u?->mayLogin()) {
            $this->otp->issue($r, $u->email, 'email', 'password_reset', $u->id);
        }

        return $this->ok('If eligible, a password setup/reset code has been sent to that email.');
    }

    public function confirmReset(Request $r)
    {
        $r->merge(['email' => Identity::email($r->input('email'))]);
        $v = $r->validate(['email' => ['required', 'email:rfc', 'max:254'], 'code' => ['required', 'regex:/^\d{6}$/D'], 'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed', function ($a, $v, $fail) {
            if (strlen($v) > 72) {
                $fail('Password must not exceed 72 bytes.');
            }
        }]]);
        $this->otp->consume($r, $v['email'], 'email', 'password_reset', $v['code'], function ($row) use ($v) {
            $u = User::whereKey($row->user_id)->lockForUpdate()->first();
            abort_unless($u?->mayLogin() && $u->email === $v['email'], 422, 'Account unavailable.');
            $u->password = $v['password'];
            $u->email_verified_at ??= now();
            $u->auth_version++;
            $u->save();
            $this->audit($u,'password_reset','Password setup/reset completed.');
        });
        Auth::logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return $this->ok('Password saved. Log in with the new password.');
    }
}
