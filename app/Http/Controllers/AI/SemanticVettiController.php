<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\SemanticVettiService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

final class SemanticVettiController extends Controller
{
    use ApiResponse;

    public function interpret(Request $request, SemanticVettiService $semantic)
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:450'],
            'conversation_id' => ['required', 'string', 'regex:/\A[a-zA-Z0-9_-]{8,64}\z/'],
        ]);
        return $this->ok('Read-only semantic interpretation ready.',
            $semantic->interpret($request, $request->user(), $data['message'], $data['conversation_id']));
    }
}
