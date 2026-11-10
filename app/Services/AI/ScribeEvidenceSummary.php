<?php
namespace App\Services\AI;

/** Research-only composition; not an approved clinical note or portal endpoint. */
final class ScribeEvidenceSummary
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function generate(array $inventory): array
    {
        $evidence=(new ScribeEvidenceDraft())->build($inventory);
        if (!($evidence['ok']??false)) return $evidence;
        $result=['ok'=>true,'complete'=>$evidence['complete'],'transcript'=>$evidence['transcript'],
            'evidence'=>$evidence['sections'],'attention'=>$evidence['attention'],'draft'=>null,'draftCoverage'=>'not_assessed',
            'warning'=>'Experimental preview. Verify every point, source context and speaker against the full transcript.'];
        if (!$evidence['complete']) { $result['code']='incomplete_inventory'; return $result; }
        $sources=[];$sourceCategories=[];
        foreach ($evidence['sections'] as $section=>$points) foreach ($points as $point) $sourceCategories[$point['sourceOffset']][$section]=true;
        foreach ($evidence['sections'] as $section=>$points) {
            $passages=[];$seen=[];
            foreach ($points as $point) {
                // A mixed segment is evidence for review, not a whole passage
                // to copy into every section. Retain the complete context in
                // attention and in the source link; only the assigned excerpt
                // goes to each section's draft generator.
                $shared=count($sourceCategories[$point['sourceOffset']])>1;
                $passage=trim($shared ? $point['text'] : $point['source']);
                // Exact repeats are shown once to the summarizer; all original
                // occurrences remain in the transcript and evidence for review.
                if (!isset($seen[$passage])) { $seen[$passage]=true; $passages[]=$passage; }
            }
            $sources[$section]=$passages ? implode(' ',$passages) : 'Not provided.';
        }
        $result['sources']=$sources;
        if (count(array_filter($sources,static fn($value)=>$value!=='Not provided.'))===0) { $result['code']='no_evidence';return $result; }
        $assigned=[];$context=[];
        foreach ($evidence['sections'] as $section=>$points) {
            $assigned[$section]=array_values(array_unique(array_map(static fn($point)=>$point['text'],$points)));
            $context[$section]=array_values(array_unique(array_map(static fn($point)=>trim($point['source']),$points)));
        }
        $summary=(new ScribeGroundedSummary($this->gateway))->generate($sources,$assigned,$context,is_array($inventory['summaryCheckpoint']??null)?$inventory['summaryCheckpoint']:[]);
        if (!($summary['ok']??false)) { if (is_array($summary['checkpoint']??null)) $result['summaryCheckpoint']=$summary['checkpoint']; $result['code']='summary_unavailable'; $result['summaryFailure']=$summary['code']??'unknown'; $result['summarySection']=$summary['section']??null; $result['summarySectionLength']=$summary['sectionLength']??null; $result['summaryCause']=$summary['cause']??null; $result['summaryAuditCode']=$summary['auditCode']??null; $result['summaryReviewSources']=$summary['reviewSources']??[]; $result['summaryReviewCode']=$summary['reviewCode']??null; $result['summaryProviderFailure']=$summary['failure']??null; return $result; }
        // Link model-audited claims back to original passages. A link is not
        // proof of meaning or speaker; ambiguous locations require review.
        $claimLinks=[];$audit=$summary['audit'];
        foreach ($audit['claims'] as $claim) {
            $row=$audit['audit']['claims'][array_search($claim['id'],array_column($audit['audit']['claims'],'id'),true)];
            $references=[];$ambiguous=false;
            foreach ($row['source_ids'] as $sourceId) {
                $source=$audit['sources'][$sourceId-1];$locations=[];
                foreach ($evidence['sections'][$claim['section']] as $point) {
                    $pos=strpos($point['source'],$source['text']);
                    if ($pos===false) continue;
                    if (strpos($point['source'],$source['text'],$pos+1)!==false) { $ambiguous=true; continue; }
                    $offset=$point['sourceOffset']+$pos;
                    $locations[$offset]=['offset'=>$offset,'text'=>$source['text'],'context'=>$point['source'],'contextOffset'=>$point['sourceOffset']];
                }
                if (count($locations)!==1) { $ambiguous=true; continue; }
                $ref=reset($locations);$references[$ref['offset']]=$ref;
            }
            $claimLinks[]=['text'=>$claim['text'],'section'=>$claim['section'],'references'=>array_values($references),'status'=>$ambiguous?'needs_review':'linked'];
            if ($ambiguous) $result['attention'][]=['reason'=>'ambiguous_claim_source','text'=>$claim['text'],'section'=>$claim['section']];
        }
        $result['claimLinks']=$claimLinks;
        // A passage used across sections may contain mixed information or a
        // classification error. Never silently decide which section is right.
        $contexts=[];
        foreach ($claimLinks as $link) foreach ($link['references'] as $ref) {
            $key=(string)$ref['contextOffset'];
            if (!isset($contexts[$key])) $contexts[$key]=['source'=>$ref['context'],'offset'=>$ref['contextOffset'],'sections'=>[]];
            $contexts[$key]['sections'][$link['section']]=true;
        }
        foreach ($contexts as $context) if (count($context['sections'])>1) $result['attention'][]=[
            'reason'=>'source_used_in_multiple_sections','source'=>$context['source'],'offset'=>$context['offset'],'sections'=>array_keys($context['sections'])
        ];
        // A linked passage is not proof it was faithfully summarized. Unlinked
        // source segments must remain visible even when processing succeeded.
        $linkedRanges=[];
        foreach ($claimLinks as $link) foreach ($link['references'] as $ref) $linkedRanges[]=[$ref['offset'],$ref['offset']+strlen($ref['text'])];
        $unlinked=[];
        foreach ($inventory['chunks'] as $chunk) foreach ($chunk['segments'] as $segment) {
            $linked=count($segment['quotes'])>0;
            foreach ($segment['quotes'] as $quote) {
                $quoted=trim($quote['text']); $at=$quoted === '' ? false : strpos($segment['text'],$quoted);
                $covered=false;
                if (($quote['category']??'uncertain')!=='uncertain' && $at!==false) {
                    $start=$segment['offset']+$at; $end=$start+strlen($quoted);
                    foreach ($linkedRanges as [$left,$right]) if ($start >= $left && $end <= $right) { $covered=true; break; }
                }
                if (!$covered) { $linked=false; break; }
            }
            if (trim($segment['text'])!=='' && !$linked) {
                $quotes=$segment['quotes'];
                $uncertain=array_values(array_filter($quotes,static fn($quote)=>$quote['category']==='uncertain'));
                $reason=$uncertain ? 'uncertain_classification' : (!$quotes ? 'no_extracted_evidence' : 'not_linked_to_draft');
                $item=['text'=>$segment['text'],'offset'=>$segment['offset'],'reason'=>$reason,'quotes'=>$quotes];
                $unlinked[]=$item;
                $result['attention'][]=['reason'=>$reason,'source'=>$segment['text'],'offset'=>$segment['offset'],'quotes'=>$quotes];
            }
        }
        $result['unlinkedSources']=$unlinked;
        $result['draftCoverage']=$unlinked ? 'unlinked_sources' : 'unverified';
        // Suggestions are separate from the draft and always require doctor review.
        $placement=(new ScribeUncertainPlacement($this->gateway))->suggest($evidence['attention']);
        $result['placementSuggestions']=($placement['ok']??false) ? $placement['suggestions'] : [];
        if (!($placement['ok']??false)) $result['attention'][]=['reason'=>'placement_suggestions_unavailable'];
        $result['draft']=$summary['draft'];$result['code']='review_required';
        return $result;
    }
}
