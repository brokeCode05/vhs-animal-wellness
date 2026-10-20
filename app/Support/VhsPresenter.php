<?php

namespace App\Support;

use App\Models\Appointment;
use App\Models\ClinicSetting;
use App\Models\DoctorProfile;
use App\Models\Pet;
use App\Models\Service;
use App\Models\User;
use Illuminate\Support\Carbon;

class VhsPresenter
{
    public static function user(User $u): array
    {
        return [
            'userId' => $u->id,
            'id' => $u->id,
            'firstName' => $u->first_name,
            'middleName' => $u->middle_name ?? '',
            'lastName' => $u->last_name,
            'name' => $u->name,
            'fullName' => $u->name,
            'email' => $u->email,
            'phone' => $u->phone ?? '',
            'address' => $u->address ?? '',
            'birthdate' => optional($u->birthdate)->format('Y-m-d') ?? '',
            'bday' => optional($u->birthdate)->format('Y-m-d') ?? '',
            'role' => $u->role,
            'employeeId' => $u->employee_id ?? '',
            'employee_id' => $u->employee_id ?? '',
            'status' => $u->status,
            'createdAt' => optional($u->created_at)->toIso8601String(),
            'created_at' => optional($u->created_at)->toDateTimeString(),
        ];
    }

    public static function pet(Pet $p): array
    {
        $birthdate = $p->birthdate?->format('Y-m-d');
        $age = $birthdate ? Carbon::parse($birthdate)->age : $p->age;
        return [
            'petId' => $p->id,
            'id' => $p->id,
            'ownerId' => $p->owner_id,
            'name' => $p->name,
            'species' => $p->species,
            'type' => $p->species,
            'speciesCustom' => $p->species_custom ?? '',
            'breed' => $p->breed_custom ?: ($p->breed ?? ''),
            'breedCustom' => $p->breed_custom ?? '',
            'gender' => $p->gender,
            'birthdate' => $birthdate ?? '',
            'age' => $age ?? '',
            'weightKg' => $p->weight_kg !== null ? (float) $p->weight_kg : null,
            'weight' => $p->weight_kg !== null ? (float) $p->weight_kg : '',
            'color' => $p->color ?? '',
            'reproductiveStatus' => $p->reproductive_status ?? '',
            'microchipId' => $p->microchip_id ?? '',
            'microchip' => $p->microchip_id ?? '',
            'allergies' => $p->allergies ?? '',
            'chronicConditions' => $p->chronic_conditions ?? '',
            'notes' => $p->notes ?? '',
            'medical_notes' => $p->notes ?? '',
            'photo' => $p->photo_path ?? '',
            'ownerName' => $p->relationLoaded('owner') && $p->owner ? $p->owner->name : '',
            'createdAt' => optional($p->created_at)->toIso8601String(),
        ];
    }

    public static function doctor(DoctorProfile $d): array
    {
        $u = $d->relationLoaded('user') ? $d->user : $d->user()->first();
        return [
            'doctorId' => $d->id,
            'id' => $d->id,
            'userId' => $d->user_id,
            'firstName' => $u?->first_name ?? '',
            'middleName' => $u?->middle_name ?? '',
            'lastName' => $u?->last_name ?? '',
            'name' => $d->display_name ?: ($u?->name ?? ''),
            'displayName' => $d->display_name ?: ($u?->name ?? ''),
            'email' => $u?->email ?? '',
            'employeeId' => $u?->employee_id ?? '',
            'employee_id' => $u?->employee_id ?? '',
            'phone' => $d->phone ?: ($u?->phone ?? ''),
            'specialization' => $d->specialization ?? '',
            'role' => 'Doctor',
            'accountStatus' => $d->account_status,
            'availabilityStatus' => $d->availability_status,
            'createdAt' => optional($d->created_at)->toIso8601String(),
        ];
    }

    public static function service(Service $s): array
    {
        return [
            'serviceId' => $s->id,
            'id' => $s->id,
            'value' => $s->value,
            'label' => $s->label,
            'group' => $s->category,
            'category' => $s->category,
            'price' => (float) $s->price,
            'currency' => $s->currency,
            'active' => (bool) $s->active,
        ];
    }

