<?php
namespace Tests\Feature\AI;

use App\Services\AI\AiProviderInterface;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\PublicGeminiConversation;
use Tests\TestCase;

final class PublicResponseRecoveryTest extends TestCase
{
    private function runAnswers(array $answers): array
    {
        config(['ai.enabled'=>true]);
        $facts=new class extends PublicClinicFacts {
            public function load(): array { return ['available'=>true,'services'=>[], 'service_details'=>[], 'services_by_category'=>[]]; }
        };
        $provider=new class($answers) implements AiProviderInterface {
            public int $calls=0;
            public array $messages=[];
            public function __construct(private array $answers) {}
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array {
                $this->calls++;
                $this->messages[]=$message;
                return ['text'=>$jsonSchema ? '{"operation":"booking_help","service":"none","matching_services":[]}' : array_shift($this->answers),'usage'=>[]];
            }
        };
        $this->app->instance(PublicClinicFacts::class,$facts);
        $this->app->instance(AiProviderInterface::class,$provider);
        $reply=$this->app->make(PublicGeminiConversation::class)->reply('How to book?',null,null);
        return [$reply,$provider];
    }

    public function test_rewrites_unverified_number_using_same_verified_facts(): void
    {
        [$reply,$provider]=$this->runAnswers(['Step 1: Sign in.','Sign in, then choose a pet and complete confirmation and OTP.']);
        self::assertSame('ai',$reply['source']);
        self::assertSame(3,$provider->calls);
        self::assertSame($provider->messages[1],$provider->messages[2]);
        self::assertStringNotContainsString('Step 1',$provider->messages[2]);
    }

    public function test_repeated_unverified_claim_is_never_returned(): void
    {
        [$reply,$provider]=$this->runAnswers(['Booking costs 999 pesos.','Booking costs 999 pesos.']);
        self::assertSame('fallback',$reply['source']);
        self::assertStringNotContainsString('999',$reply['text']);
        self::assertSame(3,$provider->calls);
    }
}
