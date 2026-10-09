<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;

class Pet extends Model
{
    protected $table = 'pets';

    use SoftDeletes;

    protected $hidden = [
        'birthdate_encrypted',
        'microchip_id_encrypted',
        'allergies_encrypted',
        'chronic_conditions_encrypted',
        'notes_encrypted',
    ];

    protected function casts(): array
    {
        return [
            'weight_kg' => 'decimal:2',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }


    public function getBirthdateAttribute($value): ?Carbon
    {
        $plain = $this->decryptShadow(
            $this->attributes['birthdate_encrypted'] ?? null,
            $value
        );

        return $plain ? Carbon::parse($plain)->startOfDay() : null;
    }

    public function setBirthdateAttribute($value): void
    {
        if ($value === null || $value === '') {
            $this->attributes['birthdate'] = null;
            $this->attributes['birthdate_encrypted'] = null;

            return;
        }

        $plain = $value instanceof \DateTimeInterface
            ? $value->format('Y-m-d')
            : Carbon::parse((string) $value)->format('Y-m-d');

        $this->attributes['birthdate'] = null;
        $this->attributes['birthdate_encrypted'] = Crypt::encryptString($plain);
    }

    public function getMicrochipIdAttribute($value): ?string
    {
        return $this->decryptShadow(
            $this->attributes['microchip_id_encrypted'] ?? null,
            $value
        );
    }

    public function setMicrochipIdAttribute($value): void
    {
        $this->attributes['microchip_id'] = null;
        $this->attributes['microchip_id_encrypted'] = $this->encryptShadow($value);
    }

    public function getAllergiesAttribute($value): ?string
    {
        return $this->decryptShadow(
            $this->attributes['allergies_encrypted'] ?? null,
            $value
        );
    }

    public function setAllergiesAttribute($value): void
    {
        $this->attributes['allergies'] = null;
        $this->attributes['allergies_encrypted'] = $this->encryptShadow($value);
    }

    public function getChronicConditionsAttribute($value): ?string
    {
        return $this->decryptShadow(
            $this->attributes['chronic_conditions_encrypted'] ?? null,
            $value
        );
    }

    public function setChronicConditionsAttribute($value): void
    {
        $this->attributes['chronic_conditions'] = null;
        $this->attributes['chronic_conditions_encrypted'] = $this->encryptShadow($value);
    }

    public function getNotesAttribute($value): ?string
    {
        return $this->decryptShadow(
            $this->attributes['notes_encrypted'] ?? null,
            $value
        );
    }

    public function setNotesAttribute($value): void
    {
        $this->attributes['notes'] = null;
        $this->attributes['notes_encrypted'] = $this->encryptShadow($value);
    }

    private function encryptShadow(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $plain = trim((string) $value);

        return $plain === '' ? null : Crypt::encryptString($plain);
    }

    private function decryptShadow(?string $encrypted, mixed $legacy = null): ?string
    {
        if ($encrypted !== null && $encrypted !== '') {
            return Crypt::decryptString($encrypted);
        }

        if ($legacy === null) {
            return null;
        }

        $plain = trim((string) $legacy);

        return $plain === '' ? null : $plain;
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class, 'pet_id');
    }

    public function documents()
    {
        return $this->hasMany(Document::class, 'pet_id');
    }

    public function vaccinations()
    {
        return $this->hasMany(VaccinationRecord::class, 'pet_id');
    }
}
