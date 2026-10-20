<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /*
     * MySQL can widen an ENUM in place; SQLite cannot. SQLite stores an enum
     * as TEXT plus a CHECK constraint, so the allowed values only widen when
     * the table is rebuilt — which is exactly what ->change() compiles to on
     * the sqlite driver. MySQL keeps the original raw ALTER ... MODIFY path.
     */
    private const VALUES = [
        'appointment',
        'doctor',
        'user',
        'pet',
        'service',
        'clinic_settings',
        'document',
        'announcement',
    ];

    private const ORIGINAL_VALUES = [
        'appointment',
        'doctor',
        'user',
        'pet',
        'service',
        'clinic_settings',
        'document',
    ];

    public function up(): void
    {
        /*
         * REQ017 uses AuditWriter with entity_type = announcement.
         * The original audit_logs enum predates the announcement module and
         * therefore rejects that value. Expand it safely without recreating or
         * deleting the audit table/data.
         */
        if (DB::getDriverName() === 'sqlite') {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->enum('entity_type', self::VALUES)->change();
            });

            return;
        }

        DB::statement("
            ALTER TABLE `audit_logs`
            MODIFY `entity_type`
            ENUM(
                'appointment',
                'doctor',
                'user',
                'pet',
                'service',
                'clinic_settings',
                'document',
                'announcement'
            ) NOT NULL
        ");
    }

    public function down(): void
    {
        // Preserve rollback validity by remapping announcement audit entries
        // before restoring the original enum.
        DB::table('audit_logs')
            ->where('entity_type', 'announcement')
            ->update(['entity_type' => 'clinic_settings']);

        if (DB::getDriverName() === 'sqlite') {
            Schema::table('audit_logs', function (Blueprint $table) {
                $table->enum('entity_type', self::ORIGINAL_VALUES)->change();
            });

            return;
        }

        DB::statement("
            ALTER TABLE `audit_logs`
            MODIFY `entity_type`
            ENUM(
                'appointment',
                'doctor',
                'user',
                'pet',
                'service',
                'clinic_settings',
                'document'
            ) NOT NULL
        ");
    }
};
