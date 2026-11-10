<?php
namespace Tests\Feature\AI;
use App\Services\AI\{AiGateway,AiProviderInterface};
use Tests\TestCase;
final class VettiSupportedLanguagesTest extends TestCase {
 public function test_supported_language_instruction_is_shared_across_vetti_responses():void {
  config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
  $provider=new class implements AiProviderInterface {public array $instructions=[]; public function generate(string $instructions,string $message,?array $jsonSchema=null):array {$this->instructions[]=$instructions;return ['text'=>'OK','usage'=>[]];}};
  $gateway=new AiGateway($provider);
  foreach (['public_vetti','user_vetti','semantic_vetti'] as $task) self::assertTrue($gateway->text($task,'synthetic','Respond.','sanitized')['ok']);
  self::assertTrue($gateway->text('scribe','synthetic','Clinical draft.','clinical')['ok']);
  foreach (array_slice($provider->instructions,0,3) as $instructions) self::assertStringContainsString('Use only English, Filipino, or Taglish.',$instructions);
  self::assertStringNotContainsString('Use only English, Filipino, or Taglish.',$provider->instructions[3]);
 }
}
