<?php
if (!function_exists('mb_strtolower')) { function mb_strtolower($v){return strtolower($v);} }
if (!function_exists('mb_strlen')) { function mb_strlen($v){return strlen($v);} }
require_once dirname(__DIR__).'/app/Services/AI/VettiServiceContext.php';
use App\Services\AI\VettiServiceContext as C;
$catalog = ['Dog Grooming','Cat Grooming','Consultation'];
$cases = [
    ['Do you offer cat grooming?','one','Cat Grooming'],
    ['By the way, do you offer cat grooming?','one','Cat Grooming'],
    ['What about dog grooming?','one','Dog Grooming'],
    ['What about dog grooming and cat grooming?','ambiguous',null],
    ['What grooming services do you offer?','none',null],
    ['Do you offer lion grooming?','none',null],
    ['Do you offer cat grooming and dog grooming?','ambiguous',null],
];
$n=0;
foreach ($cases as [$q,$status,$name]) {
    $out=C::mentioned($q,$catalog);
    if($out !== ['status'=>$status,'label'=>$name]) throw new RuntimeException("Mismatch: $q ".json_encode($out));
    $n++;
}
foreach (['Do you offer cat grooming?','What about dog grooming?'] as $q) {if(!C::serviceQuestion($q))throw new RuntimeException('Service question should pass'); $n++;}
foreach (['Can I book cat grooming?','Show my cat grooming record','My dog has an emergency','Cat grooming tomorrow 2026-10-28'] as $q){if(C::serviceQuestion($q))throw new RuntimeException('Unsafe question admitted');$n++;}
if(C::next('Do you offer cat grooming?', 'services',null,$catalog)!=='Cat Grooming')throw new RuntimeException('No service selected');$n++;
if(C::next('How much does it cost?', 'price','Cat Grooming',$catalog)!=='Cat Grooming')throw new RuntimeException('Price lost service');$n++;
if(C::next('What about dog grooming?', 'services','Cat Grooming',$catalog)!=='Dog Grooming')throw new RuntimeException('Service switch failed');$n++;
if(C::next('What time do you open?', 'hours','Cat Grooming',$catalog)!==null)throw new RuntimeException('Did not clear on topic switch');$n++;
if(C::next('What about cat grooming and dog grooming?', 'service_ambiguous','Dog Grooming',$catalog)!==null)throw new RuntimeException('Ambiguity retained selection');$n++;
if(C::validateSaved('Cat Grooming',['Dog Grooming'])!==null)throw new RuntimeException('Inactive service persisted');$n++;
echo "PASS: $n service memory / selection / ambiguity / privacy checks\n";
