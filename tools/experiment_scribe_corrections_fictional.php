<?php
// Opt-in live experiment using fictional text only. Not clinical validation.
require __DIR__.'/../vendor/autoload.php';
$app=require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
$cases=[
 'fil_bad'=>['Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala.','Nagsusuka ng tatlo hanggang apat na araw.'],
 'fil_good'=>['Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala.','Nagsusuka ng apat na araw.'],
 'en_bad'=>['The cough began two days ago. I checked my calendar, sorry, it started six days ago.','Cough for two to six days.'],
 'en_good'=>['The cough began two days ago. I checked my calendar, sorry, it started six days ago.','Cough for six days.'],
 'taglish_bad'=>['Sa left ear siya nangangati. Ay sorry, right ear pala.','Left ear nangangati.'],
 'taglish_good'=>['Sa left ear siya nangangati. Ay sorry, right ear pala.','Nangangati ang right ear.'],
 'range_good'=>['The owner reports coughing for three to four days.','Cough for three to four days.'],
 'historical_good'=>['The dog weighed 12 kg at the previous visit and weighs 9 kg today.','Previous weight 12 kg; current weight 9 kg.'],
 'uncertain_good'=>['Hindi sigurado kung kahapon o noong isang araw nagsimula ang ubo.','Ubo nagsimula kahapon o noong isang araw; hindi sigurado.'],

 'negation_bad'=>['Wala siyang sinuka kahapon. Ay sorry, isang beses pala siyang nagsuka kahapon.','Walang pagsusuka kahapon.'],
 'negation_good'=>['Wala siyang sinuka kahapon. Ay sorry, isang beses pala siyang nagsuka kahapon.','Isang beses nagsuka kahapon.'],
 'dose_bad'=>['I gave half a tablet at home. Sorry, I checked and it was one tablet.','Owner gave half a tablet at home.'],
 'dose_good'=>['I gave half a tablet at home. Sorry, I checked and it was one tablet.','Owner gave one tablet at home.'],
 'uncertain_bad'=>['Hindi sigurado kung kahapon o noong isang araw nagsimula ang ubo.','Nagsimula ang ubo kahapon.'],

 ];
$longSource=str_repeat('Fictional discussion about the animal daily routine and home environment. ',55).'Tatlong araw na siyang nagsusuka. Ay teka, tiningnan ko ang kalendaryo: apat na araw na pala. '.str_repeat('Fictional discussion about the animal daily routine and home environment. ',55);
$cases['long_bad']=[$longSource,'Nagsusuka ng tatlo hanggang apat na araw.'];
$cases['long_good']=[$longSource,'Nagsusuka ng apat na araw.'];
$filter=$argv[1]??'';$providerName=$argv[2]??'groq';if (!in_array($providerName,['groq','gemini'],true)) exit(2);
$schema=['type'=>'object','properties'=>['source_corrections'=>['type'=>'string'],'draft_comparison'=>['type'=>'string'],'verdict'=>['type'=>'string','enum'=>['consistent','inconsistent','uncertain']]],'required'=>['source_corrections','draft_comparison','verdict'],'additionalProperties'=>false];
$instructions='Compare the transcript and note only for factual self-corrections. First identify exactly what was originally said and what replaced it, in source_corrections. If the speaker was uncertain or described distinct events, say so instead of inventing a correction. Next explain in draft_comparison whether the note preserves the final corrected fact with the same precision and uncertainty. If a speaker explicitly corrects a number, a note giving both numbers as a range changes a definite value into uncertainty; mark inconsistent. Changes in time, measurement, body side, negation or test status matter. Different visits and true ranges are not corrections. If there are no source corrections, use consistent. If a relevant correction is missing or changed use inconsistent. If genuinely unclear use uncertain. Do not provide medical advice. Return JSON.';
foreach($cases as $id=>[$source,$draft]) {if($filter!==''&&!str_starts_with($id,$filter))continue;
 $provider=$providerName==='gemini'?new App\Services\AI\Providers\GeminiProvider():new App\Services\AI\Providers\GroqProvider();$gateway=new App\Services\AI\AiGateway($provider);$gateway->startScribeDeadline(30);
 $result=$gateway->structured('scribe',json_encode(['transcript'=>$source,'draft'=>$draft],JSON_UNESCAPED_UNICODE),$instructions,'clinical',$schema,true,true);
 echo json_encode(['id'=>$id,'ok'=>$result['ok']??false,'data'=>$result['data']??null,'attempts'=>$gateway->providerAttemptDiagnostics()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL;
}
