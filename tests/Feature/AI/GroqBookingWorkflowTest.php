<?php
namespace Tests\Feature\AI;

use App\Http\Controllers\AvailabilityController;
use App\Http\Middleware\RecordUserAccess;
use App\Models\Service;
use App\Models\User;
use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\GeminiProvider;
use App\Services\AI\UserVettiFacts;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GroqBookingWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_backup_does_not_bypass_pet_ownership(): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.api_key'=>'fictional',
            'ai.groq_api_key'=>'fictional','ai.groq_user_backup_enabled'=>true,
            'ai.semantic_privacy_cleared'=>true,'ai.paid_data_approved'=>true]);
        $this->app->instance(AiProviderInterface::class,new GeminiProvider());
        $user=new User; $user->setRawAttributes(['id'=>123,'name'=>'Synthetic','role'=>'User',
            'status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
        $facts=$this->mock(UserVettiFacts::class);
        $facts->shouldReceive('pets')->once()->andReturn([['id'=>7,'name'=>'Fictionalpet','species'=>'Cat']]);
        $facts->shouldReceive('ownsPet')->once()->with(\Mockery::any(),7)->andReturn(false);
        $this->mock(AvailabilityController::class)->shouldNotReceive('index');
        $interpretation=['intent'=>'booking','pet_ref'=>'PET_1','service'=>'grooming','date_expression'=>'tomorrow',
            'time_preference'=>'none','negated'=>false,'multiple_services'=>false,'needs_clarification'=>false,
            'changed_fields'=>['pet','service','date']];
        Http::fake(['generativelanguage.googleapis.com/*'=>Http::response([],503),
            'api.groq.com/*'=>Http::response(['choices'=>[['message'=>['content'=>json_encode($interpretation)]]]],200)]);
        $response=$this->postJson('/api/ai/semantic-vetti',['message'=>'Book Fictionalpet for grooming tomorrow','conversation_id'=>'fictional_denied_12345']);
        $response->assertOk()->assertJsonMissingPath('data.pet_id')->assertJsonMissingPath('data.service_value');
        $this->assertDatabaseCount('appointments',0);
    }

    public function test_backup_booking_uses_owned_pet_verified_slots_and_never_creates_appointment(): void
    {
        $this->withoutMiddleware(RecordUserAccess::class);
        config(['ai.enabled'=>true,'ai.semantic_vetti_enabled'=>true,'ai.api_key'=>'fictional',
            'ai.groq_api_key'=>'fictional','ai.groq_user_backup_enabled'=>true,
            'ai.semantic_privacy_cleared'=>true,'ai.paid_data_approved'=>true]);
        $this->app->instance(AiProviderInterface::class, new GeminiProvider());
        $user=new User; $user->setRawAttributes(['id'=>123,'name'=>'Synthetic','role'=>'User',
            'status'=>'active','auth_version'=>1,'email_verified_at'=>'2026-01-01 00:00:00']);
        $this->actingAs($user)->withSession(['auth_version'=>1]);
        $facts=$this->mock(UserVettiFacts::class);
        $facts->shouldReceive('pets')->twice()->andReturn([['id'=>7,'name'=>'Fictionalpet','species'=>'Cat']]);
        $facts->shouldReceive('ownsPet')->twice()->with(\Mockery::any(),7)->andReturn(true);
        Service::forceCreate(['value'=>'cat_grooming','label'=>'Cat Grooming','category'=>'Test',
            'price'=>100,'currency'=>'PHP','active'=>true]);
        $availability=$this->mock(AvailabilityController::class);
        $availability->shouldReceive('index')->twice()->andReturn(response()->json(['success'=>true,'data'=>['slots'=>['10:00','14:00']]]));
        $structured=0;
        Http::fake(function (Request $request) use (&$structured) {
            if (str_contains($request->url(),'generativelanguage.googleapis.com')) return Http::response([],503);
            if (!str_contains($request->url(),'api.groq.com')) return Http::response([],500);
            $payload=$request->data();
            if (isset($payload['response_format'])) {
                $first=++$structured === 1;
                $content=json_encode(['intent'=>$first?'booking':'booking_followup', 'pet_ref'=>$first?'PET_1':'none',
                    'service'=>$first?'grooming':'none', 'date_expression'=>$first?'tomorrow':'',
                    'time_preference'=>$first?'none':'afternoon', 'negated'=>false,'multiple_services'=>false,
                    'needs_clarification'=>false,'changed_fields'=>$first?['pet','service','date']:['time_preference']]);
            } else $content='Please review the available appointment options and complete the booking form and OTP.';
            return Http::response(['choices'=>[['message'=>['content'=>$content]]]],200);
        });
        $id='fictional_booking_12345';
        $this->postJson('/api/ai/semantic-vetti',['message'=>'Book Fictionalpet for grooming tomorrow','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.booking_created',false)
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_value','cat_grooming');
        $this->postJson('/api/ai/semantic-vetti',['message'=>'The afternoon please','conversation_id'=>$id])
            ->assertOk()->assertJsonPath('data.kind','booking_proposal')->assertJsonPath('data.booking_created',false)
            ->assertJsonPath('data.pet_id',7)->assertJsonPath('data.service_value','cat_grooming')
            ->assertJsonPath('data.time_preference','afternoon');
        Http::assertSent(fn (Request $request) => str_contains($request->url(),'api.groq.com'));
        Http::assertNotSent(fn (Request $request) => (str_contains($request->url(),'api.groq.com') || str_contains($request->url(),'generativelanguage.googleapis.com'))
            && str_contains(json_encode($request->data()),'Fictionalpet'));
        Http::assertSent(fn (Request $request) => str_contains($request->url(),'api.groq.com')
            && str_contains(json_encode($request->data()),'PET_1'));
        $this->assertDatabaseCount('appointments',0);
    }
}
