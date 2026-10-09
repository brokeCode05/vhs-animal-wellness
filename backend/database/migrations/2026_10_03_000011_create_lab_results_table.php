<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lab_results', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('lab_request_id');
            $table->text('result_summary')->nullable();
            $table->string('attachment_path', 255)->nullable();
            $table->timestamp('result_at')->useCurrent();
            $table->unique(['lab_request_id'], 'uq_lab_result_request');
            $table->foreign('lab_request_id', 'fk_labres_request')->references('id')->on('lab_requests');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lab_results');
    }
};
