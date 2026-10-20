<?php

namespace Tests\Feature;

use App\Models\DoctorProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UsersControllerSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $user;
    private User $doctor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => 'Admin',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->user = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $doctorUser = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        // The Doctor ROLE is asserted by the users.role column — the actor
        // in the tests below is the USER account, not the profile row. The
        // profile is seeded beside it so the account mirrors a real doctor.
        $this->doctor = $doctorUser;

        DoctorProfile::forceCreate([
            'user_id' => $doctorUser->id,
            'display_name' => 'Dr. Privacy Guard',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);
    }

    private function actingAsUser(User $user): self
    {
        $this->actingAs($user);

        return $this;
    }

    public function test_admin_can_list_users(): void
    {
        $this->actingAsUser($this->admin)
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonStructure(['data' => ['users' => ['*' => ['userId', 'firstName', 'lastName', 'email', 'role', 'status']]]])
            ->assertJsonCount(1, 'data.users');
    }

    public function test_user_cannot_list_users(): void
    {
        $this->actingAsUser($this->user)
            ->getJson('/api/users')
            ->assertStatus(403);
    }

    public function test_doctor_cannot_list_users(): void
    {
        $this->actingAsUser($this->doctor)
            ->getJson('/api/users')
            ->assertStatus(403);
    }

    public function test_unauthenticated_cannot_list_users(): void
    {
        $this->getJson('/api/users')
            ->assertStatus(401);
    }

    public function test_user_can_only_self_show(): void
    {
        $this->actingAsUser($this->user)
            ->getJson('/api/users/'.$this->user->id)
            ->assertOk()
            ->assertJsonPath('data.user.id', $this->user->id);
    }

    public function test_user_cannot_show_other_user(): void
    {
        $other = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->actingAsUser($this->user)
            ->getJson('/api/users/'.$other->id)
            ->assertStatus(403);
    }

    public function test_doctor_cannot_show_other_user(): void
    {
        $other = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->actingAsUser($this->doctor)
            ->getJson('/api/users/'.$other->id)
            ->assertStatus(403);
    }

    public function test_admin_show_user_still_works(): void
    {
        $this->actingAsUser($this->admin)
            ->getJson('/api/users/'.$this->user->id)
            ->assertOk()
            ->assertJsonPath('data.user.email', $this->user->email);
    }

    public function test_admin_listing_still_excludes_admin_doctor_accounts(): void
    {
        $admin = $this->admin;
        $doctorUser = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->actingAsUser($admin)
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonMissing(['userId' => $doctorUser->id])
            ->assertJsonMissing(['userId' => $admin->id]);
    }

    public function test_users_list_route_is_inside_the_admin_only_group(): void
    {
        // Route-table introspection through the LIVE router (the old
        // $this->app->routes array shape no longer exists on this framework
        // version). The regression this locks: GET /api/users is reachable
        // only through the role:Admin group, never as a client/self route.
        $listRoute = null;
        foreach ($this->app->make('router')->getRoutes()->getRoutes() as $route) {
            if (in_array('GET', $route->methods(), true)
                && $route->uri() === 'api/users'
                && $route->getActionName() === \App\Http\Controllers\UsersController::class.'@index') {
                $listRoute = $route;
                break;
            }
        }

        $this->assertNotNull($listRoute, 'GET /api/users (UsersController@index) must exist');

        $this->assertContains(
            'role:Admin',
            $listRoute->gatherMiddleware(),
            'GET /api/users must sit inside the role:Admin middleware group'
        );
    }
}

class PetsControllerMedicalRecordsSOAPTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $doctorUser;
    private DoctorProfile $doctor;
    private Pet $pet;
    private Appointment $appointment;
    private Consultation $consultation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create([
            'role' => 'User',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->doctorUser = User::factory()->create([
            'role' => 'Doctor',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $this->doctor = DoctorProfile::forceCreate([
            'user_id' => $this->doctorUser->id,
            'display_name' => 'Dr. SOAP Guard',
            'account_status' => 'active',
            'availability_status' => 'on_duty',
        ]);

        $this->pet = Pet::forceCreate([
            'owner_id' => $this->owner->id,
            'name' => 'Clover',
            'species' => 'Dog',
            'gender' => 'Female',
        ]);

        $service = Service::forceCreate([
            'value' => 'consultation',
            'label' => 'Consultation',
            'category' => 'Preventive & Wellness',
            'price' => 500,
            'active' => true,
        ]);

        $scheduled = now()->copy()->addDay()->startOfDay()->addMinutes(30);
        if ($scheduled->format('Y-m-d') !== now()->format('Y-m-d')) {
            $scheduled = now()->copy()->startOfDay()->addMinutes(30);
        }

        $this->appointment = Appointment::forceCreate([
            'reference_no' => 'REF-SOAP-001',
            'user_id' => $this->owner->id,
            'pet_id' => $this->pet->id,
            'assigned_vet_id' => $this->doctor->id,
            'service_id' => $service->id,
            'service_label_at_booking' => 'Consultation',
            'price_at_booking' => 500,
            'appointment_date' => $scheduled->toDateString(),
            'appointment_time' => $scheduled->format('H:i:00'),
            'status' => 'confirmed',
            'created_via' => 'admin',
        ]);

        $this->consultation = Consultation::forceCreate([
            'appointment_id' => $this->appointment->id,
            'pet_id' => $this->pet->id,
            'veterinarian_id' => $this->doctor->id,
            'soap_assessment' => 'Raw Doctor SOAP assessment',
            'soap_plan' => 'Raw Doctor SOAP plan',
            'soap_subjective' => 'Raw Doctor SOAP subjective field',
            'soap_objective' => 'Raw Doctor SOAP objective field',
            'weight' => '12.4',
            'temperature' => '38.6',
            'heart_rate' => '96',
            'status' => 'completed',
            'completed_at' => now(),
        ]);
    }

    private function actingAsUser(User $user): self
    {
        $this->actingAs($user);

        return $this;
    }

    public function test_doctor_can_still_read_full_soap_where_permitted(): void
    {
        $this->actingAsUser($this->doctorUser)
            ->getJson('/api/consultations?history_for_appointment_id='.$this->appointment->id)
            ->assertOk()
            ->assertJsonPath('data.history.0.soap.assessment', 'Raw Doctor SOAP assessment')
            ->assertJsonPath('data.history.0.soap.subjective', 'Raw Doctor SOAP subjective field')
            ->assertJsonPath('data.history.0.soap.objective', 'Raw Doctor SOAP objective field')
            ->assertJsonPath('data.history.0.weight', '12.4')
            ->assertJsonPath('data.history.0.temperature', '38.6')
            ->assertJsonPath('data.history.0.heart_rate', '96');
    }

    public function test_user_medical_records_hide_raw_soap_fields(): void
    {
        $this->actingAsUser($this->owner)
            ->getJson('/api/pets/'.$this->pet->id.'/medical-records')
            ->assertOk()
            ->assertJsonPath('data.petId', $this->pet->id)
            ->assertJsonMissing(['rawClinicalNarrative' => 'Raw Doctor SOAP subjective field'])
            ->assertJsonMissing(['subjective' => 'Raw Doctor SOAP subjective field'])
            ->assertJsonMissing(['objective' => 'Raw Doctor SOAP objective field'])
            ->assertJsonMissing(['weight' => '12.4'])
            ->assertJsonMissing(['temperature' => '38.6'])
            ->assertJsonMissing(['heartRate' => '96']);
    }

    public function test_user_medical_records_keep_approved_client_summary_fields(): void
    {
        $this->actingAsUser($this->owner)
            ->getJson('/api/pets/'.$this->pet->id.'/medical-records')
            ->assertOk()
            ->assertJsonPath('data.records.0.assessment', 'Raw Doctor SOAP assessment')
            ->assertJsonPath('data.records.0.plan', 'Raw Doctor SOAP plan')
            ->assertJsonPath('data.records.0.service', 'Consultation')
            ->assertJsonPath('data.records.0.date', $this->appointment->appointment_date->format('Y-m-d'))
            ->assertJsonPath('data.records.0.veterinarian', 'Dr. SOAP Guard');
    }
}
