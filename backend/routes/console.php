<?php

use App\Models\AccountVerification;
use App\Models\DoctorProfile;
use App\Models\User;
use App\Support\Identity;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Artisan::command('vhs:create-admin', function () {
    $email = Identity::email($this->ask('Admin email'));
    $first = $this->ask('First name');
    $last = $this->ask('Last name');
    validator(['email' => $email, 'first_name' => $first, 'last_name' => $last], ['email' => 'required|email|max:254|unique:users,email', 'first_name' => 'required|string|max:50', 'last_name' => 'required|string|max:50'])->validate();
    $u = new User;
    $u->forceFill(['email' => $email, 'first_name' => $first, 'last_name' => $last, 'name' => $first.' '.$last, 'role' => 'Admin', 'status' => 'active'])->save();
    $this->info('Admin created without a password. At /auth request an email password setup/reset code to set your password and prove mailbox ownership.');
})->purpose('Provision the initial Admin from the trusted server console');
Artisan::command('vhs:create-doctor', function () {
    $email = Identity::email($this->ask('Doctor email'));
    $first = $this->ask('First name');
    $last = $this->ask('Last name');
    validator(compact('email', 'first', 'last'), ['email' => 'required|email|max:254|unique:users,email', 'first' => 'required|string|max:50', 'last' => 'required|string|max:50'])->validate();
    DB::transaction(function () use ($email, $first, $last) {
        $u = new User;
        $u->forceFill(['email' => $email, 'first_name' => $first, 'last_name' => $last, 'name' => $first.' '.$last, 'role' => 'Doctor', 'status' => 'active'])->save();
        $d = new DoctorProfile;
        $d->forceFill(['user_id' => $u->id, 'display_name' => 'Dr. '.$last, 'account_status' => 'active', 'availability_status' => 'on_duty'])->save();
    });
    $this->info('Doctor created without a password. Use email password setup/reset at /auth.');
});
Schedule::call(fn () => AccountVerification::where('expires_at', '<', now()->subDay())->delete())->daily();
