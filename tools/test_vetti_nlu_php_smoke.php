<?php
declare(strict_types=1);
// Runs without Laravel or external connections. Runtime integration remains
// covered separately by php artisan test on the developer's installation.
if (!function_exists('mb_strtolower')) {
    function mb_strtolower(string $s): string { return strtolower($s); }
}
if (!function_exists('mb_strlen')) {
    function mb_strlen(string $s): int { return strlen($s); }
}
$GLOBALS['nluflags'] = ['ai.enabled'=>false, 'ai.booking_intent_enabled'=>false, 'ai.public_vetti_enabled'=>false];
function config(string $name, mixed $default=null): mixed { return $GLOBALS['nluflags'][$name] ?? $default; }
$base = dirname(__DIR__);
foreach (['AiProviderInterface','AiProviderException','SchemaValidator','AiGateway','Providers/FakeAiProvider','DeterministicIntentRouter','PublicClinicFacts','BookingIntentService','PublicVettiService'] as $file) {
    require_once $base.'/app/Services/AI/'.$file.'.php';
}
use App\Services\AI\BookingIntentService;
use App\Services\AI\AiGateway;
use App\Services\AI\DeterministicIntentRouter;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\PublicVettiService;
use App\Services\AI\Providers\FakeAiProvider;
function expect(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
$fake = new FakeAiProvider();
$booking = new BookingIntentService(new AiGateway($fake));
foreach ([
    ['Gusto ko ipa-groom si Bornok bukas','grooming',false],
    ['Can you arrange a wash for Bornok tomorrow?','grooming',false],
    ['Book grooming and vaccination tomorrow','none',true],
    ['Book wash and vaccination tomorrow','none',true],
    ['Book my cat grooming because it is bleeding','none',false], // urgent/medical text must not preselect a service
] as [$message,$service,$ambig]) {
    $out = $booking->interpret($message);
    expect($out['service_hint']===$service && $out['service_ambiguous']===$ambig && $out['booking_created']===false,'Booking mismatch: '.json_encode($out));
}
expect($fake->calls === 0,'Gemini should not be called when disabled');
$facts = new class extends PublicClinicFacts {
    public function load(): array { return [
        'available'=>true,'name'=>'Demo Clinic','phone'=>'02-1234-5678','email'=>'demo@example.test',
        'address'=>'Sample St','weekday_appointment_window'=>'09:00–17:00',
        'weekend_appointment_window'=>null,'services'=>['Cat Grooming','Vaccination']
    ]; }
};
$public = new PublicVettiService(new AiGateway($fake),new DeterministicIntentRouter(),$facts);
foreach ([
    ['Paano magpa-appointment?','booking'],
    ['Anong serbisyo ninyo?','services'],
    ['Saan kayo located?','location'],
    ['Magkano po ang vaccination?','price'],
    ['Saan appointment ko?','private'],
    ['My cat is vomiting, what medicine?','private'],
] as [$message,$intent]) {
    $got=$public->reply($message);
    expect($got['intent']===$intent,"Public $message => ".json_encode($got));
}
expect($fake->calls===0,'Public FAQ should be rule-based, not call Gemini');
echo "PASS: PHP NLU smoke — Taglish booking, safe ambiguity, public FAQ + private-data boundary.\n";
