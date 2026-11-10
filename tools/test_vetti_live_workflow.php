<?php
// Explicit live provider test; fictional facts and SQLite memory only. No real records.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Services\AI\{AiProviderInterface,AiGateway,SemanticVettiService,UserVettiFacts,PublicClinicFacts};
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
$providerName=$argv[1]??'gemini';
if(!in_array($providerName,['gemini','groq'],true))exit(2);
config(['database.default'=>'sqlite','database.connections.sqlite.database'=>':memory:','database.connections.sqlite.url'=>null,'session.driver'=>'array','cache.default'=>'array','logging.default'=>'stderr',
'ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.semantic_privacy_cleared'=>true,'ai.paid_data_approved'=>true,'ai.groq_user_backup_enabled'=>false]);
DB::purge('sqlite');
if(DB::connection()->getDatabaseName()!==':memory:')throw new RuntimeException('Test database guard');
DB::statement('CREATE TABLE services (id INTEGER PRIMARY KEY, value TEXT, label TEXT, active INTEGER, deleted_at TEXT)');
foreach(['consultation'=>'Consultation','castration'=>'Castration','spay'=>'Spay'] as $v=>$l)DB::table('services')->insert(['value'=>$v,'label'=>$l,'active'=>1]);
$app->instance(UserVettiFacts::class,new class extends UserVettiFacts {
 public function pets(User $u):array{return [['id'=>7,'name'=>'FictionalLuna','species'=>'Cat','gender'=>'Male']];}
 public function ownsPet(User $u,int $id):bool{return $id===7;}
});
$app->instance(PublicClinicFacts::class,new class extends PublicClinicFacts {
 public function load():array{return ['available'=>true,'services'=>['Consultation','Castration','Spay'],'service_details'=>['Consultation'=>['category'=>'Wellness'],'Castration'=>['category'=>'Surgery'],'Spay'=>['category'=>'Surgery']],'booking_services'=>[['value'=>'consultation','label'=>'Consultation'],['value'=>'castration','label'=>'Castration'],['value'=>'spay','label'=>'Spay']]];}
});
$app->instance(App\Http\Controllers\AvailabilityController::class,new class extends App\Http\Controllers\AvailabilityController {
 public function index(Request $r){return response()->json(['success'=>true,'data'=>['slots'=>['09:00','11:30','13:00','18:00','19:00'],'duration_estimate'=>['allocated_minutes'=>60,'minutes'=>60,'source'=>'fictional_fixture']]]);}
});
$delegate=$providerName==='groq'?new App\Services\AI\Providers\GroqProvider:new App\Services\AI\Providers\GeminiProvider;
$spy=new class($delegate) implements AiProviderInterface {
 public int $calls=0;public function __construct(private AiProviderInterface $provider){}
 public function generate(string $i,string $m,?array $s=null):array {
  foreach(['FictionalLuna','Birdie','Persian','0.75 kg'] as $secret)if(str_contains($m,$secret))throw new RuntimeException('Privacy screening failed');
  $this->calls++;return $this->provider instanceof App\Services\AI\Providers\GeminiProvider ? $this->provider->generateWithTimeout($i,$m,$s,10.0,false,null,2048) : $this->provider->generateWithTimeout($i,$m,$s,10.0,2048);
 }
};
$app->instance(AiProviderInterface::class,$spy);$app->instance(AiGateway::class,new AiGateway($spy));$session=$app['session']->driver('array');$session->start();
$u=new User;$u->setRawAttributes(['id'=>999999,'role'=>'User']);$failures=[];
function turn($app,$session,$u,string $chat,string $q,array $extra=[]):array {
 $r=Request::create('/','POST',array_merge(['conversation_id'=>$chat],$extra));$r->setLaravelSession($session);$r->setUserResolver(fn()=>$u);
 $result=$app->make(SemanticVettiService::class)->interpret($r,$u,$q,$chat);
 echo json_encode(['chat'=>$chat,'question'=>$q,'result'=>$result,'diagnostics'=>$app->make(AiGateway::class)->semanticCallDiagnostics()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;return $result;
}
function check($ok,$label){global $failures;if(!$ok)$failures[]=$label;}
echo json_encode(['provider'=>$providerName,'facts'=>'fictional SQLite memory; clinic slots are fixtures, not live availability']).PHP_EOL;
turn($app,$session,$u,'live_booking_123','Can you book me an appointment tomorrow?');
$r=turn($app,$session,$u,'live_booking_123','I want to bookcastration for FictionalLuna');check(($r['preferred_date']??null)===now()->addDay()->toDateString() && ($r['service_value']??null)==='castration','retained date and service');
turn($app,$session,$u,'live_booking_123','Actually, spay.');
$r=turn($app,$session,$u,'live_booking_123','Right, castration; busy ako sa hapon.');check(($r['kind']??null)==='booking_proposal','restricted-hours proposal');
$r=turn($app,$session,$u,'live_booking_123','Do you have morning or evening times?');check(($r['kind']??null)==='booking_proposal','morning/evening continuation');
$r=turn($app,$session,$u,'live_booking_123','Start a new booking please');check(($r['kind']??null)==='information','explicit restart');
$r=turn($app,$session,$u,'live_booking_123','November 20, 2026, consultation for FictionalLuna');check(($r['preferred_date']??null)==='2026-11-20','date after restart');
foreach(['I want to add a male cat.','His name is Birdie.','He is Persian.','He is 3 months old and weighs 0.75 kg.'] as $idx=>$q)$r=turn($app,$session,$u,'live_pet_123',$q,['pet_form_open'=>$idx>0]);
$req=Request::create('/');$req->setLaravelSession($session);$draft=App\Services\AI\VettiPetDraftSession::read($req,999999,'live_pet_123');
check(($draft['name']??null)==='Birdie' && ($draft['breed']??null)==='Persian' && ($draft['species']??null)==='Cat' && ($draft['gender']??null)==='Male' && ($draft['age']??null)===3 && ($draft['ageUnit']??null)==='months' && ($draft['weightKg']??null)===0.75,'complete protected pet draft');
echo json_encode(['provider'=>$providerName,'calls'=>$spy->calls,'failures'=>$failures,'pet_created'=>false,'appointment_created'=>false]).PHP_EOL;exit($failures?1:0);
