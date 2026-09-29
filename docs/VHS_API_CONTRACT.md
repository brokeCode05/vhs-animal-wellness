# VHS API Contract — Recommended Laravel REST Endpoints

> Basis: the frozen frontend contracts in [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md). Wire format **snake_case**.
> Auth: `Authorization: Bearer <token>` (Sanctum) or Laravel session cookie — **BACKEND DECISION REQUIRED** (SPA token vs cookie session).
> Common success envelope: `200/201` with the resource JSON. Common errors:
> `401 unauthenticated` · `403 forbidden` (role/ownership) · `404 not_found` · `422 validation_error` (field map) · `409 conflict` (duplicate/uniqueness/slot taken) · `422 business_rule` where a guard rejects (status transition, cutoff window) — exact error shape: **BACKEND DECISION REQUIRED**.

Legend: 🔓 public · 🔑 any authenticated role · roles listed per endpoint.

---

## 1. AUTH

| Endpoint | Method | Auth | Roles | Purpose |
|---|---|---|---|---|
| `/api/auth/register` | POST | 🔓 | — | user self-registration (public site) |
| `/api/auth/login` | POST | 🔓 | — | returns token/session + `{user, role}` |
| `/api/auth/logout` | POST | 🔑 | all | |
| `/api/auth/password-reset` | POST | 🔓 | — | issue reset (`{email}`) — replaces frontend placeholder |
| `/api/auth/unlock` | POST | 🔑 | Admin | unlock a locked/inactive-for-auth-reasons account |
| `/api/auth/me` | GET | 🔑 | all | current session identity (replaces `sessionStorage.vhs_user`, `SharedMockUsers.currentUser()`, `SharedMockDoctors.currentDoctor()`) |

**Login response (shape the portals rely on):**
```json
{
  "token": "...",
  "user": { "user_id": 1, "role": "User", "name": "Maria Santos", "email": "...", "status": "active" }
}
```
`role` drives portal routing (`User → /user/`, `Doctor → /doctor/`, `Admin → /admin/`). Inactive accounts: login refused.

**BACKEND DECISION REQUIRED:** whether the booking OTP flow is a real server-issued verification step (frontend demo accepts any 6 digits) or is dropped server-side.

## 2. USERS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/users` | GET | Admin | list (admin Clients table) |
| `/api/users/:id` | GET | Admin, **User (own only)** | profile view |
| `/api/users` | POST | Admin | create User (assisted) — validate firstName/lastName/email required, email unique |
| `/api/users/:id` | PATCH | Admin, **User (own profile)** | fields per contract; duplicate_email → 409 |
| `/api/users/:id/status` | PATCH | Admin | `{status: active|inactive}` — inactive = login disabled |

## 3. PETS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/users/:id/pets` | GET | Admin, **User (own id)** | scoped list (`ownerId` link, never name-matched) |
| `/api/pets/:id` | GET | Admin, **User (own pet)** | |
| `/api/pets` | POST | Admin, **User (own pets)** | `owner_not_found` → 404; species=Other requires speciesCustom |
| `/api/pets/:id` | PATCH | Admin, **User (own pet)** | |

## 4. DOCTORS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/doctors` | GET | 🔑 all | directory + booking assignment lists (active only for booking) |
| `/api/doctors` | POST | Admin | create Doctor (role fixed; credentials provisioned server-side) |
| `/api/doctors/:id` | PATCH | Admin | profile fields (Accounts edit) |
| `/api/doctors/:id/status` | PATCH | Admin | `{account_status: active|inactive}` |
| `/api/doctors/:id/availability` | PATCH | Admin, **Doctor (own)** | `{availability_status: on_duty|on_break|on_leave}` — audit old/new |

## 5. SERVICES

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/services` | GET | 🔓 (public site) / 🔑 | full catalog; consumers filter `active=1` for NEW bookings |
| `/api/services` | POST | Admin | label + group (custom allowed) + price + active |
| `/api/services/:id` | PATCH | Admin | edits; never wipes category with blank |
| `/api/services/:id/status` | PATCH | Admin | `{active: bool}` — history unaffected |

## 6. CLINIC SETTINGS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/clinic-settings` | GET | 🔓 (hours/info) / 🔑 all | single global record |
| `/api/clinic-settings` | PATCH | Admin | full-object update; audit changes |

