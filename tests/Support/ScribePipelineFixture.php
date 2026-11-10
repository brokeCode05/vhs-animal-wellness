<?php
namespace Tests\Support;

use App\Services\AI\AiProviderInterface;
use App\Services\AI\AiProviderException;

final class ScribePipelineFixture implements AiProviderInterface
{
    public int $calls=0;
    public int $draftCalls=0;
    public int $reviewCalls=0;
    public bool $reviewOffline=false;
    public array $requests=[];
    public array $draft;
    public array $review;
    public function __construct()
    {
        $this->draft=self::emptyDraft();
        $this->draft['subjective']['statements']=[['text'=>'Cough reported.','source_ids'=>[1]]];
        $this->review=self::clearReview();
    }
    public static function emptyDraft(): array
    {
        return array_fill_keys(['subjective','objective','assessment','plan'],['status'=>'complete','statements'=>[]]);
    }
    public static function clearReview(): array
    {
        return array_fill_keys(['subjective','objective','assessment','plan','assessment_support','correction_support','measurement_support','advice_support','language_support'],'equivalent')+['issues'=>[]];
    }
    public function generate(string $instructions,string $message,?array $schema=null):array
    {
        $this->calls++;$this->requests[]=['instructions'=>$instructions,'payload'=>json_decode($message,true),'schema'=>$schema];
        if (isset($schema['properties']['measurement_support'])) {
            $this->reviewCalls++;
            if ($this->reviewOffline) throw new AiProviderException('rate_limit',429,['retry_after_seconds'=>2]);
            $rows=$this->review;
        } else {$this->draftCalls++;$rows=$this->draft;}
        return ['text'=>json_encode($rows),'finish_reason'=>'STOP','usage'=>['prompt_tokens'=>100,'output_tokens'=>50,'total_tokens'=>150]];
    }
}
