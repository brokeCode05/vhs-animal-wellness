<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        /*
         * REQ017 uses AuditWriter with entity_type = announcement.
         * The original audit_logs enum predates the announcement module and
         * therefore rejects that value. Expand it safely without recreating or
         * deleting the audit table/data.
         */
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
