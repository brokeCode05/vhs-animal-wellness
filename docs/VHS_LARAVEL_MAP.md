# VHS Laravel Implementation Map

> Recommended structure when Laravel lives under `/backend` in this same repo (see workflow in [VHS_BACKEND_HANDOFF.md](VHS_BACKEND_HANDOFF.md) §15). Models per [vhs_schema.sql](vhs_schema.sql); API surface per [VHS_API_CONTRACT.md](VHS_API_CONTRACT.md).

## 1. Models

| Model | Table | Key notes |
|---|---|---|
| `User` | `users` | Laravel stock + `role`, `status`, `name` parts; `HasApiTokens`; role checks via policy/middleware |
| `Pet` | `pets` | `belongsTo(User, 'owner_id')`; SoftDeletes |
| `DoctorProfile` | `doctor_profiles` | `belongsTo(User)`; `account_status`, `availability_status` separate |
| `Service` | `services` | `value` unique; SoftDeletes; `active` scope `scopeActive()` |
| `Appointment` | `appointments` | enums for status; `belongsTo` user/pet/vet/service; snapshot columns (`service_label_at_booking`, `price_at_booking` DECIMAL) never mutated on service edits |
| `AppointmentEvent` | `appointment_events` | `belongsTo(Appointment)`; authoritative lifecycle history (create/reschedule/cancel/no_show rows with old→new date/time, actor, metadata) |
| `Consultation` | `consultations` | `hasOne` inverse of appointment; SOAP columns internal (`$hidden` from non-Doctor contexts) |
| `Prescription` | `prescriptions` | `belongsTo(Consultation)` |
| `LabRequest` | `lab_requests` | `belongsTo(Consultation)`; `status` enum |
| `LabResult` | `lab_results` | `hasOne` inverse of LabRequest (optional table — see blueprint) |
| `Document` | `documents` | `payload` JSON cast; scoping query helpers `forUser()` / `forPet()` |
| `AuditLog` | `audit_logs` | INSERT-only model (no update/delete methods exposed); written via `AuditService` |
| `ClinicSetting` | `clinic_settings` | singleton (`findOrFail(1)`); cached reads |

## 2. Migrations (order matters for FKs)

1. `create_users_table` (Laravel stock + role/status/name parts/address/birthdate)
2. `create_pets_table`
3. `create_doctor_profiles_table`
4. `create_services_table`
5. `create_clinic_settings_table`
6. `create_appointments_table`
7. `create_appointment_events_table`
8. `create_consultations_table`
9. `create_prescriptions_table`
10. `create_lab_requests_table` (+ `create_lab_results_table` optional)
11. `create_documents_table`
12. `create_audit_logs_table`
13. Seeders: `ServiceCatalogSeeder` (26 services, single `price DECIMAL(10,2)` — no min/max), `ClinicSettingsSeeder` (defaults incl. noshow_grace 15), `DoctorSeeder` (Dr. Santos identity)

## 3. Suggested structure (controllers → services → models)

Keep business rules in **service classes** so both controllers and future jobs call the same guarded logic:

```
app/Http/Controllers/Api/
  AuthController.php            UserController.php      PetController.php
  DoctorController.php          ServiceController.php   ClinicSettingController.php
  AppointmentController.php     AvailabilityController.php
  ConsultationController.php    PrescriptionController.php
  LabRequestController.php      DocumentController.php  AuditLogController.php
app/Services/
  AppointmentService.php        -- create / reschedule / setStatus (transition table + slot concurrency + cutoffs)
  AvailabilityService.php       -- slot generation from clinic settings + taken slots
  ConsultationService.php       -- start/save/complete + document fan-out (same transaction)
  DocumentService.php           -- finalizeFromConsultation() server-side twin
  AuditService.php              -- writeAudit(actor from session, action, entity, metadata)
app/Policies/                   -- ownership + role rules (VHS_ROLE_PERMISSIONS.md)
app/Http/Middleware/            -- role middleware (role:User, role:Doctor, role:Admin)
```

