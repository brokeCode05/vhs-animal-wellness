<?php

namespace App\Support;

use App\Models\Appointment;
use App\Models\ClinicSetting;
use App\Models\DoctorProfile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AppointmentWorkflow
{
    public static function settings(): ClinicSetting
    {
        return ClinicSetting::firstOrCreate(['id' => 1]);
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

    public static function slotTaken(string $date, string $time, ?int $excludeId = null): bool
    {
        $q=Appointment::whereDate('appointment_date',$date)->whereTime('appointment_time',$time.':00')->whereNotIn('status',['canceled','completed','no_show']);
        if($excludeId)$q->where('id','<>',$excludeId);
        return $q->exists();
    }

    public static function validateSlot(string $date, string $time, ?int $excludeId = null): void
    {
        abort_unless(in_array($time,self::slotsFor($date),true),422,'Appointment time is outside clinic booking slots.');
        $scheduled = Carbon::createFromFormat('Y-m-d H:i', $date.' '.$time);
        abort_if($scheduled->lte(now()), 422, 'appointment_time_passed');
        abort_if(self::slotTaken($date,$time,$excludeId),409,'slot_taken');
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

    public static function hasAvailableDoctor(): bool
    {
        return DoctorProfile::query()
            ->where('account_status', 'active')
            ->where('availability_status', 'on_duty')
            ->exists();
    }

    public static function assignedDoctorId(string $date): ?int
    {
        $doctor=DoctorProfile::query()
            ->where('account_status','active')->where('availability_status','on_duty')
            ->withCount(['appointments'=>fn($q)=>$q->whereDate('appointment_date',$date)->whereNotIn('status',['canceled','completed','no_show'])])
            ->orderBy('appointments_count')->orderBy('id')->first();
        return $doctor?->id;
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
