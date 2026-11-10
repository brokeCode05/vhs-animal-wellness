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



$conversation='fictional_natural_booking_20261110';$output=[];$requestsSeen=0;$structuredReplies=[];$privateLeak=false;
Illuminate\Support\Facades\Event::listen(Illuminate\Http\Client\Events\RequestSending::class,function($event)use(&$requestsSeen,&$privateLeak){$requestsSeen++;$data=json_encode($event->request->data());if(str_contains($data,'Maple')||str_contains($data,'fictional-vetti-owner@example.test'))$privateLeak=true;});
Illuminate\Support\Facades\Event::listen(Illuminate\Http\Client\Events\ResponseReceived::class,function($event)use(&$structuredReplies){
 $data=$event->response->json();$text=$data['choices'][0]['message']['content']??$data['candidates'][0]['content']['parts'][0]['text']??null;
 if(is_string($text)){$v=json_decode($text,true);if(is_array($v) && isset($v['intent']))$structuredReplies[]=array_intersect_key($v,array_flip(['intent','pet_ref','service','date_expression','changed_fields','exact_time_expression']));}
});
foreach([['Book Maple consultation tomorrow at 3pm','15:00'],['Actually 4pm please','16:00']] as $i=>[$message,$expected]){
 $r=req($message,$conversation,$owner,$session);$r->merge(['active_pet_id'=>$pet->id,'pet_form_open'=>false]);$answer=app(SemanticVettiService::class)->interpret($r,$owner,$message,$conversation);
 $ok=($answer['kind']??'')==='booking_proposal' && ($answer['preferred_date']??'')==='2026-11-11' && ($answer['preferred_time']??'')===$expected && ($answer['service_value']??'')==='consultation' && ($answer['pet_id']??null)===$pet->id;
 $output[]=['passed'=>$ok,'answer'=>$answer,'provider_calls'=>$gateway->semanticCallDiagnostics()];echo json_encode(['turn'=>$i+1,'passed'=>$ok,'text'=>$answer['text']??''],JSON_UNESCAPED_UNICODE).PHP_EOL;if(!$ok)break;
}
$result=['fictional_only'=>true,'database'=>':memory:','appointments_before_and_after'=>[1,Appointment::count()],'pets_before_and_after'=>[2,Pet::count()],'provider_requests_observed'=>$requestsSeen,'owner_or_pet_identity_in_provider_payload'=>$privateLeak,'turns'=>$output,'structured_replies'=>$structuredReplies];
file_put_contents(base_path('docs/vetti-conversation/2026-11-10/fictional-booking-results.json'),json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
