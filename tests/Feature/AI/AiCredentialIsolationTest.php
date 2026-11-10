<?php
namespace Tests\Feature\AI;

use App\Services\AI\{AiCredentials,AiGateway,GroqAudioTranscriber,ScribeProviderCooldown,ScribeDraftRun};
use App\Services\AI\Providers\{GeminiProvider,GroqProvider};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Http,Cache};
use Tests\TestCase;

final class AiCredentialIsolationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,
            'ai.semantic_privacy_cleared'=>true,'ai.groq_public_backup_enabled'=>true,'ai.groq_user_backup_enabled'=>true,
            'ai.groq_scribe_backup_enabled'=>true,'ai.api_key'=>'shared-gemini-fictional','ai.groq_api_key'=>'shared-groq-fictional',
            'ai.vetti_api_key'=>'vetti-gemini-fictional','ai.scribe_api_key'=>'scribe-gemini-fictional',
            'ai.groq_vetti_api_key'=>'vetti-groq-fictional','ai.groq_scribe_api_key'=>'scribe-groq-fictional',
            'ai.model'=>'fictional-scribe','ai.vetti_model'=>'fictional-vetti','ai.groq_model'=>'fictional-groq']);
        Http::preventStrayRequests();
    }
    private function fakeProviders(int $geminiStatus=200): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>'Fictional response.']]]]]],$geminiStatus),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'Fictional response.'],'finish_reason'=>'stop']]],200)]);
    }
    public function test_all_gateway_tasks_select_the_correct_gemini_key_without_mutating_configuration(): void
    {
        $this->fakeProviders();$gateway=new AiGateway(new GeminiProvider());
        foreach(['public_vetti','user_vetti','booking_intent','scheduling_intent','semantic_vetti','scribe'] as $task)
            self::assertTrue($gateway->text($task,'fictional input','Use fictional facts only.',$task==='scribe'?'clinical':'sanitized')['ok']);
        $requests=Http::recorded();self::assertCount(6,$requests);
        foreach($requests as $i=>[$request])self::assertTrue($request->hasHeader('x-goog-api-key',$i===5?'scribe-gemini-fictional':'vetti-gemini-fictional'));
        self::assertSame('shared-gemini-fictional',config('ai.api_key'));
        self::assertSame('shared-groq-fictional',config('ai.groq_api_key'));
    }
    public function test_direct_groq_gateway_calls_use_the_features_own_key(): void
    {
        $this->fakeProviders();$gateway=new AiGateway(new GroqProvider());
        self::assertTrue($gateway->text('semantic_vetti','fictional','Reply briefly.','sanitized')['ok']);
        self::assertTrue($gateway->text('scribe','fictional','Reply briefly.','clinical')['ok']);
        $requests=Http::recorded();self::assertCount(2,$requests);
        self::assertTrue($requests[0][0]->hasHeader('Authorization','Bearer vetti-groq-fictional'));
        self::assertTrue($requests[1][0]->hasHeader('Authorization','Bearer scribe-groq-fictional'));
    }
    public function test_fallback_preserves_vetti_and_scribe_credential_isolation(): void
    {
        $this->fakeProviders(503);
        foreach(['public_vetti','semantic_vetti','scribe'] as $task){
            $g=new AiGateway(new GeminiProvider());$task==='scribe'?$g->startScribeDeadline(20):$g->startSemanticDeadline(20);
            self::assertTrue($g->text($task,'fictional','Use supplied fictional facts.',$task==='scribe'?'clinical':'sanitized',$task==='scribe')['ok']);
        }
        $requests=Http::recorded();self::assertCount(6,$requests);
        foreach($requests as $i=>[$r]){
            $scope=$i>=4?'scribe':'vetti';
            self::assertTrue($i%2===0?$r->hasHeader('x-goog-api-key',$scope.'-gemini-fictional'):$r->hasHeader('Authorization','Bearer '.$scope.'-groq-fictional'));
        }
    }
    public function test_empty_dedicated_fields_keep_the_existing_shared_key_and_never_borrow_from_the_other_feature(): void
    {
        config(['ai.vetti_api_key'=>'','ai.scribe_api_key'=>'  ','ai.groq_vetti_api_key'=>null,'ai.groq_scribe_api_key'=>'']);
        foreach(['vetti','scribe'] as $scope){
            self::assertSame('shared-gemini-fictional',AiCredentials::key('gemini',$scope));
            self::assertSame('shared-groq-fictional',AiCredentials::key('groq',$scope));
        }
        config(['ai.vetti_api_key'=>'dedicated-vetti','ai.groq_vetti_api_key'=>'dedicated-vetti-groq','ai.api_key'=>'','ai.groq_api_key'=>'']);
        self::assertSame('',AiCredentials::key('gemini','scribe'));self::assertSame('',AiCredentials::key('groq','scribe'));
        self::assertSame('dedicated-vetti',AiCredentials::key('gemini','vetti'));
        Http::assertNothingSent();
    }
    public function test_scribe_audio_uses_the_scribe_groq_key(): void
    {
        $file=\Mockery::mock(UploadedFile::class);$file->shouldReceive('getRealPath')->andReturn(__FILE__);$file->shouldReceive('getMimeType')->andReturn('audio/webm');
        Http::fake(['api.groq.com/*'=>Http::response(['text'=>'Fictional transcript.'],200)]);
        self::assertTrue((new GroqAudioTranscriber())->transcribe($file)['ok']);
        Http::assertSent(fn($r)=>str_contains($r->url(),'/audio/transcriptions') && $r->hasHeader('Authorization','Bearer scribe-groq-fictional'));
        Http::assertSentCount(1);
    }
    public function test_scribe_cooldown_follows_only_the_effective_scribe_credential(): void
    {
        ScribeProviderCooldown::record('groq',['retry_after_seconds'=>60]);
        self::assertGreaterThan(0,ScribeProviderCooldown::remaining('groq'));
        config(['ai.groq_vetti_api_key'=>'rotated-vetti']);self::assertGreaterThan(0,ScribeProviderCooldown::remaining('groq'));
        config(['ai.groq_scribe_api_key'=>'rotated-scribe']);self::assertSame(0,ScribeProviderCooldown::remaining('groq'));
    }
    public function test_rotating_vetti_does_not_repeat_scribe_work_but_rotating_scribe_retries_its_review(): void
    {
        $calls=0;$run=new ScribeDraftRun();
        $op=function($checkpoint,$save)use(&$calls){$calls++;$save(['fictional_checkpoint'=>true]);return ['ok'=>true,'automatedReview'=>['status'=>'unavailable','retryAfter'=>3600]];};
        $run->run(['isolated-keys'],$op);config(['ai.vetti_api_key'=>'rotated-vetti','ai.groq_vetti_api_key'=>'rotated-vetti-backup']);
        self::assertTrue($run->run(['isolated-keys'],$op)['reused']);self::assertSame(1,$calls);
        config(['ai.scribe_api_key'=>'rotated-scribe']);$run->run(['isolated-keys'],$op);self::assertSame(2,$calls);
    }
    public function test_unsupported_scope_is_rejected_without_provider_requests(): void
    {
        try {AiCredentials::key('gemini','unknown');self::fail('Unsupported scope was accepted');}
        catch(\InvalidArgumentException $e){self::assertSame('Unsupported AI credential scope.',$e->getMessage());}
        Http::assertNothingSent();
    }
}
