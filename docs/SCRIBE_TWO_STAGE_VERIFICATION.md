# Scribe two-stage workflow — 10 November 2026

The active opt-in single-pass workflow was updated in D:\Cap\V3\vhs-animal-wellness-repo-v3. No push or deployment was performed. The configuration opt-in and established clinical/privacy approvals remain required.

## Applied design

- One statement-based drafting call and one consolidated bidirectional review. The active path no longer calls ScribeCorrectionReview or an automatic oversized-section polishing stage. Older workflows remain available to their existing callers; they are not invoked by this branch.
- Section text is assembled from the same canonical statements that carry source passage IDs. IDs and offsets locate source; they do not establish clinical support. Source context and the complete transcript remain available.
- Review covers meaning, placement, corrections, uncertainty, observations/measurements, action status, conditions, and the selected language. It returns compact issue records rather than two discarded SOAP rewrites. It is advisory, even when no issue is found.
- Explicit needs_manual_compression outcome if a section cannot fit. Field ceilings remain Subjective 2000, Objective 1000, Assessment 800, Plan 1000. No silent clipping or independently concatenated chunk summaries.
- Gemini full-transcript output ceiling raised from 2048 to 4096 after the live long-case MAX_TOKENS failure. Direct and fallback Groq full-transcript calls also use 4096. Punctuation-only low reasoning remains isolated from SOAP reasoning.
- Reported MAX_TOKENS/length is rejected even with schema-valid JSON. Empty responses retain safe finish and usage metadata; hidden reasoning is not returned as clinical text. Groq format-retry usage is aggregated when reported.
- The browser now allows 115 seconds, exceeding the existing 90-second processing deadline. Authorization precedes all cache access.
- Identical doctor/appointment/consultation/source/language/model configurations share a stable opaque job ID. A 120-second lock prevents duplicate concurrent processing of that job. Completed results and validated generation checkpoints are encrypted in the existing private cache for 15 minutes. Unavailable-review retry reuses drafting; a review-version change rechecks the saved generation.
- Provider cooldown is shared across Scribe calls using the same credential and model. Numeric/date Retry-After is honored when available; otherwise a one-minute retry-storm guard is used. This is not a claim about the actual quota reset time. No repeated sleep/retry loop was added.
- The review panel is editable before Apply. Any edit invalidates confirmations and makes clear that the AI check covered the generated wording. Applying requires source/whole-transcript confirmations and explicit manual review. Uncited source remains accessible separately; absence of a citation is not itself called an omission.
- Newly doctor-confirmed vitals replace existing vitals; blank reviewed values clear old values, as requested. Model-derived vital values are not applied.

## Verified fictional portal cases

The current authorized fictional consultation was used. Suggest sentence breaks was used and reviewed before generation in each new case.

1. Short English paw-licking case: complete proposal and automated review; corrected five-day history, laterality, uncollected sample, no prescription, conditional return. Reported drafting plus review: 2542 tokens. Editing reset confirmations. Repeating generation returned the saved proposal without redrafting.
2. Medium Filipino eye case: complete proposal and automated review; final six-day history, left/right eye distinction, unperformed test, uncertain cause and conditional follow-up retained. The earlier superseded five-day statement was also retained, so conciseness is not optimal. Reported drafting plus review: 3517 tokens.
3. Long Taglish balance case: original input 5357 characters. Initial generation reached Gemini MAX_TOKENS at the old ceiling, followed by a Groq usage-limit response; no completed draft was returned and the source was preserved. After ceiling parity, a complete 3290-character proposal was returned. It retained the late twelve-day and three-witnessed-episode corrections. Reported generation plus first review: 8705 tokens. A review-only recheck reused drafting; the displayed generation-plus-latest-review total was 8735, which replaces rather than adds to the earlier displayed total.

The long-case reviewer missed an inaccurate phrase: an incomplete neurological examination was rendered as not normal or complete. A generic unknown-versus-abnormal instruction was strengthened, but the review-only recheck still missed this wording. It was corrected manually in the preview before Apply. This is a confirmed false negative; no claim of automatic clinical verification is made.

The applied fictional proposal retained manually confirmed current weight 7.8 kg, replacing an old 8.2 kg. Old temperature 38.5 and heart rate 120 were cleared because their new reviewed fields were blank. Apply before confirmations was blocked. The SOAP form received the edited proposal; Save Draft and Complete Consultation were not selected. Working-draft autosave remains active and was visibly reported by the portal.

Provider token figures exclude sentence-break calls, the initial failed long generation, and any unreported usage. They are not billing totals or a controlled old-versus-new model-cost benchmark. No more provider calls were made after the review-only recheck.

## Limits of this verification

- Three fictional cases and automated regressions do not establish clinical reliability. The doctor must still compare with the whole transcript, including after a no-issue verdict. The generator and reviewer can share the same provider and repeat a mistake.
- Near-30000-character input preservation and limit handling were checked offline. The longest new live source was about 5400 characters after reviewed punctuation; no successful live 30000-character run or real 30-minute recording is claimed.
- Provider cooldown and per-job locking are not a provider-wide organization queue or a token-reservation scheduler. Other applications, API keys in the same organization, Vetti, and other doctors can still consume quota. Provider capacity cannot be created by this patch.
- Identical completed requests are reused for up to 15 minutes. Doctor editing is available immediately; a changed transcript/language/context starts a different job.
- No permanent source archive was added. Existing working-transcript retention (30 days) is unchanged. Reviewed punctuation intentionally changes the working version; original text remains available for comparison until the doctor accepts the suggestion.
- Shared cache availability and Laravel application encryption remain operational dependencies. Cache records contain encrypted proposals/source context, never plaintext clinical data in job keys or diagnostics.

Primary implementation references: app/Services/AI/ScribeSinglePassDraft.php, ScribeSinglePassReview.php, ScribeDraftRun.php, ScribeProviderCooldown.php, AiGateway.php, Providers/GeminiProvider.php, Providers/GroqProvider.php, app/Http/Controllers/AI/DoctorScribeController.php, and public/doctor/doctor.js and doctor-scribe.js.

Provider guidance checked: https://console.groq.com/docs/rate-limits and https://console.groq.com/docs/api-reference. Provider limits are account-dependent; a context-window capacity is not a quota guarantee.

## Final offline validation

The final targeted backend suite passed **117 tests / 1074 assertions**. It covered the active statement contract, language-policy transport, source-version mismatch rejection, encrypted checkpoint storage/locking/resume, reviewer-version invalidation, authorization after a cached response, privacy gates, MAX_TOKENS rejection with valid JSON, empty output with usage, direct/fallback budget parity, safe quota metadata/cooldown, aggregated Groq format-retry usage, shared provider diagnostics and lossless source chunking.

Nine JavaScript check scripts passed: summary/edit confirmation and asynchronous races; full-length response adapter; source views; punctuation errors; recording recovery (21 simulated workflows); reviewed-vitals replacement; 12 additional vital-safety cases; 18 consolidated provenance cases; and encrypted retry-cache behavior. Both edited browser scripts passed syntax checks.

These offline checks use mocks/simulation and must not be counted as additional live clinical-accuracy cases. No new automated tests or scripts invoke a real provider API. No settings, credentials, push, deployment or consultation finalization were performed by this upgrade.
