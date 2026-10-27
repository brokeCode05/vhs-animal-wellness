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
            throw new AiProviderException('Gemini provider is not configured.');
        }
        // Only known-safe model-id characters may reach the URL path.
        if (! preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\z/D', $model)) {
        throw new AiProviderException('Invalid Gemini model configuration.');
        }

        $generation = [
            'maxOutputTokens' => max(64, min(2048, (int) config('ai.max_output_tokens', 640))),
            'temperature' => 0.2,
        ];
        if ($jsonSchema !== null) {
        $generation['responseFormat'] = [
        'text' => [
            'mimeType' => 'APPLICATION_JSON',
            'schema' => $jsonSchema,
            ],
            ];
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
        } catch (Throwable) {
            // Never return provider exception details; these can contain payloads.
            throw new AiProviderException('Gemini request failed.');
        }

        if (! $response->successful()) {
            // Do not log provider response bodies: they can contain private data.
            throw new AiProviderException('Gemini was unavailable.');
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
            throw new AiProviderException('Gemini returned no usable text.');
        }

        return [
            'text' => trim($text),
            'usage' => [
                'prompt_tokens' => is_numeric(data_get($body, 'usageMetadata.promptTokenCount'))
                    ? (int) data_get($body, 'usageMetadata.promptTokenCount') : null,
                'output_tokens' => is_numeric(data_get($body, 'usageMetadata.candidatesTokenCount'))
                    ? (int) data_get($body, 'usageMetadata.candidatesTokenCount') : null,
            ],
        ];
    }
}
