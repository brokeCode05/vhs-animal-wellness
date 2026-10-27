<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\UserVettiFacts;
use Tests\TestCase;

final class SemanticVettiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
    }

    private function asUser(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id'=>123,'name'=>'Owner','role'=>'User','status'=>'active',
            'auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00',
        ]);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
    }

    private function enabled(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.semantic_vetti_enabled', true);
        config()->set('ai.paid_data_approved', true);
        config()->set('ai.semantic_privacy_cleared', true);
    }

    private function chat(string $message): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/ai/semantic-vetti', [
            'message'=>$message,'conversation_id'=>'chat_abc123456789',
        ]);
    }

    public function test_auth_and_feature_gates_fail_closed(): void
    {
        $this->postJson('/api/ai/semantic-vetti', [
            'message'=>'Book a bath','conversation_id'=>'chat_abc123456789',
        ])->assertUnauthorized();
        $this->asUser();
        $this->chat('Can Bornok get a bath tomorrow?')
            ->assertOk()->assertJsonPath('data.mode','disabled');
        $this->enabled();
        config()->set('ai.semantic_privacy_cleared', false);
        $this->chat('Can Bornok get a bath tomorrow?')
            ->assertOk()->assertJsonPath('data.mode','disabled');
    }

    public function test_anonymized_booking_may_propose_but_never_write(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
        ]);
        app(UserVettiFacts::class)->shouldReceive('ownsPet')->once()->withArgs(
            fn (User $user, int $id): bool => $user->id===123 && $id===7
        )->andReturn(true);
        $spy = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                $this->inputs[] = $message;
                return ['text'=>json_encode([
                    'intent'=>'booking','pet_ref'=>'PET_1','service'=>'grooming',
                    // Gemini normalizes the original Tagalog 'bukas' into English.
                    'date_expression'=>'tomorrow','time_preference'=>'none',
                    'negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
                ]), 'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        $this->chat('Gusto ko sana paliguan si Bornok bukas.')
            ->assertOk()->assertJsonPath('data.mode','semantic')
            ->assertJsonPath('data.kind','booking_proposal')
            ->assertJsonPath('data.pet_id',7)
            ->assertJsonPath('data.booking_created',false)
            ->assertJsonPath('data.requires_confirmation',true);
        $this->assertCount(1, $spy->inputs);
        $this->assertStringNotContainsString('Bornok', $spy->inputs[0]);
        $this->assertStringContainsString('PET_1', $spy->inputs[0]);
    }

    public function test_model_cannot_invent_a_date_for_a_dated_booking(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
        ]);
        $this->app->instance(AiProviderInterface::class,
            new \App\Services\AI\Providers\FakeAiProvider(json_encode([
                'intent'=>'booking', 'pet_ref'=>'PET_1', 'service'=>'grooming',
                'date_expression'=>'tomorrow', 'time_preference'=>'none',
                'negated'=>false, 'multiple_services'=>false, 'needs_clarification'=>false,
            ])));
        // There is no date in the original request, despite the model output.
        $this->chat('Gusto ko sana paliguan si Bornok.')
            ->assertOk()->assertJsonPath('data.mode', 'semantic')
            ->assertJsonPath('data.kind', 'information');
    }

    public function test_day_after_tomorrow_cannot_be_reduced_to_tomorrow(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
        ]);
        $this->app->instance(AiProviderInterface::class,
            new \App\Services\AI\Providers\FakeAiProvider(json_encode([
                'intent'=>'booking', 'pet_ref'=>'PET_1', 'service'=>'grooming',
                'date_expression'=>'tomorrow', 'time_preference'=>'none',
                'negated'=>false, 'multiple_services'=>false, 'needs_clarification'=>false,
            ])));
        $this->chat('Book Bornok for grooming the day after tomorrow.')
            ->assertOk()->assertJsonPath('data.mode', 'semantic')
            ->assertJsonPath('data.kind', 'information');
    }

    public function test_unsafe_third_party_and_multiple_pet_requests_bypass_provider(): void
    {
        $this->asUser();
        $this->enabled();
        $fake = new \App\Services\AI\Providers\FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->chat("Book grooming for my neighbor's dog tomorrow")
            ->assertOk()->assertJsonPath('data.kind','information');
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Cat'],
            ['id'=>8,'name'=>'John','species'=>'Dog'],
        ]);
        $this->chat('I want Bornok vaccinated and John groomed tomorrow')
            ->assertOk()->assertJsonPath('data.kind','information');
        $this->assertSame(0, $fake->calls);
    }

    public function test_invalid_model_json_falls_back_without_book_action(): void
    {
        $this->asUser();
        $this->enabled();
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->once()->andReturn([
            ['id'=>7,'name'=>'Bornok','species'=>'Dog'],
        ]);
        $this->app->instance(AiProviderInterface::class,
            new \App\Services\AI\Providers\FakeAiProvider('not JSON'));
        $this->chat('Book Bornok grooming tomorrow')
            ->assertOk()->assertJsonPath('data.mode','fallback');
    }
}
