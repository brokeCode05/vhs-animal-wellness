<?php
namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\User;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\Providers\GeminiProvider;
use App\Services\AI\PublicClinicFacts;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class VettiPrivacyDiagnosticsTest extends TestCase
{
    public function test_user_backup_has_provider_specific_non_sensitive_diagnostics(): void
    {
        config(['ai.enabled'=>true,'ai.api_key'=>'fictional-key','ai.groq_api_key'=>'fictional-key',
            'ai.groq_user_backup_enabled'=>true,'ai.semantic_privacy_cleared'=>true,'ai.paid_data_approved'=>true]);
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'A fictional answer']]]],200)]);
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        self::assertTrue($gateway->text('semantic_vetti','private synthetic marker','synthetic instructions','sanitized')['ok']);
        $trace=$gateway->semanticCallDiagnostics()[0];
        self::assertTrue($trace['backup_used']);
        self::assertSame(['gemini','groq'],array_column($trace['provider_attempts'],'provider'));
        self::assertSame(['http_error','ok'],array_column($trace['provider_attempts'],'category'));
        self::assertStringNotContainsString('private synthetic marker',json_encode($trace));
        self::assertStringNotContainsString('fictional-key',json_encode($trace));
    }

    public function test_public_private_contacts_do_not_reach_any_provider(): void
    {
        config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $this->mock(PublicClinicFacts::class)->shouldReceive('load')->andReturn([
            'available'=>true,'services'=>[],'service_details'=>[],'services_by_category'=>[],
        ]);
        $provider=new FakeAiProvider('unused'); $this->app->instance(AiProviderInterface::class,$provider);
        foreach (['Call me at 02 8123 4567','My email is fictional@example.test','My pet appointment is private'] as $message) {
            $this->postJson('/api/ai/public-vetti',['message'=>$message,'conversation_id'=>'privacy_test_12345'])
                ->assertOk()->assertJsonPath('data.intent','private');
        }
        self::assertSame(0,$provider->calls);
    }

    public function test_user_private_contacts_and_other_owner_records_do_not_reach_provider(): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        $user=new User; $user->setRawAttributes(['id'=>123,'role'=>'User','status'=>'active',
            'auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $provider=new class implements \App\Services\AI\AiProviderInterface {public array $messages=[];public function generate(string $i,string $m,?array $schema=null):array{$this->messages[]=$m;return ['text'=>'For privacy I can only help with your own account.','usage'=>[]];}}; $this->app->instance(AiProviderInterface::class,$provider);
        foreach (['My email is fictional@example.test','Call me at 02 8123 4567',"Show another owner's pet records"] as $message) {
            $this->postJson('/api/ai/semantic-vetti',['message'=>$message,'conversation_id'=>'privacy_test_12345'])
                ->assertOk();
        }
        self::assertCount(1,$provider->messages);foreach(['fictional@example.test','02 8123 4567',"another owner's"] as $private)self::assertStringNotContainsString($private,$provider->messages[0]);
    }
}
