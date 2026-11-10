<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('clinic_settings', fn (Blueprint $t) => $t->unsignedSmallInteger('duration_min_samples')->default(10));
        Schema::table('services', function (Blueprint $t) {
            $t->unsignedSmallInteger('scheduling_buffer_minutes')->nullable();
            $t->boolean('duration_history_enabled')->default(true);
        });
        Schema::table('appointments', function (Blueprint $t) {
            $t->json('duration_allocation')->nullable();
            $t->boolean('is_test')->default(false);
        });
        // Freeze only the service settings that exist at upgrade time. Later
        // history/configuration changes must never resize existing bookings.
        \Illuminate\Support\Facades\DB::table('appointments')->orderBy('id')->chunkById(200, function ($rows) {
            $services=\Illuminate\Support\Facades\DB::table('services')->whereIn('id',$rows->pluck('service_id'))->get()->keyBy('id');
            foreach($rows as $a) {
                $service=$services[$a->service_id] ?? null;
                $minutes=$service?->duration_minutes;
                $minutes=is_numeric($minutes) && $minutes>=1 && $minutes<=1440 ? (int)$minutes : null;
                $snapshot=['version'=>1,'minutes'=>$minutes,'buffer_minutes'=>null,'allocated_minutes'=>$minutes,
                    'source'=>$minutes===null?'legacy_unknown':'legacy_configured_service','sample_count'=>0,'minimum_samples'=>10,'recorded_at'=>now()->toIso8601String()];
                \Illuminate\Support\Facades\DB::table('appointments')->where('id',$a->id)->update(['duration_allocation'=>json_encode($snapshot)]);
            }
        });
        Schema::table('consultations', function (Blueprint $t) {
            $t->boolean('duration_sample_approved')->default(false);
            $t->unsignedBigInteger('duration_sample_approved_by')->nullable();
            $t->timestamp('duration_sample_approved_at')->nullable();
            $t->index(['duration_sample_approved','status'], 'idx_cons_duration_samples');
        });
    }
    public function down(): void {
        Schema::table('consultations', function (Blueprint $t) { $t->dropIndex('idx_cons_duration_samples'); $t->dropColumn(['duration_sample_approved','duration_sample_approved_by','duration_sample_approved_at']); });
        Schema::table('appointments', fn (Blueprint $t) => $t->dropColumn(['duration_allocation','is_test']));
        Schema::table('services', fn (Blueprint $t) => $t->dropColumn(['scheduling_buffer_minutes','duration_history_enabled']));
        Schema::table('clinic_settings', fn (Blueprint $t) => $t->dropColumn('duration_min_samples'));
    }
};
