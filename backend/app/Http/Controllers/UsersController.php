<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\OtpService;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use App\Support\Identity;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UsersController extends Controller
{
    use ApiResponse;

    public function __construct(private OtpService $otp) {}

    public function index(Request $r)
    {
        $q = User::query()->where('role', 'User')->orderBy('created_at');
        if ($r->filled('status')) {
            $q->where('status', $r->string('status'));
        }
        return $this->ok('Users loaded.', ['users' => $q->get()->map(fn ($u) => VhsPresenter::user($u))->values()]);
    }

    public function show(Request $r, User $user)
    {
        abort_unless($r->user()->role === 'Admin' || $r->user()->id === $user->id, 403, 'Access denied.');
        return $this->ok('User loaded.', ['user' => VhsPresenter::user($user)]);
    }

    public function store(Request $r)
    {
        $r->merge(['email' => Identity::email($r->input('email'))]);
        $v = $r->validate([
            'first_name' => ['required_without:firstName', 'nullable', 'string', 'max:50'],
            'firstName' => ['required_without:first_name', 'nullable', 'string', 'max:50'],
            'middle_name' => ['nullable', 'string', 'max:50'],
            'middleName' => ['nullable', 'string', 'max:50'],
            'last_name' => ['required_without:lastName', 'nullable', 'string', 'max:50'],
            'lastName' => ['required_without:last_name', 'nullable', 'string', 'max:50'],
            'email' => ['required', 'email:rfc', 'max:254', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:255'],
            'birthdate' => ['nullable', 'date', 'before_or_equal:today'],
        ]);

        $user = DB::transaction(function () use ($r, $v) {
            $u = new User;
            $u->forceFill([
                'role' => 'User',
                'status' => 'active',
                'first_name' => trim($v['first_name'] ?? $v['firstName']),
                'middle_name' => trim($v['middle_name'] ?? $v['middleName'] ?? '') ?: null,
                'last_name' => trim($v['last_name'] ?? $v['lastName']),
                'email' => $v['email'],
                'phone' => $v['phone'] ?? null,
                'address' => $v['address'] ?? null,
                'birthdate' => $v['birthdate'] ?? null,
                'password' => null,
            ]);
            $u->name = trim($u->first_name.' '.$u->last_name);
            $u->save();
            AuditWriter::write($r->user(), 'user_created', 'user', $u->id, $r->user()->name.' created owner '.$u->name.'.');
            $this->otp->issue($r, $u->email, 'email', 'password_reset', $u->id);
            return $u;
        });


        return $this->ok('User created. A password setup code was sent to the account email.', ['user' => VhsPresenter::user($user)], 201);
    }

    public function update(Request $r, User $user)
    {
        $self = $r->user()->id === $user->id;
        abort_unless($r->user()->role === 'Admin' || $self, 403, 'Access denied.');

        $rules = [
            'phone' => ['sometimes', 'nullable', 'string', 'max:20'],
            'address' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
        if ($r->user()->role === 'Admin') {
            $rules += [
                'first_name' => ['sometimes', 'string', 'max:50'],
                'firstName' => ['sometimes', 'string', 'max:50'],
                'middle_name' => ['sometimes', 'nullable', 'string', 'max:50'],
                'middleName' => ['sometimes', 'nullable', 'string', 'max:50'],
                'last_name' => ['sometimes', 'string', 'max:50'],
                'lastName' => ['sometimes', 'string', 'max:50'],
                'email' => ['sometimes', 'email:rfc', 'max:254', Rule::unique('users', 'email')->ignore($user->id)],
                'birthdate' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            ];
        }
        $v = $r->validate($rules);

        DB::transaction(function () use ($r, $user, $v) {
            $map = [
                'phone' => 'phone', 'address' => 'address', 'birthdate' => 'birthdate',
                'first_name' => 'first_name', 'firstName' => 'first_name',
                'middle_name' => 'middle_name', 'middleName' => 'middle_name',
                'last_name' => 'last_name', 'lastName' => 'last_name',
            ];
            foreach ($map as $in => $col) {
                if (array_key_exists($in, $v)) {
                    $user->$col = is_string($v[$in]) ? trim($v[$in]) : $v[$in];
                }
            }

            if (array_key_exists('email', $v)) {
                $newEmail = Identity::email($v['email']);

                // Do not invalidate verification when Admin merely saves the
                // existing address along with another profile field.
                if ($newEmail !== $user->email) {
                    $user->email = $newEmail;
                    $user->email_verified_at = null;
                    $user->auth_version++;
                }
            }
            $user->name = trim($user->first_name.' '.$user->last_name);
            $user->save();
            AuditWriter::write($r->user(), 'user_updated', 'user', $user->id, $r->user()->name.' updated owner '.$user->name.'.');
        });

        return $this->ok('User updated.', ['user' => VhsPresenter::user($user->fresh())]);
    }

    public function status(Request $r, User $user)
    {
        $v = $r->validate(['status' => ['required', Rule::in(['active', 'inactive'])]]);
        abort_unless($user->role === 'User', 422, 'This endpoint manages owner accounts only.');
        $old = $user->status;
        $user->status = $v['status'];
        if ($old !== $user->status) {
            $user->auth_version++;
        }
        $user->save();
        $action = $user->status === 'active' ? 'user_activated' : 'user_deactivated';
        AuditWriter::write($r->user(), $action, 'user', $user->id, $r->user()->name.' set '.$user->name.' to '.$user->status.'.', null, ['previous' => $old, 'new' => $user->status]);
        return $this->ok('User status updated.', ['user' => VhsPresenter::user($user)]);
    }
}
