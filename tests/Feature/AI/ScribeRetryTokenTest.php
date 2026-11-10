<?php
namespace Tests\Feature\AI;
use App\Services\AI\ScribeRetryToken;
use Tests\TestCase;
final class ScribeRetryTokenTest extends TestCase
{
 public function test_expired_token_is_rejected():void {$token=\Illuminate\Support\Facades\Crypt::encryptString(json_encode(['doctor'=>1,'appointment'=>2,'source_hash'=>hash('sha256','Fictional transcript.'),'expires'=>time()-1,'manifest'=>[]]));self::assertNull((new ScribeRetryToken())->read($token,1,2,'Fictional transcript.'));}
 public function test_token_is_bound_to_doctor_consultation_and_exact_transcript():void {$service=new ScribeRetryToken();$manifest=['ok'=>true,'chunks'=>[]];$token=$service->issue(1,2,'Fictional transcript.',$manifest);self::assertStringNotContainsString('Fictional transcript.',$token);self::assertSame($manifest,$service->read($token,1,2,'Fictional transcript.'));self::assertNull($service->read($token,3,2,'Fictional transcript.'));self::assertNull($service->read($token,1,3,'Fictional transcript.'));self::assertNull($service->read($token,1,2,'Fictional transcript!'));self::assertNull($service->read($token.'altered',1,2,'Fictional transcript.'));}
}
