<?php

namespace App\Services\AI\Providers;

use App\Services\AI\AiProviderException;
use App\Services\AI\AiProviderInterface;
use Illuminate\Support\Facades\Http;
use Throwable;

final class GeminiProvider implements AiProviderInterface
{
    private const API_ORIGIN = 'https://generativelanguage.googleapis.com/v1beta/models/';

    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
    {
        $key = trim((string) config('ai.api_key', ''));
        $model = trim((string) config('ai.model', 'gemini-3.5-flash-lite'));

        if ($key === '') {
            throw new AiProviderException('configuration');
        }
        // Only known-safe model-id characters may reach the URL path.
        if (! preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\z/D', $model)) {
        throw new AiProviderException('configuration');
        }

        $generation = [
            'maxOutputTokens' => max(64, min(2048, (int) config('ai.max_output_tokens', 640))),
            'temperature' => 0.2,
        ];
        if ($jsonSchema !== null) {
            $generation['responseMimeType'] = 'application/json';
            $generation['responseJsonSchema'] = $jsonSchema;
        }
        $payload = [
            'systemInstruction' => ['parts' => [['text' => $instructions]]],
            'contents' => [['role' => 'user', 'parts' => [['text' => $message]]]],
            'generationConfig' => $generation,
        ];

        try {
            $response = Http::withHeaders([
                    'x-goog-api-key' => $key,
                    'Accept' => 'application/json',
                ])
                ->asJson()
                ->connectTimeout(max(1, min(10, (int) config('ai.connect_timeout', 5))))
                ->timeout(max(5, min(40, (int) config('ai.timeout', 15))))
                ->post(self::API_ORIGIN.$model.':generateContent', $payload);
        } catch (Throwable $e) {
            // Inspect only for timeout classification; never log exception text.
            $timeout = false;
            for ($cause = $e; $cause; $cause = $cause->getPrevious()) {
                if ((int) $cause->getCode() === 28 || stripos($cause->getMessage(), 'timed out') !== false) {
                    $timeout = true;
                    break;
                }
            }
            throw new AiProviderException($timeout ? 'timeout' : 'transport');
        }

        if (! $response->successful()) {
            $status = $response->status();
            throw new AiProviderException($status === 429 ? 'rate_limit' : 'http_error', $status);
        }

        $body = $response->json();
        $parts = data_get($body, 'candidates.0.content.parts');
        $text = '';
        if (is_array($parts)) {
            foreach ($parts as $part) {
                if (is_array($part) && is_string($part['text'] ?? null)) {
                    $text .= $part['text'];
                }
            }
        }
        if (trim($text) === '') {
            $blocked = data_get($body, 'promptFeedback.blockReason')
                || in_array(data_get($body, 'candidates.0.finishReason'), ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'], true);
            throw new AiProviderException($blocked ? 'safety_refusal' : 'empty_response');
        }

        return [
            'text' => trim($text),
            'usage' => [
                'prompt_tokens' => is_numeric(data_get($body, 'usageMetadata.promptTokenCount'))
                    ? (int) data_get($body, 'usageMetadata.promptTokenCount') : null,
                'output_tokens' => is_numeric(data_get($body, 'usageMetadata.candidatesTokenCount'))
                    ? (int) data_get($body, 'usageMetadata.candidatesTokenCount') : null,
                'thinking_tokens' => is_numeric(data_get($body, 'usageMetadata.thoughtsTokenCount'))
                    ? (int) data_get($body, 'usageMetadata.thoughtsTokenCount') : null,
                'total_tokens' => is_numeric(data_get($body, 'usageMetadata.totalTokenCount'))
                    ? (int) data_get($body, 'usageMetadata.totalTokenCount') : null,
            ],
        ];
    }
}
