<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('appointment_id');
            $table->unsignedBigInteger('pet_id');
            $table->unsignedBigInteger('veterinarian_id');
            $table->enum('status', ['in_consultation', 'completed'])->default('in_consultation');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedSmallInteger('duration_minutes')->nullable();
            $table->text('soap_subjective')->nullable();
            $table->text('soap_objective')->nullable();
            $table->text('soap_assessment')->nullable();
            $table->text('soap_plan')->nullable();
            $table->string('weight', 20)->nullable();
            $table->string('temperature', 20)->nullable();
            $table->string('heart_rate', 20)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['appointment_id'], 'uq_consultation_appointment');
            $table->foreign('appointment_id', 'fk_cons_appt')->references('id')->on('appointments');
            $table->foreign('pet_id', 'fk_cons_pet')->references('id')->on('pets');
            $table->foreign('veterinarian_id', 'fk_cons_vet')->references('id')->on('doctor_profiles');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consultations');
    }
};
