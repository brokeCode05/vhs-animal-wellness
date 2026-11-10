<?php

namespace App\Services\AI;

/**
 * Read-only clinical draft generator. Calling code MUST authenticate the doctor,
 * verify the assigned in-progress consultation, and obtain provider-use clearance.
 * Neither this class nor the gateway persists clinical data.
 */
final class DoctorScribeService
{
    public function __construct(private readonly AiGateway $gateway) {}

    /** Suggest punctuation for explicit veterinarian review; never save or apply it. */
    public function suggestPunctuation(string $transcript): array
    {
        $transcript = str_replace("\r\n", "\n", $transcript);
        if (mb_strlen(trim($transcript)) < 12 || mb_strlen($transcript) > 30000 || !mb_check_encoding($transcript, 'UTF-8')) return $this->unavailable('invalid_transcript');
        // Keep requests small enough for full JSON responses; the plan is lossless.
        $plan=(new ScribeTranscriptChunker())->plan($transcript, 1200);
        if (!($plan['ok']??false)) return $this->unavailable($plan['code']??'invalid_transcript');
        $instructions = 'Add punctuation to the provided veterinary dictation for human review. '
            .'Preserve every original character, word, number, spelling, letter case and existing punctuation in order. '
            .'You may add only spaces, line breaks, periods, commas, semicolons, colons, question marks or exclamation marks. '
            .'Do not change, add, remove, translate or infer any words, including connecting words. Do not join separate instructions or rewrite for grammar. When a boundary or the scope of a time phrase is unclear, leave that part unchanged rather than guessing. Return only the text, without labels or formatting.';
        $this->gateway->startScribeDeadline(count($plan['chunks']) > 1 ? 90.0 : 24.0);
        $suggestion='';
        foreach ($plan['chunks'] as $chunk) {
            $piece=$chunk['text'];
            if (!preg_match('/^(\s*)(.*?)(\s*)$/us', $piece, $parts)) return $this->unavailable('invalid_transcript');
            [, $leading, $content, $trailing]=$parts;
            if ($content==='') { $suggestion.=$piece; continue; }
            $safe=null;
            for ($attempt=0; $attempt<2; $attempt++) {
                $requestInstructions=$instructions.($attempt ? ' The previous suggestion did not preserve the source. Copy every original word exactly; insert punctuation only.' : '');
                $answer=$this->gateway->text('scribe',$content,$requestInstructions,'clinical',true,'low');
                if (!($answer['ok']??false) || !is_string($answer['text']??null)) {
                    $failure=$answer['provider_failure']??$answer['error_code']??'provider_unavailable';
                    $allowed=['rate_limit','timeout','transport','http_error','configuration','safety_refusal','empty_response','invalid_json','invalid_schema','clinical_blocked','privacy_blocked','disabled','invalid_input'];
                    return $this->unavailable(in_array($failure,$allowed,true) ? $failure : 'provider_unavailable');
                }
                $candidate=trim($answer['text']);
                $safe = strlen($candidate)>2400 ? null : $this->restoreSourceTokens($content,$candidate);
                if ($safe !== null) break;
            }
            if ($safe===null) return $this->unavailable('punctuation_changed_source');
            $suggestion.=$leading.$safe.$trailing;
        }
        // Applying a larger suggestion would be truncated by the transcript field.
        if (mb_strlen($suggestion)>30000 || strlen(iconv('UTF-8','UTF-16LE',$suggestion))/2>30000) return $this->unavailable('punctuation_exceeds_limit');
        return ['ok'=>true,'suggestion'=>$suggestion,'saved'=>false];
    }

