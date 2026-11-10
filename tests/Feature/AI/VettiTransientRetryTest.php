<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class VettiTransientRetryTest extends TestCase
{
    protected function setUp(): void {
        parent::setUp();
        config(['ai.enabled' => true, 'ai.api_key' => 'synthetic-key', 'ai.timeout' => 15, 'ai.groq_public_backup_enabled' => false]);
    }

    public function test_public_vetti_retries_one_transient_503(): void {
        $this->checkRetry('public_vetti');
    }

    public function test_user_vetti_retries_one_transient_503(): void {
        $this->checkRetry('semantic_vetti');
    }

    private function checkRetry(string $task): void {
        Http::fakeSequence()->push([], 503)->push(['candidates' => [['content' => ['parts' => [['text' => 'Verified answer']]]]]], 200);
        $gateway = new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(5);
        $result = $gateway->text($task, 'synthetic', 'synthetic', 'public');
        $this->assertTrue($result['ok']);
        $this->assertSame('Verified answer', $result['text']);
        Http::assertSentCount(2);
    }

    public function test_repeated_503_stops_after_two_retries(): void {
        Http::fake(['*' => Http::response([], 503)]);
        $gateway = new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(5);
        $result = $gateway->text('public_vetti', 'synthetic', 'synthetic', 'public');
        $this->assertFalse($result['ok']);
        $this->assertSame(503, $result['provider_http_status']);
        Http::assertSentCount(3);
    }

    public function test_recovers_after_two_transient_failures(): void {
        Http::fakeSequence()->push([], 503)->push([], 503)->push(['candidates' => [['content' => ['parts' => [['text' => 'Verified answer']]]]]], 200);
        $gateway = new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(8);
        $result = $gateway->text('public_vetti', 'synthetic', 'synthetic', 'public');
        $this->assertTrue($result['ok']);
        Http::assertSentCount(3);
    }

    public function test_rate_limit_is_not_retried(): void {
        Http::fake(['*' => Http::response([], 429)]);
        $gateway = new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(5);
        $result = $gateway->text('semantic_vetti', 'synthetic', 'synthetic', 'sanitized');
        $this->assertSame('rate_limit', $result['provider_failure']);
        Http::assertSentCount(1);
    }

    public function test_no_retry_when_deadline_is_short(): void {
        Http::fake(['*' => Http::response([], 503)]);
        $gateway = new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(1);
        $result = $gateway->text('public_vetti', 'synthetic', 'synthetic', 'public');
        $this->assertFalse($result['ok']);
        Http::assertSentCount(1);
    }
}
