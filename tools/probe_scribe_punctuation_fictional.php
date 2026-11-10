<?php
// Bounded opt-in punctuation diagnostics. All cases are fictional; no portal state is changed.
require __DIR__.'/../vendor/autoload.php';$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 'mixed'=>"Napansin ko po na medyo pilay siya sa kaliwang paa sa likod. Akala ko kahapon lang nagsimula, pero pag-check ko ng video tatlong araw na pala. Nakakakain at umiinom pa naman siya, mas mabagal lang siyang kumain ngayon. Hindi ko siya nakitang nahulog o nasaktan, pero wala ako sa bahay buong hapon. Wala akong binigay na gamot.\n\nSa examination, alert siya. May banayad na pamamaga sa kaliwang bukung-bukong; mukhang normal yung kanang paa sa likod. Hindi natin nasukat yung temperatura.\n\nPosibleng injury sa soft tissue, pero hindi pa sigurado ang sanhi. Hindi natin masasabi sa usapan lang kung may bali.\n\nNapag-usapan ang X-ray, pero gusto muna ninyong pag-isipan; hindi pa ito nagagawa. Wala tayong niresetang gamot ngayon. Bantayan kung paano siya maglakad. Tawag sa clinic kung lumala, at kung hindi lumala, balik sa susunod na Martes.",
 'english'=>'the dog has been scratching the left ear for eight days no vomiting was noticed and no medicine was given the veterinarian saw redness and some brown discharge the cause is uncertain the sample was discussed but not collected monitor scratching and return next week if it does not worsen',
];
$id=$argv[1]??'';$effort=$argv[2]??'';
if(!isset($cases[$id]) || !in_array($effort,['medium','low'],true)){fwrite(STDERR,"Use: php tools/probe_scribe_punctuation_fictional.php <mixed|english> <medium|low>\n");exit(2);}
foreach(['enabled','clinical_enabled','clinical_clearance','paid_data_approved','groq_scribe_backup_enabled'] as $key) if(!config('ai.'.$key)){fwrite(STDERR,"Required AI approval not enabled; no request sent.\n");exit(3);}
$provider=new class($effort) implements App\Services\AI\AiProviderInterface {
 public array $attempts=[];
 public function __construct(private string $effort) {}
 public function generate(string $instructions,string $message,?array $schema=null):array {
  $key=trim((string)config('ai.groq_api_key',''));$model=trim((string)config('ai.groq_model',''));
  if($key==='' || !in_array($model,['openai/gpt-oss-20b','openai/gpt-oss-120b'],true)) throw new App\Services\AI\AiProviderException('configuration');
  $payload=['model'=>$model,'temperature'=>0.2,'max_completion_tokens'=>2048,'reasoning_effort'=>$this->effort,
   'messages'=>[['role'=>'system','content'=>$instructions],['role'=>'user','content'=>$message]]];
  try{$r=Illuminate\Support\Facades\Http::withToken($key)->acceptJson()->asJson()->connectTimeout(5)->timeout(14)->post('https://api.groq.com/openai/v1/chat/completions',$payload);}
  catch(Throwable){throw new App\Services\AI\AiProviderException('transport');}
  $content=$r->json('choices.0.message.content');$reason=$r->json('choices.0.finish_reason');$usage=$r->json('usage');
  $this->attempts[]=['http_status'=>$r->status(),'finish_reason'=>in_array($reason,['stop','length','content_filter'],true)?$reason:null,
   'content_present'=>is_string($content)&&trim($content)!=='','completion_tokens'=>is_array($usage)?($usage['completion_tokens']??null):null,
   'reasoning_tokens'=>is_array($usage)?($usage['completion_tokens_details']['reasoning_tokens']??null):null,
   'prompt_tokens'=>is_array($usage)?($usage['prompt_tokens']??null):null,'total_tokens'=>is_array($usage)?($usage['total_tokens']??null):null];
  if(!$r->successful())throw new App\Services\AI\AiProviderException($r->status()===429?'rate_limit':'http_error',$r->status());
  if(!is_string($content)||trim($content)==='')throw new App\Services\AI\AiProviderException('empty_response');
  return ['text'=>$content,'usage'=>is_array($usage)?['prompt_tokens'=>$usage['prompt_tokens']??null,'output_tokens'=>$usage['completion_tokens']??null,'total_tokens'=>$usage['total_tokens']??null]:[]];
 }
};
$result=(new App\Services\AI\DoctorScribeService(new App\Services\AI\AiGateway($provider)))->suggestPunctuation($cases[$id]);
echo json_encode(['case'=>$id,'effort'=>$effort,'fictional'=>true,'ok'=>$result['ok'],'code'=>$result['code']??null,'suggestion'=>$result['suggestion']??null,'attempts'=>$provider->attempts],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),PHP_EOL;
