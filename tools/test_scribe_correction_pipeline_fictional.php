<?php
// Fictional service integration probe: a fixed draft and live authorized reviewer.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
$long=in_array('long',$argv,true)||in_array('30k',$argv,true);$good=in_array('good',$argv,true);$reps=in_array('30k',$argv,true)?198:55;
$history='Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala.';
$source=$long?str_repeat('Fictional discussion about the animal daily routine and home environment. ',$reps).$history.str_repeat('Fictional discussion about the animal daily routine and home environment. ',$reps):$history;
$source.=' Alerto sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.';
$generator=new class($good) implements App\Services\AI\AiProviderInterface {
 public function __construct(private bool $good) {}
 public function generate(string $instructions,string $message,?array $schema=null):array {
  $payload=json_decode($message,true);$passages=$payload['passages'];$ids=array_column($passages,'id');
  $draft=['subjective'=>['text'=>$this->good?'Nagsusuka ng apat na araw.':'Nagsusuka ng tatlo hanggang apat na araw.','source_ids'=>$ids],
   'objective'=>['text'=>'Alerto sa pagsusuri.','source_ids'=>$ids],
   'assessment'=>['text'=>'Hindi alam ang sanhi.','source_ids'=>$ids],
   'plan'=>['text'=>'Walang planong napag-usapan.','source_ids'=>$ids]];
  return ['text'=>json_encode($draft,JSON_UNESCAPED_UNICODE),'usage'=>[]];
 }
};
if (in_array('live',$argv,true)) $generator=new App\Services\AI\Providers\GeminiProvider();
$draftGateway=new App\Services\AI\AiGateway($generator);$draftGateway->startScribeDeadline(90);
$reviewer=new App\Services\AI\AiGateway(new App\Services\AI\Providers\GroqProvider());$reviewer->startScribeDeadline(60);
$result=(new App\Services\AI\ScribeSinglePassDraft($draftGateway,$reviewer))->generate($source);
echo json_encode(['synthetic_length'=>mb_strlen($source),'input'=>'fictional','ok'=>$result['ok']??false,'warnings'=>$result['reviewWarnings']??[], 'review_count'=>count($result['reviewItems']??[]),'draft_subjective'=>$result['draft']['subjective']??null,'draft_attempts'=>$draftGateway->providerAttemptDiagnostics(),'attempts'=>$reviewer->providerAttemptDiagnostics()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
