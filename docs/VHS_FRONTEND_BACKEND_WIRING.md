# VHS Frontend → Backend Wiring Map

> Purpose: map the **frozen frontend architecture** (UI → shared demo store → future API → Laravel controller → domain service → model/table) so the backend developer knows exactly where each frontend call will later be replaced.
> **Do not modify the frozen frontend files listed here** — they are the replacement map, not the work item. The backend swaps store internals (or provides an adapter) domain-by-domain; UI files stay untouched.
> Contracts: [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md) (field shapes, snake_case accepted) · Final decisions: [BACKEND_START_HERE.md](BACKEND_START_HERE.md) §4 · Endpoints detail: [VHS_API_CONTRACT.md](VHS_API_CONTRACT.md) · Laravel structure: [VHS_LARAVEL_MAP.md](VHS_LARAVEL_MAP.md) · Shared-file dependency audit: [VHS_SHARED_LAYER_MAP.md](VHS_SHARED_LAYER_MAP.md) (per-file consumers, globals, final fates, safe-deletion conditions — the authority on when a shared file may be removed).

**Chain notation:** `FRONTEND UI → CURRENT SHARED STORE → FUTURE API → CONTROLLER → SERVICE → MODEL/TABLE`

---

## 0. AUTH / SESSION

**Current state (demo):** `sessionStorage["vhs_user"]` via `user/user-script.js` `_getSessionUser()` (line ~134) is the User identity; Admin actions use the centralized demo actor `shared/audit-store.js` `ADMIN_ACTOR` (`admin-001 "Administrator"`); Doctor identity is `shared/mock-doctors.js` `currentDoctor()` (`vet-001 / Dr. Santos`).

```
User / Doctor / Admin UI
  → sessionStorage vhs_user (_getSessionUser) · ADMIN_ACTOR (audit-store) · SharedMockDoctors.currentDoctor()
  → GET /api/auth/me        (+ POST /api/auth/login|register|logout, /api/auth/verify-otp, /api/auth/resend-otp, /api/auth/password-reset)
  → AuthController
  → AuthService
  → users (+ OTP/reset token storage — server-side concern)
```

**Future:** server session/token (Sanctum) is the single identity source. The authenticated session replaces all three demo identity mechanisms. OTP is **real**: server-issued and server-validated (email/SMS; provider is a backend concern). Password setup/reset via server-issued links/tokens; plaintext never stored or displayed.

**Source files (frozen, do not edit):** `user/user-script.js` (`_getSessionUser`), `shared/audit-store.js` (`ADMIN_ACTOR`, `adminActor()`), `shared/mock-doctors.js` (`currentDoctor()`), plus login/registration UI in `user/user-script.js`.

**Backend notes:** `auth/me` must return `{user_id, role, name, email, status}`. Inactive accounts refused at login. Role middleware: `role:User` / `role:Doctor` / `role:Admin`.

## 1. USERS

```
Admin Clients & Pets (users table) · User My Profile
  → SharedMockUsers.users()/byId()/addUser()/updateUser()/setUserStatus()
  → /api/users · /api/users/:id · /api/users/:id/status
  → UserController
  → UserService
  → users
```

**Future:** Admin manages directory + status (activate/deactivate); User edits own profile only (server-scoped). `email` unique; password never from frontend (setup/reset links / OTP activation — see BACKEND_START_HERE §4.5).

**Source files:** `shared/mock-users.js` (USERS block), `admin/admin-portal.js` (Admin Clients & Pets handlers, Accounts create/edit user handlers), `user/user-script.js` (profile form).

## 2. PETS

```
User My Pets · Admin Clients & Pets (pets table) · booking pet selector
  → SharedMockUsers.pets()/petById()/addPet()/updatePet()
  → /api/users/:id/pets · /api/pets · /api/pets/:id
  → PetController
  → PetService
  → pets (owner_id FK, strict ownership)
```

**Future:** ownership strictly by `owner_id` (never name-matched); species `Other` requires `speciesCustom`; pet must belong to the booking user (server-enforced at booking).

