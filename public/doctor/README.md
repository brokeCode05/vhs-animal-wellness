# Doctor Portal — Phase 1 frontend redesign

Open `doctor/index.html` to review the doctor workflow. Existing portals and backend files were not modified. Admin and shared file hashes were checked before/after the redesign and were unchanged.

## Current workflow

Three views switch without reloading: Patient Workspace (`#patients`), Consultation Notes (`#notes`), and Prescriptions & Labs (`#orders`). The sidebar follows the active view, including browser Back/Forward. One view is visible at a time. The forms remain mounted, so changing views preserves input values. Changing patients captures and restores separate in-memory drafts, including medicines, tests, and review acknowledgement.

Workspace contains the queue and active patient's EMR/history. Notes and Orders show the patient's name, species/breed, appointment date/time, and service above the form. Notes links to Orders; Orders links back to SOAP. The redundant selected-patient statistic and other overview cards were removed.

One Demo data badge appears near the page title. Short action labels explain local saving and unavailable handoff. AI labels remain subject to veterinarian review. Availability controls whether new assignments are shown as accepted or paused; On Break and On Leave do not prevent reading or completing existing drafts.

Admin's base styles and the shared VHS theme remain unchanged. Doctor-only refinements retain purple navigation and familiar controls while removing repeated section decoration. Forms use page scrolling.

## Exact demo boundaries

- All patients, appointments, records, vaccination history, and triage labels are fictional fixtures.
- AI summaries are static examples; no AI service runs.
- SOAP, medicine, and lab values are editable in-memory drafts, retained across views and patient changes but erased by reload.
- Save local draft only marks the reviewed draft in this page as saved. No database record, prescription, or lab request is created.
- Send to Front Desk remains disabled; no handoff occurs.
- Availability only changes local assignment messaging. No assignment service or clinic schedule is updated.
- No login, authentication, backend connection, or network data submission exists in Doctor.
- No voice dictation, Clerk/Admin merge, or Veti work was added.

## Workspace audit (24 September 2026)

The previous doctor directory and its three preview files were absent. `user/`, `clerk/`, `admin/`, `web-page/`, `shared/`, `php_files/`, and `vet_db.sql` are present. No AGENTS.md or package.json was found by the workspace file scan. This workspace has no Git repository metadata.

The following are source-code findings, not live database verification:

- `user/user-script.js`: `verifyOtp()` only checks code length before `_finalizeBooking()` adds a record to `mockAppointmentsData`. No server OTP verification or booking request occurs in that completion path.
- `php_files/book-appointment.php`: insert includes `reference_no` and `service`; checked-in `vet_db.sql` has no `reference_no` and calls the service column `vet_service`. The endpoint detects the service column but does not use that result in its insert.
- Booking checks for an existing slot before insertion, without a transaction/locking mechanism or a slot uniqueness constraint in the supplied schema. Concurrent booking protection is not established.
- Booking accepts supplied user/pet/staff IDs; appointment status updates accept a supplied appointment ID. Neither inspected endpoint enforces session-based roles or record ownership. `db.php` provides database connection setup, not authorization.
- The required `php_files/config.php` is absent in this workspace. Live database behavior has not been tested.
- Existing role accent files diverge from the shared purple palette. Unifying them remains a later phase.

## Verification (24 September 2026)

Tested the local HTTP preview at `http://127.0.0.1:8765/doctor/index.html` after explicit approval to start a loopback-only server.

- JavaScript syntax passed; no browser console errors during verification.
- Desktop: entered distinct Luna/Max SOAP drafts, medicine instructions, and a blood-test selection; switched views and patients and verified Luna's values were restored without mixing drafts.
- Mobile: entered separate Luna/Milo drafts, switched back, and verified retention. Keyboard Enter selected a patient.
- Sidebar active state and exactly one visible panel checked; browser Back restored the correct view.
- Invalid hidden medicine and objective inputs routed to their respective views before receiving focus.
- On Break and On Leave displayed new assignments paused. Existing notes remained editable and local saving worked. Send to Front Desk stayed disabled.
- Reload cleared drafts while retaining the routed view.
- Verified no horizontal page overflow at widths 320, 390, 768, 1024, and 1440px. Mobile menu closes on navigation; form containers have visible overflow, not nested scroll areas.
- Captured all three views at 1440×1000 desktop and 390×844 mobile viewports. Full-page screenshots extend vertically to include the whole view.

