<?php
namespace App\Services\AI;

/** Research only: structural checks on an independent claim/source audit. */
final class ScribeClaimAudit
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function audit(array $sources, array $draft): array
    {
        $keys=['subjective','objective','assessment','plan'];$sourceItems=[];$claimItems=[];
        foreach($keys as $section) {
            if(!isset($sources[$section],$draft[$section]) || !is_string($sources[$section]) || !is_string($draft[$section])) return ['ok'=>false,'code'=>'missing_section'];
            foreach ([['text'=>$sources[$section],'target'=>'source'],['text'=>$draft[$section],'target'=>'claim']] as $item) {
                $text=trim($item['text']);if($text==='' || $text==='Not provided.') continue;
                $parts=preg_split('/(?<=[.!?;])\s+|\n+/u',$text,-1,PREG_SPLIT_NO_EMPTY) ?: [];
                foreach($parts as $part) {
                    if($item['target']==='source') $sourceItems[]=['id'=>count($sourceItems)+1,'section'=>$section,'text'=>trim($part)];
                    else $claimItems[]=['id'=>count($claimItems)+1,'section'=>$section,'text'=>trim($part)];
                }
            }
        }
        // Retrying the identical input cannot change this structural limit.
        if(count($sourceItems)>100 || count($claimItems)>100) return ['ok'=>false,'code'=>'audit_too_many_statements'];
        if((!$sourceItems && $claimItems) || ($sourceItems && !$claimItems)) return ['ok'=>false,'code'=>'invalid_input'];
        $intList=['type'=>'array','items'=>['type'=>'integer']];
        $claimSchema=['type'=>'object','properties'=>['id'=>['type'=>'integer'],'source_ids'=>$intList,'supported'=>['type'=>'boolean']], 'required'=>['id','source_ids','supported'],'additionalProperties'=>false];
        $sourceSchema=['type'=>'object','properties'=>['id'=>['type'=>'integer'],'claim_ids'=>$intList,'relevant'=>['type'=>'boolean'],'covered'=>['type'=>'boolean']], 'required'=>['id','claim_ids','relevant','covered'],'additionalProperties'=>false];
        $schema=['type'=>'object','properties'=>['claims'=>['type'=>'array','items'=>$claimSchema],'sources'=>['type'=>'array','items'=>$sourceSchema]],'required'=>['claims','sources'],'additionalProperties'=>false];
        $instructions='Audit a veterinary SOAP preview against numbered source statements. For every claim ID, identify source IDs in the same SOAP section and say if they fully support the claim. For every source ID, say whether clinically relevant and if so whether its entire meaning is covered by claim IDs. Check omissions, negation, uncertainty, timing, speaker attribution, side, measurements and instructions. Never infer medical advice. If uncertain mark unsupported or uncovered. Include every ID exactly once. Return JSON.';
        $instructions.=' Check whether a stated correction replaces an earlier value; never treat an explicit correction as a range or two concurrent values. When the source clearly corrects an earlier mistaken value, the corrected value alone may cover that source; do not require repeating the superseded mistake. Preserve uncertainty and do not assume an apparent change is a correction. Mark changed meanings unsupported or uncovered.';
        $answer=$this->gateway->structured('scribe',json_encode(['sources'=>$sourceItems,'claims'=>$claimItems],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$instructions,'clinical',$schema,true);
        if(!($answer['ok']??false)) {
            $allowed=['invalid_input','disabled','clinical_blocked','privacy_blocked','invalid_json','invalid_schema','provider_unavailable','timeout','transport','rate_limit','http_error','deadline'];
            $reason=$answer['provider_failure']??$answer['error_code']??'provider_unavailable';
            return ['ok'=>false,'code'=>'audit_unavailable','failure'=>in_array($reason,$allowed,true)?$reason:'provider_unavailable'];
        }
        $result=$answer['data'];$claimMap=[];$sourceMap=[];$reviewSources=[];
        foreach($result['claims'] as $row) {
            $id=$row['id'];if($id<1 || $id>count($claimItems) || isset($claimMap[$id]) || !$row['supported'] || !$row['source_ids']) return ['ok'=>false,'code'=>'claim_unverified'];
            $refs=[];foreach($row['source_ids'] as $ref) { if($ref<1 || $ref>count($sourceItems) || isset($refs[$ref]) || $sourceItems[$ref-1]['section']!==$claimItems[$id-1]['section']) return ['ok'=>false,'code'=>'invalid_source_reference']; $refs[$ref]=true; }
            $claimMap[$id]=$refs;
        }
        foreach($result['sources'] as $row) {
            $id=$row['id'];if($id<1 || $id>count($sourceItems) || isset($sourceMap[$id])) return ['ok'=>false,'code'=>'invalid_source_audit'];
            if($row['relevant'] && (!$row['covered'] || !$row['claim_ids'])) return ['ok'=>false,'code'=>'source_uncovered','reviewSources'=>[$sourceItems[$id-1]]];
            $refs=[];foreach($row['claim_ids'] as $ref) { if($ref<1 || $ref>count($claimItems) || isset($refs[$ref]) || $claimItems[$ref-1]['section']!==$sourceItems[$id-1]['section'] || !isset($claimMap[$ref][$id])) return ['ok'=>false,'code'=>'invalid_claim_reference']; $refs[$ref]=true; }
            if (!$row['relevant'] || !$row['covered'] || !$refs) $reviewSources[]=$sourceItems[$id-1];
            $sourceMap[$id]=$refs;
        }
        if(count($claimMap)!==count($claimItems) || count($sourceMap)!==count($sourceItems)) return ['ok'=>false,'code'=>'incomplete_audit'];
        foreach($claimMap as $claim=>$refs) foreach($refs as $source=>$unused) if(!isset($sourceMap[$source][$claim])) return ['ok'=>false,'code'=>'inconsistent_references'];
        return ['ok'=>true,'claims'=>$claimItems,'sources'=>$sourceItems,'audit'=>$result,'reviewSources'=>$reviewSources,'warning'=>'Research audit only; model judgments can be wrong.'];
    }
}
