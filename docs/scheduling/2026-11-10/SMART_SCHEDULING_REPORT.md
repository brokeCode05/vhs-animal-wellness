# Smart Scheduling — local implementation and verified status

Implemented in D:\Cap\V3\vhs-animal-wellness-repo-v3 on 10 November 2026. Nothing pushed or deployed. The existing local server is still the intended portal; the separate synthetic browser server was stopped.

## What changed

The backend now evaluates the entire estimated interval for availability, final booking and rescheduling. Candidate-start spacing remains a separate setting. Doctor-required services reserve one eligible doctor for the whole interval; non-doctor services retain the existing per-service capacity of two and use peak simultaneous occupancy. Canceled, completed and no-show appointments release capacity. Known closed days and opening/closing times are enforced. An ending visit and a visit starting at that exact time can share the boundary.

Final booking and rescheduling take the existing clinic-settings gate lock, re-read the service and use current locking reads for appointments and doctor profiles. This includes an OTP transaction that has already read data before taking the gate. Selected allocations are frozen on the appointment. Existing appointments received snapshots of their previously configured service duration, or explicit unknown; later history/settings changes do not resize those bookings. Rescheduling revalidates a newly calculated allocation.

Arrival assignment retains the existing doctor when assigned. For an unassigned visit, it excludes the visit itself and checks the full booked interval. Arrival is not rejected merely because its scheduled start is now past or off the current start grid. This regression was found and repaired during the full test run.

Service estimates use the median of completed, non-test visits explicitly approved by the assigned doctor. Default minimum is 10 usable samples, configurable from 7 upward. Invalid timestamps/elapsed mismatches, incomplete or canceled visits, relationship mismatches and unapproved/test records are excluded. IQR screening flags duration outliers; Admin can see usable counts, minimum and exclusion counts through the service editor and an Admin-only aggregate endpoint. The estimator reads operational columns only, never SOAP text or transcript content.

The existing Doctor start/resume/completion timestamps and timer are reused. Completion approval is an optional unchecked operational control, separate from clinical edits and existing SOAP review/revision checks. Marked test appointments cannot contribute even if approval is requested. Admin can mark new fictional/test appointments explicitly. Existing consultations remain unapproved; none were enrolled automatically.

History is optional per service. When insufficient, an explicitly entered service duration is used; otherwise duration remains unknown and existing start-slot behavior is retained. Admin may enter an explicit additional buffer; blank adds none and is not represented as an approved zero. No roster, break, room, recovery time or buffer was invented. Global doctor On Duty/Break/Leave rules and the existing non-doctor service classifications were preserved.

Availability returns duration source, sample count, estimated end, missing-information notices and nearby alternatives ranked around the preferred time. Booking forms show verified duration information; User review includes it. Vetti receives the verified duration facts and ranked alternatives through its existing read-only proposal flow. It still cannot create an appointment. Explicit confirmation, owner scope, service eligibility, OTP and final booking revalidation remain in place. This adds no model calls or second calendar.

## Verified results

