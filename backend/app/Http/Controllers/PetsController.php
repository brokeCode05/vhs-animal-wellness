<?php

namespace App\Http\Controllers;

use App\Models\Consultation;
use App\Models\Document;
use App\Models\Pet;
use App\Models\User;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PetsController extends Controller
{
    use ApiResponse;

    private function authorizePet(Request $r, Pet $pet): void
    {
        abort_unless($r->user()->role === 'Admin' || $pet->owner_id === $r->user()->id, 403, 'Access denied.');
    }

    private function normalizeSpecies(array $v): array
    {
        $raw = trim((string) ($v['species'] ?? ''));
        $allowed = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];
        if (in_array($raw, $allowed, true)) {
            return [$raw, trim((string) ($v['species_custom'] ?? $v['speciesCustom'] ?? '')) ?: null];
        }
        return ['Other', $raw ?: null];
    }

    private function rules(bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';
        return [
            'owner_id' => ['sometimes', 'integer', 'exists:users,id'],
            'user_id' => ['sometimes', 'integer', 'exists:users,id'],
            'name' => [$partial ? 'sometimes' : 'required_without:pet_name', 'nullable', 'string', 'max:50'],
            'pet_name' => [$partial ? 'sometimes' : 'required_without:name', 'nullable', 'string', 'max:50'],
            'species' => [$req, 'string', 'max:50'],
            'species_custom' => ['nullable', 'string', 'max:50'],
            'speciesCustom' => ['nullable', 'string', 'max:50'],
            'breed' => ['nullable', 'string', 'max:60'],
            'breed_custom' => ['nullable', 'string', 'max:60'],
            'breedCustom' => ['nullable', 'string', 'max:60'],
            'gender' => [$partial ? 'sometimes' : 'required', Rule::in(['Male', 'Female'])],
            'birthdate' => ['nullable', 'date', 'before_or_equal:today'],
            'age' => ['nullable', 'integer', 'min:0', 'max:'.config('vhs.pet_age_max')],
            'weight_kg' => ['nullable', 'numeric', 'min:0', 'max:'.config('vhs.pet_weight_max')],
            'weightKg' => ['nullable', 'numeric', 'min:0', 'max:'.config('vhs.pet_weight_max')],
            'color' => ['nullable', 'string', 'max:50'],
            'reproductive_status' => ['nullable', Rule::in(['Intact', 'Spayed', 'Neutered', 'Not Sure'])],
            'reproductiveStatus' => ['nullable', Rule::in(['Intact', 'Spayed', 'Neutered', 'Not Sure'])],
            'microchip_id' => ['nullable', 'string', 'max:30'],
            'microchipId' => ['nullable', 'string', 'max:30'],
            'allergies' => ['nullable', 'string', 'max:200'],
            'chronic_conditions' => ['nullable', 'string', 'max:200'],
            'chronicConditions' => ['nullable', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:500'],
            'medical_notes' => ['nullable', 'string', 'max:500'],
            'pet_photo' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ];
    }

    public function me(Request $r)
    {
        abort_unless($r->user()->role === 'User', 403, 'User account required.');
        $pets = Pet::with('owner')->where('owner_id', $r->user()->id)->orderByDesc('created_at')->get();
        return $this->ok('Pets loaded.', ['pets' => $pets->map(fn ($p) => VhsPresenter::pet($p))->values()]);
    }

    public function forUser(Request $r, User $user)
    {
        abort_unless($r->user()->role === 'Admin' || $r->user()->id === $user->id, 403, 'Access denied.');
        $pets = Pet::with('owner')->where('owner_id', $user->id)->orderByDesc('created_at')->get();
        return $this->ok('Pets loaded.', ['pets' => $pets->map(fn ($p) => VhsPresenter::pet($p))->values()]);
    }

    public function show(Request $r, Pet $pet)
    {
        $this->authorizePet($r, $pet);
        $pet->load('owner');
        return $this->ok('Pet loaded.', ['pet' => VhsPresenter::pet($pet)]);
    }

    public function store(Request $r)
    {
        $v = $r->validate($this->rules());
        $ownerId = $r->user()->role === 'Admin'
            ? (int) ($v['owner_id'] ?? $v['user_id'] ?? 0)
            : $r->user()->id;
        abort_if($ownerId <= 0, 422, 'Owner is required.');
        $owner = User::whereKey($ownerId)->where('role', 'User')->firstOrFail();
        [$species, $speciesCustom] = $this->normalizeSpecies($v);

        $pet = DB::transaction(function () use ($r, $v, $owner, $species, $speciesCustom) {
            $p = new Pet;
            $p->forceFill([
                'owner_id' => $owner->id,
                'name' => trim($v['name'] ?? $v['pet_name']),
                'species' => $species,
                'species_custom' => $species === 'Other' ? $speciesCustom : null,
                'breed' => trim((string) ($v['breed'] ?? '')) ?: null,
                'breed_custom' => trim((string) ($v['breed_custom'] ?? $v['breedCustom'] ?? '')) ?: null,
                'gender' => $v['gender'],
                'birthdate' => $v['birthdate'] ?? null,
                'age' => empty($v['birthdate']) ? ($v['age'] ?? null) : null,
                'weight_kg' => $v['weight_kg'] ?? $v['weightKg'] ?? null,
                'color' => trim((string) ($v['color'] ?? '')) ?: null,
                'reproductive_status' => $v['reproductive_status'] ?? $v['reproductiveStatus'] ?? null,
                'microchip_id' => trim((string) ($v['microchip_id'] ?? $v['microchipId'] ?? '')) ?: null,
                'allergies' => trim((string) ($v['allergies'] ?? '')) ?: null,
                'chronic_conditions' => trim((string) ($v['chronic_conditions'] ?? $v['chronicConditions'] ?? '')) ?: null,
                'notes' => trim((string) ($v['notes'] ?? $v['medical_notes'] ?? '')) ?: null,
            ]);
            $p->save();
            AuditWriter::write($r->user(), 'pet_registered', 'pet', $p->id, $r->user()->name.' registered pet '.$p->name.'.');
            return $p;
        });

        if ($r->hasFile('pet_photo')) {
            $file = $r->file('pet_photo');
            $name = 'pet_'.$pet->id.'_'.time().'.'.$file->getClientOriginalExtension();
            $file->move(public_path('user/pet_photos'), $name);
            $pet->photo_path = 'pet_photos/'.$name;
            $pet->save();
        }

        $pet->load('owner');
        return $this->ok('Pet registered.', ['pet' => VhsPresenter::pet($pet)], 201);
    }

    public function update(Request $r, Pet $pet)
    {
        $this->authorizePet($r, $pet);
        $v = $r->validate($this->rules(true));
        [$species, $speciesCustom] = array_key_exists('species', $v) ? $this->normalizeSpecies($v) : [$pet->species, $pet->species_custom];

        DB::transaction(function () use ($r, $pet, $v, $species, $speciesCustom) {
            $map = [
                'name' => 'name', 'pet_name' => 'name', 'breed' => 'breed',
                'breed_custom' => 'breed_custom', 'breedCustom' => 'breed_custom',
                'gender' => 'gender', 'birthdate' => 'birthdate', 'age' => 'age',
                'weight_kg' => 'weight_kg', 'weightKg' => 'weight_kg', 'color' => 'color',
                'reproductive_status' => 'reproductive_status', 'reproductiveStatus' => 'reproductive_status',
                'microchip_id' => 'microchip_id', 'microchipId' => 'microchip_id',
                'allergies' => 'allergies', 'chronic_conditions' => 'chronic_conditions', 'chronicConditions' => 'chronic_conditions',
                'notes' => 'notes', 'medical_notes' => 'notes',
            ];
            foreach ($map as $in => $col) {
                if (array_key_exists($in, $v)) {
                    $pet->$col = is_string($v[$in]) ? (trim($v[$in]) ?: null) : $v[$in];
                }
            }
            if (array_key_exists('species', $v)) {
                $pet->species = $species;
                $pet->species_custom = $species === 'Other' ? $speciesCustom : null;
            }
            if (! empty($pet->birthdate)) {
                $pet->age = null;
            }
            $pet->save();
            AuditWriter::write($r->user(), 'pet_updated', 'pet', $pet->id, $r->user()->name.' updated pet '.$pet->name.'.');
        });

        if ($r->hasFile('pet_photo')) {
            $file = $r->file('pet_photo');
            $name = 'pet_'.$pet->id.'_'.time().'.'.$file->getClientOriginalExtension();
            $file->move(public_path('user/pet_photos'), $name);
            $pet->photo_path = 'pet_photos/'.$name;
            $pet->save();
        }
        $pet->load('owner');
        return $this->ok('Pet updated.', ['pet' => VhsPresenter::pet($pet)]);
    }

    public function medicalRecords(Request $r, Pet $pet)
    {
        // Client may read only their own pet; Admin may read any client pet.
        // Doctors use the appointment-scoped consultation-history endpoint so
        // they cannot browse arbitrary pets by ID.
        $this->authorizePet($r, $pet);

        $consultations = Consultation::with([
                'appointment.service',
                'veterinarian.user',
            ])
            ->where('pet_id', $pet->id)
            ->where('status', 'completed')
            ->orderByDesc('completed_at')
            ->orderByDesc('id')
            ->get();

        $documents = Document::query()
            ->whereIn(
                'appointment_id',
                $consultations->pluck('appointment_id')->filter()->values()
            )
            ->where('type', 'consultation_summary')
            ->where('status', 'finalized')
            ->orderByDesc('id')
            ->get()
            ->unique('appointment_id')
            ->keyBy('appointment_id');

        $records = $consultations
            ->map(function (Consultation $consultation) use ($documents) {
                $appointment = $consultation->appointment;
                $document = $documents->get($consultation->appointment_id);

                $vetName = $consultation->veterinarian?->display_name
                    ?: $consultation->veterinarian?->user?->name
                    ?: 'Veterinarian';

                return [
                    'recordId' => $consultation->id,
                    'consultationId' => $consultation->id,
                    'appointmentId' => $consultation->appointment_id,
                    'referenceNo' => $appointment?->reference_no,
                    'date' => $appointment?->appointment_date?->format('Y-m-d'),
                    'time' => $appointment
                        ? substr((string) $appointment->appointment_time, 0, 5)
                        : null,
                    'service' => $appointment?->service_label_at_booking
                        ?: $appointment?->service?->label
                        ?: $appointment?->service?->value
                        ?: 'Consultation',
                    'veterinarian' => $vetName,
                    'status' => 'Completed',
                    'docId' => $document?->id,
                    // Client-facing summary only. Subjective/objective raw SOAP
                    // remains Doctor-only.
                    'assessment' => $consultation->soap_assessment,
                    'plan' => $consultation->soap_plan,
                    'notes' => $consultation->soap_plan,
                    'completedAt' => optional($consultation->completed_at)->toIso8601String(),
                ];
            })
            ->values();

        return $this->ok('Medical records loaded.', [
            'petId' => $pet->id,
            'records' => $records,
        ]);
    }

    public function destroy(Request $r, Pet $pet)
    {
        $this->authorizePet($r, $pet);
        abort_if($pet->appointments()->whereNotIn('status', ['canceled', 'completed', 'no_show'])->exists(), 422, 'Pet has active appointments and cannot be deleted.');
        $name = $pet->name;
        $id = $pet->id;
        $pet->delete();
        AuditWriter::write($r->user(), 'pet_deleted', 'pet', $id, $r->user()->name.' deleted pet '.$name.'.');
        return $this->ok('Pet deleted.');
    }
}
