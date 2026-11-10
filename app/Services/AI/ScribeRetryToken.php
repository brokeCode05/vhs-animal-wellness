<?php
namespace App\Services\AI;

use Illuminate\Support\Facades\Crypt;
use Throwable;

/** Short-lived encrypted recovery material; do not persist or log it. */
final class ScribeRetryToken
{
    public function issue(int $doctorId, int $appointmentId, string $transcript, array $manifest): string
    {
        return Crypt::encryptString(json_encode(['doctor'=>$doctorId,'appointment'=>$appointmentId,'source_hash'=>hash('sha256',$transcript),'expires'=>time()+900,'manifest'=>$manifest],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
    }

    public function read(string $token, int $doctorId, int $appointmentId, string $transcript): ?array
    {
        try {
            $value=json_decode(Crypt::decryptString($token),true,512,JSON_THROW_ON_ERROR);
            if (!is_array($value) || ($value['doctor']??null)!==$doctorId || ($value['appointment']??null)!==$appointmentId || !is_int($value['expires']??null) || $value['expires']<time() || !is_string($value['source_hash']??null) || !hash_equals($value['source_hash'],hash('sha256',$transcript)) || !is_array($value['manifest']??null)) return null;
            return $value['manifest'];
        } catch (Throwable) { return null; }
    }
}
