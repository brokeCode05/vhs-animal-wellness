<?php
namespace App\Services\AI;

/** Experimental second-pass comparison, not a guarantee of clinical correctness. */
final class ScribeMeaningReview
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function review(array $sources, array $draft): array
    {
        $sections=['subjective','objective','assessment','plan'];
        $properties=[];
        foreach ($sections as $section) {
            if (!isset($sources[$section],$draft[$section]) || !is_string($sources[$section]) || !is_string($draft[$section])) return ['ok'=>false,'code'=>'missing_section'];
            $properties[$section]=['type'=>'string','enum'=>['equivalent','changed','uncertain']];
        }
        $schema=['type'=>'object','properties'=>$properties,'required'=>$sections,'additionalProperties'=>false];
        $instructions='Independently compare each veterinary SOAP summary with its matching source. Evaluate whether both express the same clinical meaning in both directions. '
            .'Identify any added, omitted, stronger, weaker, substituted, inferred or differently attributed information, including temporal context, severity, certainty, negation, values and instructions. '
            .'Check corrections and retractions carefully: a revised value supersedes an earlier mistaken value for the same event. A range or two current values in place of an explicit correction is changed. If the relationship is unclear, return uncertain. '
            .'Do not assume a similar or plausible statement has the same meaning. Do not add or recommend medical advice. '
            .'Treat a summary as changed or uncertain if it resolves an ambiguity in an action, object, result, completion, prerequisite, timing, or follow-up that the source did not resolve. Compare the literal source meaning, not a plausible clinical interpretation. '
            .'For each section return changed if any clinically meaningful difference exists, uncertain if you cannot confidently rule out a difference, otherwise equivalent. Return JSON.';
        $response=$this->gateway->structured('scribe',json_encode(['sources'=>$sources,'draft'=>$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$instructions,'clinical',$schema,true);
        if (!($response['ok']??false)) {
            $allowed=['invalid_input','disabled','clinical_blocked','privacy_blocked','invalid_json','invalid_schema','provider_unavailable','timeout','transport','rate_limit','http_error','deadline'];
            $reason=$response['provider_failure']??$response['error_code']??'provider_unavailable';
            return ['ok'=>false,'code'=>'meaning_review_unavailable','failure'=>in_array($reason,$allowed,true)?$reason:'provider_unavailable'];
        }
        foreach ($sections as $section) if (($response['data'][$section]??null)!=='equivalent') return ['ok'=>false,'code'=>'meaning_not_verified'];
        return ['ok'=>true,'warning'=>'Automated meaning review can miss errors; doctor review remains required.'];
    }
}
