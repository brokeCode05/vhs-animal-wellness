<?php

namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GeminiDiagnosticsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('ai.enabled', true);
        config()->set('ai.api_key', 'synthetic-key');
        config()->set('ai.model', 'gemini-3.5-flash-lite');
    }

    public function test_rate_limit_is_classified_without_exposing_provider_body(): void
    {
        Http::fake(['*' => Http::response(['error'=>['message'=>'private synthetic detail']], 429)]);
        $reply = (new AiGateway(new GeminiProvider()))->text('semantic_vetti', 'synthetic question', 'test instruction', 'sanitized');
        $this->assertSame('provider_unavailable', $reply['error_code']);
        $this->assertSame('rate_limit', $reply['provider_failure']);
        $this->assertStringNotContainsString('private synthetic detail', json_encode($reply));
    }

    public function test_safety_refusal_is_distinct_from_empty_response(): void
    {
        Http::fake(['*' => Http::response(['promptFeedback'=>['blockReason'=>'SAFETY']], 200)]);
        $reply = (new AiGateway(new GeminiProvider()))->text('semantic_vetti', 'synthetic question', 'test instruction', 'sanitized');
        $this->assertSame('safety_refusal', $reply['provider_failure']);
    }

    public function test_usage_includes_thinking_and_total_counts(): void
    {
        Http::fake(['*' => Http::response([
            'candidates'=>[['content'=>['parts'=>[['text'=>'Hello']]]]],
            'usageMetadata'=>['promptTokenCount'=>10, 'candidatesTokenCount'=>4, 'thoughtsTokenCount'=>3, 'totalTokenCount'=>17],
        ], 200)]);
        $reply = (new AiGateway(new GeminiProvider()))->text('semantic_vetti', 'synthetic question', 'test instruction', 'sanitized');
        $this->assertTrue($reply['ok']);
        $this->assertSame(3, $reply['usage']['thinking_tokens']);
        $this->assertSame(17, $reply['usage']['total_tokens']);
    }
}
