<?php

namespace Tests\Feature\AI;

use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\SchemaValidator;
use Tests\TestCase;

class AiFoundationTest extends TestCase
{
    private const SCHEMA = [
        'type' => 'object',
        'properties' => [
            'intent' => ['type' => 'string', 'enum' => ['unknown', 'book_appointment']],
            'service' => ['type' => ['string', 'null']],
        ],
        'required' => ['intent', 'service'],
        'additionalProperties' => false,
    ];

    public function test_provider_binding_is_available_but_does_not_call_gemini(): void
    {
        config()->set('ai.provider', 'fake');
        $this->assertInstanceOf(AiProviderInterface::class, app(AiProviderInterface::class));
        $this->assertInstanceOf(AiGateway::class, app(AiGateway::class));
    }

    public function test_ai_is_disabled_by_default(): void
    {
        config()->set('ai.enabled', false);
        $fake = new FakeAiProvider();
        $reply = (new AiGateway($fake))->text('public_vetti', 'Clinic hours?', 'Only clinic info.', 'public');
        $this->assertSame('fallback', $reply['source']);
        $this->assertSame('disabled', $reply['error_code']);
        $this->assertSame(0, $fake->calls);
    }

    public function test_fake_provider_generates_safe_text_when_enabled(): void
    {
        config()->set('ai.enabled', true);
        $fake = new FakeAiProvider('A safe public reply.');
        $reply = (new AiGateway($fake))->text('public_vetti', 'Where do I log in?', 'Public FAQs only.', 'public');
        $this->assertTrue($reply['ok']);
        $this->assertSame('A safe public reply.', $reply['text']);
        $this->assertSame(1, $fake->calls);
    }

    public function test_sensitive_data_is_not_sent_to_unapproved_api_project(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.paid_data_approved', false);
        $fake = new FakeAiProvider();
        $reply = (new AiGateway($fake))->text('user_vetti', 'my pet details', 'Help.', 'personal');
        $this->assertSame('privacy_blocked', $reply['error_code']);
        $this->assertSame(0, $fake->calls);
    }

    public function test_doctor_scribe_is_blocked_even_when_ai_is_enabled(): void
    {
        config()->set('ai.enabled', true);
        config()->set('ai.paid_data_approved', true);
        config()->set('ai.clinical_enabled', false);
        config()->set('ai.clinical_clearance', false);
        $fake = new FakeAiProvider();
        $reply = (new AiGateway($fake))->structured('scribe', 'synthetic transcript', 'SOAP draft.', 'clinical', self::SCHEMA);
        $this->assertSame('clinical_blocked', $reply['error_code']);
        $this->assertSame(0, $fake->calls);
    }

    public function test_outage_is_a_safe_fallback(): void
    {
        config()->set('ai.enabled', true);
        $fake = new FakeAiProvider('unused', true);
        $reply = (new AiGateway($fake))->text('public_vetti', 'hello', 'Public FAQs.', 'public');
        $this->assertSame('provider_unavailable', $reply['error_code']);
        $this->assertStringNotContainsString('Simulated provider', $reply['text']);
    }

    public function test_structured_output_rejects_unexpected_fields(): void
    {
        config()->set('ai.enabled', true);
        $fake = new FakeAiProvider('{"intent":"book_appointment","service":"vaccination","unauthorized":true}');
        $reply = (new AiGateway($fake))->structured('booking_intent', 'Book vaccination', 'Extract only.', 'sanitized', self::SCHEMA);
        $this->assertSame('invalid_schema', $reply['error_code']);
    }

    public function test_structured_output_accepts_valid_fake_json(): void
    {
        config()->set('ai.enabled', true);
        $fake = new FakeAiProvider('{"intent":"book_appointment","service":"vaccination"}');
        $reply = (new AiGateway($fake))->structured('booking_intent', 'Book vaccination', 'Extract only.', 'sanitized', self::SCHEMA);
        $this->assertTrue($reply['ok']);
        $this->assertSame('book_appointment', $reply['data']['intent']);
    }

    public function test_rule_router_matches_known_taglish_alias_without_calling_ai(): void
    {
        $router = new \App\Services\AI\DeterministicIntentRouter();
        $registry = [
            'clinic_hours' => ['aliases' => ['What time are you open?', 'Anong oras kayo bukas?']],
        ];
        $result = $router->route('  ANONG ORAS KAYO BUKAS?  ', $registry);
        $this->assertSame('rule', $result['route']);
        $this->assertSame('clinic_hours', $result['intent']);
    }

    public function test_rule_router_requires_missing_fields_to_be_clarified(): void
    {
        $router = new \App\Services\AI\DeterministicIntentRouter();
        $result = $router->route('Show my appointment', [
            'lookup' => ['aliases' => ['Show my appointment'], 'required' => ['pet_id']],
        ]);
        $this->assertSame('clarify', $result['route']);
        $this->assertSame(['pet_id'], $result['missing']);
    }

    public function test_rule_router_never_executes_unknown_text(): void
    {
        $router = new \App\Services\AI\DeterministicIntentRouter();
        $result = $router->route('Set an arbitrary booking for tomorrow', []);
        $this->assertSame('llm_candidate', $result['route']);
    }

    public function test_schema_validator_rejects_wrong_types(): void
    {
        $this->assertFalse(SchemaValidator::matches(self::SCHEMA, json_decode('{"intent":5,"service":null}')));
    }
}
