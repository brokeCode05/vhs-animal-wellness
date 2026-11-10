<?php
// Fully synthetic speech, no patient data. Exercises real provider services; it does not use the browser or consultation database.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.groq_scribe_backup_enabled'=>true]);
$file=new Illuminate\Http\UploadedFile(realpath(__DIR__.'/scribe-fictional-audio-test.wav'),'fictional.wav','audio/wav',null,true);
$start=microtime(true);$audio=(new App\Services\AI\GroqAudioTranscriber())->transcribe($file);
if(!($audio['ok']??false)){echo json_encode(['stage'=>'transcription','ok'=>false,'code'=>$audio['code']??'unknown'])."\n";exit(1);}
$transcript=$audio['text'];$t=mb_strtolower($transcript);$result=['transcription_ok'=>true,'beginning_present'=>str_contains($t,'beginning of fictional consultation test'),'ending_present'=>str_contains($t,'end of fictional consultation test'),'source_repetitions_expected'=>15,'no_vomiting_occurrences'=>substr_count($t,'not been vomiting')];
if (in_array('--simulate-gemini-outage',$argv,true)) {
    Illuminate\Support\Facades\Http::fake(['generativelanguage.googleapis.com/*'=>Illuminate\Support\Facades\Http::response([],503)]);
}
$gateway=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$svc=new App\Services\AI\DoctorScribeService($gateway);$draft=$svc->draft($transcript);
$result['draft_ok']=$draft['ok']??false;$result['seconds']=round(microtime(true)-$start,2);
if($draft['ok']??false){$soap=$draft['soap'];$result['provider']=$draft['providerMeta']['engine'];$result['subjective_preserves_negation']=str_contains(mb_strtolower($soap['subjective']),'not been vomiting');$result['objective_has_alert']=str_contains(mb_strtolower($soap['objective']['findings']),'alert');$result['plan_has_follow_up']=str_contains(mb_strtolower($soap['plan']),'follow');$result['assessment']=$soap['assessment'];}
else { $result['code']=$draft['code']??'unknown';$result['attempts']=$gateway->providerAttemptDiagnostics(); }
echo json_encode($result,JSON_UNESCAPED_UNICODE)."\n";
