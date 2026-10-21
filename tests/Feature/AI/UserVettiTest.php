<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\UserVettiFacts;
use Tests\TestCase;

final class UserVettiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // The tests check auth and role middleware but avoid the unrelated
        // database-backed access-log writer for fixture-only requests.
        $this->withoutMiddleware(RecordUserAccess::class);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available' => true, 'name' => 'VHS Test Clinic', 'phone' => '02-555-1000',
            'email' => 'hello@example.test', 'address' => 'Sample Street',
            'weekday_appointment_window' => '09:00–17:00',
            'weekend_appointment_window' => '10:00–16:00',
            'services' => ['Vaccination', 'Consultation'],
        ]);
    }

    private function loginAs(string $role = 'User', bool $verified = true): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 123, 'name' => 'Test Owner', 'first_name' => 'Test',
            'last_name' => 'Owner', 'role' => $role, 'status' => 'active',
            'auth_version' => 1, 'email_verified_at' => $verified ? '2026-01-01 00:00:00' : null,
        ]);
        if ($role === 'Doctor') {
            $doctor = new \App\Models\DoctorProfile;
            $doctor->setRawAttributes(['account_status' => 'active']);
            $user->setRelation('doctorProfile', $doctor);
        }
        $this->actingAs($user)->withSession(['auth_version' => 1]);
    }

    private function fakeFacts(): void
    {
        $this->mock(UserVettiFacts::class)
            ->shouldReceive('ownsPet')->andReturn(true);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->postJson('/api/ai/vetti', ['message' => 'Show my pets'])
            ->assertUnauthorized();
    }

    public function test_doctor_and_admin_roles_are_rejected(): void
    {
        foreach (['Admin', 'Doctor'] as $role) {
            $this->loginAs($role);
            $this->postJson('/api/ai/vetti', ['message' => 'Clinic services'])
                ->assertForbidden();
        }
    }

    public function test_unverified_account_is_rejected(): void
    {
        $this->loginAs('User', false);
        $this->postJson('/api/ai/vetti', ['message' => 'Clinic services'])
            ->assertUnauthorized();
    }

    public function test_unauthorized_pet_id_is_forbidden(): void
    {
        $this->loginAs();
        $this->mock(UserVettiFacts::class)->shouldReceive('ownsPet')->withArgs(
            fn (User $u, int $petId): bool => $u->id === 123 && $petId === 999
        )->once()->andReturn(false);
        $this->postJson('/api/ai/vetti', ['message' => 'Show my pets', 'pet_id' => 999])
            ->assertForbidden();
    }

    public function test_registered_pets_are_loaded_for_authenticated_owner_only(): void
    {
        $this->loginAs();
        $this->mock(UserVettiFacts::class)
            ->shouldReceive('pets')->withArgs(fn (User $u): bool => $u->id === 123)
            ->once()->andReturn([['id' => 1, 'name' => 'Luna', 'species' => 'Dog']]);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/vetti', ['message' => 'Show my pets'])
            ->assertOk()->assertJsonPath('data.source', 'rule')
            ->assertJsonPath('data.intent', 'pets')->assertSee('Luna');
        $this->assertSame(0, $fake->calls);
    }

    public function test_upcoming_appointments_use_user_scoped_read_only_query(): void
    {
        $this->loginAs();
        $facts = $this->mock(UserVettiFacts::class);
        $facts->shouldReceive('ownsPet')
            ->withArgs(fn (User $u, int $id): bool => $id === 7)->once()->andReturn(true);
        $facts->shouldReceive('upcoming')
            ->withArgs(fn (User $u, ?int $id): bool => $u->id === 123 && $id === 7)
            ->once()->andReturn([[
                'pet_id' => 7, 'pet_name' => 'Luna', 'date' => '2026-11-03',
                'time' => '15:00', 'service' => 'Vaccination', 'status' => 'confirmed',
            ]]);
        $this->postJson('/api/ai/vetti', ['message' => 'Show my upcoming appointments', 'pet_id' => 7])
            ->assertOk()->assertJsonPath('data.source', 'rule')->assertSee('2026-11-03');
    }

    public function test_medical_question_never_reaches_ai_even_when_enabled(): void
    {
        $this->loginAs();
        config()->set('ai.enabled', true);
        config()->set('ai.user_vetti_enabled', true);
        $fake = new FakeAiProvider('not expected');
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/vetti', ['message' => 'Can you diagnose my dog vomiting?'])
            ->assertOk()->assertJsonPath('data.source', 'rule');
        $this->assertSame(0, $fake->calls);
    }

    public function test_public_clinic_rule_bypasses_ai(): void
    {
        $this->loginAs();
        config()->set('ai.enabled', true);
        config()->set('ai.user_vetti_enabled', true);
        $fake = new FakeAiProvider('not expected');
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/vetti', ['message' => 'What services do you offer?'])
            ->assertOk()->assertJsonPath('data.source', 'rule')->assertSee('Vaccination');
        $this->assertSame(0, $fake->calls);
    }

    public function test_only_curated_public_prompt_is_sent_to_gemini(): void
    {
        $this->loginAs();
        config()->set('ai.enabled', true);
        config()->set('ai.user_vetti_enabled', true);
        config()->set('ai.public_vetti_enabled', false);
        $spy = new class implements AiProviderInterface {
            public array $calls = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                $this->calls[] = $message;
                return ['text' => 'Contact the clinic to discuss after-work visit arrangements.', 'usage' => []];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->postJson('/api/ai/vetti', ['message' => 'I work late, is there a clinic visit option?'])
            ->assertOk()->assertJsonPath('data.source', 'ai')
            ->assertJsonPath('data.intent', 'general');
        $this->assertCount(1, $spy->calls);
        $this->assertSame('I work late on weekdays; can I arrange a clinic visit another way?', $spy->calls[0]);
    }

    public function test_personal_message_and_unapproved_context_do_not_reach_gemini(): void
    {
        $this->loginAs();
        config()->set('ai.enabled', true);
        config()->set('ai.user_vetti_enabled', true);
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/vetti', ['message' => 'Call me at 09171234567 to arrange visit'])
            ->assertOk()->assertJsonPath('data.source', 'fallback');
        $this->assertSame(0, $fake->calls);
    }

    public function test_booking_request_does_not_create_appointment_or_call_ai(): void
    {
        $this->loginAs();
        $fake = new FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/vetti', ['message' => 'Book vaccination tomorrow'])
            ->assertOk()->assertJsonPath('data.intent', 'booking_guidance')
            ->assertJsonPath('data.requires_confirmation', false);
        $this->assertSame(0, $fake->calls);
    }

    public function test_disabled_ai_still_answers_from_rules(): void
    {
        $this->loginAs();
        config()->set('ai.enabled', false);
        config()->set('ai.user_vetti_enabled', false);
        $this->postJson('/api/ai/vetti', ['message' => 'What services do you offer?'])
            ->assertOk()->assertJsonPath('data.source', 'rule');
    }

    public function test_invalid_input_is_rejected_without_calling_ai(): void
    {
        $this->loginAs();
        $this->postJson('/api/ai/vetti', ['message' => ''])->assertUnprocessable();
        $this->postJson('/api/ai/vetti', ['message' => str_repeat('a', 451)])->assertUnprocessable();
        $this->postJson('/api/ai/vetti', [
            'message' => 'Clinic services', 'responseLanguage' => 'other',
        ])->assertUnprocessable();
    }
}
