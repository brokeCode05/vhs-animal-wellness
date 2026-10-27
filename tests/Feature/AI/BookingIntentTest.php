<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use Tests\TestCase;

final class BookingIntentTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
    }

    private function login(string $role = 'User', bool $verified = true): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 123, 'name' => 'Test User', 'role' => $role,
            'status' => 'active', 'auth_version' => 1,
            'email_verified_at' => $verified ? '2026-01-01 00:00:00' : null,
        ]);
        if ($role === 'Doctor') {
            $doctor = new \App\Models\DoctorProfile;
            $doctor->setRawAttributes(['account_status' => 'active']);
            $user->setRelation('doctorProfile', $doctor);
        }
        $this->actingAs($user)->withSession(['auth_version' => 1]);
    }

    public function test_endpoint_requires_login_and_user_role(): void
    {
        $this->postJson('/api/ai/booking-intent', ['message' => 'Book grooming'])
            ->assertUnauthorized();
        foreach (['Admin', 'Doctor'] as $role) {
            $this->login($role);
            $this->postJson('/api/ai/booking-intent', ['message' => 'Book grooming'])
                ->assertForbidden();
        }
    }

    public function test_unverified_user_is_rejected(): void
    {
        $this->login('User', false);
        $this->postJson('/api/ai/booking-intent', ['message' => 'Book grooming'])
            ->assertUnauthorized();
    }

    public function test_validates_message_and_never_accepts_client_preference_fields(): void
    {
        $this->login();
        $this->postJson('/api/ai/booking-intent', ['message' => ''])->assertUnprocessable();
        $this->postJson('/api/ai/booking-intent', ['message' => str_repeat('x', 451)])
            ->assertUnprocessable();
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book grooming', 'service_hint' => 'dental', 'booking_created' => true,
        ])->assertOk()->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.booking_created', false)
            ->assertJsonPath('data.requires_confirmation', true);
    }

    public function test_disabled_ai_deterministically_extracts_preferences(): void
    {
        $this->login();
        config()->set('ai.enabled', false);
        config()->set('ai.booking_intent_enabled', false);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok grooming tomorrow after my shift',
        ])->assertOk()->assertJsonPath('data.source', 'rule')
            ->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.time_preference', 'evening')
            ->assertJsonPath('data.booking_created', false);
        $this->assertSame(0, $fake->calls);
    }

    public function test_model_sees_only_fixed_cues_not_private_raw_message(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $spy = new class implements AiProviderInterface {
            public array $messages = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                $this->messages[] = ['message' => $message, 'instructions' => $instructions, 'schema' => $jsonSchema];
                return ['text' => '{"service_hint":"grooming","time_preference":"afternoon"}', 'usage' => []];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Please book Bornok for grooming tomorrow afternoon. Reach me at 09171234567!',
        ])->assertOk()->assertJsonPath('data.source', 'ai')
            ->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.time_preference', 'afternoon');
        $this->assertCount(1, $spy->messages);
        $this->assertSame('service_cues=grooming; time_cues=afternoon', $spy->messages[0]['message']);
        $this->assertStringNotContainsString('Bornok', $spy->messages[0]['message']);
        $this->assertStringNotContainsString('0917', $spy->messages[0]['message']);
        $this->assertStringNotContainsString('tomorrow', $spy->messages[0]['message']);
        $this->assertNotNull($spy->messages[0]['schema']);
    }

    public function test_washed_phrase_prefills_grooming_when_ai_disabled(): void
    {
        $this->login();
        config()->set('ai.enabled', false);
        config()->set('ai.booking_intent_enabled', false);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);

        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok to get washed tomorrow',
        ])->assertOk()->assertJsonPath('data.source', 'rule')
            ->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.service_ambiguous', false)
            ->assertJsonPath('data.time_preference', 'none')
            ->assertJsonPath('data.requires_confirmation', true)
            ->assertJsonPath('data.booking_created', false);
        $this->assertSame(0, $fake->calls);
    }

    public function test_gemini_abstention_cannot_erase_safe_washed_hint(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider('{"service_hint":"none","time_preference":"none"}');
        $this->app->instance(AiProviderInterface::class, $fake);

        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok to get washed tomorrow',
        ])->assertOk()->assertJsonPath('data.source', 'rule')
            ->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.booking_created', false);
        $this->assertSame(1, $fake->calls);
    }

    public function test_provider_outage_keeps_safe_washed_grooming(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider('unavailable', true);
        $this->app->instance(AiProviderInterface::class, $fake);

        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok to get washed tomorrow',
        ])->assertOk()->assertJsonPath('data.source', 'rule')
            ->assertJsonPath('data.service_hint', 'grooming');
        $this->assertSame(1, $fake->calls);
    }

    public function test_medical_wash_query_does_not_trigger_grooming_alias(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);

        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book to get washed because my cat is bleeding',
        ])->assertOk()->assertJsonPath('data.service_hint', 'none')
            ->assertJsonPath('data.booking_created', false);
        $this->assertSame(0, $fake->calls);
    }

    public function test_model_can_assist_with_generic_nonclinical_paraphrase(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $spy = new class implements AiProviderInterface {
            public ?string $lastMessage = null;
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                $this->lastMessage = $message;
                return ['text' => '{"service_hint":"grooming","time_preference":"afternoon"}', 'usage' => []];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok to wash him after lunch',
        ])->assertOk()->assertJsonPath('data.source', 'ai')
            ->assertJsonPath('data.service_hint', 'grooming');
        $this->assertSame('service_cues=none; time_cues=afternoon; advisory_cues=pet_wash', $spy->lastMessage);
    }

    public function test_medical_or_sensitive_message_never_goes_to_model(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book grooming for my bleeding dog with an emergency',
        ])->assertOk()->assertJsonPath('data.source', 'rule');
        $this->assertSame(0, $fake->calls);
    }

    public function test_ambiguous_service_cues_never_choose_one(): void
    {
        $this->login();
        config()->set('ai.enabled', false);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book grooming and vaccination in the afternoon and evening',
        ])->assertOk()->assertJsonPath('data.service_hint', 'none')
            ->assertJsonPath('data.time_preference', 'none');
    }

    public function test_ambiguous_service_veto_survives_disabled_ai(): void
    {
        $this->login();
        config()->set('ai.enabled', false);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book grooming and vaccination tomorrow',
        ])->assertOk()->assertJsonPath('data.service_hint', 'none')
            ->assertJsonPath('data.service_ambiguous', true)
            ->assertJsonPath('data.booking_created', false);
    }

    public function test_wash_plus_vaccination_is_also_ambiguous_without_model_call(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Please book washing and vaccination for my cat',
        ])->assertOk()->assertJsonPath('data.service_hint', 'none')
            ->assertJsonPath('data.service_ambiguous', true);
        $this->assertSame(0, $fake->calls);
    }

    public function test_unique_grooming_cue_is_not_ambiguous(): void
    {
        $this->login();
        config()->set('ai.enabled', false);
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok for grooming tomorrow at 3:00 PM',
        ])->assertOk()->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.service_ambiguous', false);
    }

    public function test_provider_failure_and_invalid_schema_fall_back_to_rules(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider('{"service_hint":"nonexistent","time_preference":"morning"}');
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/booking-intent', ['message' => 'Grooming in the morning'])
            ->assertOk()->assertJsonPath('data.source', 'rule')
            ->assertJsonPath('data.service_hint', 'grooming');
        $this->assertSame(1, $fake->calls);
    }

    public function test_ai_cannot_override_unmentioned_service(): void
    {
        $this->login();
        config()->set('ai.enabled', true);
        config()->set('ai.booking_intent_enabled', true);
        $fake = new FakeAiProvider('{"service_hint":"vaccination","time_preference":"evening"}');
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/booking-intent', ['message' => 'Grooming in the morning'])
            ->assertOk()->assertJsonPath('data.service_hint', 'grooming')
            ->assertJsonPath('data.time_preference', 'morning')
            ->assertJsonPath('data.booking_created', false);
    }
}
