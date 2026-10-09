<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ActiveAccount
{
    public function handle(Request $r, Closure $next)
    {
        $u = $r->user();
        if (! $u || ! $u->mayLogin() || ! $u->isVerified() || (int) $r->session()->get('auth_version') !== (int) $u->auth_version) {
            Auth::logout();
            $r->session()->invalidate();
            $r->session()->regenerateToken();
            abort(401, 'Please log in again.');
        }

        return $next($r);
    }
}
