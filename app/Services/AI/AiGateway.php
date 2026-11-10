<?php

namespace App\Services\AI;

use JsonException;
use App\Services\AI\Providers\GeminiProvider;
use Throwable;

/**
 * Shared provider boundary. No endpoint is registered by Phase 1.
 * Controllers introduced in later phases must authorize and sanitize FIRST.
 */
final class AiGateway
{
    private ?int $deadlineNs = null;
    private array $semanticCalls = [];
    private array $providerAttempts = [];
    private $scribeDiagnostics = null;
    private bool $scribeDispatch = false;

    public function startSemanticDeadline(float $seconds): void
    {
        $this->deadlineNs = hrtime(true) + (int) ($seconds * 1_000_000_000);
        $this->semanticCalls = [];
    }

    /** One shared budget for the initial SOAP request and any source recovery. */
    public function startScribeDeadline(float $seconds): void
    {
        $this->deadlineNs = hrtime(true) + (int) ($seconds * 1_000_000_000);
    }

    public function clearSemanticDeadline(): void { $this->deadlineNs = null; }
    public function semanticCallDiagnostics(): array { return $this->semanticCalls; }
    /** Timing and failure categories only; no clinical input or provider body. */
    public function providerAttemptDiagnostics(): array { return $this->providerAttempts; }

    private const TASKS = [
        'public_vetti', 'user_vetti', 'booking_intent', 'scribe', 'scheduling_intent', 'semantic_vetti',
    ];

    private const DATA_CLASSES = ['public', 'sanitized', 'personal', 'clinical'];

    public function __construct(private readonly AiProviderInterface $provider, ?callable $scribeDiagnostics = null)
    {
        $this->scribeDiagnostics = $scribeDiagnostics;
    }

    /** @return array{ok:bool,source:string,text:string,data:mixed,error_code:?string,usage:array} */
    public function text(string $task, string $message, string $instructions, string $dataClass, bool $allowScribeBackup = false, ?string $groqReasoningEffort = null): array
    {
        if (in_array($task, ['public_vetti', 'user_vetti', 'semantic_vetti'], true)) {
            // Shared by both providers, including every conversational response path.
            $instructions .= ' Vetti is the friendly puppy mascot: warm and approachable, not a formal receptionist or a baby. Talk like a helpful companion using simple words and contractions, usually 1-3 short sentences. Ask naturally for the next missing detail; avoid bureaucratic wording. Use only English, Filipino, or Taglish. Match the message or explicit translation request; briefly explain unsupported languages. Introduce yourself only when asked or greeting. Avoid repetitive greetings, apologies, closing offers, slang, barks and pet puns. Use gentle puppy warmth in casual chat; keep errors and urgent concerns calm and clear. Never invent facts or soften limitations. No unsolicited prices or details.';
        }
        return $this->dispatchMeasured($task, $message, $instructions, $dataClass, null, $allowScribeBackup, false, $groqReasoningEffort);
    }

    /** @return array{ok:bool,source:string,text:string,data:mixed,error_code:?string,usage:array} */
    public function structured(
        string $task,
        string $message,
        string $instructions,
        string $dataClass,
        array $schema,
        bool $allowScribeBackup = false,
        bool $allowLongScribe = false,
    ): array {
        return $this->dispatchMeasured($task, $message, $instructions, $dataClass, $schema, $allowScribeBackup, $allowLongScribe);
    }

