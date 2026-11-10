<?php
namespace App\Services\AI;

/** Experimental evidence view: extracts source text only; never saves a note. */
final class ScribeEvidenceDraft
{
    public function build(array $inventory): array
    {
        if (!($inventory['ok']??false) || !is_string($inventory['transcript']??null) || !is_array($inventory['chunks']??null)) return ['ok'=>false,'code'=>'invalid_inventory'];
        $transcript=$inventory['transcript'];$sections=['subjective'=>[],'objective'=>[],'assessment'=>[],'plan'=>[]];
        $attention=[];$expected=0;$seen=[];$previousSegment=null;
        foreach ($inventory['chunks'] as $chunk) {
            if (!isset($chunk['offset'],$chunk['length'],$chunk['text'],$chunk['status']) || !is_int($chunk['offset']) || !is_int($chunk['length']) || $chunk['offset']!==$expected || strlen($chunk['text'])!==$chunk['length'] || substr($transcript,$expected,$chunk['length'])!==$chunk['text']) return ['ok'=>false,'code'=>'invalid_coverage'];
            $expected+=$chunk['length'];
            if ($chunk['status']!=='complete') { $attention[]=['reason'=>'chunk_incomplete','source'=>$chunk['text'],'offset'=>$chunk['offset']]; $previousSegment=null; continue; }
            if (!is_array($chunk['segments']??null)) return ['ok'=>false,'code'=>'invalid_segments'];
            $segmentExpected=$chunk['offset'];
            foreach ($chunk['segments'] as $segment) {
                if (!isset($segment['text'],$segment['offset'],$segment['quotes']) || !is_string($segment['text']) || !is_int($segment['offset']) || !is_array($segment['quotes']) || $segment['offset']!==$segmentExpected || $segment['offset']+strlen($segment['text'])>$expected || substr($transcript,$segment['offset'],strlen($segment['text']))!==$segment['text']) return ['ok'=>false,'code'=>'invalid_segment'];
                $segmentExpected+=strlen($segment['text']);
                // A short answer can depend on the preceding question. Keep
                // the exact adjacent text together across chunk boundaries.
                $context=$segment['text'];$contextOffset=$segment['offset'];
                if ($previousSegment!==null && preg_match('/\?\s*$/u',$previousSegment['text']) && $previousSegment['offset']+strlen($previousSegment['text'])===$segment['offset']) {
                    $context=$previousSegment['text'].$segment['text'];$contextOffset=$previousSegment['offset'];
                }
                // A selected quote does not establish that the remaining context is irrelevant.
                $attention[]=['reason'=>'context_requires_review','source'=>$segment['text'],'offset'=>$segment['offset']];
                foreach ($segment['quotes'] as $quote) {
                    if (!is_array($quote) || !is_string($quote['text']??null) || trim($quote['text'])==='' || !is_string($quote['category']??null)) return ['ok'=>false,'code'=>'invalid_quote'];
                    $pos=strpos($segment['text'],$quote['text']);
                    if ($pos===false) return ['ok'=>false,'code'=>'invalid_quote'];
                    if (strpos($segment['text'],$quote['text'],$pos+1)!==false) { $attention[]=['reason'=>'ambiguous_source','source'=>$segment['text'],'offset'=>$segment['offset']]; continue; }
                    $offset=$segment['offset']+$pos;$key=$offset.':'.strlen($quote['text']).':'.$quote['category'];
                    if (isset($seen[$key])) continue;$seen[$key]=true;
                    $point=['text'=>$quote['text'],'source'=>$context,'offset'=>$offset,'sourceOffset'=>$contextOffset];
                    if (!array_key_exists($quote['category'],$sections)) { $attention[]=['reason'=>'uncertain_category']+$point; continue; }
                    $sections[$quote['category']][]=$point;
                }
                $previousSegment=['text'=>$segment['text'],'offset'=>$segment['offset']];
            }
            if ($segmentExpected!==$expected) return ['ok'=>false,'code'=>'invalid_segments'];
        }
        if ($expected!==strlen($transcript)) return ['ok'=>false,'code'=>'invalid_coverage'];
        return ['ok'=>true,'complete'=>($inventory['complete']??false)===true && !array_filter($inventory['chunks'],static fn($c)=>$c['status']!=='complete'),'sections'=>$sections,'attention'=>$attention,'transcript'=>$transcript,'warning'=>'Source excerpts are not verified clinical facts. Check context and speaker before using.'];
    }
}
