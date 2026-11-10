<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\PublicClinicDataResolver;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\PublicGeminiConversation;
use Tests\TestCase;

final class PublicGeminiConversationTest extends TestCase
{
    public function test_translating_a_specific_service_keeps_that_service_instead_of_listing_the_catalog(): void
    {
        config()->set('ai.enabled', true);
        $facts = new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true, 'service_details'=>[
                'Spay'=>['category'=>'Surgery'], 'Vaccination'=>['category'=>'Wellness']]]; }
        };
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? '{"operation":"translate","service":"none","matching_services":[],"response_language":"taglish"}'
                    : 'Ang spay ay isang surgical procedure para sa female pets.', 'usage'=>[]];
            }
        };
        $conversation = new PublicGeminiConversation(new AiGateway($provider), $facts, new PublicClinicDataResolver($facts));
        $reply = $conversation->reply('Can you explain it in Taglish?', 'services', 'Spay');
        self::assertSame('ai', $reply['source']);
        $input = json_decode($provider->inputs[1], true);
        self::assertSame('Spay', $input['verified_clinic_data']['service']);
        self::assertSame('taglish', $input['response_language']);
        self::assertArrayNotHasKey('services', $input['verified_clinic_data']);
    }
    public function test_missing_public_price_is_given_to_model_as_unavailable_not_provider_failure(): void
    {
        config()->set('ai.enabled', true);
        $facts = new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true, 'phone'=>'09170000000',
                'service_details'=>['Dog Grooming'=>['pricing_type'=>null, 'price_min'=>null]]]; }
        };
        $provider = new class implements AiProviderInterface {
            public array $inputs = [];
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                $this->inputs[] = $message;
                return ['text'=>$jsonSchema ? '{"operation":"price","service":"Dog Grooming","matching_services":["Dog Grooming"]}'
                    : 'The dog grooming price is not available. Please contact the clinic.', 'usage'=>[]];
            }
        };
        $service = new PublicGeminiConversation(new AiGateway($provider), $facts, new PublicClinicDataResolver($facts));
        $answer = $service->reply('Dog grooming', 'price', null, ['Dog Grooming']);
        self::assertSame('ai', $answer['source']);
        self::assertSame('Dog Grooming', $answer['verified_service']);
        $input = json_decode($provider->inputs[1], true);
        self::assertTrue($input['verified_clinic_data']['price_unavailable']);
        self::assertArrayNotHasKey('price_min', $input['verified_clinic_data']);
    }
    public function test_unverified_partial_price_is_rejected_before_public_display(): void
    {
        config()->set('ai.enabled',true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Cat Grooming'=>['pricing_type'=>'starting','price_min'=>'500.00','currency'=>'PHP'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls++;
                if ($jsonSchema) return ['text'=>'{"operation":"price","service":"Cat Grooming","matching_services":["Cat Grooming"]}','usage'=>[]];
                return ['text'=>$this->calls===2?'Cat Grooming starts at PHP 50.':'Cat Grooming starts at PHP 500.','usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $result=$service->reply('How much is cat grooming?',null,null);
        self::assertSame('ai',$result['source']);
        self::assertSame('Cat Grooming starts at PHP 500.',$result['text']);
        self::assertSame(3,$provider->calls);
    }

    public function test_production_uses_gemini_only_with_feature_and_privacy_gates(): void
    {
        $original=$this->app->environment();
        $this->app->instance('env','production');
        try {
            config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
                'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
            $facts=new class extends PublicClinicFacts {
                public function load(): array {return ['available'=>true,'address'=>'42 Fictional Avenue','phone'=>null,'weekday_appointment_window'=>null,'weekend_appointment_window'=>null,'services'=>[],'service_details'=>[], 'services_by_category'=>[]];}
            };
            $provider=new class implements AiProviderInterface {
                public int $calls=0;
                public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                    $this->calls++;
                    return ['text'=>$jsonSchema ? '{"operation":"location","service":"none","matching_services":[]}' : 'The address is 42 Fictional Avenue.', 'usage'=>[]];
                }
            };
            $this->app->instance(PublicClinicFacts::class,$facts);
            $this->app->instance(AiProviderInterface::class,$provider);
            $answer=$this->app->make(\App\Services\AI\PublicVettiService::class)->reply('Where is the clinic?');
            self::assertSame('ai',$answer['source']); self::assertSame(2,$provider->calls);
            config()->set('ai.semantic_privacy_cleared',false);
            $this->app->make(\App\Services\AI\PublicVettiService::class)->reply('Where is the clinic?');
            self::assertSame(2,$provider->calls);
        } finally { $this->app->instance('env',$original); }
    }

    public function test_generic_preparation_reaches_gemini_without_ownership_or_private_details(): void
    {
        config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[],
                'services'=>[],'services_by_category'=>[]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema
                    ? '{"operation":"preparation","service":"none","matching_services":[]}'
                    : 'As general preparation, bring relevant records if available and ask the clinic about any specific requirements.',
                    'usage'=>[]];
            }
        };
        $this->app->instance(PublicClinicFacts::class,$facts);
        $this->app->instance(AiProviderInterface::class,$provider);
        $service=$this->app->make(\App\Services\AI\PublicVettiService::class);
        foreach (["What should I prepare for my pet's visit?", "What should I bring for my dog's visit?"] as $question) {
            self::assertSame('ai',$service->reply($question)['source']);
        }
        self::assertCount(4,$provider->inputs);
        self::assertStringNotContainsString("my pet",strtolower(implode(' ',$provider->inputs)));
        self::assertStringNotContainsString("my dog",strtolower(implode(' ',$provider->inputs)));
        foreach (["What is my pet's appointment?", "My pet Luna's visit is tomorrow", "What should I bring for my pet's visit? owner@example.com"] as $question) {
            self::assertSame('private',$service->reply($question)['intent']);
        }
        self::assertCount(4,$provider->inputs);
    }

    public function test_public_context_uses_verified_service_and_preserves_it_when_provider_fails(): void
    {
        config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'services'=>['Cat Grooming','Dog Grooming'],
                'services_by_category'=>[], 'service_details'=>[
                    'Cat Grooming'=>['category'=>'Pet Care','pricing_type'=>'starting','price_min'=>500,'currency'=>'PHP'],
                    'Dog Grooming'=>['category'=>'Pet Care','pricing_type'=>'contact'],
                ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                $this->calls++;
                if ($this->calls>=5) throw new \RuntimeException('synthetic provider failure');
                if ($jsonSchema) return ['text'=>json_encode([
                    'operation'=>$this->calls===1?'service':'price','service'=>'Cat Grooming',
                    'matching_services'=>['Cat Grooming'],
                ]),'usage'=>[]];
                return ['text'=>$this->calls===2?'Cat Grooming is listed.':'Cat Grooming starts at 500 PHP.','usage'=>[]];
            }
        };
        $this->app->instance(PublicClinicFacts::class,$facts);
        $this->app->instance(AiProviderInterface::class,$provider);
        $id='public_gemini_context_123';
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'Tell me about cat grooming'])
            ->assertOk()->assertJsonPath('data.source','ai');
        self::assertSame('Cat Grooming',session('vetti.public.topic')['service']);
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'Magkano naman iyon?'])
            ->assertOk()->assertJsonPath('data.source','ai');
        self::assertStringContainsString('Cat Grooming',$provider->inputs[2]);
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'What about dog grooming?'])
            ->assertOk()->assertJsonPath('data.source','rule')->assertJsonPath('data.ai_unavailable',true);
        self::assertSame('Dog Grooming',session('vetti.public.topic')['service']);
        // An unanswerable outage turn preserves that verified context.
        $before=session('vetti.public.topics');
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'Could you elaborate on something else?']);
        self::assertSame($before,session('vetti.public.topics'));
    }

    public function test_related_service_context_is_revalidated_for_non_service_interpretation(): void
    {
        config()->set('ai.enabled',true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Cat Grooming'=>['category'=>'Pet Care'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema
                    ? '{"operation":"preparation","service":"none","context_service":"Cat Grooming","matching_services":[]}'
                    : 'Cat Grooming is listed. Ask the clinic about specific preparation.','usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $reply=$service->reply('Tell me about cat grooming',null,null);
        self::assertSame('Cat Grooming',$reply['verified_service']);
        $payload=json_decode($provider->inputs[1],true);
        self::assertSame('Cat Grooming',$payload['verified_clinic_data']['related_service']['service']);
    }

    public function test_general_services_operation_keeps_only_an_agreed_verified_selection(): void
    {
        config()->set('ai.enabled',true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Cat Grooming'=>['category'=>'Pet Care'],'Dog Grooming'=>['category'=>'Pet Care'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                return ['text'=>$jsonSchema
                    ? '{"operation":"services","service":"Cat Grooming","matching_services":["Cat Grooming"]}'
                    : 'Cat Grooming is listed.','usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        self::assertSame('Cat Grooming',$service->reply('Tell me about cat grooming',null,null)['verified_service']);
    }

    public function test_public_deadline_prevents_provider_call_after_budget_is_exhausted(): void
    {
        config()->set('ai.enabled',true);
        $provider=new \App\Services\AI\Providers\FakeAiProvider('unused');
        $gateway=new AiGateway($provider);
        $gateway->startSemanticDeadline(0);
        $result=$gateway->text('public_vetti','Synthetic question','Respond briefly','sanitized');
        self::assertFalse($result['ok']);
        self::assertSame('deadline',$result['provider_failure']);
        self::assertSame(0,$provider->calls);
        $gateway->clearSemanticDeadline();
    }

    public function test_ambiguous_request_does_not_retain_previous_service_or_dump_catalog(): void
    {
        config()->set('ai.enabled', true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Dog Grooming'=>['category'=>'Pet Care'],
                'Cat Grooming'=>['category'=>'Pet Care'],
                'Vaccination'=>['category'=>'Wellness'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode([
                    'operation'=>'price','service'=>'none','context_service'=>'Cat Grooming',
                    'matching_services'=>['Dog Grooming','Cat Grooming'],
                ]) : 'Which grooming service do you mean?', 'usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $answer=$service->reply('How much is grooming?','services','Cat Grooming');
        self::assertNull($answer['verified_service']);
        $data=json_decode($provider->inputs[1],true)['verified_clinic_data'];
        self::assertSame(['Dog Grooming','Cat Grooming'],$data['active_service_labels']);
        self::assertNotContains('Vaccination',$data['active_service_labels']);
    }

    public function test_ambiguous_price_choices_survive_taglish_followup(): void
    {
        config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'services'=>['Cat Grooming','Dog Grooming'],
                'services_by_category'=>[], 'service_details'=>[
                    'Cat Grooming'=>['category'=>'Pet Care','pricing_type'=>'starting','price_min'=>500,'currency'=>'PHP'],
                    'Dog Grooming'=>['category'=>'Pet Care','pricing_type'=>'contact'],
                ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public int $structured=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) {
                    $this->structured++;
                    return ['text'=>json_encode($this->structured===1
                        ? ['operation'=>'price','service'=>'none','matching_services'=>['Dog Grooming','Cat Grooming']]
                        : ['operation'=>'price','service'=>'Cat Grooming','matching_services'=>['Cat Grooming']]),'usage'=>[]];
                }
                return ['text'=>$this->structured===1 ? 'Dog or Cat Grooming?' : 'Cat Grooming starts at PHP 500.', 'usage'=>[]];
            }
        };
        $this->app->instance(PublicClinicFacts::class,$facts);
        $this->app->instance(AiProviderInterface::class,$provider);
        $id='public_choice_context_123';
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'How much is grooming?'])
            ->assertOk()->assertJsonPath('data.source','ai');
        self::assertSame(['Dog Grooming','Cat Grooming'],session('vetti.public.topic')['choices']);
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'para sa pusa'])
            ->assertOk()->assertJsonPath('data.source','ai')->assertSee('500');
        $input=json_decode($provider->inputs[2],true);
        self::assertSame(['Dog Grooming','Cat Grooming'],$input['previous_choices']);
        self::assertSame('Cat Grooming',session('vetti.public.topic')['service']);
        self::assertSame([],session('vetti.public.topic')['choices']);
    }

    public function test_gemini_receives_verified_hours_and_language_and_can_restate_them(): void
    {
        config()->set('ai.enabled', true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'address'=>'42 Fictional Avenue',
                'phone'=>'555-0199','email'=>'clinic@example.test','service_details'=>[]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public int $interpretations=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) {
                    $this->interpretations++;
                    return ['text'=>json_encode(['operation'=>$this->interpretations===1?'hours':'translate',
                        'service'=>'none','matching_services'=>[],
                        'response_language'=>$this->interpretations===1?'filipino':'english']),'usage'=>[]];
                }
                return ['text'=>$this->interpretations===1
                    ? 'Hindi ko makumpirma ang oras ng pagbisita. Makipag-ugnayan sa clinic.'
                    : 'I cannot verify the visiting hours. Please contact the clinic.', 'usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        self::assertSame('hours',$service->reply('Ano ang visiting hours?',null,null)['intent']);
        self::assertSame('hours',$service->reply('Translate that into English','hours',null)['intent']);
        $first=json_decode($provider->inputs[1],true);
        $second=json_decode($provider->inputs[3],true);
        self::assertSame('filipino',$first['response_language']);
        self::assertSame('english',$second['response_language']);
        self::assertNull($second['verified_clinic_data']['visiting_hours']);
    }

    public function test_broad_services_preserve_verified_choices_for_a_followup(): void
    {
        config()->set('ai.enabled', true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Dog Grooming'=>['category'=>'Pet Care'],'Cat Grooming'=>['category'=>'Pet Care'],
                'Vaccination'=>['category'=>'Wellness'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode(['operation'=>'services','service'=>'none',
                    'matching_services'=>['Dog Grooming','Cat Grooming'],'response_language'=>'english'])
                    : 'We offer Dog Grooming and Cat Grooming.', 'usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $reply=$service->reply('Do you offer grooming?',null,null);
        self::assertSame(['Dog Grooming','Cat Grooming'],$reply['verified_choices']);
        $answer=json_decode($provider->inputs[1],true);
        self::assertSame(['Dog Grooming','Cat Grooming'],$answer['verified_clinic_data']['services']);
        self::assertSame('english',$answer['response_language']);
    }

    public function test_clinic_info_resolves_only_verified_public_contact_data(): void
    {
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'address'=>'42 Fictional Avenue',
                'phone'=>'555-0199','email'=>'clinic@example.test','service_details'=>[]]; }
        };
        $result=(new PublicClinicDataResolver($facts))->resolve(['type'=>'clinic_info']);
        self::assertSame('42 Fictional Avenue',$result['address']);
        self::assertSame('555-0199',$result['phone']);
        self::assertSame('clinic@example.test',$result['email']);
        self::assertArrayNotHasKey('visiting_hours',$result);
    }

    public function test_services_then_price_clarification_keeps_price_intent_for_tagalog_choice(): void
    {
        config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'services'=>['Cat Grooming','Dog Grooming'],
                'services_by_category'=>[], 'service_details'=>[
                    'Cat Grooming'=>['category'=>'Pet Care','pricing_type'=>'starting','price_min'=>500,'currency'=>'PHP'],
                    'Dog Grooming'=>['category'=>'Pet Care','pricing_type'=>'contact'],
                ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public int $step=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                if ($jsonSchema) {
                    $this->step++;
                    $data=$this->step===1 ? ['operation'=>'services','service'=>'none','matching_services'=>['Dog Grooming','Cat Grooming']]
                        : ($this->step===2 ? ['operation'=>'price','service'=>'none','matching_services'=>['Dog Grooming','Cat Grooming']]
                        : ['operation'=>'price','service'=>'Cat Grooming','matching_services'=>['Cat Grooming']]);
                    return ['text'=>json_encode($data),'usage'=>[]];
                }
                return ['text'=>$this->step===3?'Cat Grooming starts at PHP 500.':'Dog Grooming or Cat Grooming.', 'usage'=>[]];
            }
        };
        $this->app->instance(PublicClinicFacts::class,$facts);
        $this->app->instance(AiProviderInterface::class,$provider);
        $id='public_three_turn_123';
        foreach (['Do you offer grooming?','How much is it?'] as $q)
            $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>$q])->assertOk();
        self::assertSame('price',session('vetti.public.topic')['topic']);
        $this->postJson('/api/ai/public-vetti',['conversation_id'=>$id,'message'=>'Para sa pusa.'])
            ->assertOk()->assertJsonPath('data.source','ai')->assertSee('500');
        $input=json_decode($provider->inputs[4],true);
        self::assertSame('price',$input['previous_topic']);
        self::assertSame(['Dog Grooming','Cat Grooming'],$input['previous_choices']);
    }

    public function test_provider_failure_offers_only_verified_clinic_contact(): void
    {
        config()->set('ai.enabled',true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'phone'=>'555-0199','service_details'=>[]]; }
        };
        $provider=new \App\Services\AI\Providers\FakeAiProvider('unused',true);
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $answer=$service->reply('Where is the clinic?',null,null);
        self::assertSame('fallback',$answer['source']);
        self::assertStringContainsString('temporarily unavailable',$answer['text']);
        self::assertStringContainsString('555-0199',$answer['text']);
    }

    public function test_ambiguous_price_uses_verified_choices_for_gemini_clarification(): void
    {
        config()->set('ai.enabled', true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Dog Grooming'=>['pricing_type'=>'starting','price_min'=>300],
                'Cat Grooming'=>['pricing_type'=>'starting','price_min'=>500],
                'Vaccination'=>['pricing_type'=>'contact'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions, string $message, ?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? json_encode(['operation'=>'price','service'=>'none','matching_services'=>['Dog Grooming','Cat Grooming']]) : 'Which service do you mean: Dog Grooming or Cat Grooming?', 'usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $answer=$service->reply('How much is grooming?',null,null);
        $data=json_decode($provider->inputs[1],true)['verified_clinic_data'];
        $this->assertSame('ai',$answer['source']);
        $this->assertNull($answer['verified_service']);
        $this->assertTrue($data['needs_clarification']);
        $this->assertSame(['Dog Grooming','Cat Grooming'],$data['active_service_labels']);
        $this->assertArrayNotHasKey('price_min',$data);
    }
    public function test_translation_preserves_verified_service_choices(): void
    {
        config()->set('ai.enabled', true);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'service_details'=>[
                'Dog Grooming'=>['category'=>'Care'], 'Cat Grooming'=>['category'=>'Care'], 'Vaccination'=>['category'=>'Wellness'],
            ]]; }
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->inputs[]=$message;
                return ['text'=>$jsonSchema ? '{"operation":"translate","service":"none","matching_services":[],"response_language":"filipino"}' : 'May Dog Grooming at Cat Grooming.', 'usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $reply=$service->reply('Say that in Filipino','services',null,['Dog Grooming','Cat Grooming']);
        self::assertSame('ai',$reply['source']);
        $input=json_decode($provider->inputs[1],true);
        self::assertSame(['Dog Grooming','Cat Grooming'],$input['verified_clinic_data']['services']);
        self::assertSame(['Dog Grooming','Cat Grooming'],$reply['verified_choices']);
    }


    public function test_unverified_item_clarification_does_not_supply_a_catalog_or_revive_an_old_service(): void
    {
        config(['ai.enabled'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load():array{return ['available'=>true,'service_details'=>['Consultation'=>['category'=>'Care'],'Vaccination'=>['category'=>'Care']]];}
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];public array $prompts=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;$this->prompts[]=$instructions;
                return ['text'=>$jsonSchema?'{"operation":"clarify","service":"none","matching_services":[],"context_service":"none"}'
                    :'I cannot verify that item. Please contact the clinic to check.','usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $reply=$service->reply('Do you carry travel bags?','services','Vaccination');
        self::assertSame('ai',$reply['source']);self::assertNull($reply['verified_service']);
        self::assertSame([],$reply['verified_choices']);
        self::assertStringContainsString('verify that item',$reply['text']);
        self::assertStringNotContainsString('Vaccination',$reply['text']);
        foreach($provider->prompts as $prompt)self::assertLessThanOrEqual(4000,strlen($prompt));
        self::assertCount(2,$provider->inputs); // The second call receives verified non-match facts only.
        $payload=json_decode($provider->inputs[1],true);self::assertArrayHasKey('verified_reply_purpose',$payload);self::assertArrayNotHasKey('question',$payload);self::assertStringNotContainsString('travel bags',$provider->inputs[1]);
    }

    public function test_first_person_filipino_guidance_is_distinct_from_private_identity_or_records(): void
    {
        foreach (['Paano naman ako makakapagbook ng appointment?','Paano ako gagawa ng account?','How can I book an appointment?'] as $message) {
            self::assertSame($message,\App\Services\AI\PublicVettiSafetyGate::providerMessage($message));
        }
        foreach (['Ako si FictionalName, paano mag-book?','Pangalan ko FictionalName','Appointment ko bukas','Ipakita ang medical records ko','My name is Fictional Person'] as $message) {
            self::assertNull(\App\Services\AI\PublicVettiSafetyGate::providerMessage($message));
        }
    }

    public function test_location_restatement_is_a_resolved_task_even_without_verbatim_previous_text(): void
    {
        config(['ai.enabled'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load():array{return ['available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[]];}
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];public array $prompts=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;$this->prompts[]=$instructions;
                return ['text'=>$jsonSchema?'{"operation":"translate","service":"none","matching_services":[]}'
                    :'Ang klinika ay nasa 42 Fictional Avenue.','usage'=>[]];
            }
        };
        $reply=(new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts)))
            ->reply('can you explain that in tagalog','location',null);
        self::assertSame('ai',$reply['source']);
        $task=json_decode($provider->inputs[1],true);
        self::assertSame('location',$task['public_topic']);self::assertSame('filipino',$task['response_language']);
        self::assertTrue($task['restate_verified_information']);self::assertStringContainsString('location',$task['question']);
        self::assertStringNotContainsString('that',$task['question']);
        self::assertSame('42 Fictional Avenue',$task['verified_clinic_data']['address']);
        self::assertStringNotContainsString('previous response is not available',$provider->prompts[1]);
        self::assertCount(2,$provider->inputs);
    }

    public function test_missing_public_subject_asks_a_question_without_composing_an_unrelated_address(): void
    {
        config(['ai.enabled'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load():array{return ['available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[]];}
        };
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++;return ['text'=>'{"operation":"translate","service":"none","matching_services":[],"response_language":"filipino"}','usage'=>[]];
            }
        };
        $reply=(new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts)))
            ->reply('can you explain that in tagalog',null,null);
        self::assertSame('rule',$reply['source']);self::assertStringContainsString('Aling paksa',$reply['text']);
        self::assertStringNotContainsString('Fictional Avenue',$reply['text']);self::assertSame(1,$provider->calls);
    }

    public function test_category_restatement_keeps_a_large_subset_instead_of_the_entire_catalog(): void
    {
        config(['ai.enabled'=>true]);
        $subset=array_map(fn($n)=>'Procedure '.$n,range(1,8));$all=[...$subset,'Unrelated service'];
        $facts=new class($subset,$all) extends PublicClinicFacts {
            public function __construct(private array $subset,private array $all){}
            public function load():array{return ['available'=>true,'service_details'=>array_fill_keys($this->all,[]),
                'services_by_category'=>['Verified group'=>$this->subset]];}
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;return ['text'=>$jsonSchema?'{"operation":"translate","service":"none","matching_services":[],"response_language":"filipino"}'
                    :'Ito ang mga serbisyo sa napiling kategorya.','usage'=>[]];
            }
        };
        $reply=(new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts)))
            ->reply('Explain those services in Tagalog','services',null,[],'Verified group');
        self::assertSame('ai',$reply['source']);$task=json_decode($provider->inputs[1],true);
        self::assertSame($subset,$task['verified_clinic_data']['services']);
        self::assertSame($subset,$reply['verified_choices']);
    }

    public function test_existing_registration_and_combined_hours_topics_have_restatement_sources(): void
    {
        config(['ai.enabled'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load():array{return ['available'=>true,'address'=>'42 Fictional Avenue','service_details'=>[],'operating_hours'=>null];}
        };
        $provider=new class implements AiProviderInterface {
            public array $inputs=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->inputs[]=$message;return ['text'=>$jsonSchema?'{"operation":"translate","service":"none","matching_services":[],"response_language":"filipino"}'
                    :'Narito ang impormasyong mula sa clinic.','usage'=>[]];
            }
        };
        $service=new PublicGeminiConversation(new AiGateway($provider),$facts,new PublicClinicDataResolver($facts));
        $service->reply('Explain that in Tagalog','register',null);
        self::assertArrayHasKey('process',json_decode($provider->inputs[1],true)['verified_clinic_data']);
        $service->reply('Explain that in Tagalog','hours_location',null);
        $data=json_decode($provider->inputs[3],true)['verified_clinic_data'];
        self::assertSame('42 Fictional Avenue',$data['address']);self::assertArrayHasKey('regular_operating_hours',$data);
        self::assertCount(4,$provider->inputs);
    }

    public function test_http_restatement_does_not_broaden_a_removed_service_to_the_current_catalog(): void
    {
        config(['ai.enabled'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true,
            'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load():array{return ['available'=>true,'services'=>['Consultation'],'service_details'=>['Consultation'=>[]]];}
        };
        $provider=new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->calls++;return ['text'=>'{"operation":"translate","service":"none","matching_services":[],"response_language":"filipino"}','usage'=>[]];
            }
        };
        $this->app->instance(PublicClinicFacts::class,$facts);$this->app->instance(AiProviderInterface::class,$provider);
        $id='removed_catalog_context_123';
        $this->withSession(['vetti.public.topics'=>['c_'.$id=>['id'=>$id,'topic'=>'services','service'=>'Removed Service',
            'choices'=>[],'category'=>null,'until'=>time()+600]]]);
        $this->postJson('/api/ai/public-vetti',['message'=>'Explain that in Tagalog','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.source','rule')->assertSee('Aling paksa')->assertDontSee('Consultation');
        self::assertSame(1,$provider->calls);
    }
}
