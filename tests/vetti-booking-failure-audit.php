<?php
// Synthetic service-failure regression using the real V3 semantic service and an in-memory database.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true,'database.default'=>'sqlite','database.connections.sqlite.database'=>':memory:','database.connections.sqlite.url'=>null]);
$provider = new class implements App\Services\AI\AiProviderInterface {
    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
        return ['text'=>json_encode(['intent'=>'booking','pet_ref'=>'PET_1','service'=>'vaccination','date_expression'=>'tomorrow','time_preference'=>'afternoon','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false]),'usage'=>[]];
    }
};
$facts = new class extends App\Services\AI\UserVettiFacts {
    public function pets(App\Models\User $user): array { return [['id'=>7,'name'=>'Luna','species'=>'Dog']]; }
    public function ownsPet(App\Models\User $user, int $petId): bool { return $petId === 7; }
};
$app->instance(App\Services\AI\AiProviderInterface::class,$provider);
$request = Illuminate\Http\Request::create('/','POST');
$request->setLaravelSession(new Illuminate\Session\Store('test', new Illuminate\Session\ArraySessionHandler(60)));
$user = new App\Models\User; $user->setRawAttributes(['id'=>123]);
$semantic = new App\Services\AI\SemanticVettiService(new App\Services\AI\AiGateway($provider),$facts,new App\Services\AI\PublicClinicFacts());
$result = $semantic->interpret($request,$user,'Book Luna vaccination tomorrow afternoon','chat_synthetic_123456');
if (($result['kind'] ?? '') !== 'information' || ($result['proposal_pending'] ?? false) !== true || !str_contains($result['text'] ?? '', 'could not verify') || isset($result['action'])) throw new RuntimeException('Failure must be honest and preserve the unconfirmed proposal.');
if (!count($request->session()->get('vetti_semantic_proposals',[]))) throw new RuntimeException('Proposal was lost.');
echo "PASS: missing availability returns an honest message and retains the pending proposal; no booking action.\n";
