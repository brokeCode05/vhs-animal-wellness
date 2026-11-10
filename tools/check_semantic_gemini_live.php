<?php
// Uses fictional data only. Does not create an appointment or print secrets.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$facts = new class extends App\Services\AI\UserVettiFacts {
    public function pets(App\Models\User $user): array { return [['id'=>777,'name'=>'Fictionalpet','species'=>'Dog']]; }
    public function ownsPet(App\Models\User $user, int $petId): bool { return $petId === 777; }
};
$user = new App\Models\User();
$user->setRawAttributes(['id'=>999]);
$request = Illuminate\Http\Request::create('/','POST');
$request->setLaravelSession($app['session']->driver('array'));
$service = new App\Services\AI\SemanticVettiService($app->make(App\Services\AI\AiGateway::class), $facts);
$result = $service->interpret($request, $user, 'Can Fictionalpet get grooming tomorrow afternoon?', 'synthetic_test_12345');
echo 'Mode: '.($result['mode'] ?? 'unknown')."\n";
echo 'Source: '.($result['source'] ?? 'unknown')."\n";
echo 'Kind: '.($result['kind'] ?? 'unknown')."\n";
echo 'Booking created: '.(($result['booking_created'] ?? null) === false ? 'no' : 'not verified')."\n";
echo 'Requires confirmation: '.(($result['requires_confirmation'] ?? null) === true ? 'yes' : 'not verified')."\n";
if (($result['source'] ?? '') !== 'ai' || ($result['kind'] ?? '') !== 'booking_proposal' || ($result['booking_created'] ?? null) !== false || ($result['requires_confirmation'] ?? null) !== true) exit(1);