### Domain mapping examples (frontend → backend)

| Frontend call | HTTP | Controller → Service | Model/transaction |
|---|---|---|---|
| `SharedMockAppointments.add(canonical)` | `POST /api/appointments` | `AppointmentController@store` → `AppointmentService::create()` | validates active service + free slot (SELECT … FOR UPDATE + guard), snapshots label/price, writes `audit_logs`, returns id + reference_no |
| `SharedMockAppointments.checkIn(id)` / `setStatus(id,'checked_in')` | `PATCH /api/appointments/:id/status` | `AppointmentController@setStatus` → `AppointmentService::transition()` | guarded transition table + `checked_in_at` stamp + audit |
| `SharedMockAppointments.reschedule(id,date,time)` | `PATCH /api/appointments/:id` | `AppointmentController@update` → `AppointmentService::reschedule()` | cutoff check, slot re-check, same id/reference_no, `appointment_events` history row (old→new) + `rescheduled_from` JSON convenience, status back to `confirmed`, audit old→new |
| `SharedMockUsers.addUser()/updateUser()/setUserStatus()` | `/api/users` group | `UserController` | duplicate_email 409; status change audits |
| `SharedMockUsers.addPet()/updatePet()` | `/api/pets` group | `PetController` | `owner_not_found` 404; species=Other ⇒ speciesCustom |
| `SharedMockUsers.addService()/updateService()/setServiceStatus()/deleteService()` | `/api/services` group | `ServiceController` | delete only unused Admin-created services |
| `SharedMockDoctors.setAccountStatus()/setAvailability()/updateDoctor()/addDoctor()` | `/api/doctors` group | `DoctorController` | availability audits old/new |
| `VHSClinicSettings.update(payload)` | `PATCH /api/clinic-settings` | `ClinicSettingController` | audit changes; invalidate cached settings |
| `SharedDocuments.finalizeFromConsultation()` | (side effect of) `POST /api/consultations/:id/complete` | `ConsultationController@complete` → `ConsultationService::complete()` → `DocumentService` | documents INSERTs in the completion transaction |
| `AuditLog.add(event)` | *(no endpoint — server-side only)* | `AuditService::write()` inside each action | read via `GET /api/audit-logs` |
| `_getSessionUser()` / `SharedMockDoctors.currentDoctor()` | `GET /api/auth/me` | `AuthController@me` | session/token identity |

## 4. Frontend store → Laravel replacement map (deletion list)

| Frontend demo layer (source file) | Storage key | Replaced by | Notes / TODO(BACKEND) anchor |
|---|---|---|---|
| `SharedMockAppointments` — `shared/mock-appointments.js` | `vhs_mock_appointments_added_v1` (localStorage) + `vhs_mock_checkin_overrides_v1` (sessionStorage) | Appointment API + `AppointmentService` | `TODO(BACKEND): Replace with the transition endpoints…` at `setStatus()`; mapper `fromLegacy()` already accepts snake_case |
| `SharedMockUsers` — `shared/mock-users.js` | `vhs_mock_users_pets_v1`, `vhs_mock_services_v1` | User/Pet/Service APIs | header TODO + per-method notes; `price_at_booking` note at booking boundary |
| `SharedMockDoctors` — `shared/mock-doctors.js` | `vhs_mock_doctors_v1` | Doctor API | `currentDoctor()` → `/api/auth/me`; seed identity note |
| `VHSClinicSettings` — `shared/clinic-settings.js` | `vhs_mock_clinic_settings_v1` | Clinic Settings API | consumed by slot generation + documents letterhead |
| `AuditLog` — `shared/audit-store.js` | `vhs_audit_log_v1` | server audit records (no client write) | `TODO(BACKEND): Replace frontend audit persistence with server-generated audit records.` (header) |
| `SharedDocuments` — `shared/document-store.js` | `vhs_documents_v1` | Documents API/storage + server-side PDF | `TODO(BACKEND): Replace document demo persistence with document API/storage.` (header) |
| `sessionStorage["vhs_user"]` — `user/user-script.js` `_getSessionUser()` | ss `vhs_user` / `user` | Laravel session/token (`/api/auth/me`) | `TODO(BACKEND): the authenticated session is the real identity source.` |
| Demo Admin actor — `shared/audit-store.js` `ADMIN_ACTOR` | — | authenticated Admin session | `TODO(BACKEND): Resolve actor from authenticated server session.` |
| Doctor identity — `doctor/doctor.js` `VETERINARIAN` | — | authenticated Doctor session | `TODO(BACKEND): Veterinarian identity comes from the authenticated session.` |
| Booking OTP — `user/user-script.js` `verifyOtp()` | — | real OTP flow (server-issued + server-validated) | final decision: OTP stays, backend-owned (BACKEND_START_HERE.md §4.1) |

