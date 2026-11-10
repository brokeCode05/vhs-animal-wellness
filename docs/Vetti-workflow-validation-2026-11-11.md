# Vetti workflow changes and verification — November 11, 2026

Status: targeted changes installed in the official V3 source. Automated focused checks pass. The complete live workflow is not certified: Gemini/Groq availability prevented a clean final end-to-end run.

## Location and boundaries
All source, test and report edits were made in D:/Cap/V3/vhs-animal-wellness-repo-v3. The directory is not recognized as a Git checkout, so no Git baseline/diff is available. Existing code was edited in place; no push, merge, deployment, discard, or database migration was performed. No real pet or appointment was created or cancelled. The availability integration test creates a tiny services table in SQLite :memory: directly; it does not run application migrations.

## Confirmed causes and changes
- The booking intent label previously decided whether to clear context. An unfinished proposal could lose tomorrow when the next message supplied its service and pet. Laravel now retains omitted fields by default and uses an explicit model-interpreted booking_mode to start over.
- A scope question had no corresponding waiting state. Laravel now records awaiting_answer (including booking_scope) in the owner/conversation-scoped proposal and supplies it to interpretation, so a short new/current answer has context.
- Rejected spay changes previously wrote the candidate before sex validation. Validation precedes that write; a focused regression verifies preservation.
- Read-only availability follows the current proposal and accepts date corrections only when grounded in the current message. Model-invented exact times are ignored on read-only queries.
- Personal scheduling had only a broad flag, which blocked every availability result. Laravel now owns validated blocked/allowed minute ranges, validates source quotes and clocks, preserves restrictions through follow-ups, and filters only clinic-verified starts. Known allocation checks the entire interval; unknown duration receives an explicit start-only caveat. Multiple periods use a bounded additional interpretation when the main interpretation omits their relationship; failure preserves state and requests clarification.
- First-turn pet fields had been removed from the schema when no form was open. They are now available on the first registration request. Protected short answers get the next required field as context. Open drafts merge validated supplied values and keep their other fields.
- Active registration protects free-text values with opaque references, including unrecognized breed/name tokens and invalid numeric values; provider responses resolve references locally. Grammar/control and active public-service vocabulary remain interpretable. This strengthens screening; it is not a universal guarantee that arbitrary free text in every possible message contains no identifier. The final general privacy boundary still needs a broader adversarial audit.
- Pet narration receives field status rather than values; neutral wording and a response check reduce invented sex/species claims observed live.
- The existing form previously stayed in an old turn. A completed draft or a model-interpreted pause/review now moves the same controls into the latest reply. No cloning/reset/rebinding/submission occurs. Manual edits and listeners survive. On chat failure with an open draft, the UI also surfaces that existing form for manual completion.
- The form footnote now says Add pet is required to save. Browser deadline recovery is bounded; an expired request does not start a second hidden fallback request.

## Focused automated verification on the final code
Command:

~~~text
php vendor/bin/phpunit --do-not-cache-result tests/Feature/AI/SemanticVettiTest.php tests/Feature/AI/VettiUniversalContextRepairTest.php tests/Feature/AI/VettiWorkflowBoundaryTest.php tests/Feature/AI/VettiNaturalConversationTest.php tests/Feature/AI/SemanticPetAdditionTest.php tests/Feature/AI/BookingScheduleConstraintTest.php tests/Feature/AI/BookingSchedulePreparationTest.php tests/Feature/BookingDateResolverTest.php
~~~

Result: 106 tests, 1,218 assertions, pass. Most use mocked providers/facts; the preparation test uses SQLite memory and a fixture availability controller. These are not evidence of real provider reliability or current clinic slots.

JavaScript commands, all passed:

~~~text
node tools/test_vetti_pet_form_review.cjs
node tools/test_vetti_pet_draft_transport.cjs
node tools/test_vetti_pet_decimal_age.cjs
node tests/vetti-browser-deadline.cjs
node tests/vetti-selected-pet.cjs
node --check public/user/vetti-ui.js
node --check public/user/vetti-ai.js
node --check public/user/vetti-onboarding.js
~~~

PHP syntax checks passed for SemanticVettiService, VettiPetPrivacyEnvelope, BookingScheduleConstraint and BookingConversationService.

Covered behavior includes retained date/pet/service, explicit restart/scope answer, rejected spay, provider failure preservation, busy afternoon plus morning/evening alternatives, omitted schedule relationship repair, known/unknown duration boundaries, no matching slots, protected multi-turn pet details, months and sub-kilogram weights, ready/paused review, same-form movement with retained manual controls, no automatic creation, date ambiguity/invalidity/window validation, and browser/CSRF deadline recovery.

## Live providers, separately from mocks
Commands:

~~~text
php tools/test_vetti_live_workflow.php gemini
php tools/test_vetti_live_workflow.php groq
~~~

These call real providers but supply fictional server facts, a fictional owner/pet, fixture clinic slots, and SQLite memory. They never create real records or verify the actual clinic schedule.

Gemini: observed retained tomorrow after the compact bookcastration follow-up, a rejected spay warning, resumption of the castration proposal, and explicit restart. Earlier attempts also produced protected name/breed/form updates. Final sequences encountered timeout, HTTP 503 and HTTP 429; the complete final pet draft and full constrained-booking sequence did not pass live. One successful response omitted a multiple-period restriction; that finding led to the additional bounded schedule interpretation and a passing regression. This last repair was not certified by another clean live run.

Groq: the first interpretation succeeded, then HTTP 429 rate limits prevented the rest of its sequence. No complete live Groq pass is claimed.

The live script outputs response and bounded timing/error diagnostics only for the fictional scenario. Provider calls are screened for the fictional name/breed/weight values before transmission.

