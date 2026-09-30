-- =====================================================================
-- VHS Animal Wellness Center — Backend STARTER / REFERENCE SCHEMA
-- MySQL 8.x, InnoDB, utf8mb4.
--
-- Scope: reference draft aligned to the FROZEN frontend contracts
-- (docs/VHS_DATA_CONTRACT.md). Column names are snake_case; the frozen
-- frontend mapper (shared/appointment-contract.js) already accepts
-- snake_case API payloads.
--
-- Conventions:
--   * ids are BIGINT UNSIGNED AUTO_INCREMENT (frontend demo ids were
--     small ints; backend ids replace them 1:1).
--   * status ENUMs mirror the frontend exactly — do not extend without
--     coordinating with the frozen frontend contract.
--   * audit_logs is INSERT-only by convention (see table comment).
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- users — all three roles (User | Doctor | Admin). No Clerk role.
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role          ENUM('User','Doctor','Admin') NOT NULL,
  status        ENUM('active','inactive')     NOT NULL DEFAULT 'active',
  first_name    VARCHAR(50)                   NOT NULL,
  middle_name   VARCHAR(50)                   NULL,
  last_name     VARCHAR(50)                   NOT NULL,
  name          VARCHAR(120)                  NOT NULL,           -- display name (first + last)
  email         VARCHAR(191)                  NOT NULL,
  phone         VARCHAR(20)                   NULL,
  address       VARCHAR(255)                  NULL,
  birthdate     DATE                          NULL,
  password      VARCHAR(255)                  NULL,               -- backend-managed; never exposed to Admin
  email_verified_at TIMESTAMP                   NULL,
  created_at    TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email),
  INDEX ix_users_role (role),
  INDEX ix_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- pets — ownership strictly by owner_id (never name-matched).
-- ---------------------------------------------------------------------
CREATE TABLE pets (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id            BIGINT UNSIGNED NOT NULL,
  name                VARCHAR(80)   NOT NULL,
  species             ENUM('Dog','Cat','Bird','Rabbit','Other') NOT NULL,
  species_custom      VARCHAR(50)   NULL,
  breed               VARCHAR(80)   NULL,
  breed_custom        VARCHAR(80)   NULL,
  gender              ENUM('Male','Female') NOT NULL,
  age                 TINYINT UNSIGNED NULL,                      -- years
  weight_kg           DECIMAL(5,2)  NULL,
  color               VARCHAR(120)  NULL,
  reproductive_status ENUM('Intact','Spayed','Neutered','Not Sure') NULL,
  microchip_id        VARCHAR(60)   NULL,
  allergies           TEXT          NULL,
  chronic_conditions  TEXT          NULL,
  notes               TEXT          NULL,                          -- medical notes (frozen pet contract)
  photo_path          VARCHAR(255)  NULL,                          -- BACKEND DECISION REQUIRED: upload storage
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
