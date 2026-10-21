<?php

namespace App\Services\AI;

use App\Models\Appointment;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Support\Carbon;

/** Authenticated read-only queries. Never sends these records to an LLM. */
class UserVettiFacts
{
    /** @return array<int, array{id:int,name:string,species:string}> */
    public function pets(User $user): array
    {
        return Pet::query()->where('owner_id', $user->id)->orderBy('name')->limit(12)
            ->get(['id', 'name', 'species'])
            ->map(fn (Pet $p): array => [
                'id' => (int) $p->id,
                'name' => (string) $p->name,
                'species' => (string) $p->species,
            ])->all();
    }

    public function ownsPet(User $user, int $petId): bool
    {
        return Pet::query()->where('owner_id', $user->id)->whereKey($petId)->exists();
    }

    /** @return array<int, array{pet_id:int,pet_name:string,date:string,time:string,status:string,service:string}> */
    public function upcoming(User $user, ?int $petId = null): array
    {
        return Appointment::query()
            ->with(['pet:id,name', 'service:id,label'])
            ->where('user_id', $user->id)
            ->when($petId, fn ($q) => $q->where('pet_id', $petId))
            ->whereDate('appointment_date', '>=', Carbon::today()->toDateString())
            ->whereNotIn('status', ['canceled', 'no_show', 'completed'])
            ->orderBy('appointment_date')->orderBy('appointment_time')->limit(5)->get()
            ->map(fn (Appointment $a): array => [
                'pet_id' => (int) $a->pet_id,
                'pet_name' => (string) ($a->pet?->name ?? 'Your pet'),
                'date' => (string) $a->appointment_date?->format('Y-m-d'),
                'time' => substr((string) $a->appointment_time, 0, 5),
                'status' => (string) $a->status,
                'service' => (string) ($a->service?->label ?: $a->service_label_at_booking ?: 'Clinic visit'),
            ])->all();
    }
}
