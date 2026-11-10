<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use App\Models\Consultation;
use App\Services\AI\DoctorScribeService;
use Illuminate\Http\Request;

final class DoctorScribeController extends Controller
{
    /** Report limits from the web-serving PHP process, without exposing configuration details. */
    public function audioLimits(Request $request)
    {
        abort_unless($request->user()->doctorProfile, 403);
        $bytes = static function ($value): ?int {
            $value = trim((string) $value);
            if ($value === '' || $value === '-1' || $value === '0') return null;
            if (!preg_match('/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i', $value, $m)) return null;
            $power = strpos('kmgt', strtolower($m[2] ?? ''));
            return (int) ((float) $m[1] * ($power === false || ($m[2] ?? '') === '' ? 1 : 1024 ** ($power + 1)));
        };
        $upload=$bytes(ini_get('upload_max_filesize'));
        $post=$bytes(ini_get('post_max_size'));
        $limits=[10*1024*1024];
        if ($upload !== null) $limits[]=$upload;
        // Reserve space for multipart boundaries and form fields.
        if ($post !== null) $limits[]=max(0, $post-131072);
        return response()->json(['success'=>true,'data'=>['max_audio_bytes'=>min($limits), 'transcript_max_chars'=>30000, 'draft_max_chars'=>config('ai.scribe_single_pass_enabled') ? 30000 : ((config('ai.scribe_semantic_summary_enabled') && config('ai.scribe_grounded_summary_enabled')) ? 8000 : 3500)]])
            ->header('Cache-Control','no-store, private');
    }

