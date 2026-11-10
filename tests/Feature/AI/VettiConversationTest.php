<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use Tests\TestCase;

/** Public topic continuity; no personal memory or AI writes. */
final class VettiConversationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available' => true, 'name' => 'Demo Clinic', 'phone' => null,
            'email' => null, 'address' => 'Test Road',
            'weekday_appointment_window' => '09:00–17:00',
            'weekend_appointment_window' => null,
            'services' => ['Grooming', 'Vaccination'],
        ]);
        config()->set('ai.enabled', true);
        config()->set('ai.public_vetti_enabled', true);
        config()->set('ai.user_vetti_enabled', true);
    }

    private function signInAsUser(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 987, 'name' => 'Fictional Test Owner',
            'role' => 'User', 'status' => 'active', 'auth_version' => 1,
            'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version' => 1]);
    }

    public function test_public_followup_keeps_only_safe_topic(): void
    {
        $fake = new FakeAiProvider('not called');
        $this->app->instance(AiProviderInterface::class, $fake);
        $id = 'vpub_public_flow_123';
        $this->postJson('/api/ai/public-vetti', ['message' => 'What services do you offer?', 'conversation_id' => $id])
            ->assertOk()->assertJsonPath('data.intent', 'services');
        $this->postJson('/api/ai/public-vetti', ['message' => 'How much is it?', 'conversation_id' => $id])
            ->assertOk()->assertJsonPath('data.intent', 'price')->assertJsonPath('data.source', 'context')
            ->assertSee('Which listed service would you like the price for?');
        $this->assertSame(0, $fake->calls);
        $stored = session('vetti.public.topics')['c_'.$id];
        $this->assertSame('services', $stored['topic']);
        $this->assertArrayNotHasKey('message', $stored);
        $this->assertArrayNotHasKey('history', $stored);
    }

    public function test_interleaved_public_conversations_keep_separate_catalog_service_references(): void
    {
        $first = 'vpub_test_interleaved_first_123';
        $second = 'vpub_test_interleaved_second_456';
        $this->postJson('/api/ai/public-vetti', ['message'=>'Do you offer grooming?', 'conversation_id'=>$first])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message'=>'What services do you offer?', 'conversation_id'=>$second])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message'=>'How much is it?', 'conversation_id'=>$first])
            ->assertOk()->assertJsonPath('data.intent', 'price');
        // A generic service-list question cannot select Grooming for the second chat.
        $this->postJson('/api/ai/public-vetti', ['message'=>'How much is it?', 'conversation_id'=>$second])
            ->assertOk()->assertSee('Which listed service would you like the price for?');
        $all = session('vetti.public.topics');
        $this->assertArrayHasKey('c_'.$first, $all);
        $this->assertArrayHasKey('c_'.$second, $all);
        $this->assertArrayNotHasKey('message', $all['c_'.$first]);
        $this->assertArrayNotHasKey('history', $all['c_'.$second]);
    }

    public function test_interleaved_authenticated_public_topics_do_not_cross_conversations(): void
    {
        $this->signInAsUser();
        $first = 'vusr_test_interleaved_first_123';
        $second = 'vusr_test_interleaved_second_456';
        $this->postJson('/api/ai/vetti', ['message'=>'Do you offer grooming?', 'conversation_id'=>$first])->assertOk();
        $this->postJson('/api/ai/vetti', ['message'=>'Where is the clinic?', 'conversation_id'=>$second])->assertOk();
        $this->postJson('/api/ai/vetti', ['message'=>'How much is it?', 'conversation_id'=>$first])
            ->assertOk()->assertJsonPath('data.intent', 'price');
        $this->postJson('/api/ai/vetti', ['message'=>'Tell me more', 'conversation_id'=>$second])
            ->assertOk()->assertJsonPath('data.intent', 'location');
        $all = session('vetti.user.topics.987');
        $this->assertCount(2, $all);
    }

    public function test_taglish_price_reference_requires_or_uses_verified_service(): void
    {
        $first = 'vpub_taglish_ambiguous_123';
        $this->postJson('/api/ai/public-vetti', ['message'=>'What services do you offer?', 'conversation_id'=>$first])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message'=>'Magkano po yun?', 'conversation_id'=>$first])
            ->assertOk()->assertJsonPath('data.source','context')
            ->assertSee('Which listed service would you like the price for?');
        $second = 'vpub_taglish_selected_456';
        $this->postJson('/api/ai/public-vetti', ['message'=>'Do you offer Grooming?', 'conversation_id'=>$second])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message'=>'Magkano po yun?', 'conversation_id'=>$second])
            ->assertOk()->assertJsonPath('data.source','context')->assertSee('For Grooming');
    }

    public function test_scoped_topic_cache_is_bounded_to_six_chats(): void
    {
        for ($n=0; $n<9; $n++) {
            $id = 'vpub_cache_limit_'.$n.'_12345';
            $this->postJson('/api/ai/public-vetti', ['message'=>'What services do you offer?', 'conversation_id'=>$id])
                ->assertOk();
        }
        $saved = session('vetti.public.topics');
        $this->assertCount(6, $saved);
        $this->assertArrayNotHasKey('c_vpub_cache_limit_0_12345', $saved);
        $this->assertArrayHasKey('c_vpub_cache_limit_8_12345', $saved);
    }

    public function test_same_chat_id_does_not_share_public_and_authenticated_topic(): void
    {
        $id = 'vpub_same_id_two_scopes_123';
        $this->postJson('/api/ai/public-vetti', ['message'=>'What services do you offer?', 'conversation_id'=>$id])
            ->assertOk();
        $this->signInAsUser();
        $this->postJson('/api/ai/vetti', ['message'=>'Where is the clinic?', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'location');
        $this->assertSame('services', session('vetti.public.topics')['c_'.$id]['topic']);
        $this->assertSame('location', session('vetti.user.topics.987')['c_'.$id]['topic']);
    }

    public function test_new_public_conversation_does_not_inherit_old_topic(): void
    {
        $this->postJson('/api/ai/public-vetti', ['message' => 'Clinic information', 'conversation_id' => 'vpub_first_conversation_123'])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message' => 'Tell me more', 'conversation_id' => 'vpub_second_conversation_456'])
            ->assertOk()->assertJsonPath('data.source', 'fallback');
    }

    public function test_public_safety_overrides_followup(): void
    {
        $fake = new FakeAiProvider('not called');
        $this->app->instance(AiProviderInterface::class, $fake);
        $id = 'vpub_safety_conversation_123';
        $this->postJson('/api/ai/public-vetti', ['message' => 'What services do you offer?', 'conversation_id' => $id])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message' => 'Emergency my pet cannot breathe', 'conversation_id' => $id])
            ->assertOk()->assertJsonPath('data.intent', 'urgent');
        $this->postJson('/api/ai/public-vetti', ['message' => 'Show my dog records', 'conversation_id' => $id])
            ->assertOk()->assertJsonPath('data.intent', 'private');
        $this->assertSame(0, $fake->calls);
    }

    public function test_authenticated_user_public_topic_hint_never_calls_provider(): void
    {
        $this->signInAsUser();
        $fake = new FakeAiProvider('not called');
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/vetti', [
            'message' => 'How much is it?', 'conversation_id' => 'vusr_fictional_chat_123',
            'context_topic' => 'services',
        ])->assertOk()->assertJsonPath('data.source', 'context')
          ->assertJsonPath('data.intent', 'price');
        $this->assertSame(0, $fake->calls);
    }

    public function test_authenticated_user_emergency_cannot_be_downgraded_to_context(): void
    {
        $this->signInAsUser();
        $this->postJson('/api/ai/vetti', [
            'message' => 'My dog cannot breathe', 'context_topic' => 'services',
        ])->assertOk()->assertJsonPath('data.intent', 'urgent');
    }

    public function test_invalid_topic_is_rejected(): void
    {
        $this->signInAsUser();
        $this->postJson('/api/ai/vetti', [
            'message' => 'How much is it?', 'context_topic' => 'patient_records',
        ])->assertStatus(422);
    }
}
