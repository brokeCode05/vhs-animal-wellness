<?php

namespace Tests\Feature;

use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class ServiceDurationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_set_and_unset_duration_without_changing_other_fields(): void
    {
        $admin=User::factory()->create(['role'=>'Admin','status'=>'active','email_verified_at'=>now()]);
        $this->actingAs($admin)->withSession(['auth_version'=>$admin->auth_version]);
        $service=new Service;
        $service->forceFill(['value'=>'fictional_grooming','label'=>'Fictional Grooming',
            'category'=>'Pet Care','price'=>100,'currency'=>'PHP','active'=>true])->save();
        self::assertNull($service->duration_minutes);
        $this->patchJson('/api/services/'.$service->id,['durationMinutes'=>30])
            ->assertOk()->assertJsonPath('data.service.durationMinutes',30);
        $this->patchJson('/api/services/'.$service->id,['label'=>'Fictional Grooming'])
            ->assertOk()->assertJsonPath('data.service.durationMinutes',30);
        $this->patchJson('/api/services/'.$service->id,['durationMinutes'=>null])
            ->assertOk()->assertJsonPath('data.service.durationMinutes',null);
        self::assertEquals(100,$service->fresh()->price);
    }

    public function test_invalid_durations_and_non_admin_updates_are_rejected(): void
    {
        $admin=User::factory()->create(['role'=>'Admin','status'=>'active','email_verified_at'=>now()]);
        $this->actingAs($admin)->withSession(['auth_version'=>$admin->auth_version]);
        $service=new Service;
        $service->forceFill(['value'=>'fictional','label'=>'Fictional','category'=>'Test',
            'price'=>100,'currency'=>'PHP','active'=>true])->save();
        foreach ([0,-1,1441,1.5] as $value) {
            $this->patchJson('/api/services/'.$service->id,['durationMinutes'=>$value])->assertUnprocessable();
        }
        $user=User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $this->actingAs($user)->withSession(['auth_version'=>$user->auth_version]);
        $this->patchJson('/api/services/'.$service->id,['durationMinutes'=>60])->assertForbidden();
        self::assertNull($service->fresh()->duration_minutes);
    }
}
