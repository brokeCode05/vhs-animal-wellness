<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\PublicClinicFacts;
use Tests\TestCase;

/** Stage 1: synthetic catalog, no real patients and no Gemini calls. */
final class VettiServiceMemoryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available' => true, 'name' => 'Fictional Clinic', 'phone' => null,
            'email' => null, 'address' => 'Fictional Road',
            'weekday_appointment_window' => null, 'weekend_appointment_window' => null,
            'services' => ['Dog Grooming', 'Cat Grooming', 'Consultation', 'Vaccination'],
            'service_details' => ['Vaccination' => ['price' => '500.00', 'currency' => 'PHP']],
        ]);
        config()->set('ai.enabled', true);
        config()->set('ai.public_vetti_enabled', true);
        config()->set('ai.user_vetti_enabled', true);
        $this->app->instance(AiProviderInterface::class, new FakeAiProvider('MUST NOT CALL'));
    }

    private function user(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 987, 'name' => 'Fictional Owner', 'role' => 'User',
            'status' => 'active', 'auth_version' => 1,
            'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version' => 1]);
    }

    public function test_user_can_ask_directly_for_a_verified_service_price(): void
    {
        $this->user();
        $this->postJson('/api/ai/vetti', ['message' => 'how much is vaccination', 'conversation_id' => 'vusr_direct_price_test_123'])
            ->assertOk()->assertJsonPath('data.intent', 'price')->assertSee('Vaccination')->assertSee('500.00');
    }

    public function test_public_session_remembers_verified_service_and_switches(): void
    {
        $id = 'vpub_stage1_public_test_123';
        $this->postJson('/api/ai/public-vetti', ['message'=>'By the way, do you offer cat grooming?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'services')->assertSee('Cat Grooming');
        $this->assertSame('Cat Grooming', session('vetti.public.topic')['service']);
        $this->postJson('/api/ai/public-vetti', ['message'=>'How much does that cost?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.source','context')->assertSee('Cat Grooming');
        $this->postJson('/api/ai/public-vetti', ['message'=>'What about dog grooming?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','services')->assertSee('Dog Grooming');
        $this->assertSame('Dog Grooming', session('vetti.public.topic')['service']);
        $this->postJson('/api/ai/public-vetti', ['message'=>'How much is it?','conversation_id'=>$id])
            ->assertOk()->assertSee('Dog Grooming');
        $this->assertArrayNotHasKey('history',session('vetti.public.topic'));
        $this->assertArrayNotHasKey('message',session('vetti.public.topic'));
    }

    public function test_ambiguous_service_drops_selection_and_new_conversation_is_isolated(): void
    {
        $id='vpub_stage1_ambiguous_123';
        $this->postJson('/api/ai/public-vetti',['message'=>'Do you offer cat grooming?','conversation_id'=>$id])->assertOk();
        $this->postJson('/api/ai/public-vetti',['message'=>'What about cat grooming and dog grooming?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','service_ambiguous');
        $this->assertNull(session('vetti.public.topic')['service']);
        $this->postJson('/api/ai/public-vetti',['message'=>'How much is it?','conversation_id'=>$id])
            ->assertOk()->assertDontSee('For Cat Grooming');
        $this->postJson('/api/ai/public-vetti',['message'=>'Do you offer cat grooming?','conversation_id'=>$id])->assertOk();
        $this->postJson('/api/ai/public-vetti',['message'=>'How much is it?','conversation_id'=>'vpub_stage1_fresh_456'])
            ->assertOk()->assertDontSee('For Cat Grooming');
    }

    public function test_private_request_clears_service_and_cannot_be_converted_to_context(): void
    {
        $id='vpub_stage1_safety_123';
        $this->postJson('/api/ai/public-vetti',['message'=>'Do you offer cat grooming?','conversation_id'=>$id])->assertOk();
        $this->postJson('/api/ai/public-vetti',['message'=>'Show my dog records','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','private');
        $this->assertNull(session('vetti.public.topic')['service']);
    }

    public function test_user_service_reference_has_no_booking_action_or_pet_context(): void
    {
        $this->user();
        $id='vusr_stage1_service_123';
        $this->postJson('/api/ai/vetti',['message'=>'Do you offer cat grooming?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','services')->assertJsonPath('data.requires_confirmation',false)
            ->assertSee('Cat Grooming');
        $this->assertSame('Cat Grooming', session('vetti.user.topic.987')['service']);
        $this->postJson('/api/ai/vetti',['message'=>'How much does that cost?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','price')->assertSee('Cat Grooming');
        $this->postJson('/api/ai/vetti',['message'=>'What time can I visit?','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','hours');
        $this->assertNull(session('vetti.user.topic.987')['service']);
    }
    public function test_public_pending_choice_survives_price_and_accepts_second(): void
    {
        $id = 'vpub_stage1_polish_choice_123';
        $this->postJson('/api/ai/public-vetti', ['message'=>'What about cat grooming and dog grooming?', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'service_ambiguous');
        $this->assertSame(['Cat Grooming', 'Dog Grooming'], session('vetti.public.topic')['choices']);
        $this->assertNull(session('vetti.public.topic')['service']);

        $this->postJson('/api/ai/public-vetti', ['message'=>'How much is it?', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'service_ambiguous')
            ->assertSee('Cat Grooming or Dog Grooming');
        $this->assertSame(['Cat Grooming', 'Dog Grooming'], session('vetti.public.topic')['choices']);

        $this->postJson('/api/ai/public-vetti', ['message'=>'the second one', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'service_choice')->assertSee('Dog Grooming');
        $this->assertSame('Dog Grooming', session('vetti.public.topic')['service']);
        $this->assertSame([], session('vetti.public.topic')['choices']);

        $this->postJson('/api/ai/public-vetti', ['message'=>'How much does it cost?', 'conversation_id'=>$id])
            ->assertOk()->assertSee('For Dog Grooming');
    }

    public function test_public_choice_clears_on_topic_change_and_is_isolated_by_conversation(): void
    {
        $id = 'vpub_stage1_polish_isolation_123';
        $this->postJson('/api/ai/public-vetti', ['message'=>'What about dog grooming and cat grooming?', 'conversation_id'=>$id])->assertOk();
        $this->assertSame(['Dog Grooming', 'Cat Grooming'], session('vetti.public.topic')['choices']);
        $this->postJson('/api/ai/public-vetti', ['message'=>'Where are you located?', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'location');
        $this->assertSame([], session('vetti.public.topic')['choices']);
        $this->postJson('/api/ai/public-vetti', ['message'=>'the first one', 'conversation_id'=>$id])
            ->assertOk()->assertJsonMissing(['intent'=>'service_choice']);
        $this->postJson('/api/ai/public-vetti', ['message'=>'What about dog grooming and cat grooming?', 'conversation_id'=>$id])->assertOk();
        $this->postJson('/api/ai/public-vetti', ['message'=>'the second one', 'conversation_id'=>'vpub_stage1_polish_new_456'])
            ->assertOk()->assertJsonMissing(['intent'=>'service_choice']);
    }

    public function test_user_pending_choice_is_read_only_and_account_scoped(): void
    {
        $this->user();
        $id='vusr_stage1_polish_choice_123';
        $this->postJson('/api/ai/vetti', ['message'=>'Do you offer dog grooming and cat grooming?', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent', 'service_ambiguous');
        $this->assertSame(['Dog Grooming','Cat Grooming'], session('vetti.user.topic.987')['choices']);
        $this->postJson('/api/ai/vetti', ['message'=>'the second one', 'conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.intent','service_choice')
            ->assertJsonPath('data.requires_confirmation',false)->assertSee('Cat Grooming');
        $this->assertSame('Cat Grooming', session('vetti.user.topic.987')['service']);
        $this->assertSame([], session('vetti.user.topic.987')['choices']);
    }

    public function test_expired_user_service_choices_cannot_be_revived_by_browser_topic_hint(): void
    {
        $this->user();
        $id='vusr_stage1_polish_expired_123';
        $this->withSession(['vetti.user.topic.987'=>[
            'id'=>$id, 'topic'=>'services', 'service'=>null,
            'choices'=>['Dog Grooming','Cat Grooming'], 'until'=>time()-120,
        ]]);
        $this->postJson('/api/ai/vetti', [
            'message'=>'the second one', 'conversation_id'=>$id, 'context_topic'=>'services',
        ])->assertOk()->assertJsonMissing(['intent'=>'service_choice']);
    }

}
