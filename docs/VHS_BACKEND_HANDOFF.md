# VHS Animal Wellness Center — Backend Handoff Guide

> **Audience:** the Laravel + MySQL backend developer taking over from the frozen frontend.
> **Status:** frontend is FROZEN as of Phase 5 (commit `99e8346`). Contracts in these documents are authoritative.
> **Related docs:** [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md) · [VHS_API_CONTRACT.md](VHS_API_CONTRACT.md) · [VHS_DATABASE_BLUEPRINT.md](VHS_DATABASE_BLUEPRINT.md) · [vhs_schema.sql](vhs_schema.sql) · [VHS_LARAVEL_MAP.md](VHS_LARAVEL_MAP.md) · [VHS_ROLE_PERMISSIONS.md](VHS_ROLE_PERMISSIONS.md)

---

## 1. Product summary

A veterinary clinic management system with three surfaces sharing one canonical dataset:

| Portal | Path | Primary user |
|---|---|---|
| **User** (pet owner) | `/user/` | books, reschedules, cancels own appointments; manages own pets and profile; views own documents |
| **Doctor** | `/doctor/` | runs today's queue: check-in-dependent consultations (SOAP, prescriptions, labs), issues client-facing documents, manages own availability |
| **Admin** (front desk) | `/admin/` | walk-in/assisted booking, check-in, approve/reject/cancel/reschedule, users & pets management, doctor accounts, services, clinic settings, documents list, audit log |

**Final roles: `User` · `Doctor` · `Admin`.** The legacy standalone Clerk portal was retired in Phase 4.1 — `/clerk/*` URLs are redirect stubs to `/admin/*` and must never be revived as a separate role.

## 2. Portal responsibilities (frozen behavior)

### User portal
- **Dashboard:** stat counts, upcoming-appointments table, My Pets preview — all from the same scoped canonical data.
- **My Appointments:** Upcoming vs Past History tabs; lifecycle-aware action buttons (Reschedule/Cancel only while `confirmed` and outside cutoff windows); status hints for checked-in / in-consultation states.
- **Booking wizard:** 3 steps (Pet & Service → Date & Time → Review & Book) → demo OTP → reference number + QR code. Honors clinic hours, slot interval, cutoffs.
- **My Pets:** scoped list (`ownerId` = session user), Add/Edit pet, Medical History timeline (portal-local demo fixtures), Vaccination Passport (fixtures).
- **My Profile:** own details; account access actions are backend-pending placeholders.
- **My Documents:** own finalized client-facing documents only.

### Admin portal
- **Dashboard:** canonical counts (Confirmed Appointments, Total Clients, Total Pets) + Today's Schedule from the real local date.
- **Appointments:** calendar + all-appointments table + details modal (Check In / Reschedule / Cancel actions), walk-in Book Appointment modal (client→pet cascade, service catalog, slot availability).
- **Clients & Pets:** users table (View Profile / Edit / Activate / Deactivate / Create User), pets table (Register Pet / Edit Pet). Ownership strictly by `ownerId`.
- **Accounts:** Doctor account administration ONLY (create/edit/activate/deactivate). No role selector exists; only one Admin account exists and is never creatable from the UI.
- **Doctors:** operational directory; availability select (On Duty / On Break / On Leave) writes the shared record the Doctor portal reads.
- **Services:** catalog CRUD (label, category/group with "Other" custom, price, active/inactive), delete only for unused Admin-created services.
- **Clinic Settings:** weekday/weekend first/last appointment (last start inclusive), slot interval, cancellation cutoff, reschedule cutoff, no-show grace, clinic info.
- **Documents:** read-only list/view of FINALIZED client-facing documents.
- **Audit Log:** read-only trail; filters (actor type / category / date); newest first; no export or delete.

### Doctor portal
- **Today's Patients queue** (real local date, status-driven): empty state works; only `checked_in` rows offer Start Consultation.
- **Consultation flow:** gated views — clinical notes locked until Start; SOAP form; prescriptions (medicine rows validated for completeness); lab requests; Save draft; Preview Clinical Document; Complete Consultation (immediate terminal state; button becomes disabled "Consultation Completed").
- **Availability:** own availability select synced with Admin through the same record.
- Identity comes from the shared Doctor record (frontend demo); backend must resolve it from the authenticated session.

## 3. Authentication expectations

- Roles: exactly `User`, `Doctor`, `Admin` (enum; no Clerk/Owner/Staff).
- **Admin has no session identity in the frontend demo** — every admin-side action uses one centralized demo actor (`admin-001 "Administrator"`), marked:
  `TODO(BACKEND): Resolve actor from authenticated server session.`
