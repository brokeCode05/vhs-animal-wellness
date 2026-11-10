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
        return $this->generateWithTimeout($instructions, $message, $jsonSchema, null);
    }

    public function generateWithTimeout(string $instructions, string $message, ?array $jsonSchema, ?float $remainingSeconds, bool $retryTransient = false, ?string $modelOverride = null, ?int $maxTokens = null, string $credentialScope = 'shared'): array
    {
        $key = \App\Services\AI\AiCredentials::key('gemini',$credentialScope);
        $model = trim((string) ($modelOverride ?? config('ai.model', 'gemini-3.5-flash-lite')));

        if ($key === '') {
            throw new AiProviderException('configuration');
        }
        // Only known-safe model-id characters may reach the URL path.
        if (! preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\z/D', $model)) {
        throw new AiProviderException('configuration');
        }

        $generation = [
            'maxOutputTokens' => max(64, min($maxTokens!==null ? 4096 : 2048, $maxTokens ?? (int) config('ai.max_output_tokens', 640))),
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

        $timeout = max(5, min(40, (int) config('ai.timeout', 15)));
        if ($remainingSeconds !== null) $timeout = max(0.5, min($timeout, $remainingSeconds));
        // Bounded Vetti retries share the original deadline.
        $deadlineNs = hrtime(true) + (int) ($timeout * 1_000_000_000);
        $attempt = 0;
        do {
            $attempt++;
            $attemptTimeout = max(0.001, ($deadlineNs - hrtime(true)) / 1_000_000_000);
            try {
                $response = Http::withHeaders([
                        'x-goog-api-key' => $key,
                        'Accept' => 'application/json',
                    ])
                    ->asJson()
                    ->connectTimeout(min($attemptTimeout, max(1, min(10, (int) config('ai.connect_timeout', 5)))))
                    ->timeout($attemptTimeout)
                    ->post(self::API_ORIGIN.$model.':generateContent', $payload);
            } catch (Throwable $e) {
                $timedOut = false;
                for ($cause = $e; $cause; $cause = $cause->getPrevious()) {
                    if ((int) $cause->getCode() === 28 || stripos($cause->getMessage(), 'timed out') !== false) {
                        $timedOut = true;
                        break;
                    }
                }
                throw new AiProviderException($timedOut ? 'timeout' : 'transport');
            }
            $timeLeft = ($deadlineNs - hrtime(true)) / 1_000_000_000;
            if (! $retryTransient || $attempt >= 3 || $response->status() !== 503 || $timeLeft < 3.0) {
                break;
            }
            // Bounded exponential backoff with jitter; no request content is logged.
            usleep($attempt === 1 ? random_int(300000, 500000) : random_int(600000, 1000000));
        } while (true);

        if (! $response->successful()) {
            $status = $response->status();
            throw new AiProviderException($status === 429 ? 'rate_limit' : 'http_error', $status, ['http_requests'=>$attempt]+($status===429 ? \App\Services\AI\ScribeProviderCooldown::metadata($response) : []));
        }

        $body = $response->json();
        $parts = data_get($body, 'candidates.0.content.parts');
        $text = '';
        if (is_array($parts)) {
            foreach ($parts as $part) {
                if (is_array($part) && empty($part['thought']) && is_string($part['text'] ?? null)) {
                    $text .= $part['text'];
                }
            }
        }
        $finishReason=data_get($body,'candidates.0.finishReason');
        $finishReason=in_array($finishReason,['STOP','MAX_TOKENS','SAFETY','RECITATION','OTHER'],true) ? $finishReason : 'unknown';
        $usage = [
            'prompt_tokens'=>data_get($body,'usageMetadata.promptTokenCount'),
            'output_tokens'=>data_get($body,'usageMetadata.candidatesTokenCount'),
            'thinking_tokens'=>data_get($body,'usageMetadata.thoughtsTokenCount'),
            'total_tokens'=>data_get($body,'usageMetadata.totalTokenCount'),
        ];
        $metadata=['finish_reason'=>$finishReason,'usage'=>$usage,'http_requests'=>$attempt];
        if (in_array($finishReason,['SAFETY','RECITATION'],true)) throw new AiProviderException('safety_refusal',null,$metadata);
        if ($finishReason==='MAX_TOKENS') throw new AiProviderException('incomplete_response',null,$metadata);
        if (trim($text) === '') {
            $blocked = data_get($body, 'promptFeedback.blockReason')
                || in_array(data_get($body, 'candidates.0.finishReason'), ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'], true);
            throw new AiProviderException($blocked ? 'safety_refusal' : 'empty_response',null,$metadata);
        }
        return [
            'http_requests'=>$attempt,
            'finish_reason' => $finishReason,
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
