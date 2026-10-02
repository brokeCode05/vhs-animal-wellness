# VHS Data Contract — Frozen Frontend Entity Shapes

> Source of truth: the frozen frontend code cited per section. Wire format is **snake_case**; the frontend mapper (`shared/appointment-contract.js` `fromLegacy`) already accepts snake_case keys.
> Legend: **R** = required · **O** = optional/nullable · *italic* = frontend meaning · **Validation** = backend notes.

---

## 1. USER

Sources: `shared/mock-users.js` USERS + Admin `submitCreateUser`/`submitEditUser` + User profile form **+ `shared/signup-wizard.js` v1.1.0 `LIMITS`/`RULES` (public self-registration, Advisor Revision Sprint 1 — approved)**.

> **Signup contract (frozen):** self-registration creates the **OWNER ACCOUNT ONLY**. No pet, appointment, consultation, document or medical record is created at signup. `role` is forced to `User` server-side; a self-registering browser can never choose `Doctor` or `Admin`. `confirmPassword` and the terms-acceptance checkbox are **UI-only** — neither is persisted, and terms consent is recorded by the server's own consent record, not as an auth column.

| Field | Type | Req | Meaning | Backend validation notes |
|---|---|---|---|---|
| userId | int (AI) | R | PK | server-generated; frontend renders `#C###` from row order — do NOT use row order for identity |
| firstName / lastName | string(50) | R | name parts | `max:50`; letters (any script), combining marks, space, hyphen, apostrophe and period are legitimate (PH names use `Jr.`/hyphenated surnames); whitespace-only rejected |
| middleName | string(50) | O | middle name | `max:50`; **optional** — remains nullable |
| name | string(120) | R | display name (`first + last` kept in sync by Admin edit) | server can derive; keep column for fast display |
| email | string(254) | R | login identity + contact | **unique**; `max:254` (RFC 5321 path limit); duplicate check **case-insensitive** — normalise (trim + lowercase) before the uniqueness check AND before storing |
| phone | string(15–20) | O (R for self-registration) | contact | **INPUT vs STORAGE are different.** Frontend collects a PH local mobile `9XXXXXXXXX` (10 digits) under a fixed `PH +63` display prefix. **Canonical storage is the normalised E.164 form `+639XXXXXXXXX` (13 chars).** Server re-derives the canonical value; never store the raw local string. Column width must hold `+` + country code + up to 15 national digits |
| address | string(250) | O (R for self-registration) | home address | `max:250`; leading/trailing whitespace trimmed; normal punctuation preserved |
| birthdate | date | O in schema, **R for self-registration** | date of birth | valid, real calendar date, **not in the future**, and **owner must be ≥ 18 years old** (see §1.1). Admin-provisioned Doctor/Admin accounts may omit it |
| password | — | never returned | credentials | **hash only**, never plaintext. Frontend input range **8–72** (`min:8`, `max:72` — 72 is the bcrypt `PASSWORD_BCRYPT` truncation boundary). Stored hash `VARCHAR(255)`. No API may ever return it |
| status | enum(`active`,`inactive`) | R | account gate | inactive = login disabled (doctor-account rule parity) |
| role | enum(`User`,`Doctor`,`Admin`) | R | role | self-registration forces `User`; Admin may create `User` and `Doctor`; Admin can never create `Admin` |

### 1.1 Owner minimum age (frozen business rule)

**An owner creating an account must be at least 18 years old.**

- Mirror `LIMITS.minOwnerAge = 18` in `shared/signup-wizard.js`.
- The cutoff is **computed dynamically** from the current date on the server (`now()->subYears(18)`); **never hardcode a cutoff year**.
- **Future DOB invalid; malformed/impossible DOB invalid** (e.g. `2001-02-30`).
- The HTML `max` attribute on the date input is **UX only** — the backend must re-validate on registration, authoritatively. A crafted POST bypassing the browser must be rejected.

Frontend reference: `ruleDob()` / `latestDobForAge()` in `shared/signup-wizard.js`.

### 1.2 Email / account security (authoritative, server-side)

