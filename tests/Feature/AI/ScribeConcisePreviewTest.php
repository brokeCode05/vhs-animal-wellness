<?php
namespace Tests\Feature\AI;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\ScribeConcisePreview;
use Tests\TestCase;

final class ScribeConcisePreviewTest extends TestCase
{
    protected function setUp(): void { parent::setUp();config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]); }
    private function source(): array { return ['subjective'=>'Owner reports coughing for four days and no vomiting.','objective'=>'On examination the dog is alert.','assessment'=>'Possible irritation, cause uncertain.','plan'=>'Return in one week.']; }
    private function runCase(array $draft,array $verdict): array {
        $provider=new class($draft,$verdict) implements AiProviderInterface {
            private int $calls=0;public function __construct(private array $draft,private array $verdict){}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {return ['text'=>json_encode(++$this->calls===1?$this->draft:$this->verdict),'usage'=>[]];}
        };
        return (new ScribeConcisePreview(new AiGateway($provider)))->generate($this->source());
    }
    public function test_reviewed_draft_is_linked_to_the_source(): void {
        $draft=$this->source();
        $r=$this->runCase($draft,['supported'=>true,'complete'=>true]);self::assertTrue($r['ok']);self::assertSame($this->source(),$r['sources']);
    }
    public function test_verifier_rejection_for_missing_or_invented_facts(): void {
        foreach([['supported'=>true,'complete'=>false],['supported'=>false,'complete'=>true]] as $check){$r=$this->runCase($this->source(),$check);self::assertFalse($r['ok']);self::assertSame('verification_failed',$r['code']);}
    }
    public function test_changed_numeric_measurement_is_rejected_even_if_model_would_approve(): void {
        $draft=$this->source();$draft['plan']='Return in 2 weeks.';$r=$this->runCase($draft,['supported'=>true,'complete'=>true]);self::assertFalse($r['ok']);self::assertSame('plan_requires_source',$r['code']);
    }
    public function test_unstated_treatment_is_rejected_when_the_checker_detects_it(): void {
        $draft=$this->source();$draft['plan']='Give medication and return in one week.';
        $r=$this->runCase($draft,['supported'=>false,'complete'=>true]);self::assertFalse($r['ok']);self::assertSame('plan_requires_source',$r['code']);
    }
    public function test_explicit_owner_attribution_cannot_disappear(): void {
        $draft=$this->source();$draft['subjective']='Coughing for four days with no vomiting.';
        $r=$this->runCase($draft,['supported'=>true,'complete'=>true]);self::assertFalse($r['ok']);self::assertSame('attribution_missing',$r['code']);
    }
    public function test_uncertainty_cannot_be_dropped_even_if_verifier_approves(): void {
        $draft=$this->source();$draft['assessment']='Irritation, cause established.';
        $r=$this->runCase($draft,['supported'=>true,'complete'=>true]);self::assertFalse($r['ok']);self::assertSame('protected_source_changed',$r['code']);
    }
    public function test_research_checker_does_not_prove_which_symptom_is_negated(): void {
        $draft=$this->source();$draft['subjective']='Owner reports no coughing for four days and vomiting.';
        $r=$this->runCase($draft,['supported'=>true,'complete'=>true]);
        self::assertFalse($r['ok']);self::assertSame('protected_source_changed',$r['code']);
    }
    public function test_model_verifier_is_not_a_guarantee(): void {
        $draft=$this->source();$draft['subjective']='Owner reports coughing for four days and vomiting.';
        $r=$this->runCase($draft,['supported'=>true,'complete'=>true]);self::assertFalse($r['ok']);self::assertSame('protected_source_changed',$r['code']);
    }
}
