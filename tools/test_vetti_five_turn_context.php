<?php
// Standalone, synthetic public data only. No database or provider key required.
if (!function_exists('mb_strtolower')) { function mb_strtolower($s) {return strtolower($s);} }
if (!function_exists('mb_strlen')) { function mb_strlen($s) {return strlen($s);} }
$root=dirname(__DIR__);
foreach(['VettiConversationContext','VettiServiceContext','AiProviderInterface','AiGateway','DeterministicIntentRouter','PublicClinicFacts','PublicVettiService'] as $file) {
    require_once $root.'/app/Services/AI/'.$file.'.php';
}
use App\Services\AI\{VettiConversationContext as C,AiGateway,AiProviderInterface,DeterministicIntentRouter,PublicClinicFacts,PublicVettiService};
$f = new class extends PublicClinicFacts {public function load(): array {return [
    'available'=>true,'name'=>'Fictional Clinic','address'=>'Synthetic Road','phone'=>null,'email'=>null,
    'weekday_appointment_window'=>'09:00–17:00','weekend_appointment_window'=>null,
    'services'=>['Dog Grooming','Cat Grooming','Consultation'],
];}};
$p = new class implements AiProviderInterface {
    public int $calls=0;
    public function generate(string $instructions,string $message,?array $schema=null):array{
        $this->calls++;throw new RuntimeException('Gemini must not receive any test turn');
    }
};
$svc = new PublicVettiService(new AiGateway($p),new DeterministicIntentRouter(),$f);
$cases = [
    ['What grooming services do you offer?','services','Dog Grooming'],
    ['How much is it?','price','Which listed service'],
    ['What time can I visit?','hours','appointment windows'],
    ['What about tomorrow?','hours','cannot confirm'],
    ['Can you explain that in Tagalog?','hours','Para sa oras'],
];
$prior = null;$checks=0;
foreach ($cases as [$q,$expected,$content]) {
    $out = $svc->reply($q,false,$prior);
    if ($out['intent'] !== $expected || !str_contains($out['text'],$content)) {
        throw new RuntimeException('Incorrect five-turn public response for '.$q.' => '.json_encode($out));
    }
    $prior = C::nextTopic($out['intent'],$prior);
    $checks++;
}
foreach ([['My dog cannot breathe','urgent'],['Show my dog records','private']] as [$q,$expected]) {
    $out = $svc->reply($q,false,$prior);
    if ($out['intent'] !== $expected) throw new RuntimeException('Safety boundary failed');
    $checks++;
}
if ($p->calls !== 0) throw new RuntimeException('Unexpected external provider invocation');
echo "PASS: $checks five-turn context / grounding / safety cases, zero provider calls\n";
