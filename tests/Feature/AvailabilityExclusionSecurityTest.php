<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A reschedule availability query may exclude only the caller's own
 * appointment (or an appointment being managed by an Admin).
 * This is a READ security check; no existing appointment is mutated.
 */
class AvailabilityExclusionSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_cannot_exclude_another_users_appointment(): void
    {
        $owner = User::factory()->create([
            'role' => 'User', 'status' => 'active', 'email_verified_at' => now(),
        ]);
        $other = User::factory()->create([
            'role' => 'User', 'status' => 'active', 'email_verified_at' => now(),
        ]);
        $admin = User::factory()->create([
            'role' => 'Admin', 'status' => 'active', 'email_verified_at' => now(),
        ]);
        $pet = Pet::forceCreate([
            'owner_id' => $owner->id, 'name' => 'Synthetic Pet',
            'species' => 'Dog', 'gender' => 'Female',
        ]);
        $service = Service::forceCreate([
            'value' => 'dog_grooming', 'label' => 'Dog Grooming',
            'category' => 'Pet Care', 'price' => 100, 'active' => true,
        ]);
        $date = now()->addDays(2)->toDateString();
        $appointment = Appointment::forceCreate([
            'reference_no' => 'VHS-TEST-EXCLUSION',
            'user_id' => $owner->id,
            'pet_id' => $pet->id,
            'service_id' => $service->id,
            'service_label_at_booking' => 'Dog Grooming',
            'price_at_booking' => 100,
            'appointment_date' => $date,
            'appointment_time' => '10:00:00',
            'status' => 'confirmed',
            'created_via' => 'user',
        ]);

        $url = '/api/availability?date='.$date.'&service_id='.$service->id
            .'&exclude_id='.$appointment->id;

        $this->actingAs($other)->getJson($url)->assertForbidden();
        $this->actingAs($owner)->getJson($url)->assertOk()
            ->assertJsonPath('data.date', $date);
        $this->actingAs($admin)->getJson($url)->assertOk()
            ->assertJsonPath('data.date', $date);
    }
}
