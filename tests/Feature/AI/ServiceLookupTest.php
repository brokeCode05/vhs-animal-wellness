<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\UserVettiFacts;
use Tests\TestCase;

final class ServiceLookupTest extends TestCase
{
    private function prepareCatalog(bool $available = true): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        $u = new User;
        $u->setRawAttributes(['id'=>123,'role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
        $this->actingAs($u)->withSession(['auth_version'=>1]);
        config()->set('ai.enabled', true);
        config()->set('ai.semantic_vetti_enabled', true);
        config()->set('ai.service_lookup_enabled', true);
        config()->set('ai.semantic_privacy_cleared', true);
        config()->set('ai.paid_data_approved', true);
        $this->mock(UserVettiFacts::class)->shouldReceive('pets')->andReturn([['id'=>7,'name'=>'Fictionalpet']]);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available'=>$available,'services'=>['Dog Grooming','Cat Grooming','Vaccination'],
        ]);
    }

    public function test_english_filipino_and_taglish_questions_use_verified_catalog(): void
    {
        $this->prepareCatalog();
        $spy = new class implements AiProviderInterface {
            public array $messages = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
                $this->messages[] = $message;
                return ['text'=>json_encode(['matches'=>['Dog Grooming','Cat Grooming'],
                    'answer'=>'Nakalista sa clinic: Dog Grooming, Cat Grooming.']),'usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class, $spy);
        foreach (['Do you offer grooming?','May grooming ba kayo?','Meron ba kayong grooming?'] as $message) {
            $this->postJson('/api/ai/service-lookup',['message'=>$message])->assertOk()
                ->assertJsonPath('data.kind','answer')->assertJsonPath('data.text','Nakalista sa clinic: Dog Grooming, Cat Grooming.');
        }
        $this->assertCount(3, $spy->messages);
        $this->assertStringContainsString('Dog Grooming', $spy->messages[0]);
        $this->assertStringNotContainsString('Fictionalpet', $spy->messages[0]);
    }

    public function test_no_match_and_catalog_unavailable_are_honest(): void
    {
        $this->prepareCatalog();
        $this->app->instance(AiProviderInterface::class, new \App\Services\AI\Providers\FakeAiProvider(json_encode([
            'matches'=>[],'answer'=>'I could not find a matching service in the clinic catalog.',
        ])));
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer hydrotherapy?'])->assertOk()
            ->assertJsonPath('data.kind','answer')->assertJsonPath('data.text','I could not find a matching service in the clinic catalog.');
    }

    public function test_unavailable_catalog_never_calls_provider(): void
    {
        $this->prepareCatalog(false);
        $provider = new \App\Services\AI\Providers\FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming?'])->assertOk()
            ->assertJsonPath('data.kind','unavailable')->assertJsonPath('data.reason','catalog_unavailable');
        $this->assertSame(0, $provider->calls);
    }

    public function test_unverified_generated_claims_and_invalid_json_are_rejected(): void
    {
        $this->prepareCatalog();
        foreach ([
            json_encode(['matches'=>['Dog Grooming'],'answer'=>'Dog Grooming is available tomorrow for free.']),
            json_encode(['matches'=>['Invented Service'],'answer'=>'The clinic lists: Invented Service.']),
            'not JSON',
        ] as $reply) {
            $this->app->instance(AiProviderInterface::class, new \App\Services\AI\Providers\FakeAiProvider($reply));
            $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming?'])->assertOk()->assertJsonPath('data.kind','unavailable');
        }
    }

    public function test_failure_and_private_messages_never_claim_an_answer(): void
    {
        $this->prepareCatalog();
        $provider = new \App\Services\AI\Providers\FakeAiProvider('ignored', true);
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming?'])->assertOk()->assertJsonPath('data.kind','unavailable');
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming for Fictionalpet?'])->assertOk()->assertJsonPath('data.kind','declined');
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming for a dog that is bleeding?'])->assertOk()->assertJsonPath('data.kind','declined');
        $this->assertSame(1, $provider->calls);
    }

    public function test_lookup_requires_authentication(): void
    {
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming?'])->assertUnauthorized();
    }

    public function test_lookup_is_opt_in_and_does_not_call_provider_when_disabled(): void
    {
        $this->prepareCatalog();
        config()->set('ai.service_lookup_enabled', false);
        $provider = new \App\Services\AI\Providers\FakeAiProvider();
        $this->app->instance(AiProviderInterface::class, $provider);
        $this->postJson('/api/ai/service-lookup',['message'=>'Do you offer grooming?'])->assertOk()->assertJsonPath('data.kind','declined');
        $this->assertSame(0, $provider->calls);
    }
}
