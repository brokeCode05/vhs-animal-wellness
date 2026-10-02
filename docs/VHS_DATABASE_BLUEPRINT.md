# VHS Database Blueprint — MySQL (backend starter)

> Companion to [vhs_schema.sql](vhs_schema.sql). Every table lists: purpose, columns (SQL type recommendation), keys/constraints/indexes, relationships, and the **frontend consumer** that will read the API built on it.
> Conventions: InnoDB, `utf8mb4`, `id BIGINT UNSIGNED AUTO_INCREMENT` PKs, `created_at`/`updated_at`, snake_case. Soft deletes only where history matters.
> Status enums match the frozen frontend exactly (VHS_DATA_CONTRACT.md). Items once marked **BACKEND DECISION REQUIRED** are now finalized in [BACKEND_START_HERE.md](BACKEND_START_HERE.md) §4 (single price model, `appointment_events` history, OTP, doctor assignment, no-show, clinic-level slots) — this blueprint has been updated to match.

## users
- **Purpose:** accounts for all three roles + pet owners.
- **Self-registration (public signup — frozen, Advisor Revision Sprint 1):** creates the **OWNER ACCOUNT ONLY** (no pet, no medical record). `role` is forced to `'User'` server-side; a browser-supplied role is ignored, so a self-registering client can never become `Doctor` or `Admin`. Admin may create `User` and `Doctor`; Admin can never create `Admin`.
- **Columns:** `id` PK; `role` ENUM('User','Doctor','Admin') R; `status` ENUM('active','inactive') R DEFAULT 'active'; `first_name`/`middle_name`/`last_name` VARCHAR(50) (`middle_name` NULL); `name` VARCHAR(120) R (display); `email` VARCHAR(254) R **UNIQUE** (was 191 — widened to match the approved signup contract, RFC 5321 path limit; uniqueness compared after trim+lowercase normalisation); `phone` VARCHAR(20) NULL (canonical E.164, e.g. `+639XXXXXXXXX`); `address` VARCHAR(255) NULL; `birthdate` DATE NULL (**REQUIRED for self-registration**, with server-enforced **age ≥ 18** computed from the current date — never a hardcoded cutoff year; kept NULLable for Admin-provisioned staff); `password` VARCHAR(255) NULL (**HASH ONLY**; frontend input range 8–72, the bcrypt truncation boundary; backend-managed, Admin NEVER sees plaintext — Admin-created accounts activate via server-issued setup/reset links or OTP-based activation; final decision in BACKEND_START_HERE.md §4.5); `email_verified_at` TIMESTAMP NULL; remember/app tokens per Laravel defaults.
- **ENFORCED limits (mirror `shared/signup-wizard.js` `LIMITS`, server-side authoritative):** names 50 · email 254 · address 250 · password input 8–72. Column widths are storage ceilings only — a wider column does not make a longer value acceptable.
- **Phone:** the frontend collects the PH local mobile `9XXXXXXXXX` under a fixed `PH +63` display prefix; the **canonical stored value is the normalised `+639XXXXXXXXX`** (13 chars). The server derives the canonical form; never store the raw local string. **Width is locked at `VARCHAR(20)`** — do **not** narrow it to 15 (narrower than the E.164 ceiling) or to 10.
- **Not stored here:** `confirmPassword` (UI-only) and terms acceptance. Consent is recorded in the **`user_consents`** table below as an auditable record — never a permanent boolean on `users`, never an auth column.
- **FKs:** none. **Indexes:** `email` (unique), `role`, `status`, `birthdate`.
- **Consumers:** all portals; Admin Clients/Accounts; auth.

