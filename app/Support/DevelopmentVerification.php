<?php
namespace App\Support;
use Illuminate\Http\Request;
final class DevelopmentVerification {
    public static function allowed(Request $r): bool {
        return app()->environment(['local','testing']) && (bool) config('vhs.expose_dev_otp')
            && in_array($r->getHost(), ['localhost','127.0.0.1','::1','[::1]'], true)
            && in_array($r->ip(), ['127.0.0.1','::1'], true);
    }
}
