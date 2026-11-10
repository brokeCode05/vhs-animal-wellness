<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Doctor assignment contract:
 *  - Booking auto-assigns the least-loaded active/on-duty doctor (ties go to
 *    the lowest doctor_profiles id) unless an Admin explicitly picks one.
 *  - Check-in must NEVER change an existing assignment — that is what keeps a
 *    checked-in patient in the correct doctor's queue.
 *  - GET /api/appointments for a Doctor returns only their own assignments.
 */
class AppointmentDoctorAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $owner;
    private Pet $pet;
    private Service $service;
    private User $doctorAUser;
    private DoctorProfile $doctorA;
    private User $doctorBUser;
    private DoctorProfile $doctorB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'Admin', 'status' => 'active', 'email_verified_at' => now()]);
        $this->owner = User::factory()->create(['role' => 'User', 'status' => 'active', 'email_verified_at' => now()]);
        $this->pet = Pet::forceCreate([
            'owner_id' => $this->owner->id,
            'name' => 'Mocha',
            'species' => 'Dog',
            'gender' => 'Female',
        ]);
        $this->service = Service::forceCreate([
            'value' => 'consultation',
            'label' => 'Consultation',
            'category' => 'Preventive & Wellness',
            'price' => 500,
            'active' => true,
        ]);

        $this->doctorAUser = User::factory()->create(['role' => 'Doctor', 'status' => 'active', 'email_verified_at' => now()]);
        $this->doctorA = DoctorProfile::forceCreate([
            'user_id' => $this->doctorAUser->id,
            'display_name' => 'Dr. Alpha',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        $this->doctorBUser = User::factory()->create(['role' => 'Doctor', 'status' => 'active', 'email_verified_at' => now()]);
        $this->doctorB = DoctorProfile::forceCreate([
            'user_id' => $this->doctorBUser->id,
            'display_name' => 'Dr. Beta',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);
    }

    /**
     * Tomorrow at 10:00 is always inside clinic booking slots
     * (weekday 09:00-17:00, weekend 10:00-18:00, 60-minute interval).
     */
    private function bookingPayload(array $extra = []): array
    {
        return array_merge([
            'user_id' => $this->owner->id,
            'pet_id' => $this->pet->id,
            'service' => 'consultation',
            'appointment_date' => now()->addDay()->toDateString(),
            'appointment_time' => '10:00',
        ], $extra);
    }

    /**
     * A confirmed appointment that is eligible for check-in right now
     * (same calendar day, inside the two-hour check-in window).
     */
    private function confirmedAppointmentFor(?DoctorProfile $doctor, string $referenceNo): Appointment
    {
        $scheduled = now()->subMinutes(30);
        if ($scheduled->format('Y-m-d') !== now()->format('Y-m-d')) {
            $scheduled = now()->copy()->startOfDay()->addMinutes(5);
        }

        return Appointment::forceCreate([
            'reference_no' => $referenceNo,
            'user_id' => $this->owner->id,
            'pet_id' => $this->pet->id,
            'assigned_vet_id' => $doctor?->id,
            'service_id' => $this->service->id,
            'service_label_at_booking' => 'Consultation',
            'price_at_booking' => 500,
            'appointment_date' => $scheduled->toDateString(),
            'appointment_time' => $scheduled->format('H:i:00'),
            'status' => 'confirmed',
            'created_via' => 'admin',
        ]);
    }

    public function test_booking_auto_assigns_a_single_on_duty_doctor(): void
    {
        $this->doctorB->forceFill(['availability_status' => 'on_leave'])->save();

        $res = $this->actingAs($this->admin)
            ->postJson('/api/appointments', $this->bookingPayload())
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $this->doctorA->id);

        $this->assertDatabaseHas('appointments', [
            'id' => $res->json('data.appointment.id'),
            'assigned_vet_id' => $this->doctorA->id,
        ]);
    }

    public function test_booking_keeps_the_existing_least_loaded_rule_with_multiple_doctors(): void
    {
        // Both on duty with equal load → tie-break by lowest doctor id.
        $this->actingAs($this->admin)
            ->postJson('/api/appointments', $this->bookingPayload())
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $this->doctorA->id);

        // A second booking on the same date now loads doctor A up, so the
        // least-loaded rule hands it to doctor B (different slot, same day).
        $this->actingAs($this->admin)
            ->postJson('/api/appointments', $this->bookingPayload(['appointment_time' => '11:00']))
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $this->doctorB->id);
    }

    public function test_admin_can_explicitly_assign_a_doctor_and_it_is_visible(): void
    {
        $res = $this->actingAs($this->admin)
            ->postJson('/api/appointments', $this->bookingPayload(['assigned_vet_id' => $this->doctorB->id]))
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $this->doctorB->id)
            ->assertJsonPath('data.appointment.vet_name', $this->doctorB->display_name);

        $this->assertDatabaseHas('appointments', [
            'id' => $res->json('data.appointment.id'),
            'assigned_vet_id' => $this->doctorB->id,
        ]);
    }

    public function test_explicit_assignment_refuses_an_unavailable_doctor(): void
    {
        $this->doctorB->forceFill(['account_status' => 'inactive'])->save();

        $this->actingAs($this->admin)
            ->postJson('/api/appointments', $this->bookingPayload(['assigned_vet_id' => $this->doctorB->id]))
            ->assertStatus(422);

        $this->doctorB->forceFill(['account_status' => 'active', 'availability_status' => 'on_leave'])->save();

        // Unknown doctor profile id is a validation failure, not a silent auto-assign.
        $this->actingAs($this->admin)
            ->postJson('/api/appointments', $this->bookingPayload(['assigned_vet_id' => 9999]))
            ->assertStatus(422);
    }

    public function test_only_an_admin_may_explicitly_assign_a_doctor(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/appointments', $this->bookingPayload(['assigned_vet_id' => $this->doctorB->id]))
            ->assertStatus(403);

        $this->assertDatabaseCount('appointments', 0);
    }

    public function test_check_in_never_changes_an_existing_doctor_assignment(): void
    {
        // Doctor B owns the appointment; doctor A is less loaded, so a
        // recompute would wrongly move the patient. Check-in must preserve B.
        $appointment = $this->confirmedAppointmentFor($this->doctorB, 'REF-ASG-001');

        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$appointment->id.'/status', ['status' => 'checked_in'])
            ->assertOk();

        $fresh = $appointment->fresh();
        $this->assertSame('checked_in', $fresh->status);
        $this->assertSame($this->doctorB->id, $fresh->assigned_vet_id);
    }

    public function test_check_in_assigns_a_doctor_only_when_the_appointment_has_none(): void
    {
        $appointment = $this->confirmedAppointmentFor(null, 'REF-ASG-002');
        $this->assertNull($appointment->assigned_vet_id);

        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$appointment->id.'/status', ['status' => 'checked_in'])
            ->assertOk();

        $this->assertSame($this->doctorA->id, $appointment->fresh()->assigned_vet_id);
    }

    public function test_checked_in_appointment_appears_only_in_the_assigned_doctors_queue(): void
    {
        $appointment = $this->confirmedAppointmentFor($this->doctorB, 'REF-ASG-003');

        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$appointment->id.'/status', ['status' => 'checked_in'])
            ->assertOk();

        // The assigned doctor sees it, checked in.
        $this->actingAs($this->doctorBUser)
            ->getJson('/api/appointments')
            ->assertOk()
            ->assertJsonFragment(['id' => $appointment->id])
            ->assertJsonFragment(['status' => 'checked_in'])
            ->assertJsonFragment(['assignedVetId' => $this->doctorB->id]);

        // Another on-duty doctor must not see it.
        $this->actingAs($this->doctorAUser)
            ->getJson('/api/appointments')
            ->assertOk()
            ->assertJsonMissing(['id' => $appointment->id]);

        // Admin sees who the appointment is assigned to, by name.
        $this->actingAs($this->admin)
            ->getJson('/api/appointments')
            ->assertOk()
            ->assertJsonFragment(['vet_name' => $this->doctorB->display_name]);
    }

    public function test_only_the_assigned_doctor_may_start_the_consultation(): void
    {
        $appointment = $this->confirmedAppointmentFor($this->doctorB, 'REF-ASG-004');

        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$appointment->id.'/status', ['status' => 'checked_in'])
            ->assertOk();

        // A different on-duty doctor is refused.
        $this->actingAs($this->doctorAUser)
            ->postJson('/api/consultations', ['appointment_id' => $appointment->id])
            ->assertStatus(403);

        // The assigned doctor starts the consultation.
        $this->actingAs($this->doctorBUser)
            ->postJson('/api/consultations', ['appointment_id' => $appointment->id])
            ->assertStatus(201)
            ->assertJsonPath('data.consultation.veterinarianId', $this->doctorB->id);

        $this->assertSame('in_consultation', $appointment->fresh()->status);
    }
}
