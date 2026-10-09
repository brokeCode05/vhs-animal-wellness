<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Consultation extends Model
{
    protected $table = 'consultations';

    protected $hidden = ['soap_subjective', 'soap_objective', 'soap_assessment', 'soap_plan'];

    protected function casts(): array
    {
        return ['started_at' => 'datetime', 'completed_at' => 'datetime', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
    }

    public function appointment()
    {
        return $this->belongsTo(Appointment::class, 'appointment_id');
    }

    public function pet()
    {
        return $this->belongsTo(Pet::class, 'pet_id');
    }

    public function veterinarian()
    {
        return $this->belongsTo(DoctorProfile::class, 'veterinarian_id');
    }

    public function prescriptions()
    {
        return $this->hasMany(Prescription::class, 'consultation_id');
    }

    public function labRequests()
    {
        return $this->hasMany(LabRequest::class, 'consultation_id');
    }

    public function vaccinationRecords()
    {
        return $this->hasMany(VaccinationRecord::class, 'consultation_id');
    }
}