- **Unique email**, compared after normalisation (trim + lowercase).
- **Password hashing only** — never plaintext at rest, never in logs, never in an API response.
- **OTP is server-issued, server-validated, and time-limited.** Never trust frontend OTP state; the frontend demo accepts any 6 digits and the backend must not.
- Expiry for OTP / reset / activation tokens; **rate-limit** OTP issue + resend per identifier and per IP.
- `role` and `status` are assigned **server-side**; a browser-supplied role is ignored.

## 2. PET

Sources: `shared/mock-users.js` §CANONICAL PET PROFILE CONTRACT + Admin register/edit pet **+ `user/pet-onboarding.js` v1.0.0 `PET_LIMITS`/`PET_RULES` (first-pet onboarding, Advisor Revision Sprint 1 — approved)**.

> **Pet registration is SEPARATE from signup (frozen).** A pet is created **only after** the owner has registered, verified and logged in. `ownerId` is taken from the **authenticated session/context** — a client-submitted `ownerId` must never be trusted, and a User must never be able to create a pet for another owner.

> **Empty medical data (frozen).** A newly created pet starts with **no** appointment, consultation, vaccination, medical history, prescription, lab result or document. APIs return honest empty collections. Production seed logic must **not** fabricate demo medical records for new pets.

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| petId | int (AI) | R | PK | server-generated (maps to `pets.id`) |
| ownerId | int → users.id | R | owner link | **FK, never name-matched**; **resolved from the authenticated session, not from the request body**; owner must exist (`owner_not_found` guard) |
| name | string(50) | R | pet name | `max:50`; whitespace-only rejected; control characters rejected |
| species | enum(`Dog`,`Cat`,`Bird`,`Rabbit`,`Other`) | R | species | when `Other`, `speciesCustom` required non-empty |
| speciesCustom | string(50) | O | custom species text | `max:50`; cleared when species ≠ Other |
| breed | string(60) | R (may be empty string) | breed select value | when breed is `Other`, `breedCustom` carries the text |
| breedCustom | string(60) | O | custom breed text | `max:60`; cleared when breed ≠ Other |
| gender | enum(`Male`,`Female`) | R | sex | |
| age | int (years) | O | age | `max:50`, whole years, **PROVISIONAL UI/BUSINESS CONSTRAINT — not a veterinary truth** (see §2.1) |
| weightKg | decimal(5,2) | O | weight in kg | max `200`, 2 decimals; **PROVISIONAL** (see §2.1). Must parse as a real number: reject `e`/`E`, `+`/`-` signs, and empty/NaN input |
| color | string(50) | O | color / markings | `max:50` |
| reproductiveStatus | enum(`Intact`,`Spayed`,`Neutered`,`Not Sure`) | O | reproductive status | |
| microchipId | string(30) | O | microchip | `max:30`; `[A-Za-z0-9-]` only |
| allergies | string(200) | O | known allergies | `max:200` |
| chronicConditions | string(200) | O | chronic conditions | `max:200` |
| notes | string(500) | O | medical notes | `max:500`; **wire field is `medical_notes`**, stored as `pets.notes` — keep one representation, do not add a second column |
| photo | file path | O | form-only upload asset | **not** profile contract data; **BACKEND DECISION REQUIRED** (storage + endpoint) |

### 2.1 Age / weight maxima are PROVISIONAL

`PET_LIMITS.age.max = 50` and `PET_LIMITS.weightKg.max = 200` are the values the existing form already advertised. They are a **UI/business guardrail, not medical truth**, and are flagged `TODO(BACKEND)` in `user/pet-onboarding.js`.

**This docs-only pass deliberately does not invent veterinary ranges.** Before B2, the product/vet owner should confirm real maxima; until then mirror these values so behaviour matches the approved UI, and treat any change as a coordinated contract revision.

> If the schema later switches from `age` to a birthdate, prefer **deriving** age over permanently storing both.

## 3. DOCTOR