    private function restoreSourceTokens(string $source, string $suggestion): ?string
    {
        $pattern="/\\p{L}+(?:['’\\-]\\p{L}+)*|\\p{N}+(?:[.,]\\p{N}+)*|[^\\s\\p{L}\\p{N}]/u";
        if (preg_match_all($pattern,$source,$originalMatches,PREG_OFFSET_CAPTURE)===false || preg_match_all($pattern,$suggestion,$proposedMatches,PREG_OFFSET_CAPTURE)===false) return null;
        $originalOffsets=$originalMatches[0]; $original=array_column($originalOffsets,0); $proposed=$proposedMatches[0];
        $i=0; $offset=0; $result='';
        for ($j=0; $j<count($proposed); $j++) {
            [$token,$position]=$proposed[$j];
            $end=$position+strlen($token);
            $result.=substr($suggestion,$offset,$position-$offset);
            // The provider may add an apostrophe to an unpunctuated word.
            // Compare without apostrophes, but always return the original token.
            $same = isset($original[$i]) && mb_strtolower($token)===mb_strtolower($original[$i]);
            $addedApostrophe = isset($original[$i]) && !preg_match('/[\x27’]/u',$original[$i])
                && mb_strtolower(str_replace(["'",'’'],'',$token))===mb_strtolower($original[$i]);
            // A hyphenated suggestion may join two source words. Restore
            // the original words; do not accept changed or reordered letters.
            $joinedSourceWords = isset($original[$i+1])
                && preg_match('/^\p{L}+[-]\p{L}+$/u',$token)
                && mb_strtolower(str_replace('-','',$token))===mb_strtolower($original[$i].$original[$i+1]);
            // Restore an original hyphenated word when the model separates it
            // with whitespace. Never join different letters or numeric values.
            $splitSourceWord = isset($original[$i],$proposed[$j+1])
                && preg_match('/^(\p{L}+)-(\p{L}+)$/u',$original[$i],$parts)
                && mb_strtolower($token)===mb_strtolower($parts[1])
                && mb_strtolower($proposed[$j+1][0])===mb_strtolower($parts[2])
                && preg_match('/^\s+$/u',substr($suggestion,$end,$proposed[$j+1][1]-$end));
            if ($same || $addedApostrophe || $joinedSourceWords || $splitSourceWord) {
                if ($i>0) {
                    [$previous,$previousPosition]=$originalOffsets[$i-1];
                    $gap=substr($source,$previousPosition+strlen($previous),$originalOffsets[$i][1]-($previousPosition+strlen($previous)));
                    if (preg_match('/\n[\t ]*\n/u',$gap)) $result=rtrim($result).$gap;
                }
                if ($joinedSourceWords) {
                    $gap=substr($source,$originalOffsets[$i][1]+strlen($original[$i]),$originalOffsets[$i+1][1]-($originalOffsets[$i][1]+strlen($original[$i])));
                    if (preg_match('/\n[\t ]*\n/u',$gap)) return null;
                    $result.=$original[$i].$gap.$original[$i+1]; $i+=2;
                } else {
                    $result.=$original[$i++];
                    if ($splitSourceWord) { $j++; $end=$proposed[$j][1]+strlen($proposed[$j][0]); }
                }
            } elseif (in_array($token,['.',',',';',':','!','?'],true)) {
                $result.=$token;
            } else return null;
            $offset=$end;
        }
        return $i===count($original) ? $result.substr($suggestion,$offset) : null;
    }

