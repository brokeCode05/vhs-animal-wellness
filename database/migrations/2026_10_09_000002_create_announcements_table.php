<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->string('title', 120);
            $table->text('message');
            $table->string('badge_type', 20)->default('info');
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['active', 'updated_at'], 'idx_announcements_active_updated');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('announcements');
    }
};