## account_verifications
- **Purpose:** TEMPORARY, EXPIRING OTP / activation / password-reset records for the signup and auth flows. A verification code is a short-lived credential, **not durable user data** — deliberately NOT a plaintext column on `users`.
- **Columns:** `id` PK; `user_id` FK→users NULL (NULL pre-registration, while verifying an email/phone that has no row yet); `identifier` VARCHAR(254) R (normalised email or canonical phone); `channel` ENUM('email','sms') R; `context` VARCHAR(40) R DEFAULT `'registration'` (`registration` | `login` | `password_reset` | `activation`); `code_hash` VARCHAR(255) R (**HASH of the 6-digit OTP / token — never plaintext**); `attempts` TINYINT R DEFAULT 0; `expires_at` TIMESTAMP R (**authoritative**); `consumed_at` TIMESTAMP NULL (marks single use, prevents replay); `created_at`.
- **Rules:** issue + resend **rate-limited** per identifier and per IP; verification fails after `expires_at` whether or not the row has been purged; purge consumed/expired rows on a schedule (not audit history — `audit_logs` is the audit source). Mirrors Laravel's password reset tokens table.
- **FKs:** `user_id` → users ON DELETE CASCADE. **Indexes:** `(identifier, context)`, `expires_at`, `user_id`.
- **Delivery provider** (email/SMS) is a backend concern and is deliberately not modelled here.
- **Consumers:** `POST /api/auth/register`, `/verify-otp`, `/resend-otp`, `/password-reset`.

## user_consents
- **Purpose:** AUDITABLE terms/privacy consent records. **Locked decision:** consent must be provable *after the fact*, so a single permanent boolean on `users` (e.g. `terms_accepted TINYINT`) is deliberately **not** used — it cannot show which version of a document was accepted, or when.
- **Columns:** `id` PK; `user_id` FK→users R (**ON DELETE CASCADE**); `consent_type` VARCHAR(40) R (`terms` \| `privacy` \| `data_processing`, app-defined); `document_version` VARCHAR(40) R (identifier of the **exact document version** accepted, so a later edit does not rewrite history); `accepted_at` TIMESTAMP R DEFAULT CURRENT_TIMESTAMP; `ip_address` VARCHAR(45) NULL (**optional** — capture only if clinic policy requires it); `user_agent` VARCHAR(255) NULL (**optional**, same).
- **Rules:** one row per acceptance event. A new row is written at signup when `terms_accepted` is submitted, and again whenever a new document version is presented and accepted. **No withdrawal or re-consent workflow is designed in this phase** — this is a minimal audit record, not a consent-management subsystem.
- **FKs:** `user_id` → users ON DELETE CASCADE. **Indexes:** `user_id`, `(consent_type, accepted_at)`.
- **Consumers:** `POST /api/auth/register`, Admin/audit review.

## pets
- **Purpose:** pet profiles; strict `owner_id` ownership.
- **Not created at signup (frozen):** the product flow is register owner → verify → login → GET own pets → **if zero pets, frontend shows first-pet onboarding** → POST pet (owner from the **authenticated session**, never the request body) → pet-dependent actions unlock.
- **Columns:** `id` PK; `owner_id` FK→users R; `name` VARCHAR(80) R; `species` ENUM('Dog','Cat','Bird','Rabbit','Other') R; `species_custom` VARCHAR(50) NULL; `breed` VARCHAR(80) NULL; `breed_custom` VARCHAR(80) NULL; `gender` ENUM('Male','Female') R; `birthdate` DATE NULL (**canonical when known** — see below); `age` TINYINT NULL (**approximate** years, only when `birthdate` IS NULL); `weight_kg` DECIMAL(5,2) NULL; `color` VARCHAR(120) NULL; `reproductive_status` ENUM('Intact','Spayed','Neutered','Not Sure') NULL; `microchip_id` VARCHAR(60) NULL; `allergies` TEXT NULL; `chronic_conditions` TEXT NULL; `notes` TEXT NULL; `photo_path` VARCHAR(255) NULL (**DEFERRED** — no upload endpoint in current backend scope; storage TBD); soft deletes.
- **ENFORCED limits (mirror `user/pet-onboarding.js` `PET_LIMITS`, server-side authoritative):** name 50 · species_custom 50 · breed 60 · breed_custom 60 · color 50 · microchip_id 30 · allergies 200 · chronic_conditions 200 · notes 500 · age max 50 years · weight_kg max 200.00. The stored columns are deliberately wider than these ceilings; that is fine, but validation must reject anything longer. `weight_kg` must parse as a real decimal (reject `e`/`E`, `+`/`-`, empty, NaN).
- **`birthdate` vs `age` (locked):** `birthdate` is the **canonical** value when known and is preferred; age is then **derived server-side** and a body-supplied age is ignored or rejected. A vet user may not know an exact DOB, so `birthdate` is NULLable and `age` may hold an **approximate** estimate — **only** when `birthdate` IS NULL. The two are **never equally authoritative**, and a manual age is never stored alongside a known birthdate.
- **Age/weight maxima are PROVISIONAL and configurable** UI/business guardrails, not veterinary truth (flagged `TODO(BACKEND)` in the frontend). The backend may mirror them initially to match the approved UI, but they remain **subject to clinic-vet confirmation**. Do **not** invent stricter medical ranges without an explicit product decision.
- **New pets start EMPTY:** no appointment, consultation, vaccination, medical history, prescription, lab result or document. APIs return honest empty collections; production seeders must not fabricate demo medical records.
- **Constraints:** `(species='Other') → species_custom NOT NULL` via app-level validation (MySQL check optional). **Indexes:** `owner_id`.
- **Consumers:** User My Pets (own), first-pet onboarding, Admin Clients & Pets, booking wizard, appointments.

