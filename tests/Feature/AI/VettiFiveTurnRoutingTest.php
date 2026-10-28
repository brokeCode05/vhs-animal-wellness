<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use Tests\TestCase;

/** End-to-end HTTP regression for confusing visiting hours with appointment history. */
final class VettiFiveTurnRoutingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available' => true, 'name' => 'Fictional Clinic', 'address' => 'Demo Road',
            'phone' => null, 'email' => null,
            'weekday_appointment_window' => '09:00–17:00',
            'weekend_appointment_window' => null,
            'services' => ['Grooming', 'Consultation'],
        ]);
        config()->set('ai.enabled', true);
        config()->set('ai.user_vetti_enabled', true);
        config()->set('ai.public_vetti_enabled', true);
    }

    private function asFictionalUser(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id'=>978,'name'=>'Fictional Owner','role'=>'User','status'=>'active',
            'auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
    }

    public function test_user_multi_turn_clinic_visit_never_opens_private_appointments(): void
    {
        $this->asFictionalUser();
        $spy = new FakeAiProvider('unexpected');
        $this->app->instance(AiProviderInterface::class, $spy);
        $id = 'vusr_fictional_five_turn_123';
        $this->postJson('/api/ai/vetti', ['conversation_id'=>$id,'context_topic'=>'services','message'=>'How much is it?'])
            ->assertOk()->assertJsonPath('data.intent','price');
        $this->postJson('/api/ai/vetti', ['conversation_id'=>$id,'message'=>'What time can I visit?'])
            ->assertOk()->assertJsonPath('data.intent','hours')->assertJsonMissing(['intent'=>'appointments']);
        $this->postJson('/api/ai/vetti', ['conversation_id'=>$id,'message'=>'What about tomorrow?'])
            ->assertOk()->assertJsonPath('data.intent','hours')->assertSee('cannot confirm');
        $this->postJson('/api/ai/vetti', ['conversation_id'=>$id,'message'=>'Can you explain that in Tagalog?'])
            ->assertOk()->assertJsonPath('data.intent','hours')->assertSee('Para sa oras');
        $this->assertSame(0, $spy->calls);
    }

    public function test_public_multi_turn_visiting_hours_and_tagalog(): void
    {
        $spy = new FakeAiProvider('unexpected');
        $this->app->instance(AiProviderInterface::class, $spy);
        $id = 'vpub_fictional_five_turn_123';
        $this->postJson('/api/ai/public-vetti', ['conversation_id'=>$id,'message'=>'What services do you offer?'])
            ->assertOk()->assertJsonPath('data.intent','services');
        $this->postJson('/api/ai/public-vetti', ['conversation_id'=>$id,'message'=>'What time can I visit?'])
            ->assertOk()->assertJsonPath('data.intent','hours');
        $this->postJson('/api/ai/public-vetti', ['conversation_id'=>$id,'message'=>'What about tomorrow?'])
            ->assertOk()->assertJsonPath('data.intent','hours')->assertSee('cannot confirm');
        $this->postJson('/api/ai/public-vetti', ['conversation_id'=>$id,'message'=>'Can you explain that in Tagalog?'])
            ->assertOk()->assertJsonPath('data.intent','hours')->assertSee('Para sa oras');
        $this->assertSame(0, $spy->calls);
    }

    public function test_emergency_and_private_questions_still_override_context(): void
    {
        $this->asFictionalUser();
        $this->postJson('/api/ai/vetti', [
            'message'=>'My dog cannot breathe','context_topic'=>'hours',
        ])->assertOk()->assertJsonPath('data.intent','urgent');
        $this->postJson('/api/ai/public-vetti', [
            'message'=>'Show my dog records','conversation_id'=>'vpub_fictional_privacy_123',
        ])->assertOk()->assertJsonPath('data.intent','private');
    }
}
