<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\SemanticVettiService;
use App\Services\AI\ServiceLookupService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

final class ServiceLookupController extends Controller
{
    use ApiResponse;

    public function lookup(Request $request, ServiceLookupService $service)
    {
        $data = $request->validate(['message'=>['required','string','max:140']]);
        if (!SemanticVettiService::enabled() || !config('ai.service_lookup_enabled', false)) {
            return $this->ok('Service lookup disabled.', ['kind'=>'declined']);
        }
        return $this->ok('Service lookup completed.', $service->lookup($request->user(), $data['message']));
    }
}
