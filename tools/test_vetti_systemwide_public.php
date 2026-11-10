<?php
declare(strict_types=1);
// Synthetic standalone test for public grounding, priority and contextual localization.
if (!function_exists('mb_strtolower')) {function mb_strtolower(string $x): string {return strtolower($x);}}
if (!function_exists('mb_strlen')) {function mb_strlen(string $x): int {return strlen($x);}}
$GLOBALS['sys_config']=['ai.enabled'=>false,'ai.public_vetti_enabled'=>false];
function config(string $key,mixed $default=null):mixed {return $GLOBALS['sys_config'][$key] ?? $default;}
$root=dirname(__DIR__);
foreach(['AiProviderInterface','AiProviderException','SchemaValidator','AiGateway','DeterministicIntentRouter','VettiConversationContext','VettiServiceContext','PublicClinicFacts','PublicVettiService'] as $class) require_once "$root/app/Services/AI/$class.php";
use App\Services\AI\{AiGateway,AiProviderInterface,DeterministicIntentRouter,PublicClinicFacts,PublicVettiService,VettiConversationContext,VettiServiceContext};
class SProvider implements AiProviderInterface {public int $calls=0;public function generate(string $i,string $m,?array $s=null):array{$this->calls++;return ['text'=>'Synthetic answer'];}}
class SFacts extends PublicClinicFacts {public function load():array{return [
 'available'=>true,'name'=>'Synthetic Clinic','address'=>'Fictional Street','phone'=>null,'email'=>null,
 'weekday_appointment_window'=>'09:00–17:00','weekend_appointment_window'=>null,
 'services'=>['Boarding','Dog Grooming','Cat Grooming','Blood Test','Urinalysis'],
 'service_details'=>['Boarding'=>['price'=>'700.00','currency'=>'PHP']],
 'services_by_category'=>['Pet Care'=>['Boarding','Dog Grooming','Cat Grooming'],'Diagnostics'=>['Blood Test','Urinalysis']]
 ];}}
function must(bool $yes,string $reason):void{if(!$yes)throw new RuntimeException('FAIL: '.$reason);}
$spy=new SProvider();$svc=new PublicVettiService(new AiGateway($spy),new DeterministicIntentRouter(),new SFacts());
foreach(['My dog is having trouble breathing.','My cat has difficulty breathing','Hirap huminga ang pusa ko'] as $q){$a=$svc->reply($q);must($a['intent']==='urgent',"Emergency priority $q => {$a['intent']}");}
$a=$svc->reply('May boarding din ba kayo?');must($a['intent']==='services' && str_contains($a['text'],'Boarding'),'Taglish service question grounded');
$a=$svc->reply('How much does that cost?',false,'services','Boarding');must($a['intent']==='price' && str_contains($a['text'],'700.00'),'Followup fee grounded');
$a=$svc->reply('What about Diagnostics?');must($a['intent']==='services' && str_contains($a['text'],'Blood Test'),'Category filtered');
$category=VettiConversationContext::nextCategory('What about Diagnostics?','services',null,['Diagnostics'=>['Blood Test']]);
must($category==='Diagnostics','Category tracked');
$a=$svc->reply('Explain those services in Tagalog.',false,'services',null,[],$category);
must($a['intent']==='services' && str_contains($a['text'],'Sa kategoryang Diagnostics') && str_contains($a['text'],'Urinalysis'),'Tagalog category followup');
must(VettiConversationContext::nextCategory('My medical records','records',$category,['Diagnostics'=>[]])===null,'Private topic clears context');
must($spy->calls===0,'No free Gemini call for test interactions');
echo "PASS Public Vetti: emergency priority, Taglish catalog, category continuity, grounded price, provider privacy\n";
