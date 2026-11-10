<?php
namespace App\Services\AI;

/** Research-only source inventory. This class does not write clinical records. */
final class ScribeFactInventory
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function extract(string $transcript, string $before = '', string $after = '', bool $wholeSegments = false): array
    {
        if (trim($transcript)==='') return ['ok'=>false,'code'=>'empty_transcript'];
        // Preserve every character. Boundaries are display aids, not speaker or
        // clinical judgments; unpunctuated text stays together for review.
        $parts=preg_split('/(?<=[.!?])(?=\s)|(?<=\n)/u', $transcript, -1, PREG_SPLIT_NO_EMPTY|PREG_SPLIT_OFFSET_CAPTURE);
        if ($parts===false || !$parts) return ['ok'=>false,'code'=>'segmentation_failed'];
        $segments=[];$leading='';
        foreach ($parts as [$text,$offset]) {
            // Blank lines are separators, not independent clinical statements.
            // Attach them to adjacent text while preserving exact offsets and
            // coverage, including leading/trailing whitespace.
            if (trim($text)==='') {
                if ($segments) $segments[count($segments)-1]['text'].=$text;
                else $leading.=$text;
                continue;
            }
            $segments[]=['id'=>count($segments)+1,'offset'=>$offset-strlen($leading),'text'=>$leading.$text];
            $leading='';
        }
        if (!$segments || implode('',array_column($segments,'text'))!==$transcript) return ['ok'=>false,'code'=>'segmentation_failed'];
        if (count($segments)>100) return ['ok'=>false,'code'=>'too_many_segments'];
        $quote=['type'=>'object','properties'=>['text'=>['type'=>'string'],'category'=>['type'=>'string','enum'=>['subjective','objective','assessment','plan','uncertain']]],'required'=>['text','category'],'additionalProperties'=>false];
        $entry=['type'=>'object','properties'=>['segment_id'=>['type'=>'integer'],'quotes'=>['type'=>'array','items'=>$quote]],'required'=>['segment_id','quotes'],'additionalProperties'=>false];
        $schema=['type'=>'object','properties'=>['segments'=>['type'=>'array','items'=>$entry]],'required'=>['segments'],'additionalProperties'=>false];
        $instructions='Identify source evidence for a veterinary SOAP review from the numbered transcript segments. Include each segment ID exactly once. '
            .'For every clinical fact copy an exact contiguous quotation from its segment and assign the most appropriate SOAP category to that quotation. A segment can contain facts from multiple categories. '
            .'Blank lines and whitespace are not facts; never return whitespace-only quotations. '
            .'Subjective is history or observations reported by the owner; objective is examination findings and measured results reported by the veterinarian. Assessment is the veterinarian interpretation or diagnostic uncertainty; plan is advice, actions, tests, treatment or follow-up discussed by the veterinarian. Attribute each statement to the speaker supported by its context. An observation by the veterinarian belongs in objective even if the owner discussed the same symptom. Do not infer missing speaker attribution. '
            .'Use neighboring context only to interpret the numbered segments; never extract quotes from context. Do not treat questions as findings. Classify by statement type even when the clinical content is uncertain; preserve that uncertainty in the exact quotation. Use uncertain only when meaning, speaker attribution, or appropriate category cannot be determined from context. Never guess who spoke. '
            .'For corrections or changes, include the original statement and the correction together when possible, preserving who said them, timing, and any explanation. Include qualifiers with the fact they qualify; do not extract a partial quote that changes its meaning. Keep the context of unreliable or conflicting measurements with the measurement. '
            .'Do not paraphrase, infer, diagnose, prescribe, advise, or invent facts. Questions, speaker changes, corrections, negation and uncertainty can change context: do not guess. Return JSON.';
        if ($wholeSegments) $instructions.=' For this retry, use each entire original segment exactly as supplied as the quotation. If a segment contains multiple SOAP categories, include the entire segment in each applicable category; if uncertain, classify it as uncertain. Do not add, omit, normalize or change characters within a quoted segment.';
        $input=json_encode(['context_before'=>$before,'segments'=>$segments,'context_after'=>$after],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if ($input===false) return ['ok'=>false,'code'=>'invalid_transcript'];
        $answer=$this->gateway->structured('scribe',$input,$instructions,'clinical',$schema,true);
        if (!($answer['ok']??false)) {
            // Bounded categories only; never return or log provider bodies or clinical text.
            $allowed=['invalid_input','disabled','clinical_blocked','privacy_blocked','invalid_json','invalid_schema','provider_unavailable','empty_response','timeout','transport','rate_limit','http_error','configuration','safety_refusal','deadline'];
            $reason=$answer['provider_failure']??$answer['error_code']??'provider_unavailable';
            return ['ok'=>false,'code'=>'extraction_unavailable','failure'=>in_array($reason,$allowed,true)?$reason:'provider_unavailable'];
        }
        $map=[];$crossSegmentQuotes=[];
        foreach ($answer['data']['segments'] as $row) {
            $id=$row['segment_id'];
            if ($id<1 || $id>count($segments) || isset($map[$id])) return ['ok'=>false,'code'=>'invalid_segment_mapping'];
            foreach ($row['quotes'] as &$quote) {
                $source=$segments[$id-1]['text'];
                $text=$quote['text'];
                if (trim($text)==='') return ['ok'=>false,'code'=>'invalid_quote'];
                if (str_contains($source,$text)) continue;
                // An exact correction may legitimately span adjacent segments.
                // Accept only a unique span in this chunk which overlaps its
                // claimed segment; distribute original pieces after validation.
                $position=strpos($transcript,$text);
                if ($position!==false && strpos($transcript,$text,$position+1)===false) {
                    $segmentStart=$segments[$id-1]['offset'];
                    $segmentEnd=$segmentStart+strlen($source);
                    if ($position < $segmentEnd && $position+strlen($text)>$segmentStart) {
                        $crossSegmentQuotes[]=['start'=>$position,'end'=>$position+strlen($text),'category'=>$quote['category']];
                        $quote['text']='';
                        continue;
                    }
                    // The model may attach an exact passage to the wrong
                    // segment ID. Keep it as uncertain, never silently accept
                    // its proposed clinical category.
                    $crossSegmentQuotes[]=['start'=>$position,'end'=>$position+strlen($text),'category'=>'uncertain'];
                    $quote['text']='';
                    continue;
                }
                // Tolerate whitespace changes only. Recover the exact original
                // span; never normalize words, punctuation, or an ambiguous match.
                $words=preg_split('/\s+/u',trim($text),-1,PREG_SPLIT_NO_EMPTY);
                if (!$words) return ['ok'=>false,'code'=>'invalid_quote'];
                $pattern='/'.implode('\s+',array_map(static fn($word)=>preg_quote($word,'/'),$words)).'/u';
                $matches=[];
                if (preg_match_all($pattern,$source,$matches)!==1) return ['ok'=>false,'code'=>'invalid_quote'];
                $quote['text']=$matches[0][0];
            }
            unset($quote);
            $map[$id]=$row;
        }
        if (count($map)!==count($segments)) return ['ok'=>false,'code'=>'incomplete_inventory'];
        foreach ($map as &$row) $row['quotes']=array_values(array_filter($row['quotes'],static fn($quote)=>$quote['text']!==''));
        unset($row);
        foreach ($crossSegmentQuotes as $span) foreach ($segments as $segment) {
            $start=max($span['start'],$segment['offset']);
            $end=min($span['end'],$segment['offset']+strlen($segment['text']));
            if ($end<=$start) continue;
            $piece=substr($transcript,$start,$end-$start);
            if (trim($piece)!=='') $map[$segment['id']]['quotes'][]=['text'=>$piece,'category'=>$span['category']];
        }
        $inventory=[];
        foreach($segments as $segment) {
            $row=$map[$segment['id']];
            $inventory[]=$segment+['quotes'=>$row['quotes']];
        }
        return ['ok'=>true,'transcript'=>$transcript,'segments'=>$inventory,
            'warning'=>'Experimental classification may omit or misclassify information. Review every original segment and the full transcript.'];
    }
}
