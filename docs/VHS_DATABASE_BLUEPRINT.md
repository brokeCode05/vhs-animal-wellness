# VHS Database Blueprint — MySQL (backend starter)

> Companion to [vhs_schema.sql](vhs_schema.sql). Every table lists: purpose, columns (SQL type recommendation), keys/constraints/indexes, relationships, and the **frontend consumer** that will read the API built on it.
> Conventions: InnoDB, `utf8mb4`, `id BIGINT UNSIGNED AUTO_INCREMENT` PKs, `created_at`/`updated_at`, snake_case. Soft deletes only where history matters.
> Status enums match the frozen frontend exactly (VHS_DATA_CONTRACT.md). Anything not derivable from the frontend is marked **BACKEND DECISION REQUIRED**.

## users
- **Purpose:** accounts for all three roles + pet owners.
- **Columns:** `id` PK; `role` ENUM('User','Doctor','Admin') R; `status` ENUM('active','inactive') R DEFAULT 'active'; `first_name`/`middle_name`/`last_name` VARCHAR(50); `name` VARCHAR(120) R (display); `email` VARCHAR(191) R **UNIQUE**; `phone` VARCHAR(20) NULL; `address` VARCHAR(255) NULL; `birthdate` DATE NULL; `password` VARCHAR(255) NULL (backend-managed; **BACKEND DECISION REQUIRED** on provisioning flow); `email_verified_at` TIMESTAMP NULL; remember/app tokens per Laravel defaults.
- **FKs:** none. **Indexes:** `email` (unique), `role`, `status`.
- **Consumers:** all portals; Admin Clients/Accounts; auth.

## pets
- **Purpose:** pet profiles; strict `owner_id` ownership.
- **Columns:** `id` PK; `owner_id` FK→users R; `name` VARCHAR(80) R; `species` ENUM('Dog','Cat','Bird','Rabbit','Other') R; `species_custom` VARCHAR(50) NULL; `breed` VARCHAR(80) NULL; `breed_custom` VARCHAR(80) NULL; `gender` ENUM('Male','Female') R; `age` TINYINT NULL (years); `weight_kg` DECIMAL(5,2) NULL; `color` VARCHAR(120) NULL; `reproductive_status` ENUM('Intact','Spayed','Neutered','Not Sure') NULL; `microchip_id` VARCHAR(60) NULL; `allergies` TEXT NULL; `chronic_conditions` TEXT NULL; `notes` TEXT NULL; `photo_path` VARCHAR(255) NULL (**BACKEND DECISION REQUIRED** — upload storage); soft deletes.
- **Constraints:** `(species='Other') → species_custom NOT NULL` via app-level validation (MySQL check optional). **Indexes:** `owner_id`.
- **Consumers:** User My Pets (own), Admin Clients & Pets, booking wizard, appointments.

