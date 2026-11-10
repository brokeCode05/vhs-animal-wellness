<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class VettiModelSelectionTest extends TestCase
{
    public function test_vetti_uses_its_own_model_and_scribe_keeps_shared_model(): void
    {
        config(['ai.enabled'=>true,'ai.api_key'=>'synthetic-key', 'ai.model'=>'scribe-model',
            'ai.vetti_model'=>'vetti-model', 'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        Http::fake(['*'=>Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>'ok']]]]]],200)]);
        $gateway=new AiGateway(new GeminiProvider());
        $gateway->startSemanticDeadline(5);
        self::assertTrue($gateway->text('public_vetti','synthetic','synthetic','public')['ok']);
        self::assertTrue($gateway->text('semantic_vetti','synthetic','synthetic','sanitized')['ok']);
        self::assertTrue($gateway->text('scribe','synthetic','synthetic','clinical')['ok']);
        Http::assertSentCount(3);
        Http::assertSent(fn(Request $r)=>str_contains($r->url(),'/vetti-model:generateContent'));
        Http::assertSent(fn(Request $r)=>str_contains($r->url(),'/scribe-model:generateContent'));
    }
}
