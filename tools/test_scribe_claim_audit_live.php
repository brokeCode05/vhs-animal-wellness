<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$examples=[
 ['invented finding','objective','On examination the dog is alert.','On examination the dog is alert and dehydrated.'],
 ['wrong side','objective','On examination the left ear is red.','On examination the right ear is red.'],
 ['attribution changed','subjective','Owner reports ear redness.','Ear redness was observed on examination.'],
 ['valid shortening','subjective','Owner reports coughing at night and coughing in the morning.','Owner reports coughing at night and in the morning.'],
 ['negation moved','subjective','Owner reports coughing and no vomiting.','Owner reports no coughing and vomiting.'],
 ['tagalog negation','subjective','Sabi ng owner inuubo pero walang pagsusuka.','Sabi ng owner walang ubo pero may pagsusuka.'],
 ['omitted followup','plan','Monitor breathing and return in one week.','Monitor breathing.'],
 ['omitted uncertainty','assessment','Possible irritation; cause uncertain.','Irritation.'],
];
foreach($examples as [$name,$section,$src,$claim]){
 $source=['subjective'=>'Not provided.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];$source[$section]=$src;$draft=$source;$draft[$section]=$claim;
 $g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(20);$start=microtime(true);
 $r=(new App\Services\AI\ScribeClaimAudit($g))->audit($source,$draft);echo json_encode(['case'=>$name,'accepted'=>$r['ok']??false,'code'=>$r['code']??null,'seconds'=>round(microtime(true)-$start,2)])."\n";
}
