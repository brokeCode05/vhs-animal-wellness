# VHS API Contract — Recommended Laravel REST Endpoints

> Basis: the frozen frontend contracts in [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md). Wire format **snake_case**.
> Auth: **session/cookie based (locked)** — see §0.1. For the current Laravel web application, prefer secure session cookies; token auth is **not** hardcoded and is revisited only if an explicit architecture requirement needs it. The endpoint tables below are **transport-agnostic**.
> Response envelope: **one canonical JSON shape for every endpoint** (§0.2) — standardized before frontend API integration.

Legend: 🔓 public · 🔑 any authenticated role · roles listed per endpoint.

---

## 0. ENVELOPE + AUTH TRANSPORT (locked)

### 0.1 Auth transport

**Locked decision: session/cookie-based authentication.** For the current Laravel web application, prefer secure session cookies. Do not hardcode token auth — revisit only if a later architecture requirement explicitly needs API tokens.

The endpoint tables below stay **transport-agnostic**: they define *who may call what*, not how the session is carried. These security requirements apply regardless:

- session cookie **`HttpOnly`** — not readable by JavaScript
- **`Secure`** in production
- **`SameSite`** set appropriately (`lax` is the sane default)
- **CSRF protection** on state-changing requests
- **session regeneration after login** (prevents session fixation)
- **server-side role enforcement** — role resolved from the session, never from the request body

### 0.2 Canonical response envelope

Every endpoint — auth, users, pets, appointments, clinical, documents, audit — returns this shape.

**Success**
```json
{
  "success": true,
  "message": "Human-readable message",
  "data": {}
}
```

**Validation / error**
```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": {
    "field": ["Validation message"]
  }
}
```

Rules:

- `data` may be `null` or **omitted** when there is nothing useful to return.
- `errors` may be `null` or **omitted** when the failure is not field-level validation.
- **Never expose stack traces or internal exception details** — not in `message`, not anywhere else in the response. Log them server-side only.
- Use correct HTTP status codes: `200`/`201` success · `401 unauthenticated` · `403 forbidden` (role/ownership) · `404 not_found` · `409 conflict` (duplicate email, slot taken) · `422 validation_error` (field map) · `422 business_rule` (status transition, cutoff window).
- Keep the structure **consistent across all sections**, not just auth.

---

## 1. AUTH

| Endpoint | Method | Auth | Roles | Purpose |
|---|---|---|---|---|
| `/api/auth/register` | POST | 🔓 | — | **owner self-registration (public site) — creates the OWNER ACCOUNT ONLY, no pet.** See §1.1 |
| `/api/auth/login` | POST | 🔓 | — | returns token/session + `{user, role}` |
| `/api/auth/logout` | POST | 🔑 | all | |
| `/api/auth/verify-otp` | POST | 🔓 | — | verify server-issued OTP (`{identifier, code, context}`) — account verification and booking verification (final decision BACKEND_START_HERE.md §4.1) |
| `/api/auth/resend-otp` | POST | 🔓 | — | re-issue OTP (rate-limited) |
| `/api/auth/password-reset` | POST | 🔓 | — | issue reset (`{email}`) — replaces frontend placeholder; also provisions Admin-created accounts via setup links/OTP activation |
| `/api/auth/unlock` | POST | 🔑 | Admin | unlock a locked/inactive-for-auth-reasons account |
| `/api/auth/me` | GET | 🔑 | all | current session identity (replaces `sessionStorage.vhs_user`, `SharedMockUsers.currentUser()`, `SharedMockDoctors.currentDoctor()`) |

**Login response (shape the portals rely on):**
```json
{
  "success": true,
  "message": "Logged in.",
  "data": {
    "user": { "user_id": 1, "role": "User", "name": "Maria Santos", "email": "...", "status": "active" }
  }
}
```

The session is established server-side (cookie); no bearer token is required. If a future architecture decision adds tokens, add a `data.token` field **without changing the envelope**.

`role` drives portal routing (`User → /user/`, `Doctor → /doctor/`, `Admin → /admin/`). Inactive accounts: login refused.

**OTP (final decision):** OTP is REAL — server-issued and server-validated for account verification and kept in the booking workflow. The frontend demo accepts any 6 digits; the backend must validate against its own issued codes. Never trust frontend OTP state. Delivery provider (email/SMS) is a backend concern.

**OTP persistence:** never a plaintext column on `users`. Persist a **temporary, expiring verification record** (see `account_verifications` in [VHS_DATABASE_BLUEPRINT.md](VHS_DATABASE_BLUEPRINT.md)): store a **hash** of the code, an authoritative `expires_at`, and `consumed_at` for single use. Rate-limit issue + resend per identifier and per IP.

### 1.1 `POST /api/auth/register` — signup contract (frozen)

**Creates the OWNER ACCOUNT ONLY. No pet is created at signup.** No appointment, consultation, vaccination, medical history, prescription, lab result or document either — those belong to the separate first-pet onboarding flow (§3.1), which happens only after verification and login.

Request fields and the limits the backend must enforce authoritatively (mirror `shared/signup-wizard.js` v1.1.0 `LIMITS`):

