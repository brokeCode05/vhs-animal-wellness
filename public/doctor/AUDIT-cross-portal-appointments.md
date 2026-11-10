# Cross-Portal Appointment Data Audit

Audit only — no implementation. Scope: User → Clerk → Doctor appointment data and the future QR/check-in workflow. Sources read: `user/user-script.js`, `clerk/clerk-script.js`, `shared/dashboard-shared.js`, `php_files/book-appointment.php`, `php_files/get_appointments.php`, `php_files/update_appointment_status.php`, `vet_db.sql`, `doctor/doctor.js`.

---

## 1. Identifiers

| Identifier | User (booking) | Clerk (list) | Doctor (queue) | Backend |
|---|---|---|---|---|
| Appointment ID | mock `apt001…` (client-side counter) | `id` = real `appointment_id` (int) via `get_appointments.php` | mock `apt301…` | `appointment_id INT AUTO_INCREMENT` |
| Reference ID | `VHS-YYYYMMDD-000N` (mock counter) or real `VHS-Ymd-XXXXXX` after PHP booking | **not returned** by `get_appointments.php` | absent | **written** by `book-appointment.php`, but **column missing from `vet_db.sql`** and **not selected** in `get_appointments.php` |
| QR value | QR encodes the reference string (`text: refNo`) | nothing scans yet | n/a | n/a |

**Conflict:** the QR and the displayed reference are the same string on the User side, so QR↔reference is 1:1. But nothing server-side can resolve it today: `reference_no` is not in the schema dump and not in the read endpoint's SELECT. Clerk cannot look up an appointment by scanned reference.

## 2. User booking data (actual payload)

`_pendingBookingPayload` sent to `book-appointment.php`:
`user_id, pet_id, service, appointment_date (YYYY-MM-DD), appointment_time ("9:00 AM"), visit_reason, visit_reason_custom, notes`.

After OTP, `_finalizeBooking()` builds the mock record: adds `id` (mock), `pet_name/pet_type/pet_breed` (from `mockPetsData`), `status: 'scheduled'`, `reference_no` (mock format). Real backend inserts the same core fields plus `staff_id`, `status: 'scheduled'`, and its own `reference_no`; responds with `appointment_id` + `reference_no`.

