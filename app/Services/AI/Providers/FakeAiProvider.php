<?php

namespace App\Services\AI\Providers;

use App\Services\AI\AiProviderException;
use App\Services\AI\AiProviderInterface;

final class FakeAiProvider implements AiProviderInterface
{
    public int $calls = 0;

    public function __construct(
        private readonly string $response = 'This is a fake development response. No Gemini call was made.',
        private readonly bool $fail = false,
    ) {
    }

    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
    {
        $this->calls++;

        if ($this->fail) {
            throw new AiProviderException('Simulated provider outage.');
        }

        return ['text' => $this->response, 'usage' => ['prompt_tokens' => 0, 'output_tokens' => 0]];
    }
}
