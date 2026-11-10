<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiProviderException;
use App\Services\AI\Providers\GroqProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GroqSchemaRetryTest extends TestCase {
    public function test_one_bounded_retry_for_provider_schema_generation_failure(): void {
        config(['ai.groq_api_key'=>'fictional']);
        Http::fake(['api.groq.com/*'=>Http::sequence()
            ->push(['error'=>['code'=>'json_validate_failed']],400)
            ->push(['choices'=>[['message'=>['content'=>'{"intent":"booking"}']]]],200)]);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string']],'required'=>['intent']];
        $result=(new GroqProvider())->generateWithTimeout('instructions','synthetic',$schema,5);
        self::assertSame('{"intent":"booking"}',$result['text']);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request['response_format']['type'] === 'json_object'
            && str_contains($request['messages'][0]['content'], '"intent"')
            && !str_contains($request['messages'][0]['content'], 'Correct invalid schema fields:'));
    }
    public function test_opt_in_attempt_diagnostics_show_retry_without_sensitive_text(): void {
        config(['ai.groq_api_key'=>'fictional-secret','ai.diagnostics_enabled'=>true]);
        \Illuminate\Support\Facades\Log::shouldReceive('notice')->once()->with('AI Groq attempt',\Mockery::on(fn($v)=>$v===['attempt'=>1,'http_status'=>400,'format'=>'json_schema','code'=>'json_validate_failed','local_validation'=>'not_checked']));
        \Illuminate\Support\Facades\Log::shouldReceive('notice')->once()->with('AI Groq attempt',\Mockery::on(fn($v)=>$v===['attempt'=>2,'http_status'=>200,'format'=>'json_object','code'=>null,'local_validation'=>'valid']));
        Http::fake(['api.groq.com/*'=>Http::sequence()->push(['error'=>['code'=>'json_validate_failed','message'=>'private transcript']],400)
            ->push(['choices'=>[['message'=>['content'=>'{"intent":"booking"}']]]],200)]);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string','enum'=>['booking']]],'required'=>['intent']];
        (new GroqProvider())->generateWithTimeout('private instructions','private transcript',$schema,5);
    }
    public function test_other_400_errors_are_not_retried(): void {
        config(['ai.groq_api_key'=>'fictional']);
        Http::fake(['api.groq.com/*'=>Http::response(['error'=>['code'=>'other']],400)]);
        try { (new GroqProvider())->generateWithTimeout('instructions','synthetic',['type'=>'object'],5); self::fail('Expected failure'); }
        catch (AiProviderException $e) { self::assertSame('http_error',$e->category); }
        Http::assertSentCount(1);
    }
    public function test_invalid_successful_structured_response_is_retried_once(): void {
        config(['ai.groq_api_key'=>'fictional']);
        Http::fake(['api.groq.com/*'=>Http::sequence()
            ->push(['choices'=>[['message'=>['content'=>'{"intent":"wrong"}']]]],200)
            ->push(['choices'=>[['message'=>['content'=>'{"intent":"booking"}']]]],200)]);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string','enum'=>['booking']]],'required'=>['intent']];
        $result=(new GroqProvider())->generateWithTimeout('instructions','synthetic',$schema,5);
        self::assertSame('{"intent":"booking"}',$result['text']);
        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request['response_format']['type'] === 'json_object'
            && str_contains($request['messages'][0]['content'], '"intent"')
            && !str_contains($request['messages'][0]['content'], 'Correct invalid schema fields:'));
    }

    public function test_length_finish_reason_is_reported_without_response_content(): void {
        config(['ai.groq_api_key'=>'fictional']);
        Http::fake(['api.groq.com/*'=>Http::response(['choices'=>[['finish_reason'=>'length','message'=>['content'=>'Fictional']]]],200)]);
        try {(new GroqProvider())->generateWithTimeout('instructions','synthetic',null,5);self::fail('Incomplete output must be rejected');}
        catch (\App\Services\AI\AiProviderException $e) {self::assertSame('incomplete_response',$e->category);self::assertSame('MAX_TOKENS',$e->metadata['finish_reason']);self::assertStringNotContainsString('Fictional',json_encode($e->metadata));}
    }

    public function test_rate_limit_does_not_trigger_an_automatic_retry(): void {
        config(['ai.groq_api_key'=>'fictional']);
        Http::fake(['api.groq.com/*'=>Http::response(['error'=>['code'=>'rate_limit_exceeded']],429)]);
        try { (new GroqProvider())->generateWithTimeout('instructions','synthetic',['type'=>'object'],5); self::fail('Expected failure'); }
        catch (AiProviderException $e) { self::assertSame('rate_limit',$e->category); }
        Http::assertSentCount(1);
    }
    public function test_retry_feedback_names_invalid_fields_without_copying_rejected_values():void {
        config(['ai.groq_api_key'=>'fictional']);
        Http::fake(['api.groq.com/*'=>Http::sequence()
            ->push(['choices'=>[['message'=>['content'=>'{"intent":"REJECTED_PRIVATE_VALUE"}']]]],200)
            ->push(['choices'=>[['message'=>['content'=>'{"intent":"booking"}']]]],200)]);
        $schema=['type'=>'object','properties'=>['intent'=>['type'=>'string','enum'=>['booking']]],'required'=>['intent']];
        (new GroqProvider())->generateWithTimeout('instructions','synthetic',$schema,5,null,null,'vetti');
        Http::assertSent(fn($r)=>$r['response_format']['type']==='json_object'
            &&str_contains($r['messages'][0]['content'],'Correct invalid schema fields: ["intent"]')
            &&!str_contains($r['messages'][0]['content'],'REJECTED_PRIVATE_VALUE'));
        Http::assertSentCount(2);
    }
}
