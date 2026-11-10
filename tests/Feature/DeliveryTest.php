<?php

namespace Tests\Feature;

use App\Services\OtpDelivery;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\TestCase;

class DeliveryTest extends TestCase
{
    public function test_sms_adapter_sends_canonical_number_and_message(): void
    {
        config(['vhs.sms_driver' => 'twilio', 'vhs.twilio' => ['sid' => 'ACexample', 'token' => 'test-secret', 'from' => '+15551234567', 'messaging_service_sid' => null]]);
        Http::preventStrayRequests();
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SMexample'], 201)]);
        (new OtpDelivery)->send('sms', '+639171234567', '123456', 'registration');
        Http::assertSent(fn ($r) => $r['To'] === '+639171234567' && str_contains($r['Body'], '123456') && $r['From'] === '+15551234567');
    }

    public function test_disabled_sms_never_logs_codes_or_recipient_details(): void
    {
        config(['vhs.sms_driver' => 'disabled']);
        $log = Log::spy();
        (new OtpDelivery)->send('sms', '+639170000000', '123456', 'registration');
        $log->shouldNotHaveReceived('info');
    }

    /**
     * Production policy: a disabled/non-twilio SMS driver fails closed with
     * the documented message instead of silently dropping the OTP.
     */
    public function test_disabled_sms_fails_closed_in_production(): void
    {
        config(['vhs.sms_driver' => 'disabled']);
        $previousEnvironment = app()->environment();
        app()->detectEnvironment(fn () => 'production');

        try {
            $this->expectException(\RuntimeException::class);
            $this->expectExceptionMessage('SMS is not configured.');

            (new OtpDelivery)->send('sms', '+639171234567', '123456', 'registration');
        } finally {
            app()->detectEnvironment(fn () => $previousEnvironment);
        }
    }

    public function test_provider_error_is_not_returned_verbatim(): void
    {
        config(['vhs.sms_driver' => 'twilio', 'vhs.twilio' => ['sid' => 'ACexample', 'token' => 'test-secret', 'from' => '+15551234567', 'messaging_service_sid' => null]]);
        Http::fake(['*' => Http::response(['message' => 'Sensitive provider response'], 400)]);
        $this->expectExceptionMessage('SMS provider rejected delivery.');
        (new OtpDelivery)->send('sms', '+639171234567', '123456', 'registration');
    }

    public function test_email_transport_receives_code(): void
    {
        config(['mail.default' => 'array']);
        (new OtpDelivery)->send('email', 'maria@example.com', '654321', 'registration');
        $message = Mail::mailer()->getSymfonyTransport()->messages()->first()->getOriginalMessage();
        $this->assertSame('maria@example.com', $message->getTo()[0]->getAddress());
        $this->assertStringContainsString('654321',$message->getTextBody());
    }
}
