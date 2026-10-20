<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Support\AppointmentWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * REAL smart scheduling — resource-aware capacity, backend as the single
 * source of truth (AppointmentWorkflow):
 *  1. one On Duty doctor  → a second doctor-required booking at the same slot is refused;
 *  2. two On Duty doctors → two same-slot bookings land on different doctors, a third is refused;
 *  3. explicit Admin pick → a doctor already booked at the slot is refused, a free one succeeds;
 *  4. non-doctor services → never consume doctor capacity; they use their own per-slot capacity;
 *  5. same-day past slots → never offered by GET /api/availability and refused at booking;
 *  6. canceled/completed/no_show release capacity, active statuses keep it;
 *  7. User booking without a doctor auto-assigns the least-loaded eligible free doctor.
 */
class SmartSchedulingTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Fixed clock: Monday 2026-06-15, 14:30. With 08:00-18:00 clinic hours
     * that leaves past slots (08:00-14:00) and bookable future slots
     * (15:00-18:00) regardless of when the suite runs.
     */
    private const DAY = '2026-06-15';

    private User $admin;
    private Service $consultation;
    private Service $grooming;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-06-15 14:30:00'));

        // Deterministic clinic hours: 08:00-18:00 every day, 60-minute slots.
        $settings = AppointmentWorkflow::settings();
        $settings->forceFill([
            'weekday_first' => '08:00',
            'weekday_last' => '18:00',
            'weekend_first' => '08:00',
            'weekend_last' => '18:00',
            'slot_interval_minutes' => 60,
            // Cutoffs are covered by their own tests; zeroed here so a
            // same-day cancel/reschedule in these scenarios is never gated
            // by the 2-hour window instead of the capacity rule under test.
            'cancel_cutoff_minutes' => 0,
            'reschedule_cutoff_minutes' => 0,
        ])->save();

        $this->admin = User::factory()->create([
            'role' => 'Admin',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->consultation = Service::forceCreate([
            'value' => 'consultation',
            'label' => 'Consultation',
            'category' => 'Preventive & Wellness',
            'price' => 300,
            'active' => true,
        ]);

        $this->grooming = Service::forceCreate([
            'value' => 'dog_grooming',
            'label' => 'Dog Grooming',
            'category' => 'Pet Care',
            'price' => 100,
            'active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function doctor(string $name, string $availability = 'on_duty'): DoctorProfile
    {
        $user = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        return DoctorProfile::forceCreate([
            'user_id' => $user->id,
            'display_name' => $name,
            'account_status' => 'active',
            'availability_status' => $availability,
        ]);
    }

    /** @return array{0: User, 1: Pet} */
    private function ownerWithPet(string $name): array
    {
        $owner = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $pet = Pet::forceCreate([
            'owner_id' => $owner->id,
            'name' => $name,
            'species' => 'Dog',
            'gender' => 'Female',
        ]);

        return [$owner, $pet];
    }

    private function bookFor(User $owner, Pet $pet, Service $service, string $time, array $extra = []): TestResponse
    {
        return $this->actingAs($this->admin)->postJson('/api/appointments', array_merge([
            'user_id' => $owner->id,
            'pet_id' => $pet->id,
            'service' => $service->value,
            'appointment_date' => self::DAY,
            'appointment_time' => $time,
        ], $extra));
    }

    private function forceAppointment(array $overrides = []): Appointment
    {
        static $seq = 0;
        $seq++;

        return Appointment::forceCreate(array_merge([
            'reference_no' => 'REF-SCHED-'.$seq,
            'user_id' => User::factory()->create(['role' => 'User', 'status' => 'active', 'email_verified_at' => now()])->id,
            'pet_id' => Pet::forceCreate([
                'owner_id' => User::where('role', 'User')->latest('id')->value('id'),
                'name' => 'Seed'.$seq,
                'species' => 'Dog',
                'gender' => 'Female',
            ])->id,
            'assigned_vet_id' => null,
            'service_id' => $this->consultation->id,
            'service_label_at_booking' => 'Consultation',
            'price_at_booking' => 300,
            'appointment_date' => self::DAY,
            'appointment_time' => '12:00:00',
            'status' => 'confirmed',
            'created_via' => 'admin',
        ], $overrides));
    }

    // ── 1. ONE ON DUTY DOCTOR ───────────────────────────────────────────

    public function test_one_on_duty_doctor_refuses_a_second_doctor_required_booking_at_the_same_slot(): void
    {
        $doctor = $this->doctor('Dr. One');
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');

        $this->bookFor($o1, $p1, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctor->id);

        $this->bookFor($o2, $p2, $this->consultation, '15:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No veterinarian is free at that time. Please choose a different slot.');

        $this->assertDatabaseCount('appointments', 1);

        // A different slot on the same day stays open.
        $this->bookFor($o2, $p2, $this->consultation, '16:00')->assertStatus(201);
    }

    public function test_doctor_required_booking_is_refused_when_no_doctor_is_on_duty(): void
    {
        $this->doctor('Dr. Break', 'on_break');
        [$owner, $pet] = $this->ownerWithPet('Mochi');

        $this->bookFor($owner, $pet, $this->consultation, '15:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No on-duty veterinarian is available for this appointment.');

        $this->assertDatabaseCount('appointments', 0);
    }

    // ── 2. TWO ON DUTY DOCTORS ──────────────────────────────────────────

    public function test_two_on_duty_doctors_take_two_same_slot_bookings_and_a_third_is_refused(): void
    {
        $doctorA = $this->doctor('Dr. Alpha');
        $doctorB = $this->doctor('Dr. Beta');
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');
        [$o3, $p3] = $this->ownerWithPet('Mochi');

        $this->bookFor($o1, $p1, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorA->id);

        $this->bookFor($o2, $p2, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorB->id);

        $this->bookFor($o3, $p3, $this->consultation, '15:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No veterinarian is free at that time. Please choose a different slot.');

        $this->assertDatabaseCount('appointments', 2);
    }

    // ── 3. EXPLICIT ADMIN DOCTOR SELECTION ──────────────────────────────

    public function test_admin_explicit_doctor_selection_validates_freedom_at_the_slot(): void
    {
        $doctorA = $this->doctor('Dr. Alpha');
        $doctorB = $this->doctor('Dr. Beta');
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');
        [$o3, $p3] = $this->ownerWithPet('Mochi');

        // Doctor A is deliberately booked at 15:00.
        $this->bookFor($o1, $p1, $this->consultation, '15:00', ['assigned_vet_id' => $doctorA->id])
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorA->id);

        // Picking the now-busy doctor A at 15:00 is refused with a clear message.
        $this->bookFor($o2, $p2, $this->consultation, '15:00', ['assigned_vet_id' => $doctorA->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'The selected veterinarian is already booked at that time. Choose a different doctor or time.');

        // Picking the free doctor B at 15:00 succeeds.
        $this->bookFor($o3, $p3, $this->consultation, '15:00', ['assigned_vet_id' => $doctorB->id])
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorB->id);
    }

    // ── 4. NON-DOCTOR SERVICES ──────────────────────────────────────────

    public function test_non_doctor_service_does_not_block_a_doctor_required_service(): void
    {
        $doctor = $this->doctor('Dr. Only');
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');
        [$o3, $p3] = $this->ownerWithPet('Mochi');

        // Grooming at 15:00 books WITHOUT a veterinarian — it consumes no doctor capacity.
        $this->bookFor($o2, $p2, $this->grooming, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', null);

        // The doctor-required appointment at the SAME 15:00 slot still succeeds.
        $this->bookFor($o1, $p1, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctor->id);

        // And the doctor slot is now genuinely full (one doctor, one visit).
        $this->bookFor($o3, $p3, $this->consultation, '15:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No veterinarian is free at that time. Please choose a different slot.');
    }

    public function test_non_doctor_service_books_with_no_on_duty_doctor_and_uses_its_own_capacity(): void
    {
        // No doctor profiles exist at all — grooming must still book.
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');
        [$o3, $p3] = $this->ownerWithPet('Mochi');

        $this->bookFor($o1, $p1, $this->grooming, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', null);

        $this->bookFor($o2, $p2, $this->grooming, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', null);

        // Third concurrent grooming exceeds the per-slot capacity of this service.
        $this->bookFor($o3, $p3, $this->grooming, '15:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'That time is already fully booked for this service. Please choose a different slot.');
    }

    // ── 5. SAME-DAY PAST SLOTS ──────────────────────────────────────────

    public function test_same_day_past_slot_is_rejected_by_the_backend(): void
    {
        $this->doctor('Dr. One');
        [$owner, $pet] = $this->ownerWithPet('Luna');

        // 09:00 is inside clinic hours but already past (frozen clock 14:30).
        $this->bookFor($owner, $pet, $this->consultation, '09:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'appointment_time_passed');

        $this->assertDatabaseCount('appointments', 0);
    }

    public function test_availability_endpoint_never_offers_past_same_day_slots(): void
    {
        $this->doctor('Dr. One');

        $res = $this->actingAs($this->admin)
            ->getJson('/api/availability?date='.self::DAY.'&service=consultation')
            ->assertOk();

        $slots = $res->json('data.slots');
        $this->assertContains('15:00', $slots);
        $this->assertNotContains('09:00', $slots);

        $past = collect($res->json('data.slot_details'))
            ->firstWhere('time', '09:00');
        $this->assertTrue($past['past']);
        $this->assertFalse($past['available']);
        $this->assertSame('time_passed', $past['conflict']);
    }

    // ── 6. CAPACITY RELEASE BY STATUS ───────────────────────────────────

    public function test_released_statuses_free_capacity_and_active_statuses_keep_it(): void
    {
        $doctor = $this->doctor('Dr. One');
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');
        [$o3, $p3] = $this->ownerWithPet('Mochi');
        [$o4, $p4] = $this->ownerWithPet('Max');

        // Canceled releases the slot.
        $booked = $this->bookFor($o1, $p1, $this->consultation, '15:00')
            ->assertStatus(201)
            ->json('data.appointment.id');

        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$booked.'/status', ['status' => 'canceled'])
            ->assertOk();

        $this->bookFor($o2, $p2, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctor->id);

        // completed / no_show rows hold no capacity (seeded directly).
        $this->forceAppointment(['appointment_time' => '16:00:00', 'status' => 'completed', 'assigned_vet_id' => $doctor->id]);
        $this->forceAppointment(['appointment_time' => '17:00:00', 'status' => 'no_show', 'assigned_vet_id' => $doctor->id]);

        $this->bookFor($o3, $p3, $this->consultation, '16:00')->assertStatus(201);
        $this->bookFor($o4, $p4, $this->consultation, '17:00')->assertStatus(201);

        // An ACTIVE appointment does hold the doctor.
        $this->forceAppointment(['appointment_time' => '18:00:00', 'status' => 'checked_in', 'assigned_vet_id' => $doctor->id]);

        [$o5, $p5] = $this->ownerWithPet('Milo');
        $this->bookFor($o5, $p5, $this->consultation, '18:00')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No veterinarian is free at that time. Please choose a different slot.');
    }

    // ── 7. USER BOOKING AUTO-ASSIGN ─────────────────────────────────────

    public function test_user_booking_without_doctor_auto_assigns_the_least_loaded_eligible_free_doctor(): void
    {
        $doctorA = $this->doctor('Dr. Alpha');
        $doctorB = $this->doctor('Dr. Beta');

        // Doctor A already carries one booking later the same day.
        [$oBusy, $pBusy] = $this->ownerWithPet('Luna');
        $this->bookFor($oBusy, $pBusy, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorA->id);

        // A USER (no admin, no doctor pick) books at 16:00: both doctors are
        // free at that slot, so the least-loaded rule hands it to doctor B.
        [$owner, $pet] = $this->ownerWithPet('Buddy');

        $this->actingAs($owner)->postJson('/api/appointments', [
            'pet_id' => $pet->id,
            'service' => 'consultation',
            'appointment_date' => self::DAY,
            'appointment_time' => '16:00',
        ])
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorB->id)
            ->assertJsonPath('data.appointment.vet_name', $doctorB->display_name);
    }

    // ── AVAILABILITY ENDPOINT: RESOURCE-AWARENESS ───────────────────────

    public function test_availability_answers_per_resource_not_clinic_wide(): void
    {
        $doctorA = $this->doctor('Dr. Alpha');
        $doctorB = $this->doctor('Dr. Beta');
        [$o1, $p1] = $this->ownerWithPet('Luna');
        [$o2, $p2] = $this->ownerWithPet('Buddy');

        // Grooming at 15:00 must NOT hide 15:00 from consultation bookings.
        $this->bookFor($o1, $p1, $this->grooming, '15:00')->assertStatus(201);

        $consult = $this->actingAs($this->admin)
            ->getJson('/api/availability?date='.self::DAY.'&service=consultation')
            ->assertOk();
        $this->assertContains('15:00', $consult->json('data.slots'));
        $this->assertTrue($consult->json('data.doctor_available'));

        // Once a DOCTOR takes 15:00, consultation loses it but grooming keeps it.
        // Drop the pool to this one doctor first — with a second On Duty
        // doctor the slot would legitimately stay open for consultation.
        $doctorB->forceFill(['availability_status' => 'on_leave'])->save();

        $this->bookFor($o2, $p2, $this->consultation, '15:00')
            ->assertStatus(201)
            ->assertJsonPath('data.appointment.assignedVetId', $doctorA->id);

        $consult = $this->actingAs($this->admin)
            ->getJson('/api/availability?date='.self::DAY.'&service=consultation')
            ->assertOk();
        $this->assertNotContains('15:00', $consult->json('data.slots'));

        $groom = $this->actingAs($this->admin)
            ->getJson('/api/availability?date='.self::DAY.'&service=dog_grooming')
            ->assertOk();
        $this->assertContains('15:00', $groom->json('data.slots'));

        // Scoped to a doctor: busy doctor A loses 15:00, free doctor B keeps it.
        $busy = $this->actingAs($this->admin)
            ->getJson('/api/availability?date='.self::DAY.'&service=consultation&doctor_id='.$doctorA->id)
            ->assertOk();
        $this->assertNotContains('15:00', $busy->json('data.slots'));

        $free = $this->actingAs($this->admin)
            ->getJson('/api/availability?date='.self::DAY.'&service=consultation&doctor_id='.$doctorB->id)
            ->assertOk();
        $this->assertContains('15:00', $free->json('data.slots'));
    }
}
