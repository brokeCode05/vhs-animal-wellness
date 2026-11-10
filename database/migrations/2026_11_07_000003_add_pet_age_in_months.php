<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('pets', function (Blueprint $table) { $table->unsignedSmallInteger('age_months')->nullable(); $table->date('age_months_recorded_at')->nullable(); }); }
    public function down(): void { Schema::table('pets', function (Blueprint $table) { $table->dropColumn(['age_months','age_months_recorded_at']); }); }
};
