<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GroqPublicBackupTest extends TestCase
{
    protected function setUp(): void {
        parent::setUp();
        config(['ai.enabled'=>true,'ai.api_key'=>'synthetic-gemini','ai.groq_api_key'=>'synthetic-groq',
            'ai.groq_public_backup_enabled'=>true,'ai.groq_user_backup_enabled'=>false,'ai.groq_model'=>'openai/gpt-oss-20b']);
    }

    private function mockedProviders(string $text='Verified reply'): void {
        Http::fake([
            'generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>$text]]]],200),
        ]);
    }

    public function test_public_503_uses_backup_with_same_deadline(): void {
        $this->mockedProviders();
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $reply=$gateway->text('public_vetti','synthetic public question','synthetic instructions','sanitized');
        self::assertTrue($reply['ok']); self::assertSame('Verified reply',$reply['text']);
        self::assertTrue($reply['execution']['public_backup_used']);
        $trace=$gateway->semanticCallDiagnostics()[0];
        self::assertTrue($trace['backup_used']);
        self::assertSame(['gemini','groq'],array_column($trace['provider_attempts'],'provider'));
        self::assertSame(['http_error','ok'],array_column($trace['provider_attempts'],'category'));
        self::assertSame([503,null],array_column($trace['provider_attempts'],'http_status'));
        self::assertIsInt($trace['provider_attempts'][0]['duration_ms']);
        self::assertStringNotContainsString('synthetic public question',json_encode($trace));
        self::assertStringNotContainsString('synthetic instructions',json_encode($trace));
        self::assertStringNotContainsString('synthetic-groq',json_encode($trace));
        Http::assertSent(fn(Request $r)=>str_contains($r->url(),'api.groq.com'));
    }

    public function test_backup_structured_output_is_validated_by_laravel(): void {
        $this->mockedProviders('{"intent":"unexpected"}');
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string','enum'=>['service']]],'required'=>['intent'],'additionalProperties'=>false];
        $reply=$gateway->structured('public_vetti','synthetic','instructions','sanitized',$schema);
        self::assertFalse($reply['ok']); self::assertSame('invalid_schema',$reply['error_code']);
        $trace=$gateway->semanticCallDiagnostics()[0];
        self::assertTrue($trace['backup_used']);
        self::assertSame(['http_error','invalid_schema'],array_column($trace['provider_attempts'],'category'));
    }

    public function test_backup_never_receives_user_or_clinical_tasks(): void {
        $this->mockedProviders();
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $gateway->text('semantic_vetti','synthetic','instructions','sanitized');
        Http::assertNotSent(fn(Request $r)=>str_contains($r->url(),'api.groq.com'));
    }

    public function test_backup_disabled_means_no_groq_request(): void {
        config(['ai.groq_public_backup_enabled'=>false]); $this->mockedProviders();
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $gateway->text('public_vetti','synthetic','instructions','public');
        Http::assertNotSent(fn(Request $r)=>str_contains($r->url(),'api.groq.com'));
    }

    public function test_raw_json_is_not_shown_as_a_conversational_answer(): void {
        $this->mockedProviders('{"status":"not_found"}');
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $result=$gateway->text('public_vetti','synthetic','instructions','public');
        self::assertFalse($result['ok']); self::assertStringNotContainsString('not_found',$result['text']);
    }

    public function test_expired_deadline_does_not_send_to_backup(): void {
        $this->mockedProviders(); $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(0.1);
        $gateway->text('public_vetti','synthetic','instructions','public');
        Http::assertNothingSent();
    }
    public function test_both_providers_failing_returns_honest_fallback(): void {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['error'=>['message'=>'secret synthetic detail']],429)]);
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $result=$gateway->text('public_vetti','synthetic','instructions','public');
        self::assertFalse($result['ok']); self::assertSame('rate_limit',$result['provider_failure']);
        self::assertTrue($result['execution']['public_backup_used']);
        self::assertStringNotContainsString('secret synthetic detail',json_encode($result));
        $trace=$gateway->semanticCallDiagnostics()[0];
        self::assertSame(['http_error','rate_limit'],array_column($trace['provider_attempts'],'category'));
        self::assertStringNotContainsString('secret synthetic detail',json_encode($trace));
    }

    public function test_backup_does_not_bypass_privacy_data_class(): void {
        $this->mockedProviders(); config(['ai.paid_data_approved'=>false]);
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $result=$gateway->text('public_vetti','synthetic','instructions','personal');
        self::assertSame('privacy_blocked',$result['error_code']);
        Http::assertNothingSent();
    }

    public function test_503_switches_without_repeated_primary_requests(): void {
        $this->mockedProviders(); $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        self::assertTrue($gateway->text('public_vetti','synthetic','instructions','public')['ok']);
        Http::assertSentCount(2);
    }

    public function test_primary_timeout_is_capped_and_falls_back(): void {
        $seen=[];
        Http::fake(function ($request, $options) use (&$seen) {
            if (str_contains($request->url(),'generativelanguage.googleapis.com')) {
                $seen=$options;
                throw new \Illuminate\Http\Client\ConnectionException('timed out');
            }
            return Http::response(['choices'=>[['message'=>['content'=>'Verified reply']]]],200);
        });
        $gateway=new AiGateway(new GeminiProvider()); $gateway->startSemanticDeadline(12);
        $reply=$gateway->text('public_vetti','synthetic','instructions','public');
        self::assertTrue($reply['ok']); self::assertTrue($reply['execution']['public_backup_used']);
        self::assertGreaterThan(4.0,$seen['timeout']);
        self::assertLessThanOrEqual(8.0,$seen['timeout']); // twelve-second deadline reserves four for backup
    }

    public function test_invalid_primary_json_falls_back_to_valid_backup(): void {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>'invalid']]]]]],200),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'{"intent":"service"}']]]],200)]);
        $g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string','enum'=>['service']]],'required'=>['intent'],'additionalProperties'=>false];
        $result=$g->structured('public_vetti','synthetic','instructions','public',$schema);
        self::assertTrue($result['ok']);self::assertTrue($result['execution']['public_backup_used']);self::assertSame('service',$result['data']['intent']);
    }
    public function test_invalid_backup_schema_is_rejected_after_invalid_primary(): void {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>'{}']]]]]],200),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'{"intent":"other"}']]]],200)]);
        $g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string','enum'=>['service']]],'required'=>['intent'],'additionalProperties'=>false];
        $result=$g->structured('public_vetti','synthetic','instructions','public',$schema);
        self::assertFalse($result['ok']);self::assertSame('invalid_schema',$result['error_code']);
    }

}
