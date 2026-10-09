<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LabRequest extends Model
{
    protected $table = 'lab_requests';

    protected function casts(): array
    {
        return ['requested_at' => 'datetime', 'result_at' => 'datetime', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
    }

    public function consultation()
    {
        return $this->belongsTo(Consultation::class, 'consultation_id');
    }

    public function result()
    {
        return $this->hasOne(LabResult::class, 'lab_request_id');
    }
}