    public function draft(string $transcript): array
    {
        $transcript = trim(str_replace("\r", '', $transcript));
        if (strlen($transcript) < 12 || strlen($transcript) > 3500) {
            return $this->unavailable('invalid_transcript');
        }

        $this->gateway->startScribeDeadline(36.0);

        $schema = [
            'type' => 'object',
            'properties' => [
                'subjective' => ['type' => 'string'],
                'objective' => [
                    'type' => 'object',
                    'properties' => [
                        'findings' => ['type' => 'string'],
                        'weightKg' => ['type' => ['number', 'null']],
                        'temperatureC' => ['type' => ['number', 'null']],
                        'heartRateBpm' => ['type' => ['integer', 'null']],
                    ],
                    'required' => ['findings', 'weightKg', 'temperatureC', 'heartRateBpm'],
                    'additionalProperties' => false,
                ],
                'assessment' => ['type' => 'string'],
                'plan' => ['type' => 'string'],
            ],
            'required' => ['subjective', 'objective', 'assessment', 'plan'],
            'additionalProperties' => false,
        ];

        // Exact-source extraction, not autonomous clinical reasoning. If a
        // model paraphrases or adds information, refuse and use the local draft.
        $instructions = 'You organize a veterinary doctor transcript into a SOAP DRAFT only. '
            .'Return the required JSON schema. Copy complete sentences VERBATIM from the transcript into '
            .'Subjective, Objective findings, Assessment and Plan. Do not paraphrase, diagnose, prescribe, '
            .'infer, summarize, add facts, or invent findings. Never generate new medical advice, diagnoses, treatments, prescriptions or follow-up. Document advice only if explicitly stated by the veterinarian. Use exactly "Not provided." for absent text. '
            .'Classify by meaning across English, Filipino and mixed-language speech: owner history belongs in Subjective, measured or observed examination findings in Objective, stated clinician impressions and possible explanations in Assessment, and stated tests or follow-up in Plan. A possible explanation is an assessment even when expressed in the same sentence as an observation; preserve its uncertainty. Never turn a possibility into a diagnosis or add a cause. If a whole sentence combines an observation with an assessment, place it in Assessment for review. '
            .'Keep the complete original sentence including its opening words, speaker attribution, qualifiers and negations. '
            .'A section may contain multiple complete source sentences even when separated in the transcript. '
            .'Record vitals ONLY if a number and its explicit unit are present in the transcript; '
            .'otherwise return null. Do not identify an owner or pet. This is not medical advice.';

        $answer = $this->gateway->structured('scribe', $transcript, $instructions, 'clinical', $schema, true);
        if (! $answer['ok'] || ! is_array($answer['data'])) {
            // A structured-output failure may be recoverable by asking for
            // source sentence IDs instead. Never retry a safety refusal or an
            // ordinary authorization/privacy failure this way.
            $invalidStructure=in_array($answer['error_code'] ?? '', ['invalid_json','invalid_schema'], true)
                || (($answer['execution']['scribe_backup_used'] ?? false)
                    && ($answer['provider_failure'] ?? '') === 'http_error'
                    && ($answer['provider_http_status'] ?? null) === 400);
            if ($invalidStructure) {
                $recovered=$this->draftFromSourceIndexes($transcript);
                if ($recovered['ok'] ?? false) return $recovered;
            }
            return $this->unavailable($answer['error_code'] ?? 'provider_unavailable');
        }
        $soap = $answer['data'];
        $objective = $soap['objective'];
        foreach ([
            ['subjective', $soap['subjective'], 2000],
            ['objective', $objective['findings'], 1000],
            ['assessment', $soap['assessment'], 800],
            ['plan', $soap['plan'], 1000],
        ] as [$label, $value, $limit]) {
            if (strlen($value) > $limit || ! $this->isVerbatim($value, $transcript)) {
                $recovered=$this->draftFromSourceIndexes($transcript);
                return $recovered['ok'] ? $recovered : $this->unavailable('ungrounded_'.$label);
            }
            if (! $this->sectionSourceIsSafe($label, $value)) {
                $recovered=$this->draftFromSourceIndexes($transcript);
                return ($recovered['ok'] ?? false) ? $recovered : $this->unavailable('source_mismatch_'.$label);
            }
        }
        // The same sentence in both sections can disguise a plan as an
        // assessment. Reject the proposal for review rather than guessing
        // which section is correct. This is not a general clinical classifier.
        if ($this->sectionsShareSentence($soap['assessment'], $soap['plan'])) {
            return $this->unavailable('source_mismatch_assessment');
        }
        foreach ([
            ['weightKg', 'kg'],
            ['temperatureC', 'c'],
            ['heartRateBpm', 'bpm'],
        ] as [$field, $unit]) {
            $value = $objective[$field];
            if ($value === null) {
                continue;
            }
            if ($value < 0 || ($field === 'heartRateBpm' && ! is_int($value))) {
                return $this->unavailable('invalid_vital');
            }
            // Numeric mention alone is not enough: "owner says weight was
            // 8 kg last month" is clinical history, not today's measurement.
            // Fail closed rather than inserting it as an objective vital.
            if (! $this->hasMeasuredVitalEvidence($field, $value, $transcript)) {
                // A rejected numeric proposal must never populate a vital field.
                // Retry by selecting complete source statements for review only.
                $recovered=$this->draftFromSourceIndexes($transcript);
                return ($recovered['ok'] ?? false) ? $recovered : $this->unavailable('ungrounded_vital');
            }
        }

        return [
            'ok' => true,
            'soap' => $soap,
            'warnings' => array_merge(['AI-generated draft: verify every statement against the original transcript before applying.'], in_array('Not provided.', [$soap['subjective'], $objective['findings'], $soap['assessment'], $soap['plan']], true) ? ['A section is marked Not provided. Check the full transcript and other sections for information that may belong there.'] : []),
            'providerMeta' => ['engine' => ($answer['execution']['scribe_backup_used'] ?? false) ? 'groq' : 'gemini', 'reviewRequired' => true, 'saved' => false],
            'saved' => false,
            'consultation_completed' => false,
        ];
    }

