<?php

return [
    // Global kill switch for all external AI calls.
    'enabled' => (bool) env('AI_ENABLED', false),
    // Phase 2 has a separate public-only switch; FAQs work with both disabled.
    'public_vetti_enabled' => (bool) env('AI_PUBLIC_VETTI_ENABLED', false),
    // Isolated pilot only: do not enable until anonymous-chat privacy is reviewed.
    'public_conversation_enabled' => (bool) env('AI_PUBLIC_CONVERSATION_ENABLED', false),
    // Separate user portal switch; no private account/pet context goes to the model.
    'user_vetti_enabled' => (bool) env('AI_USER_VETTI_ENABLED', false),
    // Phase 4: sanitized public booking *preferences* only, never appointment writes.
    'booking_intent_enabled' => (bool) env('AI_BOOKING_INTENT_ENABLED', false),
    // Phase 5 pilot: requires explicit provider/privacy clearance, OFF by default.
    'semantic_vetti_enabled' => (bool) env('AI_SEMANTIC_VETTI_ENABLED', false),
    'semantic_privacy_cleared' => (bool) env('AI_SEMANTIC_PRIVACY_CLEARED', false),
    // Opt-in until the grounded service lookup is verified with the provider.
    'service_lookup_enabled' => (bool) env('AI_SERVICE_LOOKUP_ENABLED', false),
    'provider' => env('AI_PROVIDER', 'gemini'),
    'groq_public_backup_enabled' => (bool) env('AI_GROQ_PUBLIC_BACKUP_ENABLED', false),
    'groq_user_backup_enabled' => (bool) env('AI_GROQ_USER_BACKUP_ENABLED', false),
    'scribe_semantic_summary_enabled' => (bool) env('AI_SCRIBE_SEMANTIC_SUMMARY_ENABLED', false),
    // Experimental; disabled unless explicitly enabled for a controlled pilot.
    'scribe_grounded_summary_enabled' => (bool) env('AI_SCRIBE_GROUNDED_SUMMARY_ENABLED', false),
    // Controlled pilot only; this is not an independently verified clinical draft.
    'scribe_single_pass_enabled' => (bool) env('AI_SCRIBE_SINGLE_PASS_ENABLED', false),
    // Separate explicit opt-in: sends the transcript to Groq for advisory review.
    'scribe_independent_review_enabled' => (bool) env('AI_SCRIBE_INDEPENDENT_REVIEW_ENABLED', false),
    'groq_scribe_backup_enabled' => (bool) env('AI_GROQ_SCRIBE_BACKUP_ENABLED', false),
    'groq_scribe_transcription_enabled' => (bool) env('AI_GROQ_SCRIBE_TRANSCRIPTION_ENABLED', false),
    'groq_api_key' => env('GROQ_API_KEY', ''),
    'groq_model' => env('AI_GROQ_MODEL', 'openai/gpt-oss-20b'),
    // Logs only task, failure category and HTTP status; never prompts or bodies.
    'diagnostics_enabled' => (bool) env('AI_DIAGNOSTICS_ENABLED', false),
    'model' => env('AI_MODEL', 'gemini-3.5-flash-lite'),
    'vetti_model' => env('AI_VETTI_MODEL', env('AI_MODEL', 'gemini-3.5-flash-lite')),
    'transcribe_model' => env('AI_TRANSCRIBE_MODEL', 'gemini-3.5-transcribe'),
    'api_key' => env('AI_API_KEY', ''),
    // Optional per-feature credentials. Empty fields retain the shared legacy key.
    'vetti_api_key' => env('AI_VETTI_API_KEY', ''),
    'scribe_api_key' => env('AI_SCRIBE_API_KEY', ''),
    'groq_vetti_api_key' => env('GROQ_VETTI_API_KEY', ''),
    'groq_scribe_api_key' => env('GROQ_SCRIBE_API_KEY', ''),
    'timeout' => (int) env('AI_TIMEOUT', 15),
    'connect_timeout' => (int) env('AI_CONNECT_TIMEOUT', 5),
    // Vetti only; bounded by its existing shared deadline and backup reserve.
    'vetti_primary_timeout' => (float) env('AI_VETTI_PRIMARY_TIMEOUT', 10),
    'max_input_bytes' => (int) env('AI_MAX_INPUT_BYTES', 4000),
    // Scribe-only bounds: retain complete clinical source context in review requests.
    'scribe_max_input_bytes' => (int) env('AI_SCRIBE_MAX_INPUT_BYTES', 10000),
    'scribe_summary_input_bytes' => (int) env('AI_SCRIBE_SUMMARY_INPUT_BYTES', 7500),
    'max_output_tokens' => (int) env('AI_MAX_OUTPUT_TOKENS', 640),
    // Vetti Groq completions include reasoning as well as visible reply tokens.
    'vetti_groq_max_output_tokens' => (int) env('AI_VETTI_GROQ_MAX_OUTPUT_TOKENS', 2048),

    // Sensitive-data and clinical use policy gates. Do not turn these on without
    // documented provider permission, privacy review, and clinic authorization.
    'paid_data_approved' => (bool) env('AI_PAID_DATA_APPROVED', false),
    'clinical_enabled' => (bool) env('AI_SCRIBE_GEMINI_ENABLED', false),
    'clinical_clearance' => (bool) env('AI_CLINICAL_USE_CLEARED', false),
    'transcribe_enabled' => (bool) env('AI_TRANSCRIBE_GEMINI_ENABLED', false),
];
