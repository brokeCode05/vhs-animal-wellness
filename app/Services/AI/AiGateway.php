<?php

namespace App\Services\AI;

use JsonException;
use Throwable;

/**
 * Shared provider boundary. No endpoint is registered by Phase 1.
 * Controllers introduced in later phases must authorize and sanitize FIRST.
 */
final class AiGateway
{
    private const TASKS = [
        'public_vetti', 'user_vetti', 'booking_intent', 'scribe', 'scheduling_intent', 'semantic_vetti',
    ];

    private const DATA_CLASSES = ['public', 'sanitized', 'personal', 'clinical'];

    public function __construct(private readonly AiProviderInterface $provider)
    {
    }

    /** @return array{ok:bool,source:string,text:string,data:mixed,error_code:?string,usage:array} */
    public function text(string $task, string $message, string $instructions, string $dataClass): array
    {
        return $this->dispatch($task, $message, $instructions, $dataClass, null);
    }

    /** @return array{ok:bool,source:string,text:string,data:mixed,error_code:?string,usage:array} */
    public function structured(
        string $task,
        string $message,
        string $instructions,
        string $dataClass,
        array $schema,
    ): array {
        return $this->dispatch($task, $message, $instructions, $dataClass, $schema);
    }

    private function dispatch(
        string $task,
        string $message,
        string $instructions,
        string $dataClass,
        ?array $schema,
    ): array {
        // Do not allow unrecognized/unauthorized actions to become a Gemini call.
        if (! in_array($task, self::TASKS, true) || ! in_array($dataClass, self::DATA_CLASSES, true)) {
            return $this->fallback('unsupported');
        }
        if ($message === '' || trim($message) === '' || trim($instructions) === ''
            || strlen($message) > max(200, min(16000, (int) config('ai.max_input_bytes', 4000)))
            || strlen($instructions) > 4000
            || ($schema !== null && (strlen(json_encode($schema) ?: '') > 12000))) {
            return $this->fallback('invalid_input');
        }
        if (! (bool) config('ai.enabled', false)) {
            return $this->fallback('disabled');
        }
        if ($task === 'scribe' || $dataClass === 'clinical') {
            if (! (bool) config('ai.clinical_enabled', false)
                || ! (bool) config('ai.clinical_clearance', false)) {
                return $this->fallback('clinical_blocked');
            }
        }
        if (in_array($dataClass, ['personal', 'clinical'], true)
            && ! (bool) config('ai.paid_data_approved', false)) {
            return $this->fallback('privacy_blocked');
        }
        try {
            $result = $this->provider->generate($instructions, $message, $schema);
            $text = trim((string) ($result['text'] ?? ''));
            if ($text === '') {
                return $this->fallback('empty_response');
            }
            $data = null;
            if ($schema !== null) {
                $parsed = json_decode($text, false, 512, JSON_THROW_ON_ERROR);
                if (! SchemaValidator::matches($schema, $parsed)) {
                    return $this->fallback('invalid_schema');
                }
                $data = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
            }
            return [
                'ok' => true,
                'source' => 'ai',
                'text' => $text,
                'data' => $data,
                'error_code' => null,
                'usage' => is_array($result['usage'] ?? null) ? $result['usage'] : [],
            ];
        } catch (JsonException) {
            return $this->fallback('invalid_json');
        } catch (AiProviderException $e) {
            $category = in_array($e->category, ['configuration','timeout','transport','rate_limit','http_error','safety_refusal','empty_response'], true)
                ? $e->category : 'unknown';
            if ((bool) config('ai.diagnostics_enabled', false)) {
                \Illuminate\Support\Facades\Log::notice('AI provider failure', [
                    'task' => $task, 'category' => $category, 'http_status' => $e->httpStatus,
                ]);
            }
            $fallback = $this->fallback('provider_unavailable');
            $fallback['provider_failure'] = $category;
            return $fallback;
        } catch (Throwable) {
            // Never leak raw provider exceptions, prompt text, or personal data.
            return $this->fallback('provider_unavailable');
        }
    }

    private function fallback(string $code): array
    {
        return [
            'ok' => false,
            'source' => 'fallback',
            'text' => 'The AI assistant is currently unavailable. Please use the normal clinic workflow.',
            'data' => null,
            'error_code' => $code,
            'usage' => [],
        ];
    }
}
