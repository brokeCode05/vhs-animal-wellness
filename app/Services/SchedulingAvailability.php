<?php
namespace App\Services;

use App\Models\{Appointment, DoctorProfile, Service};
use App\Support\AppointmentWorkflow;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** One full-interval resource model for recommendations and final booking revalidation. */
final class SchedulingAvailability
{
    public function __construct(private ServiceDurationEstimator $durations) {}

    public function day(string $date, ?Service $service, ?int $doctorId = null, ?int $excludeId = null, ?array $allocation = null, bool $allowOffDuty = false, array $additionalStarts = []): array
    {
        $settingsQuery = \App\Models\ClinicSetting::whereKey(1);
        $settings = (DB::transactionLevel() ? $settingsQuery->lockForUpdate() : $settingsQuery)->first() ?? AppointmentWorkflow::settings();
        $estimate = $allocation ?? ($service ? $this->durations->allocation($service) : ['minutes'=>null,'allocated_minutes'=>null,'source'=>'unknown','sample_count'=>0]);
        $window = ($settings->operating_hours ?? [])[strtolower(Carbon::parse($date)->format('l'))] ?? ['status'=>'unknown'];
        $from = Carbon::parse($date)->subDays(2)->toDateString(); $to = Carbon::parse($date)->addDays(2)->toDateString();
        $query = Appointment::with('service')->whereBetween('appointment_date', [$from,$to])
            ->whereNotIn('status', ['canceled','completed','no_show'])->when($excludeId, fn ($q) => $q->whereKeyNot($excludeId));
        // Current reads are essential under InnoDB REPEATABLE READ, including an
        // OTP transaction that read owner/service data before taking the gate.
        $holding = (DB::transactionLevel() ? $query->lockForUpdate() : $query)->get();
        $rows=[]; $unknownCount=0;
        foreach ($holding as $a) {
            $snapshot=$this->durations->existing($a);
            $start=Carbon::parse($a->appointment_date->format('Y-m-d').' '.substr((string)$a->appointment_time,0,5))->getTimestamp();
            $minutes=$snapshot['allocated_minutes'] ?? null;
            $end=is_numeric($minutes) && $minutes>0 && $minutes<=2880 ? $start+(int)$minutes*60 : null;
            if ($end===null) $unknownCount++;
            $rows[]=['start'=>$start,'end'=>$end,'doctor'=>$a->assigned_vet_id===null?null:(int)$a->assigned_vet_id,
                'service'=>(int)$a->service_id,'requires_doctor'=>$a->service ? AppointmentWorkflow::serviceRequiresDoctor($a->service) : true];
        }
        $doctorQuery=DoctorProfile::query()->where('account_status','active')->whereHas('user', fn($q)=>$q->where('status','active'));
        $doctors=(DB::transactionLevel() ? $doctorQuery->lockForUpdate() : $doctorQuery)->get(['id','availability_status']);
        $onDuty=$doctors->where('availability_status','on_duty')->pluck('id')->map(fn($id)=>(int)$id)->values()->all();
        $active=$doctors->pluck('id')->map(fn($id)=>(int)$id)->all();
        $requiresDoctor=$service ? AppointmentWorkflow::serviceRequiresDoctor($service) : true;
        $details=[];$slots=[];
        foreach (array_unique(array_merge(AppointmentWorkflow::slotsFor($date),$additionalStarts)) as $time) {
            $start=Carbon::parse($date.' '.$time);$stamp=$start->getTimestamp();
            $minutes=$estimate['allocated_minutes'] ?? null;
            $end=is_numeric($minutes) && $minutes>0 && $minutes<=2880 ? $stamp+(int)$minutes*60 : null;
            $past=$start->lte(now());$conflict=null;
            if ($service && !$service->active) $conflict='service_inactive';
            if (($window['status'] ?? 'unknown')==='closed') $conflict='clinic_closed';
            if (($window['status'] ?? 'unknown')==='open' && !empty($window['open']) && !empty($window['close'])) {
                $opens=Carbon::parse($date.' '.$window['open'])->getTimestamp();$closes=Carbon::parse($date.' '.$window['close'])->getTimestamp();
                if ($stamp<$opens || $stamp>=$closes) $conflict='outside_operating_hours';
                elseif ($end!==null && $end>$closes) $conflict='duration_exceeds_closing';
            }
            $overlap=array_values(array_filter($rows,fn($r)=>self::overlaps($stamp,$end,$r['start'],$r['end'])));
            $busy=[];
            foreach($overlap as $r)if($r['doctor']!==null)$busy[$r['doctor']]=true;
            $free=array_values(array_filter($onDuty,fn($id)=>!isset($busy[$id])));
            $unassigned=array_values(array_filter($overlap,fn($r)=>$r['requires_doctor'] && $r['doctor']===null));
            $reserved=self::peak($unassigned,$stamp,$end);
            if ($requiresDoctor) {
                $used=count($onDuty)-count($free)+$reserved;$capacity=count($onDuty);
                $resourceConflict=null;
                if ($doctorId!==null) {
                    $capacity=1;$used=isset($busy[$doctorId])?1:0;
                    if (!in_array($doctorId,$active,true) || (!$allowOffDuty && !in_array($doctorId,$onDuty,true))) $resourceConflict='doctor_unavailable';
                    elseif(isset($busy[$doctorId]) || (in_array($doctorId,$onDuty,true) && count($free)<=$reserved))$resourceConflict='doctor_conflict';
                } elseif(count($free)<=$reserved) $resourceConflict=$onDuty===[]?'doctor_unavailable':'doctor_conflict';
            } else {
                $resourceRows=array_values(array_filter($overlap,fn($r)=>$r['service']===(int)$service->id));
                $used=self::peak($resourceRows,$stamp,$end);$capacity=AppointmentWorkflow::nonDoctorCapacityPerSlot();
                $resourceConflict=$used >= $capacity?'resource_capacity_reached':null;
                if ($doctorId!==null) {
                    if(!in_array($doctorId,$active,true) || (!$allowOffDuty && !in_array($doctorId,$onDuty,true)))$resourceConflict='doctor_unavailable';
                    elseif(isset($busy[$doctorId]))$resourceConflict='doctor_conflict';
                }
            }
            $conflict=$past?'time_passed':($conflict ?? $resourceConflict);
            $available=$conflict===null;
            if($available)$slots[]=$time;
            $details[]=['time'=>$time,'available'=>$available,'past'=>$past,'used'=>$used,'capacity'=>$capacity,'conflict'=>$conflict,
                'resource_available'=>$resourceConflict===null,
                'estimated_end'=>$end===null?null:Carbon::createFromTimestamp($end,config('app.timezone'))->toIso8601String(),
                'free_doctor_ids'=>count($free)>$reserved?$free:[]];
        }
        return ['date'=>$date,'slots'=>$slots,'slot_details'=>$details,'doctor_available'=>$onDuty!==[],'doctor_capacity'=>count($onDuty),
            'doctor_id'=>$doctorId,'duration_estimate'=>$estimate,'operating_hours_status'=>$window['status'] ?? 'unknown',
            'unknown_existing_duration_count'=>$unknownCount,
            'duration_warning'=>($estimate['allocated_minutes'] ?? null)===null?'Duration unknown; existing start-slot booking rules apply.':null,
            'closing_warning'=>($window['status'] ?? 'unknown')==='unknown'?'Clinic closing time is not verified.':null,
            'buffer_warning'=>($estimate['buffer_minutes'] ?? null)===null?'No additional scheduling buffer is configured.':null,
            'booked_slots'=>$holding->filter(fn($a)=>$a->appointment_date->format('Y-m-d')===$date)->map(fn($a)=>substr((string)$a->appointment_time,0,5))->unique()->sort()->values()->all()];
    }

