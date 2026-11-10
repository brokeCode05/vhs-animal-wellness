<?php
namespace App\Services\AI;

/** Experimental, review-only paraphrasing; never writes a clinical record. */
final class ScribeGroundedSummary
{
    public function __construct(private readonly AiGateway $gateway) {}

    public function generate(array $sources, array $sectionEvidence = [], array $context = [], array $checkpoint = []): array
    {
        $keys=['subjective','objective','assessment','plan'];
        $properties=[];
        foreach ($keys as $key) {
            if (!isset($sources[$key]) || !is_string($sources[$key]) || trim($sources[$key])==='') return ['ok'=>false,'code'=>'missing_source'];
            $properties[$key]=['type'=>'string'];
        }
        [$sectionEvidence,$context]=$this->deduplicateInputs($sources,$sectionEvidence,$context);
        $encoded=json_encode($sectionEvidence ? ['source_context'=>$sources,'section_evidence'=>$sectionEvidence,'surrounding_context'=>$context] : $sources,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
        if ($encoded===false) return ['ok'=>false,'code'=>'invalid_source'];
        // Large summaries are processed one SOAP section at a time. The audit
        // for each section still receives that section's complete source.
        $budget=max(2500,min(8000,(int)config('ai.scribe_summary_input_bytes',7500)));
        if (strlen($encoded)>$budget) return $this->generateBySection($sources,$sectionEvidence,$context,$checkpoint);
        $schema=['type'=>'object','properties'=>$properties,'required'=>$keys,'additionalProperties'=>false];
        $instructions='Summarize the supplied veterinary SOAP source sections in the same language, including Filipino or Taglish. '
            .'Use concise clinical note wording: combine related facts, remove repetition and conversational phrasing, and prefer short phrases when clear. Preserve every clinically relevant fact, uncertainty, negation, timing, speaker attribution, values, and veterinarian instructions. Do not omit meaningful facts to meet a length target. '
            .'When a speaker explicitly corrects an earlier value or time, preserve the correction as a correction: the revised value supersedes the earlier one for that same event. Never turn an explicit correction into a range or two simultaneous values. If the relation is unclear, retain the ambiguity. '
            .'Do not add medical advice, diagnoses, treatment, recommendations or facts. Only document advice explicitly given in the source. '
            .'Preserve ambiguity in what was requested, obtained, completed or returned and in the timing of actions. Do not assume an unstated result, test outcome, diagnosis, reason, condition, or prerequisite, even if it seems likely. When the source is ambiguous, retain its wording rather than resolving the ambiguity. '
            .'Write clinical note statements rather than a transcript. Do not reproduce speaker labels, conversational filler, or questions verbatim. Preserve a clinically relevant concern as an attributed concern, and preserve answers only with the context needed to understand them; do not infer an answer. Keep clinically relevant negation, uncertainty, corrections and timing. Do not invent or add medical advice. Keep facts in their original sections. Do not guess. Return Not provided. for a section with no information. Return JSON.';
        $instructions.=' Keep the note concise. Subjective may use up to 2000 characters when needed; objective and plan up to 1000, assessment up to 800. Never truncate a sentence or omit clinically relevant facts to meet a limit. If the information cannot fit, retain the needed facts for doctor review.';
        $payload=$sources;
        if ($sectionEvidence) {
            $instructions.=' The section_evidence entries identify which excerpts were assigned to each section. Use surrounding_context to interpret questions, answers, speaker turns, negations and corrections; do not treat it as permission to add unrelated facts into a section. Keep qualifiers and never guess speaker attribution. If context is insufficient, do not infer.';
            $payload=['source_context'=>$sources,'section_evidence'=>$sectionEvidence,'surrounding_context'=>$context];
        }
        // Retry state is encrypted and bound to the doctor, consultation and
        // transcript by the controller. Bind it again to this exact prompt input.
        $fingerprint=hash('sha256',json_encode(['summary-stages-v3',config('ai.model'),config('ai.groq_model'),$payload],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
        $saved=($checkpoint['stageFingerprint']??null)===$fingerprint ? $checkpoint : [];
        $draft=$saved['draft']??null;
        for ($attempt=0; $attempt<2; $attempt++) {
            $requestInstructions=$instructions.($attempt ? ' The previous response exceeded a field limit. Rewrite more concisely while preserving every clinically relevant detail and uncertainty. Do not invent facts.' : '');
            $answer=is_array($draft) && $attempt===0 ? ['ok'=>true,'data'=>$draft] : $this->gateway->structured('scribe',json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$requestInstructions,'clinical',$schema,true);
            if (!($answer['ok']??false)) {
                $allowed=['invalid_input','disabled','clinical_blocked','privacy_blocked','invalid_json','invalid_schema','provider_unavailable','timeout','transport','rate_limit','http_error','deadline'];
                $reason=$answer['provider_failure']??$answer['error_code']??'provider_unavailable';
                return ['ok'=>false,'code'=>'generator_unavailable','failure'=>in_array($reason,$allowed,true)?$reason:'provider_unavailable'];
            }
            $draft=$answer['data'];$oversized=null;
            foreach ($keys as $key) {
                $draft[$key]=trim($draft[$key]);$length=mb_strlen($draft[$key]);
                if ($draft[$key]==='') return ['ok'=>false,'code'=>'invalid_section','section'=>$key,'sectionLength'=>$length];
                if ((trim($sources[$key])==='Not provided.')!==($draft[$key]==='Not provided.')) return ['ok'=>false,'code'=>'empty_section_mismatch','section'=>$key];
                if ($length>($key==='subjective'?2000:($key==='assessment'?800:1000))) $oversized=['ok'=>false,'code'=>'invalid_section','section'=>$key,'sectionLength'=>$length];
            }
            if ($oversized===null) break;
            if ($attempt===1 || is_array($saved['draft']??null)) return $oversized;
        }
        $stageCheckpoint=['stageFingerprint'=>$fingerprint,'draft'=>$draft];
        $audit=$saved['audit']??null;
        if (!is_array($audit) || !($audit['ok']??false)) $audit=(new ScribeClaimAudit($this->gateway))->audit($sources,$draft);
        if (!($audit['ok']??false)) {
            $result=['ok'=>false,'code'=>'audit_failed','auditCode'=>$audit['code']??'unknown','failure'=>$audit['failure']??null,'reviewSources'=>$audit['reviewSources']??[]];
            if (($audit['code']??'')==='audit_unavailable') $result['checkpoint']=$stageCheckpoint;
            return $result;
        }
        $stageCheckpoint['audit']=$audit;
        $meaning=(new ScribeMeaningReview($this->gateway))->review($sources,$draft);
        if (!($meaning['ok']??false)) {
            $result=['ok'=>false,'code'=>'meaning_review_failed','reviewCode'=>$meaning['code']??'unknown','failure'=>$meaning['failure']??null];
            if (($meaning['code']??'')==='meaning_review_unavailable') $result['checkpoint']=$stageCheckpoint;
            return $result;
        }
        return ['ok'=>true,'draft'=>$draft,'sources'=>$sources,'audit'=>$audit,
            'warning'=>'Experimental AI draft: compare every section and all flagged statements with the full transcript. Automated checks can be wrong.'];
    }

    /** Remove only evidence or context already represented by exact source text. */
    private function deduplicateInputs(array $sources, array $sectionEvidence, array $context): array
    {
        $keys=['subjective','objective','assessment','plan'];
        // Do not send an identical passage twice. A context passage is removed
        // only when its exact text already appears in the same section source.
        // Mixed or additional context stays intact for interpretation.
        foreach ($keys as $key) {
            if (!isset($context[$key]) || !is_array($context[$key])) continue;
            $context[$key]=array_values(array_filter($context[$key],static function ($passage) use ($sources,$key) {
                return !is_string($passage) || trim($passage)==='' || !str_contains($sources[$key],trim($passage));
            }));
        }
        // If every evidence entry is exactly the corresponding complete
        // section and there is no extra context, sending both copies adds no
        // attribution or context. Keep evidence whenever it adds information.
        if ($sectionEvidence) {
            $redundant=true;
            foreach ($keys as $key) {
                $entries=$sectionEvidence[$key]??[];
                $nearby=$context[$key]??[];
                if (!is_array($entries) || !is_array($nearby) || $nearby) {
                    $redundant=false; break;
                }
                // Multiple exact evidence passages may together be identical
                // to the section source. Only remove the second copy when
                // order, punctuation and every word are preserved.
                if (trim($sources[$key])==='Not provided.') {
                    if ($entries!==[]) { $redundant=false; break; }
                } else {
                    if (!$entries || count(array_filter($entries, 'is_string'))!==count($entries)) { $redundant=false; break; }
                    $joined=preg_replace('/\s+/u',' ',trim(implode(' ',array_map('trim',$entries))));
                    $source=preg_replace('/\s+/u',' ',trim($sources[$key]));
                    if ($joined===null || $source===null || $joined!==$source) { $redundant=false; break; }
                }
            }
            if ($redundant) { $sectionEvidence=[]; $context=[]; }
        }
        return [$sectionEvidence,$context];
    }

    private function generateBySection(array $sources, array $sectionEvidence, array $context, array $checkpoint): array
    {
        $keys=['subjective','objective','assessment','plan'];
        $draft=array_fill_keys($keys,'Not provided.');
        $audit=['ok'=>true,'claims'=>[],'sources'=>[],'audit'=>['claims'=>[],'sources'=>[]],'reviewSources'=>[]];
        $fingerprint=hash('sha256',json_encode(['summary-checkpoint-v7',config('ai.model'),config('ai.groq_model'),$sources,$sectionEvidence,$context],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
        $saved=($checkpoint['fingerprint']??null)===$fingerprint && is_array($checkpoint['sections']??null) ? $checkpoint['sections'] : [];
        $completed=[];
        // Pack whole SOAP sections into bounded groups. No source, evidence or
        // surrounding context is shortened, and each group gets both audits.
        $budget=max(2500,min(8000,(int)config('ai.scribe_summary_input_bytes',7500)));
        $groups=[]; $group=[];
        $buildGroup=function (array $sections) use ($keys,$sources,$sectionEvidence,$context): array {
            $single=array_fill_keys($keys,'Not provided.'); $evidence=[]; $nearby=[];
            foreach ($sections as $section) {
                $single[$section]=$sources[$section];
                if (isset($sectionEvidence[$section])) $evidence[$section]=$sectionEvidence[$section];
                if (isset($context[$section])) $nearby[$section]=$context[$section];
            }
            // Decide group size using the same exact-deduplication rules as
            // generate(), otherwise repeated evidence can trigger fragmentation.
            [$evidence,$nearby]=$this->deduplicateInputs($single,$evidence,$nearby);
            $encoded=json_encode($evidence ? ['source_context'=>$single,'section_evidence'=>$evidence,'surrounding_context'=>$nearby] : $single,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
            return [$single,$evidence,$nearby,$encoded];
        };
        foreach ($keys as $section) {
            if (trim($sources[$section])==='Not provided.') continue;
            $candidate=[...$group,$section];
            [, , , $encoded]=$buildGroup($candidate);
            if ($encoded===false) return ['ok'=>false,'code'=>'invalid_source'];
            if (strlen($encoded)>$budget) {
                if (!$group) return $this->generateByFragments($sources,$sectionEvidence,$context,$checkpoint,$section);
                $groups[]=$group;
                $group=[$section];
                [, , , $encoded]=$buildGroup($group);
                if ($encoded===false || strlen($encoded)>$budget) return $this->generateByFragments($sources,$sectionEvidence,$context,$checkpoint,$section);
            } else $group=$candidate;
        }
        if ($group) $groups[]=$group;
        foreach ($groups as $group) {
            $section=implode('+',$group);
            [$single,$singleEvidence,$singleContext]=$buildGroup($group);
            $result=$saved[$section]??null;
            if (!is_array($result) || !($result['ok']??false) || ($result['sources']??null)!==$single || !is_array($result['draft']??null) || !is_array($result['audit']['claims']??null) || !is_array($result['audit']['sources']??null) || !is_array($result['audit']['audit']['claims']??null) || !is_array($result['audit']['audit']['sources']??null) || !is_array($result['audit']['reviewSources']??null)) {
                $partial=(($checkpoint['fingerprint']??null)===$fingerprint && ($checkpoint['partialGroup']??null)===$section && is_array($checkpoint['partial']??null)) ? $checkpoint['partial'] : [];
                $result=$this->generate($single,$singleEvidence,$singleContext,$partial);
            }
            if (!($result['ok']??false)) return ['ok'=>false,'code'=>'section_summary_failed','section'=>$result['section']??$section,'sectionLength'=>$result['sectionLength']??null,'cause'=>$result['code']??'unknown','auditCode'=>$result['auditCode']??null,'reviewCode'=>$result['reviewCode']??null,'failure'=>$result['failure']??null,'reviewSources'=>$result['reviewSources']??[],'checkpoint'=>['fingerprint'=>$fingerprint,'sections'=>$completed,'partialGroup'=>$section,'partial'=>$result['checkpoint']??null]];
            $completed[$section]=$result;
            foreach ($group as $name) $draft[$name]=$result['draft'][$name];
            $part=$result['audit'];
            $claimShift=count($audit['claims']);$sourceShift=count($audit['sources']);
            foreach ($part['claims'] as $item) { $item['id']+=$claimShift;$audit['claims'][]=$item; }
            foreach ($part['sources'] as $item) { $item['id']+=$sourceShift;$audit['sources'][]=$item; }
            foreach ($part['audit']['claims'] as $item) { $item['id']+=$claimShift;$item['source_ids']=array_map(static fn($id)=>$id+$sourceShift,$item['source_ids']);$audit['audit']['claims'][]=$item; }
            foreach ($part['audit']['sources'] as $item) { $item['id']+=$sourceShift;$item['claim_ids']=array_map(static fn($id)=>$id+$claimShift,$item['claim_ids']);$audit['audit']['sources'][]=$item; }
            foreach ($part['reviewSources'] as $item) { $item['id']+=$sourceShift;$audit['reviewSources'][]=$item; }
        }
        return ['ok'=>true,'draft'=>$draft,'sources'=>$sources,'audit'=>$audit,'warning'=>'Experimental AI draft: compare every section and all flagged statements with the full transcript. Automated checks can be wrong.'];
    }
    /**
     * Process oversized sections in whole-sentence pieces. Exact evidence is
     * assigned only to a unique piece; extra or ambiguous context fails closed.
     * Every fragment and the reassembled draft must pass both full-source checks.
     */
    private function generateByFragments(array $sources, array $evidence, array $context, array $checkpoint, string $largeSection): array
    {
        $keys=['subjective','objective','assessment','plan'];
        $unavailable=static fn()=>['ok'=>false,'code'=>'section_exceeds_budget','section'=>$largeSection];
        foreach ($keys as $key) if (!empty($context[$key]) || (isset($evidence[$key]) && !is_array($evidence[$key]))) return $unavailable();
        $limit=max(200,min(16000,(int)config('ai.scribe_max_input_bytes',10000)));
        // The final audit and meaning check must see the complete source.
        if (strlen(json_encode($sources,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) ?: '') > $limit-1000) return $unavailable();
        $fragments=[];
        foreach ($keys as $key) {
            if (trim($sources[$key])==='Not provided.') continue;
            $sentences=preg_split('/(?<=[.!?])\s+|\n+/u',trim($sources[$key]),-1,PREG_SPLIT_NO_EMPTY);
            if (!$sentences) return $unavailable();
            // Keep a question and its following response in the same piece.
            $units=[];
            foreach ($sentences as $sentence) {
                $last=count($units)-1;
                if ($last>=0 && preg_match('/\?\s*$/u',$units[$last])) $units[$last].=' '.$sentence;
                else $units[]=$sentence;
            }
            $part='';
            foreach ($units as $unit) {
                if (strlen($unit)>1000) return $unavailable();
                if ($part!=='' && strlen($part)+1+strlen($unit)>1000) { $fragments[]=['section'=>$key,'source'=>$part,'evidence'=>[]]; $part=''; }
                $part.=($part===''?'':' ').$unit;
            }
            if ($part!=='') $fragments[]=['section'=>$key,'source'=>$part,'evidence'=>[]];
        }
        foreach ($keys as $key) foreach ($evidence[$key]??[] as $quote) {
            if (!is_string($quote) || trim($quote)==='') return $unavailable();
            $quote=trim($quote);$position=strpos($sources[$key],$quote);
            if ($position===false || strpos($sources[$key],$quote,$position+1)!==false) return $unavailable();
            $matches=[];
            foreach ($fragments as $index=>$fragment) if ($fragment['section']===$key && str_contains($fragment['source'],$quote)) $matches[]=$index;
            if (count($matches)!==1) return $unavailable();
            $fragments[$matches[0]]['evidence'][]=$quote;
        }
        foreach ($fragments as $fragment) if (!empty($evidence[$fragment['section']]) && !$fragment['evidence']) return $unavailable();
        $fingerprint=hash('sha256',json_encode(['fragment-v4',config('ai.model'),config('ai.groq_model'),$sources,$evidence,$context],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
        $saved=($checkpoint['fragmentFingerprint']??null)===$fingerprint && is_array($checkpoint['fragments']??null) ? $checkpoint['fragments'] : [];
        $completed=[];$draft=array_fill_keys($keys,'Not provided.');
        foreach ($fragments as $index=>$fragment) {
            $single=array_fill_keys($keys,'Not provided.');$single[$fragment['section']]=$fragment['source'];
            $result=$saved[$index]??null;
            if (!is_array($result) || !($result['ok']??false) || ($result['sources']??null)!==$single || !is_array($result['draft']??null)) {
                $partial=(($checkpoint['fragmentFingerprint']??null)===$fingerprint && ($checkpoint['partialIndex']??null)===$index && is_array($checkpoint['partial']??null)) ? $checkpoint['partial'] : [];
                $fragmentEvidence=$fragment['evidence'] ? [$fragment['section']=>$fragment['evidence']] : [];
                $result=$this->generate($single,$fragmentEvidence,[],$partial);
            }
            if (!($result['ok']??false)) return ['ok'=>false,'code'=>'section_summary_failed','section'=>$fragment['section'],'cause'=>$result['code']??'unknown','failure'=>$result['failure']??null,'auditCode'=>$result['auditCode']??null,'reviewCode'=>$result['reviewCode']??null,'reviewSources'=>$result['reviewSources']??[],'checkpoint'=>['fragmentFingerprint'=>$fingerprint,'fragments'=>$completed,'partialIndex'=>$index,'partial'=>$result['checkpoint']??null]];
            $completed[$index]=$result;
            $name=$fragment['section'];$piece=$result['draft'][$name]??'';
            if (!is_string($piece) || $piece==='' || $piece==='Not provided.') return $unavailable();
            $draft[$name]=$draft[$name]==='Not provided.' ? $piece : $draft[$name].' '.$piece;
            if (mb_strlen($draft[$name])>($name==='subjective'?2000:($name==='assessment'?800:1000))) return ['ok'=>false,'code'=>'invalid_section','section'=>$name];
        }
        $resume=['fragmentFingerprint'=>$fingerprint,'fragments'=>$completed];
        // These checks receive the full original section, catching corrections
        // or contradictions that cross a fragment boundary when the model can.
        // A successful audit may be reused only for exactly this source and
        // assembled draft. Otherwise a rate-limited meaning review forces the
        // expensive full audit to run again on every retry.
        $auditFingerprint=hash('sha256',json_encode([$fingerprint,$sources,$draft],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
        $audit=(($checkpoint['finalAuditFingerprint']??null)===$auditFingerprint && is_array($checkpoint['finalAudit']??null) && ($checkpoint['finalAudit']['ok']??false)) ? $checkpoint['finalAudit'] : null;
        if ($audit===null) $audit=(new ScribeClaimAudit($this->gateway))->audit($sources,$draft);
        if (!($audit['ok']??false)) return ['ok'=>false,'code'=>'audit_failed','auditCode'=>$audit['code']??'unknown','failure'=>$audit['failure']??null,'reviewSources'=>$audit['reviewSources']??[],'checkpoint'=>$resume];
        $resume['finalAuditFingerprint']=$auditFingerprint;$resume['finalAudit']=$audit;
        $meaning=(new ScribeMeaningReview($this->gateway))->review($sources,$draft);
        if (!($meaning['ok']??false)) return ['ok'=>false,'code'=>'meaning_review_failed','reviewCode'=>$meaning['code']??'unknown','failure'=>$meaning['failure']??null,'checkpoint'=>$resume];
        return ['ok'=>true,'draft'=>$draft,'sources'=>$sources,'audit'=>$audit,'warning'=>'Experimental AI draft: compare every section and all flagged statements with the full transcript. Automated checks can be wrong.'];
    }

}
