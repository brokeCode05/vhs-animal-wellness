# Vetti fixes and verification — 2026-11-10

Work was limited to D:/Cap/V3/vhs-animal-wellness-repo-v3. Nothing was pushed or deployed. No booking, OTP/SMS, consultation or clinical-record write was performed.

## What changed

- The semantic booking schema and proposal updates now use the current active catalog's exact values. A final leftover fixed-list restriction on constrained-proposal summaries was also replaced with the current choices. A read-only check found 26 active services, 26 booking catalog rows, and no missing active codes.
- Exact public service labels are recognized as catalog vocabulary during the unknown-name safety check; they are not stripped from the outgoing question. Registered pet names remain masked, ownership is rechecked, and browser input does not authorize an action.
- The active browser flow no longer guesses a service when Laravel has not supplied a valid active service value. Missing, forged, inactive and stale-catalog proposals do not open a guessed booking form.
- Public provider failures can recover through the existing verified FAQ path. User Vetti can recover through its existing authenticated endpoint with fallback_only=true. Recovery suppresses all model calls, preserves owner checks and produces text only. Expired/unauthorized semantic requests do not fall back to cached private cards. Recovery is bounded and does not issue a late request after its deadline.
- Offline pricing now uses the same public-pricing validation as AI retrieval: single amount, starting amount, range or contact/unavailable. It does not quote the ordinary internal Service.price field.
- Booking-help and appointment-policy intents use their corresponding verified public tools when the duplicate public_operation field is inconsistent. A catalog listing is not a substitute for booking instructions.
- Vetti Groq calls now have a separate bounded completion allowance (default 2048, bounded to 1024–2048). The old global allowance of 640 could be exhausted entirely by reasoning. The global limit, Scribe prompts, Scribe configuration and its existing branch behavior were preserved; the shared gateway override applies to Vetti tasks only. No additional retry loop was introduced.
- Numeric validation recognizes consecutive ordered-list markers as formatting. Actual prices, times and other numeric claims within list items still require verified values. Malformed numbering and unverified amounts remain rejected.
- The existing urgent safety reply is shared by offline and active chat. It returns immediately without transmitting the emergency text; subsequent messages use a fresh proposal context.
- Public requests to retrieve another person's records are screened before providers. Existing role, active-account, owner, CSRF, output-rendering and confirmation controls remain in place.
- Removed the uncalled duplicate browser serviceLookupCandidate helper. Retained still-used compatibility routes and helpers. No broad deletion of historical application code was performed.

## Public backup exposure fixed

Nine inactive vetti/user-script backup files were outside the executable flow but inside public/user. No active HTML, JavaScript, CSS, application or route reference to those backup filenames was found. The temporary local web server returned HTTP 200 for a sampled backup before cleanup.

They were moved into storage/app/private/vetti-source-backups-20261110, with original relative paths and SHA-256 hashes recorded in manifest.json. All nine hashes were verified; no mismatch was found. Sample old public URLs then returned 404; the private archive URL returned 403. The active vetti-ai.js, vetti-state.js, vetti-data.js and user-script.js returned 200. The public and user HTML pages also returned 200. This archive is recoverable and outside the public document root.

## Automated verification

Final full run: php artisan test --compact --no-ansi

**548 passed, 3707 assertions; 25.46 seconds.** Includes the existing Scribe, authorization, booking, provider-backup and Vetti tests. Test providers and in-memory test databases were used; this count is not 548 live API calls.

Nine selected real-JavaScript/mock-server checks passed:

- tools/test_vetti_proposal_availability.cjs
- tools/test_vetti_booking_species_date_memory.cjs
- tools/test_vetti_document_navigation.cjs
- tools/test_vetti_systemwide_browser.cjs
- tools/test_semantic_vetti_contract.cjs
- tools/test_semantic_vetti_browser.cjs
- tools/test_vetti_integrated_dialogue.cjs
- tools/test_vetti_five_turn_regression.cjs
- tools/test_vetti_recovery_security.cjs

The public widget and both changed user scripts also passed JavaScript syntax checks. Five previously failing checks had stale privacy wording, old response shapes or ambiguous legacy/active fixtures. Their fixtures now explicitly distinguish current semantic, authenticated compatibility and offline contracts; passing them is not presented as a live model-quality measurement.

New coverage includes dynamic/new catalog codes, active/inactive rows, constrained proposal summaries, service/species mismatch, forged pet/service/output fields, missing confirmation flags, authenticated provider-free recovery, unauthorized pet IDs, 401/403 behavior, unknown public prices/hours, request-size handoff, ordered-list numeric checks, Groq task-specific limits and inconsistent booking-help tools. Existing availability and OTP-confirmation boundaries remain covered.

## Bounded live checks

Temporary loopback server: 127.0.0.1:8031. It was created only for this verification and stopped afterward.

