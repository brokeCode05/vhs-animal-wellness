# VHS Animal Wellness Center — BACKEND START HERE

> **Read this document first.** It is the entry point to the backend handoff package.
> The frontend is FROZEN (Phase 5, commit `99e8346`). Every contract in the Phase 6 docs is authoritative.
> This document encodes the **FINAL backend decisions** — where an older Phase 6 doc conflicts with a decision here, the decision here wins (the affected docs have been updated to match).

---

## 1. Project status

| Item | Status |
|---|---|
| Frontend (User / Doctor / Admin portals) | **FROZEN** — Phase 5, commit `99e8346`. Do not modify. |
| Final roles | **User · Doctor · Admin** (exactly three; no Clerk/Owner/Staff) |
| Clerk portal | **RETIRED** — `/clerk/*` URLs are redirect stubs to `/admin/*`. Never revive. |
| Phase 6 backend handoff docs | **COMPLETE** (commit `99c9003`) — contracts, schema, API surface, Laravel map, role matrix |
| Repository cleanup | **COMPLETE** (commit `b75e41d`) — legacy Clerk/Admin-editor assets removed (see §9) |
| Backend implementation | **NOT STARTED** — Laravel + MySQL. This is your phase. |
| AI triage (Vetty) | Not started, explicitly out of scope for now. Do not add. |

The three live portals are `/user/`, `/doctor/`, `/admin/`, backed by shared demo stores in `/shared/*.js`. The backend replaces those stores; the UI layer stays untouched.

## 2. Read these documents in this order

| # | Document | What it is for |
|---|---|---|
| 1 | [VHS_BACKEND_HANDOFF.md](VHS_BACKEND_HANDOFF.md) | High-level orientation: product summary, per-portal responsibilities, auth/boundary expectations, demo architecture, replacement strategy, seed data, workflow rules. |
| 2 | [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md) | Every entity's exact field shape, types, required/optional flags, validation notes, the appointment lifecycle transition table, document visibility rules, and the frozen audit action keys. This is the wire-format bible. |
| 3 | [VHS_DATABASE_BLUEPRINT.md](VHS_DATABASE_BLUEPRINT.md) | Per-table MySQL design: purpose, columns, keys, relationships, slot-concurrency strategy, seeds. |
| 4 | [VHS_API_CONTRACT.md](VHS_API_CONTRACT.md) | The recommended REST endpoint surface (13 groups) with roles, payloads, and error semantics. |
| 5 | [VHS_LARAVEL_MAP.md](VHS_LARAVEL_MAP.md) | Concrete Laravel structure: models, migration order, controllers → services → models, route skeleton, and the store→endpoint deletion list. |
| 6 | [VHS_ROLE_PERMISSIONS.md](VHS_ROLE_PERMISSIONS.md) | The role/permission matrix and server-audit rules. Implement as policies + middleware. |
| 7 | [vhs_schema.sql](vhs_schema.sql) | Runnable reference DDL for all 13 tables. Status ENUMs mirror the frontend exactly. |

Then read [VHS_FRONTEND_BACKEND_WIRING.md](VHS_FRONTEND_BACKEND_WIRING.md) for the per-domain chain of custody: UI → current store → future API → controller → service → model/table, with the exact frozen source files each chain will replace.

## 3. Frozen rules — do not change without team coordination

These are frozen frontend behaviors. The backend must implement them server-side, not "improve" them:

