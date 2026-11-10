<?php

namespace App\Services\AI;

use App\Models\Appointment;
use App\Models\Document;
use App\Models\Pet;
use App\Models\User;
use Illuminate\Support\Carbon;

/** Authenticated read-only queries. Never sends these records to an LLM. */
class UserVettiFacts
{
    /** @return array<int, array{id:int,name:string,species:string,gender:string}> */
    public function pets(User $user): array
    {
        return Pet::query()->where('owner_id', $user->id)->orderBy('name')->limit(12)
            ->get(['id', 'name', 'species', 'gender'])
            ->map(fn (Pet $p): array => [
                'id' => (int) $p->id,
                'name' => (string) $p->name,
                'species' => (string) $p->species,
                'gender' => (string) $p->gender,
            ])->all();
    }

    public function ownsPet(User $user, int $petId): bool
    {
        return Pet::query()->where('owner_id', $user->id)->whereKey($petId)->exists();
    }

    /** Metadata only; never retrieve document contents for conversation. */
    public function documents(User $user, ?int $petId = null): array
    {
        return Document::query()->with('pet:id,name')->where('user_id', $user->id)
            ->when($petId, fn ($q) => $q->where('pet_id', $petId))
            ->orderByDesc('issued_at')->orderByDesc('id')->limit(5)
            ->get(['id','user_id','pet_id','type','status','issued_at'])
            ->map(fn (Document $d): array => ['id'=>(int)$d->id,'pet_name'=>(string)($d->pet?->name ?? ''),
                'type'=>(string)$d->type,'status'=>(string)$d->status,'issued_at'=>$d->issued_at?->format('Y-m-d') ?? ''])->all();
    }

    /** Completed visits only, scoped to the signed-in owner. */
    public function history(User $user, ?int $petId = null): array
    {
        return Appointment::query()->with(['pet:id,name','service:id,label'])->where('user_id',$user->id)
            ->when($petId, fn ($q) => $q->where('pet_id',$petId))->where('status','completed')
            ->orderByDesc('appointment_date')->orderByDesc('appointment_time')->limit(5)->get()
            ->map(fn (Appointment $a): array => ['pet_id'=>(int)$a->pet_id,'pet_name'=>(string)($a->pet?->name ?? ''),
                'date'=>(string)$a->appointment_date?->format('Y-m-d'),'time'=>substr((string)$a->appointment_time,0,5),
                'status'=>(string)$a->status,'service'=>(string)($a->service?->label ?: $a->service_label_at_booking ?: 'Clinic visit')])->all();
    }

    /** @return array<int, array{pet_id:int,pet_name:string,date:string,time:string,status:string,service:string}> */
    public function upcoming(User $user, ?int $petId = null): array
    {
        return Appointment::query()
            ->with(['pet:id,name', 'service:id,label'])
            ->where('user_id', $user->id)
            ->when($petId, fn ($q) => $q->where('pet_id', $petId))
            // Future bookings only. Checked-in/in-consultation patients are
            // part of the clinic's active workflow, not "next appointments".
            ->whereIn('status', ['confirmed', 'pending', 'rescheduled'])
            ->where(function ($query) {
                $query->whereDate('appointment_date', '>', Carbon::today()->toDateString())
                    ->orWhere(function ($sameDay) {
                        $sameDay->whereDate('appointment_date', Carbon::today()->toDateString())
                            ->whereTime('appointment_time', '>', Carbon::now()->format('H:i:s'));
                    });
            })
            ->orderBy('appointment_date')->orderBy('appointment_time')->limit(5)->get()
            ->map(fn (Appointment $a): array => [
                'appointment_id' => (int) $a->id,
                'pet_id' => (int) $a->pet_id,
                'pet_name' => (string) ($a->pet?->name ?? 'Your pet'),
                'date' => (string) $a->appointment_date?->format('Y-m-d'),
                'time' => substr((string) $a->appointment_time, 0, 5),
                'status' => (string) $a->status,
                'service' => (string) ($a->service?->label ?: $a->service_label_at_booking ?: 'Clinic visit'),
            ])->all();
    }
}
