<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\AppointmentEvent;
use App\Models\AuditLog;
use App\Support\AppointmentWorkflow;
use Illuminate\Support\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Reconciles missed, UNCHECKED confirmed visits after the clinic's grace period.
 * Never deletes a booking, changes a checked-in visit or relies on AI output.
 */
class AppointmentNoShowService
{
    public function countDue(?Carbon $asOf = null): int
    {
        $graceMinutes = max(0, (int) AppointmentWorkflow::settings()->noshow_grace_minutes);
        $cutoff = ($asOf ?? now())->copy()->subMinutes($graceMinutes);
        return $this->dueAppointments($cutoff)->count();
    }

    private function dueAppointments(Carbon $cutoff): Builder
    {
        return Appointment::query()
            ->where('status', 'confirmed')
            ->whereNull('checked_in_at')
            ->where(function ($q) use ($cutoff) {
                $q->whereDate('appointment_date', '<', $cutoff->toDateString())
                    ->orWhere(function ($sameDay) use ($cutoff) {
                        $sameDay->whereDate('appointment_date', $cutoff->toDateString())
                            ->whereTime('appointment_time', '<=', $cutoff->format('H:i:s'));
                    });
            });
    }

    public function reconcile(?Carbon $asOf = null): int
    {
        $graceMinutes = max(0, (int) AppointmentWorkflow::settings()->noshow_grace_minutes);
        $cutoff = ($asOf ?? now())->copy()->subMinutes($graceMinutes);
        $changed = 0;

        // Preselect overdue rows without loading the whole appointment table.
        // The row is locked and eligibility rechecked again within a transaction.
        $this->dueAppointments($cutoff)
            ->select('id')
            ->chunkById(100, function ($batch) use ($cutoff, $graceMinutes, &$changed): void {
                foreach ($batch as $candidate) {
                    $updated = DB::transaction(function () use ($candidate, $cutoff, $graceMinutes): bool {
                        $appointment = Appointment::whereKey($candidate->id)
                            ->lockForUpdate()
                            ->first();

                        if (! $appointment || $appointment->status !== 'confirmed'
                            || $appointment->checked_in_at !== null) {
                            return false;
                        }

                        $scheduled = Carbon::parse(
                            $appointment->appointment_date->format('Y-m-d').' '.(string) $appointment->appointment_time,
                            config('app.timezone', 'Asia/Manila')
                        );
                        if ($scheduled->gt($cutoff)) {
                            return false;
                        }

                        $appointment->status = 'no_show';
                        $appointment->save();

                        // 'System' actor values are permitted by this patch's migration.
                        // Record automated transitions without attributing them to an Admin.
                        (new AppointmentEvent)->forceFill([
                            'appointment_id' => $appointment->id,
                            'event_type' => 'no_show',
                            'old_date' => $appointment->appointment_date,
                            'old_time' => $appointment->appointment_time,
                            'new_date' => $appointment->appointment_date,
                            'new_time' => $appointment->appointment_time,
                            'actor_type' => 'System',
                            'actor_id' => null,
                            'metadata' => [
                                'previousStatus' => 'confirmed',
                                'newStatus' => 'no_show',
                                'automated' => true,
                                'graceMinutes' => $graceMinutes,
                                'reason' => 'no_check_in_after_grace',
                            ],
                        ])->save();

                        (new AuditLog)->forceFill([
                            'actor_type' => 'System',
                            'actor_id' => null,
                            'actor_name' => 'System',
                            'action' => 'appointment_no_show',
                            'entity_type' => 'appointment',
                            'entity_id' => $appointment->id,
                            'reference_no' => $appointment->reference_no,
                            'description' => 'System marked '.$appointment->reference_no.' as no-show after the check-in grace period.',
                            'metadata' => [
                                'previousStatus' => 'confirmed',
                                'newStatus' => 'no_show',
                                'automated' => true,
                                'graceMinutes' => $graceMinutes,
                            ],
                        ])->save();

                        return true;
                    });

                    if ($updated) {
                        ++$changed;
                    }
                }
            });

        return $changed;
    }
}
