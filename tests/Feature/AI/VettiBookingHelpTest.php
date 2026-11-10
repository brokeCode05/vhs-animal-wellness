<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use Tests\TestCase;

final class VettiBookingHelpTest extends TestCase
{
    public function test_booking_how_to_is_guidance_without_private_appointments_or_ai(): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        $user = new User;
        $user->setRawAttributes([
            'id' => 123, 'name' => 'Owner', 'role' => 'User',
            'status' => 'active', 'auth_version' => 1,
            'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version' => 1]);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);

        foreach ([
            'Paano magpa-appointment?',
            'Paano magbook?',
            'How can I book an appointment?',
            'How do I schedule a visit?',
        ] as $question) {
            $this->postJson('/api/ai/vetti', ['message' => $question])
                ->assertOk()
                ->assertJsonPath('data.intent', 'booking_help')
                ->assertJsonPath('data.source', 'rule')
                ->assertJsonPath('data.requires_confirmation', false)
                ->assertSee('Book an Appointment');
        }
        $this->assertSame(0, $fake->calls);
    }
}