## 7. APPOINTMENTS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/appointments` | GET | Admin (all), Doctor (assigned/today), **User (own)** | filters: `date`, `status`, `reference_no`, `user_id`, `pet_id` |
| `/api/appointments?reference_no=` | GET | Admin, **User (own)** | check-in lookup + QR resolve |
| `/api/appointments/:id` | GET | Admin, Doctor, **User (own)** | details modal payload |
| `/api/appointments` | POST | **User (own)**, Admin (walk-in) | create; server assigns `appointment_id` + `reference_no`; validates service active, slot free, date/time valid; snapshot `service_label_at_booking` + `price_at_booking` |
| `/api/appointments/:id` | PATCH | Admin, **User (own, reschedule only)** | date/time move — same id/referenceNo, status returns `confirmed`, `rescheduled_from` history |
| `/api/appointments/:id/status` | PATCH | Admin, Doctor | guarded transitions (§Lifecycle in VHS_DATA_CONTRACT.md): `checked_in` (Admin), `in_consultation`/`completed` (Doctor), `canceled` (Admin or own-User pre-cutoff), `confirmed` (Admin approve) |

**POST example:**
```json
{
  "pet_id": 1,
  "service": "consultation",
  "appointment_date": "2026-10-02",
  "appointment_time": "09:00",
  "visit_context": "Other",
  "custom_visit_context": "Lethargy and loss of appetite",
  "notes": ""
}
```
**Response `201`:**
```json
{
  "appointment_id": 307,
  "reference_no": "VHS-20261002-0307",
  "status": "confirmed",
  "appointment_date": "2026-10-02",
  "appointment_time": "09:00",
  "service_label_at_booking": "Consultation",
  "price_at_booking": "₱300.00 – ₱2,000.00"
}
```
Errors: `409 slot_taken` · `422 service_inactive` · `422 cutoff_window` (user reschedule/cancel inside settings window).

## 8. AVAILABILITY / SLOTS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/availability?date=YYYY-MM-DD` | GET | 🔑 (booking wizards) | slots per clinic settings minus taken (non-terminal appointments); last start inclusive; per-doctor variant: **BACKEND DECISION REQUIRED** |

## 9. CONSULTATIONS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/consultations` | POST | Doctor | `{appointment_id}` — transition `checked_in → in_consultation`, stamps start |
| `/api/consultations/:id` | PATCH | Doctor | save SOAP/vitals/prescriptions/lab requests (draft saves) |
| `/api/consultations/:id/complete` | POST | Doctor | transition `in_consultation → completed`, stamps end + duration, **fans out client-facing documents in the same transaction** |

Consultation object = `buildConsultation()` shape in VHS_DATA_CONTRACT.md §6 (SOAP internal; prescriptions/labs structured).

## 10. PRESCRIPTIONS / LABS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/consultations/:id/prescriptions` | GET/POST/PATCH | Doctor | rows validated complete (no half-filled medicine rows) |
| `/api/lab-requests` | GET/POST | Doctor | `{consultation_id, test, notes}` |
| `/api/lab-requests/:id` | PATCH | Doctor/Admin | result summary + `status: completed` → Lab Result document |

## 11. DOCUMENTS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/documents` | GET | Admin | finalized client-facing docs (filters: type, date) |
| `/api/documents?user_id=me` | GET | **User** | own only — server-scoped |
| `/api/documents?pet_id=` | GET | Admin, **User (own pet)** | |
| `/api/documents/:id` | GET | Admin, **User (own)**, Doctor | ownership enforced server-side |
| PDF/export | — | — | **BACKEND DECISION REQUIRED**: server-side generation replaces the client print renderer |

## 12. AUDIT LOG

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/audit-logs` | GET | Admin | filters: actor type, category (entity type), date; newest first; read-only |

Frontend never writes audit records to the API — the server writes them inside each action transaction (VHS_ROLE_PERMISSIONS.md §Audit rules).

## 13. Store → endpoint replacement (quick map)

| Frontend call | Endpoint |
|---|---|
| `SharedMockAppointments.add()` | POST `/api/appointments` |
| `SharedMockAppointments.setStatus()/checkIn()` | PATCH `/api/appointments/:id/status` |
| `SharedMockAppointments.reschedule()` | PATCH `/api/appointments/:id` |
| `SharedMockUsers.users()/byId()/addUser()/updateUser()/setUserStatus()` | `/api/users` group |
| `SharedMockUsers.pets()/petById()/addPet()/updatePet()` | `/api/users/:id/pets`, `/api/pets` |
| `SharedMockUsers.services()/addService()/updateService()/setServiceStatus()/deleteService()` | `/api/services` group |
| `SharedMockDoctors.*` | `/api/doctors` group |
| `VHSClinicSettings.get()/update()` | `/api/clinic-settings` |
| `SharedDocuments.*` | `/api/documents` group |
| `AuditLog.*` | server-written only; GET `/api/audit-logs` |
| `sessionStorage vhs_user` / `_getSessionUser()` | `/api/auth/me` |
