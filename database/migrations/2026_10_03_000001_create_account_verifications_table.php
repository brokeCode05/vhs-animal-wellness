<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_verifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('identifier', 254);
            $table->enum('channel', ['email', 'sms']);
            $table->string('context', 40)->default('registration');
            $table->string('code_hash', 255);
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamp('consumed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('user_id', 'fk_account_verifications_user')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['identifier', 'context'], 'ix_av_identifier');
            $table->index(['expires_at'], 'ix_av_expires');
            $table->index(['user_id'], 'ix_av_user');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_verifications');
    }
};
