<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['consultation_summary', 'prescription', 'lab_request', 'lab_result', 'receipt']);
            $table->enum('status', ['finalized'])->default('finalized');
            $table->unsignedBigInteger('appointment_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('pet_id');
            $table->string('service_label', 120)->nullable();
            $table->string('veterinarian_name', 120)->nullable();
            $table->timestamp('issued_at')->useCurrent();
            $table->json('payload');
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('appointment_id', 'fk_doc_appt')->references('id')->on('appointments');
            $table->foreign('user_id', 'fk_doc_user')->references('id')->on('users');
            $table->foreign('pet_id', 'fk_doc_pet')->references('id')->on('pets');
            $table->index(['user_id'], 'ix_doc_user');
            $table->index(['pet_id'], 'ix_doc_pet');
            $table->index(['appointment_id'], 'ix_doc_appt');
            $table->index(['type', 'issued_at'], 'ix_doc_type_issued');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
