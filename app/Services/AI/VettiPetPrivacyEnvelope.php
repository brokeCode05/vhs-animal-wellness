<?php
namespace App\Services\AI;

/** Protect field values before interpretation. AI selects opaque source references;
 * Laravel resolves and validates them locally. This class never chooses an intent.
 */
final class VettiPetPrivacyEnvelope
{
 public function protect(string $message,array $knownAliases=[],bool $registrationContext=false,?string $expectedField=null,array $publicWords=[],array $draft=[]):array {
  $spans=[];
  // Recognize repeated private values locally so a reminder about a known
  // name cannot become a different draft field after anonymization.
  foreach(['name','breed','speciesCustom'] as $field){
   $value=trim((string)($draft[$field]??''));if($value==='')continue;
   preg_match_all('/(?<![\pL\pN])'.preg_quote($value,'/').'(?![\pL\pN])/iu',$message,$known,PREG_OFFSET_CAPTURE);
   foreach($known[0] as [$found,$offset])$spans[]=['start'=>$offset,'length'=>strlen($found),'value'=>$found,'type'=>'text','hint'=>$field,'unit'=>null];
  }
  $textPatterns=[
   '/\b(?:(?:his|her|its|pet[\x27\x{2019}]s)\s+)?(name|pangalan(?:\s+(?:niya|nya))?|breed|lahi|species|species details)\s*(?:[:=]|is\b|ay\b)\s*([\pL][\pL\pM\pN _\x27\x{2019}-]{0,59}?)(?=[,;.\n]|$|\s+(?:(?:breed|lahi|sex|gender|kasarian|age|edad|weight|timbang|species)\s*[:=]|(?:who|aged|weighs|with|and|is|he|she|his|her)\b))/iu',
   '/\b(pangalan\s+(?:niya|nya|nito))\s+(?:ay\s+)?([\pL][\pL\pM\pN _\x27\x{2019}-]{0,49}?)(?=[,;.\n]|$|\s+(?:at|ay|siya|ang|may)\b)/iu',
   '/\b(named|called)\s+([\pL][\pL\pM\pN _\x27\x{2019}-]{0,49}?)(?=[,;.\n]|$|\s+(?:who|aged|weighs|with|and|is|he|she|his|her)\b)/iu',
   '/\b(?:my|our|new|aking)\s+(?:pet|dog|cat|rabbit|bird|puppy|kitten)\s+((?!named\b|called\b|is\b|has\b|needs\b|for\b|weighs\b|and\b)[\pL][\pL\pM\pN _\x27\x{2019}-]{0,49}?)(?=[,;.\n]|$|\s+(?:who|aged|weighs|with|and|is|he|she|his|her)\b)/iu',
  ];
  foreach($textPatterns as $i=>$pattern){preg_match_all($pattern,$message,$matches,PREG_SET_ORDER|PREG_OFFSET_CAPTURE);foreach($matches as $m){$capture=count($m)===2?$m[1]:$m[2];$hint=$i===0?mb_strtolower($m[1][0]):'name';$hint=in_array($hint,['breed','lahi'],true)?'breed':(str_starts_with($hint,'species')?'speciesCustom':'name');$value=trim($capture[0]);$value=$knownAliases[$value]??$value;$spans[]=['start'=>$capture[1],'length'=>strlen($capture[0]),'value'=>$value,'type'=>'text','hint'=>$hint,'unit'=>null];}}
  preg_match_all('/(?<![\pL\pN.+-])((?:\d+(?:\.\d+)?|\.\d+))\s*(kg|kilograms?|kilos?|months?|mos?\.?|years?(?:\s*old)?|buwan|taon)(?![\pL\pN])/iu',$message,$numbers,PREG_SET_ORDER|PREG_OFFSET_CAPTURE);
  foreach($numbers as $m){$unit=mb_strtolower($m[2][0]);$weight=preg_match('/\A(?:kg|kilo)/',$unit);$unit=$weight?'kg':(preg_match('/\A(?:m|buwan)/u',$unit)?'months':'years');$spans[]=['start'=>$m[1][1],'length'=>strlen($m[1][0]),'value'=>$m[1][0],'type'=>'number','hint'=>$weight?'weightKg':'age','unit'=>$unit];}
  // Form-context bare numbers can be interpreted as a weight in the form's kg
  // unit; an age still needs an explicit or previously established unit.
  if($registrationContext && preg_match('/\A\s*(\d+(?:\.\d+)?|\.\d+)\s*\z/u',$message,$m,PREG_OFFSET_CAPTURE))$spans[]=['start'=>$m[1][1],'length'=>strlen($m[1][0]),'value'=>$m[1][0],'type'=>'number','hint'=>null,'unit'=>null];
  // In registration, unrecognized free-text values fail closed into opaque
  // references. The model can use grammar and form context, never raw names/breeds.
  $profileContext=$registrationContext || $spans!==[] || (bool)preg_match('/\b(?:add|register|registration|magdagdag|irehistro|bagong\s+(?:pet|pusa|aso)|new\s+(?:pet|cat|dog))\b/iu',$message);
  if ($profileContext) {
   // Even invalid or unitless profile numbers stay local for validation.
   $numericTokens=[[]];
   if(preg_match('/\b(?:name|age|edad|weight|timbang|weighs|he|she|his|her|siya|niya)\b/iu',$message) || preg_match('/\A\s*[+.-]?[\d.,]+\s*\z/u',$message))
    preg_match_all('/(?<![\pL\pN_])[+-]?(?:\d+(?:[.,]\d+)*|\.\d+)/u',$message,$numericTokens,PREG_OFFSET_CAPTURE);
   foreach($numericTokens[0] as [$number,$offset]) {
    $covered=false;foreach($spans as $v)if($offset>=$v['start'] && $offset<$v['start']+$v['length']){$covered=true;break;}
    if(!$covered)$spans[]=['start'=>$offset,'length'=>strlen($number),'value'=>$number,'type'=>'number','hint'=>null,'unit'=>null];
   }
   $grammar=preg_split('/\s+/u','already before told said remember again still about stop pause done enough finish finished review form fill manually myself questions quit hold muna tama ayoko huwag wag bahala what where when how why do does did price prices cost fees service services offer clinic hours location address contact open closed available availability schedule appointment appointments book booking consultation explain translate repeat continue current start separate cancel correction i me my our we want would like to please can could you help add adding register registering registration another new pet pets a an the his her its he she it they is are was be named called name pangalan niya nya nito ko mo ang mga si ay siya ito breed lahi species sex gender kasarian age edad weight timbang weighs weigh weighing old aged with and or at also for of in on as actually change correct correction update yes no not now later thanks thank thankyou po opo salamat naman today tomorrow yesterday bukas ngayon makalawa mamaya later next this morning afternoon evening night umaga hapon gabi monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december only just currently about boy girl male female lalaki babae dog dogs puppy puppies aso tuta cat cats kitten kittens pusa kuting bird birds ibon rabbit rabbits kuneho other unknown mixed kg kilogram kilograms kilo kilos month months mo mos year years buwan taon taong gulang pangalan details has have na ilang gusto kong mag ako siyang kaniyang niya niya ng sa may yung isang ito yan');
   $grammar=array_merge($grammar,array_map('mb_strtolower',$publicWords));
   if(in_array($expectedField,['name','breed','speciesCustom'],true) && !preg_match('/\A\s*(?:stop|pause|done|enough|review|quit|muna|tama|ayoko|huwag|wag)[.!]?\s*\z/iu',$message) && preg_match('/\A\s*([\pL][\pL\pM\pN_\x27-]*)[.!]?\s*\z/u',$message,$bare,PREG_OFFSET_CAPTURE)) {
    $v=$bare[1];$spans[]=['start'=>$v[1],'length'=>strlen($v[0]),'value'=>$v[0],'type'=>'text','hint'=>in_array(mb_strtolower($v[0]),$grammar,true)?'ambiguous':$expectedField,'unit'=>null];
   }
   preg_match_all('/[\pL][\pL\pM\pN_\x27\x{2019}-]*/u',$message,$tokens,PREG_OFFSET_CAPTURE);
   foreach($tokens[0] as [$token,$offset]) {
    if(in_array(mb_strtolower($token),$grammar,true) || preg_match('/\A(?:PET_\d+|PRIVATE_VALUE_\d+)\z/u',$token))continue;
    $covered=false;foreach($spans as $v)if($offset>=$v['start'] && $offset<$v['start']+$v['length']){$covered=true;break;}
    if(!$covered)$spans[]=['start'=>$offset,'length'=>strlen($token),'value'=>$token,'type'=>'text','hint'=>null,'unit'=>null];
   }
  }
  usort($spans,fn($a,$b)=>$a['start']<=>$b['start']);$accepted=[];$end=-1;
  foreach($spans as $span){if($span['start']<$end)continue;$accepted[]=$span;$end=$span['start']+$span['length'];}
  $vault=[];$safe='';$cursor=0;
  foreach($accepted as $i=>$span){$ref='PRIVATE_VALUE_'.($i+1);$safe.=substr($message,$cursor,$span['start']-$cursor).$ref.' ';$cursor=$span['start']+$span['length'];$vault[$ref]=$span;}
  $safe.=substr($message,$cursor);
  $metadata=[];foreach($vault as $ref=>$v)$metadata[$ref]=['type'=>$v['type'],'field_hint'=>$v['hint'],'unit'=>$v['unit']];
  return ['safe'=>$safe,'vault'=>$vault,'metadata'=>$metadata];
 }

