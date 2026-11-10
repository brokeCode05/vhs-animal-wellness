<?php
namespace App\Services\AI;

/** Lossless chunk planning only. A chunk is never treated as processed here. */
final class ScribeTranscriptChunker
{
    public function plan(string $transcript, int $maxBytes): array
    {
        if (trim($transcript)==='') return ['ok'=>false,'code'=>'empty_transcript'];
        if ($maxBytes<1 || !mb_check_encoding($transcript,'UTF-8')) return ['ok'=>false,'code'=>'invalid_input'];
        if (preg_match_all('/\S+\s*|\s+/u',$transcript,$matches,PREG_OFFSET_CAPTURE)===false) return ['ok'=>false,'code'=>'invalid_input'];
        $chunks=[];$current='';$offset=0;$lastBoundary=null;
        foreach ($matches[0] as [$part,$position]) {
            if (strlen($part)>$maxBytes) return ['ok'=>false,'code'=>'segment_exceeds_limit','offset'=>$position];
            while ($current!=='' && strlen($current)+strlen($part)>$maxBytes) {
                $split=($lastBoundary!==null && $lastBoundary>0) ? $lastBoundary : strlen($current);
                $piece=substr($current,0,$split);
                $chunks[]=['id'=>count($chunks)+1,'offset'=>$offset,'length'=>strlen($piece),'text'=>$piece,'status'=>'pending'];
                $current=substr($current,$split);$offset+=$split;$lastBoundary=null;
            }
            if ($current==='') $offset=$position;
            $current.=$part;
            // Prefer sentence or turn boundaries without changing source text.
            if (preg_match('/(?:[.!?][\x22\x27\x{2019}\x{201d}]?\s+|\n)$/u',$part)) $lastBoundary=strlen($current);
        }
        if ($current!=='') $chunks[]=['id'=>count($chunks)+1,'offset'=>$offset,'length'=>strlen($current),'text'=>$current,'status'=>'pending'];
        if (implode('',array_column($chunks,'text'))!==$transcript) return ['ok'=>false,'code'=>'coverage_error'];
        return ['ok'=>true,'chunks'=>$chunks];
    }
}
