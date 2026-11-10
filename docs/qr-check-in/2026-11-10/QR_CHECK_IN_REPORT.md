# Reception check-in and Admin transition — 10 November 2026

Local implementation in D:\Cap\V3\vhs-animal-wellness-repo-v3. No push or deployment, no real email/SMS sent by the tests, and no live AI calls. The existing user-started Cloudflare tunnel was used to preview the finished page.

## User choices

Clients should scan the reception QR, choose Email or SMS, receive a code and enter it on their phone. No password or full portal login should be required. User subsequently chose **email now, SMS configuration later**. SMTP is the configured email transport; SMS_DRIVER is disabled. No credentials were printed or changed.

## Admin black transition

Observed the Admin page momentarily having transparent root/body backgrounds during navigation. The existing session guard also hides body content while verifying identity; the dark browser canvas can show through that gap. The repair paints a light initial canvas before external styles load on all nine Admin pages, and displays a light session-check surface while preserving privacy masking, account-change checks and login redirects.

Through the actual tunnel, navigation showed the new first-paint style present, root background rgb(247,247,250) while session checking was true, followed by visible content with the checking flag removed. Existing mocked authentication/offline/account-change regressions passed. This verifies the sampled in-app navigation; it is not proof against every browser/compositor flash.

## Shorter QR workflow

A fresh QR now contains a path-scoped signed URL which the browser resolves against the current HTTPS tunnel origin. The entry redirect is relative and preserves the browser scheme without trusting arbitrary proxy headers. Expiry and signature checks remain required; older absolute signed tokens remain supported.

A valid signed-in User keeps the existing direct check-in path. A guest, staff session or stale User login opens the standalone check-in page. It offers Email and SMS, clearly disables unavailable delivery, accepts the registered verified contact and a six-digit code, and automatically checks in one eligible visit. If multiple visits qualify, the client chooses the visit. A short-lived possession proof grants arrival access only: it does not create a full portal login, reveal clinical notes or authorize appointment creation.

The same AppointmentCheckIn transaction still owns persistence, preserves assigned doctors and creates a single arrival event. Existing owner/date/window/status rules remain: only the client's own confirmed appointment for today can newly check in, beginning two hours before its start. Retrying a completed arrival request does not produce another event. The existing manually operated reception path remains available.

The new page restores a pending code-entry step after refresh, supports resend with cooldown, recovers from lost request responses, refreshes CSRF after code verification, and never claims check-in success before the server confirms. It displays controlled delivery failure messages and no code values.

## Security and data handling

- Reused OtpService with five-minute codes, five wrong attempts, single use, session binding, resend cooldown and contact/IP limits. A distinct clinic_checkin context prevents login/signup codes being used here.
- Added a hidden keyed phone lookup index; the original phone remains encrypted. Duplicate verified phone matches are not resolved arbitrarily. Missing, inactive, staff and unverified-contact matches receive no message. Inert unmatched challenges apply the same code quotas without sending mail/SMS or selecting an owner.
- Before possession proof, the page reveals no appointment details or account names. After proof it returns only the minimal owned appointment information needed for arrival. Generic request responses limit account discovery; timing and delivery-error side channels were not established to be absent.
- The five-minute arrival grant is bound to the scanned QR and rechecks owner status, contact, verification state and auth version. Scanning again clears the prior grant. Full portal authentication remains unchanged.
- CSRF and route throttles protect new writes. Responses/pages are private and not cached. The standalone page uses no external scripts/fonts or AI provider.
- The additive migration indexed 11 phones across 13 accounts. SHA256 of every original account field matched before and after; only the lookup field was added. Evidence: migration-verification.json.
- Existing per-contact and per-IP OTP caps are retained (five requests/contact/hour and twenty/IP/hour). Real multi-client behavior through the tunnel was not load-tested; proxy client-IP configuration remains a deployment consideration.

## Verified tests

- **622 complete backend tests passed, 4,269 assertions** — backend-tests.txt. Fake provider credentials and isolated fictional test databases; no real messages.
- **61 offline JavaScript scripts passed**, including the new email/SMS interface, automatic single appointment, explicit multiple appointment choice, safe text rendering, unavailable SMS, CSRF recovery, lost code-request recovery and interrupted check-in retries — javascript-results.json. These are simulated/static scripts, not 61 physical phone journeys.
- Syntax results for application/routes/migration/public JavaScript are recorded in syntax-results.json.
- New backend cases cover both delivery channels with mocks, no full login after verification, HTTPS-compatible signed tokens, no downgrade redirect, tampering/expiry, unknown/duplicate/staff/inactive/unverified contacts, pending/resend handling, old request IDs, consumed codes, wrong-browser/context codes, five failed attempts, expired grants, changed contact/account, foreign appointments, canceled/early visits, multiple choices, delivery outage, missing CSRF, rescans and valid-versus-stale signed-in sessions.
- Actual tunnel UI: fresh QR had HTTPS and the correct tunnel host; its destination opened /arrival successfully. Email and Send code were enabled, SMS was disabled, and no password was requested. No contact was entered and no real code was sent. See arrival-preview.png.

## What still needs the user's real-device test

Refresh Admin and scan a fresh reception QR on the phone. Choose Email, enter a verified registered client email, select Send code and enter the received code. Use an eligible fictional appointment; an already active consultation is not a new confirmed arrival. Confirm the visit becomes Checked In in Admin and appears in the assigned Doctor queue.

Actual SMTP inbox delivery, physical camera scanning and the complete cross-device code-entry/arrival result have **not** been verified by this work. SMTP configuration is not proof of deliverability. SMS remains disabled by the user's choice; its adapter was tested only with mocked delivery and should not be represented as live until configured and independently tested.

A signed QR can be copied during its validity and does not prove physical proximity. Its signature lasts ten minutes; rescan the current reception code if it expires. If no eligible visit exists or delivery fails, ask reception to use manual check-in.

## Review and recovery

Existing-source backups: storage/app/private/admin-tab-paint-before-20261110 and storage/app/private/qr-otp-before-20261110. changed-files.csv records those checkpoints; new-files.json lists new source hashes. Do not undo the lookup migration while leaving the newer SMS lookup code active. No users, appointments or consultations were deleted or finalized by these changes.

![Short check-in page](arrival-preview.png)
