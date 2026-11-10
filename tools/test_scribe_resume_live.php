<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$part='The owner reports that the fictional dog has been coughing for several days and is still drinking water. The veterinarian observed that the dog was alert during the examination. The veterinarian said the cause was uncertain and advised a follow-up next week. ';
$text=str_repeat($part,16);$g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$service=new App\Services\AI\ScribeChunkedInventory($g);$g->startScribeDeadline(36);$first=$service->extract($text,800);$resumed=null;$simulatedFailure=false;
if (($first['ok']??false) && ($first['complete']??false)) { $first['chunks'][0]['status']='failed';unset($first['chunks'][0]['segments']);$first['complete']=false;$simulatedFailure=true; }
if (($first['ok']??false) && !($first['complete']??false)) {$g->startScribeDeadline(36);$resumed=$service->retryFailed($text,800,$first);}
$counts=static fn($r)=>isset($r['chunks'])?array_count_values(array_column($r['chunks'],'status')):[];
$kept=0;if ($resumed['ok']??false) foreach($first['chunks'] as $i=>$chunk) if($chunk['status']==='complete' && $chunk===$resumed['chunks'][$i]) $kept++;
$final=$resumed??$first;
echo json_encode(['characters'=>mb_strlen($text),'first_statuses'=>$counts($first),'simulated_failure'=>$simulatedFailure,'resume_attempted'=>$resumed!==null,'resume_statuses'=>$counts($resumed??[]),'completed_chunks_reused'=>$kept,'original_preserved'=>isset($final['chunks']) && implode('',array_column($final['chunks'],'text'))===$text,'failure_categories'=>array_values(array_filter(array_map(static fn($c)=>$c['failure']??null,$final['chunks']??[])))],JSON_UNESCAPED_UNICODE)."\n";
