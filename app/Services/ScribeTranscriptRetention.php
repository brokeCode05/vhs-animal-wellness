<?php

namespace App\Services;

use App\Models\ConsultationWorkingDraft;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Removes only expired source transcripts from encrypted working drafts. */
final class ScribeTranscriptRetention
{
    public function purge(): int
    {
        $days=filter_var(config('vhs.scribe_transcript_retention_days'), FILTER_VALIDATE_INT);
        if (!$days || $days < 1 || !Schema::hasTable('consultation_working_drafts')) return 0;
        $cutoff = now()->subDays($days);
        $count = 0;
        $eligible = static function ($query) use ($cutoff) {
            $query->where('transcript_updated_at', '<=', $cutoff)
                ->orWhere(fn ($legacy) => $legacy->whereNull('transcript_updated_at')->where('updated_at', '<=', $cutoff));
        };
        ConsultationWorkingDraft::query()->where($eligible)->select('id')
            ->chunkById(100, function ($rows) use ($eligible, &$count) {
                foreach ($rows as $row) {
                    $removed = DB::transaction(function () use ($row, $eligible) {
                        $draft = ConsultationWorkingDraft::whereKey($row->id)->where($eligible)->lockForUpdate()->first();
                        if (!$draft) return false;
                        $payload = $draft->payload;
                        if (!is_array($payload) || !isset($payload['scribe']) || !is_array($payload['scribe'])) return false;
                        $scribe = $payload['scribe'];
                        if (!array_key_exists('transcript', $scribe) && !array_key_exists('transcriptAtGenerate', $scribe)) return false;
                        unset($scribe['transcript'], $scribe['transcriptAtGenerate']);
                        $payload['scribe'] = $scribe;
                        // Stale browser revisions may not restore an expired transcript.
                        $draft->payload = $payload;
                        $draft->transcript_updated_at = null;
                        $draft->revision = $draft->revision + 1;
                        $draft->save();
                        return true;
                    });
                    if ($removed) $count++;
                }
            });
        return $count;
    }
}
