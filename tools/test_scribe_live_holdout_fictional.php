<?php
// Fictional live full-service evaluation. No patient records are created or saved.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
$cases=[
 'ear_en'=>"She started scratching her left ear about five days ago. Actually, I checked my messages, and it was eight days ago. She is still eating and drinking normally. I have not noticed vomiting, and I did not give her any medicine. On examination, she is alert. The right ear looks normal. The left ear is red, with a small amount of brown discharge, and she pulls away when it is touched. Ear irritation is possible, but I cannot confirm the cause yet. We discussed examining a sample from the ear, but the sample has not been collected. Please monitor the scratching and contact the clinic if it gets worse. If there is no worsening, return in one week.",
 'stool_taglish'=>"Tatlong araw ko nang napapansing malambot ang dumi niya. Ay teka, chineck ko ang kalendaryo, limang araw na pala. Nakakain pa naman siya at wala akong nakitang dugo. Wala akong ibinigay na gamot. Alert siya sa examination at hindi matigas ang tiyan. Posibleng may iritasyon sa tiyan pero hindi pa natin alam ang sanhi. Napag-usapan ang blood test pero tinanggihan muna at wala pang nakuha na sample. Bantayan muna ang pagkain at pag-inom niya at bumalik sa Biyernes kung hindi siya bumuti.",
 'cough_en'=>"My dog has been coughing at night for four days. She eats and drinks normally and I have not seen vomiting. On examination she is alert and breathing comfortably at rest. The breathing rate was not measured. The cause of coughing is not known from this conversation. We did not discuss any medication, test, treatment, or follow-up.",
];
$filter=$argv[1]??'';
foreach($cases as $id=>$source){if($filter!=='' && $id!==$filter)continue;
 $primary=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GeminiProvider());$primary->startScribeDeadline(90);
 $review=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GroqProvider());$review->startScribeDeadline(90);
 $result=(new App\Services\AI\ScribeSinglePassDraft($primary,$review))->generate($source);
 echo json_encode(['id'=>$id,'input'=>'fictional','ok'=>$result['ok']??false,'code'=>$result['code']??null,'draft'=>$result['draft']??null,'warnings'=>$result['reviewWarnings']??[],'review_items'=>count($result['reviewItems']??[]),'draft_attempts'=>$primary->providerAttemptDiagnostics(),'review_attempts'=>$review->providerAttemptDiagnostics()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
}
