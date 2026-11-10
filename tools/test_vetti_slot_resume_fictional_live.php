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


$conversation='fictional_slot_resume_20261110';$key='vetti_semantic_pending_'.hash('sha256',(string)$owner->getKey().'|'.$conversation);
$session->put('vetti_semantic_proposals',[$key=>['conversation_id'=>$conversation,'expires_at'=>time()+600,'pet_id'=>$pet->id,'service'=>'consultation','date'=>today()->addDay()->toDateString(),'time'=>'none','selected_time'=>null,'availability_constraint'=>'none','availability_clarified'=>false]]);
$r=req('Check available slots',$conversation,$owner,$session);$r->merge(['active_pet_id'=>$pet->id]);$answer=app(SemanticVettiService::class)->interpret($r,$owner,'Check available slots',$conversation);
$result=['fictional_only'=>true,'database'=>':memory:','passed'=>($answer['mode']??'')==='semantic' && ($answer['kind']??'')==='booking_proposal','answer'=>$answer,'appointments_before_and_after'=>[1,Appointment::count()],'pets_before_and_after'=>[2,Pet::count()],'provider_calls'=>$gateway->semanticCallDiagnostics()];
file_put_contents(base_path('docs/vetti-boundaries/2026-11-10/fictional-slot-resume-result.json'),json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));echo json_encode(['passed'=>$result['passed'],'kind'=>$answer['kind']??null,'text'=>$answer['text']??null],JSON_UNESCAPED_UNICODE).PHP_EOL;
