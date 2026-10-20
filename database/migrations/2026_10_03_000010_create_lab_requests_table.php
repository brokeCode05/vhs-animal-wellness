<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lab_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('consultation_id');
            $table->string('test', 120);
            $table->text('notes')->nullable();
            $table->enum('status', ['requested', 'processing', 'completed'])->default('requested');
            $table->timestamp('requested_at')->useCurrent();
            $table->text('result_summary')->nullable();
            $table->timestamp('result_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->foreign('consultation_id', 'fk_lab_consult')->references('id')->on('consultations');
            $table->index(['consultation_id'], 'ix_lab_consult');
            $table->index(['status'], 'ix_lab_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lab_requests');
    }
};
