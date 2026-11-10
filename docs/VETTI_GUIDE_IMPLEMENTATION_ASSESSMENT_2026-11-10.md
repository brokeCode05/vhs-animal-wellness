# Public and User Vetti — guide and implementation assessment

Date: 10 November 2026. Repository: D:\Cap\V3\vhs-animal-wellness-repo-v3.

The supplied orca_share_media1794059509457_7524830976754049970.txt was read as a proposed requirements guide. This assessment inspected the current implementation before proposing changes. No Vetti program files, provider switches or Scribe files were changed. No live model requests or real bookings were made. Only this assessment document was added.

## Intended responsibilities from the guide

Public Vetti is a clinic receptionist: authoritative clinic information, configured active services/prices/policies, registration/booking guidance, general non-diagnostic education and appropriate redirection. User Vetti additionally reads only the signed-in owner's permitted pet/appointment metadata, retains booking preferences, checks real backend availability and prepares an unconfirmed proposal. Existing form, Laravel validation, OTP and clinic confirmation remain authoritative. Preserve the mascot, working functionality, public/private separation and existing schema/endpoints. Improve in small phases rather than rewriting the chatbot.

## Current connected flow

- Public widget: public/web-page/public-vetti.js -> POST /api/ai/public-vetti -> PublicVettiController -> PublicVettiService -> safety gates -> PublicGeminiConversation when enabled. The model interprets a permitted question; PublicClinicDataResolver/PublicClinicFacts retrieve authoritative data; a bounded response is generated and checked. Legacy deterministic service/topic routines remain when the AI conversation path is not selected.
- User widget: public/user/vetti-ui.js -> VettiAI.ask -> userBackendProvider -> semanticCandidate -> POST /api/ai/semantic-vetti. SemanticVettiService authorizes/masks owned-pet references, interprets a bounded request, merges server-owned structured proposal state, queries private facts locally or public data, and returns permitted information/navigation or a proposal.
- BookingConversationService uses an authenticated subrequest to AvailabilityController, reads an active Service row, filters real slots by preference, and returns an unconfirmed summary. It does not insert an appointment. VettiTools hands off to the existing interface; final booking remains outside AI.
- Current frontend sets VHS_SEMANTIC_VETTI=true. With that flag, failure or disabled semantic responses produce semanticUnavailable; the browser does not automatically use legacyUserBackendProvider. Older canned routing is not all active simultaneously. The earlier vetti-conversation-diagnosis.md predates these current paths and some of its assertions are stale.

## Existing foundation

| Requirement | Current evidence |
| --- | --- |
| Authoritative public facts | PublicClinicFacts reads ClinicSetting, active public doctor directory and active Service rows. It does not load owners, pets or appointments. Opening hours and appointment windows have separate fields. |
| Prices | Public prices use explicit pricing_type/min/max/currency metadata. Missing approved pricing is treated as unknown rather than using an arbitrary amount. |
| Private owner scope | User routes require auth, active account and User role. UserVettiFacts filters owner_id/user_id and returns bounded metadata. Document contents are not supplied to the model. |
| Model privacy | Known pet names are replaced with aliases; contact/medical/secret filters precede provider requests. This is a limited safeguard, not guaranteed anonymization. Only permitted public conversation history is retained for model context. |
| Context | Owner/conversation-scoped proposal state exists. The active semantic service also retains the last two permitted public-information exchanges for 10 minutes; raw complete chat history is not sent indiscriminately. Browser proposal/history and legacy topic state also exist for their respective modes. |
| Availability | BookingConversationService delegates real slot checks to AvailabilityController; the model receives verified slots rather than inventing availability. |
| Booking confirmation | Proposals explicitly declare booking_created=false/requires_confirmation=true. Existing form and OTP remain responsible for final confirmation. |
| Visual identity | Existing Vetti asset set and widgets remain in place. No mascot/branding change is needed for these implementation gaps. |

## Confirmed gaps and causes

### 1. Booking vocabulary and the active catalog differ

SemanticVettiService::SERVICES is a fixed set of coarse hints; the browser PHASE4_SERVICE_HINTS also constrains proposal acceptance. BookingConversationService directly looks up Service.value, with a special mapping only for species-specific grooming.

