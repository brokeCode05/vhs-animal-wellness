<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\UserConsent;
use App\Services\OtpService;
use App\Support\AuditWriter;
use App\Support\Identity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

class LegacyAuthController extends Controller
{
    public function __construct(private OtpService $otp) {}

    private function json(array $data, int $status = 200)
    {
        return response()->json($data, $status);
    }

    private function loginPayload(User $u): array
    {
        return [
            'status' => 'Login successful',
            'id' => $u->id,
            'first_name' => $u->first_name,
            'middle_name' => $u->middle_name ?? '',
            'last_name' => $u->last_name,
            'email' => $u->email,
            'employee_id' => $u->employee_id ?? '',
            'employeeId' => $u->employee_id ?? '',
            'phone' => $u->phone ?? '',
            'address' => $u->address ?? '',
            'role' => strtolower($u->role),
            'phone_verified' => $u->phone_verified_at ? 1 : 0,
        ];
    }

    private function establish(Request $r, User $u): void
    {
        Auth::login($u);
        $r->session()->regenerate();
        $r->session()->put('auth_version', (int) $u->auth_version);
    }

    public function sendSignupSms(Request $r)
    {
        $phone = Identity::phone($r->input('phone2'));
        $v = validator(['phone' => $phone], ['phone' => ['required', 'regex:/^\+639\d{9}$/D']]);
        if ($v->fails()) {
            return $this->json(['status' => 'error', 'message' => 'Enter a valid Philippine mobile number.'], 422);
        }

        try {
            $code = $this->otp->issue($r, $phone, 'sms', 'registration');
            $out = ['status' => 'success', 'message' => 'Verification code sent.'];
            if (! app()->isProduction() && config('vhs.expose_dev_otp')) {
                $out['dev_otp'] = $code;
                $out['note'] = config('vhs.sms_driver') === 'twilio' ? 'development code exposure enabled' : 'development SMS bypass';
            }
            return $this->json($out);
        } catch (\Throwable $e) {
            return $this->json(['status' => 'error', 'message' => $e->getMessage() ?: 'Unable to send code.'], 422);
        }
    }