**Swap order suggestion:** auth → users/pets/services/settings (read-heavy) → appointments (+status/reschedule) → consultations/documents → delete `AuditLog.add` call sites last (after every endpoint writes server audit rows).

## 5. Route skeleton

```php
Route::prefix('api')->group(function () {
    Route::post('auth/register',  [AuthController::class, 'register']);
    Route::post('auth/login',     [AuthController::class, 'login']);
    Route::post('auth/password-reset', [AuthController::class, 'reset']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::middleware('role:Admin')->group(function () {
            Route::apiResource('users', UserController::class)->only(['index','store','update']);
            Route::patch('users/{user}/status', [UserController::class, 'status']);
            Route::apiResource('doctors', DoctorController::class)->only(['index','store','update']);
            Route::patch('doctors/{doctor}/status', [DoctorController::class, 'status']);
            Route::apiResource('services', ServiceController::class)->only(['store','update']);
            Route::patch('services/{service}/status', [ServiceController::class, 'status']);
            Route::patch('clinic-settings', [ClinicSettingController::class, 'update']);
            Route::get('audit-logs', [AuditLogController::class, 'index']);
            Route::patch('appointments/{appointment}/status', [AppointmentController::class, 'adminStatus']);
        });

        Route::middleware('role:Doctor')->group(function () {
            Route::post('consultations', [ConsultationController::class, 'start']);
            Route::patch('consultations/{consultation}', [ConsultationController::class, 'update']);
            Route::post('consultations/{consultation}/complete', [ConsultationController::class, 'complete']);
            Route::patch('doctors/{doctor}/availability', [DoctorController::class, 'availability']);
        });

        Route::get('doctors', [DoctorController::class, 'index']);          // any role (scoped)
        Route::get('services', [ServiceController::class, 'index']);        // public + scoped
        Route::get('clinic-settings', [ClinicSettingController::class, 'show']);
        Route::get('availability', [AvailabilityController::class, 'index']);

        Route::apiResource('appointments', AppointmentController::class)->only(['index','show','store','update']);
        Route::apiResource('pets', PetController::class)->only(['index','show','store','update']);
        Route::get('users/{user}/pets', [PetController::class, 'forUser']);
        Route::get('documents', [DocumentController::class, 'index']);
        Route::get('documents/{document}', [DocumentController::class, 'show']);
    });
});
```

## 6. Testing hooks for the backend dev

- The frozen frontend behavioral spec = the QA traces in the Phase 5 report (lifecycle, reschedule/cancel, cutoffs, audit-once). Reproduce them as feature tests:
  - transition guard matrix (valid + invalid pairs, incl. `completed` terminal),
  - slot double-booking under concurrency (two parallel POSTs, one 409),
  - cutoff windows using seeded settings (120/120/15),
  - document fan-out on complete (summary always; prescription/lab only when ordered),
  - audit rows written exactly once per successful action.
