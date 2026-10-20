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
        return ['price' => 'decimal:2', 'active' => 'boolean', 'created_at' => 'datetime', 'updated_at' => 'datetime', 'deleted_at' => 'datetime'];
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class, 'service_id');
    }
}