**Source files:** `shared/mock-users.js` (PETS + §CANONICAL PET PROFILE CONTRACT), `user/user-script.js` (My Pets, booking selector), `admin/admin-portal.js` (Register/Edit Pet).

## 3. DOCTORS

```
Admin Accounts (doctor CRUD) · Admin Doctors (availability select) · Doctor portal identity
  → SharedMockDoctors.* (addDoctor/updateDoctor/setAccountStatus/setAvailability/currentDoctor)
  → /api/doctors · /api/doctors/:id · /api/doctors/:id/status · /api/doctors/:id/availability
  → DoctorController
  → DoctorService
  → users (role=Doctor) + doctor_profiles (1:1, account_status + availability_status)
```

**Future:** account status and availability status are separate concepts (frozen rule); availability changes audited old→new; Doctor portal identity resolves from the authenticated session, not the mock seed.

**Source files:** `shared/mock-doctors.js`, `admin/admin-portal.js` (Accounts + Doctors handlers), `doctor/doctor.js` (`_currentDoctor()`, availability UI).

## 4. SERVICES

```
Admin Services (CRUD) · User booking service selection · public services page
  → SharedMockUsers.services()/addService()/updateService()/setServiceStatus()/deleteService()
  → /api/services · /api/services/:id · /api/services/:id/status
  → ServiceController
  → ServiceService
  → services (stable `value` key; single price model)
```

**Future:** single price model — `price DECIMAL(10,2)` + `currency CHAR(3) DEFAULT 'PHP'` (no min/max). Stable `value` keys are FK targets stored on appointments; inactive services removed from NEW bookings only; history reads snapshots. Delete only unused Admin-created services.

**Source files:** `shared/mock-users.js` (§CANONICAL SERVICE CATALOG — 26 services), `admin/admin-portal.js` (Services CRUD), `user/user-script.js` (booking step 1, services page).

## 5. CLINIC SETTINGS

```
Admin Clinic Settings · slot generation · document letterhead · public site hours
  → VHSClinicSettings.get()/update()
  → /api/clinic-settings
  → ClinicSettingController
  → ClinicSettingService (or ClinicService)
  → clinic_settings (single global row)
```

**Future:** single global row; consumed by slot generation, cutoff checks, documents letterhead, public site. Updates audited (changed fields old→new). Defaults: weekday 09:00–17:00, weekend 10:00–18:00 (last start inclusive), interval 60, cutoffs 120/120, **grace 15**.

**Source files:** `shared/clinic-settings.js`, `admin/admin-portal.js` (Clinic Settings form: `csNoShowGrace` etc.), `admin/website.html` was removed in cleanup — public site reads the same record.

## 6. APPOINTMENTS

```
User Booking wizard · User My Appointments · Admin Appointments (calendar/table/modals) · Doctor Today's Patients queue
  → SharedMockAppointments (add/reschedule/cancel/setStatus/checkIn/byReference/takenSlots/isSlotAvailable/all)
  → /api/appointments · /api/appointments/:id · /api/appointments/:id/status · /api/appointments?reference_no=
  → AppointmentController
  → AppointmentService
  → appointments (canonical lifecycle spine)
```

**Actions:**

