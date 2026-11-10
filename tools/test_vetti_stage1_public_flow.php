<?php
// Synthetic service catalog. Does not load the project database or Gemini key.
if (!function_exists('mb_strtolower')) { function mb_strtolower($s){return strtolower($s);} }
if (!function_exists('mb_strlen')) { function mb_strlen($s){return strlen($s);} }
$root=dirname(__DIR__);
foreach(['AiProviderInterface','AiGateway','DeterministicIntentRouter','VettiConversationContext','VettiServiceContext','PublicClinicFacts','PublicVettiService'] as $file) require_once "$root/app/Services/AI/$file.php";
use App\Services\AI\{PublicClinicFacts,PublicVettiService,AiGateway,AiProviderInterface,DeterministicIntentRouter,VettiConversationContext,VettiServiceContext};
$catalog=['Dog Grooming','Cat Grooming','Consultation'];
$facts = new class extends PublicClinicFacts {
  public array $names=['Dog Grooming','Cat Grooming','Consultation'];
  public function load():array { return ['available'=>true,'name'=>'Fictional Clinic','phone'=>null,'email'=>null,'address'=>'Fictional Street', 'weekday_appointment_window'=>null,'weekend_appointment_window'=>null,'services'=>$this->names]; }
};
$provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $instructions,string $message,?array $schema=null):array {$this->calls++;throw new RuntimeException('Gemini was invoked');}};
$bot=new PublicVettiService(new AiGateway($provider),new DeterministicIntentRouter(),$facts);
$topic=null;$service=null;$checks=0;
$turns=[
 ['By the way, do you offer cat grooming?','services','Cat Grooming','Cat Grooming'],
 ['How much does that cost?','price','Cat Grooming','Cat Grooming'],
 ['What about dog grooming?','services','Dog Grooming','Dog Grooming'],
 ['How much is it?','price','Dog Grooming','Dog Grooming'],
 ['What about dog grooming and cat grooming?','service_ambiguous','Which one',null],
 ['How much is it?','price','Which listed service',null],
 ['Do you offer cat grooming?','services','Cat Grooming','Cat Grooming'],
 ['Where are you located?','location','Fictional Street',null],
];
foreach($turns as [$q,$intent,$needle,$expectedSelected]) {
 $a=$bot->reply($q,false,$topic,$service);
 if($a['intent'] !== $intent || !str_contains($a['text'],$needle))throw new RuntimeException("Incorrect response to $q: ".json_encode($a));
 $service=VettiServiceContext::next($q,$a['intent'],$service,$facts->names);
 $topic=VettiConversationContext::nextTopic($a['intent'],$topic);
 if($service !== $expectedSelected)throw new RuntimeException("Unexpected service for $q: ".var_export($service,true));
 $checks++;
}
// Simulate service deactivation; never continue to quote an old catalog item.
$facts->names=['Dog Grooming','Consultation'];
$a=$bot->reply('How much is it?',false,'services','Cat Grooming');
if(str_contains($a['text'],'For Cat Grooming'))throw new RuntimeException('Inactive service leaked');$checks++;
foreach([['My pet records','private'],['My dog cannot breathe','urgent'],['Can you prescribe medicine?','medical']] as [$q,$expected]){
 $a=$bot->reply($q,false,'services','Dog Grooming');if($a['intent']!==$expected)throw new RuntimeException("Safety bypass $q");$checks++;
}
if($provider->calls!==0)throw new RuntimeException('Unexpected Gemini call');$checks++;
echo "PASS: $checks Stage 1 public multi-turn, switching, grounding and safety checks; zero provider calls\n";
