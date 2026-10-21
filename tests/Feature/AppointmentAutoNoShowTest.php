<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\AppointmentEvent;
use App\Models\ClinicSetting;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use App\Services\AppointmentNoShowService;
use App\Services\AI\UserVettiFacts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AppointmentAutoNoShowTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Pet $pet;
    private Service $service;
    private int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-21 12:00:00');
        $this->owner = User::factory()->create(['role' => 'User', 'status' => 'active', 'email_verified_at' => now()]);
        $this->pet = Pet::forceCreate([
            'owner_id' => $this->owner->id, 'name' => 'Bornok', 'species' => 'Dog', 'gender' => 'Male',
        ]);
        $this->service = Service::forceCreate([
            'value' => 'consultation', 'label' => 'Consultation',
            'category' => 'Preventive & Wellness', 'price' => 500, 'active' => true,
        ]);
        ClinicSetting::forceCreate(['id' => 1, 'noshow_grace_minutes' => 15]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function appointmentAt(string $when, string $status = 'confirmed', ?string $checkedInAt = null): Appointment
    {
        ++$this->sequence;
        $scheduled = Carbon::parse($when);
        return Appointment::forceCreate([
            'reference_no' => 'TEST-NO-SHOW-'.str_pad((string) $this->sequence, 3, '0', STR_PAD_LEFT),
            'user_id' => $this->owner->id,
            'pet_id' => $this->pet->id,
            'service_id' => $this->service->id,
            'service_label_at_booking' => 'Consultation',
            'price_at_booking' => 500,
            'appointment_date' => $scheduled->toDateString(),
            'appointment_time' => $scheduled->format('H:i:s'),
            'status' => $status,
            'checked_in_at' => $checkedInAt,
            'created_via' => 'user',
        ]);
    }

    public function test_unchecked_confirmed_visit_becomes_no_show_after_grace_with_system_audit(): void
    {
        $appointment = $this->appointmentAt('2026-10-21 09:00:00');
        $this->assertSame(1, app(AppointmentNoShowService::class)->reconcile());
        $this->assertSame('no_show', $appointment->fresh()->status);
        $this->assertDatabaseHas('appointment_events', [
            'appointment_id' => $appointment->id, 'event_type' => 'no_show', 'actor_type' => 'System',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'entity_id' => $appointment->id, 'action' => 'appointment_no_show', 'actor_type' => 'System',
        ]);
    }

    public function test_visit_is_not_no_show_before_grace_expires(): void
    {
        $justStarted = $this->appointmentAt('2026-10-21 11:50:00');
        $this->assertSame(0, app(AppointmentNoShowService::class)->reconcile());
        $this->assertSame('confirmed', $justStarted->fresh()->status);
    }

    public function test_checked_in_completed_canceled_and_pending_are_never_auto_no_show(): void
    {
        $checkedIn = $this->appointmentAt('2026-10-21 09:00:00', 'checked_in', '2026-10-21 08:45:00');
        $completed = $this->appointmentAt('2026-10-21 09:00:00', 'completed');
        $canceled = $this->appointmentAt('2026-10-21 09:00:00', 'canceled');
        $pending = $this->appointmentAt('2026-10-21 09:00:00', 'pending');
        $confirmedButChecked = $this->appointmentAt('2026-10-21 09:00:00', 'confirmed', '2026-10-21 08:45:00');
        $this->assertSame(0, app(AppointmentNoShowService::class)->reconcile());
        foreach ([$checkedIn, $completed, $canceled, $pending, $confirmedButChecked] as $a) {
            $this->assertSame($a->status, $a->fresh()->status);
        }
    }

    public function test_reconciliation_is_idempotent_and_retains_the_historical_appointment(): void
    {
        $appointment = $this->appointmentAt('2026-10-21 09:00:00');
        $service = app(AppointmentNoShowService::class);
        $this->assertSame(1, $service->reconcile());
        $this->assertSame(0, $service->reconcile());
        $this->assertDatabaseHas('appointments', ['id' => $appointment->id, 'status' => 'no_show']);
        $this->assertSame(1, AppointmentEvent::where('appointment_id', $appointment->id)->count());
        $this->assertSame([], (new UserVettiFacts)->upcoming($this->owner));
    }

    public function test_dry_run_does_not_change_appointment(): void
    {
        $appointment = $this->appointmentAt('2026-10-21 09:00:00');
        $this->artisan('vhs:reconcile-no-shows --dry-run')
            ->expectsOutput('Eligible confirmed/un-checked-in visits: 1')
            ->assertExitCode(0);
        $this->assertSame('confirmed', $appointment->fresh()->status);
    }

    public function test_console_command_marks_overdue_visit(): void
    {
        $appointment = $this->appointmentAt('2026-10-21 09:00:00');
        $this->artisan('vhs:reconcile-no-shows')
            ->expectsOutput('Automatically marked 1 missed appointment(s) as no-show.')
            ->assertExitCode(0);
        $this->assertSame('no_show', $appointment->fresh()->status);
    }
}
