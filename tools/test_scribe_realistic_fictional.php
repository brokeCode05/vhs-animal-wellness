<?php
// No patient names, identifiers, audio, or clinical records; fictional text only.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.scribe_semantic_summary_enabled'=>true,'ai.groq_scribe_backup_enabled'=>true]);
$text='The owner reports the dog has been coughing for three days. The owner reports coughing is worse at night. The owner says the dog is eating normally and has not vomited. On examination the dog is alert. On examination mild nasal discharge is observed. I suspect respiratory irritation but the cause is uncertain. I recommend monitoring breathing and returning in one week.';
foreach(['gemini','groq_backup'] as $case){
 if($case==='groq_backup') Illuminate\Support\Facades\Http::fake(['generativelanguage.googleapis.com/*'=>Illuminate\Support\Facades\Http::response([],503)]);
 $start=microtime(true);$service=new App\Services\AI\DoctorScribeService(new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider()));$r=$service->draft($text);
 if(!($r['ok']??false)){echo json_encode(['case'=>$case,'accepted'=>false,'code'=>$r['code']??'unknown','seconds'=>round(microtime(true)-$start,2)])."\n";continue;}
 $r=$service->summarizeDraft($r);echo json_encode(['case'=>$case,'accepted'=>true,'provider'=>$r['providerMeta']['engine'],'summaryApplied'=>$r['summaryApplied'],'method'=>$r['summaryMethod']??'source','seconds'=>round(microtime(true)-$start,2),'soap'=>$r['soap'],'sources'=>$r['sourceSections'],'warnings'=>$r['warnings']],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";
}
