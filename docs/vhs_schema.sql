-- =====================================================================
-- VHS Animal Wellness Center — Backend STARTER / REFERENCE SCHEMA
-- MySQL 8.x, InnoDB, utf8mb4.
--
-- Scope: reference draft aligned to the FROZEN frontend contracts
-- (docs/VHS_DATA_CONTRACT.md). Column names are snake_case; the frozen
-- frontend mapper (shared/appointment-contract.js) already accepts
-- snake_case API payloads.
--
-- Aligned to Advisor Revision Sprint 1 (manually approved): signup contract,
-- owner field limits, the 18+ owner rule, phone normalisation, and first-pet
-- onboarding. Authoritative frontend sources for those rules are
-- shared/signup-wizard.js (v1.1.0) and user/pet-onboarding.js (v1.0.0).
--
-- Remaining product/backend decisions are now LOCKED (see the note on each
-- block): phone storage width, pet age/weight as configurable guardrails,
-- pet photo upload deferred, session/cookie auth preferred over tokens, one
-- canonical JSON envelope, auditable consent records, and pet birthdate
-- taking precedence over a manually-entered age.
--
-- Conventions:
--   * ids are BIGINT UNSIGNED AUTO_INCREMENT (frontend demo ids were
--     small ints; backend ids replace them 1:1).
--   * status ENUMs mirror the frontend exactly — do not extend without
--     coordinating with the frozen frontend contract.
--   * audit_logs is INSERT-only by convention (see table comment).
--   * Column widths are STORAGE ceilings, not validation. Where a comment
--     says "ENFORCED max N", the server must reject anything longer — the
--     column being wider does not make a longer value acceptable.
--   * This file contains NO seed INSERTs. Demo users/pets from
--     shared/mock-users.js are demo fixtures, not production seed data, and a
--     new pet must never be created with fabricated medical records.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- users — all three roles (User | Doctor | Admin). No Clerk role.
--
-- SELF-REGISTRATION (public signup, Advisor Revision Sprint 1 — frozen):
--   * Creates the OWNER ACCOUNT ONLY. No pet and no medical record.
--   * role is forced to 'User' server-side. A browser-supplied role is
--     ignored; a User can never self-register as Doctor or Admin.
--   * Column widths below are the STORAGE ceilings. The ENFORCED limits are
--     the approved frontend contract (docs/VHS_DATA_CONTRACT.md §1) and must
--     be re-validated server-side — a wider column is not permission to
--     accept a longer value:
--       first_name/middle_name/last_name  max 50   (hyphen/apostrophe/period OK)
--       email                             max 254  (RFC 5321)
--       address                           max 250
--       password (hash)                   bcrypt input 8..72; store hash only
--   * birthdate: REQUIRED for self-registration (owner must be >= 18, see
--     docs/VHS_DATA_CONTRACT.md §1.1). Kept NULLable because Admin-provisioned
--     Doctor/Admin accounts may omit it. The 18+ rule is an APPLICATION-layer
--     check computed from the current date — never a hardcoded cutoff year,
--     and never enforced by the column.
--   * phone: INPUT is the PH local mobile 9XXXXXXXXX; CANONICAL STORAGE is the
--     normalised E.164 form (+639XXXXXXXXX = 13 chars). VARCHAR(20) holds
--     '+' + country code + up to 15 national digits.
--     LOCKED: the column stays VARCHAR(20). Do NOT reduce it to 15 — 15 is
--     narrower than the E.164 ceiling the same rule requires.
--   * password column stores a HASH ONLY — never plaintext, never returned by
--     an API. Column name kept as-is (existing convention); do NOT add a
--     second `password_hash` column.
--   * terms/consent acceptance is NOT stored here. Consent is AUDITABLE and
--     lives in the `user_consents` table below (created at signup). It is
--     never a permanent boolean on `users` and never an auth column.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role          ENUM('User','Doctor','Admin') NOT NULL,
  status        ENUM('active','inactive')     NOT NULL DEFAULT 'active',
  first_name    VARCHAR(50)                   NOT NULL,
  middle_name   VARCHAR(50)                   NULL,
  last_name     VARCHAR(50)                   NOT NULL,
  name          VARCHAR(120)                  NOT NULL,           -- display name (first + last)
  email         VARCHAR(254)                  NOT NULL,           -- ENFORCED max 254; unique after trim+lowercase normalisation
  phone         VARCHAR(20)                   NULL,               -- canonical E.164, e.g. +639XXXXXXXXX (LOCKED: stays 20, do NOT reduce to 15)
  address       VARCHAR(255)                  NULL,               -- ENFORCED max 250
  birthdate     DATE                          NULL,               -- REQUIRED on self-registration; server enforces age >= 18
  password      VARCHAR(255)                  NULL,               -- HASH ONLY; backend-managed; never exposed
  email_verified_at TIMESTAMP                   NULL,
  created_at    TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email),
  INDEX ix_users_role (role),
  INDEX ix_users_status (status),
  INDEX ix_users_birthdate (birthdate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- account_verifications — TEMPORARY, EXPIRING OTP / activation records.
--
-- WHY THIS EXISTS: signup is a 4-step flow ending in an OTP / verification
-- link. That code is a short-lived credential, NOT durable user data, so it
-- must never live as a plaintext column on `users`.
--
--   * code_hash stores a HASH of the OTP (or the emailed verification token),
--     never the plaintext. Mirrors Laravel's password reset tokens table.
--   * expires_at is authoritative — verification fails after it, whether or
--     not the row has been swept.
--   * consumed_at marks a successful use so a code cannot be replayed.
--   * issue + resend are RATE-LIMITED per identifier and per IP.
--   * Purge consumed/expired rows on a schedule; they are not audit history
--     (audit_logs is the audit source).
--   * Delivery provider (email/SMS) is a backend concern and is deliberately
--     NOT modelled here.
-- ---------------------------------------------------------------------
CREATE TABLE account_verifications (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NULL,                             -- NULL until the row exists (pre-registration verify)
  identifier    VARCHAR(254)  NOT NULL,                           -- normalised email or canonical phone
  channel       ENUM('email','sms') NOT NULL,
  context       VARCHAR(40)   NOT NULL DEFAULT 'registration',   -- registration | login | password_reset | activation
  code_hash     VARCHAR(255)  NOT NULL,                           -- HASH of the 6-digit OTP / token — never plaintext
  attempts      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at    TIMESTAMP     NOT NULL,
  consumed_at   TIMESTAMP     NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_account_verifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_av_identifier (identifier, context),
  INDEX ix_av_expires (expires_at),
  INDEX ix_av_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- user_consents - AUDITABLE consent records (locked decision).
--
-- WHY THIS EXISTS: terms/privacy acceptance must be provable AFTER the
-- fact. A single permanent boolean (e.g. users.terms_accepted TINYINT)
-- cannot show WHICH version of a document was accepted, or WHEN, so it is
-- deliberately NOT used. Consent is recorded here instead.
--
--   * user_id          - the consenting account (FK, cascade on delete)
--   * consent_type     - terms | privacy | data_processing (app-defined)
--   * document_version - identifier of the EXACT document version accepted,
--                        so a later edit does not rewrite history
--   * accepted_at      - when the user accepted
--   * ip_address /
--     user_agent       - OPTIONAL, nullable; capture only if clinic policy
--                        requires it. Not needed for the core contract.
--
-- Created at signup when terms_accepted is submitted, and again whenever a
-- new document version is presented and accepted.
--
-- Deliberately minimal: this is an AUDIT RECORD, not a consent-management
-- subsystem. No withdrawal / re-consent workflow is designed in this phase.
-- ---------------------------------------------------------------------
CREATE TABLE user_consents (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,                        -- FK->users, ON DELETE CASCADE
  consent_type      VARCHAR(40)    NOT NULL,                        -- terms | privacy | data_processing
  document_version  VARCHAR(40)    NOT NULL,                        -- identifier of the exact document version accepted
  accepted_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address        VARCHAR(45)    NULL,                            -- OPTIONAL: capture only if clinic policy requires it
  user_agent        VARCHAR(255)   NULL,                            -- OPTIONAL: capture only if clinic policy requires it
  CONSTRAINT fk_user_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_user_consents_user (user_id),
  INDEX ix_user_consents_type (consent_type, accepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- pets — ownership strictly by owner_id (never name-matched).
--
-- PETS ARE NOT CREATED AT SIGNUP (Advisor Revision Sprint 1 — frozen).
-- Signup creates the owner account only. The product flow is:
--   register owner -> verify -> login -> GET own pets
--   -> if zero pets, frontend shows first-pet onboarding
--   -> POST pet (owner taken from the AUTHENTICATED session, never the
--      request body) -> pet-dependent actions become available.
--
-- Column widths are STORAGE ceilings. ENFORCED limits are the approved
-- frontend contract (docs/VHS_DATA_CONTRACT.md §2 / user/pet-onboarding.js
-- PET_LIMITS) and must be re-validated server-side:
--   name 50 · species_custom 50 · breed 60 · breed_custom 60 · color 50
--   microchip_id 30 · allergies 200 · chronic_conditions 200 · notes 500
--   weight_kg must parse as a real decimal: reject e/E, +/-, empty, NaN.
--
-- AGE / WEIGHT MAXIMA (locked): age max 50 years and weight_kg max 200.00
-- remain PROVISIONAL UI/BUSINESS guardrails. They are NOT veterinary truth
-- and NOT medical ranges, and they are CONFIGURABLE pending clinic-vet
-- confirmation. Mirror them initially so the API matches the approved UI.
-- Do not invent stricter medical ranges without an explicit product call.
--
-- BIRTHDATE vs AGE (locked): birthdate is the CANONICAL value when known
-- and is preferred. Age is then DERIVED server-side from it, and a
-- body-supplied age is never persisted as authoritative. A vet user may
-- not know an exact DOB, so birthdate is NULLable and `age` may hold an
-- APPROXIMATE estimate — but ONLY when birthdate IS NULL:
--   birthdate present -> age is DERIVED; a client-supplied age is ignored
--                        or rejected
--   birthdate unknown -> age may be stored as an approximate estimate
-- Never store a manually-entered age alongside a known birthdate.
--
-- A NEW PET STARTS EMPTY: no appointment, consultation, vaccination, medical
-- history, prescription, lab result or document is created for it. APIs must
-- return honest empty collections, and production seeders must NOT fabricate
-- demo medical records.
-- ---------------------------------------------------------------------
CREATE TABLE pets (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id            BIGINT UNSIGNED NOT NULL,                    -- from authenticated session, never request-supplied
  name                VARCHAR(80)   NOT NULL,                      -- ENFORCED max 50
  species             ENUM('Dog','Cat','Bird','Rabbit','Other') NOT NULL,
  species_custom      VARCHAR(50)   NULL,                          -- ENFORCED max 50
  breed               VARCHAR(80)   NULL,                          -- ENFORCED max 60
  breed_custom        VARCHAR(80)   NULL,                          -- ENFORCED max 60
  gender              ENUM('Male','Female') NOT NULL,
  birthdate           DATE         NULL,                           -- CANONICAL when known; age is DERIVED from it, never from the body
  age                 TINYINT UNSIGNED NULL,                       -- APPROXIMATE age ONLY when birthdate IS NULL; ENFORCED max 50 (PROVISIONAL)
  weight_kg           DECIMAL(5,2)  NULL,                          -- ENFORCED max 200.00 (PROVISIONAL, configurable); parse strictly
  color               VARCHAR(120)  NULL,                          -- ENFORCED max 50
  reproductive_status ENUM('Intact','Spayed','Neutered','Not Sure') NULL,
  microchip_id        VARCHAR(60)   NULL,                          -- ENFORCED max 30, [A-Za-z0-9-]
  allergies           TEXT          NULL,                          -- ENFORCED max 200
  chronic_conditions  TEXT          NULL,                          -- ENFORCED max 200
  notes               TEXT          NULL,                          -- medical notes; wire field is medical_notes (frozen pet contract)
  photo_path          VARCHAR(255)  NULL,                          -- DEFERRED: no upload endpoint in current backend scope; storage TBD
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          TIMESTAMP     NULL,
  CONSTRAINT fk_pets_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  INDEX ix_pets_owner (owner_id),
  INDEX ix_pets_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- doctor_profiles — 1:1 with users(role='Doctor').
-- account_status (login gate) and availability_status (working status)
-- are SEPARATE concepts (frozen rule); inactive doctors stay listed.
-- ---------------------------------------------------------------------
CREATE TABLE doctor_profiles (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL,
  display_name        VARCHAR(120)  NULL,                          -- e.g. "Dr. Santos"
  specialization      VARCHAR(100)  NULL,
  phone               VARCHAR(20)   NULL,
  account_status      ENUM('active','inactive')   NOT NULL DEFAULT 'active',
  availability_status ENUM('on_duty','on_break','on_leave') NOT NULL DEFAULT 'on_duty',
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_doctor_user UNIQUE (user_id),
  CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX ix_doctors_account (account_status),
  INDEX ix_doctors_availability (availability_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- services — stable `value` key is the FK target stored on appointments.
-- SINGLE price model (final decision): one price + currency; do NOT
-- introduce price_min/price_max unless business requirements change.
-- Live price is NEVER the historical price (appointments snapshot it).
-- ---------------------------------------------------------------------
CREATE TABLE services (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  value         VARCHAR(100)  NOT NULL,                              -- snake_case stable key (e.g. 'consultation')
  label         VARCHAR(120)  NOT NULL,
  category      VARCHAR(60)   NOT NULL,                              -- group; custom categories allowed
  price         DECIMAL(10,2) NOT NULL,                               -- SINGLE price (final decision: no min/max range)
  currency      CHAR(3)       NOT NULL DEFAULT 'PHP',
  active        BOOLEAN       NOT NULL DEFAULT TRUE,                 -- inactive = removed from NEW bookings only
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP     NULL,
  CONSTRAINT uq_services_value UNIQUE (value),
  INDEX ix_services_active (active),
  INDEX ix_services_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- clinic_settings — single global row (id = 1 by convention).
-- ---------------------------------------------------------------------
CREATE TABLE clinic_settings (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  weekday_first             TIME NOT NULL DEFAULT '09:00',
  weekday_last              TIME NOT NULL DEFAULT '17:00',           -- last start INCLUSIVE
  weekend_first             TIME NOT NULL DEFAULT '10:00',
  weekend_last              TIME NOT NULL DEFAULT '18:00',           -- last start INCLUSIVE
  slot_interval_minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  cancel_cutoff_minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  reschedule_cutoff_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  noshow_grace_minutes      SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  clinic_name               VARCHAR(120) NOT NULL DEFAULT 'VHS Animal Wellness Center',
  clinic_phone              VARCHAR(30)  NULL,
  clinic_email              VARCHAR(191) NULL,
  clinic_website            VARCHAR(191) NULL,
  clinic_address            VARCHAR(255) NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- appointments — canonical lifecycle spine.
-- service_label_at_booking / price_at_booking are snapshots: later
-- catalog edits must never change historical meaning (frozen rule).
-- reference_no is generated once by the backend and NEVER changes
-- during reschedule or any transition (final decision).
-- NO-SHOW (final decision): grace default 15 min
-- (clinic_settings.noshow_grace_minutes); after grace the backend may
-- flag ELIGIBLE candidates only — an Admin confirms/marks no_show via
-- the status endpoint. Never auto-mark on elapsed time alone.
--
-- SLOT CONCURRENCY STRATEGY (see docs/VHS_DATABASE_BLUEPRINT.md):
--   A plain UNIQUE(appointment_date, appointment_time) is invalid —
--   multiple doctors may share a time later, and canceled/completed
--   appointments must free their slot. The transaction must:
--     1) SELECT the date's rows FOR UPDATE (serialize),
--     2) re-check availability semantics: no ACTIVE row (status NOT IN
--        ('canceled','completed','no_show')) holds the slot,
--     3) INSERT/PATCH.
--   If/when a per-doctor scheduling model is added, an
--   appointment_slots(slot_date, slot_time, doctor_id) helper table with
--   UNIQUE(slot_date, slot_time, doctor_id) can enforce it at the DB
--   level (BACKEND DECISION REQUIRED on multi-doctor model).
-- ---------------------------------------------------------------------
CREATE TABLE appointments (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_no              VARCHAR(20)  NOT NULL,                   -- 'VHS-YYYYMMDD-NNNN', unique, public + QR payload
  user_id                   BIGINT UNSIGNED NOT NULL,
  pet_id                    BIGINT UNSIGNED NOT NULL,
  assigned_vet_id           BIGINT UNSIGNED NULL,                    -- NULL until system/Admin assignment (User never picks a doctor)
  service_id                BIGINT UNSIGNED NOT NULL,
  service_label_at_booking  VARCHAR(120) NOT NULL,
  price_at_booking          DECIMAL(10,2) NOT NULL,                   -- snapshot from services.price at booking (final decision)
  appointment_date          DATE         NOT NULL,
  appointment_time          TIME         NOT NULL,                   -- 24h HH:MM (canonical; last start inclusive)
  visit_context             VARCHAR(120) NULL,
  custom_visit_context      VARCHAR(255) NULL,
  notes                     VARCHAR(255) NULL,
  status ENUM('pending','confirmed','checked_in','in_consultation','completed','canceled','no_show','rescheduled')
             NOT NULL DEFAULT 'confirmed',
  checked_in_at             TIMESTAMP NULL,
  consultation_started_at   TIMESTAMP NULL,
  consultation_completed_at TIMESTAMP NULL,
  rescheduled_from          JSON NULL,                               -- display convenience only; AUTHORITATIVE history = appointment_events
  canceled_reason           VARCHAR(120) NULL,
  created_via               ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_appointments_reference UNIQUE (reference_no),
  CONSTRAINT fk_appt_user   FOREIGN KEY (user_id)  REFERENCES users(id),
  CONSTRAINT fk_appt_pet    FOREIGN KEY (pet_id)   REFERENCES pets(id),
  CONSTRAINT fk_appt_vet    FOREIGN KEY (assigned_vet_id) REFERENCES doctor_profiles(id),
  CONSTRAINT fk_appt_service FOREIGN KEY (service_id) REFERENCES services(id),
  INDEX ix_appt_date_time (appointment_date, appointment_time),
  INDEX ix_appt_status (status),
  INDEX ix_appt_user (user_id),
  INDEX ix_appt_pet (pet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- consultations — INTERNAL clinical record; 1:1 with an appointment.
-- SOAP narrative is Doctor-only: never exposed to Admin/User directly,
-- never copied into client-facing documents (visibility rules frozen).
-- ---------------------------------------------------------------------
CREATE TABLE consultations (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id   BIGINT UNSIGNED NOT NULL,
  pet_id           BIGINT UNSIGNED NOT NULL,
  veterinarian_id  BIGINT UNSIGNED NOT NULL,
  status           ENUM('in_consultation','completed') NOT NULL DEFAULT 'in_consultation',
  started_at       TIMESTAMP NULL,
  completed_at     TIMESTAMP NULL,
  duration_minutes SMALLINT UNSIGNED NULL,
  soap_subjective  TEXT NULL,
  soap_objective   TEXT NULL,
  soap_assessment  TEXT NULL,
  soap_plan        TEXT NULL,
  weight           VARCHAR(20) NULL,
  temperature      VARCHAR(20) NULL,
  heart_rate       VARCHAR(20) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_consultation_appointment UNIQUE (appointment_id),
  CONSTRAINT fk_cons_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  CONSTRAINT fk_cons_pet  FOREIGN KEY (pet_id)         REFERENCES pets(id),
  CONSTRAINT fk_cons_vet  FOREIGN KEY (veterinarian_id) REFERENCES doctor_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- prescriptions — rows validated complete on write (no half-filled rows).
-- ---------------------------------------------------------------------
CREATE TABLE prescriptions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id BIGINT UNSIGNED NOT NULL,
  medicine        VARCHAR(120) NOT NULL,
  dosage          VARCHAR(60)  NULL,
  frequency       VARCHAR(60)  NULL,
  duration        VARCHAR(60)  NULL,
  instructions    TEXT         NULL,
  dispensed_at    TIMESTAMP    NULL,                                 -- BACKEND DECISION REQUIRED: pharmacy workflow
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rx_consult FOREIGN KEY (consultation_id) REFERENCES consultations(id),
  INDEX ix_rx_consult (consultation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- lab_requests / lab_results — result fills the Lab Result document.
-- lab_results is optional until a real lab workflow exists; the frozen
-- frontend only needs lab_requests.result_summary today.
-- ---------------------------------------------------------------------
CREATE TABLE lab_requests (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_id BIGINT UNSIGNED NOT NULL,
  test            VARCHAR(120) NOT NULL,
  notes           TEXT         NULL,
  status          ENUM('requested','processing','completed') NOT NULL DEFAULT 'requested',
  requested_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result_summary  TEXT         NULL,
  result_at       TIMESTAMP    NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lab_consult FOREIGN KEY (consultation_id) REFERENCES consultations(id),
  INDEX ix_lab_consult (consultation_id),
  INDEX ix_lab_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_results (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lab_request_id  BIGINT UNSIGNED NOT NULL,
  result_summary  TEXT         NULL,
  attachment_path VARCHAR(255) NULL,                                 -- BACKEND DECISION REQUIRED: storage
  result_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_lab_result_request UNIQUE (lab_request_id),
  CONSTRAINT fk_labres_request FOREIGN KEY (lab_request_id) REFERENCES lab_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- documents — FINALIZED client-facing documents ONLY.
-- Internal SOAP narrative is never stored here (visibility rules frozen:
-- User = own docs; Admin = client-facing ops; Doctor = internal + docs).
-- ---------------------------------------------------------------------
CREATE TABLE documents (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('consultation_summary','prescription','lab_request','lab_result','receipt') NOT NULL,
  status          ENUM('finalized') NOT NULL DEFAULT 'finalized',    -- draft/void: BACKEND DECISION REQUIRED
  appointment_id  BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,                          -- scoping key (User sees own only)
  pet_id          BIGINT UNSIGNED NOT NULL,
  service_label   VARCHAR(120) NULL,
  veterinarian_name VARCHAR(120) NULL,
  issued_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload         JSON         NOT NULL,                             -- type-specific (vitals/plan | medicines[] | tests[] | ...)
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  CONSTRAINT fk_doc_user FOREIGN KEY (user_id)        REFERENCES users(id),
  CONSTRAINT fk_doc_pet  FOREIGN KEY (pet_id)         REFERENCES pets(id),
  INDEX ix_doc_user (user_id),
  INDEX ix_doc_pet (pet_id),
  INDEX ix_doc_appt (appointment_id),
  INDEX ix_doc_type_issued (type, issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- audit_logs — SERVER-GENERATED and IMMUTABLE (INSERT-only by policy;
-- the frontend AuditLog is a prototype and never the authority).
-- Every action transaction writes its row in the SAME transaction.
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_type   ENUM('User','Doctor','Admin') NOT NULL,               -- resolved from the authenticated session
  actor_id     BIGINT UNSIGNED NULL,                                 -- NULL only for system actions
  actor_name   VARCHAR(120)  NOT NULL,
  action       VARCHAR(60)   NOT NULL,                               -- frozen keys: appointment_created, patient_checked_in, ...
  entity_type  ENUM('appointment','doctor','user','pet','service','clinic_settings','document') NOT NULL,
  entity_id    BIGINT UNSIGNED NOT NULL,
  reference_no VARCHAR(20)   NULL,
  description  VARCHAR(255)  NOT NULL,
  metadata     JSON         NULL,                                    -- old/new values (availability, reschedule, status, reason)
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX ix_audit_entity (entity_type, entity_id),
  INDEX ix_audit_actor (actor_type, actor_id),
  INDEX ix_audit_action (action),
  INDEX ix_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- FUTURE / OPTIONAL — do not create in the first migration wave.
--   notifications        : reminders/status pushes
--   appointment_slots    : per-doctor slot concurrency helper
--                          UNIQUE(slot_date, slot_time, doctor_id)
--   appointment_history  : superseded by appointment_events (created above)
--   payments / receipts  : beyond the placeholder document type
--   vetty_sessions / vetty_messages : AI triage persistence (Vetty phase)
--   uploads              : unified file storage (pet photos, lab files)
--                          PET PHOTO UPLOAD IS DEFERRED — do not design
--                          upload/storage/provider logic in this phase
-- =====================================================================

-- ---------------------------------------------------------------------
-- appointment_events — AUTHORITATIVE appointment history (final
-- decision): one row per lifecycle event (create/reschedule/cancel/
-- no_show/...). Reschedule keeps the same appointment id + reference_no
-- and records old→new here. The compact appointments.rescheduled_from
-- JSON is a display convenience, not the authority.
-- ---------------------------------------------------------------------
CREATE TABLE appointment_events (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL,
  event_type     VARCHAR(40)   NOT NULL,                              -- 'created','rescheduled','canceled','no_show', ... (app-defined)
  old_date       DATE          NULL,
  old_time       TIME          NULL,
  new_date       DATE          NULL,
  new_time       TIME          NULL,
  actor_type     ENUM('User','Doctor','Admin') NOT NULL,
  actor_id       BIGINT UNSIGNED NULL,                               -- NULL for system actions
  metadata       JSON          NULL,                                 -- reasons, channel, etc.
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ape_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  INDEX ix_ape_appt (appointment_id),
  INDEX ix_ape_type (event_type),
  INDEX ix_ape_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
