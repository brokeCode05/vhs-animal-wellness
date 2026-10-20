<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_logs', function (Blueprint $table) {
            $table->id();
            $table->enum('actor_type', ['User', 'Doctor', 'Admin']);
            $table->unsignedBigInteger('actor_id');
            $table->string('actor_name', 120);
            $table->string('method', 10);
            $table->string('path', 255);
            $table->string('route_action', 255)->nullable();
            $table->unsignedSmallInteger('status_code');
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('actor_id', 'fk_access_log_actor')
                ->references('id')
                ->on('users');

            $table->index(['actor_type', 'actor_id'], 'ix_access_actor');
            $table->index(['method'], 'ix_access_method');
            $table->index(['status_code'], 'ix_access_status');
            $table->index(['created_at'], 'ix_access_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('access_logs');
    }
};
