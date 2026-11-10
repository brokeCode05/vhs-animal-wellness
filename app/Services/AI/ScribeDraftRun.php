<?php
namespace App\Services\AI;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/** Short-lived encrypted checkpoints, scoped after controller authorization. */
final class ScribeDraftRun
{
    private const REVIEW_VERSION=1;

    public function run(array $scope, callable $operation): array
    {
        $encoded=json_encode(['version'=>4,'scope'=>$scope]);
        if ($encoded===false) return ['ok'=>false,'code'=>'invalid_input'];
        $id=hash_hmac('sha256',$encoded,(string)config('app.key'));
        $key='scribe:run:'.$id;
        try {
            $lock=Cache::lock($key.':lock',120);
            if (!$lock->get()) return ['ok'=>false,'code'=>'in_progress','jobId'=>$id,'retryAfter'=>5];
        } catch (Throwable) {
            // Fail before provider work if duplicate-processing protection is unavailable.
            return $this->unavailable($id);
        }
        try {
            $state=[];
            try {
                if ($encrypted=Cache::get($key)) {
                    try {$state=Crypt::decrypt($encrypted);} catch (Throwable) {Cache::forget($key);}
                }
            } catch (Throwable) {
                return $this->unavailable($id);
            }
            if (!is_array($state)) $state=[];
            // A new credential must not inherit an old credential's failed wait.
            // Completed drafting remains reusable; credentials are never cached.
            $quotaContext=hash_hmac('sha256',AiCredentials::key('gemini','scribe')."\0".AiCredentials::key('groq','scribe'),(string)config('app.key'));
            $waiting=($state['quotaContext']??null)===$quotaContext && ($state['nextReviewAt']??0)>time();
            if (($state['reviewVersion']??null)===self::REVIEW_VERSION && isset($state['result']) && (($state['complete']??false) || $waiting)) {
                $result=$state['result'];
                if (isset($result['automatedReview'])) $result['automatedReview']['retryAfter']=max(0,($state['nextReviewAt']??0)-time());
                return $result+['jobId'=>$id,'reused'=>true,'checkpointAvailable'=>true];
            }
            $write=static function(array $value) use($key): bool {
                try {return Cache::put($key,Crypt::encrypt($value),now()->addMinutes(15))!==false;}
                catch (Throwable) {return false;}
            };
            $checkpoint=$state['checkpoint']??null;
            $result=$operation($checkpoint, function(array $checkpoint) use(&$state,$write): void {
                $state=['checkpoint'=>$checkpoint];$write($state);
            });
            $reviewStatus=$result['automatedReview']['status']??null;
            if (($result['ok']??false) && $reviewStatus==='unavailable') {
                $state['complete']=false;
                $state['nextReviewAt']=time()+max(5,min(86400,(int)($result['automatedReview']['retryAfter']??60)));
            } elseif (($result['ok']??false) || ($result['code']??null)==='needs_manual_compression') $state['complete']=true;
            elseif (($result['failure']??null)==='rate_limit') $state['nextReviewAt']=time()+max(5,min(86400,(int)($result['retryAfter']??60)));
            else $state['nextReviewAt']=time()+5;
            $state['reviewVersion']=self::REVIEW_VERSION;
            $state['quotaContext']=$quotaContext;
            $state['result']=$result;
            $available=$write($state);
            if (!$available && ($result['ok']??false)) {
                $result['reviewWarnings'][]='Recovery checkpoint could not be saved. This proposal is available for review, but generating again may repeat provider work.';
            }
            return $result+['jobId'=>$id,'reused'=>$checkpoint!==null,'checkpointAvailable'=>$available];
        } finally {
            // A failed release must not replace a finished proposal with an error.
            // An unreleased lock still expires after its bounded 120-second lease.
            try {$lock->release();} catch (Throwable) {}
        }
    }

    private function unavailable(string $id): array
    {
        return ['ok'=>false,'code'=>'checkpoint_unavailable','jobId'=>$id,'retryAfter'=>5,'checkpointAvailable'=>false];
    }
}
