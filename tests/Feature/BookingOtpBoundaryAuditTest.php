<?php
namespace Tests\Feature;
use App\Models\User;
use App\Models\Pet;
use App\Models\Service;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class BookingOtpBoundaryAuditTest extends TestCase
{
    use RefreshDatabase;
    private function fixture(): array
    {
        $user=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $pet=Pet::forceCreate(['owner_id'=>$user->id,'name'=>'Fictional','species'=>'Cat','gender'=>'Female']);
        Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Pet Care','price'=>100,'currency'=>'PHP','active'=>true]);
        $this->actingAs($user)->withSession(['auth_version'=>$user->auth_version]);
        return ['pet_id'=>$pet->id,'service'=>'cat_grooming','appointment_date'=>now()->addDay()->toDateString(),'appointment_time'=>'10:00'];
    }
    public function test_user_cannot_bypass_otp_through_direct_endpoints(): void
    {
        $payload=$this->fixture();
        $this->postJson('/api/appointments',$payload+['appointment_otp_verified'=>true])->assertForbidden();
        $this->postJson('/php_files/book-appointment.php',$payload)->assertForbidden();
        $this->assertDatabaseCount('appointments',0);
    }
    public function test_valid_otp_is_required_consumed_once_and_invalid_code_cannot_create(): void
    {
        Mail::fake(); config(['vhs.expose_dev_otp'=>true]);
        $payload=$this->fixture();
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>'123456','appointment_data'=>$payload])->assertUnprocessable();
        $issued=$this->postJson('/api/appointments/request_otp.php')->assertOk()->json('dev_otp');
        $this->assertIsString($issued);
        $wrong=$issued==='123456'?'654321':'123456';
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$wrong,'appointment_data'=>$payload])->assertUnprocessable();
        $this->assertDatabaseCount('appointments',0);
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$issued,'appointment_data'=>$payload])->assertCreated();
        $this->assertDatabaseCount('appointments',1);
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$issued,'appointment_data'=>$payload])->assertUnprocessable();
        $this->assertDatabaseCount('appointments',1);
    }
    public function test_booking_validation_failure_does_not_consume_valid_code(): void
    {
        Mail::fake(); config(['vhs.expose_dev_otp'=>true]);
        $payload=$this->fixture();
        $other=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $otherPet=Pet::forceCreate(['owner_id'=>$other->id,'name'=>'Other Fictional','species'=>'Cat','gender'=>'Female']);
        $issued=$this->postJson('/api/appointments/request_otp.php')->assertOk()->json('dev_otp');
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$issued,'appointment_data'=>array_replace($payload,['pet_id'=>$otherPet->id])])->assertUnprocessable();
        $this->assertDatabaseCount('appointments',0);
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$issued,'appointment_data'=>$payload])->assertCreated();
        $this->assertDatabaseCount('appointments',1);
    }
    public function test_male_pet_spay_is_rejected_after_otp_without_consuming_code(): void
    {
        Mail::fake(); config(['vhs.expose_dev_otp'=>true]);
        $payload=$this->fixture();
        $pet=Pet::findOrFail($payload['pet_id']);
        $pet->gender='Male'; $pet->save();
        Service::forceCreate(['value'=>'spay','label'=>'Spay','category'=>'Surgery',
            'price'=>100,'currency'=>'PHP','active'=>true]);
        $issued=$this->postJson('/api/appointments/request_otp.php')->assertOk()->json('dev_otp');
        $this->postJson('/api/appointments/verify_otp.php',[
            'otp_code'=>$issued,'appointment_data'=>array_replace($payload,['service'=>'spay']),
        ])->assertUnprocessable();
        $this->assertDatabaseCount('appointments',0);
        $this->postJson('/api/appointments/verify_otp.php',[
            'otp_code'=>$issued,'appointment_data'=>$payload,
        ])->assertCreated();
        $this->assertDatabaseCount('appointments',1);
    }

    public function test_unavailable_slot_does_not_consume_valid_code(): void
    {
        Mail::fake(); config(['vhs.expose_dev_otp'=>true]);
        $payload=$this->fixture();
        $issued=$this->postJson('/api/appointments/request_otp.php')->assertOk()->json('dev_otp');
        $bad=array_replace($payload,['appointment_time'=>'03:00']);
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$issued,'appointment_data'=>$bad])->assertUnprocessable();
        $this->assertDatabaseCount('appointments',0);
        $this->postJson('/api/appointments/verify_otp.php',['otp_code'=>$issued,'appointment_data'=>$payload])->assertCreated();
        $this->assertDatabaseCount('appointments',1);
    }
}
