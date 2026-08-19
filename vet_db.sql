-- VHS Database Schema (vhsdb)
-- Updated to reflect actual production tables
-- NOTE: If upgrading an existing database, run the ALTER TABLE migration below.

CREATE DATABASE vhsdb;
USE vhsdb;

CREATE TABLE vet_users (
    idvet_users  INT PRIMARY KEY AUTO_INCREMENT,
    first_name   VARCHAR(150) NOT NULL,
    last_name    VARCHAR(150) NOT NULL,
    middle_name  VARCHAR(255),
    phone        VARCHAR(20),
    user_address VARCHAR(250) NOT NULL,
    user_email   VARCHAR(100) NOT NULL UNIQUE,
    user_pass    VARCHAR(255) NOT NULL,
    birthday     DATE NOT NULL,
    role         VARCHAR(20)  NOT NULL DEFAULT 'user',
    status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    profile_photo VARCHAR(255) DEFAULT '',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pets (
    pet_id        INT PRIMARY KEY AUTO_INCREMENT,
    pet_name      VARCHAR(20)  NOT NULL,
    pet_type      VARCHAR(20)  NOT NULL,
    pet_breed     VARCHAR(30),
    pet_age       INT,
    pet_gender    VARCHAR(10),
    pet_weight    DECIMAL(10,2),
    medical_notes TEXT,
    owner_id      INT,
    pet_photo     VARCHAR(255) DEFAULT '',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES vet_users(idvet_users)
);

CREATE TABLE staff (
    staff_id         INT PRIMARY KEY AUTO_INCREMENT,
    staff_lastname   VARCHAR(50) NOT NULL,
    staff_firstname  VARCHAR(50) NOT NULL,
    staff_middlename VARCHAR(50),
    staff_email      VARCHAR(255) NOT NULL UNIQUE,
    contact_number   VARCHAR(11),
    staff_password   VARCHAR(255) NOT NULL,
    staff_role       ENUM('clinic owner','veterinarian','clerk') NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointments (
    appointment_id   INT PRIMARY KEY AUTO_INCREMENT,
    user_id          INT,
    pet_id           INT,
    staff_id         INT,
    vet_service      VARCHAR(100) NOT NULL,
    appointment_date DATE,
    appointment_time TIME,
    notes            TEXT,
    status           ENUM('pending','scheduled','completed','canceled') NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)  REFERENCES vet_users(idvet_users),
    FOREIGN KEY (pet_id)   REFERENCES pets(pet_id),
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
);

-- ─── MIGRATION: Upgrade existing appointments table ───────────────────────────
-- Run this block if the appointments table already exists in your database.
-- ALTER TABLE appointments
--     ADD COLUMN user_id          INT AFTER appointment_id,
--     ADD COLUMN vet_service      VARCHAR(100) NOT NULL DEFAULT '' AFTER staff_id,
--     ADD COLUMN appointment_time TIME AFTER appointment_date,
--     ADD COLUMN notes            TEXT AFTER appointment_time,
--     ADD COLUMN status           ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending' AFTER notes,
--     ADD COLUMN created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER status,
--     ADD CONSTRAINT fk_appt_user FOREIGN KEY (user_id) REFERENCES vet_users(idvet_users);
-- ─────────────────────────────────────────────────────────────────────────────
