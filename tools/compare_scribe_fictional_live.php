<?php
// Explicitly invoked live comparison. Fictional inputs only; output contains metrics and categories, not provider bodies.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 ['english','The owner reports no vomiting. On examination the dog is alert. I suspect mild irritation. I recommend a recheck.', ['subjective'=>'no vomiting','objective'=>'alert','assessment'=>'suspect','plan'=>'recommend']],
 ['tagalog','Sabi ng may-ari hindi nagsusuka ang aso. Sa pagsusuri alerto ang aso. Posibleng iritasyon pero hindi sigurado. Bumalik pagkalipas ng isang linggo.', ['subjective'=>'hindi nagsusuka','objective'=>'alerto','assessment'=>'posibleng','plan'=>'bumalik']],
 ['taglish','Owner reports hindi kumakain pero walang vomiting. On examination alert ang aso. Possible irritation pero uncertain pa. I recommend follow up next week.', ['subjective'=>'walang vomiting','objective'=>'alert','assessment'=>'uncertain','plan'=>'follow up']],
 ['mixed','Owner reports scratching both ears. On examination redness was observed. My assessment is possible ear irritation and I recommend a recheck.', ['subjective'=>'scratching','objective'=>'redness','assessment'=>'possible','plan'=>'recommend']],
];
foreach (['gemini'=>App\Services\AI\Providers\GeminiProvider::class,'groq'=>App\Services\AI\Providers\GroqProvider::class] as $name=>$class) foreach($cases as [$id,$source,$expected]) {
 $service=new App\Services\AI\DoctorScribeService(new App\Services\AI\AiGateway(new $class)); $start=microtime(true);
 try {$r=$service->draft($source); $seconds=round(microtime(true)-$start,2); if(!($r['ok']??false)){echo "$name $id rejected code=".($r['code']??'unknown')." seconds=$seconds\n";continue;}
  $soap=$r['soap'];$sections=['subjective'=>$soap['subjective'],'objective'=>$soap['objective']['findings'],'assessment'=>$soap['assessment'],'plan'=>$soap['plan']];$missing=[];
  foreach($expected as $section=>$phrase) if(mb_stripos($sections[$section],$phrase)===false) $missing[]=$section;
  $wrong=[];foreach($expected as $section=>$phrase)foreach($sections as $dest=>$value)if($dest!==$section && mb_stripos($value,$phrase)!==false)$wrong[]=$phrase.'->'.$dest;
  echo "$name $id accepted seconds=$seconds missing=".($missing?implode(',',$missing):'none')." misplaced=".($wrong?implode(',',$wrong):'none')."\n";
 } catch(Throwable $e){echo "$name $id error ".get_class($e)."\n";}
}