    public function register(Request $r)
    {
        $method = strtolower(trim((string) $r->input('verificationMethod', 'email')));
        $phone = Identity::phone($r->input('phone2'));
        $email = Identity::email($r->input('email3'));

        $data = [
            'first_name' => trim((string) $r->input('firstName2')),
            'middle_name' => trim((string) $r->input('middleName2')),
            'last_name' => trim((string) $r->input('lastName2')),
            'phone' => $phone,
            'email' => $email,
            'address' => trim((string) $r->input('address')),
            'birthdate' => trim((string) $r->input('dob')),
            'password' => (string) $r->input('password2'),
            'password_confirmation' => (string) $r->input('confirmPassword'),
            'method' => $method,
            'otp' => trim((string) $r->input('otpCode')),
            'terms' => $r->input('agreeTerms'),
        ];

        $validator = validator($data, [
            'first_name' => ['required', 'string', 'max:50', "regex:/^[\pL\pM.'’\- ]+$/u"],
            'middle_name' => ['nullable', 'string', 'max:50', "regex:/^[\pL\pM.'’\- ]*$/u"],
            'last_name' => ['required', 'string', 'max:50', "regex:/^[\pL\pM.'’\- ]+$/u"],
            'phone' => ['required', 'regex:/^\+639\d{9}$/D'],
            'email' => ['required', 'email:rfc', 'max:254'],
            'address' => ['required', 'string', 'max:250'],
            'birthdate' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01', 'before_or_equal:'.now()->subYears(18)->format('Y-m-d')],
            'password' => ['required', 'string', 'min:8', 'max:72', 'confirmed', 'regex:/\d/', 'regex:/[!@#$%^&*(),.?":{}|<>]/'],
            'method' => ['required', 'in:email,sms'],
            'otp' => [$method === 'sms' ? 'required' : 'nullable', 'regex:/^\d{6}$/D'],
        ], [
            'birthdate.before_or_equal' => 'You must be at least 18 years old to create an account.',
            'password.regex' => 'Password must include a number and a special character.',
        ]);
        if ($validator->fails()) {
            return $this->json(['status' => $validator->errors()->first()], 422);
        }
        if (User::where('email', $email)->exists()) {
            return $this->json(['status' => 'This email address is already registered.'], 409);
        }

        $create = function () use ($data, $method) {
            return DB::transaction(function () use ($data, $method) {
                $u = new User;
                $u->forceFill([
                    'role' => 'User', 'status' => 'active',
                    'first_name' => $data['first_name'], 'middle_name' => $data['middle_name'] ?: null,
                    'last_name' => $data['last_name'], 'name' => trim($data['first_name'].' '.$data['last_name']),
                    'email' => $data['email'], 'phone' => $data['phone'], 'address' => $data['address'],
                    'birthdate' => $data['birthdate'], 'password' => $data['password'],
                    'phone_verified_at' => $method === 'sms' ? now() : null,
                ])->save();
                $consent = new UserConsent;
                $consent->forceFill(['user_id' => $u->id, 'consent_type' => 'terms', 'document_version' => config('vhs.terms_version'), 'accepted_at' => now()])->save();
                AuditWriter::write($u, 'user_created', 'user', $u->id, 'Owner registered.');
                return $u;
            });
        };

        try {
            if ($method === 'sms') {
                $u = $this->otp->consume($r, $phone, 'sms', 'registration', $data['otp'], fn ($row) => $row->user_id === null ? $create() : abort(422, 'Request a signup code first.'));
                return $this->json(['status' => 'Success_SMS']);
            }

            $verifyUrl = null;
            $u = DB::transaction(function () use ($create, &$verifyUrl) {
                $u = $create();
                $verifyUrl = URL::temporarySignedRoute('legacy.verify.email', now()->addHours(24), ['user' => $u->id]);
                Mail::html(
                    '<p>Hi <strong>'.e($u->first_name).'</strong>,</p><p>Thank you for registering with VHS Animal Wellness Center.</p><p><a href="'.e($verifyUrl).'">Verify My Email</a></p><p>This verification link expires in 24 hours.</p>',
                    fn ($m) => $m->to($u->email)->subject('Verify Your Email — VHS Animal Wellness Center')
                );
                return $u;
            });
            $out = ['status' => 'Success'];
            if (! app()->isProduction() && config('vhs.expose_dev_otp')) $out['dev_verify_url'] = $verifyUrl;
            return $this->json($out, 201);
        } catch (ValidationException $e) {
            return $this->json(['status' => $e->errors()['code'][0] ?? $e->getMessage()], 422);
        } catch (\Throwable $e) {
            return $this->json(['status' => app()->isProduction() ? 'Registration failed. Please try again.' : $e->getMessage()], 422);
        }
    }

    public function verifyEmail(Request $r, User $user)
    {
        if (! $r->hasValidSignature()) {
            return response()->view('legacy-verify', ['ok' => false, 'message' => 'This verification link is invalid or has expired.'], 403);
        }
        if (! $user->email_verified_at) {
            $user->email_verified_at = now();
            $user->save();
            AuditWriter::write($user, 'account_verified', 'user', $user->id, 'Email address verified.');
        }
        return response()->view('legacy-verify', ['ok' => true, 'message' => 'Your email has been verified. You can now log in.']);
    }

