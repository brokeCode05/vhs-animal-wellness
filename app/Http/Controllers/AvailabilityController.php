<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\Service;
use App\Support\ApiResponse;
use App\Support\AppointmentWorkflow;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AvailabilityController extends Controller
{
    use ApiResponse;

    private function display(string $hhmm): string
    {
        [$h,$m]=array_map('intval',explode(':',$hhmm));
        $ampm=$h>=12?'PM':'AM';$h12=$h%12?:12;
        return $h12.':'.str_pad((string)$m,2,'0',STR_PAD_LEFT).' '.$ampm;
    }

    /*
     * GET /api/availability — REAL, resource-aware slot availability.
     *
     * Answers "which clinic slots can still take an appointment" through the
     * SAME AppointmentWorkflow capacity model the booking endpoint enforces
     * (one source of truth — this endpoint never re-implements the rules):
     *   · doctor-required service → a slot stays open while at least one On
     *     Duty doctor has no appointment at that time; with doctor_id the
     *     answer is scoped to that specific doctor's own conflicts;
     *   · non-doctor service      → the service's own per-slot capacity, so
     *     grooming never hides a consultation slot and vice versa;
     *   · same-day past slots are never offered (available=false,
     *     conflict=time_passed in slot_details).
     * With no service the answer is the generic doctor-required view (the
     * common walk-in visit). All keys the legacy caller relied on
     * (slots / display_slots / booked_slots / doctor_available) are kept.
     */
    public function index(Request $r)
    {
        $v = $r->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'service' => ['sometimes', 'nullable', 'string', 'max:100'],
            'service_id' => ['sometimes', 'nullable', 'integer', 'exists:services,id'],
            'doctor_id' => ['sometimes', 'nullable', 'integer', 'exists:doctor_profiles,id'],
            'preferred_time' => ['sometimes','nullable','date_format:H:i'],
            'exclude_id' => ['sometimes', 'nullable', 'integer', 'exists:appointments,id'],
        ]);

        $service = isset($v['service_id'])
            ? Service::findOrFail($v['service_id'])
            : ($r->filled('service')
                ? Service::where('value', $r->string('service'))->first()
                : null);

        $doctorId = isset($v['doctor_id']) ? (int) $v['doctor_id'] : null;
        $excludeId = isset($v['exclude_id']) ? (int) $v['exclude_id'] : null;
        if ($excludeId !== null) {
            $excluded = Appointment::findOrFail($excludeId);
            $actor = $r->user();
            abort_unless(
                $actor && ($actor->role === 'Admin'
                    || ($actor->role === 'User' && (int) $excluded->user_id === (int) $actor->id)),
                403,
                'You cannot exclude an appointment belonging to another owner.'
            );
        }
        $date = $v['date'];

        abort_if(($r->filled('service') || isset($v['service_id'])) && (!$service || !$service->active),422,'service_inactive');
        if (app(\App\Services\ServiceDurationEstimator::class)->available()) {
            $data=app(\App\Services\SchedulingAvailability::class)->day($date,$service,$doctorId,$excludeId,null,$r->user()?->role==='Admin');
            $data['display_slots']=array_map(fn($s)=>$this->display($s),$data['slots']);
            $data['service']=$service ? ['serviceId'=>$service->id,'value'=>$service->value,'label'=>$service->label,
                'requires_doctor'=>AppointmentWorkflow::serviceRequiresDoctor($service),'capacity_per_slot'=>AppointmentWorkflow::serviceRequiresDoctor($service)?$data['doctor_capacity']:AppointmentWorkflow::nonDoctorCapacityPerSlot()] : null;
            $preferred=$v['preferred_time'] ?? null;$recommended=$data['slots'];
            if($preferred) {
                [$h,$m]=array_map('intval',explode(':',$preferred));$target=$h*60+$m;
                usort($recommended,static function($a,$b)use($target){
                    $minutes=static fn($t)=>(int)substr($t,0,2)*60+(int)substr($t,3,2);
                    return abs($minutes($a)-$target)<=>abs($minutes($b)-$target) ?: strcmp($a,$b);
                });
            }
            $data['recommendations']=array_map(fn($time)=>['time'=>$time,'display_time'=>$this->display($time),
                'estimated_end'=>collect($data['slot_details'])->firstWhere('time',$time)['estimated_end'],
                'duration_minutes'=>$data['duration_estimate']['allocated_minutes'] ?? null,'proposal_only'=>true],array_slice($recommended,0,8));
            foreach ($data['slot_details'] as &$detail) unset($detail['free_doctor_ids']);
            unset($detail);
            return $this->ok('Availability loaded.',$data);
        }
        $all = AppointmentWorkflow::slotsFor($date);
        $requiresDoctor = $service
            ? AppointmentWorkflow::serviceRequiresDoctor($service)
            : true;

        // One pass over the day's capacity-holding appointments.
        $holding = Appointment::whereDate('appointment_date', $date)
            ->whereNotIn('status', ['canceled', 'completed', 'no_show'])
            ->when($excludeId, fn ($q) => $q->where('id', '<>', $excludeId))
            ->with('service')
            ->get();

        $onDuty = AppointmentWorkflow::onDutyDoctorIds();
        $capacity = count($onDuty);

        $busyBySlot = [];
        $nonDoctorUsedBySlot = [];

        foreach ($holding as $a) {
            $t = substr((string) $a->appointment_time, 0, 5);

            if ($a->assigned_vet_id !== null) {
                $busyBySlot[$t][(int) $a->assigned_vet_id] = true;
            }

            $svc = $a->service;
            if ($svc && ! AppointmentWorkflow::serviceRequiresDoctor($svc)) {
                $sid = (int) $svc->id;
                $nonDoctorUsedBySlot[$t][$sid] = ($nonDoctorUsedBySlot[$t][$sid] ?? 0) + 1;
            }
        }

        $slots = [];
        $details = [];

        foreach ($all as $t) {
            $busy = array_keys($busyBySlot[$t] ?? []);

            $past = true;
            try {
                $past = Carbon::createFromFormat('Y-m-d H:i', $date.' '.$t)->lte(now());
            } catch (\Throwable) {
                // Unparseable slot — treat as past rather than offering it.
            }

            if ($requiresDoctor) {
                if ($doctorId !== null) {
                    // Explicit doctor: the answer is scoped to THEIR conflict.
                    $used = in_array($doctorId, $busy, true) ? 1 : 0;
                    $cap = 1;
                    $available = $used === 0;
                    $conflict = $available ? null : 'doctor_conflict';
                } else {
                    $used = count(array_intersect($busy, $onDuty));
                    $cap = $capacity;
                    $available = $used < $cap;
                    $conflict = $available
                        ? null
                        : ($cap === 0 ? 'doctor_unavailable' : 'doctor_conflict');
                }
            } else {
                $used = $nonDoctorUsedBySlot[$t][(int) $service->id] ?? 0;
                $cap = AppointmentWorkflow::nonDoctorCapacityPerSlot();
                $available = $used < $cap;
                $conflict = $available ? null : 'resource_capacity_reached';

                // An explicitly selected doctor must also be personally free.
                if ($available && $doctorId !== null && in_array($doctorId, $busy, true)) {
                    $available = false;
                    $conflict = 'doctor_conflict';
                }
            }

            $offered = $available && ! $past;
            if ($offered) $slots[] = $t;

            $details[] = [
                'time' => $t,
                'available' => $offered,
                'past' => $past,
                'used' => $used,
                'capacity' => $cap,
                'conflict' => $past ? 'time_passed' : $conflict,
            ];
        }

        // Legacy semantics: every wall-clock time with any active appointment.
        $booked = $holding
            ->map(fn ($a) => substr((string) $a->appointment_time, 0, 5))
            ->unique()->sort()->values()->all();

        return $this->ok('Availability loaded.', [
            'date' => $date,
            'slots' => $slots,
            'display_slots' => array_map(fn ($s) => $this->display($s), $slots),
            'booked_slots' => $booked,
            'doctor_available' => $capacity > 0,
            'doctor_capacity' => $capacity,
            'service' => $service ? [
                'serviceId' => $service->id,
                'value' => $service->value,
                'label' => $service->label,
                'requires_doctor' => $requiresDoctor,
                'capacity_per_slot' => $requiresDoctor
                    ? $capacity
                    : AppointmentWorkflow::nonDoctorCapacityPerSlot(),
            ] : null,
            'doctor_id' => $doctorId,
            'slot_details' => $details,
        ]);
    }
}