- Final complete backend suite: **606 tests passed, 4,121 assertions** (`backend-tests.txt`). All test database records are fictional; provider keys are fake and delivery uses an array mailer.
- Offline JavaScript results: see `javascript-results.json`, including the new duration display/stale-selection/test-marker round-trip check. These are simulated or static checks, not 60 real browser journeys.
- PHP application/routes/migration and public JavaScript syntax: see `syntax-results.json`.
- Interval/lifecycle tests cover before-start and after-start overlap, adjacent ends, buffers, known closing/closed days, unknown fallback, independent services, peak resource use, unassigned reservations, stale recommendations, reschedule/cancel release, role-scoped appointment visibility, Admin-only settings, duplicate completion and test-data exclusion.
- A new Doctor completion takes approved history from nine to ten samples and changes future availability from configured 45 minutes to the approved 30-minute median. Start/resume preserves the original timestamp. This was an isolated request/database test, not a finalized real portal consultation.
- Vetti test used one mocked provider call. It received the verified 30-minute duration, 5-minute buffer and nearest alternatives, omitted the pet name, and created no appointment. Live provider language generation was not measured.
- **Actual parallel MySQL check passed:** two outer transactions established their snapshots before the gate, then attempted overlapping 10:00 and 10:15 starts with one doctor. Responses were 201 and 422; one appointment existed afterward (`mysql-concurrency.json`). This is one simultaneous pair, not a load/stress guarantee. The uniquely named synthetic database is retained for review, separate from the clinic database.
- The additive migration ran only in the local project. Counts and SHA256 fingerprints of all original appointment, consultation, user and pet fields matched before/after. All 38 appointments received allocation metadata; approved history sample count stayed zero (`local-migration-verification.json`).
- Real in-app Doctor page refresh: 1,128-character transcript, all SOAP fields and vital entries matched exactly; clinical review and duration approval stayed unchecked. No consultation was finalized and no new timer was started.
- Separate synthetic portal loaded its fictional catalog and doctor. Login required CAPTCHA; it was not bypassed or submitted. Admin/User positive browser booking journeys remain outstanding, although their backend authorization/booking/review contracts passed automated tests. The temporary server and tab were closed.

## Current practical limits

There are 26 active services; only two had entered durations at the initial audit. No existing consultation is approved for learning, so most services correctly display unknown duration until clinic staff enter approved values or enough valid visits accumulate. Unknown duration cannot guarantee a whole-visit finish or prevent every unknown-length overlap; the fallback notice is intentional and was requested by the owner.

Closing time is enforced only for a day with verified operating hours. Latest appointment start is not closing time. The code cannot guarantee arrival/finish by a personal deadline, account for absent daily rosters or simulate resources that the clinic has not configured. Median elapsed consultation time is an estimate, not a promise of total service occupancy; any approved setup/recovery allowance must be entered as a buffer.

Historical approval depends on staff selecting genuinely representative, non-test visits. Existing fictional appointments must not be approved accidentally. Keep the approval unchecked during demonstrations; use the Admin test marker for newly created demonstrations.

Physical phone scanning, tunnel/proxy HTTPS handling, cross-device sign-in and a genuine User check-in via the tunnel remain unverified. Open Admin through the reachable HTTPS address and generate a fresh QR on that host. Use an owned, confirmed appointment for today within the allowed check-in window. Keep the local server and tunnel running. The currently active consultation is not a substitute for a confirmed arrival test.

The QR code stores a short-lived signed URL. Behind an HTTPS tunnel, inspect the generated URL and redirect scheme before testing; this change did not broaden trusted proxies or expose the server. No Cloudflare tunnel was started by this work.

## Evidence and recovery

`changed-files.csv` records source hashes. Before-edit source copies are in `storage/app/private/scheduling-before-20261110`; no Git commit exists for this directory. The additive migration is `2026_11_10_000002_add_duration_aware_scheduling.php`. Do not roll back just the schema while leaving newer server/UI code active. Preserve any newly collected approval/allocation metadata before any deliberate rollback.

The concurrency harness refuses the configured clinic database and requires a unique `vhs_sched_test_YYYYMMDD_hex` database. It does not drop databases. It retains its synthetic database for inspection. Test helpers belong outside the public web root.

## Primary references

[NIST boxplot fences](https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm) informed the explicit IQR exclusion method. The app also enforces staff approval, minimum sample size and fallback; those are project rules, not NIST clinical recommendations.

[Laravel pessimistic locking](https://laravel.com/docs/13.x/queries#pessimistic-locking) informed transaction/current-read validation; the separate parallel MySQL result above supplies project-specific evidence.

[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) describes temporary reachable test URLs. A tunnel enables the cross-device test; it does not itself prove that the QR login/check-in path works.