A read-only query found **26 active services**, of which **17 active values** are outside the interpreter list even after accounting for dog_grooming/cat_grooming. Examples include blood_test, urinalysis, health_certificate and castration. Thus the current proposal contract cannot directly represent all active service codes. This is a concrete coverage constraint; it does not mean those services cannot be booked through the normal form.

Minimal direction: use the existing active catalog for supported service choices, map generic requests to verified choices, clarify ambiguity, and validate the same server-provided value in the browser. Do not add one new phrase or hardcoded enum entry per service. Preserve all owner, date, availability and OTP checks. Check naming/privacy filters as part of this change: a legitimate catalog label must not be mistaken for an unknown person's name.

### 2. Active AI failure bypasses useful verified FAQ answers

PublicVettiService immediately returns PublicGeminiConversation's result. Its failure response is an unavailable message with the verified phone when present. User semantic failures return a generic semanticUnavailable message. Existing catalog/FAQ rules and manual booking screens still exist, but ordinary supported questions do not reliably recover through those FAQ answers while the active model path is unavailable.

This differs from the supplied guide's requirement to retain essential deterministic clinic information during provider failure. Minimal direction: explicit, transparent recovery using current Laravel facts for supported public questions, plus a safe handoff to the existing booking form. Do not pretend a model call succeeded or infer booking availability after a failed check.

### 3. Regression coverage is split across current and older contracts

The backend baseline is passing, but five of eight selected browser check scripts failed. They are not five independently proven active-path defects:

- test_semantic_vetti_contract.cjs expects an older exact privacy sentence. The current UI instead discloses Google Gemini or Groq, automatic filtering limits and avoiding private information.
- test_semantic_vetti_browser.cjs successfully handles its initial synthetic booking proposal, but later expects the disabled semantic path to fall back to legacy automatic openBooking. Current behavior intentionally returns unavailable.
- test_vetti_systemwide_browser.cjs, which omits the current semantic flag and mocks the older endpoint, receives a broad service-category answer where it expects Boarding. This is a reproduced legacy-path routing mismatch.
- test_vetti_integrated_dialogue.cjs and test_vetti_five_turn_regression.cjs also exercise legacy/mocked routing and fail older reply expectations. They need current-contract fixtures and active-path cases before their failures can establish live model defects.

Minimal direction: preserve useful legacy coverage, explicitly label mode, update obsolete fixtures, and add the guide's acceptance conversations against the active browser-server contract. Passing old parser tests is not evidence that the active AI conversation works.

## Test results from this inspection

- **163 backend tests passed; 1131 assertions.** Selected all Feature/AI Vetti/PublicGemini/BookingIntent tests and the owner-scoped private-records test. Providers were mocked.
- **8 browser/JavaScript check scripts run: 3 passed, 5 failed.** Passing: proposal availability, booking species/date memory and document navigation (45 assertions). Failure distinctions are above.
- No Gemini/Groq model calls, no live portal bookings, no SMS/OTP submissions and no settings changes were made during this inspection. These results do not establish live conversation quality.

## Local configuration snapshot

Public Vetti, public conversation, User Vetti, semantic Vetti, booking-intent and both Groq public/user backups are enabled. The local paid-data and semantic-privacy approval switches are true. Service lookup is disabled. Vetti model is gemini-3.5-flash-lite; Groq is openai/gpt-oss-20b. No credentials were printed.

The guide's instruction to keep an unreviewed pilot disabled must be reconciled with this existing test configuration and its earlier approvals; no switch was silently toggled. Local approval flags are not external provider account/privacy verification.

## Smallest useful implementation sequence

1. Repair the active service selection/proposal contract around the actual catalog, covering generic requests, exact services, similar names and unavailable services. Keep one authoritative availability/booking path.
2. Restore transparent verified-FAQ recovery for model failures. Retain pending preferences and clear confirmation status, without turning unverified slots into proposals.
3. Align the active browser/server regression fixtures, then test the guide's ordinary questions and multi-turn changes in English, Filipino and Taglish. Include provider errors, expired authentication and unauthorized pet IDs. Only then run a small, measured fictional live batch.

Keep Scribe unchanged throughout this work. Do not remove old files merely because they exist: check their actual callers and retire a path only after its replacement passes the applicable tests. No new database tables, endpoints, dependencies or general-purpose chatbot architecture are justified by this inspection.
