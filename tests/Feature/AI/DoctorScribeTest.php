<?php

namespace Tests\Feature\AI;

use App\Http\Middleware\RecordUserAccess;
use App\Models\DoctorProfile;
use App\Models\User;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\DoctorScribeService;
use Tests\TestCase;

final class DoctorScribeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(RecordUserAccess::class);
    }

    private function login(string $role): void
    {
        $user = new User;
        $user->setRawAttributes([
            'id' => 123, 'name' => 'Fictional Tester', 'role' => $role,
            'status' => 'active', 'auth_version' => 1,
            'email_verified_at' => '2026-01-01 00:00:00',
        ]);
        // Model the real login requirement without depending on a database
        // table in this in-memory, gate-only feature test.
        if ($role === 'Doctor') {
            $profile = new DoctorProfile;
            $profile->setRawAttributes([
                'id' => 456,
                'user_id' => 123,
                'account_status' => 'active',
            ]);
            $user->setRelation('doctorProfile', $profile);
        }
        $this->actingAs($user)->withSession(['auth_version' => 1]);
    }

    private function fake(string $text): AiProviderInterface
    {
        return new class($text) implements AiProviderInterface {
            public int $calls = 0;
            public function __construct(private string $text) {}
            public function generate(string $instructions, string $message, ?array $jsonSchema = null): array
            {
                $this->calls++;
                return ['text' => $this->text, 'usage' => []];
            }
        };
    }

    public function test_empty_sections_warn_doctor_to_check_other_sections(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='The clinician reports a possible condition.';
        $provider=$this->fake(json_encode(['subjective'=>'Not provided.','objective'=>['findings'=>$source,'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.']));
        $result=(new DoctorScribeService(new AiGateway($provider)))->draft($source);
        $this->assertTrue($result['ok']);
        $this->assertContains('A section is marked Not provided. Check the full transcript and other sections for information that may belong there.', $result['warnings']);
    }
    public function test_mixed_assessment_and_recommendation_is_not_accepted_as_assessment(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='My assessment is possible ear irritation and I recommend a closer ear examination and a follow-up in one week.';
        $provider=$this->fake(json_encode(['subjective'=>'Not provided.','objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>$source,'plan'=>'Not provided.']));
        $result=(new DoctorScribeService(new AiGateway($provider)))->draft($source);
        $this->assertFalse($result['ok']);
        $this->assertSame('source_mismatch_assessment',$result['code']);
    }

    public function test_mixed_assessment_and_recommendation_is_not_accepted_as_plan(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='My assessment is possible ear irritation and I recommend a closer ear examination and a follow-up in one week.';
        $provider=$this->fake(json_encode(['subjective'=>'Not provided.','objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>$source]));
        $result=(new DoctorScribeService(new AiGateway($provider)))->draft($source);
        $this->assertFalse($result['ok']);
        $this->assertSame('source_mismatch_plan',$result['code']);
    }

    public function test_mixed_tagalog_owner_and_exam_sentence_is_not_accepted_as_subjective(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='May kaunti po ako napansin sa ilong niya pero hindi ko po alam kung gaano nakatagal yun sige po titignan natin siya sandali alert naman siya ngayon.';
        $provider=$this->fake(json_encode(['subjective'=>$source,'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.']));
        $result=(new DoctorScribeService(new AiGateway($provider)))->draft($source);
        $this->assertFalse($result['ok']);
        $this->assertSame('source_mismatch_subjective',$result['code']);
    }

    public function test_summary_preserves_negation_sources_and_review_only_status(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $provider=new class implements AiProviderInterface {
            private int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++;
                $data=$this->calls===1 ? ['subjective'=>'Owner reports vomiting.','objective'=>'On examination the dog is alert.','assessment'=>'Not provided.','plan'=>'I recommend a recheck in one week.'] : ['equivalent'=>true];
                return ['text'=>json_encode($data),'usage'=>[]];
            }
        };
        $base=['ok'=>true,'soap'=>['subjective'=>'Owner reports no vomiting.','objective'=>['findings'=>'On examination the dog is alert. On examination the dog is alert.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'I recommend a recheck in one week.'], 'warnings'=>[], 'saved'=>false];
        $result=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
        $this->assertTrue($result['summaryApplied']);
        $this->assertSame('Owner reports no vomiting.',$result['soap']['subjective']);
        $this->assertSame('On examination the dog is alert.',$result['soap']['objective']['findings']);
        $this->assertSame('On examination the dog is alert. On examination the dog is alert.',$result['sourceSections']['objective']);
        $this->assertFalse($result['saved']);
    }

    public function test_summary_keeps_nonadjacent_or_qualified_statements_and_makes_no_model_call(): void
    {
        config(['ai.scribe_semantic_summary_enabled'=>false]);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++; throw new \RuntimeException('Summary must not call the model.');
            }
        };
        $source='Owner reports coughing. The dog is alert. Owner reports coughing.';
        $qualified='No vomiting. No vomiting.';
        $base=['ok'=>true,'soap'=>['subjective'=>$source,'objective'=>['findings'=>$qualified,'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.'], 'warnings'=>[], 'saved'=>false];
        $result=(new DoctorScribeService(new AiGateway($provider)))->summarizeDraft($base);
        $this->assertFalse($result['summaryApplied']);
        $this->assertSame($source,$result['soap']['subjective']);
        $this->assertSame($qualified,$result['soap']['objective']['findings']);
        $this->assertSame(0,$provider->calls);
    }

    public function test_an_assessment_sentence_cannot_be_duplicated_in_objective(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='On examination the dog is alert. I suspect mild irritation.';
        $unsafe=['subjective'=>'Not provided.','objective'=>['findings'=>$source,'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'I suspect mild irritation.','plan'=>'Not provided.'];
        $result=(new DoctorScribeService(new AiGateway($this->fake(json_encode($unsafe)))))->draft($source);
        $this->assertFalse($result['ok']);
        $this->assertSame('source_mismatch_objective',$result['code']);
    }

    private function fictionalTranscript(): string
    {
        return 'Owner reports vomiting twice. On examination mild dehydration. Weight 8.5 kg. '
            .'Temperature 38.7 C. Heart rate 110 bpm. Suspected gastrointestinal upset. Monitor hydration.';
    }

    public function test_source_index_recovery_uses_entire_sentences_and_excludes_questions(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='The owner reports no vomiting. Is the dog coughing? The dog is alert. My assessment: uncertain cause. Return next week.';
        $provider=new class implements AiProviderInterface {
            private int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++;
                if($this->calls===1) return ['text'=>json_encode(['subjective'=>'vomiting','objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.']),'usage'=>[]];
                return ['text'=>json_encode(['subjective'=>[1],'objective'=>[3],'assessment'=>[4],'plan'=>[5]]),'usage'=>[]];
            }
        };
        $result=(new DoctorScribeService(new AiGateway($provider)))->draft($source);
        $this->assertTrue($result['ok']);
        $this->assertSame('The owner reports no vomiting.',$result['soap']['subjective']);
        $this->assertSame('My assessment: uncertain cause.',$result['soap']['assessment']);
        $this->assertNull($result['soap']['objective']['temperatureC']);
        $this->assertFalse($result['saved']);
    }

    public function test_source_index_recovery_rejects_questions_duplicates_and_invalid_ids(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        foreach ([['subjective'=>[2],'objective'=>[],'assessment'=>[],'plan'=>[]], ['subjective'=>[1],'objective'=>[1],'assessment'=>[],'plan'=>[]], ['subjective'=>[99],'objective'=>[],'assessment'=>[],'plan'=>[]]] as $selection) {
            $provider=new class($selection) implements AiProviderInterface {
                private int $calls=0;
                public function __construct(private array $selection) {}
                public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                    $this->calls++;
                    $value=$this->calls===1 ? ['subjective'=>'vomiting','objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'Not provided.'] : $this->selection;
                    return ['text'=>json_encode($value),'usage'=>[]];
                }
            };
            $result=(new DoctorScribeService(new AiGateway($provider)))->draft('The owner reports no vomiting. Is the dog coughing? The dog is alert.');
            $this->assertFalse($result['ok']);
        }
    }

    public function test_punctuation_suggestions_preserve_source_and_do_not_save(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='ayon sa owner hindi sumusuka ang aso alert ang dog';
        $result=(new DoctorScribeService(new AiGateway($this->fake('Ayon sa owner, hindi sumusuka ang aso. Alert ang dog.'))))->suggestPunctuation($source);
        $this->assertTrue($result['ok']);
        $this->assertSame('ayon sa owner, hindi sumusuka ang aso. alert ang dog.',$result['suggestion']);
        $this->assertFalse($result['saved']);
        foreach (['ayon sa owner sumusuka ang aso alert ang dog.', 'ayon sa owner hindi sumusuka ang pusa alert ang dog.'] as $changed) {
            $result=(new DoctorScribeService(new AiGateway($this->fake($changed))))->suggestPunctuation($source);
            $this->assertFalse($result['ok']);
            $this->assertSame('punctuation_changed_source',$result['code']);
        }
        $result=(new DoctorScribeService(new AiGateway($this->fake('temperature 3.9 C repeat test.'))))->suggestPunctuation('temperature 39 C repeat test');
        $this->assertFalse($result['ok']);
    }

    public function test_punctuation_suggestion_keeps_original_unapostrophized_word(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='no i havent given medicine';
        $result=(new DoctorScribeService(new AiGateway($this->fake("No, I haven't given medicine."))))->suggestPunctuation($source);
        $this->assertTrue($result['ok']);
        $this->assertSame('no, i havent given medicine.',$result['suggestion']);
        $unsafe=(new DoctorScribeService(new AiGateway($this->fake("No, I have given medicine."))))->suggestPunctuation($source);
        $this->assertFalse($unsafe['ok']);
    }

    public function test_punctuation_request_requires_doctor_authentication(): void
    {
        $this->postJson('/api/ai/doctor-scribe', ['appointment_id'=>1,'transcript'=>'fictional transcript text','mode'=>'punctuation'])->assertUnauthorized();
        $this->login('User');
        $this->postJson('/api/ai/doctor-scribe', ['appointment_id'=>1,'transcript'=>'fictional transcript text','mode'=>'punctuation'])->assertForbidden();
    }

    private function sampleSoap(array $override = []): string
    {
        return json_encode(array_replace_recursive([
            'subjective' => 'Owner reports vomiting twice.',
            'objective' => [
                'findings' => 'On examination mild dehydration.',
                'weightKg' => 8.5, 'temperatureC' => 38.7, 'heartRateBpm' => 110,
            ],
            'assessment' => 'Suspected gastrointestinal upset.',
            'plan' => 'Monitor hydration.',
        ], $override), JSON_THROW_ON_ERROR);
    }

    public function test_unauthenticated_and_wrong_role_cannot_use_scribe(): void
    {
        $body = ['appointment_id' => 1, 'transcript' => $this->fictionalTranscript()];
        $this->postJson('/api/ai/doctor-scribe', $body)->assertUnauthorized();
        foreach (['User', 'Admin'] as $role) {
            $this->login($role);
            $this->postJson('/api/ai/doctor-scribe', $body)->assertForbidden();
        }
    }

    public function test_disabled_clinical_ai_fails_before_any_provider_call(): void
    {
        $this->login('Doctor');
        config()->set('ai.enabled', true);
        config()->set('ai.clinical_enabled', false);
        config()->set('ai.clinical_clearance', false);
        config()->set('ai.paid_data_approved', false);
        $fake = $this->fake($this->sampleSoap());
        $this->app->instance(AiProviderInterface::class, $fake);
        $this->postJson('/api/ai/doctor-scribe', [
            'appointment_id' => 1, 'transcript' => $this->fictionalTranscript(),
        ])->assertStatus(503)->assertJsonPath('code', 'clinical_blocked');
        $this->assertSame(0, $fake->calls);
    }

    public function test_grounded_soap_is_a_review_only_proposal(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.clinical_enabled', true);
        config()->set('ai.clinical_clearance', true);
        config()->set('ai.paid_data_approved', true);
        $fake = $this->fake($this->sampleSoap());
        $scribe = new DoctorScribeService(new AiGateway($fake));
        $result = $scribe->draft($this->fictionalTranscript());
        $this->assertTrue($result['ok']);
        $this->assertSame('Owner reports vomiting twice.', $result['soap']['subjective']);
        $this->assertFalse($result['saved']);
        $this->assertFalse($result['consultation_completed']);
        $this->assertSame(1, $fake->calls);
    }

    public function test_hallucinated_diagnosis_and_vitals_are_rejected(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.clinical_enabled', true);
        config()->set('ai.clinical_clearance', true);
        config()->set('ai.paid_data_approved', true);
        $fake = $this->fake($this->sampleSoap(['assessment' => 'Parvovirus confirmed.']));
        $result = (new DoctorScribeService(new AiGateway($fake)))->draft($this->fictionalTranscript());
        $this->assertFalse($result['ok']);
        $this->assertSame('ungrounded_assessment', $result['code']);

        $fake = $this->fake($this->sampleSoap(['objective' => ['heartRateBpm' => 160]]));
        $result = (new DoctorScribeService(new AiGateway($fake)))->draft($this->fictionalTranscript());
        $this->assertFalse($result['ok']);
        $this->assertSame('ungrounded_vital', $result['code']);
    }

    public function test_invalid_provider_json_and_uncleared_gateway_fail_closed(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.clinical_enabled', true);
        config()->set('ai.clinical_clearance', true);
        config()->set('ai.paid_data_approved', true);
        $fake = $this->fake('{bad json');
        $this->assertFalse((new DoctorScribeService(new AiGateway($fake)))
            ->draft($this->fictionalTranscript())['ok']);
        config()->set('ai.clinical_clearance', false);
        $fake = $this->fake($this->sampleSoap());
        $result = (new DoctorScribeService(new AiGateway($fake)))->draft($this->fictionalTranscript());
        $this->assertFalse($result['ok']);
        $this->assertSame(0, $fake->calls);
    }

    public function test_hypothetical_vital_from_model_is_rejected(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.clinical_enabled', true);
        config()->set('ai.clinical_clearance', true);
        config()->set('ai.paid_data_approved', true);
        $transcript = 'What if temperature of 40 C would be dangerous? No temperature was measured today.';
        $response = json_encode([
            'subjective' => 'Not provided.',
            'objective' => ['findings' => 'No temperature was measured today.', 'weightKg' => null, 'temperatureC' => 40, 'heartRateBpm' => null],
            'assessment' => 'Not provided.', 'plan' => 'Not provided.',
        ], JSON_THROW_ON_ERROR);
        $result = (new DoctorScribeService(new AiGateway($this->fake($response))))->draft($transcript);
        $this->assertFalse($result['ok']);
        $this->assertSame('ungrounded_vital', $result['code']);
    }

    public function test_uncertain_vital_can_be_preserved_as_review_only_source_text(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='The first thermometer showed 39 C but was broken. A second thermometer showed 38 C. Both readings need confirmation. The veterinarian recommends repeating the measurement.';
        $provider=new class implements AiProviderInterface {
            private int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++;
                $value=$this->calls===1 ? ['subjective'=>'Not provided.','objective'=>['findings'=>'The first thermometer showed 39 C but was broken. A second thermometer showed 38 C. Both readings need confirmation.','weightKg'=>null,'temperatureC'=>39,'heartRateBpm'=>null],'assessment'=>'Not provided.','plan'=>'The veterinarian recommends repeating the measurement.'] : ['subjective'=>[],'objective'=>[1,2,3],'assessment'=>[],'plan'=>[4]];
                return ['text'=>json_encode($value),'usage'=>[]];
            }
        };
        $result=(new DoctorScribeService(new AiGateway($provider)))->draft($source);
        $this->assertTrue($result['ok']);
        $this->assertNull($result['soap']['objective']['temperatureC']);
        $this->assertStringContainsString('Both readings need confirmation.',$result['soap']['objective']['findings']);
        $this->assertFalse($result['saved']);
    }

    public function test_unreliable_measured_temperature_is_not_accepted_as_verified(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        foreach (['Temperature 39 C is unreliable because the thermometer was broken.',
            'Temperature 39 C. The thermometer was broken and needs confirmation.'] as $transcript) {
        $response=json_encode([
            'subjective'=>'Not provided.',
            'objective'=>['findings'=>$transcript,'weightKg'=>null,'temperatureC'=>39,'heartRateBpm'=>null],
            'assessment'=>'Not provided.','plan'=>'Not provided.',
        ],JSON_THROW_ON_ERROR);
        $result=(new DoctorScribeService(new AiGateway($this->fake($response))))->draft($transcript);
        $this->assertFalse($result['ok']);
        $this->assertSame('ungrounded_vital',$result['code']);
        }
    }

    public function test_partial_quote_cannot_reverse_a_negated_finding(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $transcript='On examination there is no evidence the patient has a fever.';
        $response=json_encode([
            'subjective'=>'Not provided.',
            'objective'=>['findings'=>'patient has a fever','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],
            'assessment'=>'Not provided.','plan'=>'Not provided.',
        ],JSON_THROW_ON_ERROR);
        $result=(new DoctorScribeService(new AiGateway($this->fake($response))))->draft($transcript);
        $this->assertFalse($result['ok']);
        $this->assertSame('ungrounded_objective',$result['code']);
    }

    public function test_neutral_document_headings_do_not_cause_faithful_sentences_to_be_rejected(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        foreach (['Fictional test:', 'Transcript:', 'Consultation transcript:', 'Test transcript:'] as $heading) {
            $transcript=$heading.' The owner reports a mild cough for two days. The veterinarian plans a recheck next week.';
            $response=$this->sampleSoap(['subjective'=>'The owner reports a mild cough for two days.', 'objective'=>['findings'=>'Not provided.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'Not provided.', 'plan'=>'The veterinarian plans a recheck next week.']);
            $result=(new DoctorScribeService(new AiGateway($this->fake($response))))->draft($transcript);
            $this->assertTrue($result['ok'], $heading);
        }
    }

    public function test_duplicate_assessment_and_plan_sentence_is_rejected_for_review(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $transcript='The owner says the dog has no fever. On examination the dog is alert. The veterinarian recommends a recheck.';
        $response=$this->sampleSoap(['subjective'=>'The owner says the dog has no fever.', 'objective'=>['findings'=>'On examination the dog is alert.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'The veterinarian recommends a recheck.', 'plan'=>'The veterinarian recommends a recheck.']);
        $result=(new DoctorScribeService(new AiGateway($this->fake($response))))->draft($transcript);
        $this->assertFalse($result['ok']);
        $this->assertSame('source_mismatch_assessment',$result['code']);
    }

    public function test_nonadjacent_complete_source_sentences_can_be_grouped_without_losing_qualifiers(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source='The owner reports coughing. On examination the dog is alert. The owner reports no vomiting. The veterinarian plans a recheck.';
        $base=['subjective'=>'The owner reports coughing. The owner reports no vomiting.', 'objective'=>['findings'=>'On examination the dog is alert.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'Not provided.', 'plan'=>'The veterinarian plans a recheck.'];
        $result=(new DoctorScribeService(new AiGateway($this->fake(json_encode($base)))))->draft($source);
        $this->assertTrue($result['ok']);
        $base['subjective']='The owner reports coughing. The owner reports vomiting.';
        $result=(new DoctorScribeService(new AiGateway($this->fake(json_encode($base)))))->draft($source);
        $this->assertFalse($result['ok']);
        $this->assertSame('ungrounded_subjective',$result['code']);
        $base['subjective']='The owner reports no vomiting. The owner reports coughing.';
        $result=(new DoctorScribeService(new AiGateway($this->fake(json_encode($base)))))->draft($source);
        $this->assertFalse($result['ok']);
    }

    public function test_non_neutral_prefixes_and_negation_remain_required(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        foreach (['No evidence: the patient has a fever.', 'Possibly: the patient has a fever.', 'The owner denies that the patient has a fever.'] as $transcript) {
            $response=$this->sampleSoap(['subjective'=>'Not provided.', 'objective'=>['findings'=>'the patient has a fever.','weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>'Not provided.', 'plan'=>'Not provided.']);
            $result=(new DoctorScribeService(new AiGateway($this->fake($response))))->draft($transcript);
            $this->assertFalse($result['ok']);
            $this->assertSame('ungrounded_objective',$result['code']);
        }
    }

    public function test_sentence_breaks_restore_hyphen_and_paragraphs_without_losing_words(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source="Kumakain pa.\n\nnapag usapan ang x-ray pero hindi pa nagagawa";
        $good='Kumakain pa. Napag-usapan ang x ray, pero hindi pa nagagawa.';
        $service=new DoctorScribeService(new AiGateway($this->fake($good)));
        self::assertSame("Kumakain pa.\n\nnapag usapan ang x-ray, pero hindi pa nagagawa.",$service->suggestPunctuation($source)['suggestion']);
        foreach (['Kumakain pa. Napag-usapan ang x ray, pero nagagawa.', 'Kumakain pa. Napag-usapan ang x rays, pero hindi pa nagagawa.'] as $bad) {
            $result=(new DoctorScribeService(new AiGateway($this->fake($bad))))->suggestPunctuation($source);
            self::assertFalse($result['ok']); self::assertSame('punctuation_changed_source',$result['code']);
        }
    }

    public function test_sentence_breaks_retry_once_after_extra_word_but_never_accept_it(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls++;
                return ['text'=>($this->calls===1 ? 'Monitor and call the clinic.' : 'Monitor, call the clinic.'), 'usage'=>[]];
            }
        };
        $result=(new DoctorScribeService(new AiGateway($provider)))->suggestPunctuation('Monitor call the clinic');
        self::assertSame('Monitor, call the clinic.',$result['suggestion']); self::assertSame(2,$provider->calls);
        $unsafe=$this->fake('Monitor and call the clinic.');
        $result=(new DoctorScribeService(new AiGateway($unsafe)))->suggestPunctuation('Monitor call the clinic');
        self::assertFalse($result['ok']); self::assertSame('punctuation_changed_source',$result['code']); self::assertSame(2,$unsafe->calls);
    }

    public function test_long_sentence_breaks_cover_all_chunks_and_preserve_source(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source=str_repeat("Wala siyang pagsusuka at normal ang pagkain.\n\n",220).'Huling pahayag: hindi pa nasukat ang temperatura.';
        self::assertGreaterThan(8000,mb_strlen($source));
        $provider=new class implements AiProviderInterface {
            public array $seen=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->seen[]=$message;
                return ['text'=>$message,'usage'=>[]];
            }
        };
        $result=(new DoctorScribeService(new AiGateway($provider)))->suggestPunctuation($source);
        self::assertTrue($result['ok']); self::assertSame($source,$result['suggestion']); self::assertGreaterThan(1,count($provider->seen));
    }

    public function test_long_sentence_break_failure_never_returns_partial_suggestion(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                if (++$this->calls===2) throw new \App\Services\AI\AiProviderException('rate_limit',429);
                return ['text'=>$message,'usage'=>[]];
            }
        };
        $source=str_repeat('No vomiting was observed. ',180);
        $result=(new DoctorScribeService(new AiGateway($provider)))->suggestPunctuation($source);
        self::assertFalse($result['ok']); self::assertSame('rate_limit',$result['code']); self::assertArrayNotHasKey('suggestion',$result);
    }

    public function test_sentence_break_suggestion_cannot_overflow_transcript_field(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $source=str_repeat('Normal appetite. ',1670);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                return ['text'=>str_replace('Normal', 'Normal,', $message),'usage'=>[]];
            }
        };
        $result=(new DoctorScribeService(new AiGateway($provider)))->suggestPunctuation($source);
        self::assertFalse($result['ok']); self::assertSame('punctuation_exceeds_limit',$result['code']);
    }

    public function test_sentence_breaks_report_provider_rate_limit_without_content(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                throw new \App\Services\AI\AiProviderException('rate_limit',429);
            }
        };
        $result=(new DoctorScribeService(new AiGateway($provider)))->suggestPunctuation('No vomiting was observed');
        self::assertFalse($result['ok']); self::assertSame('rate_limit',$result['code']);
    }

    public function test_sentence_breaks_restore_joined_words_and_reject_changed_words():void {
        $source='napag usapan ang blood test pero hindi pa nagawa';
        $provider=$this->fake('Napag-usapan ang blood test, pero hindi pa nagawa.');
        $r=(new DoctorScribeService(new AiGateway($provider)))->suggestPunctuation($source);
        self::assertTrue($r['ok']);self::assertSame('napag usapan ang blood test, pero hindi pa nagawa.',$r['suggestion']);
        $unsafe=$this->fake('Napag-usapan ang blood test, pero nagawa.');
        $r=(new DoctorScribeService(new AiGateway($unsafe)))->suggestPunctuation($source);
        self::assertFalse($r['ok']);self::assertSame('punctuation_changed_source',$r['code']);
    }
}
