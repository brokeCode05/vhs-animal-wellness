<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class SemanticDeadlineTest extends TestCase
{
    public function test_remaining_budget_caps_gemini_timeout(): void
    {
        config(['ai.enabled'=>true,'ai.api_key'=>'synthetic-key','ai.timeout'=>40,'ai.connect_timeout'=>5]);
        $optionsSeen=[];
        Http::fake(function ($request, $options) use (&$optionsSeen) {
            $optionsSeen=$options;
            return Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>'Safe response']]]]]],200);
        });
        $gateway=new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(1.5);
        $result=$gateway->text('semantic_vetti','synthetic question','synthetic instructions','sanitized');
        $this->assertTrue($result['ok']);
        $this->assertGreaterThanOrEqual(0.5,$optionsSeen['timeout']);
        $this->assertLessThanOrEqual(1.5,$optionsSeen['timeout']);
        $this->assertLessThanOrEqual($optionsSeen['timeout'],$optionsSeen['connect_timeout']);
        $this->assertSame('response',$gateway->semanticCallDiagnostics()[0]['stage']);
        $this->assertSame('ok',$gateway->semanticCallDiagnostics()[0]['category']);
    }

    public function test_expired_budget_prevents_a_second_provider_call(): void
    {
        config(['ai.enabled'=>true]);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++; usleep(80000); return ['text'=>'Safe response','usage'=>[]];
            }
        };
        $gateway=new AiGateway($provider);
        $gateway->startSemanticDeadline(0.55);
        $first=$gateway->text('semantic_vetti','synthetic question','synthetic instructions','sanitized');
        $second=$gateway->text('semantic_vetti','synthetic follow up','synthetic instructions','sanitized');
        $this->assertTrue($first['ok']);
        $this->assertFalse($second['ok']);
        $this->assertSame('deadline',$second['provider_failure']);
        $this->assertFalse($second['execution']['provider_invoked']);
        $this->assertSame(1,$provider->calls);
        $this->assertSame('deadline',$gateway->semanticCallDiagnostics()[1]['category']);
        $this->assertStringNotContainsString('synthetic question',json_encode($gateway->semanticCallDiagnostics()));
    }
}
