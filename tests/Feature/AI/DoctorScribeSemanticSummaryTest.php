<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\DoctorScribeService;
use Tests\TestCase;

final class DoctorScribeSemanticSummaryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,
            'ai.paid_data_approved'=>true,'ai.scribe_semantic_summary_enabled'=>true,'ai.scribe_grounded_summary_enabled'=>false]);
    }
    private function base(): array
    {
        return ['ok'=>true,'soap'=>['subjective'=>'Owner reports the dog is coughing at night and owner reports the dog is coughing in the morning.',
            'objective'=>['findings'=>'On examination the dog is alert.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],
            'assessment'=>'Possible ear irritation.','plan'=>'Recheck in one week.'],'warnings'=>[],'saved'=>false];
    }
    private function candidate(): array
    {
        return ['subjective'=>'Owner reports the dog is coughing at night and in the morning.',
            'objective'=>'On examination the dog is alert.','assessment'=>'Possible ear irritation.','plan'=>'Recheck in one week.'];
    }
    private function runSummary(array $candidate, bool $verified=true): array
    {
        $provider=new class($candidate,$verified) implements AiProviderInterface {
            public int $calls=0;
            public function __construct(private array $candidate, private bool $verified) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++; return ['text'=>json_encode($this->calls===1?$this->candidate:['equivalent'=>$this->verified]),'usage'=>[]];
            }
        };
        return (new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($this->base());
    }
    public function test_reviewable_shortening_is_source_linked_and_keeps_uncertainty(): void
    {
        $candidate=$this->candidate();
        $r=$this->runSummary($candidate);
        self::assertTrue($r['summaryApplied']);self::assertSame('semantic',$r['summaryMethod']);
        self::assertSame($this->candidate()['subjective'],$r['soap']['subjective']);
        self::assertSame('Possible ear irritation.',$r['soap']['assessment']);
        self::assertSame($this->base()['soap']['subjective'],$r['sourceSections']['subjective']);
        self::assertFalse($r['saved']);
    }
    public function test_added_omitted_or_reordered_clinical_words_are_rejected(): void
    {
        foreach (['Owner reports the dog is vomiting at night and in the morning.',
                  'Owner reports the dog is coughing at night.',
                  'Owner reports the dog is coughing in the morning and at night.'] as $unsafe) {
            $candidate=$this->candidate();$candidate['subjective']=$unsafe;$r=$this->runSummary($candidate,true);
            self::assertFalse($r['summaryApplied'],$unsafe);self::assertSame($this->base()['soap'],$r['soap']);
        }
    }
    public function test_new_lowercase_sentence_start_uses_source_wording(): void
    {
        $candidate=$this->candidate();
        $candidate['subjective']='Owner reports the dog is coughing at night. owner reports the dog is coughing in the morning.';
        $r=$this->runSummary($candidate);
        self::assertFalse($r['summaryApplied']);
        self::assertSame($this->base()['soap']['subjective'],$r['soap']['subjective']);
    }

    public function test_rejected_verification_never_applies_the_summary(): void
    {
        $r=$this->runSummary($this->candidate(),false);self::assertFalse($r['summaryApplied']);
        self::assertSame($this->base()['soap'],$r['soap']);
    }
    public function test_multilingual_safety_cases_preserve_source_when_meaning_changes(): void
    {
        $cases=[
            ['Owner reports no vomiting and coughing.','Owner reports vomiting and coughing.'],
            ['May pagsusuka ang aso pero walang pagtatae.','May pagsusuka ang aso pero may pagtatae.'],
            ['Sabi ng owner posibleng may lagnat pero hindi sigurado.','Sabi ng owner may lagnat.'],
            ['Owner reports ear redness. On examination the vet observed normal ears.','On examination the vet observed ear redness.'],
            ['Bantayan ang paghinga at bumalik sa isang linggo.','Bantayan ang paghinga.'],
            ['Temperature is 39 C but the thermometer was broken.','Temperature is 39 C.'],
        ];
        foreach($cases as [$source,$unsafe]) {
            $provider=new class($unsafe) implements AiProviderInterface {
                public function __construct(private string $unsafe) {}
                public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                    if (str_contains($instructions,'Compare each proposed')) return ['text'=>'{"equivalent":true}','usage'=>[]];
                    return ['text'=>json_encode(['subjective'=>$this->unsafe,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];
                }
            };
            $base=['ok'=>true,'soap'=>['subjective'=>$source,'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'Not provided.','plan'=>'Not provided.'],'warnings'=>[],'saved'=>false];
            $r=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
            self::assertSame($source,$r['soap']['subjective'],$source);
            self::assertSame($source,$r['sourceSections']['subjective'],$source);
        }
    }

    public function test_repetition_removal_must_not_drop_a_distinct_relationship(): void
    {
        $source='Owner reports the dog bites the cat and the cat bites the dog.';
        $candidate='Owner reports the dog bites the cat and the cat bites.';
        $provider=new class($candidate) implements AiProviderInterface {
            public function __construct(private string $candidate) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if (str_contains($instructions,'Compare each proposed')) return ['text'=>'{"equivalent":true}','usage'=>[]];
                return ['text'=>json_encode(['subjective'=>$this->candidate,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];
            }
        };
        $base=['ok'=>true,'soap'=>['subjective'=>$source,'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'Not provided.','plan'=>'Not provided.'],'warnings'=>[],'saved'=>false];
        $r=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
        self::assertSame($source,$r['soap']['subjective']);
    }

    public function test_mid_sentence_repeated_object_cannot_be_omitted_even_if_verifier_approves(): void
    {
        $source='Owner reports dog bites cat and cat bites dog and owner observes dog.';
        $candidate='Owner reports dog bites cat and cat bites and owner observes dog.';
        $provider=new class($candidate) implements AiProviderInterface {
            public function __construct(private string $candidate) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if (str_contains($instructions,'Compare each proposed')) return ['text'=>'{"equivalent":true}','usage'=>[]];
                return ['text'=>json_encode(['subjective'=>$this->candidate,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];
            }
        };
        $base=['ok'=>true,'soap'=>['subjective'=>$source,'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.'],'warnings'=>[],'saved'=>false];
        $r=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
        self::assertSame($source,$r['soap']['subjective']);
    }

    public function test_negated_sentence_is_preserved_while_other_sentence_can_be_shortened(): void
    {
        $source='Owner reports coughing at night and owner reports coughing in the morning. No vomiting.';
        $candidate='Owner reports coughing at night and in the morning. No vomiting.';
        $provider=new class($candidate) implements AiProviderInterface {
            public function __construct(private string $candidate) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if (str_contains($instructions,'Compare each proposed')) return ['text'=>'{"equivalent":true}','usage'=>[]];
                return ['text'=>json_encode(['subjective'=>$this->candidate,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];
            }
        };
        $base=['ok'=>true,'soap'=>['subjective'=>$source,'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.'],'warnings'=>[],'saved'=>false];
        $r=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
        self::assertTrue($r['summaryApplied']);self::assertSame($candidate,$r['soap']['subjective']);
    }

    public function test_rejected_section_uses_source_while_independent_safe_section_shortens(): void
    {
        $base=$this->base();$base['soap']['objective']['findings']='On examination weight is 7 kg.';
        $candidate=$this->candidate();$candidate['objective']='On examination weight is 8 kg.';
        $provider=new class($candidate) implements AiProviderInterface {
            private int $calls=0; public function __construct(private array $candidate) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++;return ['text'=>json_encode($this->calls===1?$this->candidate:['equivalent'=>true]),'usage'=>[]];
            }
        };
        $r=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
        self::assertTrue($r['summaryApplied']);self::assertSame($candidate['subjective'],$r['soap']['subjective']);
        self::assertSame('On examination weight is 7 kg.',$r['soap']['objective']['findings']);
        self::assertSame('On examination weight is 7 kg.',$r['sourceSections']['objective']);
    }

    public function test_feature_is_off_by_default_and_makes_no_model_call(): void
    {
        config(['ai.scribe_semantic_summary_enabled'=>false]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array { throw new \RuntimeException('Unexpected provider call'); }
        };
        $r=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($this->base());
        self::assertFalse($r['summaryApplied']);self::assertSame($this->base()['soap'],$r['soap']);
    }
}
