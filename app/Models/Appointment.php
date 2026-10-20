<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Appointment extends Model
{
    protected $table = 'appointments';

    protected function casts(): array
    {
        return ['price_at_booking' => 'decimal:2', 'appointment_date' => 'date', 'checked_in_at' => 'datetime', 'consultation_started_at' => 'datetime', 'consultation_completed_at' => 'datetime', 'rescheduled_from' => 'array', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function pet()
    {
        return $this->belongsTo(Pet::class, 'pet_id');
    }

    public function veterinarian()
    {
        return $this->belongsTo(DoctorProfile::class, 'assigned_vet_id');
    }

    public function service()
    {
        return $this->belongsTo(Service::class, 'service_id');
    }

    public function events()
    {
        return $this->hasMany(AppointmentEvent::class, 'appointment_id');
    }

    public function consultation()
    {
        return $this->hasOne(Consultation::class, 'appointment_id');
    }

    public function documents()
    {
        return $this->hasMany(Document::class, 'appointment_id');
    }
}
