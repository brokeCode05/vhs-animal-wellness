<?php
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 'english'=>['subjective'=>'The owner says the dog has been coughing for four days, mostly at night. The owner reports no vomiting and says the dog is eating more slowly.','objective'=>'On examination the dog is alert, breathing comfortably at rest, with a little clear nasal discharge.','assessment'=>'The veterinarian says the cause is uncertain and respiratory irritation is possible.','plan'=>'The veterinarian advised monitoring breathing and returning in one week.'],
 'filipino'=>['subjective'=>'Ayon sa may-ari apat na araw nang inuubo ang aso lalo na sa gabi. Wala siyang napansing pagsusuka ngunit mas mabagal kumain ang aso.','objective'=>'Sa pagsusuri alerto ang aso, maayos ang paghinga habang nagpapahinga, at may kaunting malinaw na sipon.','assessment'=>'Ayon sa beterinaryo hindi pa tiyak ang sanhi at posibleng may iritasyon sa paghinga.','plan'=>'Pinayuhan ng beterinaryo na bantayan ang paghinga at bumalik pagkalipas ng isang linggo.'],
 'taglish'=>['subjective'=>'Sabi ng owner four days nang inuubo ang dog lalo na sa gabi. Wala raw vomiting pero mas mabagal siyang kumain.','objective'=>'On examination alert ang dog, okay ang breathing at rest, at may kaunting clear nasal discharge.','assessment'=>'Sabi ng vet hindi pa sure ang cause at possible na may irritation sa respiratory tract.','plan'=>'Sabi ng vet i-monitor ang breathing at bumalik after one week.'],
];
foreach($cases as $name=>$source) {
 $gateway=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$gateway->startScribeDeadline(45);
 $start=microtime(true);$result=(new App\Services\AI\ScribeGroundedSummary($gateway))->generate($source);
 echo json_encode(['case'=>$name,'seconds'=>round(microtime(true)-$start,2),'result'=>$result],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";
}
