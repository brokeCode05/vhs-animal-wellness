<?php

use App\Http\Controllers\AccessLogsController;
use App\Http\Controllers\AnnouncementsController;
use App\Http\Controllers\AppointmentsController;
use App\Http\Controllers\AuditLogsController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\AvailabilityController;
use App\Http\Controllers\ClinicSettingsController;
use App\Http\Controllers\ConsultationsController;
use App\Http\Controllers\DoctorsController;
use App\Http\Controllers\DocumentsController;
use App\Http\Controllers\LegacyAuthController;
use App\Http\Controllers\LegacyDataController;
use App\Http\Controllers\PetsController;
use App\Http\Controllers\ServicesController;
use App\Http\Controllers\UsersController;
use App\Http\Controllers\VaccinationsController;
use App\Http\Middleware\RecordUserAccess;
use Illuminate\Support\Facades\Route;

// Preserve the finished public frontend. Laravel is the backend underneath it.
Route::get('/', fn () => redirect('/web-page/index.html'));
Route::get('/terms', fn () => view('terms'));
Route::get('/auth', fn () => view('auth'))->name('login');

// Frozen legacy/public form URLs kept for the existing frontend.
Route::middleware('throttle:30,1')->group(function () {
    // New Laravel-safe endpoints
    Route::post('/legacy/register', [LegacyAuthController::class, 'register']);
    Route::post('/legacy/login', [LegacyAuthController::class, 'login']);

    // Keep old compatibility routes
    Route::post('/web-page/index.php', [LegacyAuthController::class, 'register']);
    Route::post('/web-page/login.php', [LegacyAuthController::class, 'login']);

    // This one already works
    Route::post('/php_files/sms_otp.php', [LegacyAuthController::class, 'sendSignupSms']);
});
    Route::get('/legacy/verify-email/{user}', [LegacyAuthController::class, 'verifyEmail'])->name('legacy.verify.email');

