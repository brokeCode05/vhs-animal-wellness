# VHS Animal Wellness Center — Doctor AI Scribe consolidated audit

**Basis:** User-uploaded `vhs-animal-wellness-repo-v2(6).zip`, October 27, 2026. The original ZIP was preserved. This report covers the Doctor-side AI code, with adjacent Vetti and appointment smoke regressions.

## Changes in the consolidated revision

1. **Clinical-source splitting (local parser)** — Distinguishes owner testimony from exam findings when both appear within one sentence. It preserves source wording instead of classifying the entire sentence from the first cue. If mixed provenance remains ambiguous, it warns rather than extracting numeric vitals.
2. **Owner estimates (local parser)** — Adds explicit owner statements like "Owner estimates 110 bpm" to Subjective instead of filling a clinician-measured Objective vital. Historical and speculative text does not automatically become a current measurement.
3. **Unavailable measurements (local parser)** — Retains "Weight was not measured today" as an Objective note with no populated vital.
4. **Backend vital provenance** — A numeric mention is no longer sufficient: each generated value must have a named measurement and unit in a single eligible current segment. Rejects owner-only, historical, negated/uncertain, contradictory same-sentence or contradictory multi-sentence readings. In an ambiguous case, the entire Gemini proposal is rejected and the existing local fallback remains available.
5. **Backend SOAP section provenance** — Beyond verbatim transcript substring checks, obvious owner-report text is rejected as Objective, while direct examination findings cannot be offered as Subjective. Incorrect AI proposals fail closed rather than updating SOAP.
6. **Automated safeguards** — Added 18 new local stress cases, 26 backend provenance/section checks, and 16 workflow source-invariant checks. Existing suites were rerun.

**Only two existing application files were changed:** `public/doctor/doctor-scribe.js` and `app/Services/AI/DoctorScribeService.php`. No Vetti, booking, DB migration, app role, physician workflow, or Gemini flag changes were made.

## Tests executed in this audit environment

| Test | Result |
| --- | --- |
| New consolidated Scribe provenance JS suite | 18 / 18 passed |
| New backend vital & section provenance PHP suite | 26 / 26 passed |
| New source-level workflow contract checks | 16 / 16 passed (STATIC CHECKS ONLY) |
| Existing extended Scribe JS QA | 27 / 27 passed |
| Existing Objective integrity JS cases | 12 / 12 passed |
| Existing browser-example JS cases | 13 / 13 passed |
| Existing vital-safety JS cases | 12 / 12 passed |
| Existing full audit JS | 83 assertions passed |
| Existing JS AI integration | 11 assertions passed |
| Existing PHP grounding | 9 checks passed |
| Existing PHP smoke | 8 checks passed |
| Vetti booking/safety smoke | 66 assertions passed |
| Appointment availability smoke | 10 checks passed |
| PHP syntax / Node syntax for modified files | Passed |

**Not executed here:** full Laravel feature tests and browser operations. This container lacks a configured application database and the PDO SQLite extension. Earlier user-reported browser patient isolation tests passed for two fictional patients, but that is not proof of all isolation/security scenarios.

## Security and operational boundaries

- Gemini clinical drafting remains OFF in the browser and remains gated on the server by explicit clinical/provider approvals and paid-data clearance; an NDA alone is not sufficient to approve transmitting real medical information to a third party.
- Browser dictation can invoke external speech recognition. The existing shared clinical draft store may retain Scribe transcripts on this browser. This patch does NOT silently change retention, as that requires a designed migration/privacy review.
- Every SOAP proposal is assistive only. The doctor must review/apply, may edit, and must separately Save Draft. It must never finalize a consultation automatically.
- The existing deterministic parser is a fallback with limited natural-language understanding. It cannot reliably interpret all English/Filipino/Taglish clinical language. Unclassified or ambiguous statements require manual review.
- Existing prior browser validation already revealed bugs that automated suites missed. Re-run the attached browser acceptance checklist on this consolidated source.
- The uploaded ZIP contained `.env` and Git/vendor data. This deliverable intentionally excludes `.env`, `.git`, `vendor`, browser/server caches, runtime storage, backup folders, and private local state. Keep credentials and patient records out of public repositories.

## Install and verify

1. Extract the bundle outside your Laravel project; run the root `APPLY_TO_EXISTING_PROJECT.ps1` on the expected `feature/doctor-ai-scribe` branch. It checks source file SHA-256 hashes and backs up existing Scribe files before replacement. If hashes do not match, STOP and inspect manually; do not force overwrite.
2. `php artisan optimize:clear` from your real project directory. Keep Scribe/Gemini privacy gates off unless the necessary privacy/provider authorization has actually been established.
3. Run: `node tools/test_doctor_scribe_consolidated_audit.cjs`, `php tools/test_doctor_scribe_provenance_safety.php`, `node tools/test_doctor_scribe_workflow_contract.cjs` and previous JS tests.
4. Locally run: `php artisan test --filter=DoctorScribeTest` and `php artisan test --filter=ConsultationFlowTest`.
5. Run `MANUAL_BROWSER_ACCEPTANCE.md`, using fictional patients and no live records.

## Residual risk / acceptance criteria

A successful suite demonstrates tested behavior only. Before marking Scribe defense-ready, verify: isolation between two appointments for the same pet as well as different pets; invalidate stale proposals after switching visits; confirmation protects existing SOAP fields; Generate vs Apply vs Save are separate actions; reload reconstructs saved data from the server; consultations remain in progress unless explicitly completed; user/admin/other doctor access is rejected; external AI/dictation is not used for real personal data without approvals.

No Git commit, push, production deployment, database alteration, or clinical Gemini activation was performed.
