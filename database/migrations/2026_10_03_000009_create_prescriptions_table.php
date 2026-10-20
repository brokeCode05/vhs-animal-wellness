<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prescriptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('consultation_id');
            $table->string('medicine', 120);
            $table->string('dosage', 60)->nullable();
            $table->string('frequency', 60)->nullable();
            $table->string('duration', 60)->nullable();
            $table->text('instructions')->nullable();
            $table->timestamp('dispensed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->foreign('consultation_id', 'fk_rx_consult')->references('id')->on('consultations');
            $table->index(['consultation_id'], 'ix_rx_consult');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prescriptions');
    }
};