    private function dispatchMeasured(string $task, string $message, string $instructions, string $dataClass, ?array $schema, bool $allowScribeBackup = false, bool $allowLongScribe = false, ?string $groqReasoningEffort = null): array
    {
        $start = hrtime(true);
        $this->providerAttempts = [];
        $this->scribeDispatch = $task==='scribe';
        $result = $this->dispatch($task, $message, $instructions, $dataClass, $schema, $allowScribeBackup, $allowLongScribe, $groqReasoningEffort);
        if ($task === 'scribe' && (is_callable($this->scribeDiagnostics) || (bool) config('ai.diagnostics_enabled', false))) {
            $stages = ['ScribeFactInventory','ScribeGroundedSummary','ScribeClaimAudit','ScribeMeaningReview','ScribeUncertainPlacement','ScribeSinglePassDraft','ScribeSinglePassReview','ScribeCorrectionReview','DoctorScribeService'];
            $stage = 'other';
            foreach (debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 8) as $frame) {
                $class = $frame['class'] ?? '';
                $name = substr($class, strrpos($class, chr(92)) + 1);
                if (in_array($name, $stages, true)) { $stage = ($name === 'DoctorScribeService' && ($frame['function'] ?? '') === 'suggestPunctuation') ? 'ScribePunctuation' : $name; break; }
            }
            // Fixed labels, durations and bounded provider token counts only.
            // Never retain input, draft, source text or provider response bodies.
            $event = [
                'stage' => $stage,
                'duration_ms' => (int) round((hrtime(true) - $start) / 1_000_000),
                'category' => ($result['ok'] ?? false) ? 'ok' : ($result['provider_failure'] ?? $result['error_code'] ?? 'unknown'),
                'provider_attempts' => $this->providerAttempts,
            ];
            if (is_callable($this->scribeDiagnostics)) ($this->scribeDiagnostics)($event);
            if ((bool) config('ai.diagnostics_enabled', false)) \Illuminate\Support\Facades\Log::info('AI scribe stage', $event);
        }
        if (in_array($task, ['semantic_vetti', 'public_vetti'], true)) {
            $this->semanticCalls[] = [
                'stage' => $schema === null ? 'response' : 'interpretation',
                'duration_ms' => (int) round((hrtime(true) - $start) / 1_000_000),
                'category' => ($result['ok'] ?? false) ? 'ok' : ($result['provider_failure'] ?? $result['error_code'] ?? 'unknown'),
                'http_status' => $result['provider_http_status'] ?? null,
                'backup_used' => in_array('groq', array_column($this->providerAttempts, 'provider'), true),
                'provider_attempts' => $this->providerAttempts,
            ];
        }
        return $result;
    }

    private function dispatch(
        string $task,
        string $message,
        string $instructions,
        string $dataClass,
        ?array $schema,
        bool $allowScribeBackup = false,
        bool $allowLongScribe = false,
        ?string $groqReasoningEffort = null,
    ): array {
        // Do not allow unrecognized/unauthorized actions to become a Gemini call.
        if (! in_array($task, self::TASKS, true) || ! in_array($dataClass, self::DATA_CLASSES, true)) {
            return $this->fallback('unsupported');
        }
        if ($groqReasoningEffort !== null && ($task !== 'scribe' || $dataClass !== 'clinical' || $schema !== null || !in_array($groqReasoningEffort, ['low','medium','high'], true))) return $this->fallback('invalid_input');
        $longAllowed=$allowLongScribe && $task==='scribe' && $dataClass==='clinical' && (bool)config('ai.scribe_single_pass_enabled',false);
        if ($allowLongScribe && !$longAllowed) return $this->fallback('disabled');
        $inputLimit=$longAllowed ? 160000 : ($task === 'scribe' ? (int) config('ai.scribe_max_input_bytes',10000) : (int) config('ai.max_input_bytes',4000));
        if ($message === '' || trim($message) === '' || trim($instructions) === ''
            || strlen($message) > ($longAllowed ? $inputLimit : max(200, min(16000, $inputLimit)))
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
        $backupUsed = false;
        try {
            $remaining = (in_array($task, ['semantic_vetti', 'public_vetti'], true) || ($task === 'scribe' && $allowScribeBackup)) && $this->deadlineNs !== null
                ? ($this->deadlineNs - hrtime(true)) / 1_000_000_000 : null;
            if ($remaining !== null && $remaining < 0.5) {
                $fallback = $this->fallback('provider_unavailable');
                $fallback['provider_failure'] = 'deadline';
                $fallback['execution'] = $this->executionMetadata(false);
                return $fallback;
            }
            $vettiTask = in_array($task, ['semantic_vetti', 'public_vetti'], true);
            $backupAuthorized = ($task === 'public_vetti' && in_array($dataClass, ['public','sanitized'], true)
                    && (bool) config('ai.groq_public_backup_enabled', false))
                || ($task === 'semantic_vetti' && $dataClass === 'sanitized'
                    && (bool) config('ai.groq_user_backup_enabled', false)
                    && (bool) config('ai.semantic_privacy_cleared', false)
                    && (bool) config('ai.paid_data_approved', false));
            $scribeBackup = $task === 'scribe' && $dataClass === 'clinical' && $allowScribeBackup
                && (bool) config('ai.groq_scribe_backup_enabled', false)
                && (bool) config('ai.clinical_enabled', false) && (bool) config('ai.clinical_clearance', false)
                && (bool) config('ai.paid_data_approved', false);
            $backupAuthorized = $backupAuthorized || $scribeBackup;
            $vettiGroqTokens = max(1024, min(2048, (int) config('ai.vetti_groq_max_output_tokens', 2048)));
            $useBackup = $backupAuthorized && $this->provider instanceof GeminiProvider
                && $remaining !== null && $remaining >= 5.0;
            try {
                // Give Vetti's primary request enough time to finish before failover.
                // Live audit: the old four-second cap timed out healthy responses
                // and spent the backup quota instead. Keep the original shared
                // deadline and reserve at least four seconds for the backup.
                $vettiPrimaryBudget = max(4.0, min(10.0, (float) config('ai.vetti_primary_timeout', 10)));
                $primaryBudget = $useBackup ? min($scribeBackup ? 12.0 : $vettiPrimaryBudget, $remaining - 4.0) : $remaining;
                $credentialScope=AiCredentials::scopeForTask($task);
                $specialGroq=$longAllowed || $groqReasoningEffort!==null || $vettiTask;
                $result = $this->measureProvider($this->provider instanceof GeminiProvider ? 'gemini' : ($this->provider instanceof \App\Services\AI\Providers\GroqProvider ? 'groq' : 'configured'), fn () =>
                    $this->provider instanceof GeminiProvider
                        ? $this->provider->generateWithTimeout($instructions,$message,$schema,$primaryBudget,
                            $vettiTask && $remaining!==null && !$useBackup,
                            ($vettiTask || ($task==='scribe' && $allowScribeBackup))?config($task==='scribe'?'ai.model':'ai.vetti_model'):null,
                            $task==='scribe' && $allowScribeBackup?($longAllowed?4096:2048):null,$credentialScope)
                        : ($this->provider instanceof \App\Services\AI\Providers\GroqProvider
                            ? $this->provider->generateWithTimeout($instructions,$message,$schema,$specialGroq?min(12.0,$remaining ?? 12.0):8.0,
                                $specialGroq?($longAllowed?4096:($vettiTask?$vettiGroqTokens:2048)):null,$groqReasoningEffort,$credentialScope)
                            : $this->provider->generate($instructions,$message,$schema)));
                if ($schema !== null) {
                    try { $candidate = json_decode((string) ($result['text'] ?? ''), false, 512, JSON_THROW_ON_ERROR); }
                    catch (JsonException) { throw new AiProviderException('invalid_json'); }
                    if (!SchemaValidator::matches($schema, $candidate)) throw new AiProviderException('invalid_schema');
                }
            } catch (AiProviderException $primaryFailure) {
                if (in_array($primaryFailure->category, ['invalid_json','invalid_schema'], true)) $this->markLastAttempt($primaryFailure->category);
                if (in_array($primaryFailure->category, ['invalid_json','invalid_schema'], true) && !$useBackup) return $this->fallback($primaryFailure->category);
                $retryable = in_array($primaryFailure->category, ['timeout','transport','rate_limit','invalid_json','invalid_schema','empty_response','incomplete_response'], true)
                    || ($primaryFailure->category === 'http_error' && in_array($primaryFailure->httpStatus, [502,503,504], true));
                $backupBudget = $this->deadlineNs === null ? 0 : ($this->deadlineNs - hrtime(true)) / 1_000_000_000;
                if (!$useBackup || !$retryable || $backupBudget < 1.0) throw $primaryFailure;
                $backupUsed = true;
                $result = $this->measureProvider('groq', fn () => app(\App\Services\AI\Providers\GroqProvider::class)->generateWithTimeout(
                    $instructions, $message, $schema, min(12.0, $backupBudget), $scribeBackup ? ($longAllowed ? 4096 : 2048) : ($vettiTask ? $vettiGroqTokens : null), $groqReasoningEffort,$credentialScope));
            }
            $text = trim((string) ($result['text'] ?? ''));
            if ($text === '') {
                $this->markLastAttempt('empty_response');
                return $this->fallback('empty_response');
            }
            $data = null;
            if ($schema !== null) {
                $parsed = json_decode($text, false, 512, JSON_THROW_ON_ERROR);
                if (! SchemaValidator::matches($schema, $parsed)) {
                    $this->markLastAttempt('invalid_schema');
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
                'execution' => $this->executionMetadata(true) + ['public_backup_used' => $backupUsed && !$scribeBackup, 'scribe_backup_used' => $backupUsed && $scribeBackup],
            ];
        } catch (JsonException) {
            $this->markLastAttempt('invalid_json');
            return $this->fallback('invalid_json');
        } catch (AiProviderException $e) {
            $category = in_array($e->category, ['configuration','timeout','transport','rate_limit','http_error','safety_refusal','empty_response','incomplete_response'], true)
                ? $e->category : 'unknown';
            if ((bool) config('ai.diagnostics_enabled', false)) {
                \Illuminate\Support\Facades\Log::notice('AI provider failure', [
                    'task' => $task, 'category' => $category, 'http_status' => $e->httpStatus,
                ]);
            }
            $fallback = $this->fallback('provider_unavailable');
            $fallback['provider_failure'] = $category;
            $fallback['execution']['public_backup_used'] = $backupUsed && !$scribeBackup;
            $fallback['execution']['scribe_backup_used'] = $backupUsed && $scribeBackup;
            foreach (['retry_after_seconds','limit_kind'] as $key) if (isset($e->metadata[$key])) $fallback[$key]=$key==='retry_after_seconds' ? max(1,min(86400,(int)$e->metadata[$key])) : (in_array($e->metadata[$key],['daily','per_minute','tokens_per_day','tokens_per_minute','requests_per_day','requests_per_minute','unspecified'],true) ? $e->metadata[$key] : 'unspecified');
            $fallback['provider_http_status'] = is_int($e->httpStatus) && $e->httpStatus >= 100 && $e->httpStatus <= 599 ? $e->httpStatus : null;
            return $fallback;
        } catch (Throwable) {
            // Never leak raw provider exceptions, prompt text, or personal data.
            return $this->fallback('provider_unavailable');
        }
    }

    /** Record only bounded timing and error metadata; never input or output. */
    private function measureProvider(string $provider, callable $operation): array
    {
        $start = hrtime(true);
        $category = 'ok'; $status = null;
        $finishReason=null; $safeUsage=[]; $httpRequests=null;
        try {
            if ($this->scribeDispatch && in_array($provider,['gemini','groq'],true) && ($wait=ScribeProviderCooldown::remaining($provider))>0) {
                throw new AiProviderException('rate_limit',429,['retry_after_seconds'=>$wait,'http_requests'=>0]);
            }
            $result=$operation();
            if (($result['finish_reason']??null)==='MAX_TOKENS') throw new AiProviderException('incomplete_response',null,$result);

            $httpRequests=is_int($result['http_requests']??null) ? max(0,min(3,$result['http_requests'])) : null;
            foreach (['prompt_tokens','output_tokens','thinking_tokens','total_tokens'] as $key) {
                $value=$result['usage'][$key]??null;
                if (is_numeric($value) && (float)$value >= 0 && (float)$value <= 10000000 && floor((float)$value)===(float)$value) $safeUsage[$key]=(int)$value;
            }
            $candidate=$result['finish_reason']??null;
            if (in_array($candidate,['STOP','MAX_TOKENS','SAFETY','RECITATION','OTHER','unknown'],true)) $finishReason=$candidate;
            return $result;
        }
        catch (AiProviderException $error) {
            $category = in_array($error->category, ['configuration','timeout','transport','rate_limit','http_error','safety_refusal','empty_response','incomplete_response','invalid_json','invalid_schema'], true) ? $error->category : 'unknown';
            $httpRequests=is_int($error->metadata['http_requests']??null) ? max(0,min(3,$error->metadata['http_requests'])) : null;
            foreach (['prompt_tokens','output_tokens','thinking_tokens','total_tokens'] as $key) {
                $value=$error->metadata['usage'][$key]??null;
                if (is_numeric($value) && (float)$value>=0 && (float)$value<=10000000 && floor((float)$value)===(float)$value) $safeUsage[$key]=(int)$value;
            }
            $candidate=$error->metadata['finish_reason']??null;
            if (in_array($candidate,['STOP','MAX_TOKENS','SAFETY','RECITATION','OTHER','unknown'],true)) $finishReason=$candidate;
            if ($this->scribeDispatch && $error->category==='rate_limit' && in_array($provider,['gemini','groq'],true)) ScribeProviderCooldown::record($provider,$error->metadata);
            $status = is_int($error->httpStatus) && $error->httpStatus >= 100 && $error->httpStatus <= 599 ? $error->httpStatus : null;
            throw $error;
        } catch (Throwable $error) { $category = 'unknown'; throw $error; }
        finally {
            $attempt = ['provider'=>$provider,'duration_ms'=>(int) round((hrtime(true)-$start)/1_000_000),
                'category'=>$category,'http_status'=>$status,'finish_reason'=>$finishReason,'usage'=>$safeUsage,'http_requests'=>$httpRequests];
            $this->providerAttempts[] = $attempt;
            // Opt-in metadata only: no transcript, provider body, or credentials.
            if ((bool) config('ai.diagnostics_enabled', false)) \Illuminate\Support\Facades\Log::notice('AI provider attempt', $attempt);
        }
    }

    private function markLastAttempt(string $category): void
    {
        $index = array_key_last($this->providerAttempts);
        if ($index !== null) $this->providerAttempts[$index]['category'] = $category;
    }

    /**
     * Internal provenance only. 'gemini_adapter_invoked' is NOT proof of a
     * completed Google HTTP request (a configuration/transport error can occur).
     * Never include prompts, provider responses, keys, or personal identifiers.
     */
    private function executionMetadata(bool $attempted): array
    {
        return [
            'provider_invoked' => $attempted,
            'gemini_adapter_invoked' => $attempted && $this->provider instanceof GeminiProvider,
        ];
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
            'execution' => $this->executionMetadata($code === 'provider_unavailable' || in_array($code, ['invalid_json', 'invalid_schema', 'empty_response','incomplete_response'], true)),
        ];
    }
}
