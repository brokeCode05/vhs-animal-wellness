<?php
namespace Tests\Feature\AI;
use App\Services\AI\ScribeTranscriptChunker;
use Tests\TestCase;
final class ScribeTranscriptChunkerTest extends TestCase
{
 public function test_chunks_cover_every_byte_and_preserve_multilingual_text():void {
  $source="  Inuubo siya.\nHindi pa tiyak. 🐕  Follow up next week.  ";$r=(new ScribeTranscriptChunker())->plan($source,20);
  self::assertTrue($r['ok']);self::assertGreaterThan(1,count($r['chunks']));self::assertSame($source,implode('',array_column($r['chunks'],'text')));
  foreach($r['chunks'] as $chunk){self::assertLessThanOrEqual(20,strlen($chunk['text']));self::assertSame($chunk['text'],substr($source,$chunk['offset'],$chunk['length']));self::assertSame('pending',$chunk['status']);}
 }
 public function test_oversized_unbroken_text_is_reported_without_truncation():void {$r=(new ScribeTranscriptChunker())->plan('abcdefghijk',5);self::assertFalse($r['ok']);self::assertSame('segment_exceeds_limit',$r['code']);}
 public function test_sentence_boundary_is_preferred_without_losing_text():void {$source='First sentence. Second sentence is longer.';$r=(new ScribeTranscriptChunker())->plan($source,25);self::assertTrue($r['ok']);self::assertSame('First sentence. ',$r['chunks'][0]['text']);self::assertSame($source,implode('',array_column($r['chunks'],'text')));}
 public function test_early_boundary_never_creates_oversized_following_chunk():void {$source='A. '.str_repeat('word ',5).'extra ';$r=(new ScribeTranscriptChunker())->plan($source,24);self::assertTrue($r['ok']);self::assertSame($source,implode('',array_column($r['chunks'],'text')));foreach($r['chunks'] as $chunk) self::assertLessThanOrEqual(24,strlen($chunk['text']));}
 public function test_empty_input_is_rejected():void {self::assertSame('empty_transcript',(new ScribeTranscriptChunker())->plan('  ',20)['code']);}
}
