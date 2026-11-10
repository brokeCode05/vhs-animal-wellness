<?php
namespace Tests\Feature\AI;

use App\Services\AI\GroqAudioTranscriber;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GroqAudioTranscriberTest extends TestCase
{
    public function test_fictional_audio_success_and_provider_failure(): void
    {
        config(['ai.groq_api_key'=>'fictional-test-key']);
        $file=\Mockery::mock(UploadedFile::class);
        $file->shouldReceive('getRealPath')->andReturn(__FILE__);
        $file->shouldReceive('getMimeType')->andReturn('audio/webm');
        Http::fake(['api.groq.com/*'=>Http::sequence()->push(['text'=>'fictional transcript'],200)->push(['error'=>'not retained'],429)]);
        $service=new GroqAudioTranscriber;
        $this->assertSame(['ok'=>true,'text'=>'fictional transcript'],$service->transcribe($file));
        $this->assertSame(['ok'=>false,'code'=>'rate_limit'],$service->transcribe($file));
    }
    public function test_long_fictional_transcript_is_preserved_up_to_the_working_draft_limit(): void
    {
        config(['ai.groq_api_key'=>'fictional-test-key']);
        $file=\Mockery::mock(UploadedFile::class);
        $file->shouldReceive('getRealPath')->andReturn(__FILE__);
        $file->shouldReceive('getMimeType')->andReturn('audio/webm');
        $long=str_repeat('fictional ',1000);
        Http::fake(['api.groq.com/*'=>Http::sequence()->push(['text'=>$long],200)->push(['text'=>str_repeat('a',30001)],200)->push(['text'=>str_repeat('a',100001)],200)]);
        $service=new GroqAudioTranscriber;
        $this->assertGreaterThan(8000,strlen($long));
        $this->assertSame(trim($long),$service->transcribe($file)['text']);
        $this->assertSame(['ok'=>true,'text'=>str_repeat('a',30001)],$service->transcribe($file));
        $this->assertSame(['ok'=>false,'code'=>'unusable_transcript'],$service->transcribe($file));
    }
    public function test_missing_key_and_unsupported_audio_are_rejected(): void
    {
        $file=\Mockery::mock(UploadedFile::class);
        config(['ai.groq_api_key'=>'']);
        $this->assertSame('configuration',(new GroqAudioTranscriber)->transcribe($file)['code']);
        config(['ai.groq_api_key'=>'fictional-test-key']);
        $file->shouldReceive('getRealPath')->andReturn(__FILE__);
        $file->shouldReceive('getMimeType')->andReturn('text/plain');
        $this->assertSame('unsupported_audio',(new GroqAudioTranscriber)->transcribe($file)['code']);
    }
}
