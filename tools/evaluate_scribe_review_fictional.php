<?php
// Explicit opt-in live evaluation; entirely fictional veterinary examples.
// This is not an independently adjudicated clinical validation dataset.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
$cases=[
 ['omission_en_bad',true,'objective','The dog coughs. On examination the dog is alert. Cause unknown. No plan discussed.',['subjective'=>'Coughing.','objective'=>'Not provided.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['omission_en_good',false,null,'The dog coughs. On examination the dog is alert. Cause unknown. No plan discussed.',['subjective'=>'Coughing.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['correction_fil_bad',true,'subjective','Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala. Alerto sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.',['subjective'=>'Nagsusuka ng tatlo hanggang apat na araw.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Walang planong napag-usapan.']],
 ['correction_fil_good',false,null,'Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala. Alerto sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.',['subjective'=>'Nagsusuka ng apat na araw, itinama mula sa tatlong araw.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Walang planong napag-usapan.']],
 ['advice_en_bad',true,'plan','The owner reports coughing for two days. Alert on examination. Cause unknown. No medication or follow-up was discussed.',['subjective'=>'Owner reports cough for two days.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'Start antibiotics and return next week.']],
 ['advice_en_good',false,null,'The owner reports coughing for two days. Alert on examination. Cause unknown. No medication or follow-up was discussed.',['subjective'=>'Owner reports cough for two days.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No medication or follow-up discussed.']],
 ['negation_taglish_bad',true,'subjective','Nagsusuka siya mula kahapon. Wala akong nakitang dugo sa suka. Alerto sa pagsusuri. Hindi alam ang sanhi. Walang test na napag-usapan.',['subjective'=>'Nagsusuka mula kahapon na may dugo.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Walang test na napag-usapan.']],
 ['negation_taglish_good',false,null,'Nagsusuka siya mula kahapon. Wala akong nakitang dugo sa suka. Alerto sa pagsusuri. Hindi alam ang sanhi. Walang test na napag-usapan.',['subjective'=>'Nagsusuka mula kahapon; walang nakitang dugo sa suka.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Walang test na napag-usapan.']],
 ['measurement_en_bad',true,'objective','The owner reports coughing. On exam breathing looks comfortable at rest, but respiratory rate was not measured. Cause unknown. No plan discussed.',['subjective'=>'Owner reports coughing.','objective'=>'Normal respiratory rate at rest.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['measurement_en_good',false,null,'The owner reports coughing. On exam breathing looks comfortable at rest, but respiratory rate was not measured. Cause unknown. No plan discussed.',['subjective'=>'Owner reports coughing.','objective'=>'Breathing looks comfortable at rest; rate not measured.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['declined_fil_bad',true,'plan','Nagsusuka mula kahapon. Alerto sa pagsusuri. Hindi alam ang sanhi. Napag-usapan ang blood test pero tinanggihan; walang sample o resulta.',['subjective'=>'Nagsusuka mula kahapon.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Blood test ginawa; may resulta.']],
 ['declined_fil_good',false,null,'Nagsusuka mula kahapon. Alerto sa pagsusuri. Hindi alam ang sanhi. Napag-usapan ang blood test pero tinanggihan; walang sample o resulta.',['subjective'=>'Nagsusuka mula kahapon.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Blood test napag-usapan ngunit tinanggihan; walang sample o resulta.']],
 ['side_en_bad',true,'objective','The owner reports left ear scratching. On exam the left ear is red and the right ear is normal. Possible irritation; cause unknown. No plan discussed.',['subjective'=>'Left ear scratching.','objective'=>'Right ear red; left ear normal.','assessment'=>'Possible irritation; cause unknown.','plan'=>'No plan discussed.']],
 ['side_en_good',false,null,'The owner reports left ear scratching. On exam the left ear is red and the right ear is normal. Possible irritation; cause unknown. No plan discussed.',['subjective'=>'Left ear scratching.','objective'=>'Left ear red; right ear normal.','assessment'=>'Possible irritation; cause unknown.','plan'=>'No plan discussed.']],
 ['uncertainty_tl_bad',true,'assessment','Inuubo ang aso. Alerto sa pagsusuri. Posibleng iritasyon, pero hindi pa alam ang sanhi at hindi kumpirmadong impeksyon. Walang napag-usapang plano.',['subjective'=>'Inuubo ang aso.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Kumpirmadong impeksyon ang sanhi.','plan'=>'Walang napag-usapang plano.']],
 ['uncertainty_tl_good',false,null,'Inuubo ang aso. Alerto sa pagsusuri. Posibleng iritasyon, pero hindi pa alam ang sanhi at hindi kumpirmadong impeksyon. Walang napag-usapang plano.',['subjective'=>'Inuubo ang aso.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Posibleng iritasyon; sanhi hindi alam, impeksyon hindi kumpirmado.','plan'=>'Walang napag-usapang plano.']],
 ['attribution_en_bad',true,'subjective','The clinician says the dog may have less appetite, but it is unclear who observed it. On exam the dog is alert. No assessment or plan was stated.',['subjective'=>'Owner reports decreased appetite.','objective'=>'Alert on examination.','assessment'=>'Not provided.','plan'=>'Not provided.']],
 ['attribution_en_good',false,null,'The clinician says the dog may have less appetite, but it is unclear who observed it. On exam the dog is alert. No assessment or plan was stated.',['subjective'=>'Possible decreased appetite; observer unclear.','objective'=>'Alert on examination.','assessment'=>'Not provided.','plan'=>'Not provided.']],
 ['timing_taglish_bad',true,'plan','Nagsusuka ang aso. Alerto sa pagsusuri. Hindi alam ang sanhi. Sabi ng beterinaryo, balik pagkatapos makakuha ng CBC; hindi malinaw kung resulta ang tinutukoy.',['subjective'=>'Nagsusuka ang aso.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Bumalik pagkatapos matanggap ang CBC results.']],
 ['timing_taglish_good',false,null,'Nagsusuka ang aso. Alerto sa pagsusuri. Hindi alam ang sanhi. Sabi ng beterinaryo, balik pagkatapos makakuha ng CBC; hindi malinaw kung resulta ang tinutukoy.',['subjective'=>'Nagsusuka ang aso.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Bumalik pagkatapos makakuha ng CBC; hindi malinaw kung resulta ang tinutukoy.']],

 ['correction_en_bad',true,'subjective','The cough began two days ago. I checked my calendar, sorry, it started six days ago. Alert on examination. Cause unknown. No plan discussed.',['subjective'=>'Cough for two to six days.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['correction_en_good',false,null,'The cough began two days ago. I checked my calendar, sorry, it started six days ago. Alert on examination. Cause unknown. No plan discussed.',['subjective'=>'Cough for six days.','objective'=>'Alert on examination.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['correction_taglish_bad',true,'objective','Sa left ear siya nangangati. Ay sorry, right ear pala. Alert sa exam. Posibleng irritation; hindi pa sigurado. Walang plano na napag-usapan.',['subjective'=>'Nangangati ang ear.','objective'=>'Alert; left ear nangangati.','assessment'=>'Posibleng irritation; hindi pa sigurado.','plan'=>'Walang planong napag-usapan.']],
 ['correction_taglish_good',false,null,'Sa left ear siya nangangati. Ay sorry, right ear pala. Alert sa exam. Posibleng irritation; hindi pa sigurado. Walang plano na napag-usapan.',['subjective'=>'Nangangati ang right ear.','objective'=>'Alert sa exam.','assessment'=>'Posibleng irritation; hindi pa sigurado.','plan'=>'Walang planong napag-usapan.']],
 ['history_range_good',false,null,'The dog weighed 12 kg at the previous visit and weighs 9 kg today. The owner reports coughing for three to four days. Alert on exam. Cause unknown. No plan discussed.',['subjective'=>'Coughing for three to four days.','objective'=>'Alert; weight was 12 kg at previous visit and is 9 kg today.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],
 ['history_range_bad',true,'objective','The dog weighed 12 kg at the previous visit and weighs 9 kg today. The owner reports coughing for three to four days. Alert on exam. Cause unknown. No plan discussed.',['subjective'=>'Coughing for three to four days.','objective'=>'Alert; weight is 12 kg today.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.']],

 ];
// Fictional contrast: a person's absence does not establish who else was present.
$caseSource='Hindi ko napansing nahihirapan siyang huminga habang nagpapahinga, pero wala ako sa bahay nang buong araw. Alert siya sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.';
$caseDraft=['subjective'=>'Hindi napansing nahihirapan huminga; walang tao sa bahay buong araw.','objective'=>'Alert sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Walang planong napag-usapan.'];
$cases[]=['observation_scope_bad',true,'subjective',$caseSource,$caseDraft];
$caseDraft['subjective']='Hindi napansin ng nagsasalita ang hirap sa paghinga habang nagpapahinga ang alaga; ang nagsasalita ay wala sa bahay buong araw.';
$cases[]=['observation_scope_good',false,null,$caseSource,$caseDraft];
// Fictional test: a possible explanation must not become a likely diagnosis or cause.
$assessmentSource='The dog lost weight. The stools are wet. Diarrhea is possible, but we do not know the cause of the weight loss. No plan was discussed.';
$assessmentDraft=['subjective'=>'Weight loss; wet stools.','objective'=>'Not provided.','assessment'=>'Weight loss is likely due to diarrhea.','plan'=>'No plan discussed.'];
$cases[]=['assessment_strength_bad',true,'assessment',$assessmentSource,$assessmentDraft];
$assessmentDraft['assessment']='Diarrhea is possible; cause of weight loss is unknown.';
$cases[]=['assessment_strength_good',false,null,$assessmentSource,$assessmentDraft];
// A fictional code-switched case where the source does not confirm a causal link.
$assessmentSource2='Napansin natin ang weight loss. Basa at hindi normal ang hitsura ng dumi; posibleng diarrhea pero hindi pa tiyak ang dahilan. Walang planong napag-usapan.';
$assessmentDraft2=['subjective'=>'Weight loss; wet abnormal stool.','objective'=>'Not provided.','assessment'=>'Weight loss is likely due to diarrhea.','plan'=>'No plan discussed.'];
$cases[]=['assessment_taglish_bad',true,'assessment',$assessmentSource2,$assessmentDraft2];
$assessmentDraft2['assessment']='Possible diarrhea; cause not yet known.';
$cases[]=['assessment_taglish_good',false,null,$assessmentSource2,$assessmentDraft2];
// Fictional contrast: monitoring a feature is not a finding that it is abnormal.
$scopeSource='The dog lost weight. We are monitoring appetite, but its status has not been described. The cause is unknown. No plan was discussed.';
$scopeDraft=['subjective'=>'Weight loss and reduced appetite.','objective'=>'Not provided.','assessment'=>'Cause unknown.','plan'=>'No plan discussed.'];
$cases[]=['monitored_scope_bad',true,'subjective',$scopeSource,$scopeDraft];
$scopeDraft['subjective']='Weight loss; appetite is being monitored.';
$cases[]=['monitored_scope_good',false,null,$scopeSource,$scopeDraft];
// Full fictional case from an end-to-end run: the source monitors appetite and
// suggests a CBC but does not specify an appetite abnormality or CBC results.
$fullSource = "yung aso mo na si luna naobserve natin yung sudden loss of weight nya. last consultation he was 12kg but now 9kg na lang. his heart rate and temperature is normal naman but it's just yung appetite niya ang tinitignan natin. now ang nakikita natin possible reason is he has a diarrhea since ang poop niya is basa and not normal looking. i suggest you to have a cbc to verify kang din if there is implications pa sa loob niya so we can determine anong actions natin. i suggest balik kayo right after makakuha ng CBC para maagapan natin agad si Luna";
$fullDraft = ['subjective'=>'Luna experienced a sudden loss of weight and has a reduced appetite. Poop is wet and not normal looking, indicating diarrhea.','objective'=>'Weight during last consultation was 12kg, now 9kg. Heart rate and temperature are normal.','assessment'=>'Possible reason for weight loss is diarrhea.','plan'=>'Perform a CBC to verify internal implications and determine actions. Return right after getting the CBC results.'];
$cases[] = ['full_scope_bad',true,'subjective',$fullSource,$fullDraft];
$fullDraft = ['subjective'=>'Sudden weight loss; appetite being monitored; wet, abnormal-looking stool.','objective'=>'Weight was 12 kg at the last consultation and is 9 kg now. Heart rate and temperature described as normal.','assessment'=>'Possible diarrhea.','plan'=>'CBC suggested to investigate further; return after getting the CBC.'];
$cases[] = ['full_scope_good',false,null,$fullSource,$fullDraft];
// Paired fictional cases test general SOAP placement, not a particular condition.
$placementSource='Dalawang araw na siyang nagkakamot sa tenga. Sa pagsusuri alerto siya, mapula ang kaliwang tenga, at posibleng may iritasyon. Napag-usapan ang pagkuha ng sample pero wala pang nakuha.';
$placementDraft=['subjective'=>'Dalawang araw na nangangamot; alerto at mapula ang kaliwang tenga.','objective'=>'Not provided.','assessment'=>'Posibleng iritasyon.','plan'=>'Sample napag-usapan pero wala pang nakuha.'];
$cases[]=['placement_mixed_bad',true,'objective',$placementSource,$placementDraft];
$placementDraft=['subjective'=>'Dalawang araw na nangangamot sa tenga.','objective'=>'Alerto sa pagsusuri; mapula ang kaliwang tenga.','assessment'=>'Posibleng iritasyon.','plan'=>'Sample napag-usapan pero wala pang nakuha.'];
$cases[]=['placement_mixed_good',false,null,$placementSource,$placementDraft];
$placementSource2='The animal has been coughing since yesterday. On examination it is alert, with clear nasal discharge. The cause is unknown. No treatment was discussed.';
$placementDraft2=['subjective'=>'Cough since yesterday; alert with clear nasal discharge.','objective'=>'Not provided.','assessment'=>'Cause unknown.','plan'=>'No treatment discussed.'];
$cases[]=['placement_english_bad',true,'objective',$placementSource2,$placementDraft2];
$placementDraft2=['subjective'=>'Cough since yesterday.','objective'=>'Alert with clear nasal discharge on examination.','assessment'=>'Cause unknown.','plan'=>'No treatment discussed.'];
$cases[]=['placement_english_good',false,null,$placementSource2,$placementDraft2];

// Fictional portal reproduction: examination details must not disappear into history.
$portalSource="Dinala si Rocky ngayon kasi kanina pa subok nang subok umihi, pero patak-patak lang at may kasamang dugo. Alert naman siya, pero masakit at matigas ang puson niya nung hinalapa natin, na pwedeng senyales ng bara sa iihiyan (urinary blockage). Rekomendasyon natin ngayon is mag-X-ray at Ultrasound agad para makita kung may stones o barat sa bladder niya, at kumuha ng Urinalysis (sample ng ihi) para ma-check kung may bacteria o crystals. Kailangan din natin siyang i-admit para makabitan ng catheter para makaihi siya agad at mabigyan ng IV pain meds. Kapag hindi agad na-decompress ang bladder niya, pwedeng maapektuhan ang kidneys, kaya kailangan maagapan ngayon din.";
$portalDraft=['subjective'=>'Straining to urinate repeatedly, passing drops with blood. Alert; painful and firm lower abdomen on palpation.','objective'=>'Not provided.','assessment'=>'Possible urinary blockage; kidney effects possible if the bladder is not decompressed.','plan'=>'Immediate X-ray and ultrasound suggested to check for bladder stones or blockage; urinalysis suggested to check for bacteria or crystals; admission for catheterization and IV pain medication advised.'];
$cases[]=['placement_portal_bad',true,'objective',$portalSource,$portalDraft];
$portalDraft['subjective']='Repeated attempts to urinate, passing drops with blood.';$portalDraft['objective']='Alert; lower abdomen painful and firm on palpation.';
$cases[]=['placement_portal_good',false,null,$portalSource,$portalDraft];

// Longer synthetic passage for context-position testing, not a natural consultation.
$longSource=str_repeat('Fictional discussion about the animal daily routine and home environment. ',55).'Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala. '.str_repeat('Fictional discussion about the animal daily routine and home environment. ',55).' Alerto sa pagsusuri. Hindi alam ang sanhi. Walang planong napag-usapan.';
$longDraft=['subjective'=>'Nagsusuka ng tatlo hanggang apat na araw.','objective'=>'Alerto sa pagsusuri.','assessment'=>'Hindi alam ang sanhi.','plan'=>'Walang planong napag-usapan.'];
$cases[]=['correction_long_bad',true,'subjective',$longSource,$longDraft];
$longDraft['subjective']='Nagsusuka ng apat na araw.';
$cases[]=['correction_long_good',false,null,$longSource,$longDraft];
$filter=$argv[1]??'';$providerName=$argv[2]??'groq';$reviewMode=$argv[3]??'standard';
if (!in_array($providerName,['groq','gemini'],true) || !in_array($reviewMode,['standard','placement','full_placement','full_passages','independent'],true)) {fwrite(STDERR,"Provider must be groq or gemini; review must be standard, placement, full_placement, full_passages, or independent.\n");exit(2);}
// Fictional-only prototype. Source-first comparisons remain advisory.
$placementReview=static function ($gateway,$source,$draft) {
 $keys=['subjective','objective','assessment','plan'];$facts=[];$judgements=[];
 foreach($keys as $key) { $facts[$key]=['type'=>'string'];$judgements[$key]=['type'=>'string','enum'=>['equivalent','changed','uncertain']]; }
 $factsSchema=['type'=>'object','properties'=>$facts,'required'=>$keys,'additionalProperties'=>false];
 $judgementSchema=['type'=>'object','properties'=>$judgements,'required'=>$keys,'additionalProperties'=>false];
 $schema=['type'=>'object','properties'=>['source_sections'=>$factsSchema,'draft_sections'=>$factsSchema,'sections'=>$judgementSchema,
  'source_corrections'=>['type'=>'string'],'draft_comparison'=>['type'=>'string'],'verdict'=>['type'=>'string','enum'=>['consistent','inconsistent','uncertain']]],
  'required'=>['source_sections','draft_sections','sections','source_corrections','draft_comparison','verdict'],'additionalProperties'=>false];
 $instructions='Independently review the veterinary SOAP draft against the complete transcript. First identify the relevant source facts for each SOAP section in source_sections without guessing missing details. Subjective is history and symptoms; Objective is examination observations and measurements; Assessment is stated interpretations; Plan is actions discussed or advised. A sentence may contain facts for several sections. Next describe what appears in each actual draft section in draft_sections. Finally compare each corresponding section in sections: mark changed for missing, added, altered or misplaced information; uncertain if unclear; otherwise equivalent. A fact in the wrong section does not fill the correct section. An empty or Not provided section is changed if its source facts are present elsewhere. Preserve negation, uncertainty, attribution, time and action status. Separately, identify explicit self-corrections in the transcript and compare the final corrected value with the draft. A misplaced or omitted draft fact is not itself a source correction; if the speaker did not revise a statement, report no correction. A range blending a mistaken and corrected value changes its meaning. For verdict use inconsistent for a changed or missing correction, uncertain when unclear, consistent if faithful or absent. Do not add medical advice. Return JSON.';
 $payload=json_encode(['transcript'=>[['id'=>1,'text'=>$source]],'draft'=>$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
 if($payload===false)return ['ok'=>false];
 $out=$gateway->structured('scribe',$payload,$instructions,'clinical',$schema,true,true);
 return ($out['ok']??false) ? ['ok'=>true,'sections'=>$out['data']['sections'],'correctionSupport'=>match($out['data']['verdict']) {'consistent'=>'equivalent','inconsistent'=>'changed',default=>'uncertain'}] : ['ok'=>false];
};
foreach($cases as [$id,$bad,$target,$source,$draft]) {
 if ($filter!=='' && !str_starts_with($id,$filter)) continue;
 $provider=$providerName==='gemini' ? new App\Services\AI\Providers\GeminiProvider() : new App\Services\AI\Providers\GroqProvider();
 if (in_array($reviewMode,['full_placement','full_passages','independent'],true)) $provider=new class($providerName,$reviewMode) implements App\Services\AI\AiProviderInterface {
  public array $comparison=[];
  public function __construct(private string $name,private string $mode) {}
  public function generate(string $instructions,string $message,?array $schema=null):array {
   if ($this->mode==='independent') {
    $old='First fill source_sections with the facts relevant to each SOAP category from the complete source. Then fill draft_sections with what is actually in each draft category. Compare corresponding sections; a fact in the wrong section does not fill the right one.';
    $new='First classify source facts by SOAP meaning in source_sections, independently of the draft. The transcript need not have SOAP headings. Then fill draft_sections from the actual draft. Compare corresponding sections; misplaced facts do not fill the correct section.';
    if (substr_count($instructions,$old)===1) $instructions=str_replace($old,$new,$instructions);
    elseif (substr_count($instructions,$new)!==1) throw new RuntimeException('Source comparison instruction not found.');
   }
   if (!isset($schema['properties']['source_sections'],$schema['properties']['draft_sections']) || strlen($instructions)>4000) throw new RuntimeException('Expected source-first review schema or budget unavailable.');
   $out=$this->name==='gemini' ? (new App\Services\AI\Providers\GeminiProvider())->generateWithTimeout($instructions,$message,$schema,15,false,null,2048) : (new App\Services\AI\Providers\GroqProvider())->generateWithTimeout($instructions,$message,$schema,12,4096);
   $data=json_decode($out['text']);if(!App\Services\AI\SchemaValidator::matches($schema,$data)) throw new App\Services\AI\AiProviderException('invalid_schema');
   $this->comparison=['source_sections'=>$data->source_sections,'draft_sections'=>$data->draft_sections];
   return $out;
  }
 };
 $gateway=new App\Services\AI\AiGateway($provider);$gateway->startScribeDeadline(30);
 $passages=[['id'=>1,'text'=>$source]];
 if (in_array($reviewMode,['full_passages','independent'],true)) {
  $plan=(new App\Services\AI\ScribeSourcePassages())->plan($source);
  if (!($plan['ok']??false)) {echo json_encode(['id'=>$id,'ok'=>false,'reason'=>'segmentation_failed']).PHP_EOL;continue;}
  $passages=array_map(static fn($chunk)=>['id'=>$chunk['id'],'text'=>$chunk['text']],$plan['chunks']);
 }
 $result=$reviewMode==='placement' ? $placementReview($gateway,$source,$draft) : (new App\Services\AI\ScribeSinglePassReview($gateway))->review($passages,$draft);
 $labels=$result['sections']??[];$labels['assessment_support']=$result['assessmentSupport']??null;$labels['correction_support']=$result['correctionSupport']??null;$labels['measurement_support']=$result['measurementSupport']??null;$labels['advice_support']=$result['adviceSupport']??null;
 $flagged=(bool)array_filter($labels,static fn($x)=>in_array($x,['changed','uncertain'],true));
 $targetFlagged=$target!==null && in_array($labels[$target]??null,['changed','uncertain'],true);
 echo json_encode(['id'=>$id,'expected_error'=>$bad,'target'=>$target,'ok'=>$result['ok']??false,'flagged'=>$flagged,'target_flagged'=>$targetFlagged,'labels'=>$labels,'comparison'=>in_array($reviewMode,['full_placement','full_passages','independent'],true) ? $provider->comparison : null,'attempts'=>$gateway->providerAttemptDiagnostics()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
}
