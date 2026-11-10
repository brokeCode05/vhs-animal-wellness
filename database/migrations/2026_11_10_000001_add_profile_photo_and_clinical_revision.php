<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::table('users', fn (Blueprint $table) => $table->string('photo_path')->nullable());
        Schema::table('consultations', fn (Blueprint $table) => $table->unsignedInteger('revision')->default(0));
    }
    public function down(): void {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('photo_path'));
        Schema::table('consultations', fn (Blueprint $table) => $table->dropColumn('revision'));
    }
};
