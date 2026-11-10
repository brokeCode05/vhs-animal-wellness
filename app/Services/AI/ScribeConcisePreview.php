<?php
namespace App\Services\AI;

/** Research-only preview. The caller supplies previously selected source passages. */
final class ScribeConcisePreview
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function generate(array $sources): array
    {
        $keys=['subjective','objective','assessment','plan'];
        foreach($keys as $key) if(!isset($sources[$key]) || !is_string($sources[$key]) || trim($sources[$key])==='') return ['ok'=>false,'code'=>'missing_source'];
        $fields=[];foreach($keys as $key) $fields[$key]=['type'=>'string'];
        $schema=['type'=>'object','properties'=>$fields,'required'=>$keys,'additionalProperties'=>false];
        $instructions='Create a concise veterinary SOAP draft from the supplied source sections. Summarize rather than copy sentences verbatim; remove filler and repetition and combine related facts. Use only the matching section. '
            .'Keep all clinical facts, temporal context, negations, uncertainty, speaker attribution, measurements and follow-up instructions. '
            .'Never generate new medical advice, diagnoses, treatments, prescriptions, dosages, tests, or follow-up recommendations. Document advice only when explicitly stated by the veterinarian in the source. Do not turn owner reports into examinations. '
            .'When unclear, do not guess. Keep Not provided. for empty sections. Use the source language. Return JSON.';
        $answer=$this->gateway->structured('scribe',json_encode($sources,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$instructions,'clinical',$schema,true);
        if(!($answer['ok']??false)) return ['ok'=>false,'code'=>'generator_unavailable'];
        $draft=$answer['data'];
        foreach($keys as $key){
            $value=trim($draft[$key]??'');$source=trim($sources[$key]);
            if($value==='' || mb_strlen($value)>($key==='assessment'?800:1000)) return ['ok'=>false,'code'=>'invalid_section'];
            if(($source==='Not provided.')!==($value==='Not provided.')) return ['ok'=>false,'code'=>'empty_section_mismatch'];
            if ($key==='subjective' && preg_match('/\b(?:owner|may-ari|may ari|guardian|client)\b/iu',$source) && !preg_match('/\b(?:owner|may-ari|may ari|guardian|client)\b/iu',$value)) return ['ok'=>false,'code'=>'attribution_missing'];
            // Until fact-level validation is independently demonstrated, keep
            // risk-bearing sentences and all plans verbatim. Model approval is
            // not sufficient to infer the scope of a negation or instruction.
            $protected='/\b(?:no|not|never|none|without|denies|denied|negative|hindi|wala|walang|di|possible|possibly|suspect(?:ed)?|uncertain|unsure|maybe|perhaps|might|could|posible|posibleng|hinala|pinaghihinalaan|siguro|broken|faulty|unreliable|sira|thermometer|temperature|temp|weight|timbang|pulse|bpm|kg|kilograms?|celsius|fahrenheit|days?|weeks?|months?|araw|linggo|buwan|treatment|medication|gamot|dose|dosage)\b|\d|[\x27\x{2019}]t\b/iu';
            if ($key==='plan' && $value!==$source) return ['ok'=>false,'code'=>'plan_requires_source'];
            $statements=preg_split('/(?<=[.!?;])\s+/u',$source,-1,PREG_SPLIT_NO_EMPTY) ?: [];
            $offset=0;
            foreach($statements as $statement) {
                if (!preg_match($protected,$statement)) continue;
                $found=mb_strpos($value,$statement,$offset);
                if ($found===false) return ['ok'=>false,'code'=>'protected_source_changed'];
                $offset=$found+mb_strlen($statement);
            }
            // Cue counts are conservative tripwires, not semantic proof: keep
            // negations and uncertainty in the same SOAP section. A rejected
            // paraphrase falls back rather than guessing at clinical meaning.
            $qualifiers=[
                'negation'=>'/\b(?:no|not|never|none|without|denies|denied|negative|hindi|wala|walang|di)\b|\b(?:isn|wasn|hasn|haven|doesn|didn|can|won)[\x27\x{2019}]t\b/iu',
                'uncertainty'=>'/\b(?:possible|possibly|suspect(?:ed)?|uncertain|unsure|maybe|perhaps|may|might|could|posible|posibleng|hinala|pinaghihinalaan|siguro)\b/iu',
            ];
            foreach($qualifiers as $kind=>$pattern) {
                preg_match_all($pattern,$source,$sourceCues);preg_match_all($pattern,$value,$draftCues);
                if(count($draftCues[0])<count($sourceCues[0])) return ['ok'=>false,'code'=>$kind.'_lost'];
            }
            preg_match_all('/\d+(?:[.,]\d+)?/u',$source,$a);preg_match_all('/\d+(?:[.,]\d+)?/u',$value,$b);
            $from=$a[0];$to=$b[0];sort($from);sort($to);if($from!==$to) return ['ok'=>false,'code'=>'number_mismatch'];
        }
        $verification=['type'=>'object','properties'=>['supported'=>['type'=>'boolean'],'complete'=>['type'=>'boolean']], 'required'=>['supported','complete'],'additionalProperties'=>false];
        $check=$this->gateway->structured('scribe',json_encode(['sources'=>$sources,'draft'=>$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
            'Review each SOAP section against its corresponding source. Check BOTH directions: every draft statement must be supported and every clinically relevant source fact must be retained. Check negation, uncertainty, attribution, values and follow-up. Reject new medical advice, diagnosis, treatment or prescription not explicitly stated in the source. Return supported false or complete false for any discrepancy or doubt. Return JSON.', 'clinical',$verification,true);
        if(!($check['ok']??false) || ($check['data']['supported']??null)!==true || ($check['data']['complete']??null)!==true) return ['ok'=>false,'code'=>'verification_failed'];
        return ['ok'=>true,'draft'=>$draft,'sources'=>$sources,'warning'=>'Unverified research preview. Compare with the full transcript.'];
    }
}
