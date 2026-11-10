<?php
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 'english'=>"My dog has been coughing for four days. Has there been vomiting? No, none. The dog eats more slowly but still drinks water. On examination the dog is alert and breathing comfortably at rest. The cause is uncertain; irritation is possible. Monitor breathing and return in one week.",
 'filipino'=>"Apat na araw nang inuubo ang aso. May pagsusuka ba? Wala po akong napansing pagsusuka. Mas mabagal lang siyang kumain. Sa pagsusuri alerto ang aso at maayos ang paghinga. Hindi pa tiyak ang sanhi. Bantayan ang paghinga at bumalik sa isang linggo.",
 'taglish'=>"four days nang inuubo yung dog lalo na sa gabi wala naman akong napansing suka pero mas mabagal siya kumain okay ang breathing niya pag nagpapahinga hindi pa sure ang cause sabi ng vet monitor muna at bumalik after one week",
];
foreach($cases as $name=>$text){$g=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$g->startScribeDeadline(25);$r=(new App\Services\AI\ScribeFactInventory($g))->extract($text);echo json_encode(['case'=>$name,'result'=>$r],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";}
