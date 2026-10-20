<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('doctor_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('display_name', 120)->nullable();
            $table->string('specialization', 100)->nullable();
            $table->string('phone', 20)->nullable();
            $table->enum('account_status', ['active', 'inactive'])->default('active');
            $table->enum('availability_status', ['on_duty', 'on_break', 'on_leave'])->default('on_duty');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->unique(['user_id'], 'uq_doctor_user');
            $table->foreign('user_id', 'fk_doctors_user')->references('id')->on('users');
            $table->index(['account_status'], 'ix_doctors_account');
            $table->index(['availability_status'], 'ix_doctors_availability');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('doctor_profiles');
    }
};
