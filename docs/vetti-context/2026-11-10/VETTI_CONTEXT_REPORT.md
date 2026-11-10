# Vetti context repair and voice update — 10 November 2026

Scope: Public and authenticated User Vetti, only in D:\Cap\V3\vhs-animal-wellness-repo-v3. No push/deploy. No real appointment, patient record, email or text message was created/changed by this test work. Live model inputs used fictional records in a separate SQLite in-memory database.

## Requested behavior

Vetti should retain conversational context across supported topics, accept short corrections without making people repeat clear information, and respond to the actual scenario. The requested voice matches the puppy mascot: cheerful, warm, simple, gently playful and approachable, without baby talk, forced slang, formal receptionist wording or repetitive greetings. It should stay calm and clear for errors and urgent concerns.

A teammate suggested messages such as a slot being taken just now. The implementation gives backend-verified reasons instead. A current capacity conflict alone does not prove someone just took a slot, so that causal claim is rejected unless actual change evidence is available. No new appointment is implied by a proposal.

## Confirmed underlying problems and repairs

1. **Equivalent update fields collided.** The merger mapped time_preference and exact_time_expression to time, then rejected that pair as duplicate updates. It now checks genuine repeated raw fields separately and collapses equivalent time metadata into one update.
2. **Harmless clock normalization was rejected.** Time matching required a verbatim copy. Equivalent explicit expressions such as 7pm and 19:00 now match only when the same clock value appears in the current user message. A made-up or AM/PM-ambiguous time is still rejected. A legacy hardcoded 07:00 cutoff was removed: the real backend schedule decides which starts are offered.
3. **Clear named pets could be missed.** A unique owner-scoped exact name can repair an omitted model alias. Duplicate names, other-owner pets and conflicts between an explicitly named pet and a different selected/model pet still require safe resolution. A previous pet alias can support an unambiguous latest-topic reference; names and record details are not sent as history.
4. **Rule clarifications erased useful topic context.** A bounded structured frame now retains the interpreted topic/pet when a rule asks for a missing detail. Failed interpretation/merging does not replace the last usable frame. Explicit safety/ownership/opt-out paths still clear context. Frames remain owner/conversation scoped and expire.
5. **Public subject context could disappear when text history was trimmed.** Successful semantic public answers now also save the catalog-validated topic/service/choices through the existing bounded public-context store. The next interpreter receives a compact verified subject independently of the two-turn public text window. Private records and replies never enter that public store. New subjects replace the prior topic; a public price cannot be inferred from a private record.
6. **Service codes and labels diverged between booking and information.** The active catalog now reconciles canonical codes to public labels. A species-resolved grooming proposal retains its active code for later price/preparation/policy references. Service selection lists use current active labels even before public text history exists.
7. **Exact-time alternatives were hidden by a derived daypart.** Asking about 5pm could filter out all later evening starts and lead to an overly broad no-slots answer. Exact-time alternatives now retain backend-valid later starts across dayparts, without claiming they fit personal commitments. A plain morning/afternoon request still uses its stated broad preference.
8. **Generic failure wording obscured real causes.** The response composer now receives the backend conflict reason (past start, occupied resource, no eligible doctor, closed hours, estimated finish after closing, or outside offered starts). If generated wording cannot be accepted, a short reason-specific Laravel reply can still give verified alternatives. This recovery adds no model request.
9. **User public-operation schema lagged behind the resolver.** Preparation, signup and combined clinic topics were supported by the resolver but absent from the semantic operation list. Public and User now share the existing read-only operation vocabulary. This grants no new write capability or private access.
10. **Voice instructions could overflow the existing 4,000-byte instruction limit.** The regression suite caught this during the change. Shared voice guidance and repeated response rules were shortened; the limit was not raised. The final complete tests passed after consolidation.

The source fixes contain no patient names, named consultation scenarios or fixed requested appointment times. Those appear only in fictional test cases. Availability, service eligibility, ownership, OTP and confirmation remain server-controlled. Scribe prompts/workflows were not changed; the shared voice applies only to Vetti response tasks.

