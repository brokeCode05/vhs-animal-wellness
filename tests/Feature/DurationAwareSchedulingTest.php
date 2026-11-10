<?php
namespace Tests\Feature;
use App\Models\{User,Pet,Service,DoctorProfile,Appointment,Consultation};
use App\Support\AppointmentWorkflow;
use App\Services\{ServiceDurationEstimator,SchedulingAvailability};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DurationAwareSchedulingTest extends TestCase
{
    use RefreshDatabase;
    private User $admin; private User $owner; private Pet $pet; private DoctorProfile $doctor; private Service $service; private int $sequence=0;
    protected function setUp(): void {
        parent::setUp();$this->travelTo(Carbon::parse('2026-11-10 08:00:00'));
        $this->admin=User::factory()->create(['role'=>'Admin']);$this->owner=User::factory()->create(['role'=>'User']);
        $this->pet=Pet::forceCreate(['owner_id'=>$this->owner->id,'name'=>'Fictional Pet','species'=>'Dog','gender'=>'Female']);
        $u=User::factory()->create(['role'=>'Doctor']);
        $this->doctor=DoctorProfile::forceCreate(['user_id'=>$u->id,'display_name'=>'Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        $this->service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true,'duration_minutes'=>45]);
        $hours=[];foreach(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as $day)$hours[$day]=['status'=>'open','open'=>'09:00','close'=>'18:00'];
        AppointmentWorkflow::settings()->forceFill(['weekday_first'=>'09:00','weekday_last'=>'18:00','weekend_first'=>'09:00','weekend_last'=>'18:00','slot_interval_minutes'=>15,'operating_hours'=>$hours,'cancel_cutoff_minutes'=>0,'reschedule_cutoff_minutes'=>0])->save();
    }
    private function visit(string $time,array $extra=[]): Appointment {
        return Appointment::forceCreate(array_merge(['reference_no'=>'INTERVAL-'.++$this->sequence,'user_id'=>$this->owner->id,'pet_id'=>$this->pet->id,'assigned_vet_id'=>$this->doctor->id,'service_id'=>$this->service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>'2026-11-10','appointment_time'=>$time.':00','status'=>'confirmed','created_via'=>'admin','duration_allocation'=>app(ServiceDurationEstimator::class)->allocation($this->service->fresh())],$extra));
    }
    private function available(?Service $service=null): array {
        return $this->actingAs($this->owner)->getJson('/api/availability?date=2026-11-10&service_id='.($service??$this->service)->id)->assertOk()->json('data');
    }
    private function book(string $time,array $extra=[]){
        return $this->actingAs($this->admin)->postJson('/api/appointments',array_merge(['user_id'=>$this->owner->id,'pet_id'=>$this->pet->id,'service_id'=>$this->service->id,'appointment_date'=>'2026-11-10','appointment_time'=>$time],$extra));
    }
    public function test_whole_interval_is_checked_in_both_directions_and_adjacent_end_is_free(): void {
        $this->visit('10:00');$d=$this->available();
        foreach(['09:30','09:45','10:00','10:15','10:30'] as $time)self::assertNotContains($time,$d['slots']);
        self::assertContains('09:15',$d['slots']);self::assertContains('10:45',$d['slots']);
        $this->book('09:45')->assertUnprocessable();$this->book('10:30')->assertUnprocessable();$this->book('10:45')->assertCreated();
    }
    public function test_known_closing_and_closed_day_are_authoritative_but_unknown_hours_are_labeled(): void {
        $d=$this->available();self::assertContains('17:15',$d['slots']);self::assertNotContains('17:30',$d['slots']);self::assertNotContains('18:00',$d['slots']);
        $this->book('17:30')->assertUnprocessable();
        $s=AppointmentWorkflow::settings();$h=$s->operating_hours;$h['tuesday']=['status'=>'closed'];$s->operating_hours=$h;$s->save();
        self::assertSame([],$this->available()['slots']);$this->book('10:00')->assertUnprocessable();
        $h['tuesday']=['status'=>'unknown'];$s->operating_hours=$h;$s->save();$d=$this->available();
        self::assertContains('18:00',$d['slots']);self::assertNotNull($d['closing_warning']);
    }
    public function test_explicit_buffer_blocks_beyond_service_time_without_inventing_a_buffer(): void {
        $this->service->forceFill(['scheduling_buffer_minutes'=>15])->save();$this->visit('10:00');$d=$this->available();
        self::assertNotContains('10:45',$d['slots']);self::assertContains('11:00',$d['slots']);self::assertSame(60,$d['duration_estimate']['allocated_minutes']);
    }
    public function test_unknown_duration_preserves_start_rules_and_exposes_warning(): void {
        $this->service->duration_minutes=null;$this->service->save();$this->visit('10:00');$d=$this->available();
        self::assertNull($d['duration_estimate']['allocated_minutes']);self::assertNotNull($d['duration_warning']);self::assertNotContains('10:00',$d['slots']);self::assertContains('10:15',$d['slots']);
    }
    public function test_non_doctor_capacity_uses_peak_overlap_not_sum_of_different_portions(): void {
        $this->service->forceFill(['value'=>'dog_grooming','duration_minutes'=>30])->save();
        $this->visit('10:00',['assigned_vet_id'=>null]);$this->visit('10:30',['assigned_vet_id'=>null]);
        $this->service->duration_minutes=60;$this->service->save();
        self::assertContains('10:00',$this->available()['slots']);$this->book('10:00')->assertCreated();
        self::assertNotContains('10:00',$this->available()['slots']);$this->book('10:15')->assertUnprocessable();
        $other=Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test','price'=>100,'active'=>true,'duration_minutes'=>60]);
        self::assertContains('10:00',$this->available($other)['slots']);
    }
    public function test_stale_proposal_revalidated_and_snapshot_visible_to_each_authorized_role(): void {
        self::assertContains('10:15',$this->available()['slots']);$first=$this->book('10:00')->assertCreated()->json('data.appointment');
        self::assertSame(45,$first['durationAllocation']['allocated_minutes']);$this->book('10:15')->assertUnprocessable();
        $this->actingAs($this->owner)->getJson('/api/appointments/'.$first['appointmentId'])->assertOk()->assertJsonPath('data.appointment.durationAllocation.allocated_minutes',45);
        $this->withSession(['auth_version'=>1])->actingAs($this->doctor->user)->getJson('/api/appointments')->assertOk()->assertJsonPath('data.appointments.0.appointmentId',$first['appointmentId']);
        $this->service->duration_minutes=120;$this->service->save();$a=Appointment::findOrFail($first['appointmentId']);
        self::assertSame(45,app(ServiceDurationEstimator::class)->existing($a)['allocated_minutes']);
    }
    public function test_reschedule_releases_old_interval_and_cancel_releases_new_interval(): void {
        $a=$this->visit('10:00');$this->visit('12:00');
        $this->actingAs($this->owner)->patchJson('/api/appointments/'.$a->id,['appointment_date'=>'2026-11-10','appointment_time'=>'11:45'])->assertUnprocessable();
        $this->actingAs($this->owner)->patchJson('/api/appointments/'.$a->id,['appointment_date'=>'2026-11-10','appointment_time'=>'11:00'])->assertOk();
        $d=$this->available();self::assertContains('10:00',$d['slots']);self::assertNotContains('11:15',$d['slots']);
        $this->actingAs($this->owner)->patchJson('/api/appointments/'.$a->id.'/status',['status'=>'canceled'])->assertOk();self::assertContains('11:00',$this->available()['slots']);
    }
    public function test_nearest_alternatives_are_proposals_and_not_appointments(): void {
        $this->visit('10:00');$d=$this->actingAs($this->owner)->getJson('/api/availability?date=2026-11-10&service_id='.$this->service->id.'&preferred_time=10:15')->assertOk()->json('data');
        self::assertSame('10:45',$d['recommendations'][0]['time']);self::assertTrue($d['recommendations'][0]['proposal_only']);self::assertSame(1,Appointment::count());
        self::assertArrayNotHasKey('free_doctor_ids',$d['slot_details'][0]);
    }
    public function test_unassigned_hold_reserves_capacity_and_other_doctor_still_can_accept(): void {
        $this->visit('10:00',['assigned_vet_id'=>null]);self::assertNotContains('10:15',$this->available()['slots']);
        $u=User::factory()->create(['role'=>'Doctor']);DoctorProfile::forceCreate(['user_id'=>$u->id,'display_name'=>'Second Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        self::assertContains('10:15',$this->available()['slots']);$this->book('10:15')->assertCreated();$this->book('10:15')->assertUnprocessable();
    }
    public function test_admin_settings_and_history_metadata_are_guarded(): void {
        $this->actingAs($this->owner)->patchJson('/api/services/'.$this->service->id,['schedulingBufferMinutes'=>5])->assertForbidden();
        $this->actingAs($this->admin)->patchJson('/api/services/'.$this->service->id,['schedulingBufferMinutes'=>5,'durationHistoryEnabled'=>false])->assertOk()->assertJsonPath('data.service.schedulingBufferMinutes',5);
        $this->actingAs($this->admin)->patchJson('/api/clinic-settings',['durationMinimumSamples'=>7])->assertOk()->assertJsonPath('data.settings.durationMinimumSamples',7);
        $this->actingAs($this->admin)->patchJson('/api/clinic-settings',['durationMinimumSamples'=>6])->assertUnprocessable();
        $this->actingAs($this->admin)->getJson('/api/scheduling/durations')->assertOk();
        $this->actingAs($this->owner)->getJson('/api/scheduling/durations')->assertForbidden();
    }
    public function test_doctor_lifecycle_updates_approved_history_only_by_explicit_choice(): void {
        $a=$this->visit('09:00',['status'=>'checked_in','checked_in_at'=>now()]);
        $r=$this->withSession(['auth_version'=>1])->actingAs($this->doctor->user)->postJson('/api/consultations',['appointment_id'=>$a->id])->assertCreated();$id=$r->json('data.consultation.consultationId');
        $start=Consultation::find($id)->started_at;$this->travel(5)->minutes();
        $this->postJson('/api/consultations',['appointment_id'=>$a->id])->assertCreated();self::assertTrue($start->equalTo(Consultation::find($id)->started_at));
        $this->travel(20)->minutes();
        $revision=Consultation::find($id)->revision;
        $this->patchJson('/api/consultations/'.$id,['expected_revision'=>$revision,'soap'=>['subjective'=>'Fictional history']])->assertOk();
        $revision=Consultation::find($id)->revision;
        $this->postJson('/api/consultations/'.$id.'/complete',['reviewed'=>true,'expected_revision'=>$revision,'duration_sample_approved'=>true])->assertOk();
        $c=Consultation::find($id);self::assertSame(25,$c->duration_minutes);self::assertTrue($c->duration_sample_approved);self::assertSame(1,app(ServiceDurationEstimator::class)->profile($this->service->fresh())['sample_count']);
        $this->postJson('/api/consultations/'.$id.'/complete',['reviewed'=>true,'expected_revision'=>$revision,'duration_sample_approved'=>true])->assertUnprocessable();
        self::assertSame(1,Consultation::where('appointment_id',$a->id)->count());
    }
    public function test_tenth_approved_completion_activates_history_for_future_availability(): void {
        for($i=0;$i<9;$i++) {
            $a=$this->visit('09:00',['appointment_date'=>'2026-11-08','status'=>'completed']);
            $start=Carbon::parse('2026-11-08 09:00:00');$end=$start->copy()->addMinutes(30);
            Consultation::forceCreate(['appointment_id'=>$a->id,'pet_id'=>$this->pet->id,'veterinarian_id'=>$this->doctor->id,'status'=>'completed','started_at'=>$start,'completed_at'=>$end,'duration_minutes'=>30,'duration_sample_approved'=>true,'duration_sample_approved_by'=>$this->doctor->user_id,'duration_sample_approved_at'=>$end]);
        }
        self::assertSame('configured_service',$this->available()['duration_estimate']['source']);
        $a=$this->visit('09:00',['status'=>'checked_in','checked_in_at'=>now()]);
        $r=$this->withSession(['auth_version'=>1])->actingAs($this->doctor->user)->postJson('/api/consultations',['appointment_id'=>$a->id])->assertCreated();
        $id=$r->json('data.consultation.consultationId');$this->travel(30)->minutes();
        $this->patchJson('/api/consultations/'.$id,['expected_revision'=>Consultation::find($id)->revision,'soap'=>['subjective'=>'Fictional history']])->assertOk();
        $this->postJson('/api/consultations/'.$id.'/complete',['reviewed'=>true,'expected_revision'=>Consultation::find($id)->revision,'duration_sample_approved'=>true])->assertOk();
        $this->withSession(['auth_version'=>0]);$d=$this->available();self::assertSame('approved_history_median',$d['duration_estimate']['source']);self::assertSame(30,$d['duration_estimate']['minutes']);self::assertSame(10,$d['duration_estimate']['sample_count']);
    }
    public function test_arrival_assignment_handles_past_non_grid_start_without_hiding_interval_conflicts(): void {
        $this->travelTo(Carbon::parse('2026-11-10 11:00:00'));
        $a=$this->visit('10:07',['assigned_vet_id'=>null]);
        $this->actingAs($this->admin)->patchJson('/api/appointments/'.$a->id.'/status',['status'=>'checked_in'])->assertOk();
        self::assertSame($this->doctor->id,$a->fresh()->assigned_vet_id);
    }
    public function test_marked_test_visit_cannot_enter_duration_history_even_if_doctor_checks_approval(): void {
        $a=$this->visit('09:00',['status'=>'in_consultation','is_test'=>true]);$start=now()->subMinutes(30);
        $c=Consultation::forceCreate(['appointment_id'=>$a->id,'pet_id'=>$this->pet->id,'veterinarian_id'=>$this->doctor->id,'status'=>'in_consultation','started_at'=>$start,'soap_subjective'=>'Fictional history']);
        $this->withSession(['auth_version'=>1])->actingAs($this->doctor->user)->postJson('/api/consultations/'.$c->id.'/complete',['reviewed'=>true,'expected_revision'=>$c->fresh()->revision,'duration_sample_approved'=>true])->assertOk();
        self::assertFalse($c->fresh()->duration_sample_approved);self::assertSame(0,app(ServiceDurationEstimator::class)->profile($this->service->fresh())['sample_count']);
    }
}
