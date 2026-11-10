<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\ScribeChunkedInventory;
use Tests\TestCase;
final class ScribeChunkedInventoryTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);}
 public function test_diagnostic_callback_contains_only_provider_metadata():void {
  $provider=new class implements AiProviderInterface {public function generate(string $instructions,string $message,?array $jsonSchema=null):array {return ['text'=>json_encode(['segments'=>[['segment_id'=>1,'quotes'=>[]]]]),'usage'=>[]];}};
  $trace=[];$service=new ScribeChunkedInventory(new AiGateway($provider),static function(array $item) use (&$trace){$trace[]=$item;});$r=$service->extract('Fictional private consultation.',800);
  self::assertTrue($r['complete']);self::assertSame('ok',$trace[0]['result']);self::assertSame('configured',$trace[0]['providers'][0]['provider']);self::assertArrayHasKey('duration_ms',$trace[0]['providers'][0]);self::assertStringNotContainsString('Fictional private consultation.',json_encode($trace));
 }
 public function test_rate_limit_stops_further_calls_and_preserves_all_chunks():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;throw new \App\Services\AI\AiProviderException('rate_limit',429);}};
  $source='first words second words third words';$r=(new ScribeChunkedInventory(new AiGateway($provider)))->extract($source,12);self::assertFalse($r['complete']);self::assertSame(1,$provider->calls);self::assertSame($source,implode('',array_column($r['chunks'],'text')));self::assertSame('rate_limit',$r['chunks'][0]['failure']);self::assertSame('not_attempted',$r['chunks'][1]['error']);self::assertSame(0,$r['chunks'][1]['attempts']);
 }
 public function test_adjacent_context_is_provided_without_duplicate_source_chunks():void {
  $provider=new class implements AiProviderInterface {public array $requests=[];public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$input=json_decode($message,true);$this->requests[]=$input;$rows=array_map(static fn($segment)=>['segment_id'=>$segment['id'],'quotes'=>[]],$input['segments']);return ['text'=>json_encode(['segments'=>$rows]),'usage'=>[]];}};
  $source='first words second words';$r=(new ScribeChunkedInventory(new AiGateway($provider)))->extract($source,12);
  self::assertTrue($r['complete']);self::assertSame($source,implode('',array_column($r['chunks'],'text')));self::assertSame('',$provider->requests[0]['context_before']);self::assertSame($r['chunks'][1]['text'],$provider->requests[0]['context_after']);self::assertSame($r['chunks'][0]['text'],$provider->requests[1]['context_before']);self::assertSame('',$provider->requests[1]['context_after']);
 }
 public function test_long_fictional_transcript_is_preserved_across_extraction_chunks():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;$input=json_decode($message,true);$rows=array_map(static fn($segment)=>['segment_id'=>$segment['id'],'quotes'=>[]],$input['segments']);return ['text'=>json_encode(['segments'=>$rows]),'usage'=>[]];}};
  $source=str_repeat('Fictional conversation without identifiable details. ',110);$r=(new ScribeChunkedInventory(new AiGateway($provider)))->extract($source,800);
  self::assertGreaterThan(3500,strlen($source));self::assertTrue($r['ok']);self::assertTrue($r['complete']);self::assertGreaterThan(1,$provider->calls);self::assertSame($source,implode('',array_column($r['chunks'],'text')));self::assertSame($source,$r['transcript']);
 }
 public function test_invalid_quote_is_retried_without_losing_source():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public array $instructions=[];public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->instructions[]=$instructions;$this->calls++;$quote=$this->calls===1?'invented':'Cough.';return ['text'=>json_encode(['segments'=>[['segment_id'=>1,'quotes'=>[['text'=>$quote,'category'=>'subjective']]]]]),'usage'=>[]];}};
  $r=(new ScribeChunkedInventory(new AiGateway($provider)))->extract('Cough.',800);self::assertTrue($r['complete']);self::assertSame(2,$provider->calls);self::assertSame(2,$r['chunks'][0]['attempts']);self::assertSame('Cough.',$r['transcript']);self::assertStringContainsString('entire original segment',$provider->instructions[1]);
 }
 public function test_persistent_invalid_quote_stays_failed_after_bounded_retry():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;return ['text'=>json_encode(['segments'=>[['segment_id'=>1,'quotes'=>[['text'=>'invented','category'=>'subjective']]]]]),'usage'=>[]];}};
  $r=(new ScribeChunkedInventory(new AiGateway($provider)))->extract('Cough.',800);self::assertFalse($r['complete']);self::assertSame(2,$provider->calls);self::assertSame('invalid_quote',$r['chunks'][0]['failure']);self::assertSame('Cough.',$r['chunks'][0]['text']);
 }
 public function test_complete_inventory_can_be_reused_without_provider_calls():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;return ['text'=>json_encode(['segments'=>[['segment_id'=>1,'quotes'=>[]]]]),'usage'=>[]];}};
  $service=new ScribeChunkedInventory(new AiGateway($provider));$first=$service->extract('Fictional cough.',800);$resumed=$service->retryFailed('Fictional cough.',800,$first);self::assertTrue($resumed['complete']);self::assertSame(1,$provider->calls);self::assertSame($first['chunks'],$resumed['chunks']);
 }
 public function test_resume_retries_failed_chunks_without_repeating_successes():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;$input=json_decode($message,true);$rows=array_map(static fn($segment)=>['segment_id'=>$segment['id'],'quotes'=>[]],$input['segments']);return ['text'=>json_encode(in_array($this->calls,[2,3],true)?[]:['segments'=>$rows]),'usage'=>[]];}};
  $service=new ScribeChunkedInventory(new AiGateway($provider));$source='first words second words';$first=$service->extract($source,12);self::assertFalse($first['complete']);self::assertSame(3,$provider->calls);$resumed=$service->retryFailed($source,12,$first);self::assertTrue($resumed['complete']);self::assertSame(4,$provider->calls);self::assertSame($first['chunks'][0],$resumed['chunks'][0]);self::assertSame($source,implode('',array_column($resumed['chunks'],'text')));
 }
 public function test_resume_rejects_changed_transcript_or_manifest():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;return ['text'=>json_encode(['segments'=>[['segment_id'=>1,'quotes'=>[]]]]),'usage'=>[]];}};
  $service=new ScribeChunkedInventory(new AiGateway($provider));$first=$service->extract('Cough.',800);$calls=$provider->calls;self::assertSame('stale_manifest',$service->retryFailed('Cough!',800,$first)['code']);$first['chunks'][0]['text']='Changed';self::assertSame('stale_manifest',$service->retryFailed('Cough.',800,$first)['code']);self::assertSame($calls,$provider->calls);
 }
 public function test_failed_chunk_stays_visible_and_marks_result_incomplete():void {
  $provider=new class implements AiProviderInterface {private int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;$data=$this->calls===1?['segments'=>[['segment_id'=>1,'quotes'=>[]]]]:[];return ['text'=>json_encode($data),'usage'=>[]];}};
  $source='first words second words';$r=(new ScribeChunkedInventory(new AiGateway($provider)))->extract($source,12);
  self::assertTrue($r['ok']);self::assertFalse($r['complete']);self::assertSame($source,implode('',array_column($r['chunks'],'text')));self::assertSame('complete',$r['chunks'][0]['status']);self::assertSame('failed',$r['chunks'][1]['status']);self::assertArrayHasKey('error',$r['chunks'][1]);
 }
}
