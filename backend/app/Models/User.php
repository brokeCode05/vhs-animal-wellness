<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;

class User extends Authenticatable
{
    use Notifiable;

    protected $hidden = [
        'password',
        'remember_token',
        'auth_version',
        'phone_encrypted',
        'address_encrypted',
        'birthdate_encrypted',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }


    public function getPhoneAttribute($value): ?string
    {
        return $this->decryptShadow(
            $this->attributes['phone_encrypted'] ?? null,
            $value
        );
    }

    public function setPhoneAttribute($value): void
    {
        $this->attributes['phone'] = null;
        $this->attributes['phone_encrypted'] = $this->encryptShadow($value);
    }

    public function getAddressAttribute($value): ?string
    {
        return $this->decryptShadow(
            $this->attributes['address_encrypted'] ?? null,
            $value
        );
    }

    public function setAddressAttribute($value): void
    {
        $this->attributes['address'] = null;
        $this->attributes['address_encrypted'] = $this->encryptShadow($value);
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

    protected static function booted(): void
    {
        static::created(function (User $user) {
            if (
                in_array($user->role, ['Admin', 'Doctor'], true)
                && ! $user->employee_id
            ) {
                $user->forceFill([
                    'employee_id' => self::staffEmployeeId($user->role, (int) $user->id),
                ])->saveQuietly();
            }
        });
    }

    public static function staffEmployeeId(string $role, int $id): ?string
    {
        $prefix = match ($role) {
            'Admin' => 'ADM',
            'Doctor' => 'DOC',
            default => null,
        };

        return $prefix ? sprintf('VHS-%s-%04d', $prefix, $id) : null;
    }

    public function pets()
    {
        return $this->hasMany(Pet::class, 'owner_id');
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class);
    }

    public function doctorProfile()
    {
        return $this->hasOne(DoctorProfile::class);
    }

    public function documents()
    {
        return $this->hasMany(Document::class);
    }

    public function consents()
    {
        return $this->hasMany(UserConsent::class);
    }

    public function verifications()
    {
        return $this->hasMany(AccountVerification::class);
    }

    public function isVerified(): bool
    {
        return (bool) ($this->email_verified_at || $this->phone_verified_at);
    }

    public function mayLogin(): bool
    {
        return $this->status === 'active' && ($this->role !== 'Doctor' || $this->doctorProfile?->account_status === 'active');
    }

    public function identity(): array
    {
        $birthdate = optional($this->birthdate)->format('Y-m-d') ?? '';

        return [
            'user_id' => $this->id,
            'userId' => $this->id,
            'id' => $this->id,
            'first_name' => $this->first_name,
            'firstName' => $this->first_name,
            'middle_name' => $this->middle_name ?? '',
            'middleName' => $this->middle_name ?? '',
            'last_name' => $this->last_name,
            'lastName' => $this->last_name,
            'name' => $this->name,
            'fullName' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone ?? '',
            'address' => $this->address ?? '',
            'birthdate' => $birthdate,
            'bday' => $birthdate,
            'role' => $this->role,
            'employee_id' => $this->employee_id ?? '',
            'employeeId' => $this->employee_id ?? '',
            'status' => $this->status,
        ];
    }
}
