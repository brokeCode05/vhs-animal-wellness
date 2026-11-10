<?php
namespace App\Support;
final class ContactLookup {
    public static function phoneHash(mixed $phone): ?string {
        $normalized=Identity::phone($phone);
        return preg_match('/\A\+639\d{9}\z/D',$normalized) ? hash_hmac('sha256','phone:'.$normalized,config('app.key')) : null;
    }
}