Source: `shared/mock-doctors.js` DOCTORS seed + Admin accounts create/edit + availability select.

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| doctorId | int (AI) | R | PK | |
| userId | — | R | link to a users row (role=Doctor) | frontend seed uses `vet-001`; backend links to real users.id — see VHS_DATABASE_BLUEPRINT.md §doctors |
| firstName / lastName | string(50) | R | identity | create requires first+last+email |
| middleName | string(50) | O | | |
| name | string(120) | R | display ("Dr. Santos" style) | keep in sync server-side |
| email | string(254) | R | contact + login identity | same `users.email` column as §1 — **unique** (duplicate_email guard), compared after normalisation |
| phone | string(20) | O | contact | |
| specialization | string(100) | O | e.g. General Practice | |
| role | enum constant `Doctor` | R | fixed | no role selector exists in Admin create form |
| accountStatus | enum(`active`,`inactive`) | R | login disabled when inactive | separate concept from availability |
| availabilityStatus | enum(`on_duty`,`on_break`,`on_leave`) | R | working status | separate from accountStatus; shared with Doctor portal |
| createdAt | datetime | R | created | |

## 4. SERVICE

Source: `shared/mock-users.js` §CANONICAL SERVICE CATALOG (26 seeded services) + Admin service CRUD.

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| serviceId | int | R | PK (seeded 1–26) | **stable — never regenerated** |
| value | string(100) unique | R | stable snake_case key stored on appointments (`consultation`, `vaccination`, …) | **FK target for appointments.service_key** |
| label | string(120) | R | display name | |
| group | string(60) | R | category (`Preventive & Wellness`, `Diagnostics`, `Surgery & Procedures`, `Pet Care`, `Specialized Care`, custom) | Admin "Other" → custom text allowed |
| price | string (display) | R (display) | display price for catalog UI | frontend demo shows display strings (`₱300.00 – ₱2,000.00`); backend stores the **single price model** (final decision): `price DECIMAL(10,2) NOT NULL` + `currency CHAR(3) DEFAULT 'PHP'` — no `price_min`/`price_max`; the API serves the numeric price and any range-style display is a frontend presentation concern |
| active | bool | R | inactive removes from NEW bookings only | history keeps stored value/label |

## 5. APPOINTMENT (canonical — `shared/appointment-contract.js`)

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| appointmentId | int (AI) | R | PK | server-assigned (demo used `apt###`) |
| referenceNo | string(20) unique | R | public reference (`VHS-YYYYMMDD-NNNN`) | **unique**; shown to users + QR payload |
| userId | int → users | R | owner | must exist |
| petId | int → pets | R | pet | must exist AND belong to userId (frontend derives owner by petId; server enforces) |
| assignedVetId | int → doctors, nullable | O | assigned vet | starts NULL; assigned by system/Admin workflow only — the User never picks a doctor (final decision BACKEND_START_HERE.md §4.3) |
| service / service_key | string → services.value | R | service at booking | must reference an active service at booking time |
| serviceLabelAtBooking | string | R (snapshot) | label at booking | see §Service history |
| priceAtBooking | decimal DECIMAL(10,2) | R (snapshot) | price at booking | snapshot of `services.price` (single price model) at create time; never recomputed from the live catalog |
| appointmentDate | date | R | | today or future at booking |
| appointmentTime | time HH:MM (24h) | R | canonical 24h | `timeToHHMM()` normalization already handled both formats |
| visitContext | enum-ish string | O | visit reason option | free text accepted by frontend |
| customVisitContext | string | O | "Other"/symptoms free text | pairs with visitContext |
| notes | string(255) | O | client notes / reschedule-cancel reasons appended by frontend | keep; also recorded in audit metadata |
| status | enum — see §Lifecycle | R | | guarded transitions server-side |
| checkedInAt | datetime null | O | check-in stamp | server-stamped |
| consultationStartedAt | datetime null | O | start stamp | server-stamped |
| consultationCompletedAt | datetime null | O | completion stamp | server-stamped |
| rescheduledFrom | json null | O | `{date,time,at}` history | display convenience only; **authoritative history is the dedicated `appointment_events` table** (final decision BACKEND_START_HERE.md §4.6) |

**Service history:** frontend note — `TODO(BACKEND): snapshot the price/service details onto each appointment at booking time (e.g. price_at_booking) so later catalog edits never change what a historical appointment actually cost.` The demo resolves display labels via `serviceLabel()` (value → label, falling back to stored label); backend should keep the same display resolution.

