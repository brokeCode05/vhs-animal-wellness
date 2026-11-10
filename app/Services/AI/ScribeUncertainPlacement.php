<?php
namespace App\Services\AI;

/** Experimental placement suggestions, never inserted into a draft automatically. */
final class ScribeUncertainPlacement
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function suggest(array $attention): array
    {
        $items=[];
        foreach ($attention as $item) {
            if (($item['reason']??null)!=='uncertain_category') continue;
            if (!is_string($item['text']??null) || !is_string($item['source']??null) || !is_int($item['sourceOffset']??null) || !str_contains($item['source'],$item['text'])) return ['ok'=>false,'code'=>'invalid_evidence'];
            $items[]=['id'=>count($items)+1,'quote'=>$item['text'],'context'=>$item['source'],'sourceOffset'=>$item['sourceOffset']];
        }
        if (!$items) return ['ok'=>true,'suggestions'=>[]];
        $row=['type'=>'object','properties'=>['id'=>['type'=>'integer'],'section'=>['type'=>'string','enum'=>['subjective','objective','assessment','plan','uncertain']]],'required'=>['id','section'],'additionalProperties'=>false];
        $schema=['type'=>'object','properties'=>['suggestions'=>['type'=>'array','items'=>$row]],'required'=>['suggestions'],'additionalProperties'=>false];
        $instructions='For each numbered source quotation, suggest the appropriate veterinary SOAP section using its context. Distinguish an uncertain clinical statement from uncertainty about its section. Do not guess speaker attribution or add medical advice. If the appropriate section or speaker is unclear, choose uncertain. Include every ID exactly once. Return JSON.';
        $input=json_encode(['items'=>$items],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if ($input===false) return ['ok'=>false,'code'=>'invalid_evidence'];
        $response=$this->gateway->structured('scribe',$input,$instructions,'clinical',$schema,true);
        if (!($response['ok']??false)) return ['ok'=>false,'code'=>'placement_unavailable'];
        $mapped=[];
        foreach ($response['data']['suggestions'] as $row) {
            $id=$row['id'];if ($id<1 || $id>count($items) || isset($mapped[$id])) return ['ok'=>false,'code'=>'invalid_mapping'];
            $item=$items[$id-1];$mapped[$id]=['section'=>$row['section'],'quote'=>$item['quote'],'context'=>$item['context'],'sourceOffset'=>$item['sourceOffset'],'reviewRequired'=>true];
        }
        if (count($mapped)!==count($items)) return ['ok'=>false,'code'=>'incomplete_mapping'];
        ksort($mapped);
        return ['ok'=>true,'suggestions'=>array_values($mapped)];
    }
}