## doctor_profiles
- **Purpose:** doctor-specific record linked 1:1 to a `users` row with `role='Doctor'` (frontend's `doctorId ↔ userId` link).
- **Columns:** `id` PK; `user_id` FK→users R **UNIQUE**; `specialization` VARCHAR(100) NULL; `account_status` ENUM('active','inactive') R DEFAULT 'active'; `availability_status` ENUM('on_duty','on_break','on_leave') R DEFAULT 'on_duty'; `display_name` VARCHAR(120) NULL (e.g. "Dr. Santos"); `phone` VARCHAR(20) NULL (doctor-specific contact if needed — else use users.phone).
- **Indexes:** `user_id` (unique), `account_status`, `availability_status`.
- **Consumers:** Admin Accounts (account status), Admin Doctors (availability), Doctor portal identity, appointment assignment.
- Note: account status and availability are **separate** concepts (frozen frontend rule) — inactive doctors remain listed for history.

## services
- **Purpose:** canonical catalog; `value` is the stable FK target stored on appointments.
- **Columns:** `id` PK; `value` VARCHAR(100) R **UNIQUE** (snake_case key, seeded 26); `label` VARCHAR(120) R; `category` VARCHAR(60) R (group incl. custom); `price` DECIMAL(10,2) NOT NULL; `currency` CHAR(3) NOT NULL DEFAULT 'PHP' — **single price model** (final decision; do NOT introduce `price_min`/`price_max` unless business requirements change later; the old min/max + price_display recommendation is retired); `active` BOOLEAN R DEFAULT TRUE; soft deletes.
- **Indexes:** `value` (unique), `active`, `category`.
- **Consumers:** booking wizards (active only), User services page, Admin Services, public website.

## clinic_settings
- **Purpose:** single global configuration row.
- **Columns:** `id` PK; `weekday_first` TIME R '09:00'; `weekday_last` TIME R '17:00'; `weekend_first` TIME R '10:00'; `weekend_last` TIME R '18:00'; `slot_interval_minutes` SMALLINT R DEFAULT 60; `cancel_cutoff_minutes` SMALLINT R DEFAULT 120; `reschedule_cutoff_minutes` SMALLINT R DEFAULT 120; `noshow_grace_minutes` SMALLINT R DEFAULT 15; `clinic_name` VARCHAR(120) R; `clinic_phone` VARCHAR(30) NULL; `clinic_email` VARCHAR(191) NULL; `clinic_website` VARCHAR(191) NULL; `clinic_address` VARCHAR(255) NULL. (Single row enforced by app convention / `CHECK (id=1)` optional.)
- **Consumers:** slot generation, cutoff checks, document letterhead, public site, Admin Clinic Settings.

## appointments
- **Purpose:** canonical booking record; lifecycle spine.
- **Columns:** `id` PK; `reference_no` VARCHAR(20) R **UNIQUE**; `user_id` FK→users R; `pet_id` FK→pets R; `assigned_vet_id` FK→doctor_profiles NULL (NULL until system/Admin assignment — User never picks a doctor; final decision BACKEND_START_HERE.md §4.3); `service_id` FK→services R; `service_label_at_booking` VARCHAR(120) R; `price_at_booking` DECIMAL(10,2) NOT NULL (snapshot from services.price at booking — see note); `appointment_date` DATE R; `appointment_time` TIME R (24h HH:MM); `visit_context` VARCHAR(120) NULL; `custom_visit_context` VARCHAR(255) NULL; `notes` VARCHAR(255) NULL; `status` ENUM('pending','confirmed','checked_in','in_consultation','completed','canceled','no_show','rescheduled') R DEFAULT 'confirmed'; `checked_in_at` TIMESTAMP NULL; `consultation_started_at` TIMESTAMP NULL; `consultation_completed_at` TIMESTAMP NULL; `rescheduled_from` JSON NULL (`{date,time,at}`) — display convenience only; **authoritative history is the `appointment_events` table below** (final decision); `canceled_reason` VARCHAR(120) NULL (mirrors frontend notes appends; also in audit); `created_via` ENUM('user','admin') R DEFAULT 'user'.
- **Indexes:** `reference_no` (unique), `(appointment_date, appointment_time)`, `status`, `user_id`, `pet_id`, `assigned_vet_id`.
- **Constraints/strategy — slot concurrency:** a plain `UNIQUE(appointment_date, appointment_time)` is **wrong** (multiple doctors later; terminal appointments free their slot). Strategy:
  1. **Booking-time serialization:** `SELECT ... FOR UPDATE` inside the create/reschedule transaction on the target date's appointment rows (or a settings advisory lock), then re-check `isSlotAvailable` semantics (status not in `canceled/completed/no_show`), then insert. Replicates the frozen store guard exactly.
  2. Optional helper table `appointment_slots (id, slot_date, slot_time, doctor_id NULL, appointment_id FK UNIQUE)` with `UNIQUE(slot_date, slot_time, doctor_id)` — the future per-doctor capacity path. **Initial implementation uses clinic-level slots** (final decision BACKEND_START_HERE.md §4.8): no global `UNIQUE(appointment_date, appointment_time)`, no per-doctor scheduling in the first iteration — the architecture just has to allow it later without breaking contracts.
  3. `service_label_at_booking`/`price_at_booking` snapshot at create; catalog edits never rewrite history (frozen frontend rule).
- **Consumers:** every portal.

## appointment_events
- **Purpose:** AUTHORITATIVE appointment history (final decision — replaces the earlier "JSON vs history table" open question). One row per lifecycle event (`created`, `rescheduled`, `canceled`, `no_show`, …); a reschedule keeps the same appointment id + `reference_no` and records old→new here.
- **Columns:** `id` PK; `appointment_id` FK→appointments R; `event_type` VARCHAR(40) R (app-defined keys); `old_date` DATE NULL; `old_time` TIME NULL; `new_date` DATE NULL; `new_time` TIME NULL; `actor_type` ENUM('User','Doctor','Admin') R; `actor_id` FK→users NULL (system actions); `metadata` JSON NULL (reasons, channel); `created_at` R.
- **Indexes:** `appointment_id`, `event_type`, `created_at`.
- **Rules:** written by the server inside the same transaction as the action, next to the audit row. `appointments.rescheduled_from` JSON stays as a display convenience only.
- **Consumers:** appointment history/detail views, admin reporting, audit cross-reference.

## consultations
- **Purpose:** internal clinical record; 1:1 with an appointment.
- **Columns:** `id` PK; `appointment_id` FK→appointments R **UNIQUE**; `pet_id` FK→pets R; `veterinarian_id` FK→doctor_profiles R; `started_at`/`completed_at` TIMESTAMP NULL; `duration_minutes` SMALLINT NULL; `soap_subjective` TEXT NULL; `soap_objective` TEXT NULL; `soap_assessment` TEXT NULL; `soap_plan` TEXT NULL; `weight` VARCHAR(20) NULL; `temperature` VARCHAR(20) NULL; `heart_rate` VARCHAR(20) NULL; `status` ENUM('in_consultation','completed') R.
- **Consumers:** Doctor portal (owner), document fan-out (client-facing projection), Admin/User only via documents.

## prescriptions
- **Columns:** `id` PK; `consultation_id` FK→consultations R; `medicine` VARCHAR(120) R; `dosage` VARCHAR(60) NULL; `frequency` VARCHAR(60) NULL; `duration` VARCHAR(60) NULL; `instructions` TEXT NULL; `dispensed_at` TIMESTAMP NULL (**BACKEND DECISION REQUIRED** pharmacy workflow).
- **Indexes:** `consultation_id`. **Consumers:** Doctor orders; Prescription document.

## lab_requests
- **Columns:** `id` PK; `consultation_id` FK R; `test` VARCHAR(120) R; `notes` TEXT NULL; `status` ENUM('requested','processing','completed') R DEFAULT 'requested'; `requested_at` TIMESTAMP R; `result_summary` TEXT NULL; `result_at` TIMESTAMP NULL.
- **Consumers:** Doctor; Lab Request document; Lab Result document when completed.

## lab_results
- **Recommended** separate table when results carry attachments/structured panels: `id` PK; `lab_request_id` FK R **UNIQUE**; `result_summary` TEXT; `attachment_path` VARCHAR(255) NULL (**BACKEND DECISION REQUIRED** storage); `result_at` TIMESTAMP. For the frontend demo, `lab_requests.result_summary` suffices — keep one table until a real lab workflow exists.

## documents
- **Purpose:** FINALIZED client-facing documents only (visibility rules in VHS_DATA_CONTRACT.md §13).
- **Columns:** `id` PK; `type` ENUM('consultation_summary','prescription','lab_request','lab_result','receipt') R; `status` ENUM('finalized') R DEFAULT 'finalized' (draft/void **BACKEND DECISION REQUIRED**); `appointment_id` FK R; `user_id` FK R (scoping); `pet_id` FK R; `service_label` VARCHAR(120) NULL; `veterinarian_name` VARCHAR(120) NULL; `issued_at` TIMESTAMP R; `payload` JSON R (type-specific: vitals/assessment/plan | medicines[] | tests[] | result summary | amount).
- **Indexes:** `user_id`, `pet_id`, `appointment_id`, `type`, `issued_at`.
- **Consumers:** User My Documents (own), Admin Documents (all), document fan-out on completion.

## audit_logs
- **Purpose:** immutable server-generated action trail (prototype: `shared/audit-store.js`).
- **Columns:** `id` PK; `actor_type` ENUM('User','Doctor','Admin') R (from session — never client-supplied); `actor_id` FK→users NULL (system actions); `actor_name` VARCHAR(120) R; `action` VARCHAR(60) R (frozen keys list in VHS_DATA_CONTRACT.md §10); `entity_type` ENUM('appointment','doctor','user','pet','service','clinic_settings','document') R; `entity_id` BIGINT R; `reference_no` VARCHAR(20) NULL; `description` VARCHAR(255) R; `metadata` JSON NULL (old/new values); `created_at` R.
- **Rules:** INSERT-only (no UPDATE/DELETE grants at DB level if possible); written inside the same transaction as the action; indexed `(entity_type, entity_id)`, `(actor_type, actor_id)`, `created_at`, `action`.
- **Consumers:** Admin Audit Log (read-only).

## FUTURE (do not build now)
- `notifications` — appointment reminders/status pushes.
- `vetty_sessions`, `vetty_messages` — AI triage chat persistence. **Vetty phase: do not add now.**
- `appointment_history` — superseded by `appointment_events` (see table above).
- `payments`/receipts beyond the placeholder document type.
- `uploads` — unified file storage for pet photos/lab attachments. **Pet photo upload is DEFERRED** — do not design upload/storage/provider logic in this phase.

## Seeds (reference)
- **services:** 26 rows — exact catalog in `shared/mock-users.js` §CANONICAL SERVICE CATALOG (ids 1–26, `value` keys, 5 categories + prices).
- **clinic_settings:** defaults per §Clinic Settings (weekday 09:00–17:00, weekend 10:00–18:00, interval 60, cutoffs 120/120, grace 15).
- **doctor_profiles + users:** one doctor (Dr. Santos, General Practice, active, on_duty) to preserve the frozen demo identity.
- **users/pets demo fixtures:** NOT required production seed (3 users / 5 pets are demo-only).
