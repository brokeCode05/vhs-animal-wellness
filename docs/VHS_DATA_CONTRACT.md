# VHS Data Contract — Frozen Frontend Entity Shapes

> Source of truth: the frozen frontend code cited per section. Wire format is **snake_case**; the frontend mapper (`shared/appointment-contract.js` `fromLegacy`) already accepts snake_case keys.
> Legend: **R** = required · **O** = optional/nullable · *italic* = frontend meaning · **Validation** = backend notes.

---

## 1. USER

Source: `shared/mock-users.js` USERS + Admin `submitCreateUser`/`submitEditUser` + User profile form.

| Field | Type | Req | Meaning | Backend validation notes |
|---|---|---|---|---|
| userId | int (AI) | R | PK | server-generated; frontend renders `#C###` from row order — do NOT use row order for identity |
| firstName / lastName | string(50) | R | name parts | both required at creation (Admin create form requires first+last+email) |
| middleName | string(50) | O | middle name | Admin edit collects it |
| name | string(120) | R | display name (`first + last` kept in sync by Admin edit) | server can derive; keep column for fast display |
| email | string(191) | R | login identity + contact | **unique**; duplicate check case-insensitive (frontend does this) |
| phone | string(20) | O | contact | PH mobile format; frontend format `0917-123-4567` |
| address | string(255) | O | home address | Admin edit + profile collect it |
| birthdate | date | O | date of birth | valid date, past |
| status | enum(`active`,`inactive`) | R | account gate | inactive = login disabled (doctor-account rule parity) |
| role | enum(`User`,`Doctor`,`Admin`) | R | role | Users are `User`; backend decides whether Admin creates `User` accounts only |
| password | — | never from frontend | credentials | **BACKEND DECISION REQUIRED**: provisioned by backend; reset/unlock via auth service; Admin must never see it |

## 2. PET

Source: `shared/mock-users.js` §CANONICAL PET PROFILE CONTRACT (mirrors `#petForm` exactly) + Admin register/edit pet.

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| petId | int (AI) | R | PK | server-generated |
| ownerId | int → users.userId | R | owner link | **FK, never name-matched** (explicit frontend rule); owner must exist (`owner_not_found` guard) |
| name | string(80) | R | pet name | required (frontend guard) |
| species | enum(`Dog`,`Cat`,`Bird`,`Rabbit`,`Other`) | R | species | when `Other`, `speciesCustom` required non-empty |
| speciesCustom | string(50) | O | custom species text | cleared when species ≠ Other |
| breed | string(80) | R (may be empty string) | breed select value | when breed is `Other`, `breedCustom` carries the text |
| breedCustom | string(80) | O | custom breed text | |
| gender | enum(`Male`,`Female`) | R | sex | |
| age | int (years) | O | age | ≥ 0 |
| weightKg | decimal(5,2) | O | weight | 0.1 step |
| color | string(120) | O | color / markings | |
| reproductiveStatus | enum(`Intact`,`Spayed`,`Neutered`,`Not Sure`) | O | reproductive status | |
| microchipId | string(60) | O | microchip | |
| allergies | text | O | known allergies | |
| chronicConditions | text | O | chronic conditions | |
| notes | text | O | medical notes | |
| photo | file path | O | form-only upload asset | **not** profile contract data; **BACKEND DECISION REQUIRED** (storage + endpoint) |

## 3. DOCTOR

Source: `shared/mock-doctors.js` DOCTORS seed + Admin accounts create/edit + availability select.

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| doctorId | int (AI) | R | PK | |
| userId | — | R | link to a users row (role=Doctor) | frontend seed uses `vet-001`; backend links to real users.id — see VHS_DATABASE_BLUEPRINT.md §doctors |
| firstName / lastName | string(50) | R | identity | create requires first+last+email |
| middleName | string(50) | O | | |
| name | string(120) | R | display ("Dr. Santos" style) | keep in sync server-side |
| email | string(191) | R | contact + login identity | **unique** (duplicate_email guard) |
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
| price | string | R (display) | display price range | frontend format `₱300.00 – ₱2,000.00` or `Contact us for pricing`; **BACKEND DECISION REQUIRED** on structured numeric model (recommend price_min/price_max decimals + currency, price_display) |
| active | bool | R | inactive removes from NEW bookings only | history keeps stored value/label |

## 5. APPOINTMENT (canonical — `shared/appointment-contract.js`)

| Field | Type | Req | Meaning | Validation |
|---|---|---|---|---|
| appointmentId | int (AI) | R | PK | server-assigned (demo used `apt###`) |
| referenceNo | string(20) unique | R | public reference (`VHS-YYYYMMDD-NNNN`) | **unique**; shown to users + QR payload |
| userId | int → users | R | owner | must exist |
| petId | int → pets | R | pet | must exist AND belong to userId (frontend derives owner by petId; server enforces) |
| assignedVetId | int → doctors, nullable | O | assigned vet | currently null in demo; assignment flow is **BACKEND DECISION REQUIRED** |
| service / service_key | string → services.value | R | service at booking | must reference an active service at booking time |
| serviceLabelAtBooking | string | R (snapshot) | label at booking | see §Service history |
| priceAtBooking | string/decimal | R (snapshot) | price at booking | see §Service history |
| appointmentDate | date | R | | today or future at booking |
| appointmentTime | time HH:MM (24h) | R | canonical 24h | `timeToHHMM()` normalization already handled both formats |
| visitContext | enum-ish string | O | visit reason option | free text accepted by frontend |
| customVisitContext | string | O | "Other"/symptoms free text | pairs with visitContext |
| notes | string(255) | O | client notes / reschedule-cancel reasons appended by frontend | keep; also recorded in audit metadata |
| status | enum — see §Lifecycle | R | | guarded transitions server-side |
| checkedInAt | datetime null | O | check-in stamp | server-stamped |
| consultationStartedAt | datetime null | O | start stamp | server-stamped |
| consultationCompletedAt | datetime null | O | completion stamp | server-stamped |
| rescheduledFrom | json null | O | `{date,time,at}` history | demo field; backend may normalize into an audit/history table — **BACKEND DECISION REQUIRED** |

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
| noShowGraceMinutes | int | R | 15 | enforcement later — **BACKEND DECISION REQUIRED** on trigger |
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
- Successful reschedule keeps the same `appointmentId` and `referenceNo`; status returns to/remains `confirmed`; previous slot freed, new slot occupied; one audit event with old→new.
- Reschedule eligible only from `confirmed` (frontend also accepts `pending` in the Admin open-guard; store guard accepts `confirmed|pending`).
- Cancellation allowed pre-consult (`confirmed`/`pending`); slot becomes available; record stays historically readable; one audit event with reason.
- Cancellation/reschedule cutoffs are settings-driven (120 min); no-show grace 15 min — enforcement trigger is **BACKEND DECISION REQUIRED**.
- `no_show` exists in the canonical status list but has no frontend transition path — backend owns its enforcement: **BACKEND DECISION REQUIRED**.
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
