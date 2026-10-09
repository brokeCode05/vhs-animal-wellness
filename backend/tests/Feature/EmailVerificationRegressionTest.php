<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmailVerificationRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_saving_same_doctor_email_does_not_revoke_verification(): void
    {
        $admin = User::factory()->create([
            'role' => 'Admin',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $doctorUser = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email' => 'doctor@example.test',
            'email_verified_at' => now(),
        ]);

        $doctor = DoctorProfile::query()->create([
            'user_id' => $doctorUser->id,
            'display_name' => 'Dr. Example',
            'specialization' => 'General Practice',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        $verifiedAt = $doctorUser->email_verified_at?->toISOString();

        $this->actingAs($admin)
            ->patchJson('/api/doctors/'.$doctor->id, [
                'email' => 'doctor@example.test',
                'specialization' => 'Companion Animal Medicine',
            ])
            ->assertOk();

        $doctorUser->refresh();

        $this->assertNotNull($doctorUser->email_verified_at);
        $this->assertSame($verifiedAt, $doctorUser->email_verified_at?->toISOString());
    }

    public function test_actual_doctor_email_change_revokes_old_verification(): void
    {
        $admin = User::factory()->create([
            'role' => 'Admin',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $doctorUser = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email' => 'doctor-old@example.test',
            'email_verified_at' => now(),
        ]);

        $doctor = DoctorProfile::query()->create([
            'user_id' => $doctorUser->id,
            'display_name' => 'Dr. Example',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        $this->actingAs($admin)
            ->patchJson('/api/doctors/'.$doctor->id, [
                'email' => 'doctor-new@example.test',
            ])
            ->assertOk();

        $doctorUser->refresh();

        $this->assertSame('doctor-new@example.test', $doctorUser->email);
        $this->assertNull($doctorUser->email_verified_at);
    }
}
