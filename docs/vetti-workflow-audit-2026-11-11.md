# Vetti workflow audit — November 11, 2026

Official project updated: `D:\Cap\V3\vhs-animal-wellness-repo-v3`.

Scope: Vetti's pet-registration and booking conversations. No Scribe feature, authentication flow, appointment creation, clinic settings, or database schema was changed in this audit. Shared provider edits are restricted to Vetti; Scribe retains its previous timeout and retry wording. Existing feature credentials and `.env` were left alone.

## Confirmed causes and corrections

1. Draft fields were cleared when `pet_form_open=false`, even when the name had already been accepted. Draft lifetime now follows the owner/conversation session, independently of form visibility. A legacy `registration_mode=new` response no longer erases a continuing draft; explicit restart needs a current source quote.
2. A saved/visible pet form was advertised as active registration during booking. The interpreter now receives an explicit active workflow from the latest server conversation frame. Registration field expectations and registration-specific masking apply only to an active registration.
3. Unsaved draft cancellation could enter the existing-appointment cancellation route. Draft cancellation now has its own intent/action and UI close action. It clears only the unsaved draft and never lists or cancels appointments. Ambiguous cancellation does not enter the appointment route while registering.
4. Privacy masking assigned every unknown word to the next missing field. Ordinary grammar such as “told” could become the pet name, and “ngani” could become the breed. Repeated locally known private values retain their field identity; generic unknown words no longer inherit the next field merely by appearing in a sentence. Private field values still stay in the local vault and encrypted draft rather than being sent unprotected.
5. Pet-list hydration could close a user-opened form. Only the automatic empty-account form may close after pets load. Explicit dismiss/save sends an idempotent draft reset token; it also retires a registration frame without changing the booking conversation ID.
6. A newly displayed form received only the latest field delta. If earlier turns had not opened a form, retained species/sex could be missing on screen even though the server remembered them. A first render now receives the complete validated draft. Existing forms receive deltas so unrelated manual edits survive.
7. Repeated saved schedule ranges were treated as invalid new changes when the user repeated only a date. Identical verified ranges now leave the schedule unchanged. New/different ranges still require current source evidence. Scalar daypart preferences are represented consistently with saved intervals, preserving blocked periods.
8. A repeated date could be classified as clinic information. The interpreter is told that a task stays in progress while required fields are missing. An unexpected task switch on a validated date-containing follow-up gets one bounded AI routing check; explicit task changes remain supported.
9. The four-second primary timeout discarded healthy Gemini responses, pushing work to the backup. Vetti now permits up to ten seconds within the unchanged 24-second shared deadline and reserves backup time. Live healthy responses above four seconds were observed. Scribe keeps its prior twelve-second primary cap.
10. Groq sometimes populated irrelevant optional enum fields with invalid values. Vetti instructions now request relevant fields only. The existing single retry supplies schema-owned invalid field names, without rejected values; strict validation and the original retry count remain. This retry feedback is enabled only for the Vetti credential scope.
11. Browser script versions had not changed after JS repairs. Vetti script cache versions were bumped to `20261111-workflow-audit`.
12. The live stop/review check exposed a cancellation misclassification: “stop asking” erased the unsaved draft. Before discarding a pet draft, Vetti now independently checks whether the user means cancellation, pause, or review. Actual cancellation requires a quoted explicit abandonment request. Uncertain/failed verification preserves and shows the draft. Negative registration wording stays in this collection workflow instead of entering a generic booking-rejection path. This check adds at most one interpretation call on a proposed registration cancellation/negative collection request, within the existing deadline.

## Changed files in this audit

Source:
- `app/Services/AI/SemanticVettiService.php`
- `app/Services/AI/VettiPetDraftSession.php`
- `app/Services/AI/VettiPetPrivacyEnvelope.php`
- `app/Services/AI/BookingScheduleConstraint.php`
- `app/Services/AI/AiGateway.php` (Vetti timeout only)
- `app/Services/AI/Providers/GroqProvider.php` (Vetti retry feedback only)
- `app/Http/Controllers/AI/SemanticVettiController.php`
- `config/ai.php` (Vetti timeout setting)
- `public/user/vetti-ai.js`
- `public/user/vetti-ui.js`
- `public/user/index.html`

Tests/tools:
- `tests/Feature/AI/VettiMixedWorkflowAuditTest.php` (new)
- `tests/Feature/AI/VettiNaturalConversationTest.php`
- `tests/Feature/AI/VettiUniversalContextRepairTest.php`
- `tests/Feature/AI/SemanticVettiTest.php`
- `tests/Feature/AI/BookingScheduleConstraintTest.php`
- `tests/Feature/AI/GroqPublicBackupTest.php`
- `tests/Feature/AI/GroqUserBackupTest.php`
- `tests/Feature/AI/GroqSchemaRetryTest.php`
- `tests/Feature/AI/SemanticUpcomingAppointmentsTest.php`
- `tests/Feature/AI/VettiRecoveryCatalogTest.php`
- `tools/test_vetti_pet_draft_transport.cjs`
- `tools/test_vetti_pet_form_review.cjs`
- `tools/test_vetti_workflow_live_audit.php` (new)

Pre-audit snapshots of five core files remain under `storage/app/private/workflow-audit-20261111-before/`. They are reference snapshots, not a wholesale rollback plan; earlier credential and workflow repairs must be preserved.

## Automated verification

Final broad check after all corrections: **190 tests, 1,661 assertions passed**. The stop/review correction also passed its focused set before the last negative-review case: **24 tests, 366 assertions**.

Broad command (PowerShell, from the official project; `phpunit.xml` uses SQLite `:memory:`, array session/cache, and no migrations):