| Field | Rule | Notes |
|---|---|---|
| `email` | required, **max 254**, valid format | **unique** after trim + lowercase normalisation → `409` on conflict |
| `password` | required, **8–72** | 72 is the bcrypt `PASSWORD_BCRYPT` truncation boundary; store a **hash only**, never echo it back |
| `password_confirmation` | must equal `password` | UI-only concern, but validate server-side too; never persisted |
| `first_name` / `last_name` | required, **max 50** | letters (any script), space, hyphen, apostrophe, period all legitimate; whitespace-only rejected |
| `middle_name` | optional, **max 50** | nullable |
| `phone` | required for self-registration | frontend collects PH local `9XXXXXXXXX`; store the **canonical normalised** value (`+639XXXXXXXXX`) |
| `birthdate` | required, valid real date, **not future**, **age ≥ 18** | cutoff computed from the current date server-side; **never hardcode a cutoff year** |
| `address` | required, **max 250** | trim surrounding whitespace |
| `terms_accepted` | required, must be `true` | **not** an auth column, and **not** a boolean on `users`. On successful registration the server writes an **auditable consent record** — `user_id`, `consent_type`, `document_version`, `accepted_at` (the `user_consents` table) |
| `verification_method` | `email` \| `sms` | drives which OTP channel is issued |
| `otp_code` | exactly 6 digits when `sms` | validated against the server's own issued code |

**The 18+ owner rule is business-critical and server-authoritative.** The date input's `max` attribute in the browser is UX only; a crafted POST that bypasses it must still be rejected.

**`role` is assigned server-side and forced to `'User'`.** Any client-supplied `role` or `status` is ignored — a self-registering client can never create a `Doctor` or `Admin`, and Admin-created `Admin` remains impossible.

**Never trust browser validation.** Frontend `maxlength`, required states and the DOB ceiling exist for early feedback; the backend re-validates every rule above on the authoritative request.

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
| `/api/users/me/pets` | GET | 🔑 User | **preferred** owner-scoped read — owner comes from the session, never from the path. Use this for first-pet detection (zero pets → onboarding) |
| `/api/users/:id/pets` | GET | Admin, **User (own id only)** | scoped list (`ownerId` link, never name-matched). A User requesting another id → `403` |
| `/api/pets/:id` | GET | Admin, **User (own pet)** | another owner's pet → `403` |
| `/api/pets` | POST | Admin, **User (own pets)** | **owner is taken from the authenticated session/context and MUST be ignored from the request body.** species=Other requires speciesCustom; enforces `PET_LIMITS` (§3.1). Optional `birthdate` is **canonical when known**; `age` is accepted only as an **approximate fallback** when `birthdate` is absent (§3.2) |
| `/api/pets/:id` | PATCH | Admin, **User (own pet)** | ownership re-checked server-side |

### 3.1 Pet creation & the first-pet flow (frozen)

Pet registration is **separate from signup**. Product flow:

```
POST /api/auth/register      → owner account only (no pet)
POST /api/auth/verify-otp    → account verified
POST /api/auth/login         → session/token
GET  /api/users/me/pets      → [] for a brand-new owner
                             → frontend shows first-pet onboarding
POST /api/pets               → pet linked to the AUTHENTICATED owner
                             → pet-dependent actions unlock
```

**Authorization rule (authoritative, server-side):** the owner comes from the **authenticated session/context**. The backend must **never** infer pet ownership from an arbitrary browser-supplied `userId`/`ownerId`. A User may read own profile, read own pets, create a pet for self, and update own pet where allowed; a User must **not** be able to create a pet for another owner by submitting an arbitrary `ownerId`, read another user's pets, or read another user's medical records or documents — all → `403`.

**A newly created pet starts EMPTY.** No appointment, consultation, veterinarian, vaccination, medical history, prescription, lab result or document is auto-created for it. The API must return honest empty collections/states rather than fabricated demo records, and production seed logic must not invent medical history for new pets.

**Enforced pet field limits** (mirror `user/pet-onboarding.js` `PET_LIMITS` server-side; column widths in SQL are only storage ceilings): name 50 · species_custom 50 · breed 60 · breed_custom 60 · color 50 · microchip_id 30 · allergies 200 · chronic_conditions 200 · notes 500 (`medical_notes` on the wire) · age max 50 · weight_kg max 200.00. `weight_kg` must parse as a real number (reject `e`/`E`, `+`/`-`, empty, NaN). The age/weight maxima are **provisional UI/business guardrails, not veterinary truth** — they are **configurable** pending clinic-vet confirmation, and stricter medical ranges must **not** be invented without an explicit product decision. See [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md) §2.1.

**Pet photos are DEFERRED.** There is **no pet photo upload endpoint** in the current backend scope. `pets.photo_path` stays nullable and unused; storage mechanism to be decided later.

### 3.2 `birthdate` vs `age` (locked)

`birthdate` is **canonical when known** and preferred; age is then **derived server-side**, and a client-supplied `age` is ignored or rejected rather than stored as authoritative.

When the DOB is unknown it stays `NULL`, and `age` may be stored as an **approximate** estimate — that is the only case where a stored `age` is meaningful.

The two are **never equally authoritative**, and a manual age is never stored alongside a known birthdate. Deriving age at read time is sufficient. See [VHS_DATA_CONTRACT.md](VHS_DATA_CONTRACT.md) §2.2.

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
| `/api/services` | POST | Admin | label + group (custom allowed) + **price (single DECIMAL(10,2), no min/max)** + active |
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
| `/api/appointments/:id` | PATCH | Admin, **User (own, reschedule only)** | date/time move — same id/referenceNo, status returns `confirmed`, authoritative `appointment_events` history row (+ `rescheduled_from` JSON convenience) |
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
  "price_at_booking": 300.00
}
```
Errors: `409 slot_taken` · `422 service_inactive` · `422 cutoff_window` (user reschedule/cancel inside settings window).

## 8. AVAILABILITY / SLOTS

| Endpoint | Method | Roles | Notes |
|---|---|---|---|
| `/api/availability?date=YYYY-MM-DD` | GET | 🔑 (booking wizards) | slots per clinic settings minus taken (non-terminal appointments); last start inclusive. **Clinic-level slots initially** (final decision BACKEND_START_HERE.md §4.8): no doctor param in the first iteration; a per-doctor variant may be added later without breaking contracts. Backend is authoritative for availability and concurrency. |

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
