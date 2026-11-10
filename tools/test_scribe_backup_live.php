<?php
// Fictional data only. Gemini failure is simulated; Groq is a real request.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.groq_scribe_backup_enabled'=>true]);
Illuminate\Support\Facades\Http::fake(['generativelanguage.googleapis.com/*'=>Illuminate\Support\Facades\Http::response([],503)]);
$cases=['english'=>'Owner reports no vomiting. On examination the dog is alert. I suspect mild irritation. I recommend a recheck.',
 'taglish'=>'Sabi ng owner hindi nagsusuka ang aso. On examination alert ang aso. Possible irritation pero hindi pa sigurado. I recommend a follow-up in one week.',
 'broken_thermometer'=>'Weight is 7 kg. Temperature is 39 C but the thermometer was broken.'];
foreach($cases as $name=>$text){$start=microtime(true);$svc=new App\Services\AI\DoctorScribeService(new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider()));$r=$svc->draft($text);$status=['case'=>$name,'seconds'=>round(microtime(true)-$start,2),'accepted'=>$r['ok']??false];if($r['ok']??false){$status['provider']=$r['providerMeta']['engine'];$status['soap']=$r['soap'];}else $status['code']=$r['code']??'unknown';echo json_encode($status,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";}
