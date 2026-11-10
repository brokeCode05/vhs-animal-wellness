<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('owner_id');
            $table->string('name', 80);
            $table->enum('species', ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other']);
            $table->string('species_custom', 50)->nullable();
            $table->string('breed', 80)->nullable();
            $table->string('breed_custom', 80)->nullable();
            $table->enum('gender', ['Male', 'Female']);
            $table->date('birthdate')->nullable();
            $table->unsignedTinyInteger('age')->nullable();
            $table->decimal('weight_kg', 5, 2)->nullable();
            $table->string('color', 120)->nullable();
            $table->enum('reproductive_status', ['Intact', 'Spayed', 'Neutered', 'Not Sure'])->nullable();
            $table->string('microchip_id', 60)->nullable();
            $table->text('allergies')->nullable();
            $table->text('chronic_conditions')->nullable();
            $table->text('notes')->nullable();
            $table->string('photo_path', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrent();
            $table->timestamp('deleted_at')->nullable();
            $table->foreign('owner_id', 'fk_pets_owner')->references('id')->on('users');
            $table->index(['owner_id'], 'ix_pets_owner');
            $table->index(['name'], 'ix_pets_name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pets');
    }
};
