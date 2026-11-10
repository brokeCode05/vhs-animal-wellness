<?php
namespace Tests\Feature\AI;

use App\Services\AI\{AiGateway,AiProviderInterface,ScribeSinglePassDraft,ScribeSourcePassages};
use Tests\TestCase;

final class ScribeSourcePassagesTest extends TestCase
{
    public function test_passages_preserve_multilingual_bytes_and_stable_offsets(): void
    {
        foreach (["\n\n  Umiinom siya.\n\n Wala akong napansing dugo.\nTimbang: 8.5 kg. 🐕  ",str_repeat('a. ',1000)] as $text) {
            $result=(new ScribeSourcePassages())->plan($text);
            self::assertTrue($result['ok']);self::assertSame($text,implode('',array_column($result['chunks'],'text')));
            self::assertLessThanOrEqual(128,count($result['chunks']));
            foreach($result['chunks'] as $part) { self::assertNotSame('',trim($part['text'])); self::assertSame($part['text'],substr($text,$part['offset'],$part['length'])); self::assertSame($part['context'],substr($text,$part['contextOffset'],strlen($part['context']))); self::assertSame($part['text'],substr($part['context'],$part['offset']-$part['contextOffset'],$part['length'])); }
        }
    }

    public function test_punctuation_free_text_is_split_without_losing_words_or_context(): void
    {
        foreach ([str_repeat('maayos ang paghinga at hindi pa nasusukat ang temperatura ',30),str_repeat('x',300).' ending'] as $text) {
            $result=(new ScribeSourcePassages())->plan($text);
            self::assertTrue($result['ok']);self::assertSame($text,implode('',array_column($result['chunks'],'text')));
            foreach ($result['chunks'] as $part) {
                self::assertSame($part['text'],substr($text,$part['offset'],$part['length']));
                self::assertSame($part['context'],substr($text,$part['contextOffset'],strlen($part['context'])));
            }
            if (str_contains($text,' ')) self::assertNotEmpty($result['chunks']);
            if (str_starts_with($text,'maayos')) self::assertGreaterThan(1,count($result['chunks']));
        }
    }

    public function test_different_sections_highlight_distinct_parts_of_the_same_sentence(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $schema=null):array {
                if (isset($schema['properties']['correction_support'])) return ['text'=>json_encode(\Tests\Support\ScribePipelineFixture::clearReview()),'usage'=>[]];
                $data=\Tests\Support\ScribePipelineFixture::emptyDraft();
                $data['objective']['statements']=[['text'=>'Alert and tender.','source_ids'=>[1,2]]];
                $data['assessment']['statements']=[['text'=>'Possible irritation.','source_ids'=>[3]]];
                return ['text'=>json_encode($data),'usage'=>[]];
            }
        };
        $source='🐕 Alert, abdomen tender, possible irritation.';
        $result=(new ScribeSinglePassDraft(new AiGateway($provider)))->generate($source);
        self::assertTrue($result['ok']);
        self::assertSame($source,$result['sources']['objective']);self::assertSame($source,$result['sources']['assessment']);
        $objective=$result['sourceViews']['objective'][0]['runs'];$assessment=$result['sourceViews']['assessment'][0]['runs'];
        self::assertSame($source,implode('',array_column($objective,'text')));self::assertSame($source,implode('',array_column($assessment,'text')));
        self::assertSame('🐕 Alert, abdomen tender,',implode('',array_column(array_filter($objective,static fn($r)=>$r['highlight']),'text')));
        self::assertSame(' possible irritation.',implode('',array_column(array_filter($assessment,static fn($r)=>$r['highlight']),'text')));
        self::assertCount(0,$result['reviewItems']);
    }

    public function test_unlinked_sentence_is_exposed_even_when_another_sentence_is_linked(): void
    {
        config(['ai.enabled'=>true,'ai.clinical_enabled'=>true,'ai.clinical_clearance'=>true,'ai.paid_data_approved'=>true,'ai.scribe_single_pass_enabled'=>true]);
        $provider=new class implements AiProviderInterface {
            public function generate(string $instructions,string $message,?array $schema=null):array {
                if (isset($schema['properties']['correction_support'])) return ['text'=>json_encode(\Tests\Support\ScribePipelineFixture::clearReview()),'usage'=>[]];
                $data=\Tests\Support\ScribePipelineFixture::emptyDraft();
                $data['subjective']['statements']=[['text'=>'Coughing.','source_ids'=>[1]]];
                return ['text'=>json_encode($data),'usage'=>[]];
            }
        };
        $source='Coughing today. Appetite is being monitored.';
        $result=(new ScribeSinglePassDraft(new AiGateway($provider)))->generate($source);
        self::assertTrue($result['ok']);self::assertSame('Coughing today.',$result['sources']['subjective']);
        self::assertCount(1,$result['unlinkedSources']);self::assertCount(0,$result['reviewItems']);
        self::assertSame(' Appetite is being monitored.',$result['unlinkedSources'][0]);
    }
}
