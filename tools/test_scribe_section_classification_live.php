<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 'taglish'=>"Bumaba ang timbang mula 11 kg dati hanggang 8 kg ngayon. Normal ang heart rate at temperature pero binabantayan ang appetite. Posibleng may problema sa tiyan dahil malambot ang dumi. I suggest a blood test and return when the results are available.",
 'english'=>"The cat weighed 6 kg at the last visit and now weighs 5 kg. The cause of the weight loss is uncertain; intestinal illness is possible. Please return when the blood test results are available.",
 'filipino'=>"Noong huling pagbisita ang timbang ay 10 kg at ngayon ay 8 kg. Hindi pa tiyak ang sanhi pero maaaring may iritasyon dahil malambot ang dumi. Magpatingin muli pagkatapos makuha ang resulta ng pagsusuri."
];
foreach($cases as $name=>$source){$svc=new App\Services\AI\DoctorScribeService(new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider()));$r=$svc->draft($source);echo json_encode(['case'=>$name,'ok'=>$r['ok']??false,'code'=>$r['code']??null,'soap'=>$r['soap']??null,'warnings'=>$r['warnings']??[]],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;}
