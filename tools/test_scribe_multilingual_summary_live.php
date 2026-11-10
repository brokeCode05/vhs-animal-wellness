<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();config(['ai.scribe_semantic_summary_enabled'=>true]);
$cases=[
 'english'=>['Owner reports coughing at night and owner reports coughing in the morning.','On examination the dog is alert.','Possible irritation but the cause is uncertain.','Monitor breathing and return in one week.'],
 'filipino'=>['Ayon sa may-ari inuubo ang aso sa gabi at ayon sa may-ari inuubo ang aso sa umaga.','Sa pagsusuri alerto ang aso.','Posibleng iritasyon ngunit hindi pa tiyak ang sanhi.','Bantayan ang paghinga at bumalik sa isang linggo.'],
 'taglish'=>['Sabi ng owner inuubo ang aso sa gabi at sabi ng owner inuubo ang aso sa umaga.','On examination alert ang aso.','Possible irritation pero hindi pa sigurado.','Monitor breathing at balik after one week.'],
 'negation'=>['Owner reports coughing and owner reports no vomiting.','On examination the dog is alert.','Not provided.','Monitor breathing.'],
];
foreach($cases as $name=>[$subjective,$objective,$assessment,$plan]) {
 $gateway=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$gateway->startScribeDeadline(30);
 $svc=new App\Services\AI\DoctorScribeService($gateway);$draft=['ok'=>true,'soap'=>['subjective'=>$subjective,'objective'=>['findings'=>$objective,'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>$assessment,'plan'=>$plan],'warnings'=>[],'saved'=>false];
 $start=microtime(true);$r=$svc->summarizeDraft($draft);echo json_encode(['case'=>$name,'seconds'=>round(microtime(true)-$start,2),'applied'=>$r['summaryApplied'],'method'=>$r['summaryMethod']??'source','soap'=>$r['soap'],'sources'=>$r['sourceSections']],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";
}
