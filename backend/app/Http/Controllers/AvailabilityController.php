<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Support\ApiResponse;
use App\Support\AppointmentWorkflow;
use Illuminate\Http\Request;

class AvailabilityController extends Controller
{
    use ApiResponse;

    private function display(string $hhmm): string
    {
        [$h,$m]=array_map('intval',explode(':',$hhmm));
        $ampm=$h>=12?'PM':'AM';$h12=$h%12?:12;
        return $h12.':'.str_pad((string)$m,2,'0',STR_PAD_LEFT).' '.$ampm;
    }

    public function index(Request $r)
    {
        $v=$r->validate(['date'=>['required','date_format:Y-m-d'],'exclude_id'=>['sometimes','nullable','integer','exists:appointments,id']]);
        $all=AppointmentWorkflow::slotsFor($v['date']);
        $q=Appointment::whereDate('appointment_date',$v['date'])->whereNotIn('status',['canceled','completed','no_show']);
        if(!empty($v['exclude_id']))$q->where('id','<>',(int)$v['exclude_id']);
        $taken=$q->pluck('appointment_time')->map(fn($t)=>substr((string)$t,0,5))->unique()->values()->all();
        $doctorAvailable = AppointmentWorkflow::hasAvailableDoctor();

        $available = $doctorAvailable
            ? array_values(array_filter($all,function($s) use($taken,$v){
                if(in_array($s,$taken,true)) return false;
                try { return \Illuminate\Support\Carbon::createFromFormat('Y-m-d H:i',$v['date'].' '.$s)->gt(now()); }
                catch (\Throwable) { return false; }
            }))
            : [];

        return $this->ok('Availability loaded.', [
            'date' => $v['date'],
            'slots' => $available,
            'display_slots' => array_map(fn($s) => $this->display($s), $available),
            'booked_slots' => $taken,
            'doctor_available' => $doctorAvailable,
        ]);
    }
}