## 6. CONSULTATION

Source: `doctor/doctor.js` `buildConsultation()` — the exact shape the backend consultation endpoint receives.

| Field | Type | Req | Meaning |
|---|---|---|---|
| appointmentId | int → appointments | R | one active consultation per appointment |
| patientId | int → pets | R | duplicated for convenience |
| veterinarianId | int → doctors | R | from authenticated session |
| status | mirror of appointment status | R | |
| startedAt / completedAt | datetime | R | mirrors appointment lifecycle stamps |
| duration | int minutes | O | derived from timestamps |
| soap.subjective / objective / assessment / plan | text | O | **INTERNAL — never client-facing** |
| soap.weight / temperature / heartRate | string | O | vitals |
| prescriptions | array | O | see §Prescription |
| labRequests | array `{test, notes}` | O | see §Labs |
| createdAt / updatedAt | datetime | R | |

## 7. PRESCRIPTION

| Field | Type | Req | Meaning |
|---|---|---|---|
| consultationId | int → consultations | R | |
| medicine | string(120) | R | (frontend blocks partially-filled rows) |
| dosage | string(60) | O | |
| frequency | string(60) | O | |
| duration | string(60) | O | |
| instructions | text | O | client-facing |

## 8. LAB REQUEST / RESULT

| Field | Type | Req | Meaning |
|---|---|---|---|
| consultationId | int | R | |
| test | string(120) | R | checkbox labels today (`fecalysis`, `blood_test`, …) |
| notes | text | O | |
| status | enum(`requested`,`processing`,`completed`) | R | requested at creation |
| resultSummary | text | O | fills at result stage; becomes Lab Result document source |
| resultAt | datetime | O | |

## 9. DOCUMENT

Source: `shared/document-store.js` (frozen types + scoping).

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| docId | int (AI) | R | PK (demo `doc-####`) | |
| type | enum(`consultation_summary`,`prescription`,`lab_request`,`lab_result`,`receipt`) | R | | visibility rules in §Document visibility |
| status | enum(`finalized`) | R | only finalized client-facing docs exist | draft/void states: **BACKEND DECISION REQUIRED** |
| appointmentId / referenceNo | int / string | R | links | |
| userId / petId | int | R | ownership scoping (User sees own only) | server must scope |
| petName / ownerName | string | R | display | |
| service | string | O | | |
| veterinarian | json `{name, role}` | O | signature block | |
| issuedAt | datetime | R | | |
| data | json | R | type-specific payload (vitals/assessment/plan, medicines[], tests[]) | validated per type |

## 10. AUDIT LOG

Source: `shared/audit-store.js` (prototype; server-authoritative).

| Field | Type | Req | Meaning |
|---|---|---|---|
| auditId | int (AI) | R | |
| actorType | enum(`User`,`Doctor`,`Admin`) | R | from authenticated session — never client-supplied |
| actorId / actorName | int / string | R | |
| action | string(60) | R | frozen action keys listed in §Audit contract |
| entityType | enum(`appointment`,`doctor`,`user`,`pet`,`service`,`clinic_settings`) | R | `document` when document finalization is audited |
| entityId | string | R | |
| referenceNo | string O | appointment-scoped actions carry it |
| description | string(255) | R | human-readable summary |
| metadata | json | O | old/new values (availability, reschedule, status, reason) |
| createdAt | datetime | R | |

**Audit contract (frozen action keys, from frontend hook sites):** `appointment_created`, `appointment_rescheduled`, `appointment_canceled`, `appointment_rejected`, `appointment_approved`, `patient_checked_in`, `consultation_started`, `consultation_completed`, `doctor_availability_changed`, `doctor_activated/deactivated`, `doctor_created`, `doctor_updated`, `user_created/activated/deactivated/updated`, `pet_registered`, `pet_updated`, `service_created/updated/activated/deactivated/deleted`, `clinic_settings_updated`. Metadata example (reschedule): `{previousDate, previousTime, appointmentDate, appointmentTime}`.

## 11. CLINIC SETTINGS

Source: `shared/clinic-settings.js` (single global record).