## Actual portal browser results
Used the signed-in tunnel portal. Its prior tab was no longer available after interruption; reopening the same tunnel address retained the session and required no login.
- Initial pet request filled Cat and Male.
- Pause/manual-entry request brought that same partial form beneath the newest response, retaining Cat/Male and asking no further field question: passed live.
- Completed-draft message received a chat/provider failure: automatic completed review was not verified live on the final code.
- The provider-failure form resurfacing was added after that browser result and passed JavaScript tests, but was not reloaded/retested in the live portal.
- In earlier live browser turns, Birdie, Persian, age in months, and sub-kilogram weight were retained. Those earlier observations are not a complete final-code browser pass.
- No Add pet or appointment confirmation action was clicked.

## Exact changed source/test/report files across this repair
- app/Services/AI/SemanticVettiService.php
- app/Services/AI/BookingConversationService.php
- app/Services/AI/BookingScheduleConstraint.php (new)
- app/Services/AI/VettiPetPrivacyEnvelope.php
- public/user/vetti-ai.js
- public/user/vetti-ui.js
- public/user/vetti-onboarding.js
- tests/Feature/AI/SemanticVettiTest.php
- tests/Feature/AI/VettiUniversalContextRepairTest.php
- tests/Feature/AI/VettiNaturalConversationTest.php
- tests/Feature/AI/BookingScheduleConstraintTest.php (new)
- tests/Feature/AI/BookingSchedulePreparationTest.php (new)
- tools/test_vetti_live_workflow.php (new)
- tools/test_vetti_pet_draft_transport.cjs
- tools/test_vetti_pet_form_review.cjs (new)
- docs/Vetti-workflow-validation-2026-11-11.md (this report)


## Latest actual portal booking run and universal period fixes

The live portal was tested with its real clinic availability controller and the account's existing selected pet. No appointment was confirmed or created.

Observed sequence:
1. Asked for an appointment tomorrow, then supplied only castration and Luna. The resulting proposal retained November 12, 2026: passed live.
2. Changed the requested service to spay. Laravel used the male record to reject that change and the execution log recorded pending_transition=preserved: passed live.
3. The owner supplied a busy afternoon plus morning/evening alternatives in the portal. Interpretation and clinic availability succeeded, but the generated reply contained an unverified clock time, so Laravel rejected it. This was an application reply-validation failure, not proof that clinic availability could not be retrieved.
4. The owner's morning follow-up returned 8:00, 9:00, 10:00 and 11:00 AM as matching starts, with a duration caveat.
5. An evening follow-up exposed stale allowed morning intervals and an empty availability-update rejection. These were fixed as general period-update rules.
6. Retested tomorrow evening after those changes: the live portal returned 6:00, 7:00 and 8:00 PM and kept the unconfirmed booking status: passed live.
7. The subsequent evening-to-morning switch and its one retry were blocked during interpretation: Gemini timed out at the configured budget, Groq returned HTTP 429, and the logs recorded the pending proposal as preserved. A clean complete final live sequence is still not claimed. The live new-versus-current reset step was not reached in this run.

Additional fixes installed only in the official V3 project:
- A source-grounded model-interpreted period now replaces previous allowed periods while preserving independent blocked/busy intervals. An empty availability label with no actual constraint no longer causes a false clarification. An exact time correction clears stale allowed-period preferences but preserves busy intervals.
- If AI narration proposes an unverified time, one bounded repair supplies only opaque SLOT_n labels. Laravel inserts clocks from verified slots. Unknown labels or further invented numbers remain rejected; this does not bypass validation or book anything.
- Unknown duration no longer sounds like unverified slot availability. Verified starts can be listed; the one brief duration caveat concerns the finish time only. The generation prompt avoids repeating the interface caveat.

Final regression command remains the focused PHP command listed above. Final result after these changes: **107 tests, 1,233 assertions, all passed**. Tests include morning-to-evening switching, preservation of busy intervals, bounded slot-label repair, and rejection of invented repair labels. Pet-form movement and draft-transport JavaScript tests were rerun and passed. No migrations, real record writes, push, merge, or deployment occurred.

These latest changes touched app/Services/AI/SemanticVettiService.php, app/Services/AI/BookingConversationService.php, tests/Feature/AI/SemanticVettiTest.php, tests/Feature/AI/VettiUniversalContextRepairTest.php, tests/Feature/AI/BookingSchedulePreparationTest.php, and this report. All are within the previously listed official D: project.

## Remaining verification and risks
- Provider outages/rate limits block a clean final live run. Failed interpretation intentionally retains the existing proposal/draft; it cannot accept a detail that it failed to interpret. The owner may repeat it later or edit the form.
- A broader privacy audit remains necessary, especially messages before registration context is established, compound identifiers, and corrections mixed with unrelated topics. Do not describe the screening as infallible.
- The actual clinic hours/settings were not changed or reverified during this repair. Fixture slots are not evidence of approved clinical hours or real availability.
- Numeric dates and booking-window boundaries pass isolated tests; no complete final browser conversation covering every listed date form was run.
- The welcome card showed the account's real pets in observed sessions, but delayed hydration and failed loading were not repaired or fully regression tested here.
- Session checks completed in the observed portal. The actual server-unavailable session retry path was not verified in the browser here; its existing authentication guard remains.
- Explicit review, OTP, ownership checks, and actual appointment creation code were not replaced. Full OTP/creation integration was not rerun because no application migrations or real records were permitted.
- The additional schedule interpretation adds a provider call only for multiple-period relationships omitted by the primary interpretation, within the existing shared deadline.
- Vetti still uses AI-generated conversational replies with Laravel-controlled validation and actions. Warm tone remains the intent, but occasional redundant wording and provider output variation remain possible.
