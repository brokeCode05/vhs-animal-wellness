<?php

namespace Tests\Feature\AI;

use App\Models\Service;
use App\Models\User;
use App\Http\Middleware\RecordUserAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class VettiPartialServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('ai.service_lookup_enabled', false);
        foreach ([
            ['dog_grooming','Dog Grooming',true],
            ['cat_grooming','Cat Grooming',true],
            ['consultation','Consultation',true],
            ['bird_grooming','Bird Grooming',false],
        ] as [$value,$label,$active]) {
            $service = new Service;
            $service->forceFill(['value'=>$value,'label'=>$label,'category'=>'Pet Care','price'=>100,'currency'=>'PHP','active'=>$active])->save();
        }
    }

    public function test_english_and_taglish_lookup_list_only_matching_active_services(): void
    {
        foreach (['Do you offer grooming?', 'May grooming ba kayo?', 'Meron ba kayong grooming?'] as $message) {
            $this->postJson('/api/ai/public-vetti', ['message'=>$message])->assertOk()
                ->assertJsonPath('data.intent','services')->assertJsonPath('data.source','rule')
                ->assertSee('Dog Grooming')->assertSee('Cat Grooming')
                ->assertDontSee('Bird Grooming')->assertDontSee('Consultation');
        }
    }

    public function test_absent_service_is_not_presented_as_available(): void
    {
        foreach (['Do you offer hydrotherapy?', 'May hydrotherapy ba kayo?'] as $message) {
            $this->postJson('/api/ai/public-vetti',['message'=>$message])->assertOk()
                ->assertSee('could not find')->assertDontSee('Dog Grooming');
        }
    }

    public function test_authenticated_portal_routes_both_grooming_questions_to_catalog(): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        $user = new User;
        $user->setRawAttributes(['id'=>987,'role'=>'User','status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
        foreach (['Do you offer grooming?', 'May grooming ba kayo?'] as $message) {
            $this->postJson('/api/ai/vetti',['message'=>$message])->assertOk()
                ->assertJsonPath('data.intent','services')->assertSee('Dog Grooming')->assertSee('Cat Grooming')
                ->assertDontSee('Consultation')->assertDontSee('Bird Grooming');
        }
    }

    public function test_general_service_question_remains_broad(): void
    {
        $this->postJson('/api/ai/public-vetti',['message'=>'What services do you offer?'])->assertOk()
            ->assertSee('Consultation')->assertSee('Dog Grooming')->assertDontSee('Bird Grooming');
    }
}
