<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\ScribeUncertainPlacement;
use Tests\TestCase;
final class ScribeUncertainPlacementTest extends TestCase
{
 protected function setUp():void {parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);}
 private function suggest(array $response,array $items):array {$provider=new class($response) implements AiProviderInterface {public function __construct(private array $r){}public function generate(string $instructions,string $message,?array $jsonSchema=null):array{return ['text'=>json_encode($this->r),'usage'=>[]];}};return (new ScribeUncertainPlacement(new AiGateway($provider)))->suggest($items);}
 private function items():array {return [['reason'=>'uncertain_category','text'=>'hindi pa sure ang cause','source'=>'Sabi ng vet hindi pa sure ang cause.','sourceOffset'=>0]];}
 public function test_suggestion_uses_exact_source_and_requires_doctor_review():void {$r=$this->suggest(['suggestions'=>[['id'=>1,'section'=>'assessment']]],$this->items());self::assertTrue($r['ok']);self::assertSame('assessment',$r['suggestions'][0]['section']);self::assertSame('Sabi ng vet hindi pa sure ang cause.',$r['suggestions'][0]['context']);self::assertTrue($r['suggestions'][0]['reviewRequired']);}
 public function test_invalid_or_missing_mapping_is_rejected():void {$r=$this->suggest(['suggestions'=>[]],$this->items());self::assertSame('incomplete_mapping',$r['code']);$r=$this->suggest(['suggestions'=>[['id'=>2,'section'=>'assessment']]],$this->items());self::assertSame('invalid_mapping',$r['code']);}
 public function test_quote_not_in_source_is_rejected():void {$v=$this->items();$v[0]['text']='invented';$r=$this->suggest([],$v);self::assertSame('invalid_evidence',$r['code']);}
}
