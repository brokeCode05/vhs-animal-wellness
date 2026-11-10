<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.scribe_semantic_summary_enabled'=>true,'ai.scribe_grounded_summary_enabled'=>true]);
$cases=[
'english'=>"The owner says the dog has been coughing for four days, mostly at night. The owner says there has been no vomiting and the dog is eating more slowly. On examination the veterinarian finds the dog alert with clear nasal discharge and comfortable breathing at rest. The veterinarian says the cause is uncertain and respiratory irritation is possible. The veterinarian advises monitoring breathing and returning in one week.",
'filipino'=>"Ayon sa may-ari, apat na araw nang inuubo ang aso lalo na sa gabi. Wala siyang napansing pagsusuka ngunit mas mabagal kumain ang aso. Sa pagsusuri, alerto ang aso, maayos ang paghinga habang nagpapahinga, at may kaunting malinaw na sipon. Ayon sa beterinaryo, hindi pa tiyak ang sanhi at posibleng may iritasyon sa paghinga. Pinayuhan ng beterinaryo na bantayan ang paghinga at bumalik pagkalipas ng isang linggo.",
 'taglish'=>"Sabi ng owner four days nang inuubo ang dog lalo na sa gabi. Wala raw vomiting pero mas mabagal siyang kumain. On examination alert ang dog, okay ang breathing at rest, at may kaunting clear nasal discharge. Sabi ng vet hindi pa sure ang cause at possible na may irritation sa respiratory tract. Sabi ng vet i-monitor ang breathing at bumalik after one week.",
];
foreach($cases as $name=>$transcript){
 $gateway=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$service=new App\Services\AI\DoctorScribeService($gateway);$start=microtime(true);$draft=$service->draft($transcript);
 if($draft['ok']??false) $draft=$service->summarizeDraft($draft);
 echo json_encode(['case'=>$name,'seconds'=>round(microtime(true)-$start,2),'result'=>$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";
}