## doctor_profiles
- **Purpose:** doctor-specific record linked 1:1 to a `users` row with `role='Doctor'` (frontend's `doctorId ↔ userId` link).
- **Columns:** `id` PK; `user_id` FK→users R **UNIQUE**; `specialization` VARCHAR(100) NULL; `account_status` ENUM('active','inactive') R DEFAULT 'active'; `availability_status` ENUM('on_duty','on_break','on_leave') R DEFAULT 'on_duty'; `display_name` VARCHAR(120) NULL (e.g. "Dr. Santos"); `phone` VARCHAR(20) NULL (doctor-specific contact if needed — else use users.phone).
- **Indexes:** `user_id` (unique), `account_status`, `availability_status`.
- **Consumers:** Admin Accounts (account status), Admin Doctors (availability), Doctor portal identity, appointment assignment.
- Note: account status and availability are **separate** concepts (frozen frontend rule) — inactive doctors remain listed for history.

## services
- **Purpose:** canonical catalog; `value` is the stable FK target stored on appointments.
- **Columns:** `id` PK; `value` VARCHAR(100) R **UNIQUE** (snake_case key, seeded 26); `label` VARCHAR(120) R; `category` VARCHAR(60) R (group incl. custom); `price_min` DECIMAL(10,2) NULL; `price_max` DECIMAL(10,2) NULL; `price_display` VARCHAR(60) R (frozen display format); `currency` CHAR(3) DEFAULT 'PHP'; `active` BOOLEAN R DEFAULT TRUE; soft deletes.
- **Indexes:** `value` (unique), `active`, `category`.
- **Consumers:** booking wizards (active only), User services page, Admin Services, public website.

## clinic_settings
- **Purpose:** single global configuration row.
- **Columns:** `id` PK; `weekday_first` TIME R '09:00'; `weekday_last` TIME R '17:00'; `weekend_first` TIME R '10:00'; `weekend_last` TIME R '18:00'; `slot_interval_minutes` SMALLINT R DEFAULT 60; `cancel_cutoff_minutes` SMALLINT R DEFAULT 120; `reschedule_cutoff_minutes` SMALLINT R DEFAULT 120; `noshow_grace_minutes` SMALLINT R DEFAULT 15; `clinic_name` VARCHAR(120) R; `clinic_phone` VARCHAR(30) NULL; `clinic_email` VARCHAR(191) NULL; `clinic_website` VARCHAR(191) NULL; `clinic_address` VARCHAR(255) NULL. (Single row enforced by app convention / `CHECK (id=1)` optional.)
- **Consumers:** slot generation, cutoff checks, document letterhead, public site, Admin Clinic Settings.

## appointments
- **Purpose:** canonical booking record; lifecycle spine.
- **Columns:** `id` PK; `reference_no` VARCHAR(20) R **UNIQUE**; `user_id` FK→users R; `pet_id` FK→pets R; `assigned_vet_id` FK→doctor_profiles NULL (assignment flow **BACKEND DECISION REQUIRED**); `service_id` FK→services R; `service_label_at_booking` VARCHAR(120) R; `price_at_booking` VARCHAR(60) R (snapshot — see note); `appointment_date` DATE R; `appointment_time` TIME R (24h HH:MM); `visit_context` VARCHAR(120) NULL; `custom_visit_context` VARCHAR(255) NULL; `notes` VARCHAR(255) NULL; `status` ENUM('pending','confirmed','checked_in','in_consultation','completed','canceled','no_show','rescheduled') R DEFAULT 'confirmed'; `checked_in_at` TIMESTAMP NULL; `consultation_started_at` TIMESTAMP NULL; `consultation_completed_at` TIMESTAMP NULL; `rescheduled_from` JSON NULL (`{date,time,at}`) — or a history table (**BACKEND DECISION REQUIRED**); `canceled_reason` VARCHAR(120) NULL (mirrors frontend notes appends; also in audit); `created_via` ENUM('user','admin') R DEFAULT 'user'.
- **Indexes:** `reference_no` (unique), `(appointment_date, appointment_time)`, `status`, `user_id`, `pet_id`, `assigned_vet_id`.
- **Constraints/strategy — slot concurrency:** a plain `UNIQUE(appointment_date, appointment_time)` is **wrong** (multiple doctors later; terminal appointments free their slot). Strategy:
  1. **Booking-time serialization:** `SELECT ... FOR UPDATE` inside the create/reschedule transaction on the target date's appointment rows (or a settings advisory lock), then re-check `isSlotAvailable` semantics (status not in `canceled/completed/no_show`), then insert. Replicates the frozen store guard exactly.
  2. Optional helper table `appointment_slots (id, slot_date, slot_time, doctor_id NULL, appointment_id FK UNIQUE)` with `UNIQUE(slot_date, slot_time, doctor_id)` — **BACKEND DECISION REQUIRED** whether the multi-doctor scheduling model is introduced now or later.
  3. `service_label_at_booking`/`price_at_booking` snapshot at create; catalog edits never rewrite history (frozen frontend rule).
- **Consumers:** every portal.

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
- `appointment_history` — if `rescheduled_from` JSON proves insufficient.
- `payments`/receipts beyond the placeholder document type.
- `uploads` — unified file storage for pet photos/lab attachments.

## Seeds (reference)
- **services:** 26 rows — exact catalog in `shared/mock-users.js` §CANONICAL SERVICE CATALOG (ids 1–26, `value` keys, 5 categories + prices).
- **clinic_settings:** defaults per §Clinic Settings (weekday 09:00–17:00, weekend 10:00–18:00, interval 60, cutoffs 120/120, grace 15).
- **doctor_profiles + users:** one doctor (Dr. Santos, General Practice, active, on_duty) to preserve the frozen demo identity.
- **users/pets demo fixtures:** NOT required production seed (3 users / 5 pets are demo-only).
