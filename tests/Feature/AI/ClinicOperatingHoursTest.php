<?php
namespace Tests\Feature\AI;
use App\Models\User;
use App\Services\AI\PublicClinicDataResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
final class ClinicOperatingHoursTest extends TestCase {
 use RefreshDatabase;
 private function hours(string $open, string $close): array {
  return array_fill_keys(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], ['status'=>'open','open'=>$open,'close'=>$close]);
 }
 public function test_admin_updates_are_read_from_database_and_invalid_changes_rejected():void {
  $admin=User::factory()->create(['role'=>'Admin','status'=>'active','email_verified_at'=>now()]);
  $this->actingAs($admin)->withSession(['auth_version'=>$admin->auth_version]);
  $schedule=$this->hours('09:00','18:00'); $schedule['friday']=['status'=>'open','open'=>'10:00','close'=>'19:00']; $schedule['sunday']=['status'=>'closed','open'=>null,'close'=>null];
  $this->patchJson('/api/clinic-settings',['operatingHours'=>$schedule])->assertOk()->assertJsonPath('data.settings.operatingHours.friday.close','19:00');
  $facts=app(PublicClinicDataResolver::class)->resolve(['type'=>'hours']);
  self::assertSame('9:00 AM',$facts['regular_operating_hours']['monday']['open']);
  self::assertSame('7:00 PM',$facts['regular_operating_hours']['friday']['close']);
  self::assertSame('closed',$facts['regular_operating_hours']['sunday']['status']);
  $schedule['friday']['close']='08:00';
  $this->patchJson('/api/clinic-settings',['operatingHours'=>$schedule])->assertUnprocessable();
  self::assertSame('7:00 PM',app(PublicClinicDataResolver::class)->resolve(['type'=>'hours'])['regular_operating_hours']['friday']['close']);
  $schedule['friday']['close']='20:00';
  $this->patchJson('/api/clinic-settings',['operatingHours'=>$schedule])->assertOk();
  self::assertSame('8:00 PM',app(PublicClinicDataResolver::class)->resolve(['type'=>'hours'])['regular_operating_hours']['friday']['close']);
  $provider = new class implements \App\Services\AI\AiProviderInterface {
   public array $messages=[];
   public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
    $this->messages[]=$message;
    return ['text'=>$jsonSchema ? '{"operation":"hours","service":"none","matching_services":[]}' : 'On Friday regular hours are 10:00 AM to 8:00 PM. Please call to confirm.', 'usage'=>[]];
   }
  };
  config(['ai.enabled'=>true]);
  $facts = app(\App\Services\AI\PublicClinicFacts::class);
  $reply = (new \App\Services\AI\PublicGeminiConversation(new \App\Services\AI\AiGateway($provider), $facts, new PublicClinicDataResolver($facts)))->reply('When are you open Friday?',null,null);
  self::assertSame('ai',$reply['source']);
  self::assertStringContainsString('8:00 PM',$provider->messages[1]);
  $user=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
  $this->actingAs($user)->withSession(['auth_version'=>$user->auth_version]);
  $this->patchJson('/api/clinic-settings',['operatingHours'=>$schedule])->assertForbidden();
 }
 public function test_unknown_hours_do_not_become_opening_times():void {
  $result=app(PublicClinicDataResolver::class)->resolve(['type'=>'hours']);
  self::assertNull($result['regular_operating_hours']);
 }
 public function test_directory_reflects_active_accounts_and_never_exposes_private_fields():void {
  $user=User::factory()->create(['role'=>'Doctor','status'=>'active']);
  $doctor=\App\Models\DoctorProfile::forceCreate(['user_id'=>$user->id,'display_name'=>'Dr Fictional','account_status'=>'active','availability_status'=>'on_duty']);
  $result=app(PublicClinicDataResolver::class)->resolve(['type'=>'doctors']);
  self::assertSame('Dr Fictional',$result['public_doctors'][0]['name']);
  self::assertSame(['name','specialization'],array_keys($result['public_doctors'][0]));
  $doctor->account_status='inactive'; $doctor->save();
  self::assertSame([],app(PublicClinicDataResolver::class)->resolve(['type'=>'doctors'])['public_doctors']);
 }
}