    /** Create a review-only concise draft from already source-grounded sections. */
    public function summarizeDraft(array $draft): array
    {
        if (!($draft['ok'] ?? false)) return $draft;
        $soap=$draft['soap'];
        $sources=['subjective'=>$soap['subjective'], 'objective'=>$soap['objective']['findings'],
            'assessment'=>$soap['assessment'], 'plan'=>$soap['plan']];
        $draft['sourceSections']=$sources;
        $draft['summaryApplied']=false;
        // Keep clinically sensitive sentences unchanged. For other sections,
        // remove only adjacent, identical sentences, not merely similar claims.
        $sensitive='/\b(?:no|not|never|none|without|denies|denied|uncertain|unsure|possible|possibly|suspect(?:ed)?|may|might|could|unreliable|broken|faulty|hindi|wala|walang|posible|posibleng|sira|sigurado|hinala)\b/iu';
        $safe=$sources;
        foreach ($sources as $key=>$source) {
            if ($source==='Not provided.' || preg_match($sensitive,$source)) continue;
            $sentences=preg_split('/(?<=[.!?])\s+/u',trim($source),-1,PREG_SPLIT_NO_EMPTY) ?: [];
            $kept=[];$previous=null;
            foreach ($sentences as $sentence) {
                $normalized=mb_strtolower(preg_replace('/\s+/u',' ',trim($sentence)));
                if ($normalized!==$previous) $kept[]=$sentence;
                $previous=$normalized;
            }
            if ($kept) $safe[$key]=implode(' ',$kept);
        }
        $finish=function(array $sections,string $notice) use ($draft,$sources) {
            $draft['soap']['subjective']=$sections['subjective'];
            $draft['soap']['objective']['findings']=$sections['objective'];
            $draft['soap']['assessment']=$sections['assessment'];
            $draft['soap']['plan']=$sections['plan'];
            $draft['summaryApplied']=$sections!==$sources;
            $draft['warnings'][]=$notice;
            return $draft;
        };
        if (!(bool) config('ai.scribe_semantic_summary_enabled', false)) {
            return $finish($safe, 'Source-based draft: only adjacent identical sentences may be removed. Compare each section with its source and the full transcript.');
        }
        if ((bool) config('ai.scribe_grounded_summary_enabled', false)) {
            // A model audit is fallible: expose source passages and require doctor review.
            $preview=(new ScribeGroundedSummary($this->gateway))->generate($sources);
            if (!($preview['ok']??false)) return $finish($safe,'Experimental summary unavailable or could not be checked. Source-based draft shown; compare it with the full transcript.');
            $result=$finish($preview['draft'],$preview['warning']);
            $result['summaryMethod']='grounded';
            $result['auditReviewSources']=array_values(array_map(static fn ($item) => $item['text'], $preview['audit']['reviewSources']));
            return $result;
        }
        // An explicitly opt-in preview: section sources are already verbatim
        // transcript passages, but the paraphrase itself is not verified fact.
        $properties=[]; foreach (array_keys($sources) as $key) $properties[$key]=['type'=>'string'];
        $schema=['type'=>'object','properties'=>$properties,'required'=>array_keys($sources),'additionalProperties'=>false];
        $instructions='Shorten each veterinary SOAP section by deleting repeated words and phrases from that same section. '
            .'Use original source words in their original order; do not add synonyms, translate, or rearrange words. '
            .'Keep every distinct word at least once, all numbers, units, negations, speaker attribution, uncertainty and follow-up instructions. '
            .'For example, repeated subjects and verbs may be omitted the second time when the meaning stays clear. '
            .'Do not invent, infer, prescribe, diagnose, omit relevant information, or move facts between sections. Never generate new medical advice or recommendations; document only what the veterinarian explicitly stated. '
            .'Return Not provided. when the source is Not provided. Return JSON.';
        $answer=$this->gateway->structured('scribe',json_encode($sources,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),$instructions,'clinical',$schema,true);
        $failed='Concise preview unavailable or could not be checked. Source-based draft shown; compare with the full transcript.';
        if (!($answer['ok']??false) || !is_array($answer['data']??null)) return $finish($safe,$failed);
        $proposed=$answer['data'];
        foreach ($sources as $key=>$source) {
            $value=trim((string)($proposed[$key]??''));$limit=$key==='subjective'?2000:($key==='assessment'?800:1000);
            if ($source==='Not provided.') { $proposed[$key]='Not provided.'; continue; }
            if ($value==='' || $value==='Not provided.' || mb_strlen($value)>$limit || !$this->sectionSourceIsSafe($key,$value)) { $proposed[$key]=$safe[$key]; continue; }
            // Preserve every complete qualified sentence, including repeated
            // occurrences, verbatim and in order. Surrounding sentences may be
            // shortened only if the independent source checks also succeed.
            $sourceStatements=preg_split('/(?<=[.!?])\s+/u', trim($source), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $offset=0;$qualifiedSafe=true;
            foreach ($sourceStatements as $statement) {
                if (!preg_match($sensitive,$statement)) continue;
                $found=mb_strpos((string)$proposed[$key], $statement, $offset);
                if ($found===false) { $qualifiedSafe=false; break; }
                $offset=$found+mb_strlen($statement);
            }
            if (!$qualifiedSafe) { $proposed[$key]=$safe[$key]; continue; }
            // Do not introduce a lowercase sentence start when the source did
            // not contain one. Prefer readable source wording over a broken
            // compression; never change the doctor's original transcript.
            if (preg_match('/[.!?]\s+\p{Ll}/u',(string)$proposed[$key]) && !preg_match('/[.!?]\s+\p{Ll}/u',$source)) $proposed[$key]=$safe[$key];
            preg_match_all('/\d+(?:[.,]\d+)?/u',$source,$a);
            preg_match_all('/\d+(?:[.,]\d+)?/u',(string)$proposed[$key],$b);
            $original=$a[0];$summary=$b[0];sort($original);sort($summary);
            if ($original!==$summary) { $proposed[$key]=$safe[$key]; continue; }
            // A model verifier can be wrong. Permit omission of repeated words
            // and a few nonclinical filler words only; require all other words
            // to remain present and in the same source order. This is an
            // extractive compression, not unrestricted paraphrasing.
            $tokens=static function (string $text): array {
                preg_match_all('/[\p{L}\p{N}]+/u',mb_strtolower($text),$m);
                return array_values(array_filter($m[0],static fn($word)=>!in_array($word,['the','a','an','um','uh','po'],true)));
            };
            $sourceTokens=$tokens($source);$summaryTokens=$tokens((string)$proposed[$key]);
            $sourceWords=array_values(array_unique($sourceTokens));$summaryWords=array_values(array_unique($summaryTokens));
            sort($sourceWords);sort($summaryWords);
            if ($sourceWords!==$summaryWords) { $proposed[$key]=$safe[$key]; continue; }
            // Matching unique vocabulary is insufficient: deleting a repeated
            // noun at the end can remove the recipient of an action. A changed
            // non-filler final token is ambiguous, so keep the full source.
            if (count($sourceTokens) && count($summaryTokens)
                && end($sourceTokens)!==end($summaryTokens)) { $proposed[$key]=$safe[$key]; continue; }
            $position=0;$removed=[];$tokenSafe=true;
            foreach ($summaryTokens as $token) {
                while ($position<count($sourceTokens) && $sourceTokens[$position]!==$token) $removed[]=$sourceTokens[$position++];
                if ($position===count($sourceTokens)) { $tokenSafe=false; break; }
                if ($removed) {
                    // Delete only a repeated phrase of at least two words,
                    // never an isolated repeated noun, verb, or qualifier.
                    // Require the exact phrase to appear earlier in the source.
                    if (count($removed)<2 || $position<count($removed)*2) { $tokenSafe=false; break; }
                    $found=false;
                    for ($i=0;$i<=($position-count($removed)*2);$i++) {
                        if (array_slice($sourceTokens,$i,count($removed))===$removed) { $found=true;break; }
                    }
                    if (!$found) { $tokenSafe=false; break; }
                    $removed=[];
                }
                $position++;
            }
            if (!$tokenSafe || $position!==count($sourceTokens)) { $proposed[$key]=$safe[$key]; continue; }
        }
        // Prefer safe exact-repeat removal whenever the model kept a longer
        // version. If every section is source-based, no model verification is
        // needed and the review remains the standard source-draft flow.
        foreach ($proposed as $key=>$value) {
            if (mb_strlen($safe[$key]) < mb_strlen($value)) $proposed[$key]=$safe[$key];
        }
        if ($proposed===$safe) return $finish($safe,'Source-based draft: only adjacent identical sentences may be removed. Compare each section with its source and the full transcript.');
        // This model check is not proof; source passages and explicit clinical
        // review remain mandatory and the preview is never saved automatically.
        $verifySchema=['type'=>'object','properties'=>['equivalent'=>['type'=>'boolean']], 'required'=>['equivalent'],'additionalProperties'=>false];
        $verify=$this->gateway->structured('scribe',json_encode(['sources'=>$sources,'summaries'=>$proposed],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),
            'Compare each proposed SOAP section with its matching source. Return equivalent false if any clinical fact, speaker attribution, negation, uncertainty, value, unit, or instruction is omitted, added, changed, inferred, or moved. Return JSON.', 'clinical',$verifySchema,true);
        if (!($verify['ok']??false) || ($verify['data']['equivalent']??null)!==true) return $finish($safe,$failed);
        $result=$finish($proposed,'Unverified AI-shortened text: compare each section with its source AND the complete transcript. Automated checks can miss errors.');
        $result['summaryMethod']='semantic';
        $result['summaryProvider']=($answer['execution']['scribe_backup_used'] ?? false) ? 'groq' : 'gemini';
        $result['summaryCheckProvider']=($verify['execution']['scribe_backup_used'] ?? false) ? 'groq' : 'gemini';
        return $result;
    }

    /** Use model-selected sentence IDs; only the server supplies the final wording. */
    private function draftFromSourceIndexes(string $transcript): array
    {
        $sentences=preg_split('/(?<=[.!?;])\s+|\n+/u',trim($transcript),-1,PREG_SPLIT_NO_EMPTY) ?: [];
        if (count($sentences)<2 || count($sentences)>100) return $this->unavailable('source_segmentation_unavailable');
        $items=['type'=>'array','items'=>['type'=>'integer']];
        $schema=['type'=>'object','properties'=>['subjective'=>$items,'objective'=>$items,'assessment'=>$items,'plan'=>$items],
            'required'=>['subjective','objective','assessment','plan'],'additionalProperties'=>false];
        $numbered=[];
        foreach($sentences as $i=>$sentence) $numbered[]=($i+1).': '.$sentence;
        $instructions='Classify the numbered veterinary conversation statements into SOAP sections by their numeric IDs. '
            .'Subjective is owner history, objective is examination findings, assessment is the veterinarian assessment, plan is intended follow-up or treatment. '
            .'Keep current measurement statements and statements about the reliability or confirmation of those measurements together in objective. Do not treat a need to confirm a measurement as a diagnosis. '
            .'Omit greetings and questions. If attribution or section is unclear, omit the ID for manual review. '
            .'Do not repeat an ID across sections. For exact repeated statements select one occurrence only, while retaining every distinct clinical fact and any differences in timing, severity or values. Preserve context and uncertainty; return empty arrays when no statement belongs.';
        $answer=$this->gateway->structured('scribe',implode("\n",$numbered),$instructions,'clinical',$schema,true);
        if (!($answer['ok']??false) || !is_array($answer['data']??null)) return $this->unavailable($answer['error_code']??'provider_unavailable');
        $chosen=[]; $sections=[];
        foreach(['subjective','objective','assessment','plan'] as $section) {
            $ids=$answer['data'][$section];
            if(count($ids)>count($sentences)) return $this->unavailable('invalid_source_selection');
            $previous=0; $parts=[];
            foreach($ids as $id) {
                if(!is_int($id) || $id<1 || $id>count($sentences) || $id<=$previous || isset($chosen[$id])) return $this->unavailable('invalid_source_selection');
                $selected=trim($sentences[$id-1]);
                if (str_contains($selected,'?')) return $this->unavailable('invalid_source_selection');
                $chosen[$id]=true; $previous=$id; $parts[]=$selected;
            }
            $sections[$section]=$parts ? implode(' ',$parts) : 'Not provided.';
            $limit=$section==='subjective'?2000:($section==='assessment'?800:1000);
            if(strlen($sections[$section])>$limit || !$this->sectionSourceIsSafe($section,$sections[$section])) return $this->unavailable('source_mismatch_'.$section);
        }
        return ['ok'=>true,'soap'=>['subjective'=>$sections['subjective'], 'objective'=>['findings'=>$sections['objective'],'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null], 'assessment'=>$sections['assessment'],'plan'=>$sections['plan']],
            'warnings'=>array_merge(['AI-selected statements may be misclassified or omitted. Compare every SOAP field and omitted source statement with the original transcript. Enter vital signs manually.'], in_array('Not provided.', $sections, true) ? ['A section is marked Not provided. Check the full transcript and other sections for information that may belong there.'] : []),
            'providerMeta'=>['engine'=>($answer['execution']['scribe_backup_used'] ?? false) ? 'groq' : 'gemini','reviewRequired'=>true,'saved'=>false], 'saved'=>false,'consultation_completed'=>false];
    }

    /**
     * A numeric mention is not enough to establish a current measured vital.
     * The value must follow a named measurement in the SAME eligible segment;
     * owner estimates, historical readings, negations and conflicts fail closed.
     */
    private function hasMeasuredVitalEvidence(string $field, float|int $value, string $transcript): bool
    {
        $patterns = [
            'weightKg' => '/\b(?:body\s*weight|weight|weighs|weighed|wt)\b\s*(?:(?:is|was|of|at|now)\s+|(?:is|was)\s+(?:recorded|measured)\s+(?:as|at)\s+|:\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilograms?)\b/iu',
            'temperatureC' => '/\b(?:temperature|temp|fever)\b\s*(?:(?:is|was|of|at)\s+|(?:is|was)\s+(?:recorded|measured)\s+(?:as|at)\s+|:\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°\s*c|celsius\b|centigrade\b|c\b)/iu',
            'heartRateBpm' => '/\b(?:heart\s*rate|pulse|hr)\b\s*(?:(?:is|was|of|at)\s+|(?:is|was)\s+(?:recorded|measured)\s+(?:as|at)\s+|:\s*)?(\d{1,3})\s*(?:bpm|beats\s+per\s+minute)\b/iu',
        ];
        $units = [
            'weightKg' => '/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilograms?)\b/iu',
            'temperatureC' => '/\b(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°\s*c|celsius\b|centigrade\b|c\b)/iu',
            'heartRateBpm' => '/\b(\d{1,3})\s*(?:bpm|beats\s+per\s+minute)\b/iu',
        ];
        if (! isset($patterns[$field]) || ! is_finite((float) $value) || $value <= 0) {
            return false;
        }
        // A reliability warning can occur in a separate sentence from the
        // value. Fail closed for proposed vitals when the source contains an
        // unverified measurement or faulty instrument; the veterinarian can
        // still review the transcript and enter measurements manually.
        if (preg_match('/\b(?:unreliable|unconfirmed|unverified|uncertain|inaccurate|invalid|faulty|broken|defective|malfunction\w*|not reliable|not accurate|not verified|needs? (?:to be )?(?:confirmed|verified)|requires? confirmation)\b/iu', $transcript)) {
            return false;
        }
        $measurements = [];
        foreach (preg_split('/(?<=[.!?;])\s+|\n+/u', $transcript) ?: [] as $segment) {
            if (! preg_match($patterns[$field], $segment, $matched)) {
                continue;
            }
            // An owner quote or a temporal/uncertainty qualifier makes the
            // provenance ambiguous; do not treat the number as a measured vital.
            if (str_contains($segment, '?') || preg_match('/\b(?:owner|guardian|client|caregiver|pet parent|may-ari|estimat\w*|approximately|maybe|possibly|what if|would|could|might|hypothetical|suppose|if the|paano kung|kung sakali|incorrect\w*|mistake|entered in error|not measured|wasn.t measured|no measurement|not recorded|last\s+(?:week|month|year)|previously|ago|at home|yesterday|noong|kahapon|dati)\b/iu', $segment)) {
                continue;
            }
            // Named readings with other contradictory values in the SAME
            // segment are not a unique vital (e.g. weight 6 kg and 7 kg).
            preg_match_all($units[$field], $segment, $found);
            $numbers = array_map(static fn ($n) => (float) str_replace(',', '.', $n), $found[1]);
            if (count(array_unique($numbers)) > 1) {
                return false;
            }
            $measurements[] = (float) str_replace(',', '.', $matched[1]);
        }
        // Two disagreeing current readings also fail closed across sentences.
        return count($measurements) > 0
            && count(array_unique($measurements)) === 1
            && abs($measurements[0] - (float) $value) < 0.00001;
    }

    /**
     * Verbatim inclusion alone does NOT prove that the model chose the right
     * clinical section. Block obvious source/section contradictions and use
     * local review rather than accepting a wrongly attributed SOAP section.
     * This is a conservative rejection gate, not an AI medical diagnosis.
     */
    private function sectionsShareSentence(string $assessment, string $plan): bool
    {
        $segments = static function (string $value): array {
            if (trim($value) === 'Not provided.') return [];
            $parts = preg_split('/(?<=[.!?;])\s+|\n+/u', trim($value)) ?: [];
            return array_values(array_filter(array_map(static fn ($part) => mb_strtolower(rtrim(preg_replace('/\s+/u', ' ', trim($part)), " .!?;")), $parts)));
        };
        return array_intersect($segments($assessment), $segments($plan)) !== [];
    }

    private function sectionSourceIsSafe(string $section, string $value): bool
    {
        if ($value === 'Not provided.') {
            return true;
        }
        $owner = '/\b(?:owner|guardian|client|caregiver|pet parent)\s+(?:reports?|reported|says?|said|states?|stated|estimates?|estimated|believes?|noticed)\b/iu';
        $exam = '/\b(?:on|during|upon)\s+(?:(?:the|physical)\s+)?exam(?:ination)?\b|\b(?:examination findings|clinician observed|vet observed)\b/iu';
        if ($section === 'objective') {
            // A verbatim source sentence can still be assigned to the wrong
            // section. Explicit clinical impressions and future instructions
            // cannot be presented as completed examination findings.
            $impression='/\b(?:i\s+suspect|we\s+suspect|suspected\s+diagnosis|my\s+assessment|our\s+assessment|my\s+impression|diagnosis\s+is|pinaghihinalaan|hinala\s+ko)\b/iu';
            $future='/\b(?:i\s+recommend|we\s+recommend|i\s+advise|we\s+advise|plan\s+to|follow[ -]?up\s+in|return\s+for|prescribed?)\b/iu';
            return ! preg_match($owner, $value) && ! preg_match($impression, $value) && ! preg_match($future, $value);
        }
        if ($section === 'subjective') {
            // A single transcription sentence can cross from the owner to the
            // examining veterinarian. Reject rather than reattribute the exam.
            $clinicalTransition = '/\b(?:sa pagsusuri|sa eksaminasyon|(?:titignan|titingnan|susuriin)\s+(?:natin|ko)|on examination|during examination)\b/iu';
            return ! preg_match($exam, $value) && ! preg_match($clinicalTransition, $value);
        }
        if ($section === 'assessment' || $section === 'plan') {
            // A verbatim sentence can still combine an assessment and a plan.
            // Reject the AI proposal so the local review path can separate it;
            // copying the sentence intact into Assessment would hide the plan.
            if ($section === 'assessment' && preg_match('/\b(?:recommend(?:ed|s)?|advis(?:e|ed|es)|follow[ -]?up|recheck|refer(?:ral)?|prescrib(?:e|ed)|plan to|return for|pinayuhan|inirerekomenda)\b/iu', $value)) return false;
            if ($section === 'plan' && preg_match('/\b(?:assessment|impression|diagnosis|differential|suspect(?:ed)?|possible|likely|posibleng|pinaghihinalaan|hinala)\b/iu', $value)) return false;
            return ! preg_match($owner, $value) && ! preg_match($exam, $value);
        }
        return true;
    }

    private function isVerbatim(string $value, string $transcript): bool
    {
        $value = preg_replace('/\s+/u', ' ', trim($value));
        if ($value === 'Not provided.') {
            return true;
        }
        if ($value === '') {
            return false;
        }
        $haystack = preg_replace('/\s+/u', ' ', trim($transcript));
        // Neutral document headings are not clinical qualifiers. Remove only
        // these exact headings at segment boundaries; never strip arbitrary
        // prefixes, which could contain negation, provenance or uncertainty.
        $haystack = preg_replace('/(^|(?<=[.!?;])\s+)(?:fictional test|test transcript|consultation transcript|transcript)\s*:\s*/iu', '$1', $haystack);
        // A substring can omit a negation or qualifier while remaining
        // verbatim. Accept only complete source sentences or segments.
        $segments = preg_split('/(?<=[.!?;])\s+/u', $value) ?: [];
        $offset = 0;
        foreach ($segments as $segment) {
            $whole = rtrim($segment, " \t\n\r\0\x0B.!?;");
            if ($whole === '') return false;
            $pattern='~(?:\A|(?<=[.!?;])\s+)'.preg_quote($whole, '~').'(?=\s*(?:[.!?;](?:\s|\z)|\z))~iu';
            if (preg_match($pattern,$haystack,$match,PREG_OFFSET_CAPTURE,$offset) !== 1) return false;
            $offset=$match[0][1]+strlen($match[0][0]);
        }
        return $segments !== [];
    }

    private function unavailable(string $code): array
    {
        return ['ok' => false, 'code' => $code,
            'message' => 'Gemini drafting is unavailable or could not safely verify the source. Use the local draft and review the transcript.'];
    }
}
