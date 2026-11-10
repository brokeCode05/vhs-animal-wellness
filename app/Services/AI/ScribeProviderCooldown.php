<?php
namespace App\Services\AI;

use Illuminate\Support\Facades\Cache;
use Illuminate\Http\Client\Response;

/** Shared by Scribe callers using the same credential/model. Stores no clinical content. */
final class ScribeProviderCooldown
{
    private static function key(string $provider): string
    {
        $key=AiCredentials::key($provider==='groq'?'groq':'gemini','scribe');
        $model=(string) config($provider==='groq' ? 'ai.groq_model' : 'ai.model','');
        return 'scribe:cooldown:'.hash_hmac('sha256',$provider.'|'.$model.'|'.$key,(string)config('app.key'));
    }
    public static function remaining(string $provider): int
    {
        return max(0,(int)Cache::get(self::key($provider),0)-time());
    }
    public static function record(string $provider, array $metadata): void
    {
        // A provider-supplied wait is preferable. With no header, prevent an
        // immediate retry storm for one minute; do not claim this is quota reset.
        $seconds=max(1,min(86400,(int)($metadata['retry_after_seconds']??60)));
        $until=max(time()+$seconds,(int)Cache::get(self::key($provider),0));
        Cache::put(self::key($provider),$until,max(1,$until-time()));
    }
    public static function metadata(Response $response): array
    {
        $value=trim((string)$response->header('retry-after'));
        $seconds=is_numeric($value) ? (int)ceil((float)$value) : (($date=strtotime($value))!==false ? $date-time() : null);
        $result=[];
        if ($seconds!==null && $seconds>=0 && $seconds<=86400) $result['retry_after_seconds']=max(1,$seconds);
        // Allowlisted quota identifiers only. Never retain error text, model
        // bodies, project IDs, credentials, or quota dimensions/values.
        $kinds=[];
        foreach ((array)$response->json('error.details',[]) as $detail) {
            foreach ((array)($detail['violations']??[]) as $violation) {
                $metric=(string)($violation['quotaId']??'');
                foreach (['PerDay'=>'daily','PerMinute'=>'per_minute'] as $needle=>$kind) if (str_contains($metric,$needle)) $kinds[$kind]=true;
            }
        }
        if ($kinds) $result['limit_kind']=isset($kinds['daily']) ? 'daily' : 'per_minute';
        return $result;
    }
}
