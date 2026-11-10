<?php

namespace App\Http\Controllers;

use App\Models\Consultation;
use App\Models\ConsultationWorkingDraft;
use App\Models\Appointment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Doctor-scoped working drafts, separate from reviewed consultation records. */
final class ConsultationWorkingDraftController extends Controller
{
    private function assertAccess(Request $request, Consultation $consultation): void
    {
        $doctor = $request->user()->doctorProfile;
        abort_unless($doctor && (int) $consultation->veterinarian_id === (int) $doctor->id, 403);
        $appointment = $consultation->appointment;
        abort_unless($appointment && (int) $appointment->assigned_vet_id === (int) $doctor->id, 403);
        abort_unless($consultation->status === 'in_consultation' && $appointment->status === 'in_consultation', 422, 'Consultation is not active.');
    }

    public function show(Request $request, Consultation $consultation)
    {
        $this->assertAccess($request, $consultation);
        $draft = ConsultationWorkingDraft::where('consultation_id', $consultation->id)->first();
        abort_if($draft && (int) $draft->veterinarian_id !== (int) $consultation->veterinarian_id, 403);
        return response()->json(['success'=>true,'data'=>['draft'=>$draft?->payload,'revision'=>$draft?->revision ?? 0]])
            ->header('Cache-Control', 'no-store, private');
    }

    public function update(Request $request, Consultation $consultation)
    {
        $data = $request->validate(['revision'=>['required','integer','min:0'], 'draft'=>['required','array']]);
        // Validate the metadata separately so nested validation cannot discard
        // the other explicitly allowed working-copy fields.
        validator($data['draft'], ['clinicalRevision'=>['sometimes','integer','min:0']])->validate();
        $allowed = ['clinicalRevision','fields','medicines','labs','vaccinations','reviewed','saved','startedAt','completedAt',
            'durationMinutes','createdAt','updatedAt','scribe'];
        abort_if(array_diff(array_keys($data['draft']), $allowed) !== [], 422, 'Invalid draft fields.');
        abort_if(strlen(json_encode($data['draft'], JSON_UNESCAPED_UNICODE) ?: '') > 300000, 422, 'Draft is too large.');
        $result = DB::transaction(function () use ($request, $consultation, $data) {
            $locked = Consultation::whereKey($consultation->id)->lockForUpdate()->firstOrFail();
            $appointment = Appointment::whereKey($locked->appointment_id)->lockForUpdate()->firstOrFail();
            $locked->setRelation('appointment', $appointment);
            $this->assertAccess($request, $locked);
            $existing = ConsultationWorkingDraft::where('consultation_id', $locked->id)->lockForUpdate()->first();
            abort_if($existing && (int) $existing->veterinarian_id !== (int) $locked->veterinarian_id, 403);
            $revision = $existing?->revision ?? 0;
            abort_unless((int) $data['revision'] === $revision, 409, 'This working draft changed elsewhere. Reload and review before saving.');
            $previous = $existing?->payload ?? [];
            $oldSource = data_get($previous, 'scribe.transcript');
            $newSource = data_get($data['draft'], 'scribe.transcript');
            $hasSource = is_string($newSource) && $newSource !== '';
            $hasGeneratedSource = is_string(data_get($data['draft'], 'scribe.transcriptAtGenerate')) && data_get($data['draft'], 'scribe.transcriptAtGenerate') !== ''; 
            $sourceUpdatedAt = $existing?->transcript_updated_at;
            if ($newSource !== $oldSource || (!$sourceUpdatedAt && ($hasSource || $hasGeneratedSource))) {
                $sourceUpdatedAt = ($hasSource || $hasGeneratedSource) ? now() : null;
            }
            $draft = $existing ?? new ConsultationWorkingDraft;
            $draft->forceFill(['consultation_id'=>$locked->id,'veterinarian_id'=>$locked->veterinarian_id,
                'payload'=>$data['draft'],'revision'=>$revision+1,'transcript_updated_at'=>$sourceUpdatedAt])->save();
            return $draft->revision;
        });
        return response()->json(['success'=>true,'data'=>['revision'=>$result]])->header('Cache-Control', 'no-store, private');
    }
}