    public function login(Request $r)
    {
        if ($r->filled('login_otp')) {
            return $this->verifyLoginOtp($r);
        }


        $captchaToken = trim((string) $r->input('g-recaptcha-response'));
        if ($captchaToken === '') {
            return $this->json(['status' => 'Please complete the CAPTCHA verification.'], 422);
        }

        $captchaSecret = trim((string) config('services.recaptcha.secret_key'));
        if ($captchaSecret === '') {
            return $this->json(['status' => 'CAPTCHA is not configured on the server.'], 503);
        }

        try {
            $captchaResult = Http::asForm()
                ->timeout(8)
                ->post('https://www.google.com/recaptcha/api/siteverify', [
                    'secret' => $captchaSecret,
                    'response' => $captchaToken,
                    'remoteip' => $r->ip(),
                ]);
        } catch (\Throwable $e) {
            return $this->json(['status' => 'CAPTCHA verification service is unavailable. Please try again.'], 503);
        }

        if (! $captchaResult->successful() || $captchaResult->json('success') !== true) {
            return $this->json(['status' => 'CAPTCHA verification failed. Please try again.'], 422);
        }

        $rawIdentifier = trim((string) $r->input('email2'));
        $password = (string) $r->input('password1');

        if ($rawIdentifier === '' || $password === '') {
            return $this->json(['status' => 'Email/Employee ID and password are required.'], 422);
        }

        $isEmail = filter_var($rawIdentifier, FILTER_VALIDATE_EMAIL) !== false;
        $identifier = $isEmail
            ? Identity::email($rawIdentifier)
            : Identity::employeeId($rawIdentifier);

        $key = 'legacy-login:'.hash_hmac('sha256', $identifier, config('app.key'));
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return $this->json(['status' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }
        RateLimiter::hit($key, 900);

        if ($isEmail) {
            // Owner/User login remains email based. Existing staff email login is
            // retained as a compatibility fallback, while the UI now directs
            // clinic staff to use their Employee ID.
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
        if (! Hash::check($password, $hash) || ! $u || ! $u->mayLogin()) {
            return $this->json(['status' => 'Invalid email/employee ID or password.'], 422);
        }
        if (! $u->isVerified()) {
            return $this->json(['status' => 'email_not_verified', 'email' => $u->email], 403);
        }
        RateLimiter::clear($key);

        if (! config('vhs.login_otp')) {
            $this->establish($r, $u);
            AuditWriter::write($u, 'login', 'user', $u->id, $u->name.' logged in.');
            return $this->json($this->loginPayload($u));
        }

        // Existing public UI is an SMS OTP login step. Admin/Doctor accounts may
        // fall back to verified email if no phone has been configured yet.
        $channel = $u->phone ? 'sms' : 'email';
        $identifier = $channel === 'sms' ? $u->phone : $u->email;
        $r->session()->put('legacy_pending_login', [
            'id' => $u->id, 'version' => (int) $u->auth_version,
            'identifier' => $identifier, 'channel' => $channel, 'expires' => time() + 600,
        ]);
        try {
            $code = $this->otp->issue($r, $identifier, $channel, 'login', $u->id);
        } catch (\Throwable $e) {
            return $this->json(['status' => $e->getMessage() ?: 'Unable to send login code.'], 422);
        }
        $masked = $channel === 'sms' ? preg_replace('/^(\+639)\d{5}(\d{4})$/', '$1*****$2', $identifier) : preg_replace('/(^.).*(@.*$)/', '$1***$2', $identifier);
        $out = ['status' => 'otp_required', 'phone' => $masked, 'phone_verified' => $u->phone_verified_at ? 1 : 0, 'channel' => $channel];
        if (! app()->isProduction() && config('vhs.expose_dev_otp')) $out['dev_otp'] = $code;
        return $this->json($out);
    }

    private function verifyLoginOtp(Request $r)
    {
        $code = trim((string) $r->input('login_otp'));
        if (! preg_match('/^\d{6}$/D', $code)) return $this->json(['status' => 'Please enter the 6-digit code.'], 422);
        $pending = $r->session()->get('legacy_pending_login');
        if (! $pending || ($pending['expires'] ?? 0) <= time()) return $this->json(['status' => 'Login code expired. Please log in again.'], 422);

        try {
            $u = $this->otp->consume($r, $pending['identifier'], $pending['channel'], 'login', $code, function ($row) use ($pending) {
                $u = User::with('doctorProfile')->whereKey($pending['id'])->lockForUpdate()->first();
                abort_unless($u && $u->mayLogin() && (int) $u->auth_version === (int) $pending['version'] && $row->user_id === $u->id, 422, 'Start login again.');
                if ($pending['channel'] === 'sms' && ! $u->phone_verified_at) $u->phone_verified_at = now();
                if ($pending['channel'] === 'email' && ! $u->email_verified_at) $u->email_verified_at = now();
                $u->save();
                return $u;
            });
        } catch (\Throwable $e) {
            return $this->json(['status' => $e instanceof ValidationException ? ($e->errors()['code'][0] ?? 'Invalid code.') : ($e->getMessage() ?: 'Invalid code.')], 422);
        }

        $this->establish($r, $u);
        $r->session()->forget('legacy_pending_login');
        AuditWriter::write($u, 'login', 'user', $u->id, $u->name.' logged in.');
        return $this->json($this->loginPayload($u));
    }
}
