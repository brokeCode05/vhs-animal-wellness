# Vetti scope, privacy, appointment lists and safe cleanup — 10 November 2026

## Verified result

Final verification: **647 backend tests passed, 4,733 assertions; 66 offline interface scripts passed; 47 public JavaScript files passed syntax checks.**

Connected fictional checks used a memory-only database: a ten-turn Public/User sample passed, a seven-turn sample with fresh unrelated topics and normal booking passed, and a final saved-proposal slot check passed. The first slot-check attempt failed by giving generic booking guidance; its result is preserved and that handoff was repaired before the successful retry. The three samples made no new appointments or pets: every run retained the seeded counts **appointments 1 → 1; pets 2 → 2**. These are backend-service and offline interface checks, not a visual retest of the user's current browser tab. Browser control was unavailable in this session.

## Diagnosis

The requested friendly tone was not a reliable enforcement mechanism for scope or data facts. Three gaps in the current implementation needed code boundaries:

1. Private-list scope relied on the model's optional pet alias. Omitting it could query all pets, while choosing it could query one pet, despite the same dropdown context.
2. A separate generated sentence narrated whether records existed. Validation checked formatting and some unsafe content but did not establish that its statement agreed with the returned rows.
3. Public clarification with no matching service still entered a free-text composer, and User `other` could enter broad public composition. There was no explicit unrelated-task or unsupported-language result. The recipe screenshot demonstrated why a friendly prompt and numeric validation were insufficient.

A fourth overlap was confirmed during cleanup: the old browser slot helper ran before the active AI request. A server-owned partial proposal could have an empty browser copy, causing that helper to request details already stored by Laravel. Once isolated, the connected test exposed a backend interpretation gap: checking a saved proposal's times was treated as general booking help. A dedicated read-only availability intent now handles that request.

## General policy, not patches for particular questions

- The structured interpreter distinguishes supported clinic/assistant/portal requests, unrelated tasks, unsupported languages, medical concerns and private-data boundaries. The policy is based on permitted capabilities. Production code has no adobo, vacation, algebra, poem or game-specific rejection switch.
- For unrelated requests, Laravel renders a brief refusal explaining that Vetti's role is VHS clinic services and pet visits. A short topic excerpt is used only if it occurs in the current message; otherwise it says “that topic.” The refused task never enters a second free-text generation stage.
- Unsupported languages receive an English explanation that English, Filipino and Taglish are supported, instead of an AI-outage or booking message. Pure non-Latin text has a local, provider-free preflight; romanized and other Latin-script languages are classified by the interpreter. Non-Latin script detection is general Unicode classification, not a list of Japanese phrases.
- Other-owner references are refused before pet/record lookup and provider interpretation. The message explains account ownership and privacy without confirming whether that owner or pet exists. The same privacy explanation is connected to Public and authenticated recovery paths.
- Unknown clinic items remain distinct from unrelated tasks: an unverified item receives a clinic-verification explanation. Empty public-service clarification no longer opens an unrestricted composer.
- Actual service failure, an unverified generated reply and an expired login receive different recovery wording. Generic failures no longer append an irrelevant “No appointment was made.”
- Identity and capabilities remain supported in Public and User chat. The descriptions use verified role/capability data, with public-only access on Public Vetti and own-account access on User Vetti.

Free-text classification is still model-based; this evidence does not establish correct classification of every possible wording. Authorized database scopes and final mutations remain server-controlled regardless of model interpretation.

## Appointment and document lists

New list requests use the current authorized dropdown pet by default. A current explicit owned pet name takes precedence. An explicit all-pets request can select the owner-wide list; a model cannot broaden a request merely by omitting an alias or emitting `all_pets` without corresponding wording.

Upcoming visits, completed visits and document listings share that scope resolution. Their existence/status sentence now comes directly from the returned rows. No model call is needed to narrate whether that list is empty, and no record/existence data is sent for that narration.

