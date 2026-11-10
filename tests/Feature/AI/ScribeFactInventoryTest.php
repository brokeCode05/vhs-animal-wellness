<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\ScribeFactInventory;
use Tests\TestCase;
final class ScribeFactInventoryTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);}
 private function extract(array $rows,string $transcript='Cough. No vomiting.'):array {
  $provider=new class($rows) implements AiProviderInterface {public function __construct(private array $rows){} public function generate(string $instructions,string $message,?array $jsonSchema=null):array{return ['text'=>json_encode(['segments'=>$this->rows]),'usage'=>[]];}};
  return (new ScribeFactInventory(new AiGateway($provider)))->extract($transcript);
 }
 private function rows():array {return [['segment_id'=>1,'quotes'=>[['text'=>'Cough.','category'=>'subjective']]],['segment_id'=>2,'quotes'=>[['text'=>'No vomiting.','category'=>'uncertain']]]];}
 public function test_every_original_segment_is_preserved_in_order():void {$r=$this->extract($this->rows());self::assertTrue($r['ok']);self::assertSame($r['transcript'],implode('',array_column($r['segments'],'text')));self::assertSame('uncertain',$r['segments'][1]['quotes'][0]['category']);self::assertSame(6,$r['segments'][1]['offset']);}
 public function test_blank_lines_do_not_become_clinical_segments_and_no_characters_are_lost():void {
  $source="\n\nNo vomiting.\n\nIs appetite normal?\n\nYes.\n\n";
  $provider=new class implements AiProviderInterface {public array $segments=[];public function generate(string $instructions,string $message,?array $schema=null):array {
   $input=json_decode($message,true);$this->segments=$input['segments'];$rows=array_map(static fn($segment)=>['segment_id'=>$segment['id'],'quotes'=>[]],$this->segments);
   return ['text'=>json_encode(['segments'=>$rows]),'usage'=>[]];
  }};
  $result=(new ScribeFactInventory(new AiGateway($provider)))->extract($source);
  self::assertTrue($result['ok']);self::assertSame($source,implode('',array_column($result['segments'],'text')));
  self::assertCount(3,$provider->segments);foreach($provider->segments as $segment)self::assertNotSame('',trim($segment['text']));
  foreach($result['segments'] as $segment)self::assertSame($segment['text'],substr($source,$segment['offset'],strlen($segment['text'])));
 }
 public function test_missing_or_duplicate_source_mappings_are_rejected():void {$v=$this->rows();array_pop($v);self::assertSame('incomplete_inventory',$this->extract($v)['code']);$v=$this->rows();$v[1]['segment_id']=1;self::assertSame('invalid_segment_mapping',$this->extract($v)['code']);}
 public function test_invented_or_empty_quotations_are_rejected():void {$v=$this->rows();$v[1]['quotes']=[['text'=>'Vomiting.','category'=>'subjective']];self::assertSame('invalid_quote',$this->extract($v)['code']);$v=$this->rows();$v[1]['quotes']=[['text'=>'','category'=>'subjective']];self::assertSame('invalid_quote',$this->extract($v)['code']);}
 public function test_unpunctuated_segment_can_hold_multiple_categories():void {$text='inuubo ang aso hindi tiyak ang sanhi balik next week';$rows=[['segment_id'=>1,'quotes'=>[['text'=>'inuubo ang aso','category'=>'subjective'],['text'=>'hindi tiyak ang sanhi','category'=>'assessment'],['text'=>'balik next week','category'=>'plan']]]];$r=$this->extract($rows,$text);self::assertTrue($r['ok']);self::assertSame(['subjective','assessment','plan'],array_column($r['segments'][0]['quotes'],'category'));self::assertSame($text,$r['segments'][0]['text']);}
 public function test_unpunctuated_transcript_remains_intact():void {$r=$this->extract([['segment_id'=>1,'quotes'=>[]]],'walang suka pero inuubo');self::assertTrue($r['ok']);self::assertSame('walang suka pero inuubo',$r['segments'][0]['text']);}

 public function test_whitespace_only_difference_restores_exact_unique_source_span():void {
  $text="Owner reports no   vomiting today";
  $rows=[['segment_id'=>1,'quotes'=>[['text'=>'no vomiting today','category'=>'subjective']]]];
  $r=$this->extract($rows,$text);self::assertTrue($r['ok']);self::assertSame('no   vomiting today',$r['segments'][0]['quotes'][0]['text']);self::assertSame($text,$r['transcript']);
 }
 public function test_whitespace_matching_never_accepts_changed_words_punctuation_or_ambiguous_spans():void {
  $cases=[['no vomiting','has vomiting'],['no vomiting.','no vomiting!'],['no   vomiting and no  vomiting','no vomiting']];
  foreach($cases as [$source,$quote]) {
   $rows=[['segment_id'=>1,'quotes'=>[['text'=>$quote,'category'=>'subjective']]]];
   self::assertSame('invalid_quote',$this->extract($rows,$source)['code']);
  }
 }

 public function test_exact_correction_quote_spanning_adjacent_segments_preserves_both_original_parts():void {
  $text='Cough for three days. Actually four days.';
  $rows=[['segment_id'=>1,'quotes'=>[]],['segment_id'=>2,'quotes'=>[['text'=>$text,'category'=>'subjective']]]];
  $r=$this->extract($rows,$text);self::assertTrue($r['ok']);self::assertSame($text,implode('',array_column($r['segments'],'text')));
  self::assertSame('Cough for three days.',$r['segments'][0]['quotes'][0]['text']);
  self::assertSame(' Actually four days.',$r['segments'][1]['quotes'][0]['text']);
 }
 public function test_misattributed_quote_is_uncertain_and_ambiguous_span_is_rejected():void {
  $text='Cough. Actually four days. Alert.';
  $rows=[['segment_id'=>1,'quotes'=>[]],['segment_id'=>2,'quotes'=>[]],['segment_id'=>3,'quotes'=>[['text'=>'Cough. Actually four days.','category'=>'subjective']]]];
  $result=$this->extract($rows,$text);self::assertTrue($result['ok']);self::assertSame('uncertain',$result['segments'][0]['quotes'][0]['category']);self::assertSame('uncertain',$result['segments'][1]['quotes'][0]['category']);
  $text='Cough. Four days. Cough. Four days.';
  $rows=[['segment_id'=>1,'quotes'=>[]],['segment_id'=>2,'quotes'=>[['text'=>'Cough. Four days.','category'=>'subjective']]],['segment_id'=>3,'quotes'=>[]],['segment_id'=>4,'quotes'=>[]]];
  self::assertSame('invalid_quote',$this->extract($rows,$text)['code']);
 }
}
