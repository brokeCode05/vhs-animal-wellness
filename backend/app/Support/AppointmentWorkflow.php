<?php

namespace App\Support;

use App\Models\Appointment;
use App\Models\ClinicSetting;
use App\Models\DoctorProfile;
use App\Models\Service;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AppointmentWorkflow
{
    /*
     * RESOURCE MODEL — backend is the single source of truth.
     *
     * Services split into two resource classes, mirroring the canonical
     * SERVICE_SCHEDULING table in shared/mock-users.js:
     *   · doctor-required → consumes one On Duty doctor for the exact slot;
     *   · non-doctor      → consumes only its own per-slot capacity
     *                        (grooming, boarding, confinement, home service)
     *                        and never touches doctor capacity.
     * Fail CLOSED: any service value not listed below counts as
     * doctor-required, so an unknown/retired service can never silently
     * free a doctor slot.
     */
    private const NON_DOCTOR_SERVICE_VALUES = [
        'dog_grooming', 'cat_grooming', 'boarding', 'confinement', 'home_service',
    ];

    /** Per-slot capacity of ONE non-doctor service (capacityPerSlot in the canonical catalog). */
    private const NON_DOCTOR_CAPACITY_PER_SLOT = 2;

    /** Statuses that DO NOT hold capacity (neither a slot nor a doctor). */
    private const RELEASING_STATUSES = ['canceled', 'completed', 'no_show'];

    public static function settings(): ClinicSetting
    {
        /*
         * ClinicSetting is fully guarded, so firstOrCreate(['id' => 1])
         * explodes with a mass-assignment error on any database that does
         * not already have the singleton row (every fresh install / test
         * database). Load it by key and create it explicitly instead.
         */
        $settings = ClinicSetting::whereKey(1)->first();

        if ($settings === null) {
            $settings = new ClinicSetting;
            $settings->forceFill(['id' => 1]);
            $settings->save();
        }

        return $settings;
    }

    public static function timeToHHMM(?string $value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') return null;
        foreach (['H:i', 'H:i:s', 'g:i A', 'g:i a'] as $format) {
            try {
                $d = Carbon::createFromFormat($format, $value);
                if ($d && $d->format($format) === $value) return $d->format('H:i');
            } catch (\Throwable) {}
        }
        if (preg_match('/^(\d{1,2}):(\d{2})(?::\d{2})?$/', $value, $m)) {
            $h=(int)$m[1];$min=(int)$m[2];
            if($h>=0&&$h<=23&&$min>=0&&$min<=59) return sprintf('%02d:%02d',$h,$min);
        }
        return null;
    }

    public static function slotsFor(string $date): array
    {
        $d = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();
        $s = self::settings();
        $weekend = $d->isWeekend();
        $first = self::timeToHHMM($weekend ? $s->weekend_first : $s->weekday_first);
        $last = self::timeToHHMM($weekend ? $s->weekend_last : $s->weekday_last);
        if (!$first || !$last) return [];
        [$fh,$fm]=array_map('intval',explode(':',$first)); [$lh,$lm]=array_map('intval',explode(':',$last));
        $start=$fh*60+$fm;$end=$lh*60+$lm;$step=max(15,(int)$s->slot_interval_minutes);
        if($end<$start)return [];
        $out=[]; for($m=$start;$m<=$end;$m+=$step){$out[]=sprintf('%02d:%02d',intdiv($m,60),$m%60);} return $out;
    }

    // ── SERVICE CLASSIFICATION ──────────────────────────────────────────

    /**
     * True when the service needs a veterinarian present. Non-doctor
     * services (grooming / boarding / confinement / home service) draw from
     * their own per-slot capacity instead of the doctor pool. Unknown or
     * retired service values fail CLOSED as doctor-required.
     */
    public static function serviceRequiresDoctor(Service $service): bool
    {
        return ! in_array($service->value, self::NON_DOCTOR_SERVICE_VALUES, true);
    }

    /** Per-slot capacity of ONE non-doctor service. */
    public static function nonDoctorCapacityPerSlot(): int
    {
        return self::NON_DOCTOR_CAPACITY_PER_SLOT;
    }

    // ── CAPACITY QUERIES ────────────────────────────────────────────────

    /** Active appointments that still hold capacity at one exact slot. */
    private static function holdingQuery(string $date, string $time, ?int $excludeId = null)
    {
        $q = Appointment::whereDate('appointment_date', $date)
            ->whereTime('appointment_time', $time . ':00')
            ->whereNotIn('status', self::RELEASING_STATUSES);

        if ($excludeId) $q->where('id', '<>', $excludeId);

        return $q;
    }

    /** Doctor ids with an active appointment at this exact slot (any service). */
    public static function busyDoctorIdsAt(string $date, string $time, ?int $excludeId = null): array
    {
        return self::holdingQuery($date, $time, $excludeId)
            ->whereNotNull('assigned_vet_id')
            ->distinct()
            ->pluck('assigned_vet_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** True when doctor $doctorId already holds an appointment at this exact slot. */
    public static function doctorBusyAt(string $date, string $time, int $doctorId, ?int $excludeId = null): bool
    {
        return self::holdingQuery($date, $time, $excludeId)
            ->where('assigned_vet_id', $doctorId)
            ->exists();
    }

    /** Active appointments of one non-doctor service holding this slot. */
    public static function nonDoctorUsedAt(string $date, string $time, int $serviceId, ?int $excludeId = null): int
    {
        return (int) self::holdingQuery($date, $time, $excludeId)
            ->where('service_id', $serviceId)
            ->count();
    }

    /** Active On Duty veterinarians (profile + account + user all active). */
    public static function onDutyDoctorIds(): array
    {
        return DoctorProfile::query()
            ->where('account_status', 'active')
            ->where('availability_status', 'on_duty')
            ->whereHas('user', fn ($q) => $q->where('status', 'active'))
            ->orderBy('id')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Least-loaded On Duty doctor FREE at this exact slot — the existing
     * least-loaded rule (day load, ties to the lowest doctor_profiles id),
     * narrowed so one doctor can never hold two appointments at the same
     * time. Returns null when every eligible doctor is busy.
     */
    public static function freeDoctorIdAt(string $date, string $time, ?int $excludeId = null): ?int
    {
        $busy = array_flip(self::busyDoctorIdsAt($date, $time, $excludeId));
        $free = array_values(array_filter(
            self::onDutyDoctorIds(),
            fn ($id) => ! isset($busy[$id])
        ));

        if (! $free) return null;

        $loads = Appointment::query()
            ->whereIn('assigned_vet_id', $free)
            ->whereDate('appointment_date', $date)
            ->whereNotIn('status', self::RELEASING_STATUSES)
            ->when($excludeId, fn ($q) => $q->where('id', '<>', $excludeId))
            ->groupBy('assigned_vet_id')
            ->selectRaw('assigned_vet_id, COUNT(*) as load_count')
            ->get()
            ->keyBy('assigned_vet_id');

        usort($free, function ($a, $b) use ($loads) {
            $la = (int) ($loads[$a]->load_count ?? 0);
            $lb = (int) ($loads[$b]->load_count ?? 0);

            return $la === $lb ? $a <=> $b : $la <=> $lb;
        });

        return $free[0];
    }

    /**
     * Source-of-truth slot validation for a booking or reschedule, in order:
     *   1. inside the clinic's configured slots for that date;
     *   2. not in the past — a same-day time that has already started is
     *      rejected here even when the frontend filtering failed;
     *   3. resource capacity for the booked service:
     *        · doctor-required → at least one On Duty doctor must be free at
     *          this exact slot, or — when a vet was explicitly requested —
     *          THAT doctor must be free;
     *        · non-doctor      → the service's own per-slot capacity, and an
     *          explicitly requested doctor must also be free (they are then
     *          personally booked).
     */
    public static function validateSlot(
        string $date,
        string $time,
        Service $service,
        ?int $requestedVetId = null,
        ?int $excludeId = null
    ): void {
        abort_unless(in_array($time, self::slotsFor($date), true), 422, 'Appointment time is outside clinic booking slots.');

        $scheduled = Carbon::createFromFormat('Y-m-d H:i', $date.' '.$time);
        abort_if($scheduled->lte(now()), 422, 'appointment_time_passed');

        if (self::serviceRequiresDoctor($service)) {
            abort_if(
                $requestedVetId !== null
                    && self::doctorBusyAt($date, $time, $requestedVetId, $excludeId),
                422,
                'The selected veterinarian is already booked at that time. Choose a different doctor or time.'
            );

            if ($requestedVetId === null) {
                abort_if(
                    self::onDutyDoctorIds() === [],
                    422,
                    'No on-duty veterinarian is available for this appointment.'
                );

                abort_unless(
                    self::freeDoctorIdAt($date, $time, $excludeId),
                    422,
                    'No veterinarian is free at that time. Please choose a different slot.'
                );
            }
        } else {
            abort_if(
                self::nonDoctorUsedAt($date, $time, $service->id, $excludeId)
                    >= self::NON_DOCTOR_CAPACITY_PER_SLOT,
                422,
                'That time is already fully booked for this service. Please choose a different slot.'
            );

            if ($requestedVetId !== null) {
                abort_if(
                    self::doctorBusyAt($date, $time, $requestedVetId, $excludeId),
                    422,
                    'The selected veterinarian is already booked at that time. Choose a different doctor or time.'
                );
            }
        }
    }

    /**
     * Serialize scheduling decisions through the single clinic-settings row.
     * This keeps the existing schema intact while preventing two concurrent
     * requests from both passing the slot check before either insert commits.
     */
    public static function lockSchedulingGate(): void
    {
        self::settings();
        ClinicSetting::whereKey(1)->lockForUpdate()->first();
    }

    public static function cutoffBlocked(Appointment $a, string $kind): bool
    {
        $s=self::settings();
        $mins=$kind==='cancel'?(int)$s->cancel_cutoff_minutes:(int)$s->reschedule_cutoff_minutes;
        $when=Carbon::parse($a->appointment_date->format('Y-m-d').' '.substr((string)$a->appointment_time,0,5));
        return now()->diffInMinutes($when,false) <= $mins;
    }

    public static function referenceNo(string $date): string
    {
        $prefix='VHS-'.str_replace('-','',$date).'-';
        for($i=0;$i<50;$i++){
            $suffix=str_pad((string)random_int(1,9999),4,'0',STR_PAD_LEFT);
            $ref=$prefix.$suffix;
            if(!Appointment::where('reference_no',$ref)->exists())return $ref;
        }
        return $prefix.strtoupper(substr(bin2hex(random_bytes(4)),0,4));
    }

    public static function canTransition(string $from, string $to): bool
    {
        return in_array($from.'>'.$to,[
            'confirmed>checked_in','checked_in>in_consultation','in_consultation>completed',
            'confirmed>canceled','pending>canceled','pending>confirmed','rescheduled>canceled','rescheduled>confirmed',
        ],true);
    }

    public static function transitionAction(string $to): string
    {
        return match($to){
            'checked_in'=>'patient_checked_in','in_consultation'=>'consultation_started','completed'=>'consultation_completed',
            'canceled'=>'appointment_canceled','confirmed'=>'appointment_approved','no_show'=>'appointment_no_show',default=>'appointment_updated'
        };
    }
}
