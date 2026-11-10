# Vetti conversation diagnosis

Scope: local User Vetti and its connected public and booking paths. This is a diagnosis, not a completed architecture migration. No real consultation transcripts were used.

## Active model and flow

The local configuration selects `gemini-3.5-flash-lite`. GeminiProvider posts to `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`. The configured request timeout is 40 seconds; the gateway catches provider errors and returns a generic failure.

1. `public/user/vetti-ui.js:send` builds local context, calls `VettiAI.ask`, displays its validated answer and records the turn.
2. `public/user/vetti-ai.js:ask` reconstructs booking follow-ups and handles several canned responses before the selected provider. It also has timeout/validation fallbacks to `VettiState.resolve`.
3. `userBackendProvider` calls `VettiState.resolve` first. Its explicit early returns and public-topic shortcuts decide whether semantic interpretation is reached. Rich local cards and safety responses can preempt Gemini. The legacy provider repeats local routing and can call the booking-intent or authenticated Vetti endpoints.
4. `/api/ai/semantic-vetti` authenticates and validates the request, then `SemanticVettiService` runs safety, ownership/name and privacy gates, sends an anonymized current message plus an optional structured booking proposal to Gemini, validates JSON and assembles a deterministic information response or unconfirmed proposal.
5. The frontend validates the response, checks the locally loaded pet and catalog, builds the summary and renders a Continue to Booking button. The existing form and OTP flow remain responsible for actual booking.

The application currently has no Gemini function-call loop for this flow. The semantic result is structured classification; the final text is generally created locally.

## Routing and interception inventory

- `public/user/vetti-state.js`: ordered INTENTS keyword registry and `resolve` special cases; booking extraction, safety/ownership/negation, service and clinic responses, and rich cards.
- `public/user/vetti-ai.js:ask`: booking continuation and availability handling, cancellation, fixed translation pairs, appointment and visit-preparation phrases, price follow-ups, answer validation and fallback.
- `userBackendProvider`: early local service, safety, account, category and clinic answers; public service/category/price shortcuts; rich UI; semantic candidate; legacy fallback.
- `semanticCandidate`: backend failures, disabled mode, malformed output or invalid proposal fall back; informational output is a server-authored answer, not model prose; a catalog check controls service prefill.
- `legacyUserBackendProvider`: recomputes local rules; protected local results and booking hints can bypass `/api/ai/vetti`; failed or invalid responses revert to the local resolver.
- `SemanticVettiService`: regex safety/privacy/name filters; date and ownership validation; coded clarification and information responses; failures return fallback. Recent patch resets complete state on certain new booking phrases.
- `UserVettiService`: regex-driven safety, social, account, booking, service, medical and public-topic routes; reconstructs a public question for `PublicVettiService` or emits a fallback.
- `PublicVettiService`: safety/privacy/medical rules, catalog and price handlers, context handlers, exact-alias `DeterministicIntentRouter`, `simpleIntent`, restricted reconstructed model question, output filters and fallback.
- `BookingIntentService`: keyword cue checks and semantic hints, bounded to approved service and daypart values. It does not book.
- `AiGateway` and `GeminiProvider`: data-class gates, JSON schema checks, timeout and generic provider failure handling. Refusal/HTTP status and thinking-token counts are not retained, so existing diagnostics cannot identify all errors or compute full cost.

## Context and confirmed limitations

- Frontend history is in memory and limited to 12 text turns; `clearHistory` creates a new conversation ID. The complete prior history is not sent to the semantic endpoint.
- The server keeps up to six owner/conversation-scoped pending proposals with a ten-minute expiry: pet ID, service, date and daypart. Only an anonymized alias and these preferences are supplied as prior context to the interpreter. Other app information remains in local/browser or server-specific structures.
- A previous browser test produced a generic capability answer for an indirect booking request; the local capabilities route intercepted it. Another asked for a pet and then lost the incomplete proposal. The recent patches addressed those specific examples, but they do not establish general conversation reliability.
- A combined Taglish grooming/booking question previously received only booking instructions; the one-intent schema and fixed informational answer could not represent both requests. A targeted workaround now prepends catalog names.
- Complete proposal details were incorrectly reused in a new booking request. A recent phrase-based reset addressed the tested phrase, but it is not a general distinction between a new request and a correction.
- Because the provider collapses network errors and non-success statuses to generic messages, current evidence cannot distinguish timeout, quota, safety refusal, or other server errors. No claim about the cause of those errors is justified.

## Preliminary synthetic provider probes

`tools/audit_vetti_models.php` runs isolated, synthetic structured-output probes with a simplified prompt. These are not full pipeline tests or a decision-quality model comparison.

- Both models classified the indirect booking example correctly when requests succeeded. Gemini 3.5 Flash-Lite: 7,367 ms, 105 input and 79 candidate output tokens; Gemini 3.6 Flash: 5,816 ms, 105 input and 79 candidate output tokens.
- Both classified a request missing its pet as booking with no pet when requests succeeded. Gemini 3.5 Flash-Lite: 6,785 ms, 101 input and 77 candidate output tokens; Gemini 3.6 Flash: 7,046 ms, 101 input and 48 candidate output tokens.
- Other calls failed with generic request/provider errors, including the pet follow-up. A 12-second diagnostic timeout is shorter than the configured application timeout. Costs and full token use, including any thinking tokens, are not known. No model was selected.
- The local semantic feature suite passed: 9 tests, 69 assertions. These use mocked provider outputs and are not proof of live Gemini behavior.

## Smallest justified next changes

1. Add opt-in synthetic-only trace instrumentation with route, outcome, HTTP status or classified transport/refusal reason, latency, model and complete usage metadata; exclude secrets, raw real messages and records. Keep production logging privacy-preserving.
2. Build a single server-owned conversation state and structured interpretation/tool contract behind a feature flag. Preserve owner authorization, verified catalog/availability, date grounding, privacy controls, confirmation and OTP. Define explicit state transitions for new requests, corrections, topic changes and cancellation; do not let generated output execute bookings.
3. Generate conversational text using only validated tool results, with a safe failure path. Retire redundant interceptors only after equivalent safety and regression tests pass. The proposed prompt/history data boundary needs a separate privacy review because current code intentionally does not transmit full chat history.
4. Compare models with the same complete pipeline, context, synthetic fixtures and repeated test set. Record expected/actual, route, state, facts, latency, complete token usage and calculated cost, including failures. Cover hours/location, categories, English/Filipino/Taglish, indirect and ambiguous requests, multi-turn changes and repeats, invalid/unauthorized/unavailable requests, and provider failures. Do not switch model on the preliminary probes.

## Clinical separation

The local `AI_SCRIBE_GEMINI_ENABLED` flag was switched off while provider eligibility is checked. Google's Gemini Developer API terms prohibit use in clinical practice. Whether a particular veterinary documentation use or another Google service is allowed requires authoritative provider/contract confirmation; clinic approval and veterinarian review do not by themselves resolve that restriction. No real transcript should be sent until eligibility is verified. SOAP drafts must remain editable and reviewed by the veterinarian.
