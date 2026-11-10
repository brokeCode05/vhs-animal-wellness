<?php
namespace Tests\Feature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\User;
use Tests\TestCase;
final class PetAgeMonthsTest extends TestCase {
 use RefreshDatabase;
 public function test_months_and_small_weight_round_trip_without_inventing_birthdate():void {
  $user=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
  $this->actingAs($user)->withSession(['auth_version'=>$user->auth_version]);
  $res=$this->postJson('/api/pets',['name'=>'Fictional','species'=>'Cat','breed'=>'Unknown','gender'=>'Female','ageMonths'=>3,'weightKg'=>0.35]);
  $res->assertCreated()->assertJsonPath('data.pet.ageMonths',3)->assertJsonPath('data.pet.weightKg',0.35)->assertJsonPath('data.pet.birthdate','');
  $id=$res->json('data.pet.id');$this->getJson('/api/pets/'.$id)->assertOk()->assertJsonPath('data.pet.ageMonths',3);
  $this->patchJson('/api/pets/'.$id,['ageMonths'=>4,'weightKg'=>0.05])->assertOk()->assertJsonPath('data.pet.ageMonths',4)->assertJsonPath('data.pet.weightKg',0.05);
  $this->travel(2)->months();
  $this->getJson('/api/pets/'.$id)->assertOk()->assertJsonPath('data.pet.ageMonths',6);
  $this->travelBack();
  $this->postJson('/api/pets',['name'=>'Other','species'=>'Dog','gender'=>'Male','ageMonths'=>3,'age'=>1])->assertUnprocessable();
  $newborn=$this->postJson('/api/pets',['name'=>'Newborn','species'=>'Dog','gender'=>'Male','ageMonths'=>0]);
  $newborn->assertCreated()->assertJsonPath('data.pet.ageMonths',0)->assertJsonPath('data.pet.weightKg',null);
  $this->patchJson('/api/pets/'.$id,['age'=>2])->assertOk()->assertJsonPath('data.pet.age',2)->assertJsonPath('data.pet.ageMonths',null);
  $other=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
  $this->actingAs($other)->withSession(['auth_version'=>$other->auth_version]);
  $this->patchJson('/api/pets/'.$id,['ageMonths'=>5])->assertForbidden();
 }
 public function test_varied_decimal_weights_and_month_ages_round_trip_for_small_mammals():void {
  $user=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
  $this->actingAs($user)->withSession(['auth_version'=>$user->auth_version]);
  $base=['name'=>'Fictional Small Mammal','species'=>'Other','speciesCustom'=>'Hamster','breed'=>'Unknown','gender'=>'Female','ageMonths'=>2];
  foreach(['.05','.3','.5','.75','0.85','1.2','2.65','200'] as $weight) {
   $r=$this->postJson('/api/pets',$base+['weightKg'=>$weight])->assertCreated()->assertJsonPath('data.pet.weightKg',fn($actual)=>(float)$actual===(float)$weight)->assertJsonPath('data.pet.ageMonths',2)->assertJsonPath('data.pet.age','')->assertJsonPath('data.pet.speciesCustom','Hamster');
   $this->getJson('/api/pets/'.$r->json('data.pet.id'))->assertOk()->assertJsonPath('data.pet.weightKg',fn($actual)=>(float)$actual===(float)$weight);
  }
  foreach(['-0.2','.','0.123','201','NaN'] as $weight) $this->postJson('/api/pets',$base+['weightKg'=>$weight])->assertUnprocessable()->assertJsonValidationErrors('weightKg');
  $this->postJson('/api/pets',array_merge($base,['ageMonths'=>601]))->assertUnprocessable()->assertJsonValidationErrors('ageMonths');
 }

}
