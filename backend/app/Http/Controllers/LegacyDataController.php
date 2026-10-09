<?php

namespace App\Http\Controllers;

use App\Models\Appointment;
use App\Models\AppointmentEvent;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Services\OtpService;
use App\Support\AppointmentWorkflow;
use App\Support\AuditWriter;
use App\Support\Identity;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class LegacyDataController extends Controller
{
    public function __construct(private OtpService $otp) {}

    private function legacyAppointment(Appointment $a): array
    {
        $a->loadMissing(['user','pet','service','veterinarian.user']);
        $p = VhsPresenter::appointment($a);
        return [
            'id' => $a->id,
            'appointment_id' => $a->id,
            'appointmentId' => $a->id,
            'reference_no' => $a->reference_no,
            'referenceNo' => $a->reference_no,
            'user_id' => $a->user_id,
            'userId' => $a->user_id,
            'pet_id' => $a->pet_id,
            'petId' => $a->pet_id,
            'staff_id' => $a->assigned_vet_id,
            'service' => $a->service?->value ?? $a->service_label_at_booking,
            'service_label' => $a->service_label_at_booking,
            'date' => $a->appointment_date?->format('Y-m-d'),
            'appointment_date' => $a->appointment_date?->format('Y-m-d'),
            'time' => substr((string)$a->appointment_time,0,5),
            'appointment_time' => substr((string)$a->appointment_time,0,5),
            'notes' => $a->notes ?? '',
            'status' => $a->status,
            'created_at' => optional($a->created_at)->toDateTimeString(),
            'owner_name' => $p['owner_name'],
            'owner_phone' => $p['owner_phone'],
            'pet_name' => $p['pet_name'],
            'pet_type' => $p['pet_type'],
            'pet_breed' => $p['pet_breed'],
            'vet_name' => $p['vet_name'],
            'visit_context' => $a->visit_context,
            'custom_visit_context' => $a->custom_visit_context,
            'checked_in_at' => optional($a->checked_in_at)->toIso8601String(),
        ];
    }

    private function appointmentQuery(Request $r)
    {
        $q = Appointment::with(['user','pet','service','veterinarian.user']);
        $u = $r->user();
        if ($u->role === 'User') $q->where('user_id', $u->id);
        elseif ($u->role === 'Doctor') $q->where('assigned_vet_id', $u->doctorProfile?->id ?? -1);
        if ($r->filled('status')) $q->where('status', $r->string('status'));
        if ($r->filled('date')) $q->whereDate('appointment_date', $r->string('date'));
        if ($r->filled('reference_no')) $q->where('reference_no', trim((string) $r->input('reference_no')));
        if ($r->filled('id')) $q->whereKey((int) $r->input('id'));
        if ($u->role === 'Admin' && $r->filled('user_id')) $q->where('user_id', (int)$r->input('user_id'));
        return $q;
    }

    public function getUsers(Request $r)
    {
        abort_unless($r->user()->role === 'Admin', 403, 'Access denied.');
        $q = User::where('role','User')->orderBy('created_at');
        if ($r->filled('status')) $q->where('status', $r->string('status'));
        return response()->json($q->get()->map(fn($u) => [
            'id'=>$u->id,'userId'=>$u->id,'fullName'=>$u->name,
            'firstName'=>$u->first_name,'middleName'=>$u->middle_name ?? '', 'lastName'=>$u->last_name,
            'email'=>$u->email,'phone'=>$u->phone ?? '','address'=>$u->address ?? '',
            'bday'=>optional($u->birthdate)->format('Y-m-d') ?? '','status'=>$u->status,
            'created_at'=>optional($u->created_at)->toDateTimeString(),
        ])->values());
    }

    public function getPets(Request $r)
    {
        $q = Pet::with('owner')->orderByDesc('created_at');
        $u = $r->user();
        if ($u->role === 'User') $q->where('owner_id',$u->id);
        elseif ($u->role === 'Doctor') {
            $ownerIds = Appointment::where('assigned_vet_id',$u->doctorProfile?->id ?? -1)->pluck('user_id')->unique();
            $q->whereIn('owner_id',$ownerIds);
        } elseif ($r->filled('user_id')) $q->where('owner_id',(int)$r->input('user_id'));
        return response()->json($q->get()->map(fn($p)=>VhsPresenter::pet($p))->values());
    }

    public function getUserPets(Request $r)
    {
        $u=$r->user();
        $ownerId=(int)$r->input('user_id',$u->id);
        abort_unless($u->role==='Admin'||$u->id===$ownerId,403,'Access denied.');
        $pets=Pet::with('owner')->where('owner_id',$ownerId)->orderByDesc('created_at')->get();
        return response()->json($pets->map(fn($p)=>[
            'id'=>$p->id,'name'=>$p->name,'type'=>$p->species,'species'=>$p->species,'breed'=>$p->breed_custom ?: ($p->breed ?? ''),
            'age'=>$p->birthdate ? $p->birthdate->age : ($p->age ?? ''),'gender'=>$p->gender,'weight'=>$p->weight_kg !== null ? (float)$p->weight_kg : '',
            'notes'=>$p->notes ?? '','photo'=>$p->photo_path ?? '',
        ])->values());
    }

    public function savePet(Request $r)
    {
        $id=(int)$r->input('pet_id',0);
        if ($id) {
            $pet=Pet::findOrFail($id);
            $res=(new PetsController)->update($r,$pet);
        } else $res=(new PetsController)->store($r);
        $body=$res->getData(true);
        if (!($body['success']??false)) return $res;
        $pet=$body['data']['pet']??null;
        return response()->json(['success'=>true,'message'=>'Pet record saved','pet_id'=>$pet['id']??$pet['petId']??$id,'pet'=>$pet]);
    }

    public function deletePet(Request $r)
    {
        $id=(int)($r->input('pet_id') ?: $r->input('id'));
        abort_if($id<=0,422,'Pet ID is required.');
        $res=(new PetsController)->destroy($r,Pet::findOrFail($id));
        return response()->json(['success'=>true,'message'=>'Pet deleted']);
    }

    public function bookedSlots(Request $r)
    {
        $date=(string)$r->input('date');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)) return response()->json(['booked_slots'=>[]]);
        $q=Appointment::whereDate('appointment_date',$date)->whereNotIn('status',['canceled','completed','no_show']);
        $excludeId=(int)$r->input('exclude_id',0);
        if($excludeId>0)$q->where('id','<>',$excludeId);
        $times=$q->pluck('appointment_time');
        $labels=$times->map(function($t){
            $hhmm=substr((string)$t,0,5); [$h,$m]=array_map('intval',explode(':',$hhmm));
            return (($h%12)?:12).':'.str_pad((string)$m,2,'0',STR_PAD_LEFT).' '.($h>=12?'PM':'AM');
        })->unique()->values();
        return response()->json(['booked_slots'=>$labels]);
    }

    public function getAppointments(Request $r)
    {
        $items=$this->appointmentQuery($r)->orderBy('appointment_date')->orderBy('appointment_time')->get();
        return response()->json(['status'=>'success','appointments'=>$items->map(fn($a)=>$this->legacyAppointment($a))->values()]);
    }

    public function getUserAppointments(Request $r)
    {
        $u=$r->user();$owner=(int)$r->input('user_id',$u->id);
        abort_unless($u->role==='Admin'||$owner===$u->id,403,'Access denied.');
        $items=Appointment::with(['user','pet','service','veterinarian.user'])->where('user_id',$owner)->orderByDesc('appointment_date')->orderByDesc('appointment_time')->get();
        return response()->json(['status'=>'success','appointments'=>$items->map(fn($a)=>$this->legacyAppointment($a))->values()]);
    }

    private function createAppointment(Request $r)
    {
        $controller=new AppointmentsController;
        $res=$controller->store($r);
        $body=$res->getData(true);
        $a=$body['data']['appointment']??[];
        return response()->json([
            'success'=>true,'status'=>'success','message'=>'Appointment booked successfully!',
            'reference_no'=>$a['reference_no']??$a['referenceNo']??null,
            'appointment_id'=>$a['id']??$a['appointmentId']??null,
            'staff_id'=>$a['staff_id']??$a['assignedVetId']??null,
            'appointment'=>$a,
        ],$res->getStatusCode());
    }

    public function bookAppointment(Request $r)
    {
        return $this->createAppointment($r);
    }

    public function requestAppointmentOtp(Request $r)
    {
        abort_unless($r->user()->role==='User',403,'User account required.');
        $u=$r->user();
        $channel = $u->email ? 'email' : 'sms';
        $identifier = $u->email ?: $u->phone;
        $code=$this->otp->issue($r,$identifier,$channel,'appointment_booking',$u->id);
        $r->session()->put('pending_appointment_otp',['user_id'=>$u->id,'identifier'=>$identifier,'channel'=>$channel,'expires'=>time()+600]);
        $out=['success'=>true,'message'=>'Verification code sent.','channel'=>$channel];
        if(!app()->isProduction()&&config('vhs.expose_dev_otp'))$out['dev_otp']=$code;
        return response()->json($out);
    }

    public function verifyAppointmentOtp(Request $r)
    {
        $v=$r->validate(['otp_code'=>['required','regex:/^\d{6}$/D'],'appointment_data'=>['required']]);
        $pending=$r->session()->get('pending_appointment_otp');
        abort_unless($pending&&$pending['expires']>time()&&$pending['user_id']===$r->user()->id,422,'Request a new booking code.');
        $payload=is_array($v['appointment_data'])?$v['appointment_data']:json_decode((string)$v['appointment_data'],true);
        abort_unless(is_array($payload),422,'Invalid appointment data.');
        $r->merge($payload);
        $response=DB::transaction(function() use($r,$pending,$v){
            // Create first inside the still-uncommitted transaction so a bad/expired
            // OTP rolls the appointment back, while a slot conflict does not consume OTP.
            $response=$this->createAppointment($r);
            $this->otp->consume($r,$pending['identifier'],$pending['channel'],'appointment_booking',$v['otp_code'],fn($row)=>abort_unless($row->user_id===$r->user()->id,422,'Invalid booking code.') ?: true);
            return $response;
        });
        $r->session()->forget('pending_appointment_otp');
        return $response;
    }

    public function updateAppointmentStatus(Request $r)
    {
        $data=$r->json()->all() ?: $r->all();
        $id=(int)($data['id']??$data['appointment_id']??0); $next=strtolower(trim((string)($data['status']??'')));
        $next=match($next){'scheduled'=>'confirmed','cancelled'=>'canceled',default=>$next};
        abort_if($id<=0||$next==='',422,'Missing id or status.');
        $r->merge(['status'=>$next,'reason'=>$data['reason']??null]);
        $res=(new AppointmentsController)->status($r,Appointment::findOrFail($id));
        $body=$res->getData(true);
        return response()->json(['status'=>'success','message'=>'Appointment updated to '.$next,'appointment'=>$body['data']['appointment']??null]);
    }

    public function rescheduleAppointment(Request $r, Appointment $appointment)
    {
        return (new AppointmentsController)->update($r,$appointment);
    }

    public function rescheduleAppointmentLegacy(Request $r)
    {
        $data = $r->json()->all() ?: $r->all();
        $id = (int) ($data['id'] ?? $data['appointment_id'] ?? 0);
        abort_if($id <= 0, 422, 'Appointment ID is required.');
        $r->merge([
            'appointment_date' => $data['appointment_date'] ?? $data['date'] ?? null,
            'appointment_time' => $data['appointment_time'] ?? $data['time'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
        $res = (new AppointmentsController)->update($r, Appointment::findOrFail($id));
        $body = $res->getData(true);
        return response()->json([
            'status' => 'success',
            'success' => true,
            'message' => 'Appointment rescheduled.',
            'appointment' => $body['data']['appointment'] ?? null,
        ], $res->getStatusCode());
    }

    public function updateProfile(Request $r)
    {
        $u=$r->user(); $id=(int)$r->input('id',$u->id);
        abort_unless($u->role==='Admin'||$id===$u->id,403,'Access denied.');
        $target=User::findOrFail($id);
        $v=$r->validate([
            'phone'=>['sometimes','nullable','string','max:20'],
            'address'=>['sometimes','nullable','string','max:255'],
            'current_password'=>['required_with:new_password','nullable','string','max:72'],
            'new_password'=>['sometimes','nullable','string','min:8','max:72'],
        ]);
        if(array_key_exists('phone',$v))$target->phone=Identity::phone($v['phone']);
        if(array_key_exists('address',$v))$target->address=trim((string)$v['address']);
        if(!empty($v['new_password'])){
            abort_unless($target->id===$u->id,403,'Only the account owner can change this password here.');
            abort_unless(Hash::check((string)$v['current_password'],$target->password),422,'Current password is incorrect.');
            $target->password=$v['new_password'];$target->auth_version++;
        }
        $passwordChanged = ! empty($v['new_password']);
        $target->save();
        if($target->id===$u->id)$r->session()->put('auth_version',(int)$target->auth_version);

        AuditWriter::write(
            $u,
            $passwordChanged ? 'password_changed' : 'user_updated',
            'user',
            $target->id,
            $passwordChanged
                ? $u->name.' changed their account password.'
                : $u->name.' updated profile.'
        );

        return response()->json(['status'=>'success','photo'=>'']);
    }
}
