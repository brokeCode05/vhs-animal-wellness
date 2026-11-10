<?php
namespace App\Services\AI;

/** Additional advisory check; it does not prove that the draft is accurate. */
final class ScribeCorrectionReview
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function review(array $passages, array $draft): array
    {
        $schema=['type'=>'object','properties'=>[
            'source_corrections'=>['type'=>'string'],
            'draft_comparison'=>['type'=>'string'],
            'verdict'=>['type'=>'string','enum'=>['consistent','inconsistent','uncertain']],
        ],'required'=>['source_corrections','draft_comparison','verdict'],'additionalProperties'=>false];
        $instructions='Compare the transcript and note only for factual self-corrections. First identify exactly what was originally said and what replaced it, in source_corrections. If the speaker was uncertain or described distinct events, say so instead of inventing a correction. Next explain in draft_comparison whether the note preserves the final corrected fact with the same precision and uncertainty. If a speaker explicitly corrects a number, a note giving both numbers as a range changes a definite value into uncertainty; mark inconsistent. Changes in time, measurement, body side, negation or test status matter. Different visits and true ranges are not corrections. If there are no source corrections, use consistent. If a relevant correction is missing or changed use inconsistent. If genuinely unclear use uncertain. Do not provide medical advice. Return JSON.';
        $payload=json_encode(['transcript'=>$passages,'draft'=>$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if ($payload===false) return ['ok'=>false];
        $result=$this->gateway->structured('scribe',$payload,$instructions,'clinical',$schema,true,true);
        if (!($result['ok']??false)) return ['ok'=>false];
        return ['ok'=>true,'verdict'=>$result['data']['verdict']];
    }
}
