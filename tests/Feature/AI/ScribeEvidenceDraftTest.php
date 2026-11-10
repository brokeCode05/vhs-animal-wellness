<?php
namespace Tests\Feature\AI;
use App\Services\AI\ScribeEvidenceDraft;
use Tests\TestCase;
final class ScribeEvidenceDraftTest extends TestCase
{
 private function inventory():array {return ['ok'=>true,'complete'=>false,'transcript'=>'Cough. No vomiting.','chunks'=>[['offset'=>0,'length'=>7,'text'=>'Cough. ','status'=>'complete','segments'=>[['text'=>'Cough. ','offset'=>0,'quotes'=>[['text'=>'Cough.','category'=>'subjective']]]]],['offset'=>7,'length'=>12,'text'=>'No vomiting.','status'=>'failed']]];}
 public function test_merges_evidence_and_preserves_failed_source():void {$r=(new ScribeEvidenceDraft())->build($this->inventory());self::assertTrue($r['ok']);self::assertFalse($r['complete']);self::assertSame('Cough.',$r['sections']['subjective'][0]['text']);self::assertSame('No vomiting.',$r['attention'][1]['source']);self::assertSame('chunk_incomplete',$r['attention'][1]['reason']);}
 public function test_rejects_missing_or_changed_source():void {$v=$this->inventory();$v['chunks'][1]['offset']=8;self::assertSame('invalid_coverage',(new ScribeEvidenceDraft())->build($v)['code']);$v=$this->inventory();$v['chunks'][0]['segments'][0]['quotes'][0]['text']='No cough';self::assertSame('invalid_quote',(new ScribeEvidenceDraft())->build($v)['code']);}
 public function test_question_context_is_preserved_across_chunk_boundary():void {
  $q='Any breathing difficulty?';$a=' No, none.';$source=$q.$a;
  $inv=['ok'=>true,'complete'=>true,'transcript'=>$source,'chunks'=>[['offset'=>0,'length'=>strlen($q),'text'=>$q,'status'=>'complete','segments'=>[['offset'=>0,'text'=>$q,'quotes'=>[]]]],['offset'=>strlen($q),'length'=>strlen($a),'text'=>$a,'status'=>'complete','segments'=>[['offset'=>strlen($q),'text'=>$a,'quotes'=>[['text'=>'No, none.','category'=>'subjective']]]]]]];
  $r=(new ScribeEvidenceDraft())->build($inv);self::assertTrue($r['ok']);self::assertSame($source,$r['sections']['subjective'][0]['source']);self::assertSame(0,$r['sections']['subjective'][0]['sourceOffset']);self::assertSame(strlen($q)+1,$r['sections']['subjective'][0]['offset']);
 }
 public function test_ambiguous_repeated_quote_is_not_linked():void {$v=['ok'=>true,'complete'=>true,'transcript'=>'yes yes','chunks'=>[['offset'=>0,'length'=>7,'text'=>'yes yes','status'=>'complete','segments'=>[['text'=>'yes yes','offset'=>0,'quotes'=>[['text'=>'yes','category'=>'subjective']]]]]]];$r=(new ScribeEvidenceDraft())->build($v);self::assertTrue($r['ok']);self::assertSame([],$r['sections']['subjective']);self::assertSame('ambiguous_source',$r['attention'][1]['reason']);}
}