Route::prefix('api')->group(function () {
    Route::get('health', fn () => response()->json(['success' => true, 'message' => 'Laravel is running.', 'data' => ['phase' => 'defense-ready'] ]));
    Route::get('recaptcha-config', function () {
        $siteKey = trim((string) config('services.recaptcha.site_key'));

        if ($siteKey === '') {
            return response()->json([
                'success' => false,
                'message' => 'reCAPTCHA is not configured.',
                'data' => ['site_key' => null],
            ], 503);
        }

        return response()->json([
            'success' => true,
            'message' => 'reCAPTCHA configuration loaded.',
            'data' => ['site_key' => $siteKey],
        ]);
    });

    Route::get('auth/csrf', fn () => response()->json(['success' => true, 'message' => 'CSRF initialized.', 'data' => ['csrf_token' => csrf_token()]]));

    Route::middleware('throttle:30,1')->group(function () {
        Route::post('auth/register', [AuthController::class, 'register']);
        Route::post('auth/login', [AuthController::class, 'login']);
        Route::post('auth/verify-otp', [AuthController::class, 'verify']);
        Route::post('auth/resend-otp', [AuthController::class, 'resend']);
        Route::post('auth/password-reset', [AuthController::class, 'requestReset']);
        Route::post('auth/password-reset/confirm', [AuthController::class, 'confirmReset']);
    });

    // Public read-only clinic data used by the finished website.
    Route::get('services', [ServicesController::class, 'index']);
    Route::get('clinic-settings', [ClinicSettingsController::class, 'show']);
    Route::get('public/doctors', [DoctorsController::class, 'publicIndex']);

    Route::middleware(['auth', 'active', RecordUserAccess::class])->group(function () {
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::get('announcements', [AnnouncementsController::class, 'index']);
        Route::get('users/me/pets', [PetsController::class, 'me']);
        Route::get('users/{user}/pets', [PetsController::class, 'forUser']);
        Route::get('users/{user}', [UsersController::class, 'show']);
        Route::patch('users/{user}', [UsersController::class, 'update']);

        Route::get('pets/{pet}/vaccinations', [VaccinationsController::class, 'index']);
        Route::get('pets/{pet}/medical-records', [PetsController::class, 'medicalRecords']);
        Route::get('pets/{pet}', [PetsController::class, 'show']);
        Route::post('pets', [PetsController::class, 'store']);
        Route::patch('pets/{pet}', [PetsController::class, 'update']);
        Route::delete('pets/{pet}', [PetsController::class, 'destroy']);

        Route::get('doctors', [DoctorsController::class, 'index']);
        Route::patch('doctors/{doctor}/availability', [DoctorsController::class, 'availability']);

        Route::get('appointments', [AppointmentsController::class, 'index']);
        Route::get('appointments/{appointment}', [AppointmentsController::class, 'show']);
        Route::post('appointments', [AppointmentsController::class, 'store']);
        Route::patch('appointments/{appointment}', [AppointmentsController::class, 'update']);
        Route::patch('appointments/{appointment}/status', [AppointmentsController::class, 'status']);
        Route::get('availability', [AvailabilityController::class, 'index']);

        Route::get('documents', [DocumentsController::class, 'index']);
        Route::get('documents/{document}', [DocumentsController::class, 'show']);

        Route::middleware('role:Admin')->group(function () {
            Route::get('users', [UsersController::class, 'index']);
            Route::post('users', [UsersController::class, 'store']);
            Route::patch('users/{user}/status', [UsersController::class, 'status']);
            Route::post('doctors', [DoctorsController::class, 'store']);
            Route::patch('doctors/{doctor}', [DoctorsController::class, 'update']);
            Route::patch('doctors/{doctor}/status', [DoctorsController::class, 'status']);
            Route::post('services', [ServicesController::class, 'store']);
            Route::patch('services/{service}', [ServicesController::class, 'update']);
            Route::patch('services/{service}/status', [ServicesController::class, 'status']);
            Route::delete('services/{service}', [ServicesController::class, 'destroy']);
            Route::patch('clinic-settings', [ClinicSettingsController::class, 'update']);
            Route::get('announcements/manage', [AnnouncementsController::class, 'manage']);
            Route::post('announcements', [AnnouncementsController::class, 'store']);
            Route::patch('announcements/{announcement}', [AnnouncementsController::class, 'update']);
            Route::delete('announcements/{announcement}', [AnnouncementsController::class, 'destroy']);
            Route::get('audit-logs', [AuditLogsController::class, 'index']);
            Route::get('access-logs', [AccessLogsController::class, 'index']);
        });

        Route::middleware('role:Doctor')->group(function () {
            Route::get('consultations', [ConsultationsController::class, 'index']);
            Route::get('consultations/{consultation}', [ConsultationsController::class, 'show']);
            Route::post('consultations', [ConsultationsController::class, 'store']);
            Route::patch('consultations/{consultation}', [ConsultationsController::class, 'update']);
            Route::post('consultations/{consultation}/complete', [ConsultationsController::class, 'complete']);
        });

        // Compatibility URLs already hard-coded in the original User frontend.
        Route::post('pets/save_pet.php', [LegacyDataController::class, 'savePet']);
        Route::post('pets/delete_pet.php', [LegacyDataController::class, 'deletePet']);
        Route::post('appointments/request_otp.php', [LegacyDataController::class, 'requestAppointmentOtp']);
        Route::post('appointments/verify_otp.php', [LegacyDataController::class, 'verifyAppointmentOtp']);
    });
});

// Legacy PHP-shaped endpoints. They are Laravel routes now; no PHP files execute from public/.
Route::middleware(['auth', 'active', RecordUserAccess::class])->group(function () {
    Route::get('/legacy/user/pets', [LegacyDataController::class, 'getUserPets']);
    Route::get('/legacy/user/appointments', [LegacyDataController::class, 'getUserAppointments']);
    Route::get('/php_files/get_users.php', [LegacyDataController::class, 'getUsers']);
    Route::get('/php_files/get_pets.php', [LegacyDataController::class, 'getPets']);
    Route::get('/php_files/get_booked_slots.php', [LegacyDataController::class, 'bookedSlots']);
    Route::get('/php_files/get_appointments.php', [LegacyDataController::class, 'getAppointments']);
    Route::post('/php_files/book-appointment.php', [LegacyDataController::class, 'bookAppointment']);
    Route::post('/php_files/update_appointment_status.php', [LegacyDataController::class, 'updateAppointmentStatus']);
    Route::post('/php_files/reschedule_appointment.php', [LegacyDataController::class, 'rescheduleAppointmentLegacy']);
    Route::post('/php_files/update_profile.php', [LegacyDataController::class, 'updateProfile']);
    Route::get('/user/get_pets_user.php', [LegacyDataController::class, 'getUserPets']);
    Route::get('/user/get_user_appointments.php', [LegacyDataController::class, 'getUserAppointments']);
});
