<?php
/** Opt-in bounded live model test. All records/contacts are fictional in SQLite memory. */
if(($argv[1]??'')!=='--fictional-live')throw new RuntimeException('Explicit fictional-live flag required.');
require dirname(__DIR__).'/vendor/autoload.php';$app=require dirname(__DIR__).'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\{User,Pet,Service,DoctorProfile,Appointment};
use App\Services\AI\{SemanticVettiService,PublicVettiService,PublicClinicFacts,VettiConversationSession,AiGateway};
use Illuminate\Support\Facades\{DB,Artisan};
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
config(['database.default'=>'sqlite','database.connections.sqlite.database'=>':memory:','database.connections.sqlite.url'=>null,'mail.default'=>'array','cache.default'=>'array','session.driver'=>'array','queue.default'=>'sync','ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.paid_data_approved'=>true,'ai.semantic_privacy_cleared'=>true,'ai.public_vetti_enabled'=>true,'ai.public_conversation_enabled'=>true]);
DB::purge('sqlite');if(DB::connection()->getDatabaseName()!==':memory:')throw new RuntimeException('Memory test database required.');
Artisan::call('migrate',['--force'=>true]);Carbon::setTestNow(Carbon::parse('2026-11-10 18:24:00','Asia/Manila'));
$owner=User::factory()->create(['role'=>'User','email'=>'fictional-vetti-owner@example.test']);
$docUser=User::factory()->create(['role'=>'Doctor','email'=>'fictional-vetti-doctor@example.test']);$doc=DoctorProfile::forceCreate(['user_id'=>$docUser->id,'display_name'=>'Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
$pet=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Maple','species'=>'Dog','gender'=>'Female']);$cat=Pet::forceCreate(['owner_id'=>$owner->id,'name'=>'Pippin','species'=>'Cat','gender'=>'Male']);
$services=[];foreach([['consultation','Consultation',null],['dog_grooming','Dog Grooming',500],['cat_grooming','Cat Grooming',450]] as [$value,$label,$price])$services[$value]=Service::forceCreate(['value'=>$value,'label'=>$label,'category'=>'Pet Care','price'=>100,'currency'=>'PHP','active'=>true,'public_pricing_type'=>$price===null?'contact':'single','public_price_min'=>$price]);
$settings=App\Support\AppointmentWorkflow::settings();$hours=[];foreach(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as $day)$hours[$day]=['status'=>'open','open'=>'09:00','close'=>'22:00'];$settings->forceFill(['weekday_first'=>'09:00','weekday_last'=>'21:00','weekend_first'=>'09:00','weekend_last'=>'21:00','slot_interval_minutes'=>60,'operating_hours'=>$hours,'clinic_name'=>'Fictional VHS Clinic','clinic_address'=>'42 Fictional Lane','clinic_phone'=>null,'clinic_email'=>null])->save();
Appointment::forceCreate(['reference_no'=>'FICTIONAL-ONLY-HOLD','user_id'=>$owner->id,'pet_id'=>$pet->id,'service_id'=>$services['consultation']->id,'assigned_vet_id'=>$doc->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>today(),'appointment_time'=>'19:00:00','status'=>'confirmed','created_via'=>'admin','is_test'=>true]);
$gateway=app(AiGateway::class);$app->instance(AiGateway::class,$gateway);
$session=new Illuminate\Session\Store('fictional-vetti',new Illuminate\Session\ArraySessionHandler(120));$session->start();$output=[];$stop=false;
function req(string $message,string $conversation,?User $owner,$session):Request{$r=Request::create('/api/ai/semantic-vetti','POST',['message'=>$message,'conversation_id'=>$conversation]);$r->setLaravelSession($session);$r->setUserResolver(fn()=>$owner);app()->instance('request',$r);return $r;}
$events=[];Illuminate\Support\Facades\Log::listen(function($event)use(&$events){if(in_array($event->message,['vetti.semantic.execution','vetti.public.execution'],true))$events[]=$event->context;});

$userCases=[
 ['Who is Vetti and what can you do?',$pet->id,'identity'],
 ['Show my upcoming appointments',$pet->id,'selected_nonempty'],
 ['Show my upcoming appointments',$cat->id,'selected_empty'],
 ['Show all my upcoming appointments',$cat->id,'all_pets'],
 ['Do you have documents for customer Rowan and his pet named Cloud?',$cat->id,'private'],
 ["Kon'nichiwa, genkidesuka",$cat->id,'language'],
];
foreach($userCases as $i=>[$message,$active,$expected]){
 // Reset diagnostic metadata only; preflight refusals may make no gateway call.
 $gateway->startSemanticDeadline(24);$gateway->clearSemanticDeadline();
 $r=req($message,'fictional_boundary_user_20261110',$owner,$session);$r->merge(['active_pet_id'=>$active]);$t=microtime(true);$answer=app(SemanticVettiService::class)->interpret($r,$owner,$message,$r->input('conversation_id'));
 $ok=($answer['mode']??'')==='semantic';
 if($expected==='selected_nonempty')$ok=$ok && ($answer['listing_pet_id']??null)===$pet->id && count($answer['appointments']??[])===1;
 if($expected==='selected_empty')$ok=$ok && ($answer['listing_pet_id']??null)===$cat->id && ($answer['appointments']??null)===[] && str_contains($answer['text'],'No upcoming appointments');
 if($expected==='all_pets')$ok=$ok && ($answer['listing_scope']??null)==='all_pets' && count($answer['appointments']??[])===1;
 if($expected==='private')$ok=$ok && str_contains(mb_strtolower($answer['text']??''),'privacy');
 if($expected==='language')$ok=$ok && str_contains($answer['text']??'','English, Filipino, or Taglish') && !str_contains($answer['text'],'unavailable');
 if($expected==='identity')$ok=$ok && str_contains($answer['text']??'','Vetti');
 $output[]=['scope'=>'User','turn'=>$i+1,'expected'=>$expected,'passed'=>$ok,'message'=>$message,'answer'=>$answer,'milliseconds'=>(int)round((microtime(true)-$t)*1000),'provider_calls'=>$gateway->semanticCallDiagnostics()];echo json_encode(['scope'=>'User','turn'=>$i+1,'passed'=>$ok,'text'=>$answer['text']??'','listing_scope'=>$answer['listing_scope']??null],JSON_UNESCAPED_UNICODE).PHP_EOL;
 if(!$ok){$stop=true;break;}
}
if(!$stop)foreach([['Who is Vetti and what can you do?','identity'],['Can you help me cook adobo?','unsupported'],['こんにちは、元気ですか','unsupported_language'],['What services do you offer?','services']] as $i=>[$message,$expected]){
 // Reset diagnostic metadata only; preflight refusals may make no gateway call.
 $gateway->startSemanticDeadline(24);$gateway->clearSemanticDeadline();
 $r=req($message,'fictional_boundary_public_20261110',null,$session);$t=microtime(true);$answer=app(App\Http\Controllers\AI\PublicVettiController::class)->reply($r,app(PublicVettiService::class),app(PublicClinicFacts::class))->getData(true)['data'];
 $ok=($answer['source']??'')!=='fallback';if(in_array($expected,['unsupported','unsupported_language'],true))$ok=$ok && ($answer['intent']??'')===$expected;
 if($expected==='identity')$ok=$ok && str_contains($answer['text']??'','Vetti');if($expected==='services')$ok=$ok && str_contains($answer['text']??'','Consultation');
 $output[]=['scope'=>'Public','turn'=>$i+1,'expected'=>$expected,'passed'=>$ok,'message'=>$message,'answer'=>$answer,'milliseconds'=>(int)round((microtime(true)-$t)*1000),'provider_calls'=>$gateway->semanticCallDiagnostics()];echo json_encode(['scope'=>'Public','turn'=>$i+1,'passed'=>$ok,'text'=>$answer['text']??''],JSON_UNESCAPED_UNICODE).PHP_EOL;if(!$ok)break;
}
$out=base_path('docs/vetti-boundaries/2026-11-10');if(!is_dir($out))mkdir($out,0700,true);file_put_contents($out.'/fictional-live-results.json',json_encode(['fictional_only'=>true,'database'=>':memory:','appointments_before_and_after'=>[1,Appointment::count()],'pets_before_and_after'=>[2,Pet::count()],'turns'=>$output],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
