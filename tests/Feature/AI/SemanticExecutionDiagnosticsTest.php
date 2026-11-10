<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\Providers\GeminiProvider;
use App\Services\AI\UserVettiFacts;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Mockery;
use Tests\TestCase;

/** Phase 2C-A: provenance only, no behavioral changes. */
final class SemanticExecutionDiagnosticsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
        $this->actingAs($this->syntheticUser())->withSession(['auth_version' => 1]);
        config()->set('ai.enabled', true);
        config()->set('ai.semantic_vetti_enabled', true);
        config()->set('ai.paid_data_approved', true);
        config()->set('ai.semantic_privacy_cleared', true);
    }

    private function syntheticUser(): User
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 123, 'name' => 'PrivateOwner', 'role' => 'User', 'status' => 'active',
            'auth_version' => 1, 'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        return $user;
    }

    private function request(string $message): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/ai/semantic-vetti', [
            'message' => $message,
            'conversation_id' => 'synthetic_conv_12345',
        ]);
    }

    private function classified(string $intent): string
    {
        return json_encode([
            'intent' => $intent, 'pet_ref' => 'none', 'service' => 'none',
            'date_expression' => '', 'time_preference' => 'none',
            'negated' => false, 'multiple_services' => false, 'needs_clarification' => false,
        ], JSON_THROW_ON_ERROR);
    }

    private function expectTrace(callable $check): void
    {
        Log::shouldReceive('info')->once()->with('vetti.semantic.execution', Mockery::on($check));
    }

    public function test_model_interpretation_and_laravel_composition_are_distinct(): void
    {
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $fake = new FakeAiProvider($this->classified('booking_help'));
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->expectTrace(static fn (array $event): bool =>
            $event['provider_invoked'] === true
            && $event['gemini_adapter_invoked'] === false // Fake is NOT Gemini.
            && $event['interpretation'] === 'succeeded'
            && $event['intent_category'] === 'booking_help'
            && $event['response_origin'] === 'laravel'
            && $event['pending_transition'] === 'none'
            && $event['failure_category'] === 'none'
        );
        $response = $this->request('How do I book?')
            ->assertOk()->assertJsonPath('data.source', 'rule');
        $this->assertSame(1, $fake->calls);
        $this->assertArrayNotHasKey('execution', $response->json('data'));
        $this->assertArrayNotHasKey('diagnostics', $response->json('data'));
    }

    public function test_rule_only_guard_does_not_claim_gemini_was_called(): void
    {
        $fake = new FakeAiProvider('unused');
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->expectTrace(static fn (array $event): bool =>
            $event['provider_invoked'] === false
            && $event['gemini_adapter_invoked'] === false
            && $event['interpretation'] === 'not_attempted'
            && $event['intent_category'] === 'unclassified'
            && $event['response_origin'] === 'laravel'
        );
        $this->request('Emergency, my pet is unconscious')->assertOk()->assertJsonPath('data.source', 'rule');
        $this->assertSame(0, $fake->calls);
    }

    public function test_rejected_booking_reply_is_reported_without_content(): void
    {
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([['id'=>7,'name'=>'Luna','species'=>'Dog']]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->andReturn(true);
        $fake = new FakeAiProvider(json_encode(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'vaccination',
            'date_expression'=>'tomorrow','time_preference'=>'afternoon','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]));
        $this->app->instance(AiProviderInterface::class, $fake);
        $booking = Mockery::mock(new \App\Services\AI\BookingConversationService(new \App\Services\AI\AiGateway($fake)));
        $booking->shouldReceive('prepare')->once()->andReturn(['status'=>'response_rejected','failure_category'=>'unsafe_status_or_link']);
        $this->app->instance(\App\Services\AI\BookingConversationService::class,$booking);
        $this->expectTrace(static fn (array $event): bool =>
            $event['failure_category'] === 'unsafe_status_or_link'
            && $event['pending_transition'] === 'created'
            && !str_contains(json_encode($event), 'Luna')
            && !str_contains(json_encode($event), 'synthetic_conv_12345')
        );
        $this->request('Book Luna vaccination tomorrow afternoon')->assertOk()
            ->assertJsonPath('data.proposal_pending',true)->assertJsonPath('data.kind','information');
    }

    public function test_provider_failure_is_recorded_without_private_content(): void
    {
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider('unused', true));
        $this->expectTrace(static function (array $event): bool {
            $allowed = [
                'provider_invoked', 'gemini_adapter_invoked', 'interpretation',
                'intent_category', 'failure_category', 'response_origin',
                'pending_transition', 'pending_clear_reason', 'duration_ms', 'provider_calls',
            ];
            return array_keys($event) === $allowed
                && $event['provider_invoked'] === true
                && $event['interpretation'] === 'failed'
                && $event['failure_category'] === 'provider_unavailable'
                && $event['response_origin'] === 'fallback'
                && !str_contains(json_encode($event), 'PrivateOwner')
                && !str_contains(json_encode($event), 'synthetic_conv_12345');
        });
        $this->request('Can I book an appointment?')->assertOk()->assertJsonPath('data.mode', 'fallback');
    }

    public function test_malformed_structured_output_is_distinct_from_provider_failure(): void
    {
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider('{"not_in_schema":true}'));
        $this->expectTrace(static fn (array $event): bool =>
            $event['provider_invoked'] === true
            && $event['interpretation'] === 'failed'
            && $event['failure_category'] === 'invalid_schema'
            && $event['response_origin'] === 'fallback'
        );
        $this->request('help with booking')->assertOk()->assertJsonPath('data.mode', 'fallback');
    }

    public function test_mocked_http_gemini_adapter_is_identified_without_live_api_call(): void
    {
        config()->set('ai.api_key', 'SYNTHETIC_TEST_KEY');
        config()->set('ai.model', 'gemini-3.5-flash-lite');
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        Http::fake(['*' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => $this->classified('booking_help')]]]]],
        ], 200)]);
        $this->app->instance(AiProviderInterface::class, new GeminiProvider());
        $this->expectTrace(static fn (array $event): bool =>
            $event['provider_invoked'] === true
            && $event['gemini_adapter_invoked'] === true
            && $event['interpretation'] === 'succeeded'
            && $event['response_origin'] === 'laravel'
            && $event['intent_category'] === 'booking_help'
        );
        $this->request('How do I book?')->assertOk()->assertJsonPath('data.source', 'rule');
        Http::assertSentCount(1); // HTTP is mocked; this proves wiring, NOT live Gemini.
    }

    public function test_provider_failure_preserves_existing_pending_proposal(): void
    {
        $id = 'synthetic_conv_12345';
        $key = 'vetti_semantic_pending_'.hash('sha256', '123|'.$id);
        $pending = [
            'conversation_id' => $id, 'expires_at' => time() + 300,
            'pet_id' => null, 'service' => 'grooming', 'date' => null, 'time' => 'afternoon',
        ];
        session()->put('vetti_semantic_proposals', [$key => $pending]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider('unused', true));
        $this->expectTrace(static fn (array $event): bool =>
            $event['provider_invoked'] === true
            && $event['interpretation'] === 'failed'
            && $event['pending_transition'] === 'preserved'
            && $event['pending_clear_reason'] === 'none'
        );
        $this->request('can i book')->assertOk()->assertJsonPath('data.mode', 'fallback');
        $this->assertSame($pending, session('vetti_semantic_proposals')[$key]);
    }

    public function test_followup_updates_pending_preference_without_exposing_it_in_event(): void
    {
        $id = 'synthetic_conv_12345';
        $key = 'vetti_semantic_pending_'.hash('sha256', '123|'.$id);
        session()->put('vetti_semantic_proposals', [$key => [
            'conversation_id' => $id, 'expires_at' => time() + 300,
            'pet_id' => null, 'service' => 'grooming', 'date' => null, 'time' => 'afternoon',
        ]]);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([]);
        $followup = json_encode([
            'intent' => 'booking_followup', 'pet_ref' => 'none', 'service' => 'none',
            'date_expression' => '', 'time_preference' => 'morning',
            'negated' => false, 'multiple_services' => false, 'needs_clarification' => false,
        ], JSON_THROW_ON_ERROR);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider($followup));
        $this->expectTrace(static fn (array $event): bool =>
            $event['interpretation'] === 'succeeded'
            && $event['intent_category'] === 'booking_followup'
            && $event['pending_transition'] === 'updated'
            && !str_contains(json_encode($event), 'morning')
        );
        $this->request('morning instead')->assertOk()->assertJsonPath('data.kind', 'information');
        $this->assertSame('morning', session('vetti_semantic_proposals')[$key]['time']);
    }

    public function test_pending_booking_is_preserved_by_unrelated_informational_intent(): void
    {
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->twice()->andReturn([]);
        $responses = [
            json_encode([
                'intent' => 'booking', 'pet_ref' => 'none', 'service' => 'grooming',
                'date_expression' => 'tomorrow', 'time_preference' => 'afternoon',
                'negated' => false, 'multiple_services' => false, 'needs_clarification' => false,
            ], JSON_THROW_ON_ERROR),
            $this->classified('clinic_info'),
        ];
        $provider = new class($responses) implements AiProviderInterface {
            public int $calls = 0;
            public function __construct(private array $responses) {}
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                return ['text' => $this->responses[$this->calls++], 'usage' => []];
            }
        };
        $this->app->instance(AiProviderInterface::class, $provider);
        $events = [];
        Log::shouldReceive('info')->twice()->with('vetti.semantic.execution', Mockery::on(
            static function (array $event) use (&$events): bool { $events[] = $event; return true; }
        ));
        $this->request('Book grooming tomorrow afternoon')->assertOk()->assertJsonPath('data.kind', 'information');
        $this->request('Where is the clinic?')->assertOk()->assertJsonPath('data.kind', 'information');
        $this->assertSame('created', $events[0]['pending_transition']);
        $this->assertSame('preserved', $events[1]['pending_transition']);
        $this->assertSame('none', $events[1]['pending_clear_reason']);
        $this->assertSame('clinic_info', $events[1]['intent_category']);
        $this->assertCount(1, session('vetti_semantic_proposals'));
        $saved = array_values(session('vetti_semantic_proposals'))[0];
        $this->assertSame('grooming', $saved['service']);
        $this->assertSame('afternoon', $saved['time']);
    }
}
