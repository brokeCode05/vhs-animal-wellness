<?php

namespace App\Http\Middleware;

use App\Models\AccessLog;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class RecordUserAccess
{
    /**
     * Request-level REQ035 access trail.
     *
     * This intentionally stores metadata only. Request bodies, passwords,
     * OTPs, medical text and other sensitive field values are never copied
     * into the access log.
     */
    public function handle(Request $request, Closure $next): Response
    {
        /** @var User|null $actor */
        $actor = $request->user();

        if (! $actor || $this->excluded($request)) {
            return $next($request);
        }

        $snapshot = [
            'actor_type' => $actor->role,
            'actor_id' => $actor->id,
            'actor_name' => $actor->name,
            'method' => strtoupper($request->method()),
            'path' => '/'.ltrim($request->path(), '/'),
            'route_action' => $request->route()?->getActionName(),
        ];

        try {
            $response = $next($request);
            $this->write($snapshot, $response->getStatusCode());

            return $response;
        } catch (Throwable $e) {
            $status = $e instanceof HttpExceptionInterface
                ? $e->getStatusCode()
                : 500;

            // Keep access logging best-effort. Logging must never hide the
            // original application error.
            $this->write($snapshot, $status);

            throw $e;
        }
    }

    private function excluded(Request $request): bool
    {
        // Avoid a self-generating loop when an Admin opens the log viewers.
        return in_array($request->path(), [
            'api/audit-logs',
            'api/access-logs',
        ], true);
    }

    private function write(array $snapshot, int $status): void
    {
        try {
            $log = new AccessLog;
            $log->forceFill($snapshot + ['status_code' => $status])->save();
        } catch (Throwable $e) {
            // Audit/access logging is deliberately non-disruptive. Existing
            // application workflows must not fail only because logging failed.
            report($e);
        }
    }
}
