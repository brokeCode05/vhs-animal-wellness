<?php

namespace App\Http\Controllers;

use App\Models\Pet;
use App\Models\VaccinationRecord;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

class VaccinationsController extends Controller
{
    use ApiResponse;

    public function index(Request $request, Pet $pet)
    {
        $user = $request->user();

        // Client may read only their own pet. Admin may read any pet.
        // Doctors receive vaccination history through the appointment-scoped
        // consultation history endpoint instead of browsing arbitrary pets.
        abort_unless(
            $user->role === 'Admin' || ($user->role === 'User' && (int) $pet->owner_id === (int) $user->id),
            403,
            'Access denied.'
        );

        $rows = VaccinationRecord::with([
                'veterinarian.user',
                'consultation.appointment',
            ])
            ->where('pet_id', $pet->id)
            ->whereHas('consultation', fn ($q) => $q->where('status', 'completed'))
            ->orderByDesc('administered_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (VaccinationRecord $record) {
                $vetName = $record->veterinarian?->display_name
                    ?: $record->veterinarian?->user?->name
                    ?: 'Veterinarian';

                return [
                    'vaccinationId' => $record->id,
                    'consultationId' => $record->consultation_id,
                    'appointmentId' => $record->consultation?->appointment_id,
                    'referenceNo' => $record->consultation?->appointment?->reference_no,
                    'petId' => $record->pet_id,
                    'vaccineName' => $record->vaccine_name,
                    'administeredDate' => optional($record->administered_at)->format('Y-m-d'),
                    'nextDueDate' => optional($record->next_due_date)->format('Y-m-d'),
                    'batchNo' => $record->batch_no,
                    'notes' => $record->notes,
                    'veterinarian' => $vetName,
                ];
            })
            ->values();

        return $this->ok('Vaccination records loaded.', [
            'petId' => $pet->id,
            'vaccinations' => $rows,
        ]);
    }
}