## Verification

- **633 backend tests passed, 4,360 assertions** — backend-tests.txt. These include existing auth, booking, QR/OTP, clinical review, Public/User Vetti and new context cases. Isolated test database and fake keys/mocked providers for this suite.
- **62 offline JavaScript scripts passed** — javascript-results.json. These are VM/static checks of actual scripts, not 62 real browser sessions.
- **165 application/routes/public JavaScript syntax checks passed** — syntax-results.json.
- New context regressions cover exact-time/daypart duplicates, omitted pet alias, equivalent clocks, invented-time rejection, missing-date clarification, short time changes, document/translation references, topic replacement, trimmed text history, separate/expired chats, shared public operations, puppy-style response instructions and no extra tone-generation call.
- New booking tests retain evening alternatives after an exact afternoon request, expose the real backend reason and reject an unsupported just-taken claim.

## Bounded live fictional model check

The final connected check completed **eight conversational turns** using real configured providers and a disposable SQLite :memory: database. It exercised real service/availability logic against fictional fixtures and an isolated session; it was not a physical-phone/browser test.

User sequence: book fictional Maple consultation today at 7pm; ask What about 5pm; change to grooming at 8pm; ask How much does that cost; request Tagalog. Public sequence: ask about cat grooming; ask How much is it; request Tagalog.

Verified results: the occupied consultation start produced valid later alternatives; the past-time follow-up retained the request and returned later alternatives; the service/time correction retained pet/date and produced a dog-grooming proposal; the price question referred to dog grooming and returned the seeded PHP500; Tagalog retained that subject/amount. Public service-to-price-to-Tagalog retained Cat Grooming and its seeded PHP450. Appointment count stayed **1 before and 1 after** (the pre-seeded fictional capacity hold); no appointment was created.

The first occupied-slot wording needed the verified rule recovery after the generated text failed the existing acceptance checks. This is recorded as source rule, not presented as an accepted model reply. The connected final run had no fallback-mode failure or request for the user to repeat the already supplied pet/date/service.

The final eight-turn sample had 16 generation stages and 18 recorded provider attempts (including fallback attempts). Provider metadata reported 16 HTTP requests; two attempts did not report HTTP request count. Token totals reported for 16 attempts sum to 14,233; two attempts lacked token totals. These are partial provider-reported totals for that final sample, not the total cost of the entire debugging session. Earlier diagnostic runs and their failures are not included in that figure. Details are in fictional-live-results.json and fictional-live-metrics.json.

The live run preceded the final shortening of voice instructions and alignment of the public-operation list. Those final refinements passed the complete offline suite; no additional live batch was run solely for that wording change. The sampled replies still had some unnecessary closing offers, so the final guidance specifically asks Vetti to stop when the question is answered. A subjective teammate acceptance review of that final voice remains useful.

## Practical limits and remaining check

Local browser control is disabled in Work settings at this point. No current phone/tunnel User Vetti retest was performed in this pass; browser access was not bypassed. Reload Vetti to pick up the edited UI asset, then test a fresh conversation with several topics and short follow-ups. The live tests above are service-level connected calls, not evidence of every mobile interaction.

Context is deliberately bounded and expires. Unsupported/ambiguous references still need a targeted clarification. A new chat does not inherit another chat's proposal or private subject. Provider outages, quotas and arbitrary model misclassification remain possible; this batch is not a universal accuracy percentage or a guarantee that every phrasing will succeed. Existing authorization, verified facts, review/OTP confirmation and privacy controls remain authoritative.

## Evidence/recovery

Before-edit files: storage/app/private/vetti-context-before-20261110. changed-files.csv records source hashes; no Git repository exists for a commit baseline. New fixtures/harness are tests/Feature/AI/VettiUniversalContextRepairTest.php and tools/test_vetti_context_fictional_live.php. The live harness requires --fictional-live and refuses any database other than SQLite memory for its fixtures. Do not run broad live batches casually; preserve the measured budget and use mocked regressions for routine checks.