1. **Role names:** exactly `User`, `Doctor`, `Admin` (users.role enum).
2. **Appointment status names:** exactly `pending, confirmed, checked_in, in_consultation, completed, canceled, no_show, rescheduled`.
3. **Appointment lifecycle:** the guarded transition table in `shared/mock-appointments.js` `setStatus()` (reproduced in VHS_DATA_CONTRACT.md §12) must be enforced server-side. `completed` and `canceled` are terminal; `rescheduled` is never a status write.
4. **Reference number persistence:** `referenceNo` is permanent for the life of the appointment (shown to users, QR payload, audit/lookup key).
5. **Booking / reschedule / cancel behavior:** cutoff windows are settings-driven (reschedule 120 min, cancel 120 min); User operates on own records only within cutoffs; Admin walk-in books/approves/cancels; reschedule keeps the same appointment identity and returns the record to `confirmed`.
6. **User/Pet ownership rules:** pets belong to owners strictly via `ownerId`/`user_id` (never name-matched); a pet must belong to the booking user; every User-surface query is scoped by the authenticated user id.
7. **Doctor management behavior:** account status (`active`/`inactive` — login gate) and availability status (`on_duty`/`on_break`/`on_leave` — working status) are separate concepts; availability changes are audited old→new and sync Admin ↔ Doctor portal; no role selector in account creation (role is fixed per endpoint).
8. **Service keys:** the `value` snake_case keys (26 seeded services) are stable FK targets stored on appointments. Never regenerate, never rename. Inactive services disappear from NEW bookings only; history keeps its snapshot.
9. **Document visibility rules:** SOAP narrative is internal (Doctor-only, never in documents). Client-facing document types: `consultation_summary`, `prescription`, `lab_request`, `lab_result`, `receipt`. User sees own only; Admin sees client-facing ops list; Doctor sees all.
10. **Audit action semantics:** frozen action keys (e.g. `appointment_created`, `patient_checked_in`, `appointment_rescheduled` with old→new metadata), exactly one event per successful action, written in the same transaction.
11. **Frontend field names:** the portals expect the field names of VHS_DATA_CONTRACT.md (camelCase internally; the appointment mapper `shared/appointment-contract.js` `fromLegacy()` already accepts snake_case on the wire). Do not rename contract fields.

## 4. FINAL backend decisions

These decisions are **final and encoded in the updated Phase 6 docs**. Where an older doc said `BACKEND DECISION REQUIRED`, the decision is now fixed here.