```powershell
$vettiTests = @(
 'VettiMixedWorkflowAuditTest', 'VettiNaturalConversationTest', 'SemanticPetAdditionTest',
 'VettiUniversalContextRepairTest', 'SemanticVettiTest', 'VettiWorkflowBoundaryTest',
 'BookingScheduleConstraintTest', 'BookingSchedulePreparationTest', 'VettiRecoveryCatalogTest',
 'SemanticUpcomingAppointmentsTest', 'GroqPublicBackupTest', 'GroqUserBackupTest',
 'GroqSchemaRetryTest', 'GroqBookingWorkflowTest', 'AiCredentialIsolationTest',
 'AiGatewayStatusDiagnosticsTest', 'ScribeGroqReviewerBudgetTest',
 'VettiPrivacyDiagnosticsTest', 'ScribePrivacyGuardTest'
) | ForEach-Object { "tests/Feature/AI/$_.php" }
php vendor/bin/phpunit --do-not-cache-result @vettiTests tests/Feature/BookingDateResolverTest.php
```

JavaScript commands rerun and passed:

```powershell
node tools/test_vetti_pet_draft_transport.cjs
node tools/test_vetti_pet_form_review.cjs
node tools/test_vetti_pet_decimal_age.cjs
node tests/vetti-selected-pet.cjs
node tests/vetti-browser-deadline.cjs
node --check public/user/vetti-ai.js
node --check public/user/vetti-ui.js
```

PHP syntax checks passed for SemanticVettiService, VettiPetDraftSession, BookingScheduleConstraint and GroqProvider. Earlier checks also covered the privacy envelope.

## Live providers, separate from fixtures/mocks

`php tools/test_vetti_workflow_live_audit.php` uses real configured AI credentials with fictional pets, an in-memory service table, fixture availability, and an outgoing-request guard against sending the fictional private pet names. It does not exercise real clinic availability.

- Gemini successfully retained the fictional name/species/sex, cancelled the draft, kept a booking for the fictional owned pet, accepted the Taglish busy-afternoon/morning preference, and asked for the missing service on “bukas ngani”.
- A later Gemini 503 fell back to Groq, which produced invalid enum fields on its two bounded attempts. No proposal/draft was erased. This failure prompted the Vetti-only schema retry feedback correction.
- A separate Groq-only, booking-resume probe produced a consultation proposal for tomorrow morning with the verified fixture start of 9:00 AM, retaining the fictional owned pet and requiring confirmation. It created nothing.
- A subsequent final Groq-only full run passed the first two registration turns, then hit HTTP 429 from cancellation onward. This is a failed/incomplete live run, not a full pass. The audit tool now stops at a provider fallback rather than spending requests on dependent turns.
- In the actual portal after the final retry change, a new registration request encountered Gemini HTTP 503, then Groq succeeded through its existing bounded retry; response wording succeeded through Gemini. This verifies one actual final-code failover path, not every possible provider failure.

## Actual browser verification

The signed-in tunnel portal was used. Earlier broken chat/form evidence was inspected before testing; no real pet or appointment was saved or cancelled.

- Earlier observed corruption included “told” as a name and “ngani” as a breed.
- A first repaired test preserved Brody/Bird/Male and cancelled the unsaved draft correctly. It caught further repeated-schedule and clinic-hours routing defects, which were corrected and covered with regressions.
- After browser access was re-enabled, the user signed in. A fresh run retained the name across the male-bird answer, asked for breed instead of name, and kept “brody” after a repeated-name correction. The newly shown form then exposed the first-render missing-field handoff described above; that correction is installed and its automated checks passed.
- Final-code booking retest: after cancelling the unsaved draft, the Bornok appointment request asked for a date. The Taglish tomorrow/busy-afternoon/morning request asked for the missing service. “bukas ngani” continued asking for the missing service, with no pet-age question and no clinic-hours detour. “consultation” produced verified November 12, 2026 morning starts of 8:00, 9:00, 10:00 and 11:00 AM, with the unknown-duration caveat.
- Continue to Booking opened the existing wizard with Bornok (Cat), Consultation and November 12 already selected. No exact start was preselected. The standard wizard continued to expose its full available-time list, as before; the chat suggestions reflected the morning request. The modal was closed before submission or OTP.
- Final pet-form retest after the hydration change retained Brody, Bird and Male. A Canary answer arrived during the test; an agent-supplied Unknown-breed test temporarily replaced it, and the next correction restored Canary while retaining name, Bird, Male, age 3, Months and weight 0.25 kg. The ready response moved the same form to the latest reply. No Add pet click occurred. The first explicit stop/review check incorrectly cancelled the draft, exposing cause 12 above. After correction and restoration of the fictional test details, repeating the same stop/review message paused collection, asked no further question, moved the form to the latest response, and retained Brody / Bird / Canary / Male / 3 Months / 0.25 kg. The test draft remains unsaved in the portal.

## Preserved boundaries and remaining verification

The existing editable form, user review/submission, booking confirmation/OTP, owner authorization, active-service validation and server availability remain responsible for actual records. AI supplies interpretation and wording. Warm conversational tone remains configured, with one-pet wording. No Add pet or appointment-confirmation control was clicked.

This audit did not modify clinic settings, Scribe feature logic, authentication, database schema, or actual appointment/pet creation. No migration, push, merge or deployment occurred.

Provider 429/503 failures remain external reliability limits; no key or quota change is claimed to solve them. The final broad rerun and the reported booking/pet-form browser checks passed. This is not a guarantee against all model wording or provider failures. The full Groq-only sequence remains unverified because of HTTP 429, and the newly guarded explicit-cancel branch passed automated checks but was not repeated in the browser after the final stop/review change. Numeric dates, ownership and confirmation boundaries were covered in the focused automated set; not every date format or full OTP/create sequence was live-tested in this audit.
