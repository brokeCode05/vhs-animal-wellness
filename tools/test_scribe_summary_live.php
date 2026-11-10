<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.scribe_semantic_summary_enabled'=>true]);
$cases=[
 'English'=>'The owner reports coughing for three days. The owner reports coughing for three days. The dog is eating normally. On examination the dog is alert. The clinician observed redness in the ears. The assessment is possible ear irritation. I recommend a follow-up in one week.',
 'Taglish'=>'Sabi ng owner inuubo ang aso tatlong araw. Sabi ng owner inuubo ang aso tatlong araw. Kumakain naman siya ng maayos. On examination alert ang aso. The clinician observed redness in the ears. Possible irritation pero hindi pa sigurado. I recommend a follow-up in one week.'
];
foreach($cases as $label=>$text){$start=microtime(true);$svc=new App\Services\AI\DoctorScribeService(new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider()));$draft=$svc->draft($text);if(!($draft['ok']??false)){echo "$label source-failed ".($draft['code']??'unknown')."\n";continue;}$draft=$svc->summarizeDraft($draft);echo json_encode(['case'=>$label,'seconds'=>round(microtime(true)-$start,2),'summaryApplied'=>$draft['summaryApplied'],'soap'=>$draft['soap'],'sources'=>$draft['sourceSections'],'warnings'=>$draft['warnings']],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";}
