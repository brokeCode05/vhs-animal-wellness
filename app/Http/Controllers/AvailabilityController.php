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
            'exclude_id' => ['sometimes', 'nullable', 'integer', 'exists:appointments,id'],
        ]);

        $service = isset($v['service_id'])
            ? Service::findOrFail($v['service_id'])
            : ($r->filled('service')
                ? Service::where('value', $r->string('service'))->first()
                : null);

        $doctorId = isset($v['doctor_id']) ? (int) $v['doctor_id'] : null;
        $excludeId = isset($v['exclude_id']) ? (int) $v['exclude_id'] : null;
        $date = $v['date'];

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