| View | Desktop | Mobile |
| --- | --- | --- |
| Patient Workspace | [Screenshot](review/desktop-patients.png) | [Screenshot](review/mobile-patients.png) |
| Consultation Notes | [Screenshot](review/desktop-notes.png) | [Screenshot](review/mobile-notes.png) |
| Prescriptions & Labs | [Screenshot](review/desktop-orders.png) | [Screenshot](review/mobile-orders.png) |

No live backend or clinical correctness validation was performed; this phase covers frontend layout and workflow only.

## Phase 1 action entry points + paper document — 25 September 2026

Seventh pass: status-driven actions and a User-portal-style printable document. No layout redesign.

- Removed "Write consultation notes" from the EMR; the EMR is read-only. One status-driven action sits beside it: Start Consultation (checked_in) → Continue Consultation (in_consultation) → View Clinical Document (completed); none for upcoming. Queue rows mirror this (Continue Consultation with live timer; View Document with "Completed in N min"), so no redundant duplicate buttons.
- Document preview rebuilt on the User Portal's print-document system: letterhead (logo, clinic name, address/contact from the public site), centered uppercase title, reference/generated meta row, bordered 2-col info grids, labeled SOAP blocks with dotted dividers, zebra prescription table, lab list, dual signature blocks (veterinarian + owner), confidentiality notice. Paper-sheet proportions (~186mm, Segoe UI 10pt) on screen; @page margins and break-avoid rules for print; prints the document alone.
- Document content is a pure render of the structured consultation object (TODO(BACKEND): server-side PDF generation) — appointmentId reference, consultation start/completion/duration line, no invented data.

Verified in-browser at 1440/390: action matrix per status, document data accuracy (patient, appointment, SOAP, prescriptions, labs, signatures), paper layout on screen and in print CSS, gating unchanged, console clean, no overflow.

## Phase 1 clinical gating — 25 September 2026

Sixth pass: workflow gating only, no UI redesign.

- Status names canonicalized to `upcoming / checked_in / in_consultation / completed` in state and badge classes.
- Before Start, Consultation Notes and Prescriptions & Labs render a short lock notice ("Start the consultation first to access clinical notes.") instead of the form; a small Start Consultation button appears only for checked-in patients. Patient EMR and the queue stay fully viewable at all times.
- Start requires `checked_in`; upcoming patients have no Start action. Selecting a patient never starts anything. Complete Consultation is disabled unless the selected patient is `in_consultation`; after completion the notes remain readable.
- `TODO(BACKEND): Validate the status transition server-side.` marks start and complete.

Verified in-browser: lock matrix across all four statuses (checked-in/upcoming/completed × notes/orders), start rule, complete rule, timer continuity, EMR availability, drafts, 1440/390 overflow, console clean.

## Phase 1 consultation lifecycle — 25 September 2026

Fifth pass: workflow states and consultation timer.

- Greeting card subtitle no longer duplicates the navbar clock; it now shows a practical line ("You have 3 patients scheduled today. Luna is checked in and waiting at 9:00 AM.") derived from queue state.
- Queue gains Status (Upcoming / Checked In / In Consultation / Completed) and Action columns; Checked In rows show "Start Consultation". Starting is an explicit action — never a side effect of selecting a patient — and records a frontend `startedAt`, flips status to In Consultation, and opens Consultation Notes.
- One 1s tick derives elapsed time from `startedAt` and updates every `[data-elapsed-for]` readout (queue row + context bar), so the timer continues unchanged across view navigation. The quiet context-bar line shows status, start clock, and elapsed.
- "Complete Consultation" (primary, after Preview in the action row) validates drafts, records `completedAt` and `durationMinutes`, stops the timer, refreshes the queue/greeting, and requires an active consultation (premature completion is blocked with a message).
- Consultation object now carries `appointmentId / patientId / veterinarianId / status / startedAt / completedAt / duration / soap / prescriptions / labRequests` (TODO(BACKEND) marked); the document preview renders from it.

