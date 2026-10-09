<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->timestamp('phone_verified_at')->nullable();
            $t->unsignedInteger('auth_version')->default(1);
            $t->rememberToken();
        });
        Schema::table('account_verifications', function (Blueprint $t) {
            $t->char('session_hash', 64)->index();
        });
    }

    public function down(): void
    {
        Schema::table('account_verifications', fn (Blueprint $t) => $t->dropColumn('session_hash'));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['phone_verified_at', 'auth_version', 'remember_token']));
    }
};
