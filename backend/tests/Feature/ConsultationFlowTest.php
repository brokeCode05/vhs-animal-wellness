<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConsultationFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $doctorUser;
    private DoctorProfile $doctor;
    private User $owner;
    private Pet $pet;
    private Service $service;
    private Appointment $appointment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'Admin', 'status' => 'active', 'email_verified_at' => now()]);
        $this->doctorUser = User::factory()->create(['role' => 'Doctor', 'status' => 'active', 'email_verified_at' => now()]);
        $this->doctor = DoctorProfile::forceCreate([
            'user_id' => $this->doctorUser->id,
            'display_name' => 'Dr. Clinical Flow',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);
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
        // Check-in is only allowed on the appointment date and no earlier
        // than two hours before the scheduled time, so the test appointment
        // sits shortly before "now" (with a just-after-midnight fallback).
        $scheduled = now()->subMinutes(30);
        if ($scheduled->format('Y-m-d') !== now()->format('Y-m-d')) {
            $scheduled = now()->copy()->startOfDay()->addMinutes(5);
        }
        $this->appointment = Appointment::forceCreate([
            'reference_no' => 'REF-CLIN-001',
            'user_id' => $this->owner->id,
            'pet_id' => $this->pet->id,
            'assigned_vet_id' => $this->doctor->id,
            'service_id' => $this->service->id,
            'service_label_at_booking' => 'Consultation',
            'price_at_booking' => 500,
            'appointment_date' => $scheduled->toDateString(),
            'appointment_time' => $scheduled->format('H:i:00'),
            'status' => 'confirmed',
            'created_via' => 'admin',
        ]);
    }

    private function clinicalPayload(string $visitDate): array
    {
        return [
            'soap' => [
                'subjective' => 'Owner reports limping on the right foreleg.',
                'objective' => 'Mild swelling near carpus; weight 12.4kg, temp 38.6C, HR 96.',
                'assessment' => 'Soft tissue strain.',
                'plan' => 'Rest one week; NSAID as prescribed.',
                'weight' => '12.4',
                'temperature' => '38.6',
                'heartRate' => '96',
            ],
            'prescriptions' => [
                ['medicine' => 'Meloxicam', 'dosage' => '0.5 mL', 'frequency' => 'once daily', 'duration' => '5', 'instructions' => 'With food.'],
            ],
            'labRequests' => [
                ['test' => 'Blood test', 'notes' => 'Pre-NSAID panel.'],
            ],
            'vaccinations' => [
                [
                    'vaccineName' => 'Rabies',
                    'administeredDate' => $visitDate,
                    'nextDueDate' => now()->addYear()->toDateString(),
                    'batchNo' => 'RB-2026-014',
                    'notes' => 'No reaction observed.',
                ],
            ],
        ];
    }

    public function test_full_clinical_flow_from_check_in_to_history_readback(): void
    {
        // 1. Admin checks the patient in.
        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$this->appointment->id.'/status', ['status' => 'checked_in'])
            ->assertOk();
        $this->assertSame('checked_in', $this->appointment->fresh()->status);

        // 2. The assigned doctor's GET /api/appointments includes it.
        $this->actingAs($this->doctorUser)
            ->getJson('/api/appointments')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->appointment->id]);

        // 3. Start consultation — real row, appointment moves to in_consultation.
        $start = $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertStatus(201)
            ->assertJsonPath('data.consultation.appointmentId', $this->appointment->id)
            ->assertJsonPath('data.consultation.veterinarianId', $this->doctor->id)
            ->assertJsonPath('data.consultation.status', 'in_consultation');
        $consultationId = $start->json('data.consultation.consultationId');
        $this->assertNotNull($consultationId);
        $this->assertSame('in_consultation', $this->appointment->fresh()->status);
        $this->assertDatabaseCount('consultations', 1);

        // Repeated Start/Continue resumes the SAME row — never a duplicate.
        $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertSuccessful()
            ->assertJsonPath('data.consultation.consultationId', $consultationId);
        $this->assertDatabaseCount('consultations', 1);
        $this->assertSame($consultationId, ConsultationIdOf::get($this->appointment->id));

        // 4. Save SOAP + prescription + lab request + vaccination.
        $visitDate = $this->appointment->appointment_date->format('Y-m-d');
        $this->actingAs($this->doctorUser)
            ->patchJson('/api/consultations/'.$consultationId, $this->clinicalPayload($visitDate))
            ->assertOk()
            ->assertJsonPath('data.consultation.status', 'in_consultation');

        $this->assertDatabaseHas('consultations', [
            'id' => $consultationId,
            'soap_assessment' => 'Soft tissue strain.',
            'weight' => '12.4',
            'temperature' => '38.6',
            'heart_rate' => '96',
        ]);
        $this->assertDatabaseHas('prescriptions', ['consultation_id' => $consultationId, 'medicine' => 'Meloxicam']);
        $this->assertDatabaseHas('lab_requests', ['consultation_id' => $consultationId, 'test' => 'Blood test', 'status' => 'requested']);
        $this->assertDatabaseHas('vaccination_records', [
            'consultation_id' => $consultationId,
            'pet_id' => $this->pet->id,
            'veterinarian_id' => $this->doctor->id,
            'vaccine_name' => 'Rabies',
            'batch_no' => 'RB-2026-014',
        ]);

        // 5. Complete — consultation AND appointment finish together.
        $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations/'.$consultationId.'/complete')
            ->assertOk()
            ->assertJsonPath('data.consultation.status', 'completed');
        $this->assertSame('completed', $this->appointment->fresh()->status);
        $this->assertDatabaseHas('consultations', ['id' => $consultationId, 'status' => 'completed']);
        // Backend fan-out: client-facing documents exist without the frontend.
        $this->assertDatabaseHas('documents', ['appointment_id' => $this->appointment->id, 'type' => 'consultation_summary', 'status' => 'finalized']);
        $this->assertDatabaseHas('documents', ['appointment_id' => $this->appointment->id, 'type' => 'prescription', 'status' => 'finalized']);
        $this->assertDatabaseHas('documents', ['appointment_id' => $this->appointment->id, 'type' => 'lab_request', 'status' => 'finalized']);

        // 6. History readback returns the full structured clinical record.
        $history = $this->actingAs($this->doctorUser)
            ->getJson('/api/consultations?history_for_appointment_id='.$this->appointment->id)
            ->assertOk()
            ->assertJsonPath('data.history.0.referenceNo', 'REF-CLIN-001')
            ->assertJsonPath('data.history.0.service', 'Consultation')
            ->assertJsonPath('data.history.0.veterinarian', 'Dr. Clinical Flow')
            ->assertJsonPath('data.history.0.soap.assessment', 'Soft tissue strain.')
            ->assertJsonPath('data.history.0.prescriptions.0.medicine', 'Meloxicam')
            ->assertJsonPath('data.history.0.labRequests.0.test', 'Blood test')
            ->assertJsonPath('data.history.0.vaccinations.0.vaccineName', 'Rabies')
            ->assertJsonPath('data.history.0.vaccinations.0.batchNo', 'RB-2026-014');
        $this->assertCount(1, $history->json('data.history'));
    }

    public function test_completed_consultation_is_read_only_and_cannot_spawn_a_new_session(): void
    {
        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$this->appointment->id.'/status', ['status' => 'checked_in'])->assertOk();
        $id = $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertStatus(201)->json('data.consultation.consultationId');
        $this->actingAs($this->doctorUser)->postJson('/api/consultations/'.$id.'/complete')->assertOk();

        // Completed consultation is read-only.
        $this->actingAs($this->doctorUser)
            ->patchJson('/api/consultations/'.$id, ['soap' => ['plan' => 'Edited after completion.']])
            ->assertStatus(422);
        // And it cannot spawn another active session for the same appointment.
        $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertStatus(422);
        $this->assertDatabaseCount('consultations', 1);
    }

    public function test_only_the_assigned_doctor_may_touch_the_consultation(): void
    {
        // Check-in first (it attaches the least-loaded on-duty doctor —
        // only one profile exists at that point), THEN introduce the second
        // doctor who must not be able to touch the consultation.
        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$this->appointment->id.'/status', ['status' => 'checked_in'])->assertOk();
        $id = $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertStatus(201)->json('data.consultation.consultationId');

        $otherUser = User::factory()->create(['role' => 'Doctor', 'status' => 'active', 'email_verified_at' => now()]);
        $other = DoctorProfile::forceCreate([
            'user_id' => $otherUser->id,
            'display_name' => 'Dr. Other',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        // Another doctor cannot start on an appointment that is not theirs.
        $this->actingAs($otherUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertForbidden();
        // Nor edit or complete someone else's consultation.
        $this->actingAs($otherUser)
            ->patchJson('/api/consultations/'.$id, ['soap' => ['plan' => 'Not mine to edit.']])
            ->assertForbidden();
        $this->actingAs($otherUser)
            ->postJson('/api/consultations/'.$id.'/complete')
            ->assertForbidden();
        // Their appointment list never shows the other doctor's patient.
        $this->actingAs($otherUser)
            ->getJson('/api/appointments')
            ->assertOk()
            ->assertJsonMissing(['id' => $this->appointment->id]);
        $this->assertDatabaseHas('consultations', ['id' => $id, 'veterinarian_id' => $this->doctor->id]);
    }

    public function test_start_requires_checked_in_and_vaccination_date_must_match_visit(): void
    {
        // Confirmed appointment cannot start a consultation yet.
        $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->patchJson('/api/appointments/'.$this->appointment->id.'/status', ['status' => 'checked_in'])->assertOk();
        $id = $this->actingAs($this->doctorUser)
            ->postJson('/api/consultations', ['appointment_id' => $this->appointment->id])
            ->assertStatus(201)->json('data.consultation.consultationId');

        // A vaccination dated outside the visit is rejected server-side.
        $payload = $this->clinicalPayload(now()->addWeek()->toDateString());
        $this->actingAs($this->doctorUser)
            ->patchJson('/api/consultations/'.$id, ['vaccinations' => $payload['vaccinations']])
            ->assertStatus(422)
            ->assertJsonFragment(['Vaccination administered date must match the appointment date.']);
        $this->assertDatabaseCount('vaccination_records', 0);
    }
}

/** Small helper so the resume assertion reads clearly. */
class ConsultationIdOf
{
    public static function get(int $appointmentId): ?int
    {
        return \App\Models\Consultation::where('appointment_id', $appointmentId)->value('id');
    }
}
