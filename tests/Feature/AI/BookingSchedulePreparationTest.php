<?php
namespace Tests\Feature\AI;
use App\Services\AI\{AiProviderInterface,AiGateway,BookingConversationService};
use App\Http\Controllers\AvailabilityController;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
final class BookingSchedulePreparationTest extends TestCase {
 public function test_only_verified_matching_intervals_reach_narration_and_unknown_duration_is_qualified():void {
  // A tiny fictional fixture in SQLite memory, without application migrations.
  self::assertSame('sqlite',config('database.default'));self::assertSame(':memory:',config('database.connections.sqlite.database'));
  DB::statement('CREATE TABLE services (id INTEGER PRIMARY KEY, value TEXT, label TEXT, active INTEGER, deleted_at TEXT)');
  DB::table('services')->insert(['id'=>1,'value'=>'consultation','label'=>'Consultation','active'=>1]);
  config(['ai.enabled'=>true]);
  $provider=new class implements AiProviderInterface {public array $calls=[];public array $steps=[];public function generate(string $i,string $m,?array $s=null):array {$this->calls[]=json_decode($m,true);return ['text'=>$this->steps?array_shift($this->steps):'Here are the matching choices for review.','usage'=>[]];}};
  $user=new User;$user->setRawAttributes(['id'=>123]);
  $result=['success'=>true,'data'=>['slots'=>['11:00','11:30','13:00','18:00'],'recommendations'=>[['time'=>'03:00']], 'duration_estimate'=>['allocated_minutes'=>60]]];
  $controller=$this->mock(AvailabilityController::class);$controller->shouldReceive('index')->andReturnUsing(function()use(&$result){return response()->json($result);});
  $schedule=['blocked'=>[[720,1080]],'allowed'=>[[0,720],[1080,1440]]];
  $service=new BookingConversationService(new AiGateway($provider));
  $args=[$user,[['id'=>7,'species'=>'Cat']],7,'consultation','2026-11-20','none','Show matching starts',null,null,$schedule];
  $r=$service->prepare(...$args);self::assertSame(['11:00','18:00'],$r['slots']);self::assertTrue($provider->calls[0]['verified_booking']['complete_interval_checked']);
  $result['data']['duration_estimate']['allocated_minutes']=null;
  $r=$service->prepare(...$args);self::assertSame(['11:00','11:30','18:00'],$r['slots']);self::assertStringContainsString('duration is unknown',$r['text']);
  $result['data']['slots']=['13:00'];$r=$service->prepare(...$args);self::assertSame('no_slots',$r['status']);self::assertSame([],$r['slots']);
  $result['data']['slots']=['11:00','13:00','18:00'];$result['data']['duration_estimate']['allocated_minutes']=60;
  $provider->steps=['Try 3:30 AM.','You can choose SLOT_1 or SLOT_2.'];
  $r=$service->prepare(...$args);self::assertSame('ready',$r['status']);self::assertSame('You can choose 11:00 AM or 6:00 PM.',$r['text']);
  self::assertStringNotContainsString('3:30',$r['text']);self::assertSame(['SLOT_1','SLOT_2'],$provider->calls[4]['available_choices']);
  $provider->steps=['Try 3:30 AM.','Choose SLOT_99.'];$r=$service->prepare(...$args);self::assertSame('response_rejected',$r['status']);self::assertSame('unverified_time',$r['failure_category']);
  $result['success']=false;$r=$service->prepare(...$args);self::assertSame('availability_unavailable',$r['status']);self::assertCount(7,$provider->calls);
 }
}