- The User portal keeps a `sessionStorage["vhs_user"]` fallback (`user-script.js` `_getSessionUser()`); the shared mock user is the demo fallback. Backend replaces this with the authenticated session/token:
  `TODO(BACKEND): the authenticated session is the real identity source.`
- Doctor identity: `SharedMockDoctors.currentDoctor()` (seed `vet-001 / Dr. Santos`); backend resolves from session:
  `TODO(BACKEND): resolved from the authenticated session instead.`
- No passwords, OTPs, or tokens are displayed or stored anywhere on the frontend. Account credentials are backend-provisioned. Password reset / unlock actions on the frontend are honest placeholders:
  `TODO(BACKEND): POST /auth/password-reset { email }` and `POST /auth/users/:id/unlock`.
- Booking OTP is a demo gate (any 6 digits accepted). Backend decides whether OTP verification is a real pre-booking step: **BACKEND DECISION REQUIRED**.

## 4. Authorization boundaries (summary — full matrix in VHS_ROLE_PERMISSIONS.md)

- User: own records only (profile, pets, appointments, documents). No internal SOAP. No other users' data. Server must scope every query by the authenticated user id — the frontend is not trusted.
- Doctor: assigned/today patients; full internal clinical record; finalize client-facing documents; own availability. No user management, no settings.
- Admin: operational front desk + administration; sees finalized client-facing documents; NEVER internal SOAP narrative; must not see user passwords (reset is server-issued, not displayed).
- All writes go through the server; the server re-validates every transition (see lifecycle spec) and writes audit records inside the same transaction.

## 5. Appointment lifecycle (see VHS_DATA_CONTRACT.md §Lifecycle for the transition table)

Normal flow: `confirmed → checked_in → in_consultation → completed`.
Side states: `canceled`, `no_show` (enforcement later), `pending` (legacy intake state still accepted), `rescheduled` never permanent (a reschedule returns the record to `confirmed` and is recorded as history + audit event).
Backed by the guarded transition table in `shared/mock-appointments.js` `setStatus()` — the backend endpoint must enforce the same table server-side.

## 6. Booking / reschedule / cancel behavior

- **Booking** (User wizard or Admin walk-in): creates ONE canonical record; returns DB-assigned `appointmentId` + `referenceNo` (frontend format `VHS-YYYYMMDD-NNNN` must remain; backend may keep or formally re-issue the format — **BACKEND DECISION REQUIRED** on collision-proof generation across days).
- Slot availability derives from effective non-terminal appointments for the date; the last start slot is inclusive (settings-driven hours + interval).
- **Reschedule** (User or Admin): allowed only while `confirmed` (User also blocked inside the reschedule cutoff window); keeps same `appointmentId`/`referenceNo`; stores previous date/time as history (`rescheduledFrom`); status returns to/stays `confirmed`; old slot freed, new slot occupied; exactly one audit event with old→new.
- **Cancel** (User within cancel cutoff, or Admin): allowed pre-consult (`confirmed`/`pending`); status `canceled`; slot freed; record remains historically readable; one audit event with reason in metadata.
- Cutoffs and grace are settings-driven (cancel cutoff 120 min, reschedule cutoff 120 min, no-show grace 15 min — current values; see VHS_DATA_CONTRACT.md §Clinic Settings).

## 7. Doctor consultation workflow

`checked_in` → Start (`in_consultation`, `consultationStartedAt` stamped) → SOAP/vitals/prescriptions/labs → Save draft → Complete (`completed`, `consultationCompletedAt` stamped; completion is terminal, no second attempt) → client-facing documents fan out (summary always; prescription/lab request only when ordered). Internal SOAP narrative stays in the consultation record, never in client-facing documents and never visible to Admin/User.

## 8. Documents behavior

- Two classes: **INTERNAL** (SOAP narrative, internal doctor notes — Doctor-only) and **CLIENT-FACING** (Consultation Summary, Prescription, Lab Request, Lab Result, Receipt).
- Finalization creates/exposes client-facing documents (frontend demo fan-out in `shared/document-store.js finalizeFromConsultation()`; backend does this server-side inside the completion transaction).
- Admin: list/view client-facing documents. User: own documents only (ownership re-checked at view time). Doctor: full internal + finalized docs.
- Full rules: VHS_DATA_CONTRACT.md §Document visibility.

## 9. Audit behavior

Frontend `AuditLog` (`shared/audit-store.js`) is a **prototype only** — one entry per successful action, actor resolved per portal, metadata carries old/new values where relevant. The backend is authoritative: each action writes an immutable `audit_logs` row inside the same DB transaction as the action (list of server-audited actions in VHS_ROLE_PERMISSIONS.md §Audit rules). The frontend is never trusted as the final audit source.

