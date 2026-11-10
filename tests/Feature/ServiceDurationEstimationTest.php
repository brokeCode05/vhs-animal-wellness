<?php
namespace Tests\Feature;
use App\Models\{User,Pet,Service,DoctorProfile,Appointment,Consultation,ClinicSetting};
use App\Services\ServiceDurationEstimator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ServiceDurationEstimationTest extends TestCase
{
    use RefreshDatabase;
    private User $owner; private User $doctorUser; private DoctorProfile $doctor; private Pet $pet; private Service $service; private int $sequence=0;
    protected function setUp(): void {
        parent::setUp();$this->travelTo(Carbon::parse('2026-11-10 08:00:00'));
        $this->owner=User::factory()->create(['role'=>'User']);$this->doctorUser=User::factory()->create(['role'=>'Doctor']);
        $this->doctor=DoctorProfile::forceCreate(['user_id'=>$this->doctorUser->id,'display_name'=>'Fictional Doctor','account_status'=>'active','availability_status'=>'on_duty']);
        $this->pet=Pet::forceCreate(['owner_id'=>$this->owner->id,'name'=>'Fictional Pet','species'=>'Dog','gender'=>'Female']);
        $this->service=Service::forceCreate(['value'=>'consultation','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
        ClinicSetting::forceCreate(['id'=>1,'duration_min_samples'=>10]);
    }
    private function sample(int $minutes,array $appointment=[],array $consultation=[]): Consultation {
        $start=now()->subDays(2)->setTime(10,0);$end=$start->copy()->addMinutes($minutes);
        $a=Appointment::forceCreate(array_merge(['reference_no'=>'DURATION-'.++$this->sequence,'user_id'=>$this->owner->id,'pet_id'=>$this->pet->id,'assigned_vet_id'=>$this->doctor->id,'service_id'=>$this->service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>$start->toDateString(),'appointment_time'=>'10:00:00','status'=>'completed','created_via'=>'admin'], $appointment));
        return Consultation::forceCreate(array_merge(['appointment_id'=>$a->id,'pet_id'=>$this->pet->id,'veterinarian_id'=>$this->doctor->id,'status'=>'completed','started_at'=>$start,'completed_at'=>$end,'duration_minutes'=>$minutes,'duration_sample_approved'=>true,'duration_sample_approved_by'=>$this->doctorUser->id,'duration_sample_approved_at'=>$end],$consultation));
    }
    private function profile(): array { return app(ServiceDurationEstimator::class)->profile($this->service->fresh()); }
    public function test_unconfigured_and_insufficient_history_remains_unknown(): void {
        for($i=0;$i<9;$i++)$this->sample(30);
        $p=$this->profile();self::assertSame('unknown',$p['source']);self::assertNull($p['minutes']);self::assertSame(9,$p['sample_count']);self::assertSame('existing_start_slot_behavior',$p['fallback']);
    }
    public function test_manual_duration_is_fallback_not_slot_interval(): void {
        $this->service->forceFill(['duration_minutes'=>45,'scheduling_buffer_minutes'=>5])->save();
        $p=$this->profile();self::assertSame('configured_service',$p['source']);self::assertSame(45,$p['minutes']);self::assertSame(50,$p['allocated_minutes']);self::assertSame(0,$p['sample_count']);
    }
    public function test_ten_approved_samples_produce_service_median_rounded_up_for_allocation(): void {
        foreach([20,22,23,24,25,26,27,28,29,30] as $m)$this->sample($m);
        $p=$this->profile();self::assertSame('approved_history_median',$p['source']);self::assertSame(10,$p['sample_count']);self::assertEquals(25.5,$p['median_minutes']);self::assertSame(26,$p['minutes']);self::assertNull($p['buffer_minutes']);
    }
    public function test_outliers_are_reported_and_excluded_instead_of_averaged_in(): void {
        for($i=0;$i<10;$i++)$this->sample(30);$this->sample(900);
        $p=$this->profile();self::assertSame(11,$p['valid_before_outliers']);self::assertSame(10,$p['sample_count']);self::assertSame(1,$p['excluded']['outlier']);self::assertSame(30,$p['minutes']);
    }
    public function test_test_unapproved_incomplete_invalid_and_mismatched_rows_do_not_train(): void {
        for($i=0;$i<10;$i++)$this->sample(30);
        $this->sample(60,['is_test'=>true]);$this->sample(60,[],['duration_sample_approved'=>false]);
        $this->sample(60,[],['status'=>'in_consultation']);$this->sample(60,['status'=>'canceled']);
        $this->sample(0);$this->sample(-5);$this->sample(30,[],['completed_at'=>now()->addDay()]);$this->sample(30,[],['duration_minutes'=>100]);
        $p=$this->profile();self::assertSame(10,$p['sample_count']);self::assertSame(30,$p['minutes']);
        self::assertSame(1,$p['excluded']['test']);self::assertSame(1,$p['excluded']['unapproved']);self::assertSame(2,$p['excluded']['incomplete_or_relationship']);self::assertSame(3,$p['excluded']['invalid_timestamps']);self::assertSame(1,$p['excluded']['elapsed_mismatch']);
    }
    public function test_sample_minimum_is_configurable_within_owner_range(): void {
        ClinicSetting::whereKey(1)->update(['duration_min_samples'=>7]);for($i=0;$i<7;$i++)$this->sample(20);
        $p=$this->profile();self::assertSame(7,$p['minimum_samples']);self::assertSame('approved_history_median',$p['source']);
    }
    public function test_admin_can_disable_history_and_keep_manual_allocation(): void {
        for($i=0;$i<10;$i++)$this->sample(30);$this->service->forceFill(['duration_history_enabled'=>false,'duration_minutes'=>40])->save();
        $p=$this->profile();self::assertSame('configured_service',$p['source']);self::assertSame(40,$p['minutes']);self::assertFalse($p['history_enabled']);
    }
    public function test_booked_snapshot_is_stable_when_service_configuration_changes(): void {
        $this->service->forceFill(['duration_minutes'=>30])->save();$estimator=app(ServiceDurationEstimator::class);$snapshot=$estimator->allocation($this->service->fresh());
        $c=$this->sample(30,['duration_allocation'=>$snapshot]);$this->service->forceFill(['duration_minutes'=>90])->save();
        self::assertSame(30,app(ServiceDurationEstimator::class)->existing($c->appointment->fresh())['allocated_minutes']);
    }
    public function test_service_history_never_leaks_into_another_service(): void {
        for($i=0;$i<10;$i++)$this->sample(30);$other=Service::forceCreate(['value'=>'vaccination','label'=>'Vaccination','category'=>'Test','price'=>100,'active'=>true]);
        $p=app(ServiceDurationEstimator::class)->profile($other);self::assertNull($p['minutes']);self::assertSame(0,$p['sample_count']);
    }
}
