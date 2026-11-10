# Separate Vetti and Scribe credentials

Prepared in the official D:/Cap/V3/vhs-animal-wellness-repo-v3 project on November 11, 2026.

## Local setup
Four empty server-only settings have been added to .env and .env.example:

~~~dotenv
AI_VETTI_API_KEY=
AI_SCRIBE_API_KEY=
GROQ_VETTI_API_KEY=
GROQ_SCRIBE_API_KEY=
~~~

Enter the real values directly in the local .env file. Do not post them in chat, put them in browser JavaScript, or commit .env. Existing AI_API_KEY and GROQ_API_KEY values were preserved.

An empty feature-specific setting falls back to the existing shared key for that provider. It never borrows the other feature's dedicated key. Consequently, the four empty fields do not provide separate quotas yet. This preserves the existing workflow while the new credentials are being configured.

Gemini: Vetti and Scribe must use credentials belonging to different Google projects to isolate project-level quota. Multiple keys in one project still share quota. See https://ai.google.dev/gemini-api/docs/rate-limits.
Groq: keys in the same organization still share organization-level rate limits. Separate keys alone do not create independent capacity. See https://console.groq.com/docs/rate-limits.

At implementation time bootstrap/cache/config.php was absent, so no configuration cache was cleared. After adding keys, clear/rebuild configuration if your deployment caches it, and reload any long-running workers so they read the new environment. No workers or servers were restarted by this change.

## Routing
- Public/User Vetti, semantic booking, booking interpretation, and scheduling interpretation use the Vetti key for the selected provider.
- Scribe generation, review and fallback use Scribe keys.
- Groq audio transcription uses the Scribe Groq key.
- Provider fallback preserves the originating feature's scope.
- Direct low-level provider calls without a feature scope retain the legacy shared key for compatibility.
- Scribe cooldown/checkpoint quota fingerprints use effective Scribe credentials. Changing a Vetti key does not invalidate Scribe's wait or regenerate its draft. Changing a Scribe key allows its own pending review to retry while preserving the checkpoint.

Credential selection is passed explicitly per request. The shared Laravel configuration is not mutated, avoiding leakage between sequential requests/tasks.

## Verification
All requests in these tests were intercepted with synthetic credentials and fictional inputs; no live provider tokens were consumed for this change. No database migrations, real records, push, merge or deployment occurred.

~~~text
php vendor/bin/phpunit --do-not-cache-result tests/Feature/AI/AiCredentialIsolationTest.php tests/Feature/AI/GroqAudioTranscriberTest.php tests/Feature/AI/ScribeDraftRunTest.php tests/Feature/AI/DoctorScribeBackupTest.php tests/Feature/AI/GroqPublicBackupTest.php tests/Feature/AI/GroqUserBackupTest.php tests/Feature/AI/ScribeGroqReviewerBudgetTest.php tests/Feature/AI/ScribeCompletionIntegrityTest.php tests/Feature/AI/VettiModelSelectionTest.php
~~~

Result: 66 tests, 266 assertions, passed. Coverage includes both primary providers, fallback, transcription, shared-key compatibility, missing-key handling, cooldown rotation and invalid-scope rejection.

~~~text
php vendor/bin/phpunit --do-not-cache-result tests/Feature/AI/SemanticVettiTest.php tests/Feature/AI/VettiUniversalContextRepairTest.php tests/Feature/AI/VettiWorkflowBoundaryTest.php tests/Feature/AI/VettiNaturalConversationTest.php tests/Feature/AI/SemanticPetAdditionTest.php tests/Feature/AI/BookingScheduleConstraintTest.php tests/Feature/AI/BookingSchedulePreparationTest.php tests/Feature/BookingDateResolverTest.php
~~~

Result: 107 tests, 1,233 assertions, passed. These protect the existing conversational booking, add-pet, privacy, availability and date behavior. Total for the two disjoint suites: 173 tests, 1,499 assertions.

Syntax checks passed for the eight changed PHP implementation/configuration files. The four new .env fields were verified present and empty without displaying existing secrets. Actual independent provider quota and real new-key validity cannot be verified until the new credentials are supplied locally.

## Files changed for credential separation
- .env (empty feature fields appended; existing values preserved)
- .env.example
- config/ai.php
- app/Services/AI/AiCredentials.php (new)
- app/Services/AI/AiGateway.php
- app/Services/AI/Providers/GeminiProvider.php
- app/Services/AI/Providers/GroqProvider.php
- app/Services/AI/GroqAudioTranscriber.php
- app/Services/AI/ScribeProviderCooldown.php
- app/Services/AI/ScribeDraftRun.php
- tests/Feature/AI/AiCredentialIsolationTest.php (new)
- docs/ai-feature-credentials.md (this file)

The conversation state, booking form, explicit confirmation/OTP, authorization gates, clinical/privacy approval gates and Scribe workflow were preserved. Provider models, request budgets and retry limits were preserved. This change does not guarantee that providers will not return 429, timeouts or 503 errors.

## Live credential check after local key entry

On November 11, 2026, four separate live connectivity probes were run with the configured dedicated credentials and fictional text only. Each returned exactly OK:

| Provider | Feature | Result | Elapsed |
|---|---|---|---|
| Gemini | Vetti | Passed | 8.357 s |
| Gemini | Scribe | Passed | 8.866 s |
| Groq | Vetti | Passed | 1.105 s |
| Groq | Scribe | Passed | 0.594 s |

No pet, appointment, clinical note, or other application record was created. No key values were printed. These probes verify key validity and provider response with each scope; they do not prove project/organization quota independence or rerun the full portal/Scribe workflows. Gemini latency in these probes exceeded the existing short Vetti primary-attempt budget, so a normal Vetti request may still use its configured Groq fallback even with valid dedicated keys. No timeout settings were changed by this check.