 public function resolve(array $selected,array $envelope,array $previous=[]):array {
  $changes=[];$issues=[];$vault=$envelope['vault'];$source=$envelope['safe'];
  foreach(['name_ref'=>'name','breed_ref'=>'breed','species_custom_ref'=>'speciesCustom','age_ref'=>'age','weight_ref'=>'weightKg'] as $key=>$field){
   $ref=$selected[$key]??'none';if($ref==='none'||$ref==='')continue;$v=$vault[$ref]??null;
   if(!$v || ($v['hint']!==null && $v['hint']!==$field)){$issues[]=$field;continue;}
   if(in_array($field,['age','weightKg'],true)){
    $n=(string)$v['value'];$valid=(bool)preg_match('/\A(?:\d+(?:\.\d{1,2})?|\.\d{1,2})\z/u',$n);
    if($field==='age'){$unit=$selected['age_unit']??'none';$valid=$valid && preg_match('/\A\d+\z/',$n) && in_array($unit,['months','years'],true) && ($v['unit']===null?($previous['ageUnit']??null)===$unit:$v['unit']===$unit) && (int)$n<=($unit==='months'?600:50);if($valid){$changes['age']=(int)$n;$changes['ageUnit']=$unit;}}
    else{$valid=$valid && in_array($v['unit'],[null,'kg'],true) && (float)$n<=config('vhs.pet_weight_max',200);if($valid)$changes['weightKg']=(float)$n;}
    if(!$valid){$changes[$field]=null;$issues[]=$field;}
   }else{$text=trim($v['value']);if($text!=='' && mb_strlen($text)<=($field==='breed'?60:50) && !preg_match('/[<>\x00-\x1f@:=]/u',$text))$changes[$field]=$text;else{$changes[$field]=null;$issues[]=$field;}}
  }
  foreach(['species_text'=>'speciesCustom','breed_text'=>'breed'] as $key=>$field){$text=trim((string)($selected[$key]??''));if($text!=='' && mb_strlen($text)<=($field==='breed'?60:50) && mb_stripos($source,$text)!==false && !preg_match('/[<>\x00-\x1f@:=]|PRIVATE_VALUE_|\bPET_/u',$text))$changes[$field]=$text;}
  $species=$selected['species']??'none';$speciesWords=['Dog'=>['dog','puppy','aso','tuta'],'Cat'=>['cat','kitten','pusa','kuting'],'Bird'=>['bird','ibon'],'Rabbit'=>['rabbit','kuneho']];
  if(isset($speciesWords[$species])){foreach($speciesWords[$species] as $word)if(preg_match('/(?<![\pL\pN])'.preg_quote($word,'/').'(?![\pL\pN])/iu',$source)){$changes['species']=$species;break;}}
  if(!empty($changes['speciesCustom'])){$canonical=ucfirst(mb_strtolower($changes['speciesCustom']));if(in_array($canonical,['Dog','Cat','Bird','Rabbit'],true)){$changes['species']=$canonical;$changes['speciesCustom']='';}elseif($species==='Other')$changes['species']='Other';}
  $sex=$selected['gender']??'none';$sexWords=['Male'=>['male','lalaki'],'Female'=>['female','babae']];if(isset($sexWords[$sex]))foreach($sexWords[$sex] as $word)if(preg_match('/\b'.preg_quote($word,'/').'\b/iu',$source)){$changes['gender']=$sex;break;}
  return ['changes'=>$changes,'issues'=>array_values(array_unique($issues))];
 }
}
