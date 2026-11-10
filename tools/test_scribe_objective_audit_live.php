<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$source=array_fill_keys(['subjective','objective','assessment','plan'],'Not provided.');$source['objective']=trim(str_repeat('The veterinarian observed that the fictional dog was alert during the examination. ',15));$draft=$source;$draft['objective']='The veterinarian observed that the dog was alert during the examination.';
$g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(30);$r=(new App\Services\AI\ScribeClaimAudit($g))->audit($source,$draft);
echo json_encode(['case'=>'fictional_objective_audit','source_bytes'=>strlen($source['objective']),'ok'=>$r['ok']??false,'code'=>$r['code']??null,'failure'=>$r['failure']??null,'provider_attempts'=>$g->providerAttemptDiagnostics()])."\n";