## 10. Services & settings ownership

- Services catalog: Admin edits; every consumer (booking lists, User cards, public site) reads active-only for NEW bookings; historical appointments keep their stored service value/label and snapshot price. Price format today is a display string (e.g. `₱300.00 – ₱2,000.00`) — backend should store structured min/max decimals + currency: **BACKEND DECISION REQUIRED** on final numeric model.
- Clinic Settings: single global row owned by Admin; consumed by booking slot generation, cutoffs, and displayed clinic info. Public website hero/hours also read it.

## 11. Frontend demo architecture (what the backend replaces)

Layered exactly as the backend should mirror it:

```
UI (portal pages / handlers)
   ↓ calls
shared stores (single canonical source per domain)
   shared/appointment-contract.js   ← canonical appointment model + status/time mapping
   shared/mock-appointments.js      (appointments; guarded transitions, reschedule, check-in)
   shared/mock-users.js             (users, pets, services)
   shared/mock-doctors.js           (doctor records, accountStatus, availabilityStatus)
   shared/clinic-settings.js        (global settings)
   shared/audit-store.js            (prototype audit)
   shared/document-store.js         (finalized documents)
   ↓ persist via
localStorage/sessionStorage (keys vhs_*; ONLY inside these modules — portal files never touch storage directly, except the User session helper)
```

Portal files (`admin/admin-portal.js`, `doctor/doctor.js`, `user/user-script.js`, page scripts) contain no persistence logic; they call the stores at exact success points and also emit `AuditLog.add(...)` there.

## 12. Backend replacement strategy

1. Stand up Laravel under `/backend` (same repo; see VHS_LARAVEL_MAP.md workflow).
2. Implement APIs per VHS_API_CONTRACT.md using the field names of VHS_DATA_CONTRACT.md (snake_case on the wire; the frontend mapper already accepts `snake_case`).
3. Replace each shared store's fetch layer one domain at a time; the shared modules are the deletion list (see VHS_LARAVEL_MAP.md §Store replacement map).
4. Server-side validation mirrors the frozen frontend guards (lifecycle table, slot checks, cutoffs, uniqueness) — then the frontend guards become convenience checks only.
5. Audit records switch to server generation on day one; frontend `AuditLog.add` call sites are removed last, after the API returns persisted entities.
6. Keep `reference_no` and stable service `value` keys intact — historical records depend on them.

## 13. Seed / reference data (see VHS_DATABASE_BLUEPRINT.md §Seeds for the full catalog)

- **Services:** the exact 26-service catalog (IDs 1–26, stable snake_case `value` keys, 5 groups) lives in `shared/mock-users.js` §CANONICAL SERVICE CATALOG — seed verbatim.
- **Clinic settings defaults:** weekday 09:00–17:00, weekend 10:00–18:00 (last start inclusive), slot interval 60, cancel cutoff 120, reschedule cutoff 120, no-show grace 15.
- **Doctor seed:** one doctor (Dr. Santos, `vet-001`, General Practice, active, on_duty) to preserve the demo identity.
- **Users/Pets:** the 3 demo users + 5 pets are DEMO fixtures, NOT required production seed. Seed only if the team wants the demo to keep working pre-auth.

## 14. Legacy cleanup notes (do NOT delete in Phase 6)

- `clerk/clerk-script.js`, `clerk/clerk-style.css`, `clerk/clerk-accent.css` — unreferenced after Clerk retirement (pages are redirect stubs).
- `admin/admin-script.js` + `admin/admin/website.html` pair — self-contained legacy website editor, no inbound links.
- These are **Phase 6+ cleanup debt**; removal only with explicit approval after backend lands.

## 15. Backend developer workflow (recommended)

- **Same GitHub repo.** Laravel lives under `/backend` (team preference honored).
- Work on a dedicated branch, e.g. `backend/laravel-core`; frontend stays frozen on `main`.
- PR/merge discipline as usual; do not edit frozen frontend contracts without coordination — if a contract change is genuinely required, raise it with the frontend owner and document the delta in the relevant doc.
- Do not duplicate the repository as the long-term workflow; one repo, one canonical history.

## 16. Verification

These documents were cross-checked against the frozen codebase: canonical statuses and transition table (`shared/appointment-contract.js`, `shared/mock-appointments.js`), pet field reference (`shared/mock-users.js` §CANONICAL PET PROFILE CONTRACT), service catalog keys/groups (26 services), doctor identity/availability (`shared/mock-doctors.js`), settings fields (`shared/clinic-settings.js`), document types (`shared/document-store.js`), audit actions (portal hook sites). Anything not derivable from the frontend is marked **BACKEND DECISION REQUIRED**.