| Action | Frontend call (frozen) | API | Controller → Service | Table notes |
|---|---|---|---|---|
| **create** | `SharedMockAppointments.add()` — `user/user-script.js` booking wizard + `admin/admin-portal.js` walk-in modal | `POST /api/appointments` | `AppointmentController@store` → `AppointmentService::create()` | server assigns id + `reference_no` (immutable), snapshots `service_label_at_booking` + `price_at_booking DECIMAL(10,2)`, validates active service + free slot |
| **reschedule** | `SharedMockAppointments.reschedule()` — user reschedule modal + `adminReschedule*` flow (`admin/appointments.html` + admin-portal.js) | `PATCH /api/appointments/:id` | `AppointmentController@update` → `AppointmentService::reschedule()` | **same appointment id + reference_no**; status returns `confirmed`; old slot freed; writes `appointment_events` row (old→new) + one audit event; cutoff-checked |
| **cancel** | `SharedMockAppointments.cancel()` — user cancel modal + Admin cancel action | `PATCH /api/appointments/:id/status` (→`canceled`) | `AppointmentController@setStatus` → `AppointmentService::transition()` | allowed pre-consult (`confirmed`/`pending`); slot freed; record stays readable; reason in audit metadata |
| **check-in** | `SharedMockAppointments.checkIn()` — Admin details modal + check-in lookup | `PATCH /api/appointments/:id/status` (→`checked_in`) | same | stamps `checked_in_at` server-side; reference lookup via `?reference_no=` (QR) |
| **lookup by reference** | `SharedMockAppointments.byReference()` — Admin check-in lookup + QR scan | `GET /api/appointments?reference_no=` | `AppointmentController@index` → service scoped query | unique immutable `reference_no` |
| **status transitions** | `SharedMockAppointments.setStatus()` — guarded table | `PATCH /api/appointments/:id/status` | `AppointmentService::transition()` | enforce the frozen guard table server-side: `confirmed→checked_in→in_consultation→completed`; `completed`/`canceled` terminal; `rescheduled` never a status write; `pending→confirmed` (Admin approve) |

**Future:** backend authoritative for slots, lifecycle, cutoffs, reference generation, price snapshots, and `appointment_events` history. Doctor assignment is system/Admin — User never picks a doctor; `assigned_vet_id` NULL until assigned. No-show: grace 15 min (settings), backend may flag eligible candidates after grace, **Admin confirms/marks**; never auto-marked on elapsed time alone.

