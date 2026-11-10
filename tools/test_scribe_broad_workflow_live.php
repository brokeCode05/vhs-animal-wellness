<?php
require __DIR__.'/../vendor/autoload.php'; $app=require __DIR__.'/../bootstrap/app.php'; $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 'weight_history'=>'At the previous consultation the dog weighed 12 kg; today the veterinarian measured 9 kg. The owner reports slower eating but no vomiting. The cause of the weight loss is uncertain. The veterinarian recommends a blood test and return when results are available.',
 'speaker_correction'=>'Owner: The right ear looked red at home yesterday. Veterinarian: On examination the right ear is normal and the left ear is red. The cause is not yet known. Return in one week.',
 'conflicting_reading'=>'The veterinarian measured a temperature of 39 C but the thermometer was broken and that reading is unreliable. The temperature must be measured again with a working thermometer. The animal is alert. The cause is uncertain.',
 'filipino_history'=>'Ayon sa may-ari nagsuka ang aso noong nakaraang linggo ngunit wala siyang nakitang pagsusuka ngayon. Sa pagsusuri alerto ang aso. Hindi pa tiyak ang sanhi. Pinayuhan na bumalik pagkaraan ng isang linggo.',
 'taglish_uncertainty'=>'sabi ng owner okay ang kain last week pero mas konti ngayon wala siyang napansing diarrhea sa pagsusuri alert ang aso sabi ng vet possible irritation pero hindi pa sure ang cause monitor ang pagkain at balik after one week'
];
foreach($cases as $name=>$text){$g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(45);$start=microtime(true);$inventory=(new App\Services\AI\ScribeChunkedInventory($g))->extract($text,800);$r=(new App\Services\AI\ScribeEvidenceSummary($g))->generate($inventory);echo json_encode(['case'=>$name,'seconds'=>round(microtime(true)-$start,2),'code'=>$r['code']??null,'draft'=>$r['draft']??null,'unlinked'=>$r['unlinkedSources']??null,'failure'=>$r['summaryFailure']??null],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;}
