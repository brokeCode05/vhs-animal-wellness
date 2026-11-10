<?php
// Standalone, fictional public clinic facts; no database, real patient or provider access.
if (!function_exists('mb_strtolower')) {function mb_strtolower($s){return strtolower($s);} }
if (!function_exists('mb_strlen')) {function mb_strlen($s){return strlen($s);} }
$root=dirname(__DIR__);
foreach(['AiProviderInterface','AiGateway','DeterministicIntentRouter','VettiConversationContext','VettiServiceContext','PublicClinicFacts','PublicVettiService'] as $file) require_once "$root/app/Services/AI/$file.php";
use App\Services\AI\{PublicClinicFacts,PublicVettiService,AiGateway,AiProviderInterface,DeterministicIntentRouter,VettiConversationContext as T,VettiServiceContext as S};
$facts=new class extends PublicClinicFacts {
    public array $catalog = ['Dog Grooming', 'Cat Grooming', 'Vaccination'];
    public function load():array {return ['available'=>true,'name'=>'Fictional Clinic','phone'=>null,'email'=>null,'address'=>'Fictional Road','weekday_appointment_window'=>null,'weekend_appointment_window'=>null,'services'=>$this->catalog];}
};
$provider=new class implements AiProviderInterface {public int $calls=0;public function generate(string $system,string $message,?array $schema=null):array {$this->calls++; throw new Exception('Should not send public selection to Gemini');}};
$bot=new PublicVettiService(new AiGateway($provider),new DeterministicIntentRouter(),$facts);
$topic=null;$service=null;$choices=[];$n=0;
$turn=function(string $q,string $intent,string $needle,?string $expectedService,array $expectedChoices) use(&$topic,&$service,&$choices,&$n,$bot,$facts) {
    $res=$bot->reply($q,false,$topic,$service,$choices);
    if($res['intent'] !== $intent || !str_contains($res['text'],$needle)) throw new RuntimeException('Unexpected reply to '.$q.': '.json_encode($res));
    $newService=S::next($q,$res['intent'],$service,$facts->catalog,$choices);
    $newChoices=S::nextChoices($q,$res['intent'],$choices,$facts->catalog);
    $newTopic=T::nextTopic($res['intent'],$topic);
    if($newService!==$expectedService || $newChoices!==$expectedChoices)throw new RuntimeException('Unexpected state for '.$q.': '.json_encode([$newService,$newChoices]));
    $topic=$newTopic;$service=$newService;$choices=$newChoices;$n++;
};
$turn('Do you offer cat grooming?', 'services', 'Cat Grooming', 'Cat Grooming', []);
$turn('What about cat grooming and dog grooming?', 'service_ambiguous', 'Which one', null, ['Cat Grooming','Dog Grooming']);
$turn('How much is it?', 'service_ambiguous', 'Cat Grooming or Dog Grooming', null, ['Cat Grooming','Dog Grooming']);
$turn('the second one', 'service_choice', 'Dog Grooming', 'Dog Grooming', []);
$turn('How much is it?', 'price', 'Dog Grooming', 'Dog Grooming', []);
$turn('What about dog grooming and cat grooming?', 'service_ambiguous', 'Which one', null, ['Dog Grooming','Cat Grooming']);
$turn('Cat Grooming', 'service_choice', 'Cat Grooming', 'Cat Grooming', []);
$turn('What about dog grooming and cat grooming?', 'service_ambiguous', 'Which one', null, ['Dog Grooming','Cat Grooming']);
$turn('the first one', 'service_choice', 'Dog Grooming', 'Dog Grooming', []);
$turn('What about cat grooming and dog grooming?', 'service_ambiguous', 'Which one', null, ['Cat Grooming','Dog Grooming']);
$turn('Where are you located?', 'location', 'Fictional Road', null, []);
$turn('How much is it?', 'price', 'Please check', null, []);
$turn('What about cat grooming and dog grooming?', 'service_ambiguous', 'Which one', null, ['Cat Grooming','Dog Grooming']);
$turn('Show my pet records', 'private', 'sign in', null, []);
// New conversation with same browser session must not reuse the old candidates.
$topic=null;$service=null;$choices=[];
$turn('How much is it?', 'price', 'Please check', null, []);
// Dropped/inactive catalog item cannot remain eligible for ordinal selection.
$choices=['Cat Grooming','Dog Grooming'];
$facts->catalog=['Dog Grooming','Vaccination'];
if(S::validChoices($choices,$facts->catalog)!==[] || S::choose('the second one',$choices,$facts->catalog)!==null)throw new RuntimeException('Deleted service selected');$n++;
if(S::choose('book the second one',['Dog Grooming','Vaccination'],$facts->catalog)!==null)throw new RuntimeException('Booking bypass');$n++;
if(S::choose('my dog has an emergency',['Dog Grooming','Vaccination'],$facts->catalog)!==null)throw new RuntimeException('Privacy bypass');$n++;
if($provider->calls!==0)throw new RuntimeException('Provider was called');$n++;
echo "PASS: $n Stage 1 ambiguity memory, order, private-topic reset, deactivation and no-provider checks\n";
