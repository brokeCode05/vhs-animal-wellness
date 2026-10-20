<?php

namespace App\Http\Controllers;

use App\Models\AccessLog;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class AccessLogsController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $query = AccessLog::query()->orderByDesc('created_at');

        if ($request->filled('actor_type')) {
            $query->where('actor_type', $request->string('actor_type'));
        }

        if ($request->filled('method')) {
            $query->where('method', strtoupper($request->string('method')));
        }

        if ($request->filled('date')) {
            $query->whereDate('created_at', $request->string('date'));
        }

        if ($request->filled('status_code')) {
            $query->where('status_code', (int) $request->input('status_code'));
        }

        $items = $query
            ->limit(1000)
            ->get()
            ->map(fn (AccessLog $log) => [
                'accessId' => $log->id,
                'actorType' => $log->actor_type,
                'actorId' => $log->actor_id,
                'actorName' => $log->actor_name,
                'method' => $log->method,
                'path' => $log->path,
                'routeAction' => $log->route_action,
                'statusCode' => $log->status_code,
                'createdAt' => optional($log->created_at)->toIso8601String(),
            ]);

        return $this->ok('Access logs loaded.', ['accessLogs' => $items]);
    }
}
