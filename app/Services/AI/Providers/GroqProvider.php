<?php

namespace App\Services\AI\Providers;

use App\Services\AI\AiProviderException;
use App\Services\AI\AiProviderInterface;
use Illuminate\Support\Facades\Http;
use Throwable;

/** Public information only: callers enforce the data and task boundary. */
final class GroqProvider implements AiProviderInterface
{
    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
    {
        return $this->generateWithTimeout($instructions, $message, $jsonSchema, 8.0);
    }

    public function generateWithTimeout(string $instructions, string $message, ?array $jsonSchema, float $seconds, ?int $maxTokens = null, ?string $reasoningEffort = null, string $credentialScope = 'shared'): array
    {
        $key=\App\Services\AI\AiCredentials::key('groq',$credentialScope);
        $model=trim((string) config('ai.groq_model', 'openai/gpt-oss-20b'));
        if ($key === '' || !preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,99}\z/D', $model)) throw new AiProviderException('configuration');
        $payload=['model'=>$model, 'temperature'=>0.2,
            'max_completion_tokens'=>max(64,min($maxTokens === null ? 2048 : 4096,$maxTokens ?? (int)config('ai.max_output_tokens',640))),
            'messages'=>[['role'=>'system','content'=>$instructions],['role'=>'user','content'=>$message]]];
        // Only the punctuation-only path requests an effort override. Other
        // providers/models retain their default behavior and SOAP settings.
        if ($reasoningEffort !== null && in_array($reasoningEffort,['low','medium','high'],true)
            && in_array($model,['openai/gpt-oss-20b','openai/gpt-oss-120b'],true)) $payload['reasoning_effort']=$reasoningEffort;
        if ($jsonSchema !== null) $payload['response_format']=['type'=>'json_schema','json_schema'=>[
            'name'=>'vetti_interpretation','strict'=>false,'schema'=>$jsonSchema]];
        $deadline=hrtime(true)+(int)($seconds*1_000_000_000);
        $reportedUsage=[];$httpRequests=0;
        for ($attempt=0; $attempt<2; $attempt++) {
            $remaining=($deadline-hrtime(true))/1_000_000_000;
            if ($remaining<0.5) throw new AiProviderException('timeout');
            try {
                $response=Http::withToken($key)->acceptJson()->asJson()
                    ->connectTimeout(min(5,$remaining))->timeout($remaining)
                    ->post('https://api.groq.com/openai/v1/chat/completions',$payload);
            } catch (Throwable $e) {
                $timeout=false;
                for($cause=$e;$cause;$cause=$cause->getPrevious()) {
                    if((int)$cause->getCode()===28 || stripos($cause->getMessage(),'timed out')!==false) { $timeout=true; break; }
                }
                throw new AiProviderException($timeout ? 'timeout' : 'transport',null,['usage'=>$reportedUsage,'http_requests'=>$httpRequests+1]);
            }
            $httpRequests++;
            foreach (['prompt_tokens'=>'usage.prompt_tokens','output_tokens'=>'usage.completion_tokens','thinking_tokens'=>'usage.completion_tokens_details.reasoning_tokens','total_tokens'=>'usage.total_tokens'] as $name=>$path) {
                $value=$response->json($path);
                if (is_numeric($value) && (float)$value>=0 && (float)$value<=10000000 && floor((float)$value)===(float)$value) $reportedUsage[$name]=($reportedUsage[$name]??0)+(int)$value;
            }
            if ((bool) config('ai.diagnostics_enabled', false)) {
                $code=$response->json('error.code');
                $safeCode=in_array($code,['json_validate_failed','model_decommissioned','invalid_api_key'],true)?$code:null;
                $validation='not_checked';
                if ($response->successful() && $jsonSchema!==null) {
                    $content=$response->json('choices.0.message.content');
                    if (!is_string($content) || json_decode($content)===null) $validation='invalid_json';
                    else $validation=\App\Services\AI\SchemaValidator::matches($jsonSchema,json_decode($content)) ? 'valid' : 'invalid_schema';
                }
                \Illuminate\Support\Facades\Log::notice('AI Groq attempt', [
                    'attempt'=>$attempt+1, 'http_status'=>$response->status(),
                    'format'=>$payload['response_format']['type']??'text', 'code'=>$safeCode,
                    'local_validation'=>$validation,
                ]);
            }
            // Groq can reject its own structured generation; retry only that
            // specific case once, within the original time budget. Laravel
            // still validates the returned JSON against the original schema.
            if ($attempt===0 && $jsonSchema!==null && $response->status()===400
                && $response->json('error.code')==='json_validate_failed'
                && ($deadline-hrtime(true))/1_000_000_000 >= 1.0) {
                // Ask for a JSON object on the one existing bounded retry.
                // The gateway still validates it against the original schema.
                $payload['response_format'] = ['type'=>'json_object'];
                $payload['messages'][0]['content'] .= "\nReturn a JSON object matching this schema: ".json_encode($jsonSchema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                continue;
            }
            if ($attempt===0 && $jsonSchema!==null && $response->successful() && $response->json('choices.0.finish_reason')!=='length'
                && ($deadline-hrtime(true))/1_000_000_000 >= 1.0) {
                $candidate=json_decode((string)$response->json('choices.0.message.content'));
                if (!\App\Services\AI\SchemaValidator::matches($jsonSchema,$candidate)) {
                    // A successful HTTP response can still violate the schema.
                    // Change strategy on the single retry rather than repeating
                    // the identical structured-generation request.
                    $payload['response_format'] = ['type'=>'json_object'];
                    if ($credentialScope==='vetti') {
                        // Feedback contains schema-owned field names only, never
                        // rejected values or unexpected provider property names.
                        $invalid=[];
                        if ($candidate instanceof \stdClass) {
                            foreach ($jsonSchema['properties'] ?? [] as $field=>$fieldSchema) {
                                if (property_exists($candidate,$field)
                                    ? !\App\Services\AI\SchemaValidator::matches($fieldSchema,$candidate->$field)
                                    : in_array($field,$jsonSchema['required'] ?? [],true)) $invalid[]=$field;
                            }
                        } else $invalid[]='root';
                        $payload['messages'][0]['content'] .= "\nCorrect invalid schema fields: ".json_encode(array_slice($invalid,0,12))
                            .". Omit irrelevant optional fields instead of filling them with invalid neutral values. Use only permitted enum values. Return a JSON object matching this schema: "
                            .json_encode($jsonSchema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    } else {
                        $payload['messages'][0]['content'] .= "\nReturn a JSON object matching this schema: ".json_encode($jsonSchema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    }
                    continue;
                }
            }
            break;
        }
        if (!$response->successful()) {
            // Only fixed error labels are retained; response text may contain user data.
            $code = $response->json('error.code');
            $safeCode = in_array($code, ['json_validate_failed', 'model_decommissioned', 'invalid_api_key'], true) ? $code : 'other';
            $message = (string) $response->json('error.message');
            $limitKind = preg_match('/tokens per day|\bTPD\b/i', $message) ? 'tokens_per_day'
                : (preg_match('/tokens per minute|\bTPM\b/i', $message) ? 'tokens_per_minute'
                : (preg_match('/requests per day|\bRPD\b/i', $message) ? 'requests_per_day'
                : (preg_match('/requests per minute|\bRPM\b/i', $message) ? 'requests_per_minute' : 'unspecified')));
            $quota=[];
            if ($response->status()===429) foreach (['limit'=>'/\bLimit\s+(\d+)/i','used'=>'/\bUsed\s+(\d+)/i','requested'=>'/\bRequested\s+(\d+)/i'] as $key=>$pattern) {
                if (preg_match($pattern,$message,$match)) $quota[$key]=(int)$match[1];
            }
            \Illuminate\Support\Facades\Log::notice('AI Groq error category', ['http_status'=>$response->status(), 'code'=>$safeCode, 'limit_kind'=>$response->status()===429 ? $limitKind : null, 'quota'=>$quota]);
            throw new AiProviderException($response->status()===429 ? 'rate_limit' : 'http_error',$response->status(),['usage'=>$reportedUsage,'http_requests'=>$httpRequests]+($response->status()===429 ? \App\Services\AI\ScribeProviderCooldown::metadata($response)+['limit_kind'=>$limitKind] : []));
        }
        $finishReason=match ($response->json('choices.0.finish_reason')) {
            'stop' => 'STOP', 'length' => 'MAX_TOKENS', 'content_filter' => 'SAFETY', default => 'unknown',
        };
        $usage=$reportedUsage;
        $metadata=['finish_reason'=>$finishReason,'usage'=>$usage,'http_requests'=>$httpRequests];
        if ($finishReason==='MAX_TOKENS') throw new AiProviderException('incomplete_response',null,$metadata);
        if ($finishReason==='SAFETY') throw new AiProviderException('safety_refusal',null,$metadata);
        $text=$response->json('choices.0.message.content');
        if (!is_string($text) || trim($text)==='') throw new AiProviderException('empty_response',null,$metadata);
        $text=trim($text);
        if ($jsonSchema===null && (str_starts_with($text,'{') || str_starts_with($text,'[')) && is_array(json_decode($text,true))) throw new AiProviderException('empty_response',null,$metadata);
        return ['text'=>$text,'finish_reason'=>$finishReason,'usage'=>$usage,'http_requests'=>$httpRequests];
    }
}
