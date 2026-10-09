<?php

namespace App\Http\Controllers;

use App\Models\DoctorProfile;
use App\Models\User;
use App\Services\OtpService;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use App\Support\Identity;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DoctorsController extends Controller
{
    use ApiResponse;

    public function __construct(private OtpService $otp) {}

    public function index(Request $r)
    {
        $q = DoctorProfile::with('user')->orderBy('id');
        if ($r->user()?->role !== 'Admin') {
            $q->where('account_status', 'active');
        }
        return $this->ok('Doctors loaded.', ['doctors' => $q->get()->map(fn ($d) => VhsPresenter::doctor($d))->values()]);
    }

    public function publicIndex()
    {
        $doctors = DoctorProfile::with('user')
            ->where('account_status', 'active')
            ->whereHas('user', fn ($q) => $q->where('status', 'active'))
            ->orderBy('id')
            ->get()
            ->map(function (DoctorProfile $doctor) {
                $user = $doctor->user;

                return [
                    'doctorId' => $doctor->id,
                    'name' => $doctor->display_name ?: ($user?->name ?? ''),
                    'specialization' => $doctor->specialization ?? '',
                ];
            })
            ->values();

        return $this->ok('Public doctor information loaded.', [
            'doctors' => $doctors,
        ]);
    }

    public function store(Request $r)
    {
        $r->merge(['email' => Identity::email($r->input('email'))]);
        $v = $r->validate([
            'first_name' => ['required_without:firstName', 'nullable', 'string', 'max:50'],
            'firstName' => ['required_without:first_name', 'nullable', 'string', 'max:50'],
            'middle_name' => ['nullable', 'string', 'max:50'], 'middleName' => ['nullable', 'string', 'max:50'],
            'last_name' => ['required_without:lastName', 'nullable', 'string', 'max:50'],
            'lastName' => ['required_without:last_name', 'nullable', 'string', 'max:50'],
            'email' => ['required', 'email:rfc', 'max:254', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:20'],
            'specialization' => ['nullable', 'string', 'max:100'],
        ]);

        $doctor = DB::transaction(function () use ($r, $v) {
            $u = new User;
            $u->forceFill([
                'role' => 'Doctor', 'status' => 'active',
                'first_name' => trim($v['first_name'] ?? $v['firstName']),
                'middle_name' => trim($v['middle_name'] ?? $v['middleName'] ?? '') ?: null,
                'last_name' => trim($v['last_name'] ?? $v['lastName']),
                'email' => $v['email'], 'phone' => $v['phone'] ?? null,
                'password' => null,
            ]);
            $u->name = trim($u->first_name.' '.$u->last_name);
            $u->save();
            $d = new DoctorProfile;
            $d->forceFill([
                'user_id' => $u->id,
                'display_name' => 'Dr. '.$u->last_name,
                'specialization' => $v['specialization'] ?? null,
                'phone' => $v['phone'] ?? null,
                'account_status' => 'active',
                'availability_status' => 'on_duty',
            ])->save();
            AuditWriter::write($r->user(), 'doctor_created', 'doctor', $d->id, $r->user()->name.' created doctor '.$u->name.'.');
            $this->otp->issue($r, $u->email, 'email', 'password_reset', $u->id);
            return $d;
        });
        $doctor->load('user');
        $doctor->user?->refresh();
        return $this->ok(
            'Doctor created. Employee ID: '.($doctor->user?->employee_id ?: 'Pending').'. A password setup code was sent to the doctor email.',
            ['doctor' => VhsPresenter::doctor($doctor)],
            201
        );
    }

    public function update(Request $r, DoctorProfile $doctor)
    {
        $v = $r->validate([
            'first_name' => ['sometimes', 'string', 'max:50'], 'firstName' => ['sometimes', 'string', 'max:50'],
            'middle_name' => ['sometimes', 'nullable', 'string', 'max:50'], 'middleName' => ['sometimes', 'nullable', 'string', 'max:50'],
            'last_name' => ['sometimes', 'string', 'max:50'], 'lastName' => ['sometimes', 'string', 'max:50'],
            'email' => ['sometimes', 'email:rfc', 'max:254', Rule::unique('users', 'email')->ignore($doctor->user_id)],
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'specialization' => ['sometimes', 'nullable', 'string', 'max:100'],
            'display_name' => ['sometimes', 'nullable', 'string', 'max:120'], 'displayName' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);
        DB::transaction(function () use ($r, $doctor, $v) {
            $u = $doctor->user()->lockForUpdate()->firstOrFail();
            $uMap = ['first_name'=>'first_name','firstName'=>'first_name','middle_name'=>'middle_name','middleName'=>'middle_name','last_name'=>'last_name','lastName'=>'last_name','phone'=>'phone'];

            foreach ($uMap as $in=>$col) {
                if (array_key_exists($in,$v)) {
                    $u->$col = is_string($v[$in]) ? trim($v[$in]) : $v[$in];
                }
            }

            if (array_key_exists('email', $v)) {
                $newEmail = Identity::email($v['email']);

                // Account Management submits the current email together with
                // unrelated edits such as specialization. Do not revoke a
                // previously verified email unless the address actually changes.
                if ($newEmail !== $u->email) {
                    $u->email = $newEmail;
                    $u->email_verified_at = null;
                    $u->auth_version++;
                }
            }

            $u->name = trim($u->first_name.' '.$u->last_name); $u->save();
            if (array_key_exists('phone',$v)) $doctor->phone = $v['phone'];
            if (array_key_exists('specialization',$v)) $doctor->specialization = $v['specialization'];
            if (array_key_exists('display_name',$v) || array_key_exists('displayName',$v)) $doctor->display_name = $v['display_name'] ?? $v['displayName'];
            $doctor->save();
            AuditWriter::write($r->user(),'doctor_updated','doctor',$doctor->id,$r->user()->name.' updated doctor '.$u->name.'.');
        });
        $doctor->load('user');
        return $this->ok('Doctor updated.', ['doctor'=>VhsPresenter::doctor($doctor)]);
    }

    public function status(Request $r, DoctorProfile $doctor)
    {
        $v=$r->validate(['account_status'=>['required',Rule::in(['active','inactive'])]]);
        $old=$doctor->account_status; $doctor->account_status=$v['account_status']; $doctor->save();
        if ($old!==$doctor->account_status) { $u=$doctor->user; $u->auth_version++; $u->save(); }
        AuditWriter::write($r->user(),$doctor->account_status==='active'?'doctor_activated':'doctor_deactivated','doctor',$doctor->id,$r->user()->name.' set doctor account to '.$doctor->account_status.'.',null,['previous'=>$old,'new'=>$doctor->account_status]);
        $doctor->load('user');
        return $this->ok('Doctor account status updated.',['doctor'=>VhsPresenter::doctor($doctor)]);
    }

    public function availability(Request $r, DoctorProfile $doctor)
    {
        $actor = $r->user();

        abort_unless(
            in_array($actor->role, ['Admin', 'Doctor'], true),
            403,
            'Only Admins and Doctors may change veterinarian availability.'
        );

        if ($actor->role === 'Doctor') {
            abort_unless(
                $actor->id === $doctor->user_id,
                403,
                'Doctors may change only their own availability.'
            );
        }

        $v=$r->validate(['availability_status'=>['required',Rule::in(['on_duty','on_break','on_leave'])]]);
        $old=$doctor->availability_status; $doctor->availability_status=$v['availability_status']; $doctor->save();
        AuditWriter::write($r->user(),'doctor_availability_changed','doctor',$doctor->id,$r->user()->name.' changed doctor availability.',null,['previous'=>$old,'new'=>$doctor->availability_status]);
        $doctor->load('user');
        return $this->ok('Availability updated.',['doctor'=>VhsPresenter::doctor($doctor)]);
    }
}
