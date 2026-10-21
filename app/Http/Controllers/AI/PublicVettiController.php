<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\PublicVettiService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

final class PublicVettiController extends Controller
{
    use ApiResponse;

    public function reply(Request $request, PublicVettiService $vetti)
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:450'],
        ]);

        // Strict public scope. Do not accept user IDs, pet IDs, conversation
        // history, or browser-supplied clinic facts as provider context.
        return $this->ok('Public Vetti response ready.', $vetti->reply($validated['message']));
    }
}
