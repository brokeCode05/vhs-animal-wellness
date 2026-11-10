<?php
namespace Tests\Feature\AI;
use App\Services\AI\{AiGateway,ScribeProviderCooldown};
use App\Services\AI\Providers\{GeminiProvider,GroqProvider};
use Illuminate\Support\Facades\{Http,Cache};
use Tests\TestCase;
final class ScribeCompletionIntegrityTest extends TestCase
{
 protected function setUp():void {parent::setUp();Cache::flush();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true,'ai.groq_scribe_backup_enabled'=>false,'ai.api_key'=>'fictional','ai.groq_api_key'=>'fictional']);}
 private function schema():array {return ['type'=>'object','properties'=>['s'=>['type'=>'string']],'required'=>['s'],'additionalProperties'=>false];}
 public function test_schema_valid_gemini_max_tokens_is_rejected_and_usage_survives():void {
  Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['finishReason'=>'MAX_TOKENS','content'=>['parts'=>[['text'=>'{"s":"valid"}']]]]],'usageMetadata'=>['promptTokenCount'=>11,'candidatesTokenCount'=>20,'thoughtsTokenCount'=>18,'totalTokenCount'=>31]],200)]);
  $g=new AiGateway(new GeminiProvider());$g->startScribeDeadline(30);$r=$g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true);
  self::assertFalse($r['ok']);self::assertSame('incomplete_response',$r['provider_failure']);self::assertSame('MAX_TOKENS',$g->providerAttemptDiagnostics()[0]['finish_reason']);self::assertSame(31,$g->providerAttemptDiagnostics()[0]['usage']['total_tokens']);Http::assertSentCount(1);
 }
 public function test_empty_groq_with_reasoning_usage_is_not_retried_as_a_format_error():void {
  Http::fake(['api.groq.com/*'=>Http::response(['choices'=>[['finish_reason'=>'length','message'=>['content'=>'']]],'usage'=>['prompt_tokens'=>12,'completion_tokens'=>4096,'completion_tokens_details'=>['reasoning_tokens'=>4094],'total_tokens'=>4108]],200)]);
  $g=new AiGateway(new GroqProvider());$g->startScribeDeadline(30);$r=$g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true);
  self::assertFalse($r['ok']);self::assertSame('incomplete_response',$r['provider_failure']);self::assertSame(4094,$g->providerAttemptDiagnostics()[0]['usage']['thinking_tokens']);Http::assertSentCount(1);
 }
 public function test_empty_gemini_preserves_usage_and_never_exposes_thought_text():void {
  Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['finishReason'=>'STOP','content'=>['parts'=>[['thought'=>true,'text'=>'private reasoning']]]]],'usageMetadata'=>['promptTokenCount'=>10,'thoughtsTokenCount'=>50,'totalTokenCount'=>60]],200)]);
  $g=new AiGateway(new GeminiProvider());$g->startScribeDeadline(30);$r=$g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true);
  self::assertFalse($r['ok']);self::assertSame('empty_response',$r['provider_failure']);self::assertSame(60,$g->providerAttemptDiagnostics()[0]['usage']['total_tokens']);self::assertStringNotContainsString('private reasoning',json_encode($r));
 }
 public function test_groq_direct_and_authorized_fallback_have_equal_output_budgets():void {
  config(['ai.groq_scribe_backup_enabled'=>true]);
  Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),'api.groq.com/*'=>Http::response(['choices'=>[['finish_reason'=>'stop','message'=>['content'=>'{"s":"ok"}']]]],200)]);
  foreach ([new GroqProvider(),new GeminiProvider()] as $provider) {$g=new AiGateway($provider);$g->startScribeDeadline(30);self::assertTrue($g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true)['ok']);}
  $requests=Http::recorded(fn($r)=>str_contains($r->url(),'api.groq.com'));self::assertCount(2,$requests);foreach($requests as [$r]) self::assertSame(4096,$r['max_completion_tokens']);
 }
 public function test_long_gemini_scribe_uses_the_same_completion_ceiling_as_groq():void {
  Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['finishReason'=>'STOP','content'=>['parts'=>[['text'=>'{"s":"valid"}']]]]]],200)]);
  $g=new AiGateway(new GeminiProvider());$g->startScribeDeadline(30);self::assertTrue($g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true)['ok']);
  Http::assertSent(fn($r)=>$r['generationConfig']['maxOutputTokens']===4096);
 }
 public function test_format_retry_reports_both_http_calls_and_their_combined_usage():void {
  Http::fake(['api.groq.com/*'=>Http::sequence()->push(['choices'=>[['finish_reason'=>'stop','message'=>['content'=>'{"wrong":1}']]],'usage'=>['prompt_tokens'=>8,'completion_tokens'=>2,'total_tokens'=>10]],200)->push(['choices'=>[['finish_reason'=>'stop','message'=>['content'=>'{"s":"ok"}']]],'usage'=>['prompt_tokens'=>10,'completion_tokens'=>4,'total_tokens'=>14]],200)]);
  $g=new AiGateway(new GroqProvider());$g->startScribeDeadline(30);$r=$g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true);
  self::assertTrue($r['ok']);self::assertSame(24,$r['usage']['total_tokens']);self::assertSame(2,$g->providerAttemptDiagnostics()[0]['http_requests']);Http::assertSentCount(2);
 }
 public function test_shared_cooldown_stops_immediate_repeat_calls_and_renews_with_new_credentials():void {
  Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['error'=>['message'=>'never retain this secret body','details'=>[['violations'=>[['quotaId'=>'GenerateRequestsPerDayPerProject']]]]]],429,['Retry-After'=>'45'])]);
  foreach(range(1,2) as $n) {$g=new AiGateway(new GeminiProvider());$g->startScribeDeadline(30);$r=$g->structured('scribe','fictional source','JSON','clinical',$this->schema(),true,true);self::assertFalse($r['ok']);self::assertSame('rate_limit',$r['provider_failure']);self::assertGreaterThan(0,$r['retry_after_seconds']);}
  Http::assertSentCount(1);self::assertGreaterThan(0,ScribeProviderCooldown::remaining('gemini'));self::assertStringNotContainsString('secret body',json_encode($r));
  config(['ai.api_key'=>'renewed-fictional']);self::assertSame(0,ScribeProviderCooldown::remaining('gemini'));
 }
}