Gaps: no `owner` object inline (name/phone come from session), `appointment_time` is a 12-hour display string, no `visit_reason` column in the DB (it's merged into `notes`), `user_id` can be `0` in the frontend fallback.

## 3. Clerk data

Clerk is backend-wired: `loadAppointments()` → `get_appointments.php` → rows `{ id, pet_id, staff_id, service, date, time, notes, status, created_at, owner_name, owner_phone, pet_name, pet_type, vet_name }`. Statuses rendered via `statusBadge()`. Missing vs User/Doctor needs: no `reference_no`, no `visit_reason` (buried in `notes`), `time` is raw `TIME` (display conversion in `formatDateTime`), no check-in state, `vet_name` present but no reliable `staff_id` when null (auto-assigned only at booking).

Clerk's own booking modal posts the same core fields as User (no `visit_reason`).

## 4. Doctor data

Doctor queue (`mockSchedule` → `mapAppointment()`) uses:
- **Appointment data:** `appointment_id, pet_id, service, appointment_date, appointment_time, visit_reason`, owner name, `checked_in` flag, `ai_triage`, `ai_summary` — appointment context is correct and booking-shaped.
- **Pet/EMR data:** `pet_name, pet_type, pet_breed, pet_age, owner_name, visits[]` (history with `{date, title, note}`). This is deliberately **not** assumed from the booking form — it mirrors the pet record (`mockPetsData` shape: `owner{name,phone}`, `visits[{date,service,vet,notes}]`). Note the shape mismatch with the DB `pets` table (`pet_name/pet_type` vs `species/breed` naming differs between user mock and schema).

Consultation records (`status, startedAt, completedAt, durationMinutes, soap, prescriptions, labRequests`) live per-appointment in memory; reset on reload.

## 5. Status model

| Where | Statuses used |
|---|---|
| DB ENUM | `pending, scheduled, completed, canceled` (main block) — migration comment block says `confirmed/cancelled` (double-l) |
| `update_appointment_status.php` | validates against live ENUM; fallback list `pending, scheduled, completed, canceled` |
| User mock | `scheduled, pending, completed, canceled` (+ "Confirmed" only in a doc comment) |
| Clerk actions | `pending` (approve/reject), `scheduled` (complete/cancel) |
| Doctor | `upcoming, checked_in, in_consultation, completed` (consultation lifecycle, local) |

Target lifecycle `confirmed → checked_in → in_consultation → completed` is missing three states end-to-end: no `confirmed` (Clerk "approve" currently moves `pending → scheduled`), no `checked_in`, no `in_consultation` anywhere in the DB/API. Also inconsistent spelling (`canceled` vs `cancelled`) between schema blocks. `rescheduled`/`no_show` do not exist anywhere.

**Recommended canonical model (proposal only, no refactor yet):** extend the ENUM to `pending, confirmed, checked_in, in_consultation, completed, canceled, no_show`; map Clerk "approve" → `confirmed`; User display of `confirmed` = "Confirmed/Upcoming"; keep Doctor's lifecycle states as the same values `checked_in → in_consultation → completed`.

## 6. Mock data

Three independent appointment datasets exist:
1. `user/user-script.js` — `mockAppointmentsData` (12 fixtures + client-created bookings, session-only).
2. `doctor/doctor.js` — `mockSchedule` (3 fixtures, booking-shaped, includes EMR/consultation fields).
3. Shared real path — `get_appointments.php` is the only cross-portal source, but **only Clerk/Admin consume it**; User and Doctor never read it.

Consequence: a booking made in User (session mock) never appears in Clerk's real list or Doctor's queue; the three portals show different "todays". Any check-in feature built now would have nothing shared to operate on until User/Doctor consume the same endpoint (or a shared mock store).

## 7. QR flow — what works vs what doesn't

- ✅ Works (frontend): User generates reference + QR (QRCode.js encodes the reference string) at booking success and in appointment details.
- ✅ Works (backend): `book-appointment.php` generates and stores `reference_no` and returns it in the response.
- ⚠️ Mock-only: User's success flow runs locally (`_finalizeBooking`) — no network call in the OTP path, so the real stored reference never reaches the user's UI; mock and real reference formats differ (`VHS-YYYYMMDD-000N` vs `VHS-Ymd-XXXXXX`).
- ❌ Missing: `reference_no` column in `vet_db.sql`; `reference_no` in `get_appointments.php` SELECT; any Clerk lookup/scan action (`resolve by reference`); any `checked_in` transition.

## 8. Canonical appointment contract (proposal)

Based on existing fields across `book-appointment.php`, `get_appointments.php`, User mocks, and Doctor's `mapAppointment`:

```js
appointment {
  appointmentId: number,          // PK (mock: stable 'aptNNN' until backend)
  referenceNo: string,            // 'VHS-Ymd-XXXXXX' — QR payload, unique
  userId: number,                 // owner
  petId: number,
  staffId: number | null,         // assigned veterinarian
  service: string,
  appointmentDate: 'YYYY-MM-DD',
  appointmentTime: 'HH:MM',       // normalize 12h display at the edges
  visitReason: string,            // promote out of notes
  notes: string,
  status: 'pending' | 'confirmed' | 'checked_in' | 'in_consultation'
        | 'completed' | 'canceled' | 'no_show',
  checkedInAt: string | null,
  // joined for display (read models):
  owner: { name, phone }, pet: { name, type, breed },
  vet: { id, name }
}
```

Doctor consultation fields (`startedAt/completedAt/duration/soap/prescriptions/labRequests`) stay in the separate consultation object keyed by `appointmentId` — EMR data must not be jammed into the appointment.

## Minimum changes needed before Clerk Check-In

1. **Schema:** add `reference_no VARCHAR(20) UNIQUE` and `checked_in_at TIMESTAMP NULL` to `appointments`; align the status ENUM (single spelling set) including `confirmed, checked_in, in_consultation, no_show`.
2. **Read endpoint:** add `reference_no` (+ `checked_in_at`) to `get_appointments.php` SELECT/response.
3. **User portal:** on real booking success, use the API's `appointment_id` + `reference_no` (drop the client-side mock counter in that path); QR keeps encoding `referenceNo`.
4. **Doctor portal:** point `mockSchedule` at `get_appointments.php` (it is already booking-shaped; `mapAppointment` just gains real IDs + `referenceNo`).
5. **Clerk portal:** add a resolve-by-reference action (new endpoint `check_in_appointment.php`: verify reference → set `checked_in` + `checked_in_at`, server-side status validation).

Until (1)–(2) land, QR scanning cannot resolve anything server-side; until (3)–(4), the three portals will keep showing divergent data.