    public static function overlaps(int $a, ?int $ae, int $b, ?int $be): bool
    {
        if($ae===null && $be===null)return $a===$b;
        if($ae===null)return $a>=$b && $a<$be;
        if($be===null)return $b>=$a && $b<$ae;
        return $a<$be && $b<$ae;
    }

    /** Peak simultaneous use, not number of visits that overlap different portions. */
    private static function peak(array $rows,int $start,?int $end): int
    {
        $points=[$start];
        foreach($rows as $r)if($r['start']>=$start && ($end===null?$r['start']===$start:$r['start']<$end))$points[]=$r['start'];
        $peak=0;
        foreach(array_unique($points) as $point) {
            $count=0;
            foreach($rows as $r)if($r['end']===null?$point===$r['start']:($r['start']<=$point && $point<$r['end']))$count++;
            $peak=max($peak,$count);
        }
        return $peak;
    }

    public function slot(string $date,string $time,?Service $service,?int $doctorId=null,?int $excludeId=null,?array $allocation=null,bool $allowOffDuty=false,bool $arrival=false): ?array
    {
        $day=$this->day($date,$service,$doctorId,$excludeId,$allocation,$allowOffDuty,$arrival?[$time]:[]);
        return collect($day['slot_details'])->firstWhere('time',$time);
    }

    public function freeDoctorId(string $date,string $time,?Service $service=null,?int $excludeId=null,?array $allocation=null,bool $arrival=false): ?int
    {
        $slot=$this->slot($date,$time,$service,null,$excludeId,$allocation,false,$arrival);
        if(!$slot || !($arrival ? $slot['resource_available'] : $slot['available']))return null;
        $ids=$slot['free_doctor_ids'];if(!$ids)return null;
        $loads=Appointment::whereDate('appointment_date',$date)->whereIn('assigned_vet_id',$ids)
            ->whereNotIn('status',['canceled','completed','no_show'])->when($excludeId,fn($q)=>$q->whereKeyNot($excludeId))
            ->selectRaw('assigned_vet_id, COUNT(*) as total')->groupBy('assigned_vet_id')->pluck('total','assigned_vet_id');
        usort($ids,fn($a,$b)=>(int)($loads[$a]??0)<=>(int)($loads[$b]??0) ?: $a<=>$b);
        return $ids[0];
    }
}
