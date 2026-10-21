<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\UserVettiFacts;
use App\Services\AI\UserVettiService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class UserVettiController extends Controller
{
    use ApiResponse;

    public function reply(Request $request, UserVettiService $vetti, UserVettiFacts $facts)
    {
        $input = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:450'],
            'responseLanguage' => ['sometimes', 'string', Rule::in(['en', 'taglish'])],
            'pet_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);
        $user = $request->user();
        // No client-supplied identity, pet metadata, conversation history or
        // AI context is trusted. Even unrelated questions cannot probe pet IDs.
        $petId = isset($input['pet_id']) ? (int) $input['pet_id'] : null;
        abort_unless($petId === null || $facts->ownsPet($user, $petId), 403, 'Access denied.');

        return $this->ok('User Vetti response ready.', $vetti->reply(
            $user, $input['message'], $input['responseLanguage'] ?? 'en', $petId,
        ));
    }
}
