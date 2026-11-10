<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->string('value', 100);
            $table->string('label', 120);
            $table->string('category', 60);
            $table->decimal('price', 10, 2);
            $table->char('currency', 3)->default('PHP');
            $table->boolean('active')->default(true);
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->timestamp('deleted_at')->nullable();
            $table->unique(['value'], 'uq_services_value');
            $table->index(['active'], 'ix_services_active');
            $table->index(['category'], 'ix_services_category');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
