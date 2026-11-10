<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 ['speed versus appetite','The owner reports the dog is eating more slowly.','The owner reports decreased appetite.',false],
 ['frequency versus severity','The owner reports coughing mostly at night.','The owner reports coughing is worse at night.',false],
 ['Filipino negation','Ayon sa may-ari inuubo ang aso ngunit walang pagsusuka.','Ayon sa may-ari walang ubo ngunit may pagsusuka.',false],
 ['Taglish timing','Sabi ng owner nagsuka ang dog last week pero wala ngayon.','Sabi ng owner nagsusuka ang dog ngayon.',false],
 ['unsupported specificity','Sabi ng owner nangangati ang dog simula kahapon, pero hindi siya sure kung may nakain itong bago.','Owner reports itching since yesterday and is uncertain whether the dog ate new food.',false],
 ['English equivalent','Owner reports coughing at night and coughing in the morning.','Owner reports coughing at night and in the morning.',true],
 ['Filipino equivalent','Ayon sa may-ari inuubo ang aso sa gabi at inuubo rin sa umaga.','Ayon sa may-ari inuubo ang aso sa gabi at umaga.',true],
 ['Taglish equivalent','Sabi ng owner umuubo ang dog sa gabi at umuubo rin sa umaga.','Sabi ng owner umuubo ang dog sa gabi at umaga.',true],
];
foreach($cases as [$name,$source,$candidate,$expected]){
 $s=['subjective'=>$source,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];$d=$s;$d['subjective']=$candidate;
 $g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(20);$r=(new App\Services\AI\ScribeMeaningReview($g))->review($s,$d);
 echo json_encode(['case'=>$name,'expected'=>$expected?'accept':'reject','actual'=>($r['ok']??false)?'accept':'reject','code'=>$r['code']??null])."\n";
}
