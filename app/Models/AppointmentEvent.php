<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppointmentEvent extends Model
{
    protected $table = 'appointment_events';

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['old_date' => 'date', 'new_date' => 'date', 'metadata' => 'array', 'created_at' => 'datetime'];
    }

    public function appointment()
    {
        return $this->belongsTo(Appointment::class, 'appointment_id');
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
