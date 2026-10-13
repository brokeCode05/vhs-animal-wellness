<?php

return [
    'otp_minutes' => 5,
    'otp_attempts' => 5,
    'otp_resend_seconds' => 60,
    'login_otp' => env('VHS_LOGIN_OTP', true),
    'terms_version' => env('VHS_TERMS_VERSION', '2026-10-03'),
    'sms_driver' => env('SMS_DRIVER', 'disabled'),
    // DEVELOPMENT-ONLY convenience. When true AND the app is not in
    // production, a few legacy endpoints return dev_otp / dev_verify_url so a
    // tester can auto-fill codes without a working mail/SMS transport.
    // DISABLED BY DEFAULT: the defense/runtime build must never expose OTP
    // values in any response. Enable explicitly with VHS_EXPOSE_DEV_OTP=true
    // in a local .env only; never in production.
    'expose_dev_otp' => env('VHS_EXPOSE_DEV_OTP', false),
    'twilio' => ['sid' => env('TWILIO_ACCOUNT_SID'), 'token' => env('TWILIO_AUTH_TOKEN'), 'from' => env('TWILIO_FROM'), 'messaging_service_sid' => env('TWILIO_MESSAGING_SERVICE_SID')],
    'pet_age_max' => 50, 'pet_weight_max' => 200,
];
