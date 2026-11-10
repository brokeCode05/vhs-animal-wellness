<?php
namespace Tests\Feature\AI;
use App\Models\{Service,User};
use App\Services\AI\{AiProviderInterface,AiGateway,BookingConversationService};
use App\Support\AppointmentWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;
final class SmartSchedulingConversationTest extends TestCase {
    use RefreshDatabase;
    public function test_vetti_receives_verified_duration_and_nearest_alternatives_without_creating_a_booking(): void {
        $this->travelTo(Carbon::parse('2026-11-10 08:00:00'));config(['ai.enabled'=>true]);
        Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true,'duration_minutes'=>30,'scheduling_buffer_minutes'=>5]);
        AppointmentWorkflow::settings()->forceFill(['weekday_first'=>'09:00','weekday_last'=>'18:00','slot_interval_minutes'=>60])->save();
        $provider=new class implements AiProviderInterface {
            public string $input=''; public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->input=$message;$this->calls++;return ['text'=>'Please review the form and complete OTP.','usage'=>[]];
            }
        };
        $user=User::factory()->create();$service=new BookingConversationService(new AiGateway($provider));
        $result=$service->prepare($user,[['id'=>7,'name'=>'Fictional Pet','species'=>'Cat']],7,'grooming','2026-11-11','afternoon','Please help with a visit at 2:15 PM','14:15');
        self::assertSame('time_unavailable',$result['status']);self::assertSame('14:00',$result['slots'][0]);
        $facts=json_decode($provider->input,true)['verified_booking'];
        self::assertSame(30,$facts['duration_minutes']);self::assertSame(5,$facts['buffer_minutes']);self::assertSame(35,$facts['allocated_minutes']);
        self::assertSame('configured_service',$facts['duration_source']);self::assertFalse($facts['appointment_booked']);self::assertSame(1,$provider->calls);
        self::assertStringNotContainsString('Fictional Pet',$provider->input);$this->assertDatabaseCount('appointments',0);
    }
}
