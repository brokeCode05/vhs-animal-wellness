<?php
namespace Tests\Feature\AI;
use App\Services\AI\ScribeDraftRun;
use Illuminate\Support\Facades\{Cache,Crypt};
use Tests\TestCase;
final class ScribeDraftRunTest extends TestCase
{
 public function test_same_request_reuses_result_and_sensitive_checkpoints_are_encrypted():void {
  $svc=new ScribeDraftRun();$calls=0;$scope=['doctor'=>7,'appointment'=>12,'source'=>'hash'];
  $op=function($checkpoint,$save)use(&$calls){$calls++;$save(['rows'=>['fictional private words']]);return ['ok'=>true,'draft'=>['subjective'=>'fictional private words'],'automatedReview'=>['status'=>'no_issue_found']];};
  $a=$svc->run($scope,$op);$b=$svc->run($scope,$op);self::assertSame(1,$calls);self::assertSame($a['jobId'],$b['jobId']);self::assertTrue($b['reused']);
  $encrypted=Cache::get('scribe:run:'.$a['jobId']);self::assertIsString($encrypted);self::assertStringNotContainsString('fictional private words',$encrypted);self::assertSame('fictional private words',Crypt::decrypt($encrypted)['result']['draft']['subjective']);
  $svc->run($scope+['language'=>'source'],$op);self::assertSame(2,$calls);
 }
 public function test_concurrent_retry_returns_in_progress_without_executing_a_second_operation():void {
  $svc=new ScribeDraftRun();$calls=0;$inner=null;
  $svc->run(['same'],function($checkpoint,$save)use($svc,&$calls,&$inner){$calls++;$inner=$svc->run(['same'],function()use(&$calls){$calls++;return [];});return ['ok'=>true,'automatedReview'=>['status'=>'no_issue_found']];});
  self::assertSame(1,$calls);self::assertSame('in_progress',$inner['code']);self::assertFalse($inner['ok']);
 }
 public function test_unavailable_review_resumes_saved_generation_after_cooldown():void {
  $svc=new ScribeDraftRun();$calls=0;$saved=null;
  $op=function($checkpoint,$save)use(&$calls,&$saved){$calls++;$saved=$checkpoint;$save(['rows'=>['generated once']]);return ['ok'=>true,'automatedReview'=>['status'=>$calls===1?'unavailable':'no_issue_found','retryAfter'=>5]];};
  $a=$svc->run(['resume'],$op);$b=$svc->run(['resume'],$op);self::assertSame(1,$calls);self::assertTrue($b['reused']);
  $key='scribe:run:'.$a['jobId'];$state=Crypt::decrypt(Cache::get($key));$state['nextReviewAt']=time()-1;Cache::put($key,Crypt::encrypt($state),60);
  $c=$svc->run(['resume'],$op);self::assertSame(2,$calls);self::assertSame(['rows'=>['generated once']],$saved);self::assertSame('no_issue_found',$c['automatedReview']['status']);
 }
 public function test_review_version_change_rechecks_saved_generation():void {
  $svc=new ScribeDraftRun();$calls=0;$checkpoint=null;
  $op=function($saved,$save)use(&$calls,&$checkpoint){$calls++;$checkpoint=$saved;$save(['rows'=>['same generation']]);return ['ok'=>true,'automatedReview'=>['status'=>'no_issue_found']];};
  $a=$svc->run(['review-version'],$op);$key='scribe:run:'.$a['jobId'];$state=Crypt::decrypt(Cache::get($key));$state['reviewVersion']=0;Cache::put($key,Crypt::encrypt($state),60);
  $b=$svc->run(['review-version'],$op);self::assertSame(2,$calls);self::assertSame(['rows'=>['same generation']],$checkpoint);self::assertTrue($b['reused']);
 }
 public function test_failed_operation_releases_lock_for_a_later_retry():void {
  $svc=new ScribeDraftRun();try{$svc->run(['failure'],fn()=>throw new \RuntimeException('fictional'));}catch(\RuntimeException){}
  $r=$svc->run(['failure'],fn()=>['ok'=>true,'automatedReview'=>['status'=>'no_issue_found']]);self::assertTrue($r['ok']);
 }
 public function test_renewed_key_retries_only_review_after_cached_quota_failure():void {
  config(['ai.api_key'=>'old-fictional-key','ai.groq_api_key'=>'fictional-backup']);$svc=new ScribeDraftRun();$calls=0;$checkpoint=null;
  $op=function($saved,$save)use(&$calls,&$checkpoint){$calls++;$checkpoint=$saved;$save(['rows'=>['already generated']]);return ['ok'=>true,'automatedReview'=>['status'=>$calls===1?'unavailable':'no_issue_found','retryAfter'=>3600]];};
  $svc->run(['renewed-key'],$op);config(['ai.api_key'=>'new-fictional-key']);$result=$svc->run(['renewed-key'],$op);
  self::assertSame(2,$calls);self::assertSame(['rows'=>['already generated']],$checkpoint);self::assertSame('no_issue_found',$result['automatedReview']['status']);
 }
 public function test_checkpoint_expires_after_fifteen_minutes():void {
  $svc=new ScribeDraftRun();$calls=0;$op=function($saved,$save)use(&$calls){$calls++;$save(['rows'=>['fictional source']]);return ['ok'=>true,'automatedReview'=>['status'=>'no_issue_found']];};
  $a=$svc->run(['expiry'],$op);self::assertNotNull(Cache::get('scribe:run:'.$a['jobId']));
  try {$this->travel(16)->minutes();self::assertNull(Cache::get('scribe:run:'.$a['jobId']));$svc->run(['expiry'],$op);self::assertSame(2,$calls);} finally {$this->travelBack();}
 }
 public function test_failed_lock_store_does_not_start_provider_work():void {
  Cache::shouldReceive('lock')->once()->andThrow(new \RuntimeException('private backend details'));
  $calls=0;$r=(new ScribeDraftRun())->run(['outage'],function()use(&$calls){$calls++;return ['ok'=>true];});
  self::assertFalse($r['ok']);self::assertSame('checkpoint_unavailable',$r['code']);self::assertSame(0,$calls);self::assertStringNotContainsString('private backend details',json_encode($r));
 }
 public function test_cache_write_failure_does_not_hide_finished_proposal():void {
  $lock=\Mockery::mock(\Illuminate\Contracts\Cache\Lock::class);$lock->shouldReceive('get')->once()->andReturn(true);$lock->shouldReceive('release')->once()->andReturn(true);
  Cache::shouldReceive('lock')->once()->andReturn($lock);Cache::shouldReceive('get')->once()->andReturn(null);Cache::shouldReceive('put')->twice()->andThrow(new \RuntimeException('private backend details'));
  $r=(new ScribeDraftRun())->run(['write-outage'],function($saved,$save){$save(['rows'=>['fictional draft']]);return ['ok'=>true,'draft'=>['subjective'=>'fictional draft'],'automatedReview'=>['status'=>'no_issue_found']];});
  self::assertTrue($r['ok']);self::assertSame('fictional draft',$r['draft']['subjective']);self::assertFalse($r['checkpointAvailable']);self::assertStringContainsString('Recovery checkpoint',implode(' ',$r['reviewWarnings']));self::assertStringNotContainsString('private backend details',json_encode($r));
 }

