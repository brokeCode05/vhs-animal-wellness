<?php
// Holdout evaluation: all cases fictional; labels are developer-written and not clinically adjudicated.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
$cases=[
 ['onset_en','Owner: The limping began five days ago. Wait, I checked the video; it began eleven days ago.','Limping began eleven days ago.','Limping began five days ago.'],
 ['side_tl','Kanina sinabi kong kaliwang paa ang pilay. Ay hindi pala, kanan talaga ang pilay.','Pilay ang kanang paa.','Pilay ang kaliwang paa.'],
 ['negation_tl','Wala akong napansing dugo sa dumi. Sandali, may kaunting dugo pala akong nakita ngayong umaga.','May kaunting dugo sa dumi ngayong umaga.','Walang nakitang dugo sa dumi.'],
 ['weight_en','I wrote the current weight as 6.7 kg, but I read the scale again and it is 7.6 kg.','Current weight is 7.6 kg.','Current weight is between 6.7 and 7.6 kg.'],
 ['dose_en','At home I gave one tablet yesterday. Sorry, it was half a tablet yesterday.','Owner gave half a tablet yesterday.','Owner gave one tablet yesterday.'],
 ['test_tl','Nagawa na yata ang urine test. Ay hindi pa pala nagagawa ang urine test.','Hindi pa nagagawa ang urine test.','Nagagawa na ang urine test.'],
 ['timing_tl','Akala ko babalik kami bukas, pero sabi ninyo sa Biyernes pala kami dapat bumalik.','Napag-usapang bumalik sa Biyernes.','Napag-usapang bumalik bukas.'],
 ['symptom_en','I said she was vomiting, but I meant she was coughing; she has not vomited.','Owner reports coughing and no vomiting.','Owner reports vomiting.'],
 ['uncertain_en','I was sure the appetite changed yesterday. Actually, I cannot remember if it was yesterday or the day before.','Appetite change began yesterday or the day before; owner is unsure.','Appetite changed yesterday.'],
 ['identity_tl','Akala ko si nanay ang nakakita ng ubo, pero ako pala ang nakakita.','Nakita ng nagsasalita ang ubo.','Nakita ng nanay ang ubo.'],
];
$controls=[
 ['range_en','The owner reports intermittent coughing for three to five days.','Coughing for three to five days.'],
 ['visits_en','The patient weighed 12 kg at the last visit and 9 kg today.','Weight was 12 kg at the last visit and 9 kg today.'],
 ['uncertain_tl','Hindi ko maalala kung kahapon o noong isang araw nagsimula ang ubo.','Hindi tiyak kung kahapon o noong isang araw nagsimula ang ubo.'],
 ['no_correction_en','The owner says the dog has been eating normally and no medication was given.','Eating normally; no medication given.'],
];
$providerName=$argv[1]??'groq';$start=(int)($argv[2]??0);$count=(int)($argv[3]??100);if(!in_array($providerName,['groq','gemini'],true)) exit(2);
$items=[];foreach($cases as [$id,$source,$good,$bad]) {$items[]=[$id.'_bad',true,$source,$bad];$items[]=[$id.'_good',false,$source,$good];}foreach($controls as [$id,$source,$good])$items[]=[$id.'_control',false,$source,$good];
foreach(array_slice($items,$start,$count) as [$id,$expectedBad,$source,$text]) {
 $provider=$providerName==='gemini'?new App\Services\AI\Providers\GeminiProvider():new App\Services\AI\Providers\GroqProvider();$gateway=new App\Services\AI\AiGateway($provider);$gateway->startScribeDeadline(30);
 $result=(new App\Services\AI\ScribeCorrectionReview($gateway))->review([['id'=>1,'text'=>$source]],['subjective'=>$text,'objective'=>'Not provided.','assessment'=>'Not provided.','plan'=>'Not provided.']);
 $verdict=$result['verdict']??null;$flagged=in_array($verdict,['inconsistent','uncertain'],true);$attempts=$gateway->providerAttemptDiagnostics();
 echo json_encode(['id'=>$id,'expected_error'=>$expectedBad,'ok'=>$result['ok']??false,'verdict'=>$verdict,'flagged'=>$flagged,'matches_expectation'=>($result['ok']??false)?($flagged===$expectedBad):null,'attempts'=>$attempts],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
}
