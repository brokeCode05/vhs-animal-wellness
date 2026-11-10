<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 ['english negation','subjective','Owner reports coughing and no vomiting.','Owner reports no coughing and vomiting.',false],
 ['filipino negation','subjective','Sabi ng may-ari inuubo ngunit walang pagsusuka.','Sabi ng may-ari walang ubo ngunit may pagsusuka.',false],
 ['taglish negation','subjective','Sabi ng owner umuubo pero walang suka.','Sabi ng owner walang ubo pero nagsusuka.',false],
 ['uncertainty','assessment','The veterinarian says irritation is possible but the cause is uncertain.','The veterinarian diagnosed respiratory irritation.',false],
 ['laterality','objective','On exam the left ear is red and the right ear appears normal.','On exam the right ear is red and the left ear appears normal.',false],
 ['attribution','subjective','The owner reports that the left ear looked red at home.','The veterinarian observed a red left ear on examination.',false],
 ['dose','plan','The veterinarian said give one tablet once daily for three days.','Give two tablets once daily for three days.',false],
 ['invented treatment','plan','The veterinarian advised a recheck in one week.','Start antibiotics and return in one week.',false],
 ['invented advice','plan','The veterinarian advised monitoring the cough.','Monitor the cough and give medicine if symptoms worsen.',false],
 ['unit','objective','The veterinarian recorded temperature as 39 degrees Celsius.','The veterinarian recorded temperature as 39 degrees Fahrenheit.',false],
 ['device reliability','objective','The thermometer showed 39 degrees Celsius but was broken, so the reading is unreliable.','Temperature was 39 degrees Celsius.',false],
 ['follow-up','plan','The veterinarian advised monitoring breathing and returning in one week.','Monitor breathing.',false],
 ['duration','subjective','The owner reports coughing for four days.','The owner reports coughing for two days.',false],
 ['historical versus current','subjective','The owner reports vomiting last week but none today.','The owner reports vomiting today.',false],
 ['eating speed versus appetite','subjective','The owner reports the dog is eating more slowly.','The owner reports decreased appetite.',false],
 ['frequency versus severity','subjective','The owner reports coughing mostly at night.','The owner reports coughing is worse at night.',false],
 ['valid english','subjective','Owner reports coughing at night and coughing in the morning.','Owner reports coughing at night and in the morning.',true],
 ['valid filipino','subjective','Ayon sa may-ari inuubo ang aso sa gabi at inuubo rin sa umaga.','Ayon sa may-ari inuubo ang aso sa gabi at umaga.',true],
 ['valid taglish','subjective','Sabi ng owner umuubo ang dog sa gabi at umuubo rin sa umaga.','Sabi ng owner umuubo ang dog sa gabi at umaga.',true],
];
foreach($cases as [$name,$section,$text,$claim,$expected]) {
 $source=['subjective'=>'Not provided.','objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.'];$source[$section]=$text;$draft=$source;$draft[$section]=$claim;
 $g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(20);
 $r=(new App\Services\AI\ScribeClaimAudit($g))->audit($source,$draft);
 echo json_encode(['case'=>$name,'expected'=>$expected?'accept':'reject','actual'=>($r['ok']??false)?'accept':'reject','code'=>$r['code']??null])."\n";
}
