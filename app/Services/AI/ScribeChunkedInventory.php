<?php
namespace App\Services\AI;

/** Research-only processing manifest; no records or transcript logs are written. */
final class ScribeChunkedInventory
{
    public function __construct(private readonly AiGateway $gateway, private $diagnostics = null) {}

    public function extract(string $transcript, int $chunkBytes): array
    {
        $plan=(new ScribeTranscriptChunker())->plan($transcript,$chunkBytes);
        if (!($plan['ok']??false)) return $plan;
        return $this->process($transcript,$plan['chunks'],[]);
    }

    /** Resume only a previously generated in-memory manifest, never untrusted client input. */
    public function retryFailed(string $transcript, int $chunkBytes, array $previous): array
    {
        $plan=(new ScribeTranscriptChunker())->plan($transcript,$chunkBytes);
        if (!($plan['ok']??false)) return $plan;
        if (!($previous['ok']??false) || ($previous['transcript']??null)!==$transcript || !is_array($previous['chunks']??null) || count($previous['chunks'])!==count($plan['chunks'])) return ['ok'=>false,'code'=>'stale_manifest'];
        foreach ($plan['chunks'] as $index=>$chunk) {
            $old=$previous['chunks'][$index];
            if (($old['id']??null)!==$chunk['id'] || ($old['offset']??null)!==$chunk['offset'] || ($old['length']??null)!==$chunk['length'] || ($old['text']??null)!==$chunk['text'] || !in_array($old['status']??null,['complete','failed'],true)) return ['ok'=>false,'code'=>'stale_manifest'];
        }
        if (!((new ScribeEvidenceDraft())->build($previous)['ok']??false)) return ['ok'=>false,'code'=>'invalid_manifest'];
        return $this->process($transcript,$plan['chunks'],$previous['chunks']);
    }

    private function process(string $transcript, array $plan, array $previous): array
    {
        $chunks=[];$complete=true;$providerBusy=false;
        foreach ($plan as $index=>$chunk) {
            if (($previous[$index]['status']??null)==='complete') { $chunks[]=$previous[$index]; continue; }
            if ($providerBusy) { $chunk['attempts']=0; $chunk['status']='failed'; $chunk['error']='not_attempted'; $chunk['failure']='rate_limit'; $chunks[]=$chunk; $complete=false; continue; }
            // Context remains attributed to its own chunk; quotations must still
            // be exact substrings of the current chunk.
            $before=$plan[$index-1]['text']??'';
            $after=$plan[$index+1]['text']??'';
            $extractor=new ScribeFactInventory($this->gateway);
            $attempts=0; $retryWithWholeSegments=($previous[$index]['failure']??'') === 'invalid_quote';
            do {
                $attempts++;
                $result=$extractor->extract($chunk['text'],$before,$after,$retryWithWholeSegments);
                // Optional in-memory test callback receives bounded metadata only.
                if (is_callable($this->diagnostics)) ($this->diagnostics)([
                    'chunk_id'=>$chunk['id'],'attempt'=>$attempts,
                    'result'=>($result['ok']??false)?'ok':($result['failure']??$result['code']??'unknown'),
                    'providers'=>$this->gateway->providerAttemptDiagnostics(),
                ]);
                $reason=$result['failure']??$result['code']??'';
                $retryable=in_array($reason,['timeout','transport','invalid_json','invalid_schema','empty_response','invalid_quote','invalid_segment_mapping','incomplete_inventory'],true);
                if ($reason==='invalid_quote') $retryWithWholeSegments=true;
                if (($result['ok']??false) || !$retryable || $attempts>=2) break;
            } while (true);
            $chunk['attempts']=$attempts;
            $chunk['status']=($result['ok']??false)?'complete':'failed';
            if ($chunk['status']==='complete') {
                $chunk['segments']=$result['segments'];
                foreach ($chunk['segments'] as &$segment) $segment['offset']+=$chunk['offset'];
                unset($segment);
            } else {
                $complete=false;$chunk['error']=$result['code']??'extraction_unavailable'; $chunk['failure']=$result['failure']??$chunk['error'];
                if ($chunk['failure']==='rate_limit') $providerBusy=true;
            }
            $chunks[]=$chunk;
        }
        return ['ok'=>true,'complete'=>$complete,'transcript'=>$transcript,'chunks'=>$chunks,
            'warning'=>'Research preview. Review all source text; neighboring context is limited and model classification can be wrong.'];
    }
}
