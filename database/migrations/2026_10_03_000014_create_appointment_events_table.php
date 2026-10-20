<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('appointment_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('appointment_id');
            $table->string('event_type', 40);
            $table->date('old_date')->nullable();
            $table->time('old_time')->nullable();
            $table->date('new_date')->nullable();
            $table->time('new_time')->nullable();
            $table->enum('actor_type', ['User', 'Doctor', 'Admin']);
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('appointment_id', 'fk_ape_appt')->references('id')->on('appointments');
            $table->index(['appointment_id'], 'ix_ape_appt');
            $table->index(['event_type'], 'ix_ape_type');
            $table->index(['created_at'], 'ix_ape_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('appointment_events');
    }
};
