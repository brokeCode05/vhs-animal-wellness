<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\AppointmentEvent;
use App\Models\Consultation;
use App\Models\Document;
use App\Models\LabRequest;
use App\Models\Prescription;
use App\Models\VaccinationRecord;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class ConsultationsController extends Controller
{
    use ApiResponse;

    private function doctor(Request $r)
    {
        $doctor=$r->user()->doctorProfile;
        abort_unless($doctor,403,'Doctor profile missing.');
        return $doctor;
    }

    private function assertOwn(Request $r, Consultation $consultation): void
    {
        abort_unless($consultation->veterinarian_id===$this->doctor($r)->id,403,'This consultation is not assigned to you.');
    }

    public function index(Request $r)
    {
        $doctor = $this->doctor($r);

        /*
         * Doctor EMR history mode.
         *
         * A Doctor may read the previous completed consultations of a pet only
         * in the context of an appointment currently assigned to that Doctor.
         * This allows continuity of care across veterinarians without making
         * arbitrary pet records browsable by ID.
         */
        if ($r->filled('history_for_appointment_id')) {
            $v = $r->validate([
                'history_for_appointment_id' => ['required', 'integer', 'exists:appointments,id'],
            ]);

            $appointment = Appointment::findOrFail((int) $v['history_for_appointment_id']);

            abort_unless(
                $appointment->assigned_vet_id === $doctor->id,
                403,
                'This appointment is not assigned to you.'
            );

            $date = $appointment->appointment_date->format('Y-m-d');
            $time = substr((string) $appointment->appointment_time, 0, 8);

            $history = Consultation::with([
                    'appointment.service',
                    'veterinarian.user',
                    'prescriptions',
                    'labRequests',
                    'vaccinationRecords',
                ])
                ->where('pet_id', $appointment->pet_id)
                ->where('status', 'completed')
                ->where(function ($q) use ($appointment, $date, $time) {
                    // Previous completed visits are always history. Once the
                    // CURRENT appointment is completed, include it too so the
                    // EMR refreshes immediately without requiring a new visit.
                    $q->whereHas('appointment', function ($previous) use ($date, $time) {
                        $previous->whereDate('appointment_date', '<', $date)
                            ->orWhere(function ($sameDay) use ($date, $time) {
                                $sameDay->whereDate('appointment_date', $date)
                                    ->where('appointment_time', '<', $time);
                            });
                    });

                    if ($appointment->status === 'completed') {
                        $q->orWhere('appointment_id', $appointment->id);
                    }
                })
                ->orderByDesc('completed_at')
                ->orderByDesc('id')
                ->get()
                ->map(fn ($c) => $this->presentHistory($c))
                ->values();

            return $this->ok('Previous medical records loaded.', [
                'appointmentId' => $appointment->id,
                'petId' => $appointment->pet_id,
                'history' => $history,
            ]);
        }

        $q = Consultation::with(['prescriptions','labRequests','vaccinationRecords'])
            ->where('veterinarian_id', $doctor->id)
            ->orderByDesc('updated_at');
        if ($r->filled('appointment_id')) {
            $q->where('appointment_id', (int) $r->input('appointment_id'));
        }
        return $this->ok('Consultations loaded.', [
            'consultations' => $q->get()->map(fn ($c) => $this->present($c))->values(),
        ]);
    }

    public function show(Request $r, Consultation $consultation)
    {
        $this->assertOwn($r, $consultation);
        return $this->ok('Consultation loaded.', [
            'consultation' => $this->present($consultation->fresh(['prescriptions','labRequests','vaccinationRecords'])),
        ]);
    }

    public function store(Request $r)
    {
        $v=$r->validate(['appointment_id'=>['required','integer','exists:appointments,id']]);
        $doctor=$this->doctor($r);
        $consultation=DB::transaction(function() use($r,$v,$doctor){
            $a=Appointment::whereKey($v['appointment_id'])->lockForUpdate()->firstOrFail();
            abort_unless($a->assigned_vet_id===$doctor->id,403,'This appointment is not assigned to you.');
            abort_unless($a->status==='checked_in',422,'Only a checked-in appointment may start consultation.');
            $c=Consultation::where('appointment_id',$a->id)->first();
            if(!$c){
                $c=new Consultation;
                $c->forceFill(['appointment_id'=>$a->id,'pet_id'=>$a->pet_id,'veterinarian_id'=>$doctor->id,'status'=>'in_consultation','started_at'=>now()])->save();
            } else {
                abort_if($c->status==='completed',422,'Consultation is already completed.');
                $c->status='in_consultation';$c->started_at??=now();$c->save();
            }
            $a->status='in_consultation';$a->consultation_started_at=$c->started_at;$a->save();
            $e=new AppointmentEvent;$e->forceFill(['appointment_id'=>$a->id,'event_type'=>'in_consultation','old_date'=>$a->appointment_date,'old_time'=>$a->appointment_time,'new_date'=>$a->appointment_date,'new_time'=>$a->appointment_time,'actor_type'=>'Doctor','actor_id'=>$r->user()->id,'metadata'=>['consultation_id'=>$c->id]])->save();
            AuditWriter::write($r->user(),'consultation_started','appointment',$a->id,$r->user()->name.' started consultation '.$a->reference_no.'.',$a->reference_no,['consultationId'=>$c->id]);
            return $c;
        });
        return $this->ok('Consultation started.',['consultation'=>$this->present($consultation->fresh(['prescriptions','labRequests','vaccinationRecords']))],201);
    }

    public function update(Request $r, Consultation $consultation)
    {
        $this->assertOwn($r,$consultation);
        abort_if($consultation->status==='completed',422,'Completed consultations are read-only.');
        $v=$r->validate([
            'soap.subjective'=>['sometimes','nullable','string','max:20000'],'soap.objective'=>['sometimes','nullable','string','max:20000'],
            'soap.assessment'=>['sometimes','nullable','string','max:20000'],'soap.plan'=>['sometimes','nullable','string','max:20000'],
            'soap.weight'=>['sometimes','nullable','string','max:20'],'soap.temperature'=>['sometimes','nullable','string','max:20'],'soap.heartRate'=>['sometimes','nullable','string','max:20'],
            'prescriptions'=>['sometimes','array','max:50'],'prescriptions.*.medicine'=>['required_with:prescriptions','string','max:120'],'prescriptions.*.dosage'=>['nullable','string','max:60'],
            'prescriptions.*.frequency'=>['nullable','string','max:60'],'prescriptions.*.duration'=>['nullable','string','max:60'],'prescriptions.*.instructions'=>['nullable','string','max:2000'],
            'labRequests'=>['sometimes','array','max:50'],'labRequests.*.test'=>['required_with:labRequests','string','max:120'],'labRequests.*.notes'=>['nullable','string','max:2000'],
            'vaccinations'=>['sometimes','array','max:20'],
            'vaccinations.*.vaccineName'=>['required_with:vaccinations','string','max:150'],
            'vaccinations.*.administeredDate'=>['required_with:vaccinations','date'],
            'vaccinations.*.nextDueDate'=>['nullable','date'],
            'vaccinations.*.batchNo'=>['nullable','string','max:100'],
            'vaccinations.*.notes'=>['nullable','string','max:2000'],
        ]);
        $visitDate = Carbon::parse(
            $consultation->appointment()->value('appointment_date')
        )->startOfDay();

        foreach (($v['vaccinations'] ?? []) as $index => $row) {
            $administered = Carbon::parse($row['administeredDate'])->startOfDay();

            abort_unless(
                $administered->equalTo($visitDate),
                422,
                'Vaccination administered date must match the appointment date.'
            );

            if (! empty($row['nextDueDate'])) {
                $nextDue = Carbon::parse($row['nextDueDate'])->startOfDay();
                abort_if(
                    $nextDue->lt($administered),
                    422,
                    'Vaccination next due date cannot be earlier than the administered date.'
                );
            }
        }

        DB::transaction(function() use($r,$consultation,$v){
            if(isset($v['soap'])){
                $s=$v['soap'];
                foreach(['subjective'=>'soap_subjective','objective'=>'soap_objective','assessment'=>'soap_assessment','plan'=>'soap_plan','weight'=>'weight','temperature'=>'temperature','heartRate'=>'heart_rate'] as $in=>$col){
                    if(array_key_exists($in,$s))$consultation->$col=trim((string)$s[$in])?:null;
                }
                $consultation->save();
            }
            if(array_key_exists('prescriptions',$v)){
                $consultation->prescriptions()->delete();
                foreach($v['prescriptions'] as $row){$p=new Prescription;$p->forceFill(['consultation_id'=>$consultation->id,'medicine'=>trim($row['medicine']),'dosage'=>trim((string)($row['dosage']??''))?:null,'frequency'=>trim((string)($row['frequency']??''))?:null,'duration'=>trim((string)($row['duration']??''))?:null,'instructions'=>trim((string)($row['instructions']??''))?:null])->save();}
            }
            if(array_key_exists('labRequests',$v)){
                $consultation->labRequests()->where('status','requested')->delete();
                foreach($v['labRequests'] as $row){$l=new LabRequest;$l->forceFill(['consultation_id'=>$consultation->id,'test'=>trim($row['test']),'notes'=>trim((string)($row['notes']??''))?:null,'status'=>'requested'])->save();}
            }
            if(array_key_exists('vaccinations',$v)){
                $consultation->vaccinationRecords()->delete();
                foreach($v['vaccinations'] as $row){
                    $vaccination=new VaccinationRecord;
                    $vaccination->forceFill([
                        'consultation_id'=>$consultation->id,
                        'pet_id'=>$consultation->pet_id,
                        'veterinarian_id'=>$consultation->veterinarian_id,
                        'vaccine_name'=>trim($row['vaccineName']),
                        'administered_at'=>$row['administeredDate'],
                        'next_due_date'=>$row['nextDueDate']??null,
                        'batch_no'=>trim((string)($row['batchNo']??''))?:null,
                        'notes'=>trim((string)($row['notes']??''))?:null,
                    ])->save();
                }
            }

            $appointment = $consultation->appointment()->first();

            AuditWriter::write(
                $r->user(),
                'consultation_saved',
                'appointment',
                $consultation->appointment_id,
                $r->user()->name.' saved clinical consultation data for '.($appointment?->reference_no ?: 'appointment #'.$consultation->appointment_id).'.',
                $appointment?->reference_no,
                [
                    'consultationId' => $consultation->id,
                    'soapUpdated' => array_key_exists('soap', $v),
                    'prescriptionCount' => array_key_exists('prescriptions', $v) ? count($v['prescriptions']) : null,
                    'labRequestCount' => array_key_exists('labRequests', $v) ? count($v['labRequests']) : null,
                    'vaccinationCount' => array_key_exists('vaccinations', $v) ? count($v['vaccinations']) : null,
                ]
            );
        });
        return $this->ok('Consultation saved.',['consultation'=>$this->present($consultation->fresh(['prescriptions','labRequests','vaccinationRecords']))]);
    }

    public function complete(Request $r, Consultation $consultation)
    {
        $this->assertOwn($r,$consultation);
        abort_unless($consultation->status==='in_consultation',422,'Consultation is not active.');
        $consultation=DB::transaction(function() use($r,$consultation){
            $c=Consultation::whereKey($consultation->id)->lockForUpdate()->firstOrFail();
            $a=Appointment::whereKey($c->appointment_id)->lockForUpdate()->firstOrFail();
            abort_unless($a->status==='in_consultation',422,'Appointment is not in consultation.');
            $c->status='completed';
            $c->completed_at=now();
            $c->started_at??=$a->consultation_started_at??now();
            $c->duration_minutes=max(
                0,
                (int) round($c->started_at->diffInSeconds($c->completed_at) / 60)
            );
            $c->save();
            $a->status='completed';$a->consultation_completed_at=$c->completed_at;$a->save();
            $c->load(['prescriptions','labRequests','vaccinationRecords','appointment.user','appointment.pet','appointment.service','veterinarian.user']);
            $this->finalizeDocuments($c);
            $e=new AppointmentEvent;$e->forceFill(['appointment_id'=>$a->id,'event_type'=>'completed','old_date'=>$a->appointment_date,'old_time'=>$a->appointment_time,'new_date'=>$a->appointment_date,'new_time'=>$a->appointment_time,'actor_type'=>'Doctor','actor_id'=>$r->user()->id,'metadata'=>['consultation_id'=>$c->id,'duration_minutes'=>$c->duration_minutes]])->save();
            AuditWriter::write($r->user(),'consultation_completed','appointment',$a->id,$r->user()->name.' completed consultation '.$a->reference_no.'.',$a->reference_no,['consultationId'=>$c->id,'durationMinutes'=>$c->duration_minutes]);
            return $c;
        });
        return $this->ok('Consultation completed and client documents finalized.',['consultation'=>$this->present($consultation)]);
    }

    private function finalizeDocuments(Consultation $c): void
    {
        $a=$c->appointment;$vet=$c->veterinarian?->display_name ?: $c->veterinarian?->user?->name;
        $base=['appointment_id'=>$a->id,'user_id'=>$a->user_id,'pet_id'=>$a->pet_id,'service_label'=>$a->service_label_at_booking,'veterinarian_name'=>$vet,'issued_at'=>$c->completed_at??now()];
        $docs=[
            'consultation_summary'=>[
                'date'=>$a->appointment_date->format('Y-m-d'),
                'time'=>substr((string)$a->appointment_time,0,5),
                'startedAt'=>optional($c->started_at)->toIso8601String(),
                'completedAt'=>optional($c->completed_at)->toIso8601String(),
                'durationMinutes'=>$c->duration_minutes,
                'weight'=>$c->weight,
                'temperature'=>$c->temperature,
                'heartRate'=>$c->heart_rate,
                'assessment'=>$c->soap_assessment,
                'plan'=>$c->soap_plan,
                'vaccinations'=>$c->vaccinationRecords->map(fn($v)=>[
                    'vaccineName'=>$v->vaccine_name,
                    'administeredDate'=>optional($v->administered_at)->format('Y-m-d'),
                    'nextDueDate'=>optional($v->next_due_date)->format('Y-m-d'),
                    'batchNo'=>$v->batch_no,
                    'notes'=>$v->notes,
                ])->values()->all(),
            ],
        ];
        if($c->prescriptions->isNotEmpty())$docs['prescription']=['medicines'=>$c->prescriptions->map(fn($p)=>['medicine'=>$p->medicine,'dosage'=>$p->dosage,'frequency'=>$p->frequency,'duration'=>$p->duration,'instructions'=>$p->instructions])->values()->all()];
        if($c->labRequests->isNotEmpty())$docs['lab_request']=['tests'=>$c->labRequests->map(fn($l)=>['test'=>$l->test,'notes'=>$l->notes,'status'=>$l->status])->values()->all()];
        foreach($docs as $type=>$payload){
            if(Document::where('appointment_id',$a->id)->where('type',$type)->exists())continue;
            $d=new Document;$d->forceFill($base+['type'=>$type,'status'=>'finalized','payload'=>$payload])->save();
        }
    }

    private function presentHistory(Consultation $c): array
    {
        $c->loadMissing([
            'appointment.service',
            'veterinarian.user',
            'prescriptions',
            'labRequests',
            'vaccinationRecords',
        ]);

        $appointment = $c->appointment;
        $vetName = $c->veterinarian?->display_name
            ?: $c->veterinarian?->user?->name
            ?: 'Veterinarian';

        return [
            'consultationId' => $c->id,
            'appointmentId' => $c->appointment_id,
            'referenceNo' => $appointment?->reference_no,
            'date' => $appointment?->appointment_date?->format('Y-m-d'),
            'time' => $appointment ? substr((string) $appointment->appointment_time, 0, 5) : null,
            'service' => $appointment?->service_label_at_booking
                ?: $appointment?->service?->label
                ?: $appointment?->service?->value
                ?: 'Consultation',
            'veterinarian' => $vetName,
            'completedAt' => optional($c->completed_at)->toIso8601String(),
            'durationMinutes' => $c->duration_minutes,
            // Doctor-only continuity-of-care record.  This endpoint sits
            // behind role:Doctor and also checks the current appointment.
            'soap' => [
                'subjective' => $c->soap_subjective,
                'objective' => $c->soap_objective,
                'assessment' => $c->soap_assessment,
                'plan' => $c->soap_plan,
                'weight' => $c->weight,
                'temperature' => $c->temperature,
                'heartRate' => $c->heart_rate,
            ],
            'prescriptions' => $c->prescriptions->map(fn ($p) => [
                'medicine' => $p->medicine,
                'dosage' => $p->dosage,
                'frequency' => $p->frequency,
                'duration' => $p->duration,
                'instructions' => $p->instructions,
            ])->values(),
            'labRequests' => $c->labRequests->map(fn ($l) => [
                'test' => $l->test,
                'notes' => $l->notes,
                'status' => $l->status,
                'resultSummary' => $l->result_summary,
            ])->values(),
            'vaccinations' => $c->vaccinationRecords->map(fn ($v) => [
                'vaccinationId' => $v->id,
                'vaccineName' => $v->vaccine_name,
                'administeredDate' => optional($v->administered_at)->format('Y-m-d'),
                'nextDueDate' => optional($v->next_due_date)->format('Y-m-d'),
                'batchNo' => $v->batch_no,
                'notes' => $v->notes,
            ])->values(),
        ];
    }

    private function present(Consultation $c): array
    {
        $c->loadMissing(['prescriptions','labRequests','vaccinationRecords']);

        return [
            'consultationId' => $c->id,
            'appointmentId' => $c->appointment_id,
            'patientId' => $c->pet_id,
            'veterinarianId' => $c->veterinarian_id,
            'status' => $c->status,
            'startedAt' => optional($c->started_at)->toIso8601String(),
            'completedAt' => optional($c->completed_at)->toIso8601String(),
            'duration' => $c->duration_minutes,
            'soap' => [
                'subjective' => $c->soap_subjective,
                'objective' => $c->soap_objective,
                'assessment' => $c->soap_assessment,
                'plan' => $c->soap_plan,
                'weight' => $c->weight,
                'temperature' => $c->temperature,
                'heartRate' => $c->heart_rate,
            ],
            'prescriptions' => $c->prescriptions->map(fn ($p) => [
                'id' => $p->id,
                'medicine' => $p->medicine,
                'dosage' => $p->dosage,
                'frequency' => $p->frequency,
                'duration' => $p->duration,
                'instructions' => $p->instructions,
            ])->values(),
            'labRequests' => $c->labRequests->map(fn ($l) => [
                'id' => $l->id,
                'test' => $l->test,
                'notes' => $l->notes,
                'status' => $l->status,
                'resultSummary' => $l->result_summary,
            ])->values(),
            'vaccinations' => $c->vaccinationRecords->map(fn ($v) => [
                'vaccinationId' => $v->id,
                'vaccineName' => $v->vaccine_name,
                'administeredDate' => optional($v->administered_at)->format('Y-m-d'),
                'nextDueDate' => optional($v->next_due_date)->format('Y-m-d'),
                'batchNo' => $v->batch_no,
                'notes' => $v->notes,
            ])->values(),
        ];
    }

}
