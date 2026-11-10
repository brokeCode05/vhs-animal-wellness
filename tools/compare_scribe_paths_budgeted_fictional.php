<?php
// Explicitly opt-in comparison of the two portal paths using fictional inputs only.
// Does not persist transcripts or alter portal settings. Provider limits/costs apply.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$cases=[
 'urinary_taglish'=>"Dinala si Rocky ngayon kasi kanina pa subok nang subok umihi, pero patak-patak lang at may kasamang dugo. Alert naman siya, pero masakit at matigas ang puson niya nung hinalapa natin, na pwedeng senyales ng bara sa iihiyan (urinary blockage). Rekomendasyon natin ngayon is mag-X-ray at Ultrasound agad para makita kung may stones o barat sa bladder niya, at kumuha ng Urinalysis (sample ng ihi) para ma-check kung may bacteria o crystals. Kailangan din natin siyang i-admit para makabitan ng catheter para makaihi siya agad at mabigyan ng IV pain meds. Kapag hindi agad na-decompress ang bladder niya, pwedeng maapektuhan ang kidneys kaya kailangan maagapan ngayon din.",
 'ear_taglish'=>"Mga three days ko na siyang napapansing nagkakamot ng left ear niya. Ay, wait, chineck ko yung video sa phone ko—six days na pala. Mas napapansin ko siya sa gabi. Wala naman akong nakitang dugo, and wala rin akong binigay na gamot sa bahay. Yung appetite niya, gusto ko pang bantayan. Hindi ko pa sure kung may nagbago. Okay, alert naman siya ngayon. Yung right ear niya looks normal. Sa left ear, medyo mapula and may konting brown na discharge. Napapansin ko rin na umaatras siya kapag hinahawakan natin. Seven kilos siya ngayon; eight kilos siya noong last visit. Hindi natin nasukat yung temperature niya today. Possible na may irritation sa tenga, pero hindi pa natin alam kung ano talaga yung cause. Napag-usapan natin yung pagkuha ng sample para masuri, pero wala pa tayong nakukuhang sample. For now, bantayan muna natin kung mas madalas siyang magkamot. Kung lumala, tawag kayo sa clinic. Kung okay naman siya, balik kayo next week para macheck natin ulit.",
 'filipino_vomiting'=>"Kahapon nagsimula ang pagsusuka niya. Dalawang beses ko siyang nakitang sumuka at wala akong nakitang dugo. Umiinom pa rin siya, pero kaunti ang kinain niya. Wala akong ibinigay na gamot. Sa pagsusuri, alerto siya at malambot ang tiyan; hindi nakuha ang temperatura. Posibleng may iritasyon sa tiyan, pero hindi pa malinaw ang dahilan. Napag-usapan ang pagsusuri ng dugo pero tinanggihan muna; wala pang nakuha na dugo. Bantayan ang pagkain at pag-inom, at bumalik bukas kung hindi siya bumuti.",
 'taglish_weight'=>"yung aso mo na si luna naobserve natin yung sudden loss of weight nya. last consultation he was 12kg but now 9kg na lang. his heart rate and temperature is normal naman but it's just yung appetite niya ang tinitignan natin. now ang nakikita natin possible reason is he has a diarrhea since ang poop niya is basa and not normal looking. i suggest you to have a cbc to verify kang din if there is implications pa sa loob niya so we can determine anong actions natin. i suggest balik kayo right after makakuha ng CBC para maagapan natin agad si Luna",
 'en_no_plan'=>"My dog has been coughing at night for four days. She eats and drinks normally and I have not seen vomiting. On examination she is alert and breathing comfortably at rest. The breathing rate was not measured. The cause of coughing is not known from this conversation. We did not discuss any medication, test, treatment, or follow-up.",
 'en_ear'=>"She started scratching her left ear about five days ago. Actually, I checked my messages, and it was eight days ago. She is still eating and drinking normally. I have not noticed vomiting, and I did not give her any medicine. On examination, she is alert. The right ear looks normal. The left ear is red, with a small amount of brown discharge, and she pulls away when it is touched. Ear irritation is possible, but I cannot confirm the cause yet. We discussed examining a sample from the ear, but the sample has not been collected. Please monitor the scratching and contact the clinic if it gets worse. If there is no worsening, return in one week.",
 'taglish_stool'=>"Tatlong araw ko nang napapansing malambot ang dumi niya. Ay teka, chineck ko ang kalendaryo, limang araw na pala. Nakakain pa naman siya at wala akong nakitang dugo. Wala akong ibinigay na gamot. Alert siya sa examination at hindi matigas ang tiyan. Posibleng may iritasyon sa tiyan pero hindi pa natin alam ang sanhi. Napag-usapan ang blood test pero tinanggihan muna at wala pang nakuha na sample. Bantayan muna ang pagkain at pag-inom niya at bumalik sa Biyernes kung hindi siya bumuti.",
 'medium_mixed'=>"Mga isang linggo ko nang napapansin na umuubo siya sa gabi. Ay teka, tiningnan ko ulit ang video sa phone, nagsimula pala ito labindalawang araw na ang nakalipas. Hindi araw-araw ang ubo, pero mas madalas nitong nakaraang dalawang gabi. Pagkatapos niyang umubo ay kumakalma rin siya. Hindi ko napansing nahihirapan siyang huminga habang nagpapahinga, pero wala ako sa bahay nang buong araw. Kumakain pa rin siya, mas mabagal lang kaysa dati. Umiinom siya ng tubig at wala akong napansing pagsusuka o dugo. Wala akong ibinigay na gamot sa bahay. May isa pa kaming aso pero hindi ko alam kung inuubo rin iyon. 
