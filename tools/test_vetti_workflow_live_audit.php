<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Services\AI\{AiGateway,AiProviderInterface,SemanticVettiService,UserVettiFacts,PublicClinicFacts,VettiPetDraftSession,SchemaValidator};
use App\Models\User;use Illuminate\Http\Request;use Illuminate\Support\Facades\{DB,Http};
config(['database.default'=>'sqlite','database.connections.sqlite.database'=>':memory:','database.connections.sqlite.url'=>null,'session.driver'=>'array','cache.default'=>'array','logging.default'=>'stderr']);DB::purge('sqlite');
if(DB::connection()->getDatabaseName()!==':memory:')throw new RuntimeException('Isolated database required');
DB::statement('CREATE TABLE services (id INTEGER PRIMARY KEY, value TEXT, label TEXT, active INTEGER, deleted_at TEXT)');DB::table('services')->insert(['value'=>'consultation','label'=>'Consultation','active'=>1]);
$app->instance(UserVettiFacts::class,new class extends UserVettiFacts {public function pets(User $u):array{return [['id'=>7,'name'=>'FictionalBornok','species'=>'Cat','gender'=>'Male']];}public function ownsPet(User $u,int $petId):bool{return $petId===7;}public function upcoming(User $u,?int $petId=null):array{throw new RuntimeException('Wrong appointment route');}});
$app->instance(PublicClinicFacts::class,new class extends PublicClinicFacts {public function load():array{return ['available'=>true,'services'=>['Consultation'],'service_details'=>['Consultation'=>['category'=>'Wellness']],'booking_services'=>[['value'=>'consultation','label'=>'Consultation']]];}});
$app->instance(App\Http\Controllers\AvailabilityController::class,new class extends App\Http\Controllers\AvailabilityController {public function index(Request $r){return response()->json(['success'=>true,'data'=>['slots'=>['09:00','11:30','13:00','18:00'],'duration_estimate'=>['allocated_minutes'=>60,'minutes'=>60,'source'=>'fixture']]]);}});
function schemaIssues(array $schema,$value,string $path='root'):array {
 if(SchemaValidator::matches($schema,$value))return [];$issues=[];
 if($value instanceof stdClass && ($schema['type']??null)==='object'){
  foreach($schema['required']??[] as $k)if(!property_exists($value,$k))$issues[]=$path.'.'.$k.':missing';
  foreach(get_object_vars($value) as $k=>$v){if(!isset($schema['properties'][$k])){$issues[]=$path.':unknown_property';continue;}$issues=array_merge($issues,schemaIssues($schema['properties'][$k],$v,$path.'.'.$k));}
 }elseif(is_array($value)&&($schema['type']??null)==='array'&&isset($schema['items'])){foreach($value as $v)$issues=array_merge($issues,schemaIssues($schema['items'],$v,$path.'[]'));}
 else { $neutral=in_array($value,['','none','unspecified','any','unknown','all','all_pets','context'],true)?($value===''?'empty':$value):($value===null?'null':'other');$issues[]=$path.(isset($schema['enum'])?':enum_or_type:'.$neutral:':type'); }
 return array_slice(array_values(array_unique($issues)),0,12);
}
$schema=null;$host='';
Http::globalRequestMiddleware(function($r)use(&$schema,&$host){$body=(string)$r->getBody();foreach(['FictionalBornok','Brody','brody'] as $private)if(str_contains($body,$private))throw new RuntimeException('Private value reached provider');$j=json_decode($body,true);$host=$r->getUri()->getHost();$found=$j['generationConfig']['responseJsonSchema']??$j['response_format']['json_schema']['schema']??null;if($found!==null)$schema=$found;elseif(($j['response_format']['type']??null)!=='json_object')$schema=null;return $r;});
Http::globalResponseMiddleware(function($r)use(&$schema,&$host){if($schema!==null){$j=json_decode((string)$r->getBody(),true);$text=$j['choices'][0]['message']['content']??$j['candidates'][0]['content']['parts'][0]['text']??null;if(is_string($text))echo json_encode(['provider_host'=>$host,'schema_issues'=>schemaIssues($schema,json_decode($text))]).PHP_EOL;}return $r;});
$app->instance(AiGateway::class,new AiGateway(in_array('--groq',$argv,true)?new App\Services\AI\Providers\GroqProvider:$app->make(AiProviderInterface::class)));$session=$app['session']->driver('array');$session->start();$u=new User;$u->setRawAttributes(['id'=>987654,'role'=>'User']);$chat='live_mixed_audit_123';$last=[];
$turns=[['i want to add a pet named brody',false],['he is a male bird',false],['cancel adding pet',true],['i want to book an appointment for FictionalBornok',false],['bukas sana kaso busy ako ng hapon do you have morning schedules?',false],['bukas ngani',false],['consultation',false]];
if(in_array('--booking-only',$argv,true)) {
 $pendingKey='vetti_semantic_pending_'.hash('sha256','987654|'.$chat);$session->put('vetti_semantic_proposals',[$pendingKey=>['conversation_id'=>$chat,'expires_at'=>time()+600,'pet_id'=>7,'service'=>'none','date'=>now()->addDay()->toDateString(),'time'=>'morning','selected_time'=>null,'availability_constraint'=>'none','availability_clarified'=>true,'schedule'=>['blocked'=>[[720,1080]],'allowed'=>[[0,720]],'unclear'=>false],'awaiting_answer'=>'service']]);
 $session->put('vetti_recent_topic_'.hash('sha256','987654|'.$chat),['topic'=>'booking_followup','pet_id'=>7,'expires_at'=>time()+1200]);$turns=[['consultation',false]];
}
$failures=[];
foreach($turns as $step=>[$q,$open]){
 $req=Request::create('/','POST',['pet_form_open'=>$open]);$req->setLaravelSession($session);$req->setUserResolver(fn()=>$u);
 $last=$app->make(SemanticVettiService::class)->interpret($req,$u,$q,$chat);
 $draft=VettiPetDraftSession::read($req,987654,$chat);
 $pendingKey='vetti_semantic_pending_'.hash('sha256','987654|'.$chat);$pending=$session->get('vetti_semantic_proposals',[])[$pendingKey] ?? [];
 if(!in_array('--booking-only',$argv,true)) {
  $passed=match($step) {
   0=>($draft['name'] ?? null)==='brody',
   1=>($draft['name'] ?? null)==='brody' && ($draft['species'] ?? null)==='Bird' && ($draft['gender'] ?? null)==='Male',
   2=>($last['kind'] ?? null)==='pet_add_cancelled' && ($last['draft_cleared'] ?? false) && $draft===[],
   3=>($last['proposal_pending'] ?? false) && ($pending['pet_id'] ?? null)===7 && ($pending['service'] ?? 'none')==='none' && $draft===[],
   4,5=>($last['proposal_pending'] ?? false) && ($pending['awaiting_answer'] ?? null)==='service' && ($pending['date'] ?? null)===now()->addDay()->toDateString() && ($pending['time'] ?? null)==='morning' && $draft===[],
   6=>($last['kind'] ?? null)==='booking_proposal' && ($last['pet_id'] ?? null)===7 && ($last['preferred_date'] ?? null)===now()->addDay()->toDateString() && ($last['time_preference'] ?? null)==='morning' && !($last['booking_created'] ?? true),
   default=>false,
  };
 } else $passed=($last['kind'] ?? null)==='booking_proposal' && ($last['pet_id'] ?? null)===7 && ($last['time_preference'] ?? null)==='morning' && !($last['booking_created'] ?? true);
 if(!$passed)$failures[]=$step;
 echo json_encode(['question'=>$q,'passed'=>$passed,'result'=>$last,'draft_fields'=>array_keys($draft),'diagnostics'=>$app->make(AiGateway::class)->semanticCallDiagnostics()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;flush();
 if(($last['mode'] ?? '')==='fallback') {echo json_encode(['stopped'=>'provider_failure','remaining_steps_not_run'=>count($turns)-$step-1]).PHP_EOL;break;}
}
echo json_encode(['final_booking_proposal'=>($last['kind']??null)==='booking_proposal','pet_created'=>false,'appointment_created'=>false,'facts'=>'fictional, availability is a fixture','failed_steps'=>$failures]).PHP_EOL;
exit($failures===[]?0:1);
