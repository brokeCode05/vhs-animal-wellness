<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use Tests\TestCase;

/** Language/intent regression tests. Never creates an appointment. */
final class VettiNLUUpgradeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
        config()->set('ai.enabled', false);
        config()->set('ai.public_vetti_enabled', false);
        config()->set('ai.booking_intent_enabled', false);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available' => true, 'name' => 'VHS Test Clinic', 'phone' => '02-555-1000',
            'email' => 'hello@example.test', 'address' => 'Test Clinic Street',
            'weekday_appointment_window' => '09:00–17:00',
            'weekend_appointment_window' => '10:00–16:00',
            'services' => ['Cat Grooming', 'Vaccination'],
        ]);
    }

    private function asUser(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 123, 'name' => 'Test Owner', 'role' => 'User', 'status' => 'active',
            'auth_version' => 1, 'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version' => 1]);
    }

    public function test_taglish_grooming_and_wash_are_booking_preferences_only(): void
    {
        $this->asUser();
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        foreach (['Gusto ko ipa-groom si Bornok bukas', 'Can you arrange a wash for Bornok tomorrow?'] as $query) {
            $this->postJson('/api/ai/booking-intent', ['message' => $query])
                ->assertOk()->assertJsonPath('data.service_hint', 'grooming')
                ->assertJsonPath('data.booking_created', false)
                ->assertJsonPath('data.requires_confirmation', true);
        }
        $this->assertSame(0, $fake->calls);
    }

    public function test_conflicting_and_emergency_requests_do_not_select_a_service(): void
    {
        $this->asUser();
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book grooming and vaccination tomorrow',
        ])->assertOk()->assertJsonPath('data.service_ambiguous', true)
            ->assertJsonPath('data.service_hint', 'none');
        $this->postJson('/api/ai/booking-intent', [
            'message' => 'Book Bornok grooming because he is bleeding',
        ])->assertOk()->assertJsonPath('data.service_hint', 'none')
            ->assertJsonPath('data.booking_created', false);
    }

    public function test_public_taglish_faq_uses_rules_without_model(): void
    {
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        foreach ([
            'Paano magpa-appointment?' => 'booking',
            'Anong serbisyo ninyo?' => 'services',
            'Magkano po ang vaccination?' => 'price',
            'Saan kayo located?' => 'location',
        ] as $message => $intent) {
            $this->postJson('/api/ai/public-vetti', ['message' => $message])
                ->assertOk()->assertJsonPath('data.source', 'rule')
                ->assertJsonPath('data.intent', $intent);
        }
        $this->assertSame(0, $fake->calls);
    }

    public function test_public_owner_context_is_refused(): void
    {
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/public-vetti', ['message' => 'Saan appointment ko?'])
            ->assertOk()->assertJsonPath('data.intent', 'private')
            ->assertJsonPath('data.source', 'rule');
        $this->assertSame(0, $fake->calls);
    }
}
