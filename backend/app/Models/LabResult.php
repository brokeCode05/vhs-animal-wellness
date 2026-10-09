<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LabResult extends Model
{
    protected $table = 'lab_results';

    public const UPDATED_AT = null;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['result_at' => 'datetime'];
    }

    public function request()
    {
        return $this->belongsTo(LabRequest::class, 'lab_request_id');
    }
}
