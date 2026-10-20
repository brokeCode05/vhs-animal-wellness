<?php

namespace App\Services;

use App\Models\AccountVerification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OtpService
{
    public function __construct(private OtpDelivery $delivery) {}

    private function key(string $value): string
    {
        return hash_hmac('sha256', $value, config('app.key'));
    }

    public function sessionHash(Request $r): string
    {
        if (! $r->session()->has('otp_binding')) {
            $r->session()->put('otp_binding', bin2hex(random_bytes(32)));
        }

        return $this->key($r->session()->get('otp_binding'));
    }

    public function issue(Request $r, string $identifier, string $channel, string $context, ?int $userId = null): ?string
    {
        $key = 'otp:'.$context.':'.$channel.':'.$this->key($identifier);
        $binding = $this->sessionHash($r);
        $issuedCode = null;
        Cache::lock($key.':lock', 30)->block(3, function () use ($r, $key, $identifier, $channel, $context, $userId, $binding, &$issuedCode) {
            foreach ([$key.':cooldown' => [1, config('vhs.otp_resend_seconds')], $key.':hour' => [5, 3600], 'otp:ip:'.$this->key($r->ip()) => [20, 3600]] as $k => $limit) {
                if (RateLimiter::tooManyAttempts($k, $limit[0])) {
                    throw new HttpException(429, 'Too many code requests. Please wait.');
                }
            }
            foreach ([$key.':cooldown' => config('vhs.otp_resend_seconds'), $key.':hour' => 3600, 'otp:ip:'.$this->key($r->ip()) => 3600] as $k => $seconds) {
                RateLimiter::hit($k, $seconds);
            }
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $issuedCode = $code;
            $row = DB::transaction(function () use ($identifier, $channel, $context, $userId, $binding, $code) {
                AccountVerification::where(compact('identifier', 'channel', 'context'))->where('session_hash', $binding)->whereNull('consumed_at')->update(['consumed_at' => now()]);
                $row = new AccountVerification;
                $row->forceFill(['identifier' => $identifier, 'channel' => $channel, 'context' => $context, 'user_id' => $userId, 'session_hash' => $binding, 'code_hash' => $this->key($code), 'expires_at' => now()->addMinutes(config('vhs.otp_minutes'))])->save();

                return $row;
            });
            try {
                $this->delivery->send($channel, $identifier, $code, $context);
            } catch (\Throwable $e) {
                $row->forceFill(['consumed_at' => now()])->save();
                // Do not log provider responses, addresses, credentials or OTP message bodies.
                throw new HttpException(503, 'Code delivery failed. Check delivery configuration, then request a new code.');
            }
        });

        return $issuedCode;
    }

    /** Commit attempt counts on failure; consume code and perform action atomically on success. */
    public function consume(Request $r, string $identifier, string $channel, string $context, string $code, callable $action): mixed
    {
        $result = DB::transaction(function () use ($r, $identifier, $channel, $context, $code, $action) {
            $row = AccountVerification::where(compact('identifier', 'channel', 'context'))->where('session_hash', $this->sessionHash($r))->latest('id')->lockForUpdate()->first();
            if (! $row || $row->consumed_at || $row->expires_at->lte(now()) || $row->attempts >= config('vhs.otp_attempts')) {
                return ['valid' => false];
            }
            $row->attempts++;
            if (! hash_equals($row->code_hash, $this->key($code))) {
                $row->save();

                return ['valid' => false];
            }
            $value = $action($row);
            $row->consumed_at = now();
            $row->save();

            return ['valid' => true, 'value' => $value];
        });
        if (! $result['valid']) {
            throw ValidationException::withMessages(['code' => ['Code is invalid, expired, already used, or has too many attempts. Request a new code in this browser.']]);
        }

        return $result['value'];
    }
}