The response includes typed list scope and pet identity for the interface. The interface validates selected-pet rows, labels the scope and displays all returned rows (up to the existing server limit of five). An empty authoritative server array cannot be replaced with account-wide cached appointments or stale action buttons. Previous chat messages remain snapshots; switching the dropdown changes subsequent requests rather than rewriting history.

## Safe cleanup and preserved functionality

- Removed the unreachable older `appointmentGuidance` branch/method: completed-history and cancel/reschedule requests already return through the connected authoritative list paths.
- Excluded the old local availability helper from the active semantic route. The earlier local date-message rewrite was already excluded; browser continuation logic also remains excluded for server-owned proposals.
- Added `booking_availability` as a read-only intent. It resumes validated session-owned proposal fields and ignores model-suggested edits while checking slots. It creates no appointment.
- Kept shared offline helpers and verified FAQ recovery where callers/tests still use them. Removing those working functions would have broken outage/offline behavior; they are isolated rather than deleted speculatively.
- Preserved original booking review and OTP, availability validation, registered-pet ownership, editable pet prefill, decimal weights, month ages, and the previous Scribe/clinical protections. No Scribe implementation files were modified in this pass.
- The expanded routing instructions briefly exceeded the existing 4,000-byte guard during development. Offline tests caught it before any provider run with that oversized version. The final semantic instructions are **3,707 bytes**; the guard was retained.

## Connected fictional observations

| Sample | Observed outcome |
|---|---|
| Public/User identity and capabilities | Vetti explained his role; the facts distinguished public and signed-in capabilities. |
| Selected pet with a visit → another pet without a visit → explicit all-pets request | Correct individual/empty/account-wide results and matching status text. |
| Documents for another owner and their named pet | Privacy explanation; no provider or record lookup. |
| Public recipe request after identity | Scope refusal, no recipe. |
| Japanese script and romanized greeting | Language-limit explanation. |
| Fresh vacation, algebra, poetry and game-code requests | General scope refusal in User/Public paths. |
| French greeting | Supported-language explanation. |
| Normal consultation booking → 4 PM correction after refusals | Proposal and corrected time worked; no booking created. |
| “Check available slots” for a seeded saved proposal | First attempt gave generic help; after repair, the retry returned verified open times for the saved date/service. |

The final slot retry used Groq after Gemini timeouts for interpretation and response. The earlier samples also exercised recovery from timeouts/HTTP 503. Successful samples do not mean providers never fail.

## Evidence and provider accounting

- [Full backend results](backend-tests.txt)
- [66 offline interface results](javascript-results.json)
- [47 JavaScript syntax results](javascript-syntax.json)
- [Ten-turn connected sample](fictional-live-results.json)
- [Seven-turn fresh-topic/booking sample](fictional-broad-scope-results.json)
- [Failed first slot check](fictional-slot-resume-first-attempt.json)
- [Successful final slot check](fictional-slot-resume-result.json)

The ten-turn sample had 11 logical model stages and 13 provider attempts, with 10,540 reported tokens and two attempts lacking usage. The seven-turn sample had nine logical stages and 13 attempts, with 11,163 reported tokens and four attempts lacking usage. The failed first slot check reported 2,476 tokens; the successful retry reported 3,388. These are reported usage values for these runs, not complete billing totals or a count of all debugging activity. Timeout attempts do not always report an HTTP count.

One original harness entry reused the previous gateway diagnostics for the zero-call public language preflight. The unchanged original is retained in `fictional-live-results-original.json`; the corrected result annotates that entry. The harness now resets diagnostic metadata per turn without making a provider request. No additional provider calls were made merely to correct that accounting.

All project work stayed under `D:/Cap/V3/vhs-animal-wellness-repo-v3`. Local source checkpoints are in `storage/app/private/vetti-boundaries-before-20261110`. No API keys or environment files were changed or printed. Nothing was pushed or deployed. Refresh the User portal for the updated browser files before teammate testing.