    public function transcribe(Request $request, \App\Services\AI\GroqAudioTranscriber $transcriber)
    {
        abort_unless(config('ai.enabled') && config('ai.clinical_enabled') && config('ai.clinical_clearance')
            && config('ai.paid_data_approved') && config('ai.groq_scribe_transcription_enabled'), 503);
        $data=$request->validate(['appointment_id'=>['required','integer','min:1'],
            'audio'=>['required','file','max:10240','mimetypes:audio/webm,video/webm,audio/ogg,audio/wav,audio/x-wav,audio/mp4,video/mp4']]);
        $doctor=$request->user()->doctorProfile?->id;
        abort_unless($doctor,403);
        $appointment=Appointment::findOrFail((int)$data['appointment_id']);
        abort_unless((int)$appointment->assigned_vet_id===(int)$doctor,403);
        abort_unless($appointment->status==='in_consultation',422);
        abort_unless(Consultation::where('appointment_id',$appointment->id)->where('veterinarian_id',$doctor)->where('status','in_consultation')->exists(),422);
        $result=$transcriber->transcribe($data['audio']);
        if (!$result['ok']) return response()->json(['success'=>false,'code'=>$result['code'],'message'=>'Transcription unavailable. The recording was not added to the transcript.'],503)->header('Cache-Control','no-store, private');
        return response()->json(['success'=>true,'data'=>['transcript'=>$result['text']]])->header('Cache-Control','no-store, private');
    }
    public function draft(Request $request, DoctorScribeService $scribe, \App\Services\AI\AiGateway $gateway)
    {
        // Fail closed BEFORE accessing any consultation or calling Gemini.
        if (! config('ai.enabled') || ! config('ai.clinical_enabled')
            || ! config('ai.clinical_clearance') || ! config('ai.paid_data_approved')) {
            return response()->json([
                'success' => false, 'message' => 'Gemini clinical drafting has not been cleared. Use the local SOAP draft.',
                'code' => 'clinical_blocked',
            ], 503);
        }

        $experimentalSummary=($request->input('mode') === 'summary') && config('ai.scribe_semantic_summary_enabled') && config('ai.scribe_grounded_summary_enabled');
        $singlePass=($request->input('mode') === 'summary') && config('ai.scribe_single_pass_enabled');
        $data = $request->validate([
            'appointment_id' => ['required', 'integer', 'min:1'],
            'transcript' => ['required', 'string', 'min:12', 'max:'.(($singlePass || $request->input('mode') === 'punctuation') ? 30000 : ($experimentalSummary ? 8000 : 3500))],
            'mode' => ['sometimes', 'in:draft,summary,punctuation'],
            'draft_language' => ['sometimes', 'in:english,source'],
            'retry_token' => ['sometimes','string','max:200000'],
        ]);
        $doctorId = $request->user()->doctorProfile?->id;
        abort_unless($doctorId, 403, 'Doctor profile missing.');

        $appointment = Appointment::findOrFail((int) $data['appointment_id']);
        abort_unless((int) $appointment->assigned_vet_id === (int) $doctorId, 403,
            'This appointment is not assigned to you.');
        abort_unless($appointment->status === 'in_consultation', 422,
            'This appointment does not have an active consultation.');
        $consultation = Consultation::where('appointment_id', $appointment->id)
            ->where('veterinarian_id', $doctorId)->first();
        abort_unless($consultation && $consultation->status === 'in_consultation', 422,
            'The consultation must be in progress.');

        // Fail closed before any external drafting or punctuation provider call.
        // This only detects common contact formats; it is not anonymization.
        if (app(\App\Services\ScribePrivacyGuard::class)->hasContactDetails($data['transcript'])) {
            return response()->json(['success'=>false,'code'=>'privacy_contact_detected',
                'message'=>'Possible email or Philippine mobile number detected. Remove it from the transcript before using external drafting.'],422)
                ->header('Cache-Control','no-store, private');
        }

        if ($singlePass) {
            if (function_exists('set_time_limit')) @set_time_limit(110);
            $gateway->startScribeDeadline(90.0);
            $reviewGateway=null;
            if (config('ai.scribe_independent_review_enabled')) {
                // Independent review sends the full transcript to Groq, so it
                // requires its own switch as well as the established backup and
                // clinical/privacy approvals. Do not silently widen data sharing.
                if (!config('ai.groq_scribe_backup_enabled')) return response()->json(['success'=>false,'code'=>'clinical_blocked','message'=>'Independent review is not authorized.'],503)->header('Cache-Control','no-store, private');
                $reviewGateway=new \App\Services\AI\AiGateway(app(\App\Services\AI\Providers\GroqProvider::class));
                $reviewGateway->startScribeDeadline(90.0);
            }
            $draftLanguage=$data['draft_language']??'english';
            $scope=[(int)$request->user()->id,(int)$appointment->id,(int)$consultation->id,$draftLanguage,hash('sha256',$data['transcript']),
                config('ai.model'),config('ai.groq_model'),(bool)config('ai.groq_scribe_backup_enabled'),(bool)config('ai.scribe_independent_review_enabled')];
            $proposal=app(\App\Services\AI\ScribeDraftRun::class)->run($scope,
                fn($checkpoint,$save)=>(new \App\Services\AI\ScribeSinglePassDraft($gateway,$reviewGateway))->generate($data['transcript'],$draftLanguage,$checkpoint,$save));
            if (!($proposal['ok']??false)) {
                $reason=$proposal['failure']??$proposal['code']??null;
                if (!in_array($reason,['rate_limit','timeout','transport','invalid_json','invalid_schema','provider_unavailable','http_error','invalid_section','invalid_reference','segment_exceeds_limit','advice_unverified','incomplete_response','needs_manual_compression','in_progress','checkpoint_unavailable','invalid_input'],true)) $reason=null;
                $attempts=[];foreach (($proposal['providerAttempts']??$gateway->providerAttemptDiagnostics()) as $attempt) {
                    $provider=$attempt['provider']??null;$category=$attempt['category']??null;
                    if (in_array($provider,['gemini','groq','configured'],true) && in_array($category,['ok','configuration','timeout','transport','rate_limit','http_error','safety_refusal','empty_response','incomplete_response','invalid_json','invalid_schema','unknown'],true)) $attempts[]=['provider'=>$provider,'category'=>$category,'finishReason'=>$attempt['finish_reason']??null,'usage'=>$attempt['usage']??[],'httpRequests'=>$attempt['http_requests']??null];
                }
                return response()->json(['success'=>false,'code'=>'single_pass_unavailable','message'=>'The full-transcript draft did not finish. The transcript is unchanged; retry or review it manually.','data'=>['failure'=>$reason,'providerAttempts'=>$attempts,'jobId'=>$proposal['jobId']??null,'retryAfter'=>$proposal['retryAfter']??null]],($reason==='in_progress' ? 409 : 503))->header('Cache-Control','no-store, private');
            }
            $soap=$proposal['draft'];
            return response()->json(['success'=>true,'message'=>'Unverified proposal requires doctor review.','data'=>[
                'soap'=>['subjective'=>$soap['subjective'],'objective'=>['findings'=>$soap['objective'],'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>$soap['assessment'],'plan'=>$soap['plan']],
                'warnings'=>array_merge(['Unverified AI proposal. Compare every section and unlinked passage with the complete transcript, including corrections, dates and measurements. Source references and automated checks do not prove accuracy. Enter vitals manually.'],$proposal['reviewWarnings']??[]),
                'providerMeta'=>['engine'=>'experimental','reviewRequired'=>true,'saved'=>false,'checkpointAvailable'=>(bool)($proposal['checkpointAvailable']??false),'backupUsed'=>(bool)($proposal['backupUsed']??false)],
                'processing'=>$proposal['processing'],'automatedReview'=>$proposal['automatedReview'],'sourceVersion'=>$proposal['sourceVersion'],'jobId'=>$proposal['jobId']??null,'reused'=>(bool)($proposal['reused']??false),
                'sourceSections'=>$proposal['sources'],'sourceViews'=>$proposal['sourceViews'],'summaryApplied'=>true,'summaryMethod'=>'single_pass','summaryLanguage'=>$draftLanguage,
                'unlinkedSources'=>$proposal['unlinkedSources'],'reviewItems'=>$proposal['reviewItems'],'claimLinks'=>$proposal['claimLinks'],
                'saved'=>false,'consultation_completed'=>false,
            ]])->header('Cache-Control','no-store, private');
        }

        if ($experimentalSummary) {
            // PHP's web execution limit can otherwise terminate the request
            // before the bounded provider deadline and lose its retry manifest.
            if (function_exists('set_time_limit')) @set_time_limit(mb_strlen($data['transcript']) > 3500 ? 110 : 50);
            // Review-only pilot. A failed chunk cannot produce an apparently complete proposal.
            $gateway->startScribeDeadline(mb_strlen($data['transcript'])>3500 ? 90.0 : 36.0);
            $processor=new \App\Services\AI\ScribeChunkedInventory($gateway);
            $tokens=new \App\Services\AI\ScribeRetryToken;
            $resumedChunks=null;
            if (isset($data['retry_token'])) {
                $previous=$tokens->read($data['retry_token'],(int)$doctorId,(int)$appointment->id,$data['transcript']);
                if ($previous===null) return response()->json(['success'=>false,'code'=>'retry_expired','message'=>'Retry expired or the consultation changed. Generate a new draft.'],422)->header('Cache-Control','no-store, private');
                $resumedChunks=count(array_filter($previous['chunks']??[],static fn($chunk)=>($chunk['status']??null)==='complete'));
                $inventory=$processor->retryFailed($data['transcript'],800,$previous);
                if (($inventory['ok']??false) && is_array($previous['summaryCheckpoint']??null)) $inventory['summaryCheckpoint']=$previous['summaryCheckpoint'];
            } else $inventory=$processor->extract($data['transcript'],800);
            $preview=(new \App\Services\AI\ScribeEvidenceSummary($gateway))->generate($inventory);
            if (!($preview['ok']??false) || !($preview['complete']??false) || !is_array($preview['draft']??null)) {
                $retry=null;$failed=[];
                if (($inventory['ok']??false) && isset($inventory['chunks'])) {
                    // Preserve successful extraction even when the later summary stage fails.
                    if (is_array($preview['summaryCheckpoint']??null)) $inventory['summaryCheckpoint']=$preview['summaryCheckpoint'];
                    $retry=$tokens->issue((int)$doctorId,(int)$appointment->id,$data['transcript'],$inventory);
                    foreach ($inventory['chunks'] as $chunk) if ($chunk['status']==='failed') {
                        $category=($chunk['error']??'')==='not_attempted' ? 'not_attempted' : (in_array($chunk['failure']??'', ['rate_limit','timeout','deadline','invalid_quote','invalid_segment_mapping','incomplete_inventory','invalid_json','invalid_schema','transport'],true) ? $chunk['failure'] : 'unavailable');
                        $failed[]=['id'=>$chunk['id'],'offset'=>$chunk['offset'],'length'=>$chunk['length'],'category'=>$category];
                    }
                }
                $summaryFailure=$preview['summaryProviderFailure']??null;
                $safeFailures=['rate_limit','timeout','deadline','transport','invalid_json','invalid_schema','provider_unavailable','invalid_input','http_error','configuration','empty_response','clinical_blocked','privacy_blocked','disabled'];
                if (!in_array($summaryFailure,$safeFailures,true)) $summaryFailure=null;
                // Failure categories are fixed labels; source excerpts are separately validated below.
                $summaryCode=$preview['summaryCause']??$preview['summaryFailure']??null;
                $nonRetryable = $summaryCode === 'section_exceeds_budget' || ($summaryCode === 'audit_failed' && ($preview['summaryAuditCode']??null) === 'audit_too_many_statements');
                // Retrying an unchanged oversized section cannot succeed and would
                // repeatedly consume capacity. Keep the transcript for manual review.
                if ($nonRetryable) $retry=null;
                $summaryStage=match ($summaryCode) {
                    'section_exceeds_budget' => 'source_too_large',
                    'generator_unavailable' => 'generation',
                    'audit_failed' => 'source_check',
                    'meaning_review_failed' => 'meaning_check',
                    'invalid_section' => 'draft_field_limit',
                    'empty_section_mismatch' => 'draft_section_mismatch',
                    default => null,
                };
                if ($summaryStage==='source_check') {
                    $summaryStage=match ($preview['summaryAuditCode']??null) {
                        'audit_too_many_statements' => 'source_too_large',
                        'source_uncovered' => 'source_coverage',
                        'claim_unverified' => 'source_support',
                        'invalid_source_reference','invalid_claim_reference','invalid_source_audit','incomplete_audit','inconsistent_references' => 'source_links',
                        default => 'source_check',
                    };
                }
                // Only return an exact passage from the doctor's submitted transcript,
                // never an unverified model-generated passage or the rejected draft.
                $reviewSources=[];
                if ($summaryStage==='source_coverage') foreach (($preview['summaryReviewSources']??[]) as $item) {
                    $text=$item['text']??null;$section=$item['section']??null;
                    if (is_string($text) && $text!=='' && mb_strlen($text)<=2000 && str_contains($data['transcript'],$text) && in_array($section,['subjective','objective','assessment','plan'],true)) {
                        $reviewSources[]=['section'=>$section,'text'=>$text];
                        if (count($reviewSources)>=10) break;
                    }
                }
                // The most recent provider attempts contain bounded metadata only.
                // Do not expose prompts, responses, credentials or transcript text.
                $providerAttempts=[];
                foreach (($proposal['providerAttempts']??$gateway->providerAttemptDiagnostics()) as $attempt) {
                    $provider=$attempt['provider']??null;$category=$attempt['category']??null;
                    if (in_array($provider,['gemini','groq','configured'],true) && in_array($category,['ok','configuration','timeout','transport','rate_limit','http_error','safety_refusal','empty_response','incomplete_response','invalid_json','invalid_schema','unknown'],true))
                        $providerAttempts[]=['provider'=>$provider,'category'=>$category];
                }
                $completed=count(array_filter($inventory['chunks']??[],static fn($chunk)=>($chunk['status']??null)==='complete'));
                return response()->json(['success'=>false,'code'=>'experimental_incomplete','message'=>'Experimental draft incomplete. Review the transcript or retry failed parts.','data'=>['retryToken'=>$retry,'failedChunks'=>$failed,'completedChunks'=>$completed,'totalChunks'=>count($inventory['chunks']??[]),'resumedChunks'=>$resumedChunks,'summaryFailure'=>$summaryFailure,'summaryStage'=>$summaryStage,'reviewSources'=>$reviewSources,'providerAttempts'=>$providerAttempts,'retryable'=>!$nonRetryable]],503)->header('Cache-Control','no-store, private');
            }
            $soap=$preview['draft'];
            // Context is still available in the complete transcript. Distinguish
            // it from passages that the pipeline could not confidently link.
            $reviewItems=[];
            foreach ($preview['attention'] as $item) {
                $reason=$item['reason']??'';
                if ($reason==='context_requires_review') continue;
                $text=$item['source']??$item['text']??null;
                if (!is_string($text) || trim($text)==='') continue;
                $reviewItems[]=['reason'=>is_string($reason)?$reason:'other','text'=>$text];
            }
            return response()->json(['success'=>true,'message'=>'Experimental proposal requires review.','data'=>[
                'soap'=>['subjective'=>$soap['subjective'],'objective'=>['findings'=>$soap['objective'],'weightKg'=>null,'temperatureC'=>null,'heartRateBpm'=>null],'assessment'=>$soap['assessment'],'plan'=>$soap['plan']],
                'warnings'=>[$preview['warning'],'Source-linked suggestions and automated checks may be wrong.'],
                'providerMeta'=>['engine'=>'experimental','reviewRequired'=>true,'saved'=>false],
                'sourceSections'=>$preview['sources'],'summaryApplied'=>$soap!==$preview['sources'],'summaryMethod'=>'grounded',
                'reviewItems'=>$reviewItems,
                'claimLinks'=>$preview['claimLinks'],'placementSuggestions'=>$preview['placementSuggestions'],
                'saved'=>false,'consultation_completed'=>false,
            ]])->header('Cache-Control','no-store, private');
        }

        if (($data['mode'] ?? 'draft') === 'punctuation' && function_exists('set_time_limit')) @set_time_limit(110);
        $draft = ($data['mode'] ?? 'draft') === 'punctuation'
            ? $scribe->suggestPunctuation($data['transcript']) : $scribe->draft($data['transcript']);
        if (! $draft['ok']) {
            return response()->json(['success' => false, 'message' => $draft['message'],
                'code' => $draft['code']], 503);
        }
        if (($data['mode'] ?? 'draft') === 'punctuation') {
            return response()->json(['success'=>true,'data'=>['suggestion'=>$draft['suggestion'],'saved'=>false]])->header('Cache-Control','no-store, private');
        }
        if (($data['mode'] ?? 'draft') === 'summary') $draft=$scribe->summarizeDraft($draft);
        // Nothing written to consultations, appointments, or prescriptions.
        return response()->json([
            'success' => true, 'message' => 'Review-only SOAP proposal ready.',
            'data' => [
                'soap' => $draft['soap'], 'warnings' => $draft['warnings'],
                'providerMeta' => $draft['providerMeta'], 'sourceSections'=>$draft['sourceSections'] ?? null,
                'summaryApplied'=>$draft['summaryApplied'] ?? false, 'summaryMethod'=>$draft['summaryMethod'] ?? 'source',
                'auditReviewSources'=>$draft['auditReviewSources'] ?? [],
                'summaryProvider'=>$draft['summaryProvider'] ?? null, 'summaryCheckProvider'=>$draft['summaryCheckProvider'] ?? null, 'saved' => false,
                'consultation_completed' => false,
            ],
        ]);
    }
}
