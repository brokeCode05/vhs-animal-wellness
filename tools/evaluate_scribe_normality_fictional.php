<?php
// Explicit, bounded live comparison. All cases are fictional; no portal state is changed.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$cases=[
 'presence_en_bad'=>['The dog is still eating and drinking but eats more slowly than before. On examination the dog is alert. The cause is unknown. No plan was discussed.', ['subjective'=>'Eating and drinking normally, although eating more slowly.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.'], true],
 'presence_en_good'=>['The dog is still eating and drinking but eats more slowly than before. On examination the dog is alert. The cause is unknown. No plan was discussed.', ['subjective'=>'Still eating and drinking; eating more slowly.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.'], false],
 'amount_tl_bad'=>['Umiinom pa siya ng tubig pero hindi ko alam kung normal ang dami. Alerto sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.', ['subjective'=>'Normal water intake.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.'], true],
 'amount_tl_good'=>['Umiinom pa siya ng tubig pero hindi ko alam kung normal ang dami. Alerto sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.', ['subjective'=>'Still drinking water; whether the amount is normal is unknown.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.'], false],
 'limp_tl_bad'=>['Napansin ko po na medyo pilay siya sa kaliwang paa sa likod. Akala ko kahapon lang nagsimula, pero pag-check ko ng video tatlong araw na pala. Nakakakain at umiinom pa naman siya, mas mabagal lang siyang kumain ngayon. Hindi ko siya nakitang nahulog o nasaktan, pero wala ako sa bahay buong hapon. Wala akong binigay na gamot. Sa examination, alert siya. May banayad na pamamaga sa kaliwang bukung-bukong; mukhang normal yung kanang paa sa likod. Hindi natin nasukat yung temperatura. Posibleng injury sa soft tissue, pero hindi pa sigurado ang sanhi. Hindi natin masasabi sa usapan lang kung may bali. Napag-usapan ang X-ray, pero gusto muna ninyong pag-isipan; hindi pa ito nagagawa. Wala tayong niresetang gamot ngayon. Bantayan kung paano siya maglakad. Tawag sa clinic kung lumala, at kung hindi lumala, balik sa susunod na Martes.', ['subjective'=>'Owner noted mild swelling left hind foot; owner thought onset yesterday; video review shows 3 days; eating and drinking; eating slower; no observed fall or injury; owner absent all afternoon; no medication given.','objective'=>'Alert; mild swelling left hind paw; right hind paw normal; temperature not measured.','assessment'=>'Possible soft tissue injury; cause uncertain; fracture cannot be determined by discussion alone.','plan'=>'Discussed X-ray; want to think first; not yet possible; no medication given; monitor gait; call clinic if worsens; if not worsens, return next Tuesday.'], true],
 'limp_tl_good'=>['Napansin ko po na medyo pilay siya sa kaliwang paa sa likod. Akala ko kahapon lang nagsimula, pero pag-check ko ng video tatlong araw na pala. Nakakakain at umiinom pa naman siya, mas mabagal lang siyang kumain ngayon. Hindi ko siya nakitang nahulog o nasaktan, pero wala ako sa bahay buong hapon. Wala akong binigay na gamot. Sa examination, alert siya. May banayad na pamamaga sa kaliwang bukung-bukong; mukhang normal yung kanang paa sa likod. Hindi natin nasukat yung temperatura. Posibleng injury sa soft tissue, pero hindi pa sigurado ang sanhi. Hindi natin masasabi sa usapan lang kung may bali. Napag-usapan ang X-ray, pero gusto muna ninyong pag-isipan; hindi pa ito nagagawa. Wala tayong niresetang gamot ngayon. Bantayan kung paano siya maglakad. Tawag sa clinic kung lumala, at kung hindi lumala, balik sa susunod na Martes.', ['subjective'=>'Left hind-leg limp for three days; still eating and drinking, eating more slowly. No fall or injury observed; speaker was away all afternoon. No medication given at home.','objective'=>'Alert; mild swelling at the left ankle. Right hind leg appears normal. Temperature not measured.','assessment'=>'Possible soft tissue injury; cause uncertain. Fracture cannot be determined from discussion alone.','plan'=>'X-ray discussed; decision pending, not yet performed. No medication prescribed. Monitor walking; call clinic if worse. If not worse, return next Tuesday.'], false],
];
if (($argv[1]??'')==='list') {foreach(array_keys($cases) as $id) echo $id.PHP_EOL;exit;}
$id=$argv[1]??'';$variant=$argv[2]??'';$providerName=$argv[3]??'gemini';
if (!isset($cases[$id]) || !in_array($variant,['baseline','candidate','ordered','focused'],true) || !in_array($providerName,['gemini','groq'],true)) {fwrite(STDERR,"Use: php tools/evaluate_scribe_normality_fictional.php list | <case> <baseline|candidate|ordered|focused> <gemini|groq>\n");exit(2);}
foreach(['enabled','clinical_enabled','clinical_clearance','paid_data_approved'] as $key) if(!config('ai.'.$key)) {fwrite(STDERR,"Required AI approval not enabled; no request sent.\n");exit(3);}
config(['ai.scribe_single_pass_enabled'=>true]);
$provider=new class($variant,$providerName) implements App\Services\AI\AiProviderInterface {
 public array $keyOrder=[];public array $fictionalComparison=[];
 public function __construct(private string $variant,private string $name) {}
 public function generate(string $instructions,string $message,?array $schema=null):array {
  $old='Check that observations remain attributed to the correct observer, animal and context; an unobserved symptom is not necessarily absent.';
  $new='Keep observations attributed to the correct observer, animal and context. Unobserved is not absent; a behavior occurring does not imply it is normal.';
  if($this->variant!=='focused' && substr_count($instructions,$new)!==1)throw new RuntimeException('Expected review instruction was not found.');
  if ($this->variant==='baseline') $instructions=str_replace($new,$old,$instructions);
  if(strlen($instructions)>4000)throw new RuntimeException('Review instruction exceeds gateway limit.');
  if ($this->variant==='ordered') {
   if ($this->name!=='gemini') throw new RuntimeException('Ordered-schema comparison uses Gemini only.');
   $schema['propertyOrdering']=['source_sections','draft_sections','source_assessment','assessment_comparison','source_plan','plan_comparison','source_corrections','draft_comparison','subjective','objective','assessment','plan','assessment_support','correction_support','measurement_support','advice_support'];
  }
  $out=$this->name==='gemini' ? (new App\Services\AI\Providers\GeminiProvider())->generateWithTimeout($instructions,$message,$schema,15,false,null,2048) : (new App\Services\AI\Providers\GroqProvider())->generateWithTimeout($instructions,$message,$schema,12,4096);
  $json=json_decode($out['text'],true);$this->keyOrder=is_array($json) ? array_keys($json) : [];
  if(is_array($json)) foreach(['source_sections','draft_sections','source_plan','plan_comparison','meaning_comparison'] as $key) $this->fictionalComparison[$key]=$json[$key]??null;
  return $out;
 }
};
[$source,$draft,$errorExpected]=$cases[$id];
$planned=(new App\Services\AI\ScribeSourcePassages())->plan($source);
if (!($planned['ok']??false)) {fwrite(STDERR,"Could not build source passages.\n");exit(4);}
$passages=array_map(static fn($chunk)=>['id'=>$chunk['id'],'text'=>$chunk['text']],$planned['chunks']);
$gateway=new App\Services\AI\AiGateway($provider);$gateway->startScribeDeadline(30);
if ($variant==='focused') {
 $verdict=['type'=>'string','enum'=>['consistent','inconsistent','uncertain']];
 $schema=['type'=>'object','properties'=>[
  'source_corrections'=>['type'=>'string'],'draft_comparison'=>['type'=>'string'],'verdict'=>$verdict,
  'meaning_comparison'=>['type'=>'string'],'meaning_verdict'=>$verdict,
 ],'required'=>['source_corrections','draft_comparison','verdict','meaning_comparison','meaning_verdict'],'additionalProperties'=>false];
 $instructions='Review this veterinary SOAP draft against the entire transcript; do not give medical advice. First identify source self-corrections and compare their final values with the draft. In verdict use inconsistent for a changed or missing correction, uncertain if unclear, otherwise consistent. Different visits and genuine ranges are not corrections. Separately, in meaning_comparison identify any clinically meaningful draft omissions, unsupported additions, changed facts or facts placed in the wrong SOAP section. Compare who observed each detail, body location, uncertainty, negation, timing, and the status and conditions of actions. A planned, discussed, declined, performed, not performed, or impossible action are different. Do not infer missing details. Use meaning_verdict inconsistent when a relevant difference is found, uncertain when unclear, otherwise consistent. Return JSON.';
 $payload=json_encode(['passages'=>$passages,'draft'=>$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
 $raw=$gateway->structured('scribe',$payload,$instructions,'clinical',$schema,true,true);
 $result=['ok'=>$raw['ok']??false,'focused'=>$raw['data']??null];
} else $result=(new App\Services\AI\ScribeSinglePassReview($gateway))->review($passages,$draft);
$labels=$result['sections']??[];if($variant==='focused'){$labels['meaning_support']=$result['focused']['meaning_verdict']??null;$labels['correction_focused']=$result['focused']['verdict']??null;}$labels['assessment_support']=$result['assessmentSupport']??null;$labels['correction_support']=$result['correctionSupport']??null;$labels['measurement_support']=$result['measurementSupport']??null;$labels['advice_support']=$result['adviceSupport']??null;
$flagged=(bool)array_filter($labels,static fn($v)=>in_array($v,['changed','inconsistent','uncertain'],true));
echo json_encode(['case'=>$id,'variant'=>$variant,'provider'=>$providerName,'fictional'=>true,'ok'=>$result['ok']??false,'expected_error'=>$errorExpected,'subjective_flagged'=>in_array($labels['subjective']??null,['changed','uncertain'],true),'any_flagged'=>$flagged,'labels'=>$labels,'json_key_order'=>$provider->keyOrder,'fictional_comparison'=>$provider->fictionalComparison,'attempts'=>$gateway->providerAttemptDiagnostics(),'limitation'=>'Single-case model judgment; no clinical reliability claim.'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
