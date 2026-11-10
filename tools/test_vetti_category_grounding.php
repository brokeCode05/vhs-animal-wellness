<?php
// Public-only tests. Uses fabricated clinic facts and no account, DB or external provider.
if (!function_exists('mb_strtolower')) {function mb_strtolower($v){return strtolower($v);}}
if (!function_exists('mb_strlen')) {function mb_strlen($v){return strlen($v);}}
if (!function_exists('mb_substr')) {function mb_substr($v,$a,$b){return substr($v,$a,$b);}}
$root=dirname(__DIR__);
foreach(['AiProviderInterface','AiGateway','DeterministicIntentRouter','VettiConversationContext','VettiServiceContext','PublicClinicFacts','PublicVettiService'] as $name) require_once "$root/app/Services/AI/$name.php";
use App\Services\AI\{PublicClinicFacts,PublicVettiService,AiProviderInterface,AiGateway,DeterministicIntentRouter};
$facts=new class extends PublicClinicFacts {
 public function load():array {return [
  'available'=>true,'name'=>'Fictional Clinic','address'=>'Demo Road','phone'=>'','email'=>'','weekday_appointment_window'=>null,'weekend_appointment_window'=>null,
  'services'=>['Dog Grooming','Cat Grooming','Boarding','Vaccination'],
  'services_by_category'=>['Pet Care'=>['Dog Grooming','Cat Grooming','Boarding'],'Preventive & Wellness'=>['Vaccination']],
  'service_details'=>['Cat Grooming'=>['price'=>'600.00','currency'=>'PHP','category'=>'Pet Care'],'Vaccination'=>['price'=>'1.00','currency'=>'PHP','category'=>'Preventive & Wellness']],
 ];}
};
$p=new class implements AiProviderInterface {public int $calls=0; public function generate(string $system,string $message,?array $schema=null):array {$this->calls++;throw new RuntimeException('Gemini must not receive category facts');}};
$bot=new PublicVettiService(new AiGateway($p), new DeterministicIntentRouter(), $facts);
$tests=[
 ['What services are under Pet Care?', 'services', 'Cat Grooming'],
 ['Ano mga serbisyo niyo under Pet Care?', 'services', 'Boarding'],
 ['What about Preventive & Wellness?', 'services', 'Vaccination'],
 ['How much is Cat Grooming?', 'price','₱600.00'],
 ['Magkano ang Cat Grooming?', 'price','₱600.00'],
 ['How much is Vaccination?', 'price','confirm'],
];
foreach($tests as [$q,$intent,$expect]){
 $r=$bot->reply($q,false);
 if($r['intent']!==$intent||stripos($r['text'],$expect)===false)throw new RuntimeException('Incorrect public response: '.json_encode([$q,$r]));
}
$r=$bot->reply('Do you offer cat grooming?',false);
$r=$bot->reply('How much is it?',false,'services','Cat Grooming');
if(!str_contains($r['text'],'₱600.00'))throw new RuntimeException('Missing verified service price');
if($p->calls!==0)throw new RuntimeException('Model called on catalog facts');
echo 'PASS: 7 category/pricing/verified-memory checks, no provider requests'.PHP_EOL;
