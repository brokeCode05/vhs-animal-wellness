<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
final class GroqUserBackupTest extends TestCase {
 protected function setUp():void { parent::setUp(); config(['ai.enabled'=>true,'ai.api_key'=>'synthetic','ai.groq_api_key'=>'synthetic','ai.groq_user_backup_enabled'=>true,'ai.semantic_privacy_cleared'=>true,'ai.paid_data_approved'=>true]); Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'Safe reply']]]],200)]); }
 public function test_sanitized_user_can_fall_back():void { $g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);$r=$g->text('semantic_vetti','PET_1 fictional','instructions','sanitized');self::assertTrue($r['ok']);Http::assertSent(fn(Request $q)=>str_contains($q->url(),'api.groq.com')); }
 public function test_user_backup_requires_clearance():void {config(['ai.semantic_privacy_cleared'=>false]);$g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);$g->text('semantic_vetti','fictional','instructions','sanitized');Http::assertNotSent(fn(Request $q)=>str_contains($q->url(),'api.groq.com'));}
 public function test_personal_data_never_uses_backup():void {$g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);$g->text('semantic_vetti','fictional','instructions','personal');Http::assertNotSent(fn(Request $q)=>str_contains($q->url(),'api.groq.com'));}
 public function test_clinical_never_uses_backup():void {$g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);$g->text('scribe','fictional','instructions','clinical');Http::assertNotSent(fn(Request $q)=>str_contains($q->url(),'api.groq.com'));}

 public function test_vetti_budget_reserves_room_for_reasoning_without_changing_the_global_or_scribe_limit():void {
  config(['ai.max_output_tokens'=>640,'ai.vetti_groq_max_output_tokens'=>2048]);
  $g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(12);$g->text('semantic_vetti','fictional','instructions','sanitized');
  Http::assertSent(fn(Request $q)=>str_contains($q->url(),'api.groq.com')&&$q['max_completion_tokens']===2048);
  self::assertSame(640,config('ai.max_output_tokens'));
 }
 public function test_primary_groq_vetti_uses_the_same_bounded_completion_budget():void {
  config(['ai.max_output_tokens'=>640,'ai.vetti_groq_max_output_tokens'=>2048]);
  $g=new AiGateway(new \App\Services\AI\Providers\GroqProvider());$g->startSemanticDeadline(12);$g->text('semantic_vetti','fictional','instructions','sanitized');
  Http::assertSent(fn(Request $q)=>str_contains($q->url(),'api.groq.com')&&$q['max_completion_tokens']===2048);
 }
 public function test_vetti_primary_has_time_to_finish_without_exceeding_shared_deadline():void {
  $seen=[];config(['ai.vetti_primary_timeout'=>60]);
  Http::fake(function($q,$opts)use(&$seen){if(str_contains($q->url(),'generativelanguage.googleapis.com')){$seen=$opts;throw new \Illuminate\Http\Client\ConnectionException('timed out');}return Http::response(['choices'=>[['message'=>['content'=>'Safe reply']]]],200);});
  $g=new AiGateway(new GeminiProvider());$g->startSemanticDeadline(24);$r=$g->text('semantic_vetti','fictional','instructions','sanitized');
  self::assertTrue($r['ok']);self::assertGreaterThan(4.0,$seen['timeout']);self::assertLessThanOrEqual(10.0,$seen['timeout']);
 }
}
