<?php
namespace App\Services\AI;

/** Lossless source passages for review; boundaries do not establish clinical meaning. */
final class ScribeSourcePassages
{
    public function plan(string $transcript): array
    {
        $base=(new ScribeTranscriptChunker())->plan($transcript,1200);
        if (!($base['ok']??false)) return $base;
        $sentences=[];$leading='';$leadingOffset=0;
        foreach ($base['chunks'] as $chunk) {
            $parts=preg_split('/(?<=[.!?])(?=\s)|(?<=\n)/u',$chunk['text'],-1,PREG_SPLIT_NO_EMPTY|PREG_SPLIT_OFFSET_CAPTURE);
            if ($parts===false) return ['ok'=>false,'code'=>'invalid_input'];
            foreach ($parts as [$text,$offset]) {
                $absolute=$chunk['offset']+$offset;
                if (trim($text)==='') {
                    if ($sentences) $sentences[count($sentences)-1]['text'].=$text;
                    else { if ($leading==='') $leadingOffset=$absolute; $leading.=$text; }
                    continue;
                }
                $sentences[]=['text'=>$leading.$text,'offset'=>$leading!=='' ? $leadingOffset : $absolute];
                $leading='';
            }
        }
        // Finer punctuation boundaries are source locations, not clinical classifications.
        // Keep the complete original sentence available beside every selected part.
        $pieces=[];
        foreach ($sentences as $sentence) {
            $parts=preg_split('/(?<=[,;])(?=\s)/u',$sentence['text'],-1,PREG_SPLIT_NO_EMPTY|PREG_SPLIT_OFFSET_CAPTURE);
            if ($parts===false) return ['ok'=>false,'code'=>'invalid_input'];
            $contextEnd=$sentence['offset']+strlen($sentence['text']);
            foreach ($parts as [$text,$offset]) {
                if (trim($text)==='' && $pieces) { $pieces[count($pieces)-1]['text'].=$text; continue; }
                // Long punctuation-free speech is split at word boundaries for review.
                // If one uninterrupted token is too long, keep it intact instead of losing it.
                $subparts=strlen($text)>240 ? (new ScribeTranscriptChunker())->plan($text,240) : null;
                if ($subparts && ($subparts['ok']??false)) {
                    foreach ($subparts['chunks'] as $part) $pieces[]=['text'=>$part['text'],'offset'=>$sentence['offset']+$offset+$part['offset'],'contextOffset'=>$sentence['offset'],'contextEnd'=>$contextEnd];
                } else $pieces[]=['text'=>$text,'offset'=>$sentence['offset']+$offset,'contextOffset'=>$sentence['offset'],'contextEnd'=>$contextEnd];
            }
        }
        // Bound reference overhead for long transcripts while preserving all bytes.
        $groupSize=max(1,(int)ceil(count($pieces)/128));
        $chunks=[];
        foreach (array_chunk($pieces,$groupSize) as $group) {
            $text=implode('',array_column($group,'text'));
            $contextOffset=$group[0]['contextOffset'];
            $contextEnd=$group[count($group)-1]['contextEnd'];
            $context=substr($transcript,$contextOffset,$contextEnd-$contextOffset);
            $chunks[]=['id'=>count($chunks)+1,'offset'=>$group[0]['offset'],'length'=>strlen($text),'text'=>$text,
                'context'=>$context,'contextOffset'=>$contextOffset,'status'=>'pending'];
        }
        if (implode('',array_column($chunks,'text'))!==$transcript) return ['ok'=>false,'code'=>'coverage_error'];
        return ['ok'=>true,'chunks'=>$chunks];
    }
}