Verified in-browser at 1440/390: full lifecycle Upcoming → Checked In → Start → In Consultation (timer survives navigation) → Preview → Complete → Completed; premature-complete blocked; selecting a patient never starts a timer; no console errors; no horizontal overflow.

## Phase 1 greeting + clinical document preview — 25 September 2026

Fourth pass: contextual header and the document preview step.

- Page header becomes a time-based greeting ("Good morning/afternoon/evening, Dr. Santos") on the patients view; subtitle shows the live day · date · time in the shared Clerk datetime format; the navbar clock now ticks (date | time, `dashboard-shared.js` format). Queue/EMR/notes/orders views keep their titles. Availability control unchanged (new assignments only).
- New "Preview Clinical Document" action opens a print-ready modal built from a structured `consultation` object (`patient / appointment / soap / prescriptions / labRequests / veterinarian / status / createdAt / updatedAt`) assembled from `mapAppointment()` data plus the captured draft — no DOM scraping; this is the shape a consultation endpoint would receive (TODO(BACKEND) marked).
- Document sections: Patient Information, Appointment Information, SOAP Notes (vitals folded into Objective), Prescriptions table, Lab Requests, Veterinarian + record timestamp. Print styles render the document alone.
- Action flow: Save draft → Preview Clinical Document → Send to Front Desk (disabled, "Sending requires backend integration."). The modal footer states plainly that this is a preview and that sending/printing beyond the browser does not exist yet; no PDF/DB/handoff claims.

Verified in-browser at 1440/390: greeting/clock tick, preview content matches entered data exactly, drafts preserved across views and patients and reflected in the preview, Escape/overlay/× close with focus restore, Send stays disabled, no console errors, no horizontal overflow.

## Phase 1 Clerk/Admin alignment pass — 25 September 2026

Third pass: makes the Doctor Portal read as the same product as Clerk/Admin.

- Patient queue rebuilt as a Clerk-style `compact-table` clinic list (Time · Patient · Owner · Service · Triage) inside a `.table-wrapper`; selected row uses the VHS active treatment (accent tint + inset left marker); Triage badges adopt the Admin `status-badge` pill recipe (green Routine, amber Urgent, red Emergency). EMR now sits full-width below the table.
- Prescriptions rows take compact structured fields (medicine, dosage, frequency, duration, owner instructions) with Remove aligned to the field row; Lab requests are a compact checkbox group with one short hint.
- SOAP keeps the two-column clinical form, structured vitals row, and quiet AI-assisted summary strip; context header and drafts unchanged.
- Admin's mobile compact-table carousel (which needs `data-label` cells) is overridden so the Doctor queue stays a real table; Service/Owner columns drop progressively at 600px.

Verified in-browser at 1440/768/390: no horizontal overflow, drafts per patient (including new duration/instructions fields), partial-prescription validation, save flow, keyboard-selectable rows, no console errors.

## Phase 1 production-readiness refinement — 25 September 2026

Second pass on `doctor-portal-phase1-refinement`, focused on removing prototype wording and tightening the clinical form.

- All demo/prototype labels removed from the UI (no "Demo data" badge, no "local draft/local only" wording). Mock behavior remains in code only, marked with `TODO(BACKEND)` comments.
- Appointment fixtures reshaped to the User Portal booking flow (`appointment_id/pet_id/service/appointment_date/appointment_time/visit_reason` + owner and pet details from the pet record) behind a single `mapAppointment()` boundary in `doctor.js`; EMR dates now come from `appointment_date` instead of a hardcoded string.
- "Patient Workspace" renamed to "Today's Patients" (sidebar: "Today's patients"); queue rows now show owner name; AI triage badge shown without the "AI triage:" prefix.
- SOAP form: full-width quiet "AI-assisted summary" strip above the grid (assistive wording, no live AI claim), S/O/A/P headers with letter chip, name, hint, and hairline divider; vitals stay a structured 3-input row.
- Draft wording is device-honest: "Save draft" → "Saved on this device"; Send to Front Desk stays disabled with a short unavailable note.

