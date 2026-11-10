<?php
// Standalone PHP smoke test: no Laravel installation or live Gemini required.
declare(strict_types=1);
$settings = [
    'ai.enabled' => true,
    'ai.clinical_enabled' => true,
    'ai.clinical_clearance' => true,
    'ai.paid_data_approved' => true,
    'ai.max_input_bytes' => 4000,
];
function config(string $key, mixed $default = null): mixed { global $settings; return $settings[$key] ?? $default; }
require __DIR__.'/../app/Services/AI/AiProviderInterface.php';
require __DIR__.'/../app/Services/AI/SchemaValidator.php';
require __DIR__.'/../app/Services/AI/AiGateway.php';
require __DIR__.'/../app/Services/AI/DoctorScribeService.php';

use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\DoctorScribeService;

$transcript = 'Owner reports vomiting twice. On examination mild dehydration. Weight 8.5 kg. Temperature 38.7 C. Heart rate 110 bpm. Suspected gastrointestinal upset. Monitor hydration.';
$soap = [
    'subjective' => 'Owner reports vomiting twice.',
    'objective' => ['findings' => 'On examination mild dehydration.', 'weightKg' => 8.5, 'temperatureC' => 38.7, 'heartRateBpm' => 110],
    'assessment' => 'Suspected gastrointestinal upset.', 'plan' => 'Monitor hydration.',
];
class FakeScribeProvider implements AiProviderInterface {
    public int $calls = 0;
    public function __construct(public string $text) {}
    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
        $this->calls++;
        return ['text' => $this->text, 'usage' => []];
    }
}
function expect(bool $cond, string $why): void { if (!$cond) throw new RuntimeException('FAIL: '.$why); }
$provider = new FakeScribeProvider(json_encode($soap));
$result = (new DoctorScribeService(new AiGateway($provider)))->draft($transcript);
expect($result['ok'] === true,'grounded SOAP is accepted');
expect($result['saved'] === false && $result['consultation_completed'] === false,'no writes indicated');
expect($provider->calls === 1,'provider called once');
$provider = new FakeScribeProvider(json_encode(array_replace($soap,['assessment'=>'Fictional invented diagnosis.'])));
$result = (new DoctorScribeService(new AiGateway($provider)))->draft($transcript);
expect($result['ok'] === false && $result['code'] === 'ungrounded_assessment','hallucination blocked');
$changed = $soap; $changed['objective']['heartRateBpm'] = 160;
$provider = new FakeScribeProvider(json_encode($changed));
$result = (new DoctorScribeService(new AiGateway($provider)))->draft($transcript);
expect($result['ok'] === false && $result['code'] === 'ungrounded_vital','invented vital blocked');
$settings['ai.clinical_clearance'] = false;
$provider = new FakeScribeProvider(json_encode($soap));
$result = (new DoctorScribeService(new AiGateway($provider)))->draft($transcript);
expect($result['ok'] === false && $provider->calls === 0,'clinical gate blocks provider');
$settings['ai.clinical_clearance'] = true;
$provider = new FakeScribeProvider('not json');
$result = (new DoctorScribeService(new AiGateway($provider)))->draft($transcript);
expect($result['ok'] === false,'invalid JSON blocked');
$provider = new FakeScribeProvider(json_encode($soap));
$result = (new DoctorScribeService(new AiGateway($provider)))->draft(str_repeat('x',3600));
expect($result['ok'] === false && $provider->calls === 0,'oversize blocked');
echo "PASS: Doctor Scribe PHP grounding, provider and gate smoke tests (8 checks)\n";
