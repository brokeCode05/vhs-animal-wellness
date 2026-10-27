<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\BookingIntentService;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

final class BookingIntentController extends Controller
{
    use ApiResponse;

    public function interpret(Request $request, BookingIntentService $booking)
    {
        $input = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:450'],
        ]);

        // Caller is authenticated and User-only by routes/web.php.
        // No user/pet identifiers or client-supplied context is accepted.
        return $this->ok('Booking preferences ready; no booking created.',
            $booking->interpret($input['message']));
    }
}
