<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaccinationRecord extends Model
{
    protected $table = 'vaccination_records';

    protected function casts(): array
    {
        return [
            'administered_at' => 'date',
            'next_due_date' => 'date',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function consultation()
    {
        return $this->belongsTo(Consultation::class, 'consultation_id');
    }

    public function pet()
    {
        return $this->belongsTo(Pet::class, 'pet_id');
    }

    public function veterinarian()
    {
        return $this->belongsTo(DoctorProfile::class, 'veterinarian_id');
    }
}
