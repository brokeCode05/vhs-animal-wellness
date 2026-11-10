<?php
namespace Tests\Feature;
use App\Models\{Appointment,Document,Pet,Service,User};
use App\Services\AI\{UserVettiFacts,AiProviderInterface};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
final class PrivateRecordsVettiTest extends TestCase {
 use RefreshDatabase;
 public function test_owner_scoped_metadata_and_completed_history_never_expose_payload():void {
  $a=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);$b=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
  $pa=Pet::forceCreate(['owner_id'=>$a->id,'name'=>'Fictional A','species'=>'Cat','gender'=>'Female']);$pb=Pet::forceCreate(['owner_id'=>$b->id,'name'=>'Fictional B','species'=>'Dog','gender'=>'Male']);
  $service=Service::forceCreate(['value'=>'fictional','label'=>'Consultation','category'=>'Test','price'=>100,'active'=>true]);
  $make=function($user,$pet,$ref,$status)use($service){return Appointment::forceCreate(['reference_no'=>$ref,'user_id'=>$user->id,'pet_id'=>$pet->id,'service_id'=>$service->id,'service_label_at_booking'=>'Consultation','price_at_booking'=>100,'appointment_date'=>'2026-10-01','appointment_time'=>'10:00:00','status'=>$status,'created_via'=>'admin']);};
  $aa=$make($a,$pa,'FAKE-A','completed');$bb=$make($b,$pb,'FAKE-B','completed');$make($a,$pa,'FAKE-C','canceled');
  foreach([[$aa,$a,$pa],[$bb,$b,$pb]] as [$appointment,$owner,$pet]) Document::forceCreate(['appointment_id'=>$appointment->id,'user_id'=>$owner->id,'pet_id'=>$pet->id,'type'=>'consultation_summary','status'=>'finalized','payload'=>['secret'=>'SENSITIVE-FICTIONAL-CONTENT']]);
  $facts=app(UserVettiFacts::class);self::assertCount(1,$facts->history($a));self::assertSame('Fictional A',$facts->history($a)[0]['pet_name']);self::assertSame([],$facts->history($a,$pb->id));
  $docs=$facts->documents($a);self::assertCount(1,$docs);self::assertArrayNotHasKey('payload',$docs[0]);self::assertSame([],$facts->documents($a,$pb->id));
  $this->actingAs($a)->withSession(['auth_version'=>$a->auth_version]);
  $other=Document::where('user_id',$b->id)->firstOrFail();$this->getJson('/api/documents/'.$other->id)->assertForbidden();
 }
}
