<?php

namespace App\Support;

trait ApiResponse
{
    protected function ok(string $message, mixed $data = null, int $status = 200)
    {
        return response()->json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }
}
