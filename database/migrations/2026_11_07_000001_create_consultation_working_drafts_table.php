<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('consultation_working_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('consultation_id')->unique()->constrained('consultations')->restrictOnDelete();
            $table->foreignId('veterinarian_id')->constrained('doctor_profiles');
            $table->longText('payload');
            $table->unsignedInteger('revision')->default(1);
            $table->timestamp('transcript_updated_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void { Schema::dropIfExists('consultation_working_drafts'); }
};
