<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Consultation;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinalFunctionalRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_cannot_change_doctor_availability(): void
    {
        $owner = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $doctorUser = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $doctor = DoctorProfile::query()->create([
            'user_id' => $doctorUser->id,
            'display_name' => 'Dr. Functional Test',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        $this->actingAs($owner)
            ->patchJson('/api/doctors/'.$doctor->id.'/availability', [
                'availability_status' => 'on_leave',
            ])
            ->assertForbidden();
    }

    public function test_owner_medical_history_endpoint_exists_and_is_scoped_to_own_pet(): void
    {
        $owner = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $pet = Pet::query()->create([
            'owner_id' => $owner->id,
            'name' => 'Milo',
            'species' => 'Dog',
            'gender' => 'Male',
        ]);

        $this->actingAs($owner)
            ->getJson('/api/pets/'.$pet->id.'/medical-records')
            ->assertOk()
            ->assertJsonPath('data.petId', $pet->id)
            ->assertJsonPath('data.records', []);
    }
}
