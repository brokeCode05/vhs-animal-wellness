<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\ScribeClaimAudit;
use Tests\TestCase;
final class ScribeClaimAuditTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);}
 private function check(array $result):array {
  $provider=new class($result) implements AiProviderInterface {public function __construct(private array $r){} public function generate(string $instructions,string $message,?array $jsonSchema=null):array{return ['text'=>json_encode($this->r),'usage'=>[]];}};
  $source=['subjective'=>'Owner reports coughing. No vomiting.','objective'=>'On examination the left ear is red.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $draft=['subjective'=>'Owner reports cough and no vomiting.','objective'=>'Left ear redness on exam.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  return (new ScribeClaimAudit(new AiGateway($provider)))->audit($source,$draft);
 }
 private function valid():array {return ['claims'=>[['id'=>1,'source_ids'=>[1,2],'supported'=>true],['id'=>2,'source_ids'=>[3],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true],['id'=>2,'claim_ids'=>[1],'relevant'=>true,'covered'=>true],['id'=>3,'claim_ids'=>[2],'relevant'=>true,'covered'=>true]]];}
 public function test_complete_cross_referenced_audit():void {$r=$this->check($this->valid());self::assertTrue($r['ok']);self::assertCount(3,$r['sources']);}
 public function test_uncovered_relevant_source_is_rejected():void {$v=$this->valid();$v['sources'][1]['covered']=false;$r=$this->check($v);self::assertSame('source_uncovered',$r['code']);self::assertSame('No vomiting.',$r['reviewSources'][0]['text']);}
 public function test_statement_limit_is_reported_without_a_provider_call():void {
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $schema=null):array {$this->calls++;return ['text'=>'{}','usage'=>[]];}};
  $source=['subjective'=>trim(str_repeat('A. ',101)),'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $draft=['subjective'=>'Summary.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $r=(new ScribeClaimAudit(new AiGateway($provider)))->audit($source,$draft);self::assertFalse($r['ok']);self::assertSame('audit_too_many_statements',$r['code']);self::assertSame(0,$provider->calls);
 }
 public function test_unsupported_or_cross_section_claim_is_rejected():void {$v=$this->valid();$v['claims'][0]['supported']=false;self::assertSame('claim_unverified',$this->check($v)['code']);$v=$this->valid();$v['claims'][0]['source_ids']=[3];self::assertSame('invalid_source_reference',$this->check($v)['code']);}
 public function test_missing_duplicate_and_inconsistent_references_are_rejected():void {$v=$this->valid();array_pop($v['sources']);self::assertFalse($this->check($v)['ok']);$v=$this->valid();$v['claims'][]=$v['claims'][0];self::assertFalse($this->check($v)['ok']);$v=$this->valid();$v['sources'][1]['claim_ids']=[];$v['sources'][1]['relevant']=false;self::assertFalse($this->check($v)['ok']);}
 public function test_irrelevant_judgment_remains_visible_for_review():void {$v=$this->valid();$v['sources'][1]['relevant']=false;$r=$this->check($v);self::assertTrue($r['ok']);self::assertSame('No vomiting.',$r['reviewSources'][0]['text']);}
 public function test_a_falsely_approving_model_can_still_pass():void {self::assertTrue($this->check($this->valid())['ok']);}
}
