# Doctor Scribe system safety audit — 10 November 2026

## Conclusion and scope

The audited workflow supports continued controlled testing with fictional consultations and mandatory clinician review. This audit does not establish clinical reliability, permission to process actual patient data, or production security certification.

Work was confined to D:\Cap\V3\vhs-animal-wellness-repo-v3. No model API calls were made for this audit, no credentials/settings were changed, and nothing was pushed or deployed. The open fictional consultation was inspected read-only; its current working draft was left unchanged. Browser safety fixes load after refreshing the portal; preserve any pending work or audio before refreshing.

## Verified protections

| Area | Evidence and practical boundary |
| --- | --- |
| Doctor authorization | Scribe text/audio require an active authenticated Doctor, assigned appointment and in-progress consultation. Authorization precedes checkpoint access. Wrong-doctor/inactive-consultation tests passed. ActiveAccount also checks account status, verification and session auth version. |
| Provider/privacy gates | Clinical enablement, clinical clearance and paid-data approval switches guard external calls; Groq backup/audio and independent review have separate switches. A local approval flag does not verify an external contract or account setting. |
| Limited contact guard | Common email and Philippine mobile formats are rejected before external text processing. This is not anonymization: names, addresses and spoken identifiers are not comprehensively removed. |
| Source and display | Complete source remains available; IDs, offsets and surrounding context are preserved. Drafts and source strings use textContent/value rather than HTML interpretation. Source locations and AI verdicts are not factual verification. |
| Working drafts | Encrypted database payloads, doctor scoping, revision conflicts, no-store responses and transcript-retention purge tests passed. Older transcript expiry increments the revision so stale windows cannot restore it silently. |
| Retry checkpoints | Encrypted 15-minute cache entries, opaque scoped job IDs, concurrent duplicate locking, source-version rejection, reviewer-only retry and reviewer-version invalidation passed. Expiry after 16 minutes was exercised offline. |
| Provider responses | Incomplete output is rejected even with valid JSON. Budgets and approved fallback behavior, safe finish/usage metadata, format-retry aggregation and cooldowns passed. No raw prompts, response bodies or keys are intentionally included in diagnostics. |
| Recording recovery | Twenty-one simulated workflows passed, including a five-minute recording, microphone/recording errors, limits, 413/422/429/503, network and timeout, pending long transcript recovery, and patient changes. Delivered audio chunks remain available rather than silently discarded. |
| Apply and manual vitals | Source/full-transcript confirmation, edited-draft invalidation and asynchronous Apply races passed. Only doctor-confirmed current vital values are applied; blank reviewed values clear old values. |
| Completion interaction | Eleven simulated completion workflows passed: normal reviewed completion; late recordings; patient changes; changed review or draft generation; failed flush; and a patient change during the final response. |

## Reproduced and fixed during this audit

1. **Renewed credentials could inherit an old cached wait.** A cached unavailable review was reused even after its key changed. The retry cache now fingerprints quota context without retaining credentials. A renewed key retries review using saved generation; completed proposals remain reusable.
2. **Checkpoint-store outages caused generic failures.** A failed lock/read now returns checkpoint_unavailable before provider work begins. The UI describes secure retry storage rather than incorrectly implying a model failure.
3. **A cache write/release failure could hide a finished proposal.** Finished work remains reviewable, with an explicit recovery warning when its checkpoint cannot be saved. A failed lock release cannot replace the finished response; the lock has a bounded lease.
4. **Finalization could race with new Scribe work.** The old handler did not recheck all recording states after confirmation and could discard newly started browser dictation. It also built a clinical payload before awaiting a working-draft flush without checking for intervening edits. Finalization now stops for late audio, changed patient, changed draft generation or withdrawn review. It binds its save to the original patient, and a late completion response cannot update a newly selected patient.

An older experimental-portal regression also inherited the locally enabled single-pass flag. Its test now explicitly disables that separate branch. This changed test isolation, not runtime routing or clinical output rules.

## Final validation

- **227 backend tests passed, 1690 assertions**, covering all Scribe feature tests, Groq audio, encrypted working drafts/retention, consultation lifecycle, and relevant shared provider diagnostics/fallback tests.
- **16 JavaScript scripts passed**, including 21 simulated recording workflows, 11 completion workflows, server working-draft failure/conflict handling, source confirmation/edit races, manual vitals, full-length adapter and the comprehensive local-parser audit (83 assertions).
- Both edited browser scripts passed syntax checks.
- The initial broader run had one legacy-branch isolation failure. The new outage/key-rotation tests reproduced three failures before the fixes; the new completion test reproduced the late-audio race before its fix. The final complete selection passed.

These counts are control-flow, mock and simulation checks. They are not live clinical-accuracy cases, a browser/microphone hardware certification, a penetration test, or a provider-capacity benchmark.

## Read-only portal observation

The current fictional medium Taglish skin case was already applied by the user. Its visible Objective included current 6.8 kg and previous clinic weight 7.4 kg, while temperature and pulse fields were blank. The source remained visible in the transcript field; the page reported that the working draft was saved to the clinic server. The final review checkbox was unchecked. No pending recording controls or proposal Apply panel were visible. This audit did not generate another proposal, change the source, save a clinic record, or complete the consultation.

## Boundaries still requiring attention

- AI can misplace categories, retain unnecessary wording, or change meaning, and its reviewer can miss errors. The earlier unknown-versus-abnormal error remains a confirmed reviewer false negative. The successful current case is not proof of universal accuracy or a guarantee that no advice can be invented.
- Review checkboxes are portal workflow controls. The general consultation completion API authorizes a doctor and checks lifecycle state, but does not itself require a separate review-checkbox attestation. This audit did not add one or claim server-side proof of review.
- Near-30000-character input preservation/limits were tested offline. A successful live 30000-character generation and a real uninterrupted 30-minute microphone session remain unverified.
- Audio is tab memory, not a durable recording archive. Browser/process/OS termination can lose undownloaded audio despite navigation warnings. Downloaded audio/transcripts are unencrypted files and need approved private storage.
- The transcript purge is scheduled daily in source and its behavior passed tests. Actual continuous operation of the host scheduler was not verified.
- Provider cooldowns are not an organization-wide token reservation queue. Other users, applications or keys can still consume provider capacity.
- The app encrypts its own working drafts/checkpoints; this does not establish the provider's retention settings or clinic approval. [Gemini terms](https://ai.google.dev/gemini-api/terms) distinguish provider data-use conditions; [Groq data controls](https://console.groq.com/docs/your-data) describe account-controlled retention options. No provider dashboard, billing tier, agreement or actual Zero Data Retention setting was verified.
- The CLI configuration snapshot was local, debug false, database cache, HttpOnly cookies, SameSite lax, and secure cookies false. The active Scribe/backup/audio approval switches were true; independent review and diagnostics were false. This is a localhost configuration assessment, not a deployed HTTPS review.

Separate appointment-status and browser/session issues previously reported by the owner remain outside this Scribe audit; they must not be represented as resolved by these results.

## Files changed

- app/Services/AI/ScribeDraftRun.php
- app/Http/Controllers/AI/DoctorScribeController.php
- public/doctor/doctor.js, doctor-scribe.js and index.html
- tests/Feature/AI/ScribeDraftRunTest.php and DoctorScribeExperimentalPortalTest.php
- tools/test_scribe_single_pass_adapter.cjs and test_scribe_completion_races.cjs
- This audit report and the requirements history.
