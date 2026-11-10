<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\UserVettiFacts;
use Illuminate\Support\Facades\Log;
use Mockery;
use Tests\TestCase;

/** Phase 2C-B: safe detours preserve pending preferences; explicit cancellation still wins. */
final class SemanticRoutingPreservationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
        $owner = new User;
        $owner->setRawAttributes([
            'id' => 123, 'name' => 'SyntheticOwner', 'role' => 'User', 'status' => 'active',
            'auth_version' => 1, 'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        $this->actingAs($owner)->withSession(['auth_version' => 1]);
        config()->set('ai.enabled', true);
        config()->set('ai.semantic_vetti_enabled', true);
        config()->set('ai.paid_data_approved', true);
        config()->set('ai.semantic_privacy_cleared', true);
    }

    private function pendingKey(string $conversation = 'synthetic_conv_12345'): string
    {
        return 'vetti_semantic_pending_'.hash('sha256', '123|'.$conversation);
    }

    private function seedPending(): array
    {
        $draft = [
            'conversation_id' => 'synthetic_conv_12345',
            'expires_at' => time() + 280,
            'pet_id' => null, 'service' => 'grooming', 'date' => null, 'time' => 'afternoon',
        ];
        session()->put('vetti_semantic_proposals', [$this->pendingKey() => $draft]);
        return $draft;
    }

    private function intentJson(string $intent, string $time = 'none'): string
    {
        return json_encode([
            'intent' => $intent, 'pet_ref' => 'none', 'service' => 'none',
            'date_expression' => '', 'time_preference' => $time,
            'negated' => false, 'multiple_services' => false, 'needs_clarification' => false,
        ], JSON_THROW_ON_ERROR);
    }

    private function send(string $message, string $conversation = 'synthetic_conv_12345'): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/ai/semantic-vetti', [
            'message' => $message, 'conversation_id' => $conversation,
        ]);
    }

    public function test_unrelated_information_preserves_original_proposal_and_expiry(): void
    {
        $draft = $this->seedPending();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider($this->intentJson('clinic_info')));
        Log::shouldReceive('info')->once()->with('vetti.semantic.execution', Mockery::on(static fn(array $event): bool =>
            $event['provider_invoked'] === true
            && $event['intent_category'] === 'clinic_info'
            && $event['pending_transition'] === 'preserved'
            && $event['pending_clear_reason'] === 'none'
            && $event['response_origin'] === 'laravel'
            && !str_contains(json_encode($event), 'SyntheticOwner')
        ));
        $response = $this->send('Where is the clinic?')
            ->assertOk()->assertJsonPath('data.kind', 'information');
        $this->assertArrayNotHasKey('execution', $response->json('data'));
        $this->assertSame($draft, session('vetti_semantic_proposals')[$this->pendingKey()]);
    }

    public function test_followup_after_detour_updates_only_explicit_preference(): void
    {
        $draft = $this->seedPending();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $provider = new class($this->intentJson('clinic_info'), $this->intentJson('booking_followup', 'morning')) implements AiProviderInterface {
            private int $index = 0;
            public function __construct(private string $information, private string $followup) {}
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                return ['text' => $this->index++ === 0 ? $this->information : $this->followup, 'usage' => []];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        Log::shouldReceive('info')->twice()->with('vetti.semantic.execution', Mockery::any());
        $this->send('What are the clinic hours?')->assertOk()->assertJsonPath('data.kind', 'information');
        $this->assertSame($draft, session('vetti_semantic_proposals')[$this->pendingKey()]);
        $this->send('morning instead')->assertOk()->assertJsonPath('data.kind', 'information');
        $after = session('vetti_semantic_proposals')[$this->pendingKey()];
        $this->assertSame('grooming', $after['service']);
        $this->assertSame('morning', $after['time']);
        $this->assertNull($after['pet_id']);
    }

    public function test_explicit_opt_out_still_clears_pending_without_provider(): void
    {
        $this->seedPending();
        $fake = new FakeAiProvider('unused');
        $this->app->instance(AiProviderInterface::class, $fake);
        Log::shouldReceive('info')->once()->with('vetti.semantic.execution', Mockery::on(static fn(array $event): bool =>
            $event['provider_invoked'] === false
            && $event['pending_transition'] === 'cleared'
            && $event['pending_clear_reason'] === 'explicit_cancellation'
        ));
        $this->send("Don't book an appointment")
            ->assertOk()->assertJsonPath('data.kind', 'information');
        $this->assertSame([], session('vetti_semantic_proposals'));
        $this->assertSame(0, $fake->calls);
    }

    public function test_pending_state_is_scoped_to_conversation_identifier(): void
    {
        $draft = $this->seedPending();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider($this->intentJson('booking_summary')));
        Log::shouldReceive('info')->once()->with('vetti.semantic.execution', Mockery::any());
        $this->send('What is my current proposed booking?', 'synthetic_other_12345')
            ->assertOk()->assertJsonPath('data.kind', 'information');
        $this->assertSame($draft, session('vetti_semantic_proposals')[$this->pendingKey()]);
        $this->assertArrayNotHasKey($this->pendingKey('synthetic_other_12345'), session('vetti_semantic_proposals'));
    }
}
