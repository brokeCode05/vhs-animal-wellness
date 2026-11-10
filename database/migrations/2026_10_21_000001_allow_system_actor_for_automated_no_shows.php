<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const ACTORS = ['User', 'Doctor', 'Admin', 'System'];
    private const ORIGINAL_ACTORS = ['User', 'Doctor', 'Admin'];

    public function up(): void
    {
        $this->changeActors(self::ACTORS);
    }

    public function down(): void
    {
        // Do not discard, misattribute or silently corrupt historical System events.
        if (DB::table('appointment_events')->where('actor_type', 'System')->exists()
            || DB::table('audit_logs')->where('actor_type', 'System')->exists()) {
            throw new RuntimeException('Cannot revert System actor support while automated audit history exists.');
        }

        $this->changeActors(self::ORIGINAL_ACTORS);
    }

    private function changeActors(array $values): void
    {
        if (DB::getDriverName() === 'mysql') {
            $enum = implode(',', array_map(fn ($value) => "'".$value."'", $values));
            DB::statement('ALTER TABLE `appointment_events` MODIFY `actor_type` ENUM('.$enum.') NOT NULL');
            DB::statement('ALTER TABLE `audit_logs` MODIFY `actor_type` ENUM('.$enum.') NOT NULL');
            return;
        }

        // Laravel's SQLite schema rebuild supports enum-column changes.
        foreach (['appointment_events', 'audit_logs'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($values): void {
                $table->enum('actor_type', $values)->change();
            });
        }
    }
};
