<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class OtpDelivery
{
    public function send(string $channel, string $identifier, string $code, string $context): void
    {
        $minutes = config('vhs.otp_minutes');
        $body = "VHS Animal Wellness: Your {$context} code is {$code}. It expires in {$minutes} minutes. Do not share this code.";
        if ($channel === 'email') {
            if (app()->isProduction() && in_array(config('mail.default'), ['log', 'array'])) {
                throw new RuntimeException('Production mail transport missing.');
            }
            Mail::raw($body, function ($m) use ($identifier) {
                $m->to($identifier)->subject('Your VHS verification code');
            });

            return;
        }
        if (config('vhs.sms_driver') !== 'twilio') {
            if (! app()->isProduction()) {
                Log::info('VHS development SMS OTP', ['to' => $identifier, 'context' => $context, 'code' => $code]);
                return;
            }
            throw new RuntimeException('SMS is not configured.');
        }
        $c = config('vhs.twilio');
        if (! $c['sid'] || ! $c['token'] || (! $c['from'] && ! $c['messaging_service_sid'])) {
            throw new RuntimeException('SMS credentials missing.');
        }
        $payload = ['To' => $identifier, 'Body' => $body];
        $payload[$c['messaging_service_sid'] ? 'MessagingServiceSid' : 'From'] = $c['messaging_service_sid'] ?: $c['from'];
        // No automatic retries: a timed-out POST could already have sent a billable SMS.
        $response = Http::asForm()->withBasicAuth($c['sid'], $c['token'])->connectTimeout(5)->timeout(15)
            ->post('https://api.twilio.com/2010-04-01/Accounts/'.rawurlencode($c['sid']).'/Messages.json', $payload);
        if (! $response->successful() || ! $response->json('sid')) {
            throw new RuntimeException('SMS provider rejected delivery.');
        }
    }
}
