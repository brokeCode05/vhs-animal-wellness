<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\ScribeGroundedSummary;
use Tests\TestCase;
final class ScribeGroundedSummaryTest extends TestCase
{
    protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);}
    private function runWith(array $responses):array {
        $provider=new class($responses) implements AiProviderInterface {
            public function __construct(private array $responses) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {return ['text'=>json_encode(array_shift($this->responses) ?? []),'usage'=>[]];}
        };
        return (new ScribeGroundedSummary(new AiGateway($provider)))->generate(['subjective'=>'Owner reports coughing at night and coughing in the morning.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']);
    }
    private function draft():array {return ['subjective'=>'Owner reports coughing at night and in the morning.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];}
    private function audit(bool $supported=true):array {return ['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>$supported]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]];}
    public function test_concise_draft_is_source_linked_and_review_only():void {$r=$this->runWith([$this->draft(),$this->audit(),['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']]);self::assertTrue($r['ok']);self::assertSame($this->draft(),$r['draft']);self::assertSame([1],$r['audit']['audit']['claims'][0]['source_ids']);self::assertStringContainsString('can be wrong',$r['warning']);}
    public function test_unsupported_claim_never_returns_a_draft():void {$r=$this->runWith([$this->draft(),$this->audit(false)]);self::assertFalse($r['ok']);self::assertSame('audit_failed',$r['code']);self::assertArrayNotHasKey('draft',$r);}
    public function test_generator_failure_and_empty_section_mismatch_fail_closed():void {$r=$this->runWith([[]]);self::assertFalse($r['ok']);$d=$this->draft();$d['plan']='Return tomorrow.';$r=$this->runWith([$d]);self::assertSame('empty_section_mismatch',$r['code']);}
    public function test_meaning_review_rejection_or_unavailability_never_returns_a_draft():void {
        foreach (['changed','uncertain'] as $verdict) {
            $r=$this->runWith([$this->draft(),$this->audit(),['subjective'=>$verdict,'objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']]);
            self::assertFalse($r['ok']);self::assertSame('meaning_review_failed',$r['code']);self::assertArrayNotHasKey('draft',$r);
        }
        $r=$this->runWith([$this->draft(),$this->audit(),[]]);self::assertSame('meaning_review_failed',$r['code']);
    }
    public function test_longer_subjective_fits_without_truncation_and_requires_review_checks():void {
        $long=str_repeat('Relevant detail. ',98);
        self::assertGreaterThan(1000,strlen($long));self::assertLessThan(2000,strlen($long));$long=trim($long);
        $outputs=[['subjective'=>$long,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'],
            ['claims'=>array_map(static fn($i)=>['id'=>$i,'source_ids'=>[1],'supported'=>true],range(1,98)),
             'sources'=>[['id'=>1,'claim_ids'=>range(1,98),'relevant'=>true,'covered'=>true]]],
            ['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']];
        $provider=new class($outputs) implements AiProviderInterface {public int $calls=0;public function __construct(private array $outputs){}public function generate(string $instructions,string $message,?array $schema=null):array {$this->calls++;return ['text'=>json_encode(array_shift($this->outputs)??[]),'usage'=>[]];}};
        $sources=['subjective'=>'Fictional source.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
        $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources);
        self::assertTrue($result['ok']);self::assertSame($long,$result['draft']['subjective']);self::assertSame(3,$provider->calls);
    }

    public function test_oversized_draft_is_retried_without_truncation_and_still_audited():void {
        $outputs=[['subjective'=>str_repeat('x',2001),'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'],
            ['subjective'=>'No vomiting.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'],
            ['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]],
            ['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent']];
        $provider=new class($outputs) implements AiProviderInterface {public array $instructions=[];public function __construct(private array $outputs){}public function generate(string $instructions,string $message,?array $schema=null):array {$this->instructions[]=$instructions;return ['text'=>json_encode(array_shift($this->outputs)??[]),'usage'=>[]];}};
        $sources=['subjective'=>'No vomiting.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
        $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources);
        self::assertTrue($result['ok']);self::assertSame('No vomiting.',$result['draft']['subjective']);self::assertCount(4,$provider->instructions);
        self::assertStringContainsString('exceeded a field limit',$provider->instructions[1]);
        $unsafe=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $schema=null):array {$this->calls++;return ['text'=>json_encode(['subjective'=>str_repeat('x',2001),'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];}};
        $failure=(new ScribeGroundedSummary(new AiGateway($unsafe)))->generate($sources);
        self::assertFalse($failure['ok']);self::assertSame('invalid_section',$failure['code']);self::assertSame(2001,$failure['sectionLength']);self::assertSame(2,$unsafe->calls);self::assertArrayNotHasKey('draft',$failure);
    }

    public function test_audit_failure_never_returns_a_draft():void {$r=$this->runWith([$this->draft(),[]]);self::assertFalse($r['ok']);self::assertSame('audit_failed',$r['code']);}

 public function test_retry_reuses_draft_and_audit_after_temporary_review_failure():void {
  $sources=['subjective'=>'Owner reports cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements \App\Services\AI\AiProviderInterface {
   public int $calls=0;
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $this->calls++;
    if($this->calls===1) $data=['subjective'=>'Cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
    elseif($this->calls===2) $data=['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]];
    elseif($this->calls===3) throw new \App\Services\AI\AiProviderException('rate_limit',429);
    else $data=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
    return ['text'=>json_encode($data),'usage'=>[]];
   }
  };
  $service=new \App\Services\AI\ScribeGroundedSummary(new \App\Services\AI\AiGateway($provider));
  $first=$service->generate($sources);
  self::assertFalse($first['ok']);self::assertSame('rate_limit',$first['failure']);self::assertArrayHasKey('checkpoint',$first);
  $second=$service->generate($sources,[],[],$first['checkpoint']);
  self::assertTrue($second['ok']);self::assertSame('Cough.',$second['draft']['subjective']);self::assertSame(4,$provider->calls);
 }

 public function test_retry_reuses_draft_after_temporary_audit_failure_and_invalidates_changed_source():void {
  $sources=['subjective'=>'Owner reports cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements \App\Services\AI\AiProviderInterface {
   public int $calls=0;
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $this->calls++;
    if($this->calls===1) $data=['subjective'=>'Cough.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
    elseif($this->calls===2) throw new \App\Services\AI\AiProviderException('rate_limit',429);
    elseif($this->calls===3) $data=['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]];
    elseif($this->calls===4) $data=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
    else throw new \App\Services\AI\AiProviderException('rate_limit',429);
    return ['text'=>json_encode($data),'usage'=>[]];
   }
  };
  $service=new \App\Services\AI\ScribeGroundedSummary(new \App\Services\AI\AiGateway($provider));
  $first=$service->generate($sources);self::assertFalse($first['ok']);self::assertSame('rate_limit',$first['failure']);
  $second=$service->generate($sources,[],[],$first['checkpoint']);self::assertTrue($second['ok']);self::assertSame(4,$provider->calls);
  $sources['subjective']='Owner reports no cough.';
  $third=$service->generate($sources,[],[],$first['checkpoint']);self::assertFalse($third['ok']);self::assertSame(5,$provider->calls);self::assertSame('generator_unavailable',$third['code']);
 }
}
