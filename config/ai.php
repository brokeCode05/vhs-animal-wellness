<?php

return [
    // Global kill switch for all external AI calls.
    'enabled' => (bool) env('AI_ENABLED', false),
    // Phase 2 has a separate public-only switch; FAQs work with both disabled.
    'public_vetti_enabled' => (bool) env('AI_PUBLIC_VETTI_ENABLED', false),
    // Separate user portal switch; no private account/pet context goes to the model.
    'user_vetti_enabled' => (bool) env('AI_USER_VETTI_ENABLED', false),
    'provider' => env('AI_PROVIDER', 'gemini'),
    'model' => env('AI_MODEL', 'gemini-3.5-flash-lite'),
    'transcribe_model' => env('AI_TRANSCRIBE_MODEL', 'gemini-3.5-transcribe'),
    'api_key' => env('AI_API_KEY', ''),
    'timeout' => (int) env('AI_TIMEOUT', 15),
    'connect_timeout' => (int) env('AI_CONNECT_TIMEOUT', 5),
    'max_input_bytes' => (int) env('AI_MAX_INPUT_BYTES', 4000),
    'max_output_tokens' => (int) env('AI_MAX_OUTPUT_TOKENS', 640),

    // Sensitive-data and clinical use policy gates. Do not turn these on without
    // documented provider permission, privacy review, and clinic authorization.
    'paid_data_approved' => (bool) env('AI_PAID_DATA_APPROVED', false),
    'clinical_enabled' => (bool) env('AI_SCRIBE_GEMINI_ENABLED', false),
    'clinical_clearance' => (bool) env('AI_CLINICAL_USE_CLEARED', false),
    'transcribe_enabled' => (bool) env('AI_TRANSCRIBE_GEMINI_ENABLED', false),
];
