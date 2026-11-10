<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\DoctorScribeService;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class DoctorScribeBackupTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,
            'ai.paid_data_approved'=>true,'ai.groq_scribe_backup_enabled'=>true,
            'ai.api_key'=>'fictional-gemini','ai.groq_api_key'=>'fictional-groq',
            'ai.model'=>'fictional-primary','ai.vetti_model'=>'different-vetti-model','ai.groq_model'=>'fictional-backup']);
        Http::preventStrayRequests();
    }
    private function soap(): array
    {
        return ['subjective'=>'Owner reports no vomiting.','objective'=>['findings'=>'Not provided.',
            'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'Not provided.','plan'=>'Not provided.'];
    }
    private function draft(): array
    {
        return (new DoctorScribeService(new AiGateway(new GeminiProvider())))->draft('Owner reports no vomiting.');
    }
    private function groqResponse(): array
    {
        return ['choices'=>[['message'=>['content'=>json_encode($this->soap())]]]];
    }
    public function test_gemini_failure_uses_groq_and_identifies_the_actual_provider(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response($this->groqResponse(),200)]);
        $result=$this->draft();
        self::assertTrue($result['ok']);self::assertSame('groq',$result['providerMeta']['engine']);
        self::assertSame('Owner reports no vomiting.',$result['soap']['subjective']);
        self::assertFalse($result['saved']);self::assertFalse($result['consultation_completed']);
        Http::assertSentCount(2);
        Http::assertSent(fn($r)=>str_contains($r->url(),'fictional-primary'));
        Http::assertSent(fn($r)=>str_contains($r->url(),'api.groq.com') && !str_contains($r->body(),'fictional-gemini'));
        Http::assertSent(fn($r)=>str_contains($r->url(),'api.groq.com') && $r['max_completion_tokens']===2048);
    }
    public function test_timeout_and_invalid_json_trigger_the_backup(): void
    {
        foreach(['timeout','invalid_json','invalid_schema'] as $case) {
            Http::fake(function($request) use($case){
                if(str_contains($request->url(),'generativelanguage.googleapis.com')) {
                    if($case==='timeout') throw new ConnectionException('timed out');
                    $content=$case==='invalid_json'?'{invalid json':json_encode(['subjective'=>'incomplete']);
                    return Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>$content]]]]]],200);
                }
                return Http::response($this->groqResponse(),200);
            });
            $result=$this->draft();self::assertTrue($result['ok'],$case);self::assertSame('groq',$result['providerMeta']['engine']);
        }
    }
    public function test_clinical_gates_and_backup_switch_fail_closed(): void
    {
        foreach(['ai.enabled','ai.clinical_enabled','ai.clinical_clearance','ai.paid_data_approved'] as $gate) {
            Http::fake(); config([$gate=>false]); $result=$this->draft();self::assertFalse($result['ok'],$gate);Http::assertNothingSent();config([$gate=>true]);
        }
        config(['ai.groq_scribe_backup_enabled'=>false]);
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),'api.groq.com/*'=>Http::response($this->groqResponse(),200)]);
        self::assertFalse($this->draft()['ok']);Http::assertSentCount(1);
    }
    public function test_sentence_breaks_use_only_authorized_backup_and_preserve_source(): void
    {
        config(['ai.groq_model'=>'openai/gpt-oss-20b']);
        $content='Owner reports no vomiting.';
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>$content]]]],200)]);
        $service=new DoctorScribeService(new AiGateway(new GeminiProvider()));
        $result=$service->suggestPunctuation('Owner reports no vomiting');
        self::assertTrue($result['ok']); self::assertSame('Owner reports no vomiting.',$result['suggestion']);
        Http::assertSentCount(2);
        Http::assertSent(fn($r)=>str_contains($r->url(),'api.groq.com') && !isset($r['response_format']) && $r['reasoning_effort']==='low');
        config(['ai.groq_scribe_backup_enabled'=>false]);
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>$content]]]],200)]);
        self::assertFalse($service->suggestPunctuation('Owner reports no vomiting')['ok']);
        Http::assertSentCount(1);
    }

    public function test_punctuation_effort_is_omitted_for_other_models(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'Owner reports no vomiting.']]]],200)]);
        $service=new DoctorScribeService(new AiGateway(new GeminiProvider()));
        self::assertTrue($service->suggestPunctuation('Owner reports no vomiting')['ok']);
        Http::assertSent(fn($r)=>str_contains($r->url(),'api.groq.com') && !isset($r['reasoning_effort']));
    }

    public function test_soap_draft_does_not_request_punctuation_effort(): void
    {
        config(['ai.groq_model'=>'openai/gpt-oss-20b']);
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),'api.groq.com/*'=>Http::response($this->groqResponse(),200)]);
        self::assertTrue($this->draft()['ok']);
        Http::assertSent(fn($r)=>str_contains($r->url(),'api.groq.com') && isset($r['response_format']) && !isset($r['reasoning_effort']));
    }

    public function test_direct_groq_punctuation_uses_the_punctuation_effort(): void
    {
        config(['ai.groq_model'=>'openai/gpt-oss-20b']);
        Http::fake(['api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'Owner reports no vomiting.']]]],200)]);
        $service=new DoctorScribeService(new AiGateway(new \App\Services\AI\Providers\GroqProvider()));
        self::assertTrue($service->suggestPunctuation('Owner reports no vomiting')['ok']);
        Http::assertSent(fn($r)=>str_contains($r->url(),'api.groq.com') && $r['reasoning_effort']==='low');
    }

    public function test_safety_refusal_does_not_trigger_backup(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['promptFeedback'=>['blockReason'=>'SAFETY']],200),
            'api.groq.com/*'=>Http::response($this->groqResponse(),200)]);
        self::assertFalse($this->draft()['ok']);Http::assertSentCount(1);
    }
    public function test_both_providers_failing_returns_no_draft(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),'api.groq.com/*'=>Http::response([],503)]);
        self::assertFalse($this->draft()['ok']);Http::assertSentCount(2);
    }
    public function test_invalid_groq_json_can_recover_using_verified_source_ids(): void
    {
        $indices=['subjective'=>[1],'objective'=>[2],'assessment'=>[],'plan'=>[3]];
        $bad=['error'=>['code'=>'json_validate_failed']];
        $good=['choices'=>[['message'=>['content'=>json_encode($indices)]]]];
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::sequence()->push($bad,400)->push($bad,400)->push($good,200)]);
        $service=new DoctorScribeService(new AiGateway(new GeminiProvider()));
        $r=$service->draft('Owner reports no vomiting. On examination the dog is alert. I recommend a recheck.');
        self::assertTrue($r['ok']);self::assertSame('groq',$r['providerMeta']['engine']);
        self::assertSame('Owner reports no vomiting.',$r['soap']['subjective']);
        self::assertSame('On examination the dog is alert.',$r['soap']['objective']['findings']);
        self::assertSame('I recommend a recheck.',$r['soap']['plan']);
        Http::assertSentCount(5);
    }

    public function test_groq_cannot_remove_a_negation_from_the_source(): void
    {
        $unsafe=$this->soap(); $unsafe['subjective']='Owner reports vomiting.';
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>json_encode($unsafe)]]]],200)]);
        $result=$this->draft();self::assertFalse($result['ok']);
        self::assertSame('ungrounded_subjective',$result['code']);
    }
    public function test_bad_backup_output_returns_no_clinical_draft(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'{bad json']]]],200)]);
        $result=$this->draft();self::assertFalse($result['ok']);
    }

    public function test_primary_success_does_not_send_transcript_to_backup(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response(['candidates'=>[['content'=>['parts'=>[['text'=>json_encode($this->soap())]]]]]],200),
            'api.groq.com/*'=>Http::response($this->groqResponse(),200)]);
        $result=$this->draft();self::assertTrue($result['ok']);self::assertSame('gemini',$result['providerMeta']['engine']);Http::assertSentCount(1);
    }
}
