<?php
// Synthetic connectivity check. Do not print credentials or provider errors.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$key = trim((string) config('ai.api_key'));
$model = trim((string) config('ai.model'));
if ($key === '' || !preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\z/D', $model)) {
    fwrite(STDERR, "Missing key or invalid model identifier.\n"); exit(1);
}
try {
    $response = Illuminate\Support\Facades\Http::withHeaders(['x-goog-api-key' => $key])
        ->timeout(30)->post('https://generativelanguage.googleapis.com/v1beta/models/'.$model.':generateContent', [
            'contents' => [['role' => 'user', 'parts' => [['text' => 'Say hello in one short sentence.']]]],
            'generationConfig' => ['maxOutputTokens' => 256],
        ]);
    echo 'Model: '.$model."\nHTTP status: ".$response->status()."\n";
    $parts = data_get($response->json(), 'candidates.0.content.parts', []);
    $text = collect(is_array($parts) ? $parts : [])->pluck('text')->filter()->implode('');
    if (!$response->successful() || trim($text) === '') { echo "No usable response.\n"; exit(1); }
    echo "Gemini returned usable text: ".trim($text)."\n";
    $vetti = $app->make(App\Services\AI\UserVettiService::class);
    $result = $vetti->reply(new App\Models\User(), 'I work late on weekdays; can I arrange a clinic visit another way?');
    echo 'User Vetti source: '.($result['source'] ?? 'unknown')."\n";
    echo 'User Vetti answer: '.($result['text'] ?? '')."\n";
    if (($result['source'] ?? '') !== 'ai') exit(2);
    $structured = $app->make(App\Services\AI\AiGateway::class)->structured(
        'booking_intent', 'Say hello.', 'Return a short greeting.', 'sanitized',
        ['type' => 'object', 'properties' => ['greeting' => ['type' => 'string']], 'required' => ['greeting']]
    );
    echo 'Structured Gemini response: '.(($structured['ok'] ?? false) ? 'valid' : 'unavailable')."\n";
    if (!($structured['ok'] ?? false)) exit(3);
} catch (Throwable $e) {
    echo "Connection failed (network, TLS, or timeout).\n"; exit(1);
}
