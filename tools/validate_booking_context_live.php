<?php
// Synthetic data only; read-only proposals; no credentials or prompts printed.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.timeout'=>40, 'ai.connect_timeout'=>5]);
$facts = new class extends App\Services\AI\UserVettiFacts {
    public function pets(App\Models\User $user): array { return [['id'=>7001,'name'=>'Luna','species'=>'Dog'],['id'=>7002,'name'=>'Milo','species'=>'Dog']]; }
    public function ownsPet(App\Models\User $user, int $id): bool { return in_array($id, [7001,7002], true); }
};
$provider = new class implements App\Services\AI\AiProviderInterface {
    public array $last = [];
    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
        $start = microtime(true);
        try {
            $result = (new App\Services\AI\Providers\GeminiProvider())->generate($instructions, $message, $jsonSchema);
            $this->last = ['duration_ms'=>(int)((microtime(true)-$start)*1000), 'interpretation'=>json_decode($result['text'], true), 'usage'=>$result['usage']];
            return $result;
        } catch (\App\Services\AI\AiProviderException $e) {
            $this->last = ['duration_ms'=>(int)((microtime(true)-$start)*1000), 'error'=>$e->category, 'http_status'=>$e->httpStatus];
            throw $e;
        }
    }
};
$request = Illuminate\Http\Request::create('/', 'POST');
$request->setLaravelSession($app['session']->driver('array'));
$user = new App\Models\User();
$user->setRawAttributes(['id'=>999]);
$service = new App\Services\AI\SemanticVettiService(new App\Services\AI\AiGateway($provider), $facts);
$cases = [
    ['initial', 'Book Luna vaccination tomorrow afternoon'],
    ['change_date', 'Change the date to the day after tomorrow'],
    ['repeat', 'Ano na ulit yung booking details?'],
    ['ambiguous', 'What about another one?'],
    ['new_booking', 'start a new booking for Milo grooming'],
];
foreach ($cases as [$id, $message]) {
    $provider->last = [];
    $result = $service->interpret($request, $user, $message, 'synthetic_context_12345');
    $entries = $request->session()->get('vetti_semantic_proposals', []);
    $state = is_array($entries) ? array_values($entries)[0] ?? null : null;
    if ($state) unset($state['conversation_id'], $state['expires_at']);
    echo json_encode(['case'=>$id, 'model'=>config('ai.model'), 'provider'=>$provider->last,
        'result'=>$result, 'synthetic_state'=>$state], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
    if (isset($provider->last['error']) || ($result['mode'] ?? '') === 'fallback') break;
}
