<?php

use App\Http\Middleware\ActiveAccount;
use App\Http\Middleware\Role;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(function (Middleware $m): void {
        $m->alias(['active' => ActiveAccount::class, 'role' => Role::class]);
        $m->redirectGuestsTo(fn () => '/web-page/index.html');
        $m->validateCsrfTokens(except: [
            'legacy/register', 'legacy/login', 'web-page/index.php', 'web-page/login.php', 'php_files/sms_otp.php', 'api/auth/logout',
            'php_files/book-appointment.php', 'php_files/update_appointment_status.php', 'php_files/reschedule_appointment.php', 'php_files/update_profile.php',
            'api/pets/save_pet.php', 'api/pets/delete_pet.php',
            'api/appointments/request_otp.php', 'api/appointments/verify_otp.php',
        ]);
    })
    ->withExceptions(function (Exceptions $e): void {
        $e->shouldRenderJsonWhen(fn (Request $r) => $r->is('api/*') || $r->is('php_files/*') || $r->is('user/*.php') || $r->is('web-page/*.php') || $r->expectsJson());
        $e->render(function (Throwable $ex, Request $r) {
            if (! ($r->is('api/*') || $r->is('php_files/*') || $r->is('user/*.php') || $r->is('web-page/*.php'))) {
                return null;
            }
            $status = $ex instanceof ValidationException ? 422 : ($ex instanceof AuthenticationException ? 401 : ($ex instanceof HttpExceptionInterface ? $ex->getStatusCode() : ($ex instanceof UniqueConstraintViolationException ? 409 : 500)));
            $message = $ex instanceof ValidationException ? 'Please check your input.' : ($status >= 500 ? 'The service could not complete the request. Please try again.' : ($status === 409 ? 'A record with these details already exists.' : ($status === 401 ? 'Please log in.' : ($ex->getMessage() ?: 'Request failed.'))));
            $body = ['success' => false, 'message' => $message];
            if ($ex instanceof ValidationException) {
                $body['errors'] = $ex->errors();
            }

            return response()->json($body, $status, $ex instanceof HttpExceptionInterface ? $ex->getHeaders() : []);
        });
    })->create();
