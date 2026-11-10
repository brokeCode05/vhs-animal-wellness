<?php

namespace App\Services;

use App\Models\{Appointment, AppointmentEvent, User};
use App\Support\{AppointmentWorkflow, AuditWriter};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

/** One transaction for reception and QR arrival; browser stores never decide status. */
final class AppointmentCheckIn
{
    public function eligible(Appointment $appointment): bool
    {
        $scheduled = Carbon::parse($appointment->appointment_date->format('Y-m-d').' '.substr((string) $appointment->appointment_time, 0, 5));
        return $scheduled->isSameDay(now()) && now()->gte($scheduled->copy()->subHours(2));
    }

    public function checkIn(int $id, User $actor, string $method): Appointment
    {
        abort_unless($actor->role === 'Admin' || ($actor->role === 'User' && in_array($method,['clinic_qr','clinic_qr_otp'],true)), 403, 'Access denied.');
        return DB::transaction(function () use ($id, $actor, $method) {
            AppointmentWorkflow::lockSchedulingGate();
            $a = Appointment::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($actor->role === 'Admin' || $a->user_id === $actor->id, 403, 'This appointment does not belong to you.');
            // A retried request after a lost response is safe and creates no second event.
            if ($a->checked_in_at && in_array($a->status, ['checked_in', 'in_consultation', 'completed'], true)) return $a;
            abort_unless($a->status === 'confirmed', 422, 'Only a confirmed appointment can be checked in.');
            abort_unless($this->eligible($a), 422, 'Check-in opens two hours before the appointment, on the appointment date.');
            if ($a->assigned_vet_id === null) {
                $service = $a->service()->first();
                if ($service && AppointmentWorkflow::serviceRequiresDoctor($service)) {
                    $estimate = app(ServiceDurationEstimator::class)->existing($a);
                    // Arrival may be after the scheduled start; only resource conflicts
                    // matter here, not whether this is still a new bookable start.
                    $doctorId = app(SchedulingAvailability::class)->freeDoctorId($a->appointment_date->format('Y-m-d'), substr((string) $a->appointment_time, 0, 5), $service, $a->id, $estimate, true);
                    abort_unless($doctorId, 422, 'No on-duty veterinarian is available for this appointment.');
                    $a->assigned_vet_id = $doctorId;
                }
            }
            $a->status = 'checked_in';
            $a->checked_in_at = now();
            $a->save();
            (new AppointmentEvent)->forceFill([
                'appointment_id' => $a->id, 'event_type' => 'checked_in',
                'old_date' => $a->appointment_date, 'old_time' => $a->appointment_time,
                'new_date' => $a->appointment_date, 'new_time' => $a->appointment_time,
                'actor_type' => $actor->role, 'actor_id' => $actor->id,
                'metadata' => ['previousStatus' => 'confirmed', 'newStatus' => 'checked_in', 'method' => $method],
            ])->save();
            AuditWriter::write($actor, AppointmentWorkflow::transitionAction('checked_in'), 'appointment', $a->id, $actor->name.' checked in '.$a->reference_no.'.', $a->reference_no, ['method' => $method]);
            return $a;
        });
    }
}
