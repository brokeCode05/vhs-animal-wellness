<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appointments', function (Blueprint $table) {
            $table->id();
            $table->string('reference_no', 20);
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('pet_id');
            $table->unsignedBigInteger('assigned_vet_id')->nullable();
            $table->unsignedBigInteger('service_id');
            $table->string('service_label_at_booking', 120);
            $table->decimal('price_at_booking', 10, 2);
            $table->date('appointment_date');
            $table->time('appointment_time');
            $table->string('visit_context', 120)->nullable();
            $table->string('custom_visit_context', 255)->nullable();
            $table->string('notes', 255)->nullable();
            $table->enum('status', ['pending', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'canceled', 'no_show', 'rescheduled'])->default('confirmed');
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('consultation_started_at')->nullable();
            $table->timestamp('consultation_completed_at')->nullable();
            $table->json('rescheduled_from')->nullable();
            $table->string('canceled_reason', 120)->nullable();
            $table->enum('created_via', ['user', 'admin'])->default('user');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['reference_no'], 'uq_appointments_reference');
            $table->foreign('user_id', 'fk_appt_user')->references('id')->on('users');
            $table->foreign('pet_id', 'fk_appt_pet')->references('id')->on('pets');
            $table->foreign('assigned_vet_id', 'fk_appt_vet')->references('id')->on('doctor_profiles');
            $table->foreign('service_id', 'fk_appt_service')->references('id')->on('services');
            $table->index(['appointment_date', 'appointment_time'], 'ix_appt_date_time');
            $table->index(['status'], 'ix_appt_status');
            $table->index(['user_id'], 'ix_appt_user');
            $table->index(['pet_id'], 'ix_appt_pet');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appointments');
    }
};