### 4.1 Booking / account OTP
- Account verification uses **OTP via email and/or SMS**.
- **Booking verification keeps OTP** in the intended workflow (the booking wizard's OTP step becomes a real server-issued code).
- OTP must be **server-issued and server-validated**. Never trust frontend-only OTP state — the frontend demo accepts any 6 digits; the backend must not.
- Delivery provider (SMTP relay, SMS gateway, email+SMS) is a **backend concern** — pick and configure; the frontend only collects/submits the code.
- Related: `POST /api/auth/verify-otp` / `/api/auth/resend-otp` belong in the AUTH surface (see VHS_API_CONTRACT.md §1).

### 4.2 Reference number
- Backend **generates** the reference number at creation.
- Must be **unique** (DB `UNIQUE` constraint) and **never changes** during reschedule or any other transition.
- Same `appointmentId`/`referenceNo` represents the same appointment through its entire lifecycle.
- Generation format is a backend implementation detail if not already fixed — but it must be **human-readable and collision-safe**. The frontend demo format `VHS-YYYYMMDD-NNNN` (suffix visible in UI/QR) is a sensible baseline; whatever format you choose, the column stays VARCHAR(20), unique, immutable.

### 4.3 Doctor assignment
- The **User never picks a doctor**. There is no doctor selector in the frozen booking wizard and none must be added.
- Doctor assignment is done by the **system or the Admin workflow** (e.g. round-robin/queue by availability, or Admin assigns at check-in/approval).
- `appointments.assigned_vet_id` starts **NULL** and is filled by the assignment workflow; consultations require an assigned vet before `in_consultation`.
- Backend must **enforce** assignment rules server-side (User booking payloads carry no doctor field; a doctor field from the client is ignored/rejected).

### 4.4 Service price — single price model
- One price per service, not a range:

```sql
services.price            DECIMAL(10,2) NOT NULL
services.currency         CHAR(3)       NOT NULL DEFAULT 'PHP'
```

- Appointments snapshot price at booking so later catalog edits never change history:

```sql
appointments.price_at_booking          DECIMAL(10,2) NOT NULL
appointments.service_label_at_booking  VARCHAR(120)  NOT NULL
```

- **Do NOT introduce `price_min`/`price_max`** unless business requirements change later. (Earlier drafts of the blueprint/schema recommended a min/max pair — that recommendation is retired; docs updated.)

### 4.5 Password provisioning
- **Admin never sees plaintext passwords** — not at creation, not ever, by anyone.
- Admin-created Doctor/User accounts receive a **setup/reset link or OTP-based account activation** (server-issued token → user sets own password).
- Password hashing and reset tokens are **server-side only**. The `users.password` column stores hashes only; the API never returns password material.

### 4.6 Reschedule history — dedicated event table
- Reschedule history is recorded in a dedicated **`appointment_events`** table, not only a JSON column:

```sql
appointment_events
  id            BIGINT UNSIGNED AUTO_INCREMENT PK
  appointment_id FK → appointments
  event_type    VARCHAR(40)      -- e.g. 'rescheduled', 'created', 'canceled', 'no_show'
  old_date      DATE NULL
  old_time      TIME NULL
  new_date      DATE NULL
  new_time      TIME NULL
  actor_type    ENUM('User','Doctor','Admin')
  actor_id      BIGINT UNSIGNED NULL
  metadata      JSON NULL        -- supplementary context (reasons, channel)
  created_at    TIMESTAMP
```

- The compact `rescheduled_from` JSON column may remain as a display convenience, but **`appointment_events` is the authoritative history**. See vhs_schema.sql and VHS_DATABASE_BLUEPRINT.md §appointment_events.
- The reference number never changes on reschedule (see 4.2).

### 4.7 No-show policy
- No-show grace default = **15 minutes** (`clinic_settings.noshow_grace_minutes`, already seeded).
- After the grace period the backend may determine **eligibility** (candidate for no-show).
- **Admin confirms/marks** the no-show (`PATCH /api/appointments/:id/status` → `no_show`).
- **Never automatically mark a patient no-show solely because time elapsed** — no cron job flips status on its own; elapsed time only surfaces candidates to Admin.

### 4.8 Slot model — clinic-level first
- Initial implementation uses **clinic-level slots**: one availability grid from clinic settings (weekday/weekend hours, 60-min interval, last start inclusive) minus taken (non-terminal) appointments for the date.
- The User does not select a doctor; availability is per-clinic, not per-doctor.
- Architecture must **allow future doctor-specific slot capacity without breaking contracts** — that is why there is **no global `UNIQUE(appointment_date, appointment_time)`** (a plain global unique is invalid: multiple doctors could share a time later, and terminal appointments must free their slot). Use transaction serialization (`SELECT ... FOR UPDATE` + availability re-check) now; an `appointment_slots(slot_date, slot_time, doctor_id NULL, appointment_id UNIQUE)` helper table is the future per-doctor enforcement path (already sketched in VHS_DATABASE_BLUEPRINT.md).
- **Do not overbuild doctor-specific scheduling in the first backend iteration.**

## 5. Backend implementation order

Practical sequence — each phase yields a testable increment:

**PHASE B1 — FOUNDATION**
Laravel project under `/backend` (same repo) · environment + MySQL connection · migrations (order per VHS_LARAVEL_MAP.md §2) · models/relationships · seeders (26-service catalog, clinic settings defaults, Dr. Santos identity).

**PHASE B2 — AUTH**
register / login / logout · `auth/me` · OTP verification (issue/verify/resend — server-issued, server-validated) · password setup/reset (server-issued links/tokens, hashed storage) · role authorization middleware + policies.

**PHASE B3 — CORE DIRECTORY DATA**
Users · Pets · Doctors (accounts + profiles + availability) · Services (single-price model) · Clinic Settings.

**PHASE B4 — APPOINTMENTS**
availability endpoint · create (+ reference generation, price snapshot) · slot concurrency (serialize + re-check) · reschedule (same identity + `appointment_events` row) · cancel · check-in · lifecycle transition validation (guard table server-side) · no-show marking (Admin-confirmed, grace-driven eligibility).

**PHASE B5 — CLINICAL**
consultation start (`checked_in → in_consultation`) · SOAP/vitals persistence · prescriptions · lab requests/results · completion (`in_consultation → completed`, terminal).

**PHASE B6 — DOCUMENTS + AUDIT**
finalized client-facing documents fanned out in the completion transaction · document visibility/scoping enforcement · server-generated audit inside every action transaction.

**PHASE B7 — FRONTEND INTEGRATION**
Replace mock layers **one module at a time** (cutover order in §6). Do NOT replace every store at once.

## 6. Safe frontend cutover order

For each migration step: **keep the UI unchanged → replace the adapter/store internals → verify portal behavior → remove the demo fallback only after the API is stable.**

1. `auth/me` (session identity replaces `sessionStorage vhs_user` / demo actors)
2. Services (read catalog)
3. Clinic settings (read settings; slot math starts consuming server settings)
4. Users + Pets
5. Doctors
6. Availability (server becomes authoritative for slots)
7. Appointments read (lists/details/lookup by reference)
8. Booking (create; server-issued reference + OTP verification)
9. Reschedule / cancel / check-in (transition endpoints)
10. Consultation (SOAP flow)
11. Documents (finalized docs; remove demo fan-out)
12. Audit (read-only endpoint; delete `AuditLog.add` call sites last)

## 7. Authoritative backend responsibilities

The backend **owns** all of the following. The frontend is only a presentation/workflow layer:

- **Authentication** (login/session/token) and **authorization** (role middleware + ownership policies)
- **OTP** issuance and validation (booking + account verification)
- **Password hashing / reset** (server-side tokens; plaintext never visible)
- **Unique reference generation** (immutable for the appointment's life)
- **Slot concurrency** (serialize + availability re-check; no client-trusted availability)
- **Lifecycle transition validation** (guard table; terminal states stay terminal)
- **Ownership validation** (user/pet/appointment/document scoping by authenticated identity)
- **Doctor assignment** (system/Admin workflow; `assigned_vet_id` starts NULL)
- **Timestamps** (check-in/consultation stamps, created/updated)
- **Historical price snapshot** (`price_at_booking` + `service_label_at_booking` at create time)
- **Audit generation** (server writes audit rows; frontend never writes authoritative audit)
- **Document access control** (visibility rules per role; User own-only with server re-check)
- **Server validation** (all inputs re-validated; client checks are convenience only)
- **Transaction integrity** (action + audit + side effects like document fan-out in one transaction)

## 8. Common backend mistakes to avoid

- **Do not create a new appointment ID when rescheduling** — same `appointments.id`, mutated date/time.
- **Do not regenerate referenceNo during reschedule** — it is permanent.
- **Do not trust `userId`/`role` from the client payload** — resolve identity/role from the authenticated session; scope every query server-side.
- **Do not expose SOAP to User** (or Admin) — SOAP narrative stays internal to the consultation record and Doctor surface.
- **Do not let Admin read passwords** — Admin provisions via setup/reset links or OTP activation only.
- **Do not use only frontend availability checks** — the server re-checks slot availability inside a serialized transaction.
- **Do not allow direct `completed` → earlier status** — `completed` and `canceled` are terminal; no backward transitions.
- **Do not calculate historical price from the current service price** — historical appointments read their `price_at_booking` snapshot.
- **Do not allow a User to retrieve another User's documents/pets** — enforce ownership on every read, not just lists.
- **Do not let the frontend write authoritative audit events** — audit rows are server-generated inside the action transaction; the frontend store is a prototype.
- **Do not use a global `UNIQUE(date, time)`** — it would block future multi-doctor capacity and mis-handle freed slots; use transaction serialization (see 4.8).

## 9. Repository cleanup status

Repository cleanup was **completed** (commit `b75e41d`). Removed legacy: retired Clerk implementation JS/CSS (`clerk/clerk-script.js`, `clerk/clerk-style.css`, `clerk/clerk-accent.css`), the obsolete Admin website/editor pair (`admin/admin-script.js` + `admin/website.html`), the never-referenced `admin/admin-accent.css`, unused root image assets, `certs/ca.pem`, and root `index.php`.

Intentionally kept: the `/clerk/` redirect-stub HTML routes (preserve old URLs), runtime upload directories, and the legacy `web-page/index.php` backend reference where useful. **Do not repeat cleanup** — those paths are already handled; just don't recreate them.

## 10. Backend handoff checklist

### Before backend coding
- [ ] Read the handoff docs in §2 order (+ VHS_FRONTEND_BACKEND_WIRING.md)
- [ ] Confirm `.env` / MySQL settings (DB, connection, timezone)
- [ ] Confirm Laravel version
- [ ] Confirm OTP delivery provider (email / SMS / both) and credentials
- [ ] Confirm reference-number generation implementation (human-readable, collision-safe, unique, immutable)
- [ ] Confirm database migrations (run `vhs_schema.sql`-aligned migration set; verify status ENUM parity)
- [ ] Confirm role middleware + policies (User / Doctor / Admin matrix)
- [ ] Confirm seeders (26 services with single `price`, clinic settings defaults, Dr. Santos)

### Before frontend integration (each cutover step)
- [ ] API payloads match VHS_DATA_CONTRACT.md (snake_case accepted)
- [ ] Status strings match exactly (`pending, confirmed, checked_in, in_consultation, completed, canceled, no_show, rescheduled`)
- [ ] Ownership checks implemented server-side
- [ ] Concurrency tested (double-booking race → one 201, one 409)
- [ ] Audit server-generated (exactly once per successful action)
- [ ] Documents properly scoped (User own-only; no SOAP leakage)
- [ ] Frontend adapter can switch from mock → API (store internals swapped, UI unchanged, demo fallback removed only after verification)

---

*Prepared for the Laravel + MySQL backend phase. After this: implement per §5, integrate per §6. No Vetty, no frontend changes.*