 public function test_completed_proposal_is_reused_after_key_rotation():void {
  $calls=0;$svc=new ScribeDraftRun();$op=function()use(&$calls){$calls++;return ['ok'=>true,'automatedReview'=>['status'=>'no_issue_found']];};
  config(['ai.api_key'=>'first-fictional']);$svc->run(['finished'],$op);config(['ai.api_key'=>'second-fictional']);$r=$svc->run(['finished'],$op);self::assertTrue($r['reused']);self::assertSame(1,$calls);
 }
 public function test_failed_cache_read_does_not_start_work():void {
  $lock=\Mockery::mock(\Illuminate\Contracts\Cache\Lock::class);$lock->shouldReceive('get')->once()->andReturn(true);$lock->shouldReceive('release')->once()->andReturn(true);
  Cache::shouldReceive('lock')->once()->andReturn($lock);Cache::shouldReceive('get')->once()->andThrow(new \RuntimeException('private'));
  $calls=0;$r=(new ScribeDraftRun())->run(['read-outage'],function()use(&$calls){$calls++;return [];});self::assertSame('checkpoint_unavailable',$r['code']);self::assertSame(0,$calls);
 }
 public function test_invalid_scope_does_not_collapse_distinct_jobs_to_a_shared_key():void {
  $calls=0;$r=(new ScribeDraftRun())->run(['bad'=>"\xFF"],function()use(&$calls){$calls++;return [];});self::assertFalse($r['ok']);self::assertSame('invalid_input',$r['code']);self::assertSame(0,$calls);
 }
 public function test_failed_lock_release_does_not_hide_a_finished_result():void {
  $lock=\Mockery::mock(\Illuminate\Contracts\Cache\Lock::class);$lock->shouldReceive('get')->once()->andReturn(true);$lock->shouldReceive('release')->once()->andThrow(new \RuntimeException('private'));
  Cache::shouldReceive('lock')->once()->andReturn($lock);Cache::shouldReceive('get')->once()->andReturn(null);Cache::shouldReceive('put')->once()->andReturn(true);
  $r=(new ScribeDraftRun())->run(['release-outage'],fn()=>['ok'=>true,'draft'=>['subjective'=>'Fictional']]);self::assertTrue($r['ok']);self::assertTrue($r['checkpointAvailable']);
 }

}
