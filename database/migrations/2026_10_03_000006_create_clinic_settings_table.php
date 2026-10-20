<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinic_settings', function (Blueprint $table) {
            $table->id();
            $table->time('weekday_first')->default('09:00');
            $table->time('weekday_last')->default('17:00');
            $table->time('weekend_first')->default('10:00');
            $table->time('weekend_last')->default('18:00');
            $table->unsignedSmallInteger('slot_interval_minutes')->default(60);
            $table->unsignedSmallInteger('cancel_cutoff_minutes')->default(120);
            $table->unsignedSmallInteger('reschedule_cutoff_minutes')->default(120);
            $table->unsignedSmallInteger('noshow_grace_minutes')->default(15);
            $table->string('clinic_name', 120)->default('VHS Animal Wellness Center');
            $table->string('clinic_phone', 30)->nullable();
            $table->string('clinic_email', 191)->nullable();
            $table->string('clinic_website', 191)->nullable();
            $table->string('clinic_address', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinic_settings');
    }
};
