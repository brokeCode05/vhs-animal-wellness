<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Service extends Model
{
    protected $table = 'services';

    use SoftDeletes;

    protected function casts(): array
    {
        return ['scheduling_buffer_minutes'=>'integer', 'duration_history_enabled'=>'boolean', 'price' => 'decimal:2', 'duration_minutes' => 'integer', 'active' => 'boolean', 'created_at' => 'datetime', 'updated_at' => 'datetime', 'deleted_at' => 'datetime'];
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class, 'service_id');
    }
}