1. Public HTTP question: “Do you offer Blood Test and Urinalysis?” Returned source=ai, intent=services and “Yes, we offer Blood Test and Urinalysis.” Both services are in the current catalog.
2. Both /api/ai/vetti and /api/ai/semantic-vetti returned 401 for an anonymous session with a valid CSRF setup.
3. User service-level booking-help test used an in-memory fictional user, empty private facts and an array-backed session. No real owner login, pet metadata or private record was supplied. The first two runs returned fallback. In the diagnostic reproduction, Gemini timed out and Groq's reply ended with MAX_TOKENS: 640 completion tokens, 638 reasoning tokens and no visible reply. The interpreter also supplied booking_help with public_operation=services. The exact cause of the first fallback was not established from its saved metadata; the ordered-list false rejection was separately reproduced in automated tests.
4. After the fixes, the same fictional Taglish question succeeded: mode=semantic, kind=information, source=ai. Gemini interpreted booking_help in 3632 ms. Gemini timed out during reply generation; Groq then returned four concise Taglish booking steps including review and OTP in 908 ms. It did not claim an appointment was created. Reported successful-response usage was 1786 total tokens across the two successful model calls; usage for the timed-out attempt was unavailable, so this is not a complete billing total.

There was one intentional live public question and three intentional fictional User service runs, not a bulk model batch. No account dashboard or quota-reset timing was verified. Live traces were inspected only for this explicitly fictional question; normal diagnostics retain bounded categories, timings and usage rather than messages, credentials or private records.

## Limits of this verification

The User live check was service-level, not a signed-in browser journey through booking and OTP. Browser contracts used the real scripts with mocked server responses. A complete owner-session browser booking/OTP submission was not performed. This work does not establish universal language accuracy, provider uptime, unlimited catalog capacity, production security certification or provider-account privacy compliance. Catalog/prompt bounds still have an explicit manual-form handoff; the current 26-service catalog fits. No privacy approval or feature-enable switches were changed.


## Follow-up: conversation style and readable public replies

User screenshots showed repeated introductions, dense service lists and an unrelated product question followed by a full catalog. The open public tab was inspected at 127.0.0.1:8012/web-page/index.html.

The list reply already contained newline-separated bullets, but its paragraph used normal whitespace rendering and collapsed them into one block. The public renderer now builds safe paragraph, unordered-list, ordered-list and bold-text nodes. User input stays literal text; no model-provided HTML is interpreted. Long unordered lists use two columns on wide screens; the existing public conversation remains available after reload. All four public pages received updated CSS/JavaScript asset versions.

Public, User information and booking-proposal composition instructions now favor a direct, warm answer, usually one to three sentences for routine questions. They avoid repeated greetings/identity, unwanted catalogs and repetitive closing offers. Requested catalogs use one bullet per line. Unsupported items remain unverified rather than being declared unavailable. Unclear references can still be clarified, while a clearly named unverified item should receive a brief verification/contact answer. No provider-call stage, route, schema, booking authorization, OTP boundary or feature switch was added or removed for this polish.

A live Filipino guidance check exposed a separate conservative-filter false positive: ako (I) was treated as an ownership word. It was separated from actual ownership forms. Explicit identity disclosures (ako si, pangalan ko, address disclosure) and plural private-record references remain blocked. New tests cover general first-person English/Filipino guidance and private-name/record cases.

Live public-browser observations:

- “Could you list all your clinic services?” produced a direct catalog heading, no repeated introduction, and 26 semantic list items. The desktop list had two columns. A screenshot was inspected in the browser tool.
- “Do you stock aquarium filters?” was brief and did not dump the catalog, but initially asked an unnecessary service clarification. The clarification instructions were then refined.
- “Do you sell hotdogs?” after that refinement received: “I cannot verify if we sell hotdogs. Please feel free to contact the clinic directly for more information!” It did not invent a negative availability fact or append the catalog.
- “Paano naman ako makakapagbook ng appointment?” initially hit the privacy false positive. After correction it returned two Filipino sentences explaining sign-in/registration, Book an Appointment, registered pet, service, available date/time, review and OTP. No appointment was created.

There were five intentional browser submissions in this follow-up; the initial Filipino refusal was handled before the provider boundary. These checks concern public clinic information, not real patient data. Existing historical replies were preserved, including their original wording. The doctor tab was not changed.

Final full regression after all follow-up edits: **550 backend tests passed, 3727 assertions, 22.62 seconds**. The prior nine selected JavaScript checks and tools/test_public_vetti_message_render.cjs passed: **10 scripts total**. The new renderer check verifies all 26 items survive, ordered values and paragraphs remain distinct, and script/image-like content remains inert text. This is a small live communication check, not proof that every future model response will follow the style instructions. Nothing was pushed or deployed.


## Follow-up: context logic in both Vetti paths

See VETTI_CONTEXT_VERIFICATION_2026-11-10.md for the confirmed translation ambiguity, stale public/private domain context, fallback continuity, validated subject reuse, language controls and service-subset corrections. Final complete suite: **566 passed, 3858 assertions**; all **10 selected JavaScript checks passed**. Live Public browser and fictional User service-level checks retained their subjects. The signed-in User browser journey remains unverified.