**Source files:** `shared/mock-appointments.js` (store + guard table in `setStatus()`), `shared/appointment-contract.js` (canonical model, `fromLegacy` snake_case mapper), `user/user-script.js` (booking wizard, My Appointments), `admin/admin-portal.js` (Appointments, walk-in booking, check-in lookup), `admin/appointments.html` (modals incl. hidden `adminRescheduleApptId` field), `doctor/doctor.js` (Today's Patients queue reads the same store).

## 7. AVAILABILITY

```
Booking wizard date/time pickers (User + Admin walk-in)
  → SharedMockAppointments.takenSlots(date) / isSlotAvailable(date, time) · slot grid from VHSClinicSettings
  → GET /api/availability?date=YYYY-MM-DD
  → AvailabilityController
  → AvailabilityService (settings-driven grid minus taken non-terminal appointments)
  → appointments (+ future appointment_slots helper table for per-doctor capacity)
```

**Future:** the backend becomes **authoritative for slot availability and concurrency** — frontend checks are convenience only. Clinic-level slots first (no global `UNIQUE(date, time)`); transaction serialization (`SELECT ... FOR UPDATE` + re-check) inside create/reschedule; future doctor-specific capacity without breaking contracts (see BACKEND_START_HERE §4.8).

**Source files:** `shared/mock-appointments.js` (`takenSlots`, `isSlotAvailable`), `shared/clinic-settings.js` (slot grid inputs), `user/user-script.js` (slot picker), `admin/admin-portal.js` (`_populateAdminRescheduleSlots`, walk-in modal slots).

## 8. CONSULTATIONS

```
Doctor Start Consultation → SOAP form → prescriptions → labs → Complete
  → doctor/doctor.js local consultation state (buildConsultation()) + SharedMockAppointments.setStatus()
  → POST /api/consultations · PATCH /api/consultations/:id · POST /api/consultations/:id/complete
  → ConsultationController
  → ConsultationService
  → consultations (INTERNAL clinical record; SOAP never client-facing) + prescriptions + lab_requests
```

**Future:** start = `checked_in → in_consultation` transition (stamps `consultation_started_at`); complete = `in_consultation → completed` (terminal, stamps `consultation_completed_at`) and **fans out client-facing documents in the same transaction**. SOAP narrative stays internal — never in documents, never visible to Admin/User.

**Source files:** `doctor/doctor.js` (`buildConsultation()` ~line 616, start/complete handlers, `finalizeFromConsultation` fan-out).

## 9. PRESCRIPTIONS / LABS

```
Doctor clinical workspace (prescription rows, lab checkboxes)
  → consultation draft state in doctor/doctor.js (validated complete rows)
  → /api/consultations/:id/prescriptions · /api/lab-requests · /api/lab-requests/:id
  → PrescriptionController / LabRequestController
  → ConsultationService (or PrescriptionService / LabRequestService)
  → prescriptions · lab_requests (+ lab_results when a real lab workflow exists)
```

**Future:** prescription rows validated complete on write (no half-filled medicine rows); lab request status `requested → processing → completed`; result summary becomes the Lab Result document source.

**Source files:** `doctor/doctor.js` (prescription rows + lab checkboxes, draft save).

## 10. DOCUMENTS

```
Doctor finalization (consultation completion fan-out) · Admin Documents (list/view) · User My Documents (own)
  → SharedDocuments (add/forUser/forPet/forAppointment/byId/finalizeFromConsultation) + SharedDocumentRender.render (print view)
  → /api/documents · /api/documents/:id (GET only for frontend)
  → DocumentController
  → DocumentService
  → documents (finalized client-facing only; payload JSON per type)
```

**Future:** documents are created **server-side** in the completion transaction (`ConsultationService::complete()` → `DocumentService::finalizeFromConsultation()` twin). Admin Documents and User My Documents consume **backend-issued client-facing documents** — User own-only (ownership re-checked server-side at view time); Admin never sees SOAP; Doctor sees internal + finalized. PDF/export generation is a server concern (replaces the client print renderer).

**Source files:** `shared/document-store.js` (types, scoping, `finalizeFromConsultation()`), `shared/document-render.js` (print rendering — presentation only), `doctor/doctor.js` (fan-out on completion), `admin/documents-page.js` (Admin list), `user/user-script.js` (`_renderUserDocuments`, `openUserDocument` ownership re-check).

## 11. AUDIT

```
Admin Audit Log (read-only, filters)
  → window.AuditLog (shared/audit-store.js) — PROTOTYPE ONLY
  → GET /api/audit-logs (Admin-only, read-only)
  → AuditLogController
  → AuditService::write() (called inside every action transaction — NOT an API write path)
  → audit_logs (INSERT-only)
```

**Future:** the frontend must **NOT create authoritative audit rows** after backend integration. Every audited action is written by the server inside the same transaction as the action (actor resolved from the authenticated session, one row per successful action). The frontend `AuditLog.add(...)` call sites are deleted last (cutover step 12), after every endpoint writes server audit rows and the Admin list reads `GET /api/audit-logs`.

**Source files:** `shared/audit-store.js` (prototype + `ADMIN_ACTOR`), `admin/audit-log-renderer.js` + `admin/audit-log.html` (Admin read view), `admin/admin-portal.js` / `user/user-script.js` / `doctor/doctor.js` (the call sites to delete last).

---

## 12. Backend implementation order (B1–B7)

- **B1 FOUNDATION** — Laravel under `/backend` · env + MySQL · migrations · models/relationships · seeders.
- **B2 AUTH** — register/login/logout · `auth/me` · OTP (issue/verify/resend) · password setup/reset · role authorization.
- **B3 CORE DIRECTORY DATA** — Users · Pets · Doctors · Services (single price) · Clinic Settings.
- **B4 APPOINTMENTS** — availability · create (+reference +price snapshot) · slot concurrency · reschedule (+`appointment_events`) · cancel · check-in · lifecycle validation · no-show (Admin-marked).
- **B5 CLINICAL** — consultation start · SOAP persistence · prescriptions · labs · completion (+document fan-out).
- **B6 DOCUMENTS + AUDIT** — finalized documents + visibility · server audit in every transaction.
- **B7 FRONTEND INTEGRATION** — replace mock layers **one module at a time** (order §13). Never all at once.

Full detail in [BACKEND_START_HERE.md](BACKEND_START_HERE.md) §5.

## 13. Safe frontend cutover order (1–12)

For each step: keep UI unchanged → replace adapter/store internals → verify portal behavior → remove demo fallback only after the API is stable.

1. **auth/me** — session identity replaces `sessionStorage vhs_user` / demo actors
2. **services** — catalog reads
3. **clinic settings** — settings reads; slot math consumes server settings
4. **users/pets** — directory + profile + pet CRUD
5. **doctors** — directory, availability, portal identity
6. **availability** — server authoritative for slots
7. **appointments read** — lists/details/lookup by reference
8. **booking** — create (server reference, OTP verification)
9. **reschedule/cancel/check-in** — transition endpoints
10. **consultation** — SOAP flow
11. **documents** — server-issued docs; demo fan-out removed
12. **audit** — read endpoint; delete `AuditLog.add` call sites last

## 14. Backend responsibilities (authoritative)

Authentication · authorization · OTP · password hashing/reset · unique reference generation · slot concurrency · lifecycle transition validation · ownership validation · doctor assignment · timestamps · historical price snapshot · audit generation · document access control · server validation · transaction integrity.

The frontend remains a presentation/workflow layer — it never grants authority (identity, role, ownership, availability, audit, prices) from client state. Full list with rationale: [BACKEND_START_HERE.md](BACKEND_START_HERE.md) §7.

## 15. Common mistakes to avoid

- Do not create a new appointment ID when rescheduling.
- Do not regenerate `referenceNo` during reschedule (or ever).
- Do not trust `userId`/`role` from client payloads.
- Do not expose SOAP to User (or Admin).
- Do not let Admin read passwords.
- Do not use only frontend availability checks.
- Do not allow direct `completed` → earlier status (terminal).
- Do not calculate historical price from the current service price — read `price_at_booking`.
- Do not allow a User to retrieve another User's documents/pets.
- Do not let the frontend write authoritative audit events.
- Do not use a global `UNIQUE(date, time)` on appointments (future multi-doctor capacity; freed slots).

## 16. Quick source-file index

| File | Role | Replaced by |
|---|---|---|
| `shared/appointment-contract.js` | Canonical appointment model; `fromLegacy` accepts snake_case | unchanged (adapter layer) |
| `shared/mock-appointments.js` | Appointments store + guarded transitions + slots | Appointment API + `AppointmentService` |
| `shared/mock-users.js` | Users, pets, 26-service catalog | User/Pet/Service APIs |
| `shared/mock-doctors.js` | Doctor records, identity seed | Doctor API + `/api/auth/me` |
| `shared/clinic-settings.js` | Global clinic settings | Clinic Settings API |
| `shared/audit-store.js` | Prototype audit + demo Admin actor | server audit (no client write) |
| `shared/document-store.js` | Finalized documents store | Documents API + server storage |
| `user/user-script.js` | User portal UI + session helper | unchanged UI; session → `/api/auth/me` |
| `admin/admin-portal.js` | Admin portal UI | unchanged UI |
| `doctor/doctor.js` | Doctor portal UI + `buildConsultation()` | unchanged UI; state → Consultation API |
| `admin/appointments.html` | Appointment modals (incl. hidden reschedule id field) | unchanged UI |
| `shared/dashboard-shared.js` | Shared render helpers (details modal) | unchanged UI |

*Freeze reminder: these files are the map, not the work item. Backend integration happens by swapping store internals/adapter — the UI files above stay frozen. For each shared file's exact consumers, globals, final fate (KEEP / KEEP BUT REWIRE / REPLACE THEN DELETE), and safe-deletion conditions, see [VHS_SHARED_LAYER_MAP.md](VHS_SHARED_LAYER_MAP.md); for the adapter approach (contracts stay, stores become API-backed services), see §16 and the cutover order in §13.*
