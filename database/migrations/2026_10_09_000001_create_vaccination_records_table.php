<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vaccination_records', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('consultation_id');
            $table->unsignedBigInteger('pet_id');
            $table->unsignedBigInteger('veterinarian_id');
            $table->string('vaccine_name', 150);
            $table->date('administered_at');
            $table->date('next_due_date')->nullable();
            $table->string('batch_no', 100)->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();

            $table->index(['pet_id', 'administered_at'], 'idx_vax_pet_date');
            $table->index(['veterinarian_id', 'administered_at'], 'idx_vax_vet_date');

            $table->foreign('consultation_id', 'fk_vax_consultation')
                ->references('id')->on('consultations');
            $table->foreign('pet_id', 'fk_vax_pet')
                ->references('id')->on('pets');
            $table->foreign('veterinarian_id', 'fk_vax_vet')
                ->references('id')->on('doctor_profiles');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vaccination_records');
    }
};
