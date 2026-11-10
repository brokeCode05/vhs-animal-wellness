<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\Providers\GroqProvider;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class ScribeGroqReviewerBudgetTest extends TestCase
{
    public function test_long_scribe_reviewer_uses_scribe_budget_and_validates_response(): void
    {
        config(['ai.enabled'=>true, 'ai.clinical_enabled'=>true, 'ai.clinical_clearance'=>true,
            'ai.paid_data_approved'=>true, 'ai.scribe_single_pass_enabled'=>true,
            'ai.groq_api_key'=>'fictional', 'ai.max_output_tokens'=>640]);
        Http::fake(['api.groq.com/*'=>Http::response(['choices'=>[['finish_reason'=>'stop',
            'message'=>['content'=>'{"subjective":"changed"}']]]], 200)]);
        $schema=['type'=>'object','properties'=>['subjective'=>['type'=>'string','enum'=>['changed','equivalent']]],
            'required'=>['subjective'],'additionalProperties'=>false];
        $gateway=new AiGateway(new GroqProvider());
        $gateway->startScribeDeadline(20);
        $result=$gateway->structured('scribe','fictional case','Review JSON','clinical',$schema,true,true);
        self::assertTrue($result['ok']);
        self::assertSame('changed',$result['data']['subjective']);
        Http::assertSent(fn ($request) => $request['max_completion_tokens']===4096);
        self::assertSame('groq',$gateway->providerAttemptDiagnostics()[0]['provider']);
    }

    public function test_structured_scribe_review_retries_json_validation_without_accepting_invalid_data(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,
            'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true,'ai.groq_api_key'=>'fictional']);
        $review=\Tests\Support\ScribePipelineFixture::clearReview();
        $review['assessment_support']='uncertain';
        Http::fake(['api.groq.com/*'=>Http::sequence()
            ->push(['error'=>['code'=>'json_validate_failed']],400)
            ->push(['choices'=>[['finish_reason'=>'stop','message'=>['content'=>json_encode($review)]]]],200)]);
        $gateway=new AiGateway(new GroqProvider());$gateway->startScribeDeadline(20);
        $result=(new \App\Services\AI\ScribeSinglePassReview($gateway))->review(
            [['id'=>1,'text'=>'Fictional uncertain assessment.']],
            ['subjective'=>'Not provided.','objective'=>'Not provided.','assessment'=>'Possible issue.','plan'=>'Not provided.']);
        self::assertTrue($result['ok']);self::assertSame('uncertain',$result['assessmentSupport']);
        Http::assertSentCount(2);
        $requests=Http::recorded();
        self::assertSame('json_schema',$requests[0][0]['response_format']['type']);
        self::assertSame('json_object',$requests[1][0]['response_format']['type']);
    }

    public function test_direct_provider_keeps_ordinary_output_budget(): void
    {
        config(['ai.groq_api_key'=>'fictional','ai.max_output_tokens'=>640]);
        Http::fake(['api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>'hello']]]], 200)]);
        (new GroqProvider())->generate('instructions','message');
        Http::assertSent(fn ($request) => $request['max_completion_tokens']===640);
    }
}