    public static function appointment(Appointment $a): array
    {
        $user = $a->relationLoaded('user') ? $a->user : null;
        $pet = $a->relationLoaded('pet') ? $a->pet : null;
        $vet = $a->relationLoaded('veterinarian') ? $a->veterinarian : null;
        $vetUser = $vet && $vet->relationLoaded('user') ? $vet->user : null;
        $service = $a->relationLoaded('service') ? $a->service : null;
        $time = substr((string) $a->appointment_time, 0, 5);

        // Keep the canonical nested snapshots as well as the legacy flat fields.
        // The Doctor portal needs the Pet age/birthdate and the appointment
        // reason without having to depend on browser-only mock/EMR data.
        $ownerData = $user ? self::user($user) : null;
        $petData = $pet ? self::pet($pet) : null;

        return [
            'appointmentId' => $a->id,
            'appointment_id' => $a->id,
            'id' => $a->id,
            'referenceNo' => $a->reference_no,
            'reference_no' => $a->reference_no,
            'userId' => $a->user_id,
            'user_id' => $a->user_id,
            'petId' => $a->pet_id,
            'pet_id' => $a->pet_id,
            'assignedVetId' => $a->assigned_vet_id,
            'staff_id' => $a->assigned_vet_id,
            'serviceId' => $a->service_id,
            'service' => $service?->value ?? $a->service_label_at_booking,
            'serviceLabelAtBooking' => $a->service_label_at_booking,
            'service_label_at_booking' => $a->service_label_at_booking,
            'priceAtBooking' => (float) $a->price_at_booking,
            'price_at_booking' => (float) $a->price_at_booking,
            'appointmentDate' => $a->appointment_date?->format('Y-m-d'),
            'appointment_date' => $a->appointment_date?->format('Y-m-d'),
            'date' => $a->appointment_date?->format('Y-m-d'),
            'appointmentTime' => $time,
            'appointment_time' => $time,
            'time' => $time,
            'visitContext' => $a->visit_context,
            'visit_context' => $a->visit_context,
            // Compatibility aliases used by older/current frontend adapters.
            'visitReason' => $a->visit_context,
            'visit_reason' => $a->visit_context,
            'customVisitContext' => $a->custom_visit_context,
            'custom_visit_context' => $a->custom_visit_context,
            'visitReasonCustom' => $a->custom_visit_context,
            'visit_reason_custom' => $a->custom_visit_context,
            'notes' => $a->notes ?? '',
            'status' => $a->status,
            'checkedInAt' => optional($a->checked_in_at)->toIso8601String(),
            'checked_in_at' => optional($a->checked_in_at)->toIso8601String(),
            'consultationStartedAt' => optional($a->consultation_started_at)->toIso8601String(),
            'consultation_started_at' => optional($a->consultation_started_at)->toIso8601String(),
            'consultationCompletedAt' => optional($a->consultation_completed_at)->toIso8601String(),
            'consultation_completed_at' => optional($a->consultation_completed_at)->toIso8601String(),
            'rescheduledFrom' => $a->rescheduled_from,

            // Canonical snapshots for AppointmentContract/fromLegacy.
            'owner' => $ownerData,
            'pet' => $petData,

            // Legacy flat aliases retained for existing pages/adapters.
            'owner_name' => $user?->name ?? '',
            'owner_phone' => $user?->phone ?? '',
            'pet_name' => $petData['name'] ?? '',
            'pet_type' => $petData['species'] ?? '',
            'pet_breed' => $petData['breed'] ?? '',
            'pet_age' => $petData['age'] ?? '',
            'petAge' => $petData['age'] ?? '',
            'pet_birthdate' => $petData['birthdate'] ?? '',
            'vet_name' => $vet?->display_name ?: ($vetUser?->name ?? 'Unassigned'),
            'created_at' => optional($a->created_at)->toDateTimeString(),
        ];
    }

    public static function settings(ClinicSetting $s): array
    {
        return [
            'hours' => [
                'weekday' => ['firstAppointment' => substr((string) $s->weekday_first, 0, 5), 'lastAppointment' => substr((string) $s->weekday_last, 0, 5)],
                'weekend' => ['firstAppointment' => substr((string) $s->weekend_first, 0, 5), 'lastAppointment' => substr((string) $s->weekend_last, 0, 5)],
            ],
            'slotIntervalMinutes' => (int) $s->slot_interval_minutes,
            'cancellationCutoffMinutes' => (int) $s->cancel_cutoff_minutes,
            'rescheduleCutoffMinutes' => (int) $s->reschedule_cutoff_minutes,
            'noShowGraceMinutes' => (int) $s->noshow_grace_minutes,
            'clinicInfo' => [
                'name' => $s->clinic_name,
                'phone' => $s->clinic_phone ?? '',
                'email' => $s->clinic_email ?? '',
                'website' => $s->clinic_website ?? '',
                'address' => $s->clinic_address ?? '',
            ],
        ];
    }
}