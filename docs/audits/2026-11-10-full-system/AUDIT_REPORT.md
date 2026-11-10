# VHS full-system audit and authorized repair report

**Date:** 10 November 2026, Asia/Manila. **Project:** `D:\Cap\V3\vhs-animal-wellness-repo-v3`. The user expanded the original read-only audit into permission to fix confirmed findings and implement reception QR check-in. Nothing was pushed or deployed.

The repair pass improves the tested security and workflow boundaries. It is not a claim that every control, live model output or real deployment path is reliable. No Critical exploit was confirmed. High findings below describe reproduced unsafe boundaries or published package affectedness, not a demonstrated account compromise.

## Verified test results

| Layer | Baseline | Final result |
|---|---|---|
| PHP/Laravel isolated tests | 566 tests / 3,858 assertions passed | **582 passed / 3,978 assertions**, zero failures/errors |
| Underscore-named JavaScript scripts | 47/55 passed, 8 failed | Final inventory below includes one separately discovered hyphen-named test and new regressions |
| Final local JavaScript scripts | Additional working-store baseline passed unchanged | **59/59 passed** |
| PHP/public-JavaScript syntax | Not used as behavioral proof | **298 files**, zero reported syntax failures |
| Composer security audit | 8 advisories across 5 packages | **No reported advisories; no abandoned packages** |

JavaScript results are Node VM/static/mocked-transport checks. A script name containing browser does not mean a browser was run. Live portal observations are listed separately. No new live AI calls or real emails/SMS were made in this audit. The installed patch releases remain on Symfony 7.4; PHP 8.5.0 platform requirements passed.

Test artifacts: [final JUnit](repair-final-junit.xml), [PHP output](repair-final-test-output.txt), [JavaScript per-script results](javascript-results-after.json), [syntax results](syntax-checks-after.json), [dependency audit](dependency-audit-after.json), [machine-readable summary](test-summary.json).

## Scope, coverage and data preservation

The baseline inventory contains **17 HTML pages, 780 controls including dynamic templates and 96 routes**. The updated route inventory contains **102 routes**. Inventory counts are not test pass counts. The complete control matrix retains NOT TESTED entries, PARTIAL cases and N/A retired controls; one newly added conflict-review control is also listed.

Coverage files: [pages](page-coverage.csv), [controls](control-coverage.csv), [endpoints](endpoint-coverage.csv), [redacted browser observations](browser-observations.csv), [structured findings](findings.json). Original matrices are preserved with -baseline suffixes. Stable-ID source rows were relocated where possible; dynamic rows can retain baseline source lines. The findings link to current source lines.

Browser testing used the local 127.0.0.1:8012 server. User, Admin and Doctor were reviewed sequentially at the user's request; tabs within one browser profile share cookies. Sampled public Home, Services, About and Contact pages were opened. User booking progressed through review then cancelled; no booking/OTP was submitted. Pet/profile forms were opened and cancelled. Document filtering/previews and Admin calendar filters/details were exercised. Doctor notes/orders direct refresh and clinical preview were exercised. No clinical finalization or real credential change was submitted.

The integration database was SQLite in memory, checked explicitly in the new diagnostic/regression classes. Mail was faked; HTTP was prevented or supplied fake credentials. No testing migrations/seeders/reset ran on the clinic database. An authorized additive repair migration added users.photo_path and consultations.revision (default0); it did not rewrite existing SOAP text or appointment status. Browser navigation uses the existing working-copy autosave and can update its metadata; it is separate from authoritative clinical save.

The first synthetic pet-upload probe unexpectedly wrote a zero-byte test PNG into the normal public pet-photo folder despite using an in-memory database. The exact path, length and time were verified; that test artifact was moved here as synthetic-upload-from-probe.png, and the existing clinic image was preserved. Subsequent upload tests redirected public storage or faked private storage. This isolation mistake is recorded explicitly.

The latest Doctor browser check loaded the repaired working-store asset, restored the 1,128-character transcript, showed the correct field counters, and left review unchecked. No JavaScript errors were captured in that final check. Normal viewport was restored after separate 390px-wide Contact/Doctor overflow smoke checks. A 390px result is not complete mobile/accessibility coverage.

![Preserved Doctor working draft](doctor-review-after.jpg)

## Findings ranked by impact

### VHS-01 — High: Untrusted record text is inserted as HTML

**Status:** REPAIRED. **Module/roles:** Shared rendering / Admin / User.

**Reproduction / baseline:** Supply synthetic HTML as a pet/owner name to the preserved Admin appointment renderer. Raw markup entered its output. Pet names accept strings up to 50 characters. This reproduction used VM strings, without storing or executing a payload in the live portal.

**Confirmed cause:** Appointment tables/details, calendar items and document cards concatenate unescaped names/notes into innerHTML. Shared messages and prompt attributes also interpolated unescaped strings.

**Impact / severity:** Untrusted markup can run in a privileged display context if rendered by the browser; this can expose data or perform actions under that session. Actual exploitation was not attempted. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Escape record text at the output boundary; keep generated status badges and fixed controls as markup. Apply the same treatment to toast/modal text and prompt attributes.

**Verification:** test_audit_output_escaping.cjs reproduces the original sink and verifies the repaired renderer and related text boundaries. Existing UI suites pass.

**Current source:** [public/admin/admin-portal.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/admin/admin-portal.js:20), [public/shared/dashboard-shared.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/dashboard-shared.js:579), [public/shared/vhs-ui.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/vhs-ui.js:2), [public/user/user-script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/user-script.js:4432).

**Limits / remaining dependency:** Reachable HTML injection is confirmed. A stored-XSS browser exploit/account compromise was not demonstrated; broader browser penetration testing remains unperformed.

### VHS-02 — High: Empty or unreviewed consultations can be completed

**Status:** REPAIRED. **Module/roles:** Doctor / clinical integrity.

**Reproduction / baseline:** Assigned Doctor POSTed an empty body to /api/consultations/{id}/complete for an empty active consultation. Baseline returned 200, completed the visit and created a client document. The status endpoint also allowed a Doctor completion shortcut.

**Confirmed cause:** Completion required ownership/status but not saved clinical text, explicit review or the reviewed record version.

**Impact / severity:** An empty/unreviewed visit could be finalized and issued to the owner as a clinical document. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Require reviewed=true, matching expected_revision and at least one nonempty saved SOAP section; block the status shortcut. Finalization retains its existing transaction for the consultation, appointment, documents and event.

**Verification:** SystemAuditRepairsTest rejects missing review, empty content and the status shortcut. ConsultationFlowTest verifies the saved SOAP/orders/vaccinations and final document readback.

**Current source:** [app/Http/Controllers/ConsultationsController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/ConsultationsController.php:250), [app/Http/Controllers/AppointmentsController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/AppointmentsController.php:574), [public/shared/api-writes.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/api-writes.js:361).

**Limits / remaining dependency:** The server can verify explicit acknowledgement and content presence, not the quality of human clinical review.

### VHS-03 — High: Stale clinical saves overwrite newer notes/orders

**Status:** REPAIRED. **Module/roles:** Doctor / concurrency and recovery.

**Reproduction / baseline:** Two isolated PATCH requests based on one snapshot both returned 200; the second stale assessment replaced the first.

**Confirmed cause:** Only working-copy autosave had revisions. Authoritative clinical saves had no optimistic version check.

**Impact / severity:** A doctor can lose newer clinical text or orders without knowing that another session saved first. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Check an integer clinical revision under a row lock and increment on save/completion. Carry the revision through encrypted autosave/reload. Present latest saved content for manual comparison and renewed review before deliberate merging.

**Verification:** New PHP regressions reject stale SOAP/order changes and preserve prior children; completion checks the reviewed version. Autosave/reload retains the old clinical revision so stale recovery is still rejected. Working-store and asynchronous completion tests pass.

**Current source:** [app/Http/Controllers/ConsultationsController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/ConsultationsController.php:152), [app/Http/Controllers/ConsultationWorkingDraftController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/ConsultationWorkingDraftController.php:37), [public/doctor/working-draft-store.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/doctor/working-draft-store.js:8), [public/doctor/doctor.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/doctor/doctor.js:1994).

**Limits / remaining dependency:** Sequential stale-request tests and simulated races passed; true concurrent MySQL load and a two-browser clinical merge were not exercised.

### VHS-04 — High: Legacy Doctor list leaks unassigned sibling pets

**Status:** REPAIRED. **Module/roles:** Doctor / owner privacy.

**Reproduction / baseline:** An owner has two pets; only one has an appointment assigned to the Doctor. The Doctor legacy list included the other pet despite zero assigned visits. Canonical direct pet access returned 403.

**Confirmed cause:** Legacy getPets selected assigned owners, then all their pets.

**Impact / severity:** A Doctor can browse pet profile data beyond the pet scope justified by assigned appointments. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Filter by pet IDs on appointments assigned to the authenticated Doctor. Preserve canonical role restrictions.

**Verification:** The new isolated regression includes the assigned pet and excludes its unassigned sibling.

**Current source:** [app/Http/Controllers/LegacyDataController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/LegacyDataController.php:88).

### VHS-05 — Medium: Authenticated legacy writes bypass CSRF

**Status:** REPAIRED. **Module/roles:** Session security / compatibility.

**Reproduction / baseline:** With Laravel testing bypass disabled, a signed-in synthetic profile POST without a token returned 200 and changed the isolated address; modern profile PATCH without a token returned 419.

**Confirmed cause:** The CSRF exemption list included authenticated profile, appointment, pet, booking OTP and logout writes. Some old callers omitted the header.

**Impact / severity:** The intended authenticated write protection is absent on compatibility routes; cross-site exploitability depends on browser/session conditions. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Remove authenticated exemptions. Route legacy/multipart callers through a shared protected-fetch helper with one token refresh/retry.

**Verification:** Nine affected authenticated routes reject absent tokens with 419; a valid-token isolated profile update succeeds.

**Current source:** [bootstrap/app.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/bootstrap/app.php:19), [public/shared/session-auth.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/session-auth.js:83), [public/shared/dashboard-shared.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/dashboard-shared.js:422).

**Limits / remaining dependency:** A cross-site exploit was not executed. SameSite cookies affect exploitability; the missing server check was directly reproduced.

### VHS-06 — High: Stale tabs expose prior session data

**Status:** REPAIRED. **Module/roles:** Shared-PC privacy / authentication UX.

**Reproduction / baseline:** The server identity changed to User while cached Admin/Doctor screens remained visible in other tabs. Backend authorization continued to reject unauthorized requests.

**Confirmed cause:** me() cached identity indefinitely; guards ran only on initial load. Logout callers advanced without awaiting the server. Private HTTP responses lacked a consistent no-store policy.

**Impact / severity:** A shared-PC user can see a previous account screen even though the server no longer authorizes that role. Failed logout can falsely appear completed. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Revalidate on pageshow/focus/visibility/cross-tab auth signals and hide old private content while checking. Preserve work behind a retry screen on network failure. Await confirmed logout; use private no-store/nosniff responses.

**Verification:** Real-script VM tests verify identity change, offline retry and failed logout. PHP checks private headers. Baseline anonymous probes rejected 70/70 protected dummy-ID requests.

**Current source:** [public/shared/session-auth.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/session-auth.js:210), [app/Http/Middleware/PrivateResponse.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Middleware/PrivateResponse.php:6), [public/shared/dashboard-shared.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/dashboard-shared.js:93).

**Limits / remaining dependency:** This was a cached-data exposure, not a confirmed backend authorization bypass. Separate browser profiles/private sessions are required for independent simultaneous accounts. Full browser-history coverage remains untested.

### VHS-07 — High: QR check-in claims success without server persistence

**Status:** REPAIRED. **Module/roles:** Admin reception / User appointment arrival.

**Reproduction / baseline:** The permanent frontend QR opened a prototype which changed only SharedMockAppointments. Ordinary User status PATCH correctly returned 403; no QR verification route existed.

**Confirmed cause:** The browser mirror, rather than Laravel, was treated as arrival authority.

**Impact / severity:** Reception/owner may believe arrival is recorded when the actual queue remains unchanged. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Issue a Laravel-signed reception URL valid for ten minutes, refreshed every five. Retain it through sign-in in the session. Check User role, signature/expiry, owner, date, two-hour opening window and confirmed status. Auto-check-in a single eligible visit; let the owner choose among multiple visits. Share a transactional, idempotent service with reception and preserve assigned Doctor.

**Verification:** Isolated request/session tests verify QR issuance, entry, owned listing, persisted arrival/timestamp, assignment and one event after duplicate requests. Forged/expired/other-owner/early/wrong-day/terminal cases reject. Real-script VM tests cover choices and interrupted-response retry. Admin QR/fullscreen rendered locally.

**Current source:** [app/Http/Controllers/ClinicCheckInController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/ClinicCheckInController.php:11), [app/Services/AppointmentCheckIn.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Services/AppointmentCheckIn.php:19), [public/user/checkin-script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/checkin-script.js:15), [public/admin/checkin-qr.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/admin/checkin-qr.js:11).

**Limits / remaining dependency:** No physical camera scan or HTTPS/tunnel login round trip was performed. The final compact signed-URL format was verified in PHP/VM, after the initial QR browser render. Localhost cannot serve another device. Short validity reduces replay exposure but does not establish physical proximity.

### VHS-08 — High: Development OTP exposure and plaintext logging

**Status:** REPAIRED. **Module/roles:** Authentication / privacy.

**Reproduction / baseline:** With existing local helper exposure enabled and SMS disabled, a synthetic signup request returned a dev_otp without sending SMS. The old disabled-SMS fallback also logged recipient and plaintext OTP.

**Confirmed cause:** Non-production environment alone was treated as permission for code exposure and simulated delivery, even when a local server may be reachable publicly.

**Impact / severity:** OTP secrets and contact details enter logs or can be exposed by an incorrectly public development helper. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Never log codes. Permit helpers only with the explicit flag, local/testing environment and loopback host/client. Nonlocal disabled SMS fails honestly; preserve configured Twilio/email paths.

**Verification:** Delivery regression verifies no OTP info log. A fictional public-host request cannot obtain the disabled-SMS helper. Existing mocked delivery/auth tests pass.

**Current source:** [app/Support/DevelopmentVerification.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Support/DevelopmentVerification.php:4), [app/Services/OtpDelivery.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Services/OtpDelivery.php:25), [app/Http/Controllers/LegacyAuthController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/LegacyAuthController.php:65).

**Limits / remaining dependency:** Loopback development helpers remain available intentionally. Actual SMS is not configured and no real email/SMS was sent.

### VHS-09 — Medium: Duplicate canned assistant bypasses Vetti facts

**Status:** REPAIRED. **Module/roles:** User Vetti / factual grounding.

**Reproduction / baseline:** Dashboard old floating chat answered a clinic-hours question with fixed times, holiday availability and 24/7 emergency care, without verified settings.

**Confirmed cause:** A separate getAssistantReply and widget remained wired beside the primary Ask Vetti interface.

**Impact / severity:** Users receive unsupported clinic availability/emergency claims outside the verified Vetti path. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Retire that isolated widget and its handlers; preserve primary Vetti and server-controlled facts, owner scope, navigation and unconfirmed proposals.

**Verification:** Baseline browser/source reproduction. Retired elements are absent; current Vetti catalog/context/translation/recovery/emergency/forged-response suites pass.

**Current source:** [public/user/user-script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/user-script.js:4333), [public/user/index.html](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/index.html:1345).

**Limits / remaining dependency:** No new live Gemini/Groq conversation was run in this audit. Local/mocked tests do not measure live language or clinical accuracy.

### VHS-10 — Medium: Clinic Info displays stale and invented hours

**Status:** REPAIRED. **Module/roles:** User clinic facts / shared policies.

**Reproduction / baseline:** Clinic Info used local defaults and holiday claims while backend booking times differed and actual opening hours were unverified.

**Confirmed cause:** Browser defaults were not refreshed from the server and appointment starts were presented as opening hours.

**Impact / severity:** Users can plan visits around incorrect displayed hours or policy cutoffs. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Hydrate shared policies at boot. Render configured operating hours or Not verified, distinguish appointment starts, and do not invent holiday/contact facts.

**Verification:** Backend settings and existing scripts pass; public Contact visibly showed unverified opening hours as Contact clinic. Source integration inspected.

**Current source:** [public/shared/clinic-settings.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/shared/clinic-settings.js:88), [public/user/user-script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/user-script.js:58).

**Limits / remaining dependency:** The repaired User Clinic Info was not revisited in a post-fix User browser session. Real operating hours were neither supplied nor invented.

### VHS-11 — Medium: Profile photo upload silently does nothing

**Status:** REPAIRED. **Module/roles:** User profile / uploads.

**Reproduction / baseline:** Synthetic profile upload returned success with an empty photo and no persisted image. Pet photo upload did persist successfully.

**Confirmed cause:** Profile controller ignored profile_photo and the user table lacked a photo field.

**Impact / severity:** A photo appears accepted without durable persistence, while the user believes the profile changed. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Validate JPEG/PNG/WebP, store randomized images privately, serve through owner/Admin authorization, return identity photo URL and support explicit removal.

**Verification:** New PHP checks storage, identity URL, authenticated response, cross-owner denial and removal. The additive local migration succeeded.

**Current source:** [app/Http/Controllers/LegacyDataController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/LegacyDataController.php:264), [app/Http/Controllers/ProfilePhotoController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/ProfilePhotoController.php:6), [database/migrations/2026_11_10_000001_add_profile_photo_and_clinical_revision.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/database/migrations/2026_11_10_000001_add_profile_photo_and_clinical_revision.php:6).

**Limits / remaining dependency:** No live photo was changed. The suspected executable-extension upload was disproved: a PNG named .php was rejected with 422 in isolated storage; no RCE finding is claimed.

### VHS-12 — Low: Booking notes UI exceeds API maximum

**Status:** REPAIRED. **Module/roles:** User booking validation.

**Reproduction / baseline:** 300 characters fit the maxlength=500 field but backend max255 rejected them with 422; no booking was created.

**Confirmed cause:** Frontend and backend limits diverged.

**Impact / severity:** Booking fails after the user enters an otherwise accepted-length note. Low: bounded validation/display/unused-control defect; no privileged bypass demonstrated.

**Expected behavior and repair:** Use maxlength255 and a pre-submit length message; never silently truncate.

**Verification:** Source now matches the API boundary; oversized isolated submission is rejected and booking suites pass.

**Current source:** [public/user/index.html](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/index.html:888), [public/user/user-script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/user-script.js:1259).

### VHS-13 — High: Hardcoded transcript deletion without an approved policy

**Status:** SAFE DEFAULT REPAIRED; POLICY REQUIRED. **Module/roles:** Scribe source retention.

**Reproduction / baseline:** A synthetic transcript older than 30 days was purged by the baseline service. The audit request did not establish a clinic-approved retention period.

**Confirmed cause:** The service hardcoded 30 days, ran daily when a scheduler is active, and the UI presented it as settled policy.

**Impact / severity:** Original clinical source may be deleted under an unapproved period, preventing later comparison with the draft. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Delete no source automatically until an approved positive retention period is configured. Preserve encrypted drafts by default; keep SOAP and stale-revision protections when a policy is configured.

**Verification:** Isolated tests preserve old source when unset and purge only source under an explicitly configured synthetic policy. Existing 30,000-character/encryption/revision tests pass.

**Current source:** [app/Services/ScribeTranscriptRetention.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Services/ScribeTranscriptRetention.php:14), [config/vhs.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/config/vhs.php:5), [public/doctor/index.html](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/doctor/index.html:152).

**Limits / remaining dependency:** Automatic approval review rejected a live purge command as potentially irreversible clinical-source deletion without approved policy. It did not execute, was not retried indirectly and no live source was deleted.

### VHS-14 — Medium: Doctor direct refresh stays locked and counters are stale

**Status:** REPAIRED. **Module/roles:** Doctor draft restoration.

**Reproduction / baseline:** Opening notes/orders directly locked the form while the queue was empty and left it locked after real patient selection. Restored text displayed 0/limit counters.

**Confirmed cause:** The view was not reevaluated after async queue load; counters listened only to input events.

**Impact / severity:** An active consultation appears unavailable after refresh; displayed character counts are misleading. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Reevaluate the requested view after selection, retain an empty-queue lock, and update counters on a restoration event without marking clinical edits.

**Verification:** Actual notes/orders browser refreshes opened the active form and retained the 1128-character source. Counters were 272/2000,225/1000,98/800,191/1000. Delayed queue VM cases cover active and empty queues.

**Current source:** [public/doctor/doctor.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/doctor/doctor.js:3169), [public/doctor/doctor.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/doctor/doctor.js:1847), [tools/test_doctor_deep_link_refresh.cjs](D:/Cap/V3/vhs-animal-wellness-repo-v3/tools/test_doctor_deep_link_refresh.cjs:7).

### VHS-15 — Medium: Stale regression fixtures obscure current behavior

**Status:** REPAIRED. **Module/roles:** Test reliability.

**Reproduction / baseline:** Original underscore-named JavaScript run: 47 passed, eight failed. Several failures referred to old routes, frozen asset versions, obsolete wording or a date now within the valid booking horizon.

**Confirmed cause:** Tests mixed enabled semantic routes with offline compatibility behavior, exact whitespace extraction and incomplete recording/revision mocks.

**Impact / severity:** Failures can hide actual regressions, and passing mocks can be mistaken for real provider/browser proof. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Identify each test layer, use active route contracts and rolling dates, test referenced assets rather than fixed versions, and keep privacy/safety/race assertions. Add outage, HTML escaping and deep-link regressions.

**Verification:** See per-script final results. A separately discovered hyphen-named working-store script passed unchanged and is included in the final inventory.

**Current source:** [tools/test_vetti_stage1_user_browser.cjs](D:/Cap/V3/vhs-animal-wellness-repo-v3/tools/test_vetti_stage1_user_browser.cjs:5), [tools/test_vetti_capstone_regression.cjs](D:/Cap/V3/vhs-animal-wellness-repo-v3/tools/test_vetti_capstone_regression.cjs:60), [tools/test_scribe_completion_races.cjs](D:/Cap/V3/vhs-animal-wellness-repo-v3/tools/test_scribe_completion_races.cjs:15).

**Limits / remaining dependency:** These scripts use Node VM/static/mocked transport; naming a script browser does not make it a real browser test.

### VHS-16 — High: Five installed dependencies have eight advisories

**Status:** REPAIRED. **Module/roles:** Dependency maintenance.

**Reproduction / baseline:** Baseline composer audit --locked reported eight advisories affecting HTTP Foundation/Kernel, Routing, YAML and MIME.

**Confirmed cause:** Locked Symfony 7.4.20 components and MIME7.4.19 were below patched releases.

**Impact / severity:** Installed packages fall within published affected versions. Application exploitability remains feature-dependent. High: clinical integrity, privileged/private data boundary, or published security affectedness.

**Expected behavior and repair:** Update only these packages on Symfony7.4: Foundation/Kernel/Routing/YAML7.4.23, MIME7.4.22. Preserve the original lock and PHP compatibility.

**Verification:** Post-update audit advisories=[]; abandoned=[]. Platform requirements pass. Complete backend tests run on the patched packages.

**Current source:** [composer.lock](D:/Cap/V3/vhs-animal-wellness-repo-v3/composer.lock:530).

**Limits / remaining dependency:** Package affectedness is confirmed; exploitation in this Laravel app is not. Do not claim a Symfony SecurityBundle HEAD bypass in Laravel merely from package presence.

### VHS-17 — Medium: Scheduler is not running for automatic no-shows

**Status:** PARTIAL: CODE REPAIRED; WORKER NOT STARTED. **Module/roles:** Operations / appointments.

**Reproduction / baseline:** Initial process inventory showed no scheduler; read-only preview found one overdue confirmed unchecked visit. Clinical visits remained open.

**Confirmed cause:** The no-show reconciliation service existed, but artisan serve does not run schedules. The UI/docs did not clearly expose this operational dependency.

**Impact / severity:** Missed appointments remain confirmed when the scheduler is stopped; staffing/owner status displays stay stale. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Show scheduler heartbeat/overdue count to Admin; add No Show filters and guarded manual action; provide a preview-first startup helper. Reconcile only eligible confirmed unchecked visits; never close a clinical consultation automatically.

**Verification:** Existing no-show and new health tests pass. Startup helper syntax passes. Live dry-run found one candidate without changing it.

**Current source:** [app/Services/AppointmentNoShowService.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Services/AppointmentNoShowService.php:17), [app/Http/Controllers/OperationsHealthController.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/app/Http/Controllers/OperationsHealthController.php:7), [tools/Start-VhsScheduler.ps1](D:/Cap/V3/vhs-animal-wellness-repo-v3/tools/Start-VhsScheduler.ps1:1), [routes/console.php](D:/Cap/V3/vhs-animal-wellness-repo-v3/routes/console.php:44).

**Limits / remaining dependency:** Starting the worker would alter the existing candidate. It was not started. Confirm the intended grace/no-show policy, review candidates, then start and verify uptime.

### VHS-18 — Medium: Contact form falsely claims message delivery

**Status:** REPAIRED. **Module/roles:** Public contact / data loss.

**Reproduction / baseline:** The submit handler only showed a thank-you alert and reset the form, with no message delivery request.

**Confirmed cause:** A prototype handler remained in the public site.

**Impact / severity:** A visitor loses their message and believes the clinic received it. Medium: a reproduced workflow, truthfulness or operational failure with bounded impact.

**Expected behavior and repair:** Clearly label a reviewable email-draft flow using the configured clinic email; encode entered text, preserve fields and state that the visitor must send from their email app. Failed contact lookup retains the text.

**Verification:** Empty form blocked in browser. Real handler VM checks encoded draft, no false sent claim and preservation after failed lookup.

**Current source:** [public/web-page/script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/web-page/script.js:1282), [public/web-page/contact.html](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/web-page/contact.html:168).

**Limits / remaining dependency:** No real email was sent. Email-client invocation/delivery is unverified; this does not implement a server contact inbox.

### VHS-19 — Low: Retired confirmation controls and duplicate IDs interfere

**Status:** REPAIRED. **Module/roles:** User/Admin UI cleanup.

**Reproduction / baseline:** Inactive legacy Confirm/Cancel controls remained in the User accessibility tree; Cancel called an absent helper. Admin reschedule had duplicate hidden input IDs. A pet profile owner label showed a dash despite ownerName being available.

**Confirmed cause:** Unused modal markup and duplicate input survived prior changes; one display path ignored the returned ownerName alias.

**Impact / severity:** Unused controls confuse keyboard/accessibility and test selection; duplicate IDs and missing aliases produce unreliable display behavior. Low: bounded validation/display/unused-control defect; no privileged bypass demonstrated.

**Expected behavior and repair:** Remove the retired confirmation markup and duplicate input; keep the shared confirmation engine; use the server ownerName display fallback.

**Verification:** Caller search found no active dependency on the retired IDs. Existing UI scripts pass and source IDs were checked.

**Current source:** [public/user/index.html](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/index.html:1115), [public/admin/appointments.html](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/admin/appointments.html:297), [public/user/user-script.js](D:/Cap/V3/vhs-animal-wellness-repo-v3/public/user/user-script.js:2249).

**Limits / remaining dependency:** Post-fix User visual verification of these minor paths remains partial.

## Scribe-specific rundown

This audit did not replace the summarizer or add conversation-specific clinical rules. Doctor authorization/privacy gates, manual vital confirmation, full-source availability and SOAP review remain. The new authoritative clinical revision complements encrypted working-copy revision protection. AI still has no authority to finalize a record.

Verified locally: a 30,000-character fictional transcript persists in the encrypted working draft; other-Doctor and stale working revisions are rejected. The existing recording harness covers 21 simulated workflows including timeout retention, pending transcript recovery, patient binding, unload warnings and explicit discard. The completion harness simulates edits, review changes, audio and patient switches during asynchronous operations. Provenance/local parser tests include fictional multilingual cases. The final code preserves clinical revision metadata through encrypted autosave and still rejects stale clinical saves after reload.

The broad regression run caught a repair integration mistake: adding a nested validation rule could filter existing allowed working-copy fields. Metadata is now validated separately, and the original long-transcript/encryption test plus the new complete-fields recovery test pass. This is why isolated source checks alone were not treated as enough.

Not verified in this batch: a real 30-minute microphone session, device-level interruption behavior, 30,000-character live drafting, current quota/cost/latency, or a clinical error rate on unseen conversations. The advertised audio limit remains the lower of PHP upload/post limits and10MB; duration alone is not the limit. The AI checker and doctor-visible highlights can still be wrong. Retain doctor comparison with the transcript and do not treat no warning as proof of medical accuracy or absence of added advice.

## Vetti-specific rundown

Laravel remains the authority for clinic catalog facts, owner permissions, availability and booking confirmation. The primary Public/User Vetti path and configured providers were preserved. The unsupported duplicate User assistant was removed. Existing catalog, context, translation, provider-free recovery, urgency and forged-response tests passed with fictional/mocked responses. Stage-one harnesses now target the active semantic route; the local recap harness is labeled offline.

No full chat history or private record was sent to a live provider by this audit. Live Gemini/Groq language quality, quotas and provider fallback behavior were not remeasured. Existing configuration/model names show setup, not successful current service. Earlier good results in the conversation are historical evidence, not a new reliability percentage.

## QR behavior and practical limits

The reception QR is a short-lived signed URL issued to Admin. A scan stores it in the server session through sign-in. One eligible owned confirmed visit today checks in automatically; multiple visits require choosing one. The server checks ownership, expiry/date/window/state, preserves assignment, and records one arrival event. Retrying after a lost response can return the existing result without duplicate events. Ordinary User status PATCH still cannot grant arbitrary arrival.

The Laravel test is end to end within an isolated request/session/database flow. Frontend transport behavior is simulated. A real phone camera, HTTPS/tunnel login round trip and actual owner portal arrival commit remain unverified. The QR does not prove proximity; it can be copied while valid. Localhost on another phone addresses that phone, so the clinic must use a reachable server address. The display warns about this.

## Readiness blockers and prioritized next actions

1. **Scheduler and existing visits:** initial observation found no running scheduler; the live read-only preview found one overdue confirmed, unchecked visit. No worker was started and the visit was not changed. Review the candidates and intended configured grace/no-show policy. The added [preview-first startup helper](D:/Cap/V3/vhs-animal-wellness-repo-v3/tools/Start-VhsScheduler.ps1) defaults to preview; -Start runs it, and -ReconcileExisting is additionally required when candidates exist. Syntax was checked, not sustained worker uptime. The Admin heartbeat will expose missing processing. Clinical consultations are never automatically finalized by this job.
2. **Retention/privacy policy:** the clinic must approve a source-retention period before setting VHS_SCRIBE_TRANSCRIPT_RETENTION_DAYS. Unset now means no automatic source deletion. This prevents an unapproved purge but is not a complete retention policy. Automatic approval review rejected a live purge attempt because it could permanently remove clinical source without an approved period; it did not run and was not bypassed. Only isolated fictional purge tests were used for verification.
3. **Real access/delivery path:** verify the intended HTTPS host/tunnel, trusted proxy behavior, secure cookies, microphone permissions, long uploads and phone scan/login. The observed local secure-cookie flag is false; localhost checks are not deployment proof. SMS is disabled. Email is configured but delivery/reset links were not sent. The contact form prepares a manually sent email draft, not a server inbox.
4. **Bounded live fictional AI acceptance:** test short, medium and long consultations through each intended provider, measuring corrections, uncertainty, omissions, speaker attribution, source links, unsupported advice, retries, call counts/tokens and latency. Do not claim clinical production reliability from mocked tests; keep doctor review.
5. **Required feature gaps:** historical API docs list standalone /api/lab-requests and result-update endpoints which are not registered. Consultation save creates lab requests, but standalone result entry/issued lab-result workflow is absent. Inventory/payment/receipt generation must not be claimed implemented merely because models/types exist. Confirm which are required for the intended release.
6. **Remaining coverage:** positive browser CRUD/OTP commits, every control combination, actual print/PDF output, full keyboard/focus/contrast/screen-reader review, other browser engines, true parallel MySQL and load/stress tests remain unverified. They remain visible in the matrices rather than being counted as passes.

## Evidence notes

Before-edit source copies are in storage/app/private/audit-repair-before-20261110. There is no .git directory to establish a commit baseline; before/after SHA256 manifests and changed-files.csv identify the source state. These private copies are not a clean release archive and were not deployed. Do not run the diagnostic reproduction class against a clinic database; it refuses non-memory SQLite.

The baseline affected dependency versions were compared with primary upstream information, including [Symfony HTTP Foundation advisory](https://symfony.com/cve-2026-118514) and [Symfony MIME advisory](https://symfony.com/cve-2026-45070). Composer supplied the eight-advisory package list. Laravel does not use Symfony SecurityBundle here; package presence alone does not prove that advisory's HEAD authorization bypass exists in this app.

## Final readiness answer

**Verified to work:** the listed isolated regressions and sampled local portal paths, including server arrival persistence, owner/Doctor scope, protected legacy writes, private photo access, stale clinical-write rejection, explicit completion review and restored notes/orders navigation.

**Confirmed broken before repair:** the 19 findings above. Code repairs are documented individually. Scheduler operation is still partial and the clinic retention decision is still open.

**Still uncertain:** current live model accuracy/capacity, real recording/long-session behavior, real delivery, cross-device/tunnel QR use and unexercised matrix scenarios.

**Before considering the whole system ready:** enable and observe scheduled processing under the intended policy, approve privacy/retention controls, verify the real phone/HTTPS/delivery path, complete bounded live fictional AI acceptance and resolve any required unimplemented release features. No issue found in tested scenarios does not mean everything works.