Verified in-browser: three views, per-patient draft retention across views and patients, save flow (saved → edit resets to unsaved), no console errors, no horizontal overflow at 1440/768/390.

## Phase 1 consistency pass — 25 September 2026

Goal: make Doctor inherit the same VHS design system as User/Clerk/Admin instead of overriding it. Inspection of `shared/dashboard-theme.css`, `admin/admin-style.css`, and the role accent files showed Doctor was flattening shared system styles (gradient navbar, gradient primary buttons, shared focus rings, nav hover slide, hover-reveal section markers). This pass removes those flattening overrides.

- Doctor now declares the User-portal purple accent tokens (`--accent*` from `user/user-accent.css`) so the shared navbar gradient, buttons, inputs, and focus rings resolve purple exactly as in the User portal.
- Navbar, sidebar hover/active, buttons (gradient primary, neutral secondary, 44px targets, hover lift, press feedback), inputs (1.5px borders, soft focus glow), and 250ms cubic-bezier(.4,0,.2,1) transitions now come from the shared system rules, matching the sibling portals.
- Mobile sidebar is a slide-in drawer with a dimmed overlay and animated hamburger, same pattern as the other portals; closes on navigation, overlay click, or Escape.
- Removed the standalone clinical-notice line (AI-review caveat now lives only in the single Demo data badge tooltip and README); no other demo text remains besides one header badge and short draft/handoff status labels.
- Kept the three-view workflow, per-patient drafts, and Emergency > Urgent > Routine severity contrast (filled red badge for Emergency).

### Verification (25 September 2026)

- `node --check doctor.js` syntax pass; browser console clean during checks.
- Compared computed styles against the User portal: primary button gradient/box-shadow, secondary button, input focus ring, navbar gradient, and nav-item hover/active states match.
- Views switched without reload with drafts (fields, medicines, labs, review ack) preserved per patient; Emergency and Urgent badges distinguishable at a glance.
- Checked 1440×900 desktop and 390×844 mobile: drawer opens/closes, one visible panel per view, no horizontal overflow.
- User, Clerk, Admin, shared, and PHP files untouched.

### Remaining frontend-only limitations (unchanged)

Fictional fixtures; static example AI summary; drafts live in memory only and reset on reload; "Save local draft" only marks state on the page; "Send to Front Desk" is disabled; availability changes local text only; no login, backend, or network calls.

Reused patterns found in source:

- `shared/dashboard-theme.css`: Nunito/Baloo type, rounded navigation, active marker, 250ms cubic-bezier(.4, 0, .2, 1) control transitions, primary hover lift, and press feedback.
- `user/user-accent.css`: brand purple #6d4ab1 / #563aa4 / #452f85. Doctor copies these color tokens without importing role-wide overrides or changing User.
- `user/user-style.css`: 44px button targets, neutral secondary buttons, 200ms appointment-card border/shadow feedback, and dated medical-history timeline hierarchy.
- `admin/admin-style.css`: existing portal shell, profile/navigation layout, cards, and labeled form controls already loaded by Doctor.

Changes stay in Doctor: calmer selection borders, separate visible keyboard focus, larger clinical input text, tighter mobile headers, compact history timeline, consistent button interaction states, and a neutral Continue action so Save remains the primary form action. Removed the duplicate active-patient badge and obsolete CSS for old statistic/demo cards. No chart was added: source inspection found no reusable chart implementation, and the fixture records provide no clinical measurement trends.

Rechecked in the local browser: patient-card and button hover states, 200/250ms computed transition durations, visible 2px keyboard focus rings with 3px offset, urgent red edge while selected, distinct Max/Luna drafts with medicine and lab retention, and local saving while new assignments are paused. No console errors. All three views had one visible panel and no horizontal overflow at 320, 768, and 1024px; 390px mobile and 1440px desktop screenshots were refreshed. Existing reduced-motion overrides disable animation and transforms. Admin, User, and shared file hashes matched before and after the pass.
