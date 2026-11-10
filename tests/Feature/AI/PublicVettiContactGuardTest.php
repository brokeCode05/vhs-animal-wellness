<?php

namespace Tests\Feature\AI;

use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use Tests\TestCase;

class PublicVettiContactGuardTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(PublicClinicFacts::class, new class extends PublicClinicFacts {
            public function load(): array
            {
                return [
                    'available' => true,
                    'name' => 'Example Veterinary Clinic',
                    'phone' => '0998 765 4321', // fictional testing number
                    'email' => 'contact@example.test',
                    'address' => 'Example Street, Quezon City',
                    'weekday_appointment_window' => '09:00–17:00',
                    'weekend_appointment_window' => null,
                    'services' => ['Consultation', 'Vaccination'],
                ];
            }
        });
        config()->set('ai.enabled', true);
        config()->set('ai.public_vetti_enabled', true);
    }

    private function assertGenerated(string $answer, string $expectedSource): void
    {
        $fake = new FakeAiProvider($answer);
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/public-vetti', [
            'message' => 'I work late on weekdays; can I arrange a clinic visit another way?',
        ])->assertOk()->assertJsonPath('data.source', $expectedSource);
        $this->assertSame(1, $fake->calls);
    }

    public function test_verified_clinic_phone_is_allowed_in_ai_reply(): void
    {
        $this->assertGenerated('Please call our clinic at 0998 765 4321.', 'ai');
    }

    public function test_verified_phone_with_international_prefix_is_allowed(): void
    {
        $this->assertGenerated('Please call +63 998 765 4321 for clinic assistance.', 'ai');
    }

    public function test_invented_phone_is_rejected(): void
    {
        $this->assertGenerated('Please call 0912 345 6789 for details.', 'fallback');
    }

    public function test_verified_email_is_allowed_but_invented_email_is_not(): void
    {
        $this->assertGenerated('Email contact@example.test for guidance.', 'ai');
        $this->assertGenerated('Email private@example.net for guidance.', 'fallback');
    }

    public function test_unverified_url_remains_rejected(): void
    {
        $this->assertGenerated('See https://unverified.example/clinic for information.', 'fallback');
    }
}
