<?php
namespace Tests\Feature\AI;
use App\Services\AI\{AiGateway,ScribeSinglePassDraft};
use Tests\Support\ScribePipelineFixture;
use Tests\TestCase;
final class ScribeSinglePassDraftTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);}
 public function test_complete_source_uses_two_calls_with_statement_evidence():void {
  $p=new ScribePipelineFixture();$text='Cough reported, but appetite unchanged. No medicine given.';
  $p->draft['subjective']['statements'][]=['text'=>'Appetite unchanged.','source_ids'=>[2]];
  $r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate($text);
  self::assertTrue($r['ok']);self::assertSame(2,$p->calls);self::assertSame(1,$p->reviewCalls);
  self::assertSame($text,implode('',array_column($p->requests[0]['payload']['passages'],'text')));
  self::assertSame('Cough reported. Appetite unchanged.',$r['draft']['subjective']);
  self::assertCount(2,$r['claimLinks']);self::assertSame('subjective:2',$r['claimLinks'][1]['id']);
  self::assertNotSame($r['claimLinks'][0]['references'],$r['claimLinks'][1]['references']);
  self::assertSame('no_issue_found',$r['automatedReview']['status']);self::assertSame(hash('sha256',$text),$r['sourceVersion']);
  self::assertStringContainsString('No medicine',$r['unlinkedSources'][0]);
  self::assertLessThan(3800,strlen($p->requests[0]['instructions']));self::assertLessThan(3800,strlen($p->requests[1]['instructions']));
  self::assertArrayNotHasKey('source_sections',$p->requests[1]['schema']['properties']);
  self::assertSame($p->draft['subjective']['statements'],$p->requests[1]['payload']['draft']['subjective']);
 }
 public function test_source_language_is_checked_and_missing_sections_stay_explicit():void {
  $p=new ScribePipelineFixture();$r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional history of cough.','source');
  self::assertTrue($r['ok']);self::assertSame('Not provided.',$r['draft']['objective']);self::assertSame('Not provided.',$r['sources']['objective']);
  self::assertSame('source',$p->requests[1]['payload']['language_policy']);self::assertStringContainsString('Taglish for Taglish',$p->requests[0]['instructions']);
 }
 public function test_near_limit_unicode_source_is_lossless_and_over_limit_never_calls_provider():void {
  $p=new ScribePipelineFixture();$text=mb_substr(str_repeat('Fictional review; umiinom pa ngunit hindi normal ang gana. ',600),0,29999)."\u{72AC}";
  $r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate($text);
  self::assertTrue($r['ok']);self::assertSame($text,implode('',array_column($p->requests[0]['payload']['passages'],'text')));
  self::assertSame(2,$p->calls);self::assertFalse((new ScribeSinglePassDraft(new AiGateway($p)))->generate($text.'X')['ok']);self::assertSame(2,$p->calls);
 }
 public function test_overflow_is_explicit_without_polishing_or_partial_note():void {
  foreach (['status','length'] as $kind) {
   $p=new ScribePipelineFixture();if($kind==='status')$p->draft['plan']['status']='needs_manual_compression';else $p->draft['subjective']['statements'][0]['text']=str_repeat('X',2001);
   $r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional history.');
   self::assertFalse($r['ok']);self::assertSame('needs_manual_compression',$r['code']);self::assertArrayNotHasKey('draft',$r);self::assertSame(1,$p->calls);
  }
 }
 public function test_invalid_or_missing_references_never_return_a_draft():void {
  foreach ([[99],[],[1,1]] as $ids) {
   $p=new ScribePipelineFixture();$p->draft['subjective']['statements'][0]['source_ids']=$ids;
   $r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional history.');
   self::assertFalse($r['ok']);self::assertArrayNotHasKey('draft',$r);self::assertSame(1,$p->calls);
  }
 }
 public function test_specific_advice_and_language_issues_are_visible_for_doctor_resolution():void {
  $p=new ScribePipelineFixture();$p->review['advice_support']='changed';$p->review['language_support']='changed';
  $p->review['issues']=[['section'=>'subjective','statement'=>1,'source_ids'=>[1],'kind'=>'changed','category'=>'advice','explanation'=>'Action was not performed in the source.']];
  $r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional action discussed, not performed.','source');
  self::assertTrue($r['ok']);self::assertSame('flagged',$r['automatedReview']['status']);self::assertSame(2,$p->calls);
  self::assertStringContainsString('Action was not performed',implode(' ',array_column($r['reviewItems'],'text')));
  self::assertStringContainsString('Selected language',implode(' ',$r['reviewWarnings']));
 }
 public function test_invalid_reviewer_reference_cannot_be_a_clean_check():void {
  $p=new ScribePipelineFixture();$p->review['issues']=[['section'=>'subjective','statement'=>10,'source_ids'=>[99],'kind'=>'changed','category'=>'meaning','explanation'=>'Mismatch.']];
  $r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional history.');
  self::assertTrue($r['ok']);self::assertSame('unavailable',$r['automatedReview']['status']);self::assertSame(2,$p->calls);
 }
 public function test_review_retry_preserves_validated_draft_and_skips_redrafting():void {
  $p=new ScribePipelineFixture();$p->reviewOffline=true;$checkpoint=null;$s=new ScribeSinglePassDraft(new AiGateway($p));
  $r=$s->generate('Fictional history.','english',null,function($v)use(&$checkpoint){$checkpoint=$v;});
  self::assertTrue($r['ok']);self::assertSame('unavailable',$r['automatedReview']['status']);self::assertNotNull($checkpoint);
  $p->reviewOffline=false;$r2=$s->generate('Fictional history.','english',$checkpoint);
  self::assertSame($r['draft'],$r2['draft']);self::assertSame('no_issue_found',$r2['automatedReview']['status']);self::assertSame(1,$p->draftCalls);self::assertSame(2,$p->reviewCalls);
 }
 public function test_checkpoint_for_a_different_source_is_rejected_before_review():void {
  $p=new ScribePipelineFixture();$r=(new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional changed source.','english',['rows'=>$p->draft,'sourceVersion'=>hash('sha256','different')]);
  self::assertFalse($r['ok']);self::assertSame(0,$p->calls);
 }
 public function test_approvals_block_calls():void {
  $p=new ScribePipelineFixture();config(['ai.scribe_single_pass_enabled'=>false]);self::assertFalse((new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional history.')['ok']);
  config(['ai.scribe_single_pass_enabled'=>true,'ai.paid_data_approved'=>false]);self::assertFalse((new ScribeSinglePassDraft(new AiGateway($p)))->generate('Fictional history.')['ok']);self::assertSame(0,$p->calls);
 }
}
