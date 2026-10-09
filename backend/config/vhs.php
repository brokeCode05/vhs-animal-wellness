<?php

return [
    'otp_minutes' => 5,
    'otp_attempts' => 5,
    'otp_resend_seconds' => 60,
    'login_otp' => env('VHS_LOGIN_OTP', true),
    'terms_version' => env('VHS_TERMS_VERSION', '2026-10-03'),
    'sms_driver' => env('SMS_DRIVER', 'disabled'),
    'expose_dev_otp' => env('VHS_EXPOSE_DEV_OTP', true),
    'twilio' => ['sid' => env('TWILIO_ACCOUNT_SID'), 'token' => env('TWILIO_AUTH_TOKEN'), 'from' => env('TWILIO_FROM'), 'messaging_service_sid' => env('TWILIO_MESSAGING_SERVICE_SID')],
    'pet_age_max' => 50, 'pet_weight_max' => 200,
];
