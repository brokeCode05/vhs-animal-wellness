<?php
namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\Pet;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class SemanticOwnedPetsTest extends TestCase
{
    use RefreshDatabase;

    public function test_model_interprets_paraphrases_and_laravel_returns_only_owned_pet_ids(): void
    {
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $this->withoutMiddleware(RecordUserAccess::class);
        $owner = User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $other = User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $pet = Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'SyntheticLuna','species'=>'Dog','gender'=>'Female']);
        $stranger = Pet::forceCreate(['owner_id'=>$other->id,'name'=>'SyntheticOther','species'=>'Cat','gender'=>'Female']);
        $this->actingAs($owner)->withSession(['auth_version'=>$owner->auth_version]);
        $provider = new class implements AiProviderInterface {
            public array $calls=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls[]=['message'=>$message,'structured'=>$jsonSchema !== null];
                if ($jsonSchema !== null) return ['text'=>json_encode(['intent'=>'pets_list','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
                return ['text'=>'Here are your registered pets.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        foreach (['Show my pets','Ipakita ang mga alaga ko','Pwede ko bang makita ang pets ko?'] as $i=>$question) {
            $this->postJson('/api/ai/semantic-vetti',['message'=>$question,'conversation_id'=>'chat_test_owned_12345'])
                ->assertOk()->assertJsonPath('data.kind','pets_list')->assertJsonPath('data.source','ai')
                ->assertJsonPath('data.pet_ids',[$pet->id])->assertJsonMissing(['pet_ids'=>[$stranger->id]]);
        }
        $this->assertCount(6,$provider->calls);
        foreach ($provider->calls as $call) {
            $this->assertStringNotContainsString('SyntheticLuna',$call['message']);
            $this->assertStringNotContainsString('SyntheticOther',$call['message']);
            $this->assertStringNotContainsString((string) $pet->id,$call['message']);
        }
        $this->postJson('/api/ai/semantic-vetti',['message'=>"Show someone else's pet",'conversation_id'=>'chat_test_owned_12345'])
            ->assertOk()->assertJsonPath('data.kind','information')->assertJsonMissingPath('data.pet_ids');
        $this->assertCount(7,$provider->calls);self::assertStringNotContainsString("someone else's",end($provider->calls)['message']);
    }

    public function test_no_pets_and_model_failure_are_honest(): void
    {
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $this->withoutMiddleware(RecordUserAccess::class);
        $owner=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $this->actingAs($owner)->withSession(['auth_version'=>$owner->auth_version]);
        $provider=new class implements AiProviderInterface {
            public bool $fail=false;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if ($jsonSchema !== null) return ['text'=>json_encode(['intent'=>'pets_list','pet_ref'=>'none','service'=>'none','date_expression'=>'','time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
                if ($this->fail) throw new \RuntimeException('synthetic outage');
                return ['text'=>'No registered pets were found.','usage'=>[]];
            }
        };
        $this->app->instance(AiProviderInterface::class,$provider);
        $body=['message'=>'Show my pets','conversation_id'=>'chat_test_empty_12345'];
        $this->postJson('/api/ai/semantic-vetti',$body)->assertOk()->assertJsonPath('data.pet_ids',[])->assertJsonPath('data.text','No registered pets were found.');
        $provider->fail=true;
        $this->postJson('/api/ai/semantic-vetti',$body)->assertOk()->assertJsonPath('data.mode','fallback')->assertJsonMissingPath('data.pet_ids');
    }
}
