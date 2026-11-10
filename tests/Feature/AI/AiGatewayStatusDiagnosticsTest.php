<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderException;
use App\Services\AI\AiProviderInterface;
use Tests\TestCase;

final class AiGatewayStatusDiagnosticsTest extends TestCase
{
    public function test_usage_diagnostics_keep_only_bounded_numeric_counts(): void
    {
        config()->set('ai.enabled',true);
        $provider=new class implements AiProviderInterface {public function generate(string $instructions,string $message,?array $jsonSchema=null):array {return ['text'=>'ok','usage'=>['prompt_tokens'=>120,'output_tokens'=>45,'total_tokens'=>165,'private_text'=>'DO_NOT_RECORD','thinking_tokens'=>-1]];}};
        $gateway=new AiGateway($provider);$gateway->text('public_vetti','SYNTHETIC_PRIVATE_TEXT','Test instructions','public');$trace=$gateway->providerAttemptDiagnostics();
        self::assertSame(['prompt_tokens'=>120,'output_tokens'=>45,'total_tokens'=>165],$trace[0]['usage']);self::assertStringNotContainsString('SYNTHETIC_PRIVATE_TEXT',json_encode($trace));self::assertStringNotContainsString('DO_NOT_RECORD',json_encode($trace));
    }

    public function test_scribe_stage_diagnostics_are_opt_in_and_content_free(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true,'ai.diagnostics_enabled'=>true]);
        \Illuminate\Support\Facades\Log::spy();
        $provider=new class implements AiProviderInterface {public function generate(string $instructions,string $message,?array $jsonSchema=null):array {return ['text'=>json_encode(['source_corrections'=>'PRIVATE_OUTPUT','draft_comparison'=>'PRIVATE_OUTPUT','verdict'=>'consistent']),'usage'=>['prompt_tokens'=>12,'output_tokens'=>5,'total_tokens'=>17]];}};
        $result=(new \App\Services\AI\ScribeCorrectionReview(new AiGateway($provider)))->review([['id'=>1,'text'=>'PRIVATE_TRANSCRIPT']],['subjective'=>'PRIVATE_DRAFT']);
        self::assertTrue($result['ok']);
        \Illuminate\Support\Facades\Log::shouldHaveReceived('info')->once()->with('AI scribe stage',\Mockery::on(function($event) {
            $json=json_encode($event);return ($event['stage']??null)==='ScribeCorrectionReview' && ($event['provider_attempts'][0]['usage']['total_tokens']??null)===17 && !str_contains($json,'PRIVATE_TRANSCRIPT') && !str_contains($json,'PRIVATE_OUTPUT') && !str_contains($json,'PRIVATE_DRAFT');
        }));
    }

    public function test_http_status_is_recorded_without_message_or_provider_body(): void
    {
        config()->set('ai.enabled',true);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                throw new AiProviderException('http_error',503);
            }
        };
        $gateway=new AiGateway($provider); $gateway->startSemanticDeadline(5);
        $gateway->text('semantic_vetti','SYNTHETIC_PRIVATE_TEXT','Test instructions','sanitized');
        $trace=$gateway->semanticCallDiagnostics();
        self::assertSame('http_error',$trace[0]['category']);
        self::assertSame(503,$trace[0]['http_status']);
        self::assertStringNotContainsString('SYNTHETIC_PRIVATE_TEXT',json_encode($trace));
    }
}
