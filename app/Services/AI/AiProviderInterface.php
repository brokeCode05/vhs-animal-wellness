<?php

namespace App\Services\AI;

interface AiProviderInterface
{
    /**
     * One provider call. No retries, no database actions, and no secrets in output.
     * @return array{text: string, usage: array<string, int|null>}
     */
    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array;
}