Sa pagsusuri alert siya at komportable ang paghinga habang nagpapahinga. May kaunting malinaw na sipon sa ilong; wala akong nakitang discharge sa mata. Ang timbang noong huling bisita ay siyam na kilo at ngayon ay walong kilo. Hindi namin nasukat ang respiratory rate at hindi nakuha ang temperature. Ang thermometer ay hindi gumagana kaya wala tayong maaasahang reading. 
Maaaring may iritasyon sa respiratory tract, pero hindi pa malinaw ang sanhi at hindi pa ako makapagbibigay ng tiyak na diagnosis. Hindi natin masasabi mula sa usapan lamang kung may infection. Napag-usapan ang blood test, pero hindi muna pumayag ang may-ari; wala pang sample at wala pang resulta. Hindi rin tayo nagreseta ng anumang gamot ngayon. 
Bantayan muna kung gaano kadalas ang pag-ubo at kung may pagbabago sa paghinga, pagkain, o pag-inom. Kung biglang manghina o mahirapang huminga, tumawag agad sa clinic. Kung hindi lumala ang kondisyon, bumalik sa susunod na Biyernes para ma-check ulit. Hindi natin napag-usapan kung gagawa ng X-ray.",
];
if (($argv[1]??'')==='list') {foreach($cases as $id=>$s) echo $id.' '.mb_strlen($s)." chars\n";exit(0);}
if (($argv[1]??'')!=='run' || !isset($cases[$argv[2]??'']) || !in_array($argv[3]??'', ['old','new','draft','english_draft','source_draft','groq_draft','compact_draft','source_schema','english_schema'],true)) {
 fwrite(STDERR,"Use: php tools/compare_scribe_paths_budgeted_fictional.php list | run <case> <old|new|draft|english_draft|source_draft|groq_draft|compact_draft|source_schema|english_schema>\n");exit(2);
}
// Do not bypass any existing clinical or privacy approvals.
foreach(['enabled','clinical_enabled','clinical_clearance','paid_data_approved'] as $key) if(!config('ai.'.$key)) {fwrite(STDERR,"Required AI approval not enabled; no request sent.\n");exit(3);}
$case=$argv[2];$path=$argv[3];$source=$cases[$case];
// In-process switch only: never writes .env or changes the portal.
config(['ai.scribe_single_pass_enabled'=>true]);
$events=[];$diagnostic=function(array $event) use (&$events) {
 $names=['ScribeFactInventory','ScribeGroundedSummary','ScribeClaimAudit','ScribeMeaningReview','ScribeUncertainPlacement','ScribeSinglePassDraft','ScribeSinglePassReview','ScribeCorrectionReview'];
 foreach(debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS,12) as $frame) { $class=$frame['class']??'';$name=substr($class,strrpos($class,chr(92))+1);if(in_array($name,$names,true)){$event['stage']=$name;break;} }
 $events[]=$event;
};
$provider=$path==='groq_draft' ? new App\Services\AI\Providers\GroqProvider() : new App\Services\AI\Providers\GeminiProvider();
if (in_array($path,['source_schema','english_schema'],true)) {
 $provider=new class implements App\Services\AI\AiProviderInterface {
  public function generate(string $instructions,string $message,?array $schema=null):array {
   $descriptions=[
    'subjective'=>'Concise clinical chart phrases for history and symptoms. Preserve the reporter and any limits of observation.',
    'objective'=>'Concise examination findings and measurements. Preserve their subject, timing, normal findings and qualifiers.',
    'assessment'=>'Concise stated interpretations only. Preserve uncertainty and distinguish possible from confirmed.',
    'plan'=>'Concise documented actions and follow-up only. Preserve status, timing, conditions and stated risks.'
   ];
   foreach($descriptions as $name=>$description) {
    $schema['properties'][$name]['description']=$description.' Write naturally in the requested language or language mix; summarize rather than copy dialogue.';
   }
   return (new App\Services\AI\Providers\GeminiProvider())->generateWithTimeout($instructions,$message,$schema,15,false,null,2048);
  }
 };
}
if ($path==='compact_draft') {
 $provider=new class implements App\Services\AI\AiProviderInterface {
  public function generate(string $instructions,string $message,?array $schema=null):array {
   $instructions.=' For this fictional style evaluation, make a substantially shorter chart note, not a lightly edited copy of the transcript. A flexible aim is roughly half to two-thirds of the original wording when conversational phrasing is present. This is not a hard limit: retain every clinically relevant detail, qualifier, negation, uncertainty, correction, timing, attribution and action status, even if the note needs more space. Use compact clinical phrases rather than full conversational sentences.';
   return (new App\Services\AI\Providers\GeminiProvider())->generateWithTimeout($instructions,$message,$schema,15,false,null,2048);
  }
 };
}
$gateway=new App\Services\AI\AiGateway($provider,$diagnostic);$gateway->startScribeDeadline(90);
$start=microtime(true);
if($path==='old') {
 $inventory=(new App\Services\AI\ScribeChunkedInventory($gateway))->extract($source,800);
 $result=(new App\Services\AI\ScribeEvidenceSummary($gateway))->generate($inventory);
 $out=['ok'=>(bool)(($result['ok']??false)&&($result['complete']??false)&&is_array($result['draft']??null)), 'draft'=>$result['draft']??null,'code'=>$result['summaryCause']??$result['summaryFailure']??$result['code']??null,'warning_count'=>isset($result['warning'])?1:0,'review_count'=>count($result['attention']??[])];
} else {
 // Draft-only evaluation makes the usual review calls local stubs. It is NOT a
 // safety or end-to-end review test; it isolates provider drafting token use.
 $reviewer=null;
 if (in_array($path,['draft','english_draft','source_draft','groq_draft','compact_draft','source_schema','english_schema'],true)) {
  $stub=new class implements App\Services\AI\AiProviderInterface {
   public function generate(string $instructions,string $message,?array $schema=null):array {
    $make=function(array $property) use (&$make) {
     if (($property['type']??null)==='object') { $out=[];foreach($property['properties']??[] as $key=>$value) $out[$key]=$make($value);return $out; }
     if (($property['type']??null)==='array') return [];
     if (isset($property['enum'])) return in_array('consistent',$property['enum'],true) ? 'consistent' : $property['enum'][0];
     return '';
    };
    return ['text'=>json_encode($make($schema)),'usage'=>[]];
   }
  };
  $reviewer=new App\Services\AI\AiGateway($stub);
 }
 $draftLanguage=in_array($path,['source_draft','source_schema'],true) ? 'source' : 'english';
 $result=(new App\Services\AI\ScribeSinglePassDraft($gateway,$reviewer))->generate($source,$draftLanguage);
 $out=['requested_language'=>$draftLanguage,'ok'=>$result['ok']??false,'draft'=>$result['draft']??null,'code'=>$result['failure']??$result['code']??null,'warning_count'=>count($result['reviewWarnings']??[]),'warnings'=>$result['reviewWarnings']??[],'review_count'=>count($result['reviewItems']??[]),'review_items'=>$result['reviewItems']??[],'sources'=>$result['sources']??[],'source_views'=>$result['sourceViews']??[]];
 if (in_array($path,['draft','english_draft','source_draft','groq_draft','compact_draft','source_schema','english_schema'],true)) $out['review_limitation']='Draft only: the review model was stubbed and the result was not clinically checked.';
}
if (is_array($out['draft']??null)) {
 $length=0;foreach ($out['draft'] as $text) if (is_string($text) && $text!=='Not provided.') $length+=mb_strlen($text);
 $out['draft_characters']=$length;$out['draft_to_source_ratio']=round($length/max(1,mb_strlen($source)),2);
}
$summary=[];foreach($events as $event)foreach($event['provider_attempts'] as $attempt){$provider=$attempt['provider'];$stage=$event['stage'];$k=$provider.':'.$stage;
 if(!isset($summary[$k]))$summary[$k]=['provider'=>$provider,'stage'=>$stage,'adapter_attempts'=>0,'reported_input_tokens'=>0,'reported_output_tokens'=>0,'reported_total_tokens'=>0,'usage_missing_attempts'=>0,'failures'=>0];
 $summary[$k]['adapter_attempts']++;if(($attempt['category']??null)!=='ok')$summary[$k]['failures']++;
 $usage=$attempt['usage']??[];if(!isset($usage['total_tokens']))$summary[$k]['usage_missing_attempts']++;
 foreach(['prompt_tokens'=>'reported_input_tokens','output_tokens'=>'reported_output_tokens','total_tokens'=>'reported_total_tokens'] as $from=>$to)$summary[$k][$to]+=(int)($usage[$from]??0);
}
echo json_encode(['case'=>$case,'path'=>$path,'fictional'=>true,'characters'=>mb_strlen($source),'elapsed_seconds'=>round(microtime(true)-$start,2),'result'=>$out,'stages'=>array_values($summary),'limitations'=>'Provider-reported usage only; failed attempts may not report usage, and an adapter may retry HTTP internally. Do not treat token counts as complete billing totals.'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
