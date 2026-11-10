<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\DoctorScribeService;
use Tests\TestCase;
final class DoctorScribeGroundedPilotTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_semantic_summary_enabled'=>true,'ai.scribe_grounded_summary_enabled'=>true]);}
 private function runPilot(bool $supported=true):array {
  $responses=[['subjective'=>'Owner reports coughing at night and morning.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'],['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>$supported]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]],['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']];
  $provider=new class($responses) implements AiProviderInterface {public function __construct(private array $responses){} public function generate(string $instructions,string $message,?array $jsonSchema=null):array{return ['text'=>json_encode(array_shift($this->responses)??[]),'usage'=>[]];}};
  return (new DoctorScribeService(new AiGateway($provider)))->summarizeDraft(['ok'=>true,'soap'=>['subjective'=>'Owner reports coughing at night and coughing in the morning.','objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.'],'warnings'=>[],'saved'=>false]);
 }
 public function test_pilot_exposes_sources_and_keeps_vitals_and_review_status():void {$r=$this->runPilot();self::assertSame('grounded',$r['summaryMethod']);self::assertTrue($r['summaryApplied']);self::assertSame('Owner reports coughing at night and coughing in the morning.',$r['sourceSections']['subjective']);self::assertNull($r['soap']['objective']['weightKg']);self::assertFalse($r['saved']);}
 public function test_pilot_falls_back_when_audit_rejects():void {$r=$this->runPilot(false);self::assertSame('Owner reports coughing at night and coughing in the morning.',$r['soap']['subjective']);self::assertFalse($r['summaryApplied']);self::assertArrayNotHasKey('summaryMethod',$r);}
 public function test_pilot_does_not_run_when_semantic_flag_is_off():void {config(['ai.scribe_semantic_summary_enabled'=>false]);$r=$this->runPilot();self::assertFalse($r['summaryApplied']);self::assertArrayNotHasKey('summaryMethod',$r);}
}
