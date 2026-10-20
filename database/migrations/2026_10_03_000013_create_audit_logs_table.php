<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->enum('actor_type', ['User', 'Doctor', 'Admin']);
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->string('actor_name', 120);
            $table->string('action', 60);
            $table->enum('entity_type', ['appointment', 'doctor', 'user', 'pet', 'service', 'clinic_settings', 'document']);
            $table->unsignedBigInteger('entity_id');
            $table->string('reference_no', 20)->nullable();
            $table->string('description', 255);
            $table->json('metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('actor_id', 'fk_audit_actor')->references('id')->on('users');
            $table->index(['entity_type', 'entity_id'], 'ix_audit_entity');
            $table->index(['actor_type', 'actor_id'], 'ix_audit_actor');
            $table->index(['action'], 'ix_audit_action');
            $table->index(['created_at'], 'ix_audit_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
