<?php

namespace Tests\Feature\AI;

use App\Models\Service;
use App\Services\AI\PublicClinicFacts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicPricingTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_explicit_public_pricing_is_exposed(): void
    {
        foreach ([
            ['value'=>'unverified','label'=>'Unverified','price'=>100],
            ['value'=>'range','label'=>'Range','price'=>100,'public_pricing_type'=>'range','public_price_min'=>100,'public_price_max'=>800],
            ['value'=>'contact','label'=>'Contact','price'=>500,'public_pricing_type'=>'contact'],
            ['value'=>'inactive','label'=>'Inactive','price'=>100,'active'=>false,'public_pricing_type'=>'starting','public_price_min'=>100],
        ] as $attributes) {
            $service = new Service;
            $service->forceFill(array_merge(['category'=>'Test','currency'=>'PHP','active'=>true],$attributes))->save();
        }
        $facts = app(PublicClinicFacts::class)->load();
        $this->assertTrue($facts['available']);
        $this->assertNull($facts['service_details']['Unverified']['pricing_type']);
        $this->assertNull($facts['service_details']['Unverified']['price']);
        $this->assertSame('range',$facts['service_details']['Range']['pricing_type']);
        $this->assertEquals(100,$facts['service_details']['Range']['price_min']);
        $this->assertEquals(800,$facts['service_details']['Range']['price_max']);
        $this->assertSame('contact',$facts['service_details']['Contact']['pricing_type']);
        $this->assertNull($facts['service_details']['Contact']['price_min']);
        $this->assertArrayNotHasKey('Inactive',$facts['service_details']);
    }
    public function test_public_pricing_validation_rejects_incomplete_and_reversed_ranges(): void
    {
        $controller = app(\App\Http\Controllers\ServicesController::class);
        $method = new \ReflectionMethod($controller, 'publicPricing');
        $valid = \Illuminate\Http\Request::create('/', 'POST', ['publicPricingType'=>'range','publicPriceMin'=>100,'publicPriceMax'=>800]);
        $this->assertSame('range', $method->invoke($controller, $valid)['public_pricing_type']);
        foreach ([
            ['publicPricingType'=>'range','publicPriceMin'=>100,'publicPriceMax'=>50],
            ['publicPricingType'=>'range','publicPriceMin'=>100],
            ['publicPricingType'=>'starting'],
            ['publicPricingType'=>'invalid'],
        ] as $input) {
            try {
                $method->invoke($controller, \Illuminate\Http\Request::create('/', 'POST', $input));
                $this->fail('Invalid pricing was accepted.');
            } catch (\Illuminate\Validation\ValidationException $e) {
                $this->assertNotEmpty($e->errors());
            }
        }
        $unset = $method->invoke($controller, \Illuminate\Http\Request::create('/', 'POST', ['publicPricingType'=>'contact','publicPriceMin'=>100]));
        $this->assertNull($unset['public_price_min']);
    }
    public function test_admin_can_save_all_types_and_catalog_matches(): void
    {
        $admin = \App\Models\User::factory()->create(['role'=>'Admin','status'=>'active','email_verified_at'=>now()]);
        $this->actingAs($admin)->withSession(['auth_version'=>$admin->auth_version]);
        $service = new Service;
        $service->forceFill(['value'=>'fictional','label'=>'Fictional Service','category'=>'Test','price'=>40,'currency'=>'PHP','active'=>true])->save();
        foreach ([
            ['range',100,800],['starting',120,null],['single',200,null],['contact',null,null],[null,null,null],
        ] as [$type,$min,$max]) {
            $this->patchJson('/api/services/'.$service->id,['publicPricingType'=>$type,'publicPriceMin'=>$min,'publicPriceMax'=>$max])
                ->assertOk()->assertJsonPath('data.service.publicPricingType',$type);
            $this->getJson('/api/services?active=1')->assertOk()->assertJsonPath('data.services.0.publicPricingType',$type);
            $facts=app(PublicClinicFacts::class)->load();
            $this->assertSame($type,$facts['service_details']['Fictional Service']['pricing_type']);
            $this->assertEquals($min,$facts['service_details']['Fictional Service']['price_min']);
            $this->assertEquals($max,$facts['service_details']['Fictional Service']['price_max']);
        }
        $this->assertEquals(40,$service->fresh()->price);
        $this->patchJson('/api/services/'.$service->id,['publicPricingType'=>'range','publicPriceMin'=>500,'publicPriceMax'=>100])->assertUnprocessable();
        $user=\App\Models\User::factory()->create(['role'=>'User','status'=>'active','email_verified_at'=>now()]);
        $this->actingAs($user)->withSession(['auth_version'=>$user->auth_version]);
        $this->patchJson('/api/services/'.$service->id,['publicPricingType'=>'starting','publicPriceMin'=>1])->assertForbidden();
    }
}
