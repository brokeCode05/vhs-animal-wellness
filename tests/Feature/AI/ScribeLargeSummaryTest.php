<?php
namespace Tests\Feature\AI;
use App\Services\AI\{AiGateway,AiProviderInterface,ScribeGroundedSummary};
use Tests\TestCase;
final class ScribeLargeSummaryTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_summary_input_bytes'=>2500,'ai.scribe_max_input_bytes'=>4000]);}
 public function test_large_sources_are_summarized_per_section_and_references_reindexed():void {
  $a=str_repeat('cough ',220);$b=str_repeat('alert ',220);$source=['subjective'=>$a,'objective'=>$b,'assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class($a,$b) implements AiProviderInterface {public int $calls=0;public function __construct(private string $a,private string $b){} public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$index=$this->calls++;$group=intdiv($index,3);$stage=$index%3;$section=$group===0?'subjective':'objective';$text=$group===0?$this->a:$this->b;if($stage===0){$v=['subjective'=>'Not provided.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];$v[$section]='Short draft.';}elseif($stage===1)$v=['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]];else $v=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];return ['text'=>json_encode($v),'usage'=>[]];}};
  $r=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($source);self::assertTrue($r['ok']);self::assertSame(6,$provider->calls);self::assertSame('Short draft.',$r['draft']['subjective']);self::assertSame('Short draft.',$r['draft']['objective']);self::assertSame([2],$r['audit']['audit']['claims'][1]['source_ids']);self::assertSame([2],$r['audit']['audit']['sources'][1]['claim_ids']);self::assertSame($source,$r['sources']);
 }
 public function test_duplicate_context_can_use_one_shared_summary_without_losing_sources():void {
  $a=str_repeat('cough ',145);$b=str_repeat('alert ',145);$source=['subjective'=>$a,'objective'=>$b,'assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {public int $calls=0;public array $requests=[];public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->requests[]=json_decode($message,true);$i=$this->calls++;if($i===0)$v=['subjective'=>'Cough.','objective'=>'Alert.','assessment'=>'Not provided.','plan'=>'Not provided.'];elseif($i===1)$v=['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true],['id'=>2,'source_ids'=>[2],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true],['id'=>2,'claim_ids'=>[2],'relevant'=>true,'covered'=>true]]];else $v=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];return ['text'=>json_encode($v),'usage'=>[]];}};
  $r=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($source,['subjective'=>[],'objective'=>[]],['subjective'=>[$a],'objective'=>[$b]]);
  self::assertTrue($r['ok']);self::assertSame(3,$provider->calls);self::assertSame($source,$r['sources']);self::assertSame([],$provider->requests[0]['surrounding_context']['subjective']);self::assertSame([],$provider->requests[0]['surrounding_context']['objective']);
 }
 public function test_group_sizing_ignores_exact_duplicate_evidence_but_keeps_extra_context():void {
  $a=trim(str_repeat('cough ',225));$b=trim('alert '.str_repeat('observed ',95));
  $sources=['subjective'=>$a,'objective'=>$b,'assessment'=>'Not provided.','plan'=>'Not provided.'];
  $extra='The speaker attribution needs review.';
  $provider=new class implements AiProviderInterface {public array $requests=[];public function generate(string $instructions,string $message,?array $schema=null):array {
   $input=json_decode($message,true);$this->requests[]=$input;
   if(isset($schema['properties']['claims'])) {
    $d=['claims'=>[],'sources'=>[]];foreach($input['claims'] as $claim)$d['claims'][]=['id'=>$claim['id'],'source_ids'=>[$claim['id']],'supported'=>true];
    foreach($input['sources'] as $source)$d['sources'][]=['id'=>$source['id'],'claim_ids'=>[$source['id']],'relevant'=>true,'covered'=>true];
   } elseif(isset($schema['properties']['subjective']['enum'])) $d=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
   else { $section=$input['source_context']??$input;$d=[];foreach(['subjective','objective','assessment','plan'] as $key)$d[$key]=$section[$key]==='Not provided.'?'Not provided.':'Short summary.'; }
   return ['text'=>json_encode($d),'usage'=>[]];
  }};
  $r=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources,['subjective'=>[$a],'objective'=>['alert']],['objective'=>[$extra]]);
  self::assertTrue($r['ok']);self::assertCount(6,$provider->requests);self::assertSame($a,$provider->requests[0]['subjective']);
  self::assertArrayNotHasKey('section_evidence',$provider->requests[0]);self::assertSame(['alert'],$provider->requests[3]['section_evidence']['objective']);
  self::assertSame([$extra],$provider->requests[3]['surrounding_context']['objective']);self::assertSame($sources,$r['sources']);
 }
 public function test_multiple_exact_evidence_passages_are_not_sent_twice():void {
  $passages=[];for($i=0;$i<24;$i++) $passages[]='Owner observation '.$i.' notes no vomiting and normal drinking.';
  $full=implode(' ',$passages);$sources=['subjective'=>$full,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  self::assertGreaterThan(1250,strlen($full));self::assertLessThan(2500,strlen(json_encode($sources)));
  $provider=new class implements AiProviderInterface {public array $requests=[];public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
   $input=json_decode($message,true);$this->requests[]=$input;$i=count($this->requests);
   if($i===1)$data=['subjective'=>'No vomiting and drinking normally.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
   elseif($i===2){$data=['claims'=>[['id'=>1,'source_ids'=>range(1,count($input['sources'])),'supported'=>true]],'sources'=>[]];foreach($input['sources'] as $item)$data['sources'][]=['id'=>$item['id'],'claim_ids'=>[1],'relevant'=>true,'covered'=>true];}
   else $data=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
   return ['text'=>json_encode($data),'usage'=>[]];
  }};
  $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources,['subjective'=>$passages],['subjective'=>$passages]);
  self::assertTrue($result['ok']);self::assertCount(3,$provider->requests);self::assertSame($full,$provider->requests[0]['subjective']);
  self::assertArrayNotHasKey('section_evidence',$provider->requests[0]);self::assertSame($full,$provider->requests[2]['sources']['subjective']);
 }
 public function test_evidence_subsets_are_not_removed_as_duplicates():void {
  $sources=['subjective'=>'No vomiting. Still coughing.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {public array $inputs=[];public function generate(string $instructions,string $message,?array $schema=null):array {$this->inputs[]=json_decode($message,true);return ['text'=>'{}','usage'=>[]];}};
  (new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources,['subjective'=>['Still coughing.']],[]);
  self::assertSame(['Still coughing.'],$provider->inputs[0]['section_evidence']['subjective']);
 }
 public function test_retry_reuses_only_successful_matching_sections():void {
  $a=str_repeat('cough ',220);$b=str_repeat('alert ',220);$sources=['subjective'=>$a,'objective'=>$b,'assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {public int $calls=0;public bool $limited=true;public function generate(string $instructions,string $message,?array $jsonSchema=null):array { $i=$this->calls++; if($this->limited && $i>=3) throw new \App\Services\AI\AiProviderException('rate_limit',429); $stage=$i%3; if($stage===0)$v=['subjective'=>$i===0?'Cough.':'Not provided.','objective'=>$i===0?'Not provided.':'Alert.','assessment'=>'Not provided.','plan'=>'Not provided.'];elseif($stage===1)$v=['claims'=>[['id'=>1,'source_ids'=>[1],'supported'=>true]],'sources'=>[['id'=>1,'claim_ids'=>[1],'relevant'=>true,'covered'=>true]]];else $v=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];return ['text'=>json_encode($v),'usage'=>[]];}};
  $service=new ScribeGroundedSummary(new AiGateway($provider));$first=$service->generate($sources);self::assertFalse($first['ok']);self::assertSame('rate_limit',$first['failure']);self::assertArrayHasKey('subjective',$first['checkpoint']['sections']);self::assertSame(4,$provider->calls);
  $provider->limited=false;$provider->calls=3;$resumed=$service->generate($sources,[],[],$first['checkpoint']);self::assertTrue($resumed['ok']);self::assertSame('Cough.',$resumed['draft']['subjective']);self::assertSame('Alert.',$resumed['draft']['objective']);self::assertSame(6,$provider->calls);
  $changed=$sources;$changed['subjective'].=' changed';$provider->calls=0;$fresh=$service->generate($changed,[],[],$first['checkpoint']);self::assertTrue($fresh['ok']);self::assertSame(6,$provider->calls);
  config(['ai.model'=>'different-fictional-model']);$provider->calls=0;$changedModel=$service->generate($sources,[],[],$first['checkpoint']);self::assertTrue($changedModel['ok']);self::assertSame(6,$provider->calls);
 }
 public function test_grouped_draft_is_not_generated_again_after_source_check_rate_limit():void {
  $sources=['subjective'=>str_repeat('cough ',220),'objective'=>str_repeat('alert ',220),'assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {public int $generationCalls=0;public int $auditCalls=0;public bool $limited=true;
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $input=json_decode($message,true);
    if(isset($schema['properties']['claims'])) { $this->auditCalls++;if($this->limited) throw new \App\Services\AI\AiProviderException('rate_limit',429);
     $d=['claims'=>[],'sources'=>[]];foreach($input['claims'] as $claim)$d['claims'][]=['id'=>$claim['id'],'source_ids'=>[$claim['id']],'supported'=>true];foreach($input['sources'] as $source)$d['sources'][]=['id'=>$source['id'],'claim_ids'=>[$source['id']],'relevant'=>true,'covered'=>true];
    } elseif(isset($schema['properties']['subjective']['enum'])) $d=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
    else { $this->generationCalls++;$sections=$input['source_context']??$input;$d=[];foreach(['subjective','objective','assessment','plan'] as $key)$d[$key]=$sections[$key]==='Not provided.'?'Not provided.':'Short summary.'; }
    return ['text'=>json_encode($d),'usage'=>[]];
   }
  };
  $service=new ScribeGroundedSummary(new AiGateway($provider));$first=$service->generate($sources);
  self::assertFalse($first['ok']);self::assertSame('rate_limit',$first['failure']);self::assertSame(1,$provider->generationCalls);
  $provider->limited=false;$result=$service->generate($sources,[],[],$first['checkpoint']);
  self::assertTrue($result['ok']);self::assertSame(2,$provider->generationCalls);self::assertSame(3,$provider->auditCalls);
 }
 public function test_long_section_is_fragmented_but_checked_against_full_source_and_resumable():void {
  $parts=[];for($i=0;$i<4;$i++) $parts[]='Observation '.$i.': '.str_repeat('no vomiting and uncertain appetite ',20).'reported.';
  $text=implode(' ',$parts);$sources=['subjective'=>$text,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  self::assertGreaterThan(2500,strlen($text));
  $provider=new class implements AiProviderInterface {
   public array $requests=[];public bool $failFinal=true;
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $input=json_decode($message,true);$this->requests[]=$input;
    if(isset($schema['properties']['claims'])) {
     $data=['claims'=>[],'sources'=>[]];$ids=array_column($input['sources'],'id');$claimIds=array_column($input['claims'],'id');
     foreach($input['claims'] as $item)$data['claims'][]=['id'=>$item['id'],'source_ids'=>$ids,'supported'=>true];
     foreach($input['sources'] as $item)$data['sources'][]=['id'=>$item['id'],'claim_ids'=>$claimIds,'relevant'=>true,'covered'=>true];
    } elseif(isset($schema['properties']['subjective']['enum'])) {
     if(strlen($input['sources']['subjective'])>2000 && $this->failFinal){$this->failFinal=false;throw new \App\Services\AI\AiProviderException('rate_limit',429);}
     $data=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
    } else $data=['subjective'=>'No vomiting and appetite changes reported.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
    return ['text'=>json_encode($data),'usage'=>[]];
   }
  };
  $service=new ScribeGroundedSummary(new AiGateway($provider));$first=$service->generate($sources);
  self::assertFalse($first['ok']);self::assertSame('meaning_review_failed',$first['code']);self::assertSame('rate_limit',$first['failure']);
  self::assertArrayHasKey('fragments',$first['checkpoint']);$calls=count($provider->requests);self::assertGreaterThan(5,$calls);
  $last=$provider->requests[$calls-1];self::assertSame($text,$last['sources']['subjective']);
  $result=$service->generate($sources,[],[],$first['checkpoint']);self::assertTrue($result['ok']);self::assertSame($text,$result['sources']['subjective']);
  self::assertArrayHasKey('finalAudit',$first['checkpoint']);
  self::assertSame($calls+1,count($provider->requests));self::assertNotEmpty($result['audit']['claims']);
  $changed=$first['checkpoint'];$changed['fragments'][0]['draft']['subjective']='Changed fragment.';
  $before=count($provider->requests);$result=$service->generate($sources,[],[],$changed);
  self::assertTrue($result['ok']);self::assertSame($before+2,count($provider->requests));
 }
 public function test_cross_fragment_meaning_rejection_never_returns_a_draft():void {
  $text=implode(' ',array_map(static fn($i)=>'Observation '.$i.': '.str_repeat('no vomiting and possible coughing ',20).'reported.',range(1,4)));
  $sources=['subjective'=>$text,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {public function generate(string $instructions,string $message,?array $schema=null):array {
   $input=json_decode($message,true);
   if(isset($schema['properties']['claims'])){$ids=array_column($input['sources'],'id');$cids=array_column($input['claims'],'id');$d=['claims'=>[],'sources'=>[]];foreach($cids as $id)$d['claims'][]=['id'=>$id,'source_ids'=>$ids,'supported'=>true];foreach($ids as $id)$d['sources'][]=['id'=>$id,'claim_ids'=>$cids,'relevant'=>true,'covered'=>true];}
   elseif(isset($schema['properties']['subjective']['enum']))$d=['subjective'=>strlen($input['sources']['subjective'])>2000?'changed':'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
   else $d=['subjective'=>'Cough reported.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];return ['text'=>json_encode($d),'usage'=>[]];
  }};
  $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources);
  self::assertFalse($result['ok']);self::assertSame('meaning_review_failed',$result['code']);self::assertArrayNotHasKey('draft',$result);
 }
 public function test_long_section_keeps_unique_evidence_in_its_fragment_and_rechecks_full_source():void {
  $passages=[];$quotes=[];for($i=0;$i<4;$i++) {$quotes[]='Owner observation '.$i; $passages[]=$quotes[$i].': '.str_repeat('no vomiting and possible appetite changes ',16).'reported.';}
  $text=implode(' ',$passages);$sources=['subjective'=>$text,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  self::assertGreaterThan(2500,strlen($text));
  $provider=new class implements AiProviderInterface {public array $generatorInputs=[];public array $meaningInputs=[];
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $input=json_decode($message,true);
    if(isset($schema['properties']['claims'])){$ids=array_column($input['sources'],'id');$claims=array_column($input['claims'],'id');$d=['claims'=>[],'sources'=>[]];foreach($claims as $id)$d['claims'][]=['id'=>$id,'source_ids'=>$ids,'supported'=>true];foreach($ids as $id)$d['sources'][]=['id'=>$id,'claim_ids'=>$claims,'relevant'=>true,'covered'=>true];}
    elseif(isset($schema['properties']['subjective']['enum'])){$this->meaningInputs[]=$input;$d=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];}
    else {$this->generatorInputs[]=$input;$d=['subjective'=>'No vomiting; possible appetite changes.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];}
    return ['text'=>json_encode($d),'usage'=>[]];
   }};
  $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources,['subjective'=>$quotes]);
  self::assertTrue($result['ok']);self::assertSame($text,$result['sources']['subjective']);self::assertCount(4,$provider->generatorInputs);
  foreach($provider->generatorInputs as $i=>$input){self::assertSame([$quotes[$i]],$input['section_evidence']['subjective']);self::assertStringContainsString($quotes[$i],$input['source_context']['subjective']);}
  self::assertSame($text,end($provider->meaningInputs)['sources']['subjective']);
 }
 public function test_long_section_never_guesses_ambiguous_evidence_or_drops_extra_context():void {
  $passages=[];for($i=0;$i<4;$i++)$passages[]='Observation '.$i.': '.str_repeat('same evidence and uncertainty ',22).'reported.';
  $text=implode(' ',$passages);$sources=['subjective'=>$text,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $schema=null):array{$this->calls++;return ['text'=>'{}','usage'=>[]];}};
  $service=new ScribeGroundedSummary(new AiGateway($provider));
  $ambiguous=$service->generate($sources,['subjective'=>['same evidence']]);self::assertFalse($ambiguous['ok']);self::assertSame('section_exceeds_budget',$ambiguous['code']);
  $context=$service->generate($sources,['subjective'=>['Observation 0']],['subjective'=>['Extra speaker context not present in the section.']]);self::assertFalse($context['ok']);self::assertSame('section_exceeds_budget',$context['code']);self::assertSame(0,$provider->calls);
 }
 public function test_scribe_can_review_a_larger_complete_source_without_affecting_public_limit():void {
  config(['ai.scribe_summary_input_bytes'=>6000,'ai.scribe_max_input_bytes'=>10000,'ai.max_input_bytes'=>4000]);
  $provider=new class implements AiProviderInterface {public array $requests=[];public function generate(string $instructions,string $message,?array $schema=null):array {
   $input=json_decode($message,true);$this->requests[]=$input;
   if(isset($schema['properties']['claims'])){$ids=array_column($input['sources'],'id');$claims=array_column($input['claims'],'id');$d=['claims'=>[],'sources'=>[]];foreach($claims as $id)$d['claims'][]=['id'=>$id,'source_ids'=>$ids,'supported'=>true];foreach($ids as $id)$d['sources'][]=['id'=>$id,'claim_ids'=>$claims,'relevant'=>true,'covered'=>true];}
   elseif(isset($schema['properties']['subjective']['enum']))$d=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
   else $d=['subjective'=>'No vomiting; appetite uncertain.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
   return ['text'=>json_encode($d),'usage'=>[]];
  }};
  $parts=[];$quotes=[];for($i=0;$i<4;$i++) {$quotes[]='Observation '.$i; $parts[]=$quotes[$i].': '.str_repeat('no vomiting and uncertain appetite ',20).'reported.';}
  $source=implode(' ',$parts);$sources=['subjective'=>$source,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources,['subjective'=>$quotes]);
  self::assertTrue($result['ok']);self::assertCount(3,$provider->requests);self::assertSame($source,$provider->requests[0]['source_context']['subjective']);
  self::assertSame($quotes,$provider->requests[0]['section_evidence']['subjective']);self::assertSame($source,$provider->requests[2]['sources']['subjective']);
  $calls=count($provider->requests);$gateway=new AiGateway($provider);
  $public=$gateway->text('public_vetti',str_repeat('x',5000),'Respond concisely.','public');
  self::assertFalse($public['ok']);self::assertSame('invalid_input',$public['error_code']);self::assertCount($calls,$provider->requests);
 }
 public function test_larger_context_and_evidence_remain_together_within_configured_budget():void {
  config(['ai.scribe_summary_input_bytes'=>7500,'ai.scribe_max_input_bytes'=>10000]);
  $parts=[];$quotes=[];for($i=0;$i<4;$i++){$quote='History '.$i.' '.str_repeat('no vomiting with uncertainty ',26);$quotes[]=trim($quote);$parts[]=trim($quote).' was reported.';}
  $text=implode(' ',$parts);$sources=['subjective'=>$text,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];
  $payload=['source_context'=>$sources,'section_evidence'=>['subjective'=>$quotes],'surrounding_context'=>[]];
  self::assertGreaterThan(6000,strlen(json_encode($payload)));self::assertLessThan(7500,strlen(json_encode($payload)));
  $provider=new class implements AiProviderInterface {public array $inputs=[];public function generate(string $instructions,string $message,?array $schema=null):array {
   $input=json_decode($message,true);$this->inputs[]=$input;
   if(isset($schema['properties']['claims'])){$ids=array_column($input['sources'],'id');$claimIds=array_column($input['claims'],'id');$d=['claims'=>[],'sources'=>[]];foreach($claimIds as $id)$d['claims'][]=['id'=>$id,'source_ids'=>$ids,'supported'=>true];foreach($ids as $id)$d['sources'][]=['id'=>$id,'claim_ids'=>$claimIds,'relevant'=>true,'covered'=>true];}
   elseif(isset($schema['properties']['subjective']['enum']))$d=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
   else $d=['subjective'=>'No vomiting reported with uncertainty.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];return ['text'=>json_encode($d),'usage'=>[]];
  }};
  $result=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources,['subjective'=>$quotes]);
  self::assertTrue($result['ok']);self::assertCount(3,$provider->inputs);self::assertSame($text,$provider->inputs[0]['source_context']['subjective']);self::assertSame($quotes,$provider->inputs[0]['section_evidence']['subjective']);self::assertSame($text,$provider->inputs[2]['sources']['subjective']);
 }
 public function test_single_large_section_is_not_silently_truncated():void {$provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->calls++;return ['text'=>'{}','usage'=>[]];}};$r=(new ScribeGroundedSummary(new AiGateway($provider)))->generate(['subjective'=>str_repeat('a ',1400),'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']);self::assertFalse($r['ok']);self::assertSame('section_exceeds_budget',$r['code']);self::assertSame(0,$provider->calls);}

 public function test_large_summary_groups_sections_and_preserves_each_source_for_both_reviews():void {
  $sources=['subjective'=>'Owner corrected three days to seven days and no vomiting '.str_repeat('history ',120),
    'objective'=>'Veterinarian observed left ear redness '.str_repeat('exam ',170),
    'assessment'=>'Cause uncertain '.str_repeat('uncertain ',90),'plan'=>'Not provided.'];
  $provider=new class implements AiProviderInterface {
   public array $requests=[];
   public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
    $input=json_decode($message,true);$this->requests[]=$input;$step=(count($this->requests)-1)%3;
    if($step===0){$v=[];foreach($input as $k=>$value)$v[$k]=$value==='Not provided.'?$value:('Summary '.$k.'.');}
    elseif($step===1){$v=['claims'=>[],'sources'=>[]];foreach($input['claims'] as $claim){$id=$claim['id'];$v['claims'][]=['id'=>$id,'source_ids'=>[$id],'supported'=>true];}foreach($input['sources'] as $source){$id=$source['id'];$v['sources'][]=['id'=>$id,'claim_ids'=>[$id],'relevant'=>true,'covered'=>true];}}
    else $v=['subjective'=>'equivalent','objective'=>'equivalent','assessment'=>'equivalent','plan'=>'equivalent'];
    return ['text'=>json_encode($v),'usage'=>[]];
   }
  };
  $r=(new ScribeGroundedSummary(new AiGateway($provider)))->generate($sources);
  self::assertTrue($r['ok']);self::assertCount(6,$provider->requests);self::assertSame($sources,$r['sources']);
  self::assertSame($sources['subjective'],$provider->requests[0]['subjective']);
  self::assertSame($sources['objective'],$provider->requests[0]['objective']);
  self::assertSame($sources['assessment'],$provider->requests[3]['assessment']);
  self::assertSame($sources['subjective'],$provider->requests[2]['sources']['subjective']);
  self::assertSame('Summary assessment.',$r['draft']['assessment']);
 }
}
