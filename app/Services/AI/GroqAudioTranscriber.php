<?php

namespace App\Services\AI;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Throwable;

/** Transcribes a bounded audio upload; no retries, content logs, or persistent audio storage. */
final class GroqAudioTranscriber
{
    public function transcribe(UploadedFile $audio): array
    {
        $key=AiCredentials::key('groq','scribe');
        if ($key==='') return ['ok'=>false,'code'=>'configuration'];
        $stream=fopen($audio->getRealPath(),'rb');
        if ($stream===false) return ['ok'=>false,'code'=>'unreadable_audio'];
        $extension=match($audio->getMimeType()) {
            'audio/webm','video/webm'=>'webm', 'audio/ogg'=>'ogg',
            'audio/wav','audio/x-wav'=>'wav', 'audio/mp4','video/mp4'=>'mp4', default=>null,
        };
        if ($extension===null) { fclose($stream); return ['ok'=>false,'code'=>'unsupported_audio']; }
        try {
            $response=Http::withToken($key)->acceptJson()->connectTimeout(5)->timeout(90)
                ->attach('file',$stream,'recording.'.$extension)
                ->post('https://api.groq.com/openai/v1/audio/transcriptions',[
                    'model'=>'whisper-large-v3','response_format'=>'json',
                ]);
            if (!$response->successful()) return ['ok'=>false,'code'=>$response->status()===429?'rate_limit':'provider_unavailable'];
            $text=$response->json('text');
            if (!is_string($text) || trim($text)==='' || mb_strlen($text)>100000) return ['ok'=>false,'code'=>'unusable_transcript'];
            return ['ok'=>true,'text'=>trim($text)];
        } catch (Throwable) {
            return ['ok'=>false,'code'=>'provider_unavailable'];
        } finally {
            if (is_resource($stream)) fclose($stream);
        }
    }
}
