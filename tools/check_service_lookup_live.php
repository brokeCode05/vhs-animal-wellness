<?php
// Synthetic public catalog and message; no private records, secrets or prompts printed.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$catalog = new class extends App\Services\AI\PublicClinicFacts {
    public function load(): array { return ['available'=>true,'services'=>['Dog Grooming','Cat Grooming','Vaccination']]; }
};
$pets = new class extends App\Services\AI\UserVettiFacts {
    public function pets(App\Models\User $user): array { return []; }
};
$provider = new class implements App\Services\AI\AiProviderInterface {
    public int $calls = 0;
    public float $milliseconds = 0;
    public ?string $error = null;
    public ?int $httpStatus = null;
    public ?string $response = null;
    public function generate(string $instructions, string $message, ?array $jsonSchema = null): array {
        $this->calls++;
        $start = microtime(true);
        try {
            $result = (new App\Services\AI\Providers\GeminiProvider())->generate($instructions, $message, $jsonSchema);
            $this->response = $result['text'];
            return $result;
        } catch (App\Services\AI\AiProviderException $e) {
            $this->error = $e->category;
            $this->httpStatus = $e->httpStatus;
            throw $e;
        }
        finally { $this->milliseconds = (microtime(true) - $start) * 1000; }
    }
};
$user = new App\Models\User();
$user->setRawAttributes(['id'=>999]);
$service = new App\Services\AI\ServiceLookupService(new App\Services\AI\AiGateway($provider), $catalog, $pets);
$start = microtime(true);
$result = $service->lookup($user, 'Do you offer grooming?');
echo json_encode(['model'=>config('ai.model'),'result'=>$result,'provider_calls'=>$provider->calls,
    'provider_ms'=>(int)$provider->milliseconds,'total_ms'=>(int)((microtime(true)-$start)*1000),
    'provider_error'=>$provider->error,'http_status'=>$provider->httpStatus,'synthetic_response'=>$provider->response], JSON_UNESCAPED_UNICODE)."\n";
