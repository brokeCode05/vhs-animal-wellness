<?php

namespace Tests\Feature\AI;

use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use Tests\TestCase;

final class VettiLanguageRobustnessTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available' => true, 'name' => 'Demo Clinic',
            'phone' => '02-555-1000', 'email' => 'demo@example.test',
            'address' => 'Synthetic Test Street',
            'weekday_appointment_window' => '09:00–17:00',
            'weekend_appointment_window' => null,
            'services' => ['Vaccination', 'Consultation'],
        ]);
    }

    public function test_clinic_information_variations_return_verified_facts_without_gemini(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.public_vetti_enabled', true);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        foreach (['clinic info', 'clinics info', "clinic's info", 'clinic’s info',
            'Tell me about your clinic', 'Pahingi ng info ng clinic',
            'Impormasyon ng clinic', 'clinic contact', 'clinics phone'] as $message) {
            $this->postJson('/api/ai/public-vetti', ['message' => $message])
                ->assertOk()->assertJsonPath('data.intent', 'clinic_info')
                ->assertJsonPath('data.source', 'rule')->assertSee('Synthetic Test Street');
        }
        $this->assertSame(0, $fake->calls);
    }

    public function test_hours_location_facts_do_not_mislabel_appointment_window_as_opening_hours(): void
    {
        $this->postJson('/api/ai/public-vetti', ['message' => 'What are your clinic hours and location?'])
            ->assertOk()->assertJsonPath('data.intent', 'hours_location')
            ->assertSee('Synthetic Test Street')->assertSee('not necessarily clinic opening hours');
    }

    public function test_private_and_emergency_requests_still_override_clinic_information(): void
    {
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/public-vetti', ['message' => 'My pet appointment and clinic info'])
            ->assertOk()->assertJsonPath('data.intent', 'private');
        $this->postJson('/api/ai/public-vetti', ['message' => "My pet can't breathe, clinic info please"])
            ->assertOk()->assertJsonPath('data.intent', 'urgent');
        $this->assertSame(0, $fake->calls);
    }
}
