<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('employee_id', 30)->nullable()->after('role');
        });

        // Preserve existing accounts and assign IDs only to clinic staff.
        // Owner/User accounts intentionally keep employee_id = NULL.
        DB::table('users')
            ->whereIn('role', ['Admin', 'Doctor'])
            ->orderBy('id')
            ->get(['id', 'role'])
            ->each(function ($user) {
                $prefix = $user->role === 'Admin' ? 'ADM' : 'DOC';

                DB::table('users')
                    ->where('id', $user->id)
                    ->update([
                        'employee_id' => sprintf('VHS-%s-%04d', $prefix, $user->id),
                    ]);
            });

        Schema::table('users', function (Blueprint $table) {
            $table->unique('employee_id', 'uq_users_employee_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('uq_users_employee_id');
            $table->dropColumn('employee_id');
        });
    }
};
