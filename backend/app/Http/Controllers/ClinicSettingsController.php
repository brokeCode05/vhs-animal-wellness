<?php

namespace App\Http\Controllers;

use App\Models\ClinicSetting;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;

class ClinicSettingsController extends Controller
{
    use ApiResponse;
    private function setting(): ClinicSetting { return ClinicSetting::firstOrCreate(['id'=>1]); }
    public function show(){ return $this->ok('Clinic settings loaded.',['settings'=>VhsPresenter::settings($this->setting())]); }
    public function update(Request $r)
    {
        $v=$r->validate([
            'hours.weekday.firstAppointment'=>['sometimes','date_format:H:i'],'hours.weekday.lastAppointment'=>['sometimes','date_format:H:i'],
            'hours.weekend.firstAppointment'=>['sometimes','date_format:H:i'],'hours.weekend.lastAppointment'=>['sometimes','date_format:H:i'],
            'slotIntervalMinutes'=>['sometimes','integer','min:15','max:240'],'cancellationCutoffMinutes'=>['sometimes','integer','min:0','max:10080'],
            'rescheduleCutoffMinutes'=>['sometimes','integer','min:0','max:10080'],'noShowGraceMinutes'=>['sometimes','integer','min:0','max:1440'],
            'clinicInfo.name'=>['sometimes','string','max:120'],'clinicInfo.phone'=>['sometimes','nullable','string','max:30'],'clinicInfo.email'=>['sometimes','nullable','email','max:191'],'clinicInfo.website'=>['sometimes','nullable','string','max:191'],'clinicInfo.address'=>['sometimes','nullable','string','max:255'],
        ]);
        $s=$this->setting();$before=VhsPresenter::settings($s);
        $map=['hours.weekday.firstAppointment'=>'weekday_first','hours.weekday.lastAppointment'=>'weekday_last','hours.weekend.firstAppointment'=>'weekend_first','hours.weekend.lastAppointment'=>'weekend_last','slotIntervalMinutes'=>'slot_interval_minutes','cancellationCutoffMinutes'=>'cancel_cutoff_minutes','rescheduleCutoffMinutes'=>'reschedule_cutoff_minutes','noShowGraceMinutes'=>'noshow_grace_minutes','clinicInfo.name'=>'clinic_name','clinicInfo.phone'=>'clinic_phone','clinicInfo.email'=>'clinic_email','clinicInfo.website'=>'clinic_website','clinicInfo.address'=>'clinic_address'];
        foreach($map as $key=>$col){ if(data_get($v,$key,null)!==null || array_key_exists(last(explode('.',$key)),(array)data_get($v,substr($key,0,strrpos($key,'.')),[]))) $s->$col=data_get($v,$key); }
        abort_if(strtotime('1970-01-01 '.$s->weekday_last)<strtotime('1970-01-01 '.$s->weekday_first),422,'Weekday last appointment must be after first appointment.');
        abort_if(strtotime('1970-01-01 '.$s->weekend_last)<strtotime('1970-01-01 '.$s->weekend_first),422,'Weekend last appointment must be after first appointment.');
        $s->save(); AuditWriter::write($r->user(),'clinic_settings_updated','clinic_settings',$s->id,$r->user()->name.' updated clinic settings.',null,['previous'=>$before,'new'=>VhsPresenter::settings($s)]);
        return $this->ok('Clinic settings updated.',['settings'=>VhsPresenter::settings($s)]);
    }
}
