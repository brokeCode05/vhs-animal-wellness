<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->enum('role', ['User', 'Doctor', 'Admin']);
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->string('first_name', 50);
            $table->string('middle_name', 50)->nullable();
            $table->string('last_name', 50);
            $table->string('name', 120);
            $table->string('email', 254);
            $table->string('phone', 20)->nullable();
            $table->string('address', 255)->nullable();
            $table->date('birthdate')->nullable();
            $table->string('password', 255)->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['email'], 'uq_users_email');
            $table->index(['role'], 'ix_users_role');
            $table->index(['status'], 'ix_users_status');
            $table->index(['birthdate'], 'ix_users_birthdate');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
