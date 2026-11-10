<?php
namespace Tests\Feature\AI;

use App\Models\Service;
use App\Models\User;
use App\Services\AI\AiGateway;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\BookingConversationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class BookingConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_active_catalog_and_laravel_slots_reach_the_provider(): void
    {
        config(['ai.enabled'=>true]);
        $service = new Service;
        $service->forceFill(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true])->save();
        $provider = new class implements AiProviderInterface {
            public string $input='';
            public string $reply='Please review the Cat Grooming form and complete OTP.';
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->input=$message;
                return ['text'=>$this->reply,'usage'=>[]];
            }
        };
        $user = new User; $user->setRawAttributes(['id'=>123]);
        $booking = new BookingConversationService(new AiGateway($provider));
        $result = $booking->prepare($user,[['id'=>7,'name'=>'Fictional Pet','species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Please help me arrange a visit');
        $this->assertSame($result['slots'] === [] ? 'no_slots' : 'ready',$result['status']);
        $this->assertSame('cat_grooming',$result['service_value']);
        $this->assertStringContainsString('available_slots',$provider->input);
        $this->assertStringNotContainsString('Fictional Pet',$provider->input);
        $this->assertDatabaseCount('appointments',0);
        $booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Book PET_1 for grooming');
        $this->assertStringNotContainsString('PET_1', $provider->input);
        $provider->reply='PET_1 can visit for Cat Grooming.';
        $this->assertSame('unsafe_status_or_link',$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help')['failure_category']);
        $provider->reply='Please review the PET_SELECTED booking form.';
        $this->assertSame('unsafe_status_or_link',$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help')['failure_category']);
        $provider->reply='Please review the Cat Grooming form and complete OTP.';
        if (in_array('14:00', $result['slots'], true)) {
            $selected = $booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','2 PM','14:00');
            $this->assertSame('14:00',$selected['preferred_time']);
        }
        $this->assertSame('time_unavailable',$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','3 AM','03:00')['status']);
        $provider->reply='Your appointment is confirmed.';
        $rejected=$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help');
        $this->assertSame('response_rejected',$rejected['status']);
        $this->assertSame('unsafe_status_or_link',$rejected['failure_category']);
        $provider->reply='Your appointment has been booked.';
        $this->assertSame('unsafe_status_or_link',$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help')['failure_category']);
        $provider->reply='The price is 999999 pesos.';
        $rejected=$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help');
        $this->assertSame('unverified_number',$rejected['failure_category']);
        $service->active=false; $service->save();
        $this->assertSame('service_unavailable',$booking->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help')['status']);
    }
    public function test_generated_times_must_match_actual_slots_and_empty_availability_is_not_invented(): void
    {
        config(['ai.enabled'=>true]);
        Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true]);
        $provider = new class implements AiProviderInterface {
            public string $reply = 'The available time is 2:00.';
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array { return ['text'=>$this->reply,'usage'=>[]]; }
        };
        $availability = $this->mock(\App\Http\Controllers\AvailabilityController::class);
        $availability->shouldReceive('index')->times(5)->andReturn(
            response()->json(['success'=>true,'data'=>['slots'=>['12:00']]]),
            response()->json(['success'=>true,'data'=>['slots'=>['12:00']]]),
            response()->json(['success'=>true,'data'=>['slots'=>[]]]),
            response()->json(['success'=>true,'data'=>['slots'=>[]]]),
            response()->json(['success'=>true,'data'=>['slots'=>['14:00']]])
        );
        $user = new User; $user->setRawAttributes(['id'=>123]);
        $booking = new BookingConversationService(new AiGateway($provider));
        $pets = [['id'=>7,'species'=>'Cat']]; $date=now()->addDays(3)->toDateString();
        $bad=$booking->prepare($user,$pets,7,'grooming',$date,'afternoon','Help');
        $this->assertSame('unverified_time',$bad['failure_category']);
        $provider->reply='The available time is 12:00.';
        $shown=$booking->prepare($user,$pets,7,'grooming',$date,'afternoon','Help');
        $this->assertSame('ready',$shown['status']);
        $this->assertSame('The available time is 12:00 PM.',$shown['text']);
        $this->assertSame(['12:00'],$shown['slots']);
        $provider->reply='The available time is 12:00.';
        $this->assertSame('unverified_time',$booking->prepare($user,$pets,7,'grooming',$date,'afternoon','Help')['failure_category']);
        $provider->reply='There are no available times. Please try another date.';
        $empty=$booking->prepare($user,$pets,7,'grooming',$date,'afternoon','Help');
        $this->assertSame('no_slots',$empty['status']);
        $this->assertSame([],$empty['slots']);
        $provider->reply='The available time is 2:00 PM.';
        $this->assertSame('ready',$booking->prepare($user,$pets,7,'grooming',$date,'afternoon','Help')['status']);
        $this->assertDatabaseCount('appointments',0);
    }

    public function test_unavailable_time_uses_verified_alternatives_and_preserves_safe_fallback(): void
    {
        config(['ai.enabled'=>true]);
        Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true]);
        $provider=new class implements AiProviderInterface {
            public string $reply='That time is unavailable. Other times are 12:00 and 14:00.';
            public bool $fail=false; public array $input=[];
            public function generate(string $instructions,string $message,?array $jsonSchema=null):array {
                $this->input=json_decode($message,true);
                if ($this->fail) throw new \RuntimeException('synthetic failure');
                return ['text'=>$this->reply,'usage'=>[]];
            }
        };
        $this->mock(\App\Http\Controllers\AvailabilityController::class)->shouldReceive('index')->times(3)->andReturn(
            response()->json(['success'=>true,'data'=>['slots'=>['12:00','14:00']]])
        );
        $user=new User; $user->setRawAttributes(['id'=>123]);
        $booking=new BookingConversationService(new AiGateway($provider));
        $args=[$user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','synthetic request','08:00'];
        $result=$booking->prepare(...$args);
        $this->assertSame('time_unavailable',$result['status']);
        $this->assertSame('That time is unavailable. Other times are 12:00 PM and 2:00 PM.',$result['text']);
        $this->assertFalse($provider->input['verified_booking']['requested_time_available']);
        $this->assertSame(['12:00','14:00'],$provider->input['verified_booking']['available_slots']);
        $this->assertNull($result['preferred_time']);
        $provider->reply='That time is available at 08:00.';
        $bad=$booking->prepare(...$args);
        $this->assertSame('time_unavailable',$bad['status']);
        $this->assertSame('unverified_time',$bad['failure_category']);
        $this->assertArrayNotHasKey('text',$bad);
        $provider->fail=true;
        $failed=$booking->prepare(...$args);
        $this->assertSame('time_unavailable',$failed['status']);
        $this->assertArrayNotHasKey('text',$failed);
        $this->assertDatabaseCount('appointments',0);
    }

    public function test_availability_failure_does_not_invoke_provider(): void
    {
        config(['ai.enabled'=>true]);
        Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true]);
        $provider = new class implements AiProviderInterface {
            public int $calls=0;
            public function generate(string $instructions,string $message,?array $jsonSchema=null): array { $this->calls++; return ['text'=>'unused','usage'=>[]]; }
        };
        $this->mock(\App\Http\Controllers\AvailabilityController::class)->shouldReceive('index')->once()->andThrow(new \RuntimeException('synthetic failure'));
        $user=new User; $user->setRawAttributes(['id'=>123]);
        $result=(new BookingConversationService(new AiGateway($provider)))->prepare($user,[['id'=>7,'species'=>'Cat']],7,'grooming',now()->addDays(3)->toDateString(),'afternoon','Help');
        $this->assertSame('availability_unavailable',$result['status']);
        $this->assertSame(0,$provider->calls);
        $this->assertDatabaseCount('appointments',0);
    }


    public function test_explicit_grooming_code_cannot_bypass_species_validation(): void
    {
        Service::forceCreate(['value'=>'dog_grooming','label'=>'Dog Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true]);
        $fake=new \App\Services\AI\Providers\FakeAiProvider();
        $user=new User;$user->setRawAttributes(['id'=>123]);
        $reply=(new BookingConversationService(new AiGateway($fake)))->prepare($user,[['id'=>7,'species'=>'Cat']],7,'dog_grooming',now()->addDays(1)->toDateString(),'none','Book');
        self::assertSame('service_ambiguous',$reply['status']);
        self::assertSame(0,$fake->calls);
        $this->assertDatabaseCount('appointments',0);
    }

    public function test_new_active_catalog_codes_work_and_inactive_rows_are_never_proposed(): void
    {
        config(['ai.enabled'=>true]);
        $service=Service::forceCreate(['value'=>'new_catalog_procedure','label'=>'New Catalog Procedure','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true]);
        $user=new User;$user->setRawAttributes(['id'=>123]);
        $this->mock(\App\Http\Controllers\AvailabilityController::class)->shouldReceive('index')->once()
            ->andReturn(response()->json(['success'=>true,'data'=>['slots'=>['10:00']]]));
        $fake=new \App\Services\AI\Providers\FakeAiProvider('Review the proposed booking form. No appointment has been made.');
        $booking=new BookingConversationService(new AiGateway($fake));
        $args=[$user,[['id'=>7,'species'=>'Dog']],7,'new_catalog_procedure',now()->addDays(1)->toDateString(),'none','Book the requested service'];
        $answer=$booking->prepare(...$args);
        self::assertSame('ready',$answer['status']);self::assertSame('new_catalog_procedure',$answer['service_value']);
        $service->active=false;$service->save();
        self::assertSame('service_unavailable',$booking->prepare(...$args)['status']);
        self::assertSame(1,$fake->calls);
        $this->assertDatabaseCount('appointments',0);
    }
    public function test_exact_time_keeps_later_alternatives_and_explains_real_backend_reason(): void {
        config(['ai.enabled'=>true]);Service::forceCreate(['value'=>'dog_grooming','label'=>'Dog Grooming','category'=>'Test','price'=>100,'currency'=>'PHP','active'=>true]);
        $this->mock(\App\Http\Controllers\AvailabilityController::class)->shouldReceive('index')->twice()->andReturn(response()->json(['success'=>true,'data'=>['slots'=>['20:00','21:00'],'slot_details'=>[['time'=>'17:00','available'=>false,'conflict'=>'time_passed']]]]));
        $provider=new class implements AiProviderInterface {public array $facts=[];public string $reply='That time has already passed. You can choose 8:00 PM or 9:00 PM.';public function generate(string $instructions,string $message,?array $jsonSchema=null):array{$this->facts=json_decode($message,true)['verified_booking'];return ['text'=>$this->reply,'usage'=>[]];}};
        $u=new User;$u->setRawAttributes(['id'=>123]);$booking=new BookingConversationService(new AiGateway($provider));$args=[$u,[['id'=>7,'species'=>'Dog']],7,'dog_grooming',now()->toDateString(),'afternoon','How about 5pm?','17:00'];
        $r=$booking->prepare(...$args);self::assertSame(['20:00','21:00'],$r['slots']);self::assertSame('time_passed',$r['unavailable_reason']);self::assertSame('time_passed',$provider->facts['requested_time_reason']);
        $provider->reply='Oops, that slot was just taken.';$r=$booking->prepare(...$args);self::assertSame('unsupported_recent_change',$r['failure_category']);self::assertArrayNotHasKey('text',$r);self::assertSame(['20:00','21:00'],$r['slots']);
    }

}
