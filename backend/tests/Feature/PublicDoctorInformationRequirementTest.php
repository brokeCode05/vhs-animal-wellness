<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicDoctorInformationRequirementTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_doctor_feed_exposes_only_active_staff_information(): void
    {
        $user = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'name' => 'Dr. Test Veterinarian',
            'email' => 'private-doctor@example.test',
            'phone' => '+639111111111',
        ]);

        DoctorProfile::query()->create([
            'user_id' => $user->id,
            'display_name' => 'Dr. Test Veterinarian',
            'specialization' => 'Companion Animal Medicine',
            'phone' => '+639111111111',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        $response = $this->getJson('/api/public/doctors')
            ->assertOk()
            ->assertJsonPath('data.doctors.0.name', 'Dr. Test Veterinarian')
            ->assertJsonPath('data.doctors.0.specialization', 'Companion Animal Medicine');

        $doctor = $response->json('data.doctors.0');

        $this->assertArrayNotHasKey('email', $doctor);
        $this->assertArrayNotHasKey('phone', $doctor);
        $this->assertArrayNotHasKey('employeeId', $doctor);
        $this->assertArrayNotHasKey('availabilityStatus', $doctor);
    }
}
