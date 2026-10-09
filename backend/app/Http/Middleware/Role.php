<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class Role
{
    public function handle(Request $r, Closure $next, string ...$roles)
    {
        abort_unless($r->user() && in_array($r->user()->role, $roles, true), 403, 'Access denied.');

        return $next($r);
    }
}