| Field | Type | Req | Default | Meaning |
|---|---|---|---|---|
| hours.weekday.firstAppointment / lastAppointment | time | R | 09:00 / 17:00 | last start **inclusive** |
| hours.weekend.firstAppointment / lastAppointment | time | R | 10:00 / 18:00 | last start **inclusive** |
| slotIntervalMinutes | int | R | 60 | |
| cancellationCutoffMinutes | int | R | 120 | |
| rescheduleCutoffMinutes | int | R | 120 | |
| noShowGraceMinutes | int | R | 15 | after grace the backend may flag eligible candidates; Admin confirms/marks `no_show` — never auto-mark solely on elapsed time (final decision) |
| clinicInfo.name / phone / email / website / address | string | R | VHS values | consumed by documents letterhead + public site |

---

## 12. APPOINTMENT LIFECYCLE SPEC (server-side validation contract)

Canonical statuses (frontend `STATUSES`): `pending, confirmed, checked_in, in_consultation, completed, canceled, no_show, rescheduled`.

**Allowed transitions (from `shared/mock-appointments.js setStatus()` guard — replicate exactly):**

| From → To | Allowed |
|---|---|
| confirmed → checked_in | ✅ (patient_checked_in) |
| checked_in → in_consultation | ✅ (consultation_started) |
| in_consultation → completed | ✅ (consultation_completed) |
| confirmed → canceled | ✅ (admin/user cancel) |
| pending → canceled | ✅ |
| pending → confirmed | ✅ (approve) |
| rescheduled → canceled | ✅ (legacy acceptance only) |
| rescheduled → confirmed | ✅ (legacy acceptance only) |
| confirmed → in_consultation | ❌ |
| checked_in → completed | ❌ |
| completed → anything | ❌ **terminal, never backward** |
| canceled → anything | ❌ terminal |
| anything → rescheduled | ❌ never a status write |

**Rules:**
- Only `checked_in` may start consultation; only `in_consultation` may complete; `completed` cannot move backward; `canceled` is terminal.
- Successful reschedule keeps the same `appointmentId` and `referenceNo`; status returns to/remains `confirmed`; previous slot freed, new slot occupied; one audit event with old→new, plus an authoritative `appointment_events` history row (old/new date+time, actor).
- Reschedule eligible only from `confirmed` (frontend also accepts `pending` in the Admin open-guard; store guard accepts `confirmed|pending`).
- Cancellation allowed pre-consult (`confirmed`/`pending`); slot becomes available; record stays historically readable; one audit event with reason.
- Cancellation/reschedule cutoffs are settings-driven (120 min); no-show grace 15 min — after the grace period the backend may determine eligibility, but an Admin confirms/marks `no_show` (never auto-mark solely because time elapsed; final decision).
- `no_show` exists in the canonical status list but has no frontend transition path — backend owns its enforcement: eligibility after grace, Admin-confirmed marking (final decision).
- Timestamps (`checkedInAt`, `consultationStartedAt`, `consultationCompletedAt`) are stamped by the server inside the transition.

## 13. Document visibility rules

**INTERNAL (Doctor-only, never in Admin/User surfaces, never in documents table):**
- SOAP narrative (subjective/objective), internal doctor notes, draft consultation data.

**CLIENT-FACING (finalized documents):**
- Consultation Summary — vitals, assessment, plan (internal narrative excluded by construction)
- Prescription — medicines + instructions
- Lab Request — requested tests
- Lab Result — result summary
- Receipt — where a receipt workflow exists (**BACKEND DECISION REQUIRED**)

**Access:**
- **User:** own client-facing documents only (`forUser(session user)`; ownership re-checked at view time; no other users' data).
- **Admin:** client-facing operational documents (list/view); no internal SOAP.
- **Doctor:** internal clinical record + finalized documents.

## 14. Wire format note

The frozen frontend accepts **snake_case** API responses (`fromLegacy` maps `appointment_id`, `reference_no`, `appointment_date`, `checked_in_at`, …). Keep `toLegacyDisplay`'s projection in mind (`owner_name`, `pet_name`, `pet_type`, `pet_breed` are composed on the frontend from the related records — the API may either send composed display rows or the frontend mappers handle composition).
