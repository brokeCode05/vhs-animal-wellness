<?php
namespace App\Services;

use App\Models\{Appointment, Consultation, Service};
use App\Support\AppointmentWorkflow;
use Illuminate\Support\Facades\Schema;

/** Explainable operational estimates; never infers clinical facts or uses unapproved visits. */
final class ServiceDurationEstimator
{
    private array $profiles = [];
    private ?bool $available = null;

    public function available(): bool
    {
        return $this->available ??= Schema::hasColumn('appointments', 'duration_allocation')
            && Schema::hasColumn('consultations', 'duration_sample_approved');
    }

    public function profile(Service $service): array
    {
        if (isset($this->profiles[$service->id])) return $this->profiles[$service->id];
        $minimum = max(7, (int) (AppointmentWorkflow::settings()->duration_min_samples ?? 10));
        $values = []; $excluded = ['unapproved'=>0, 'test'=>0, 'incomplete_or_relationship'=>0, 'invalid_timestamps'=>0, 'elapsed_mismatch'=>0, 'outlier'=>0];
        if ($this->available()) {
            $rows = Consultation::query()->join('appointments as a', 'a.id', '=', 'consultations.appointment_id')
                ->leftJoin('doctor_profiles as d', 'd.id', '=', 'consultations.veterinarian_id')
                ->where('a.service_id', $service->id)
                ->select(['consultations.id','consultations.pet_id','consultations.veterinarian_id','consultations.status','consultations.started_at','consultations.completed_at','consultations.duration_minutes','consultations.duration_sample_approved','consultations.duration_sample_approved_by','consultations.duration_sample_approved_at', 'a.status as appointment_status', 'a.is_test as appointment_is_test',
                    'a.pet_id as appointment_pet_id', 'a.assigned_vet_id as appointment_vet_id', 'd.user_id as doctor_user_id'])->cursor();
            foreach ($rows as $row) {
                if ($row->appointment_is_test) { $excluded['test']++; continue; }
                if (!$row->duration_sample_approved || !$row->duration_sample_approved_at
                    || (int) $row->duration_sample_approved_by !== (int) $row->doctor_user_id) { $excluded['unapproved']++; continue; }
                if ($row->status !== 'completed' || $row->appointment_status !== 'completed'
                    || (int) $row->pet_id !== (int) $row->appointment_pet_id
                    || (int) $row->veterinarian_id !== (int) $row->appointment_vet_id) { $excluded['incomplete_or_relationship']++; continue; }
                if (!$row->started_at || !$row->completed_at || $row->completed_at->gt(now())) { $excluded['invalid_timestamps']++; continue; }
                $seconds = $row->completed_at->getTimestamp() - $row->started_at->getTimestamp();
                if ($seconds <= 0) { $excluded['invalid_timestamps']++; continue; }
                if ($row->duration_minutes !== null && abs((int) $row->duration_minutes - round($seconds / 60)) > 1) { $excluded['elapsed_mismatch']++; continue; }
                $values[] = $seconds;
            }
        }
        sort($values, SORT_NUMERIC);
        $validCount = count($values); $low = null; $high = null;
        if ($validCount >= 4) {
            $q1 = self::percentile($values, .25); $q3 = self::percentile($values, .75); $iqr = $q3 - $q1;
            $low = $q1 - 1.5 * $iqr; $high = $q3 + 1.5 * $iqr;
            // When IQR=0, differing observations are flagged, never silently averaged in.
            $values = array_values(array_filter($values, fn ($v) => $v >= $low && $v <= $high));
            $excluded['outlier'] = $validCount - count($values);
        }
        $count = count($values);
        $median = $count ? self::percentile($values, .5) / 60 : null;
        $manual = is_numeric($service->duration_minutes) && $service->duration_minutes >= 1 && $service->duration_minutes <= 1440 ? (int) $service->duration_minutes : null;
        $historyEnabled = $service->duration_history_enabled !== false;
        $historyUsable = $historyEnabled && $count >= $minimum && $median !== null && $median > 0 && $median <= 1440;
        $base = $historyUsable ? (int) ceil($median) : $manual;
        $buffer = $service->scheduling_buffer_minutes !== null ? (int) $service->scheduling_buffer_minutes : null;
        return $this->profiles[$service->id] = [
            'minutes'=>$base, 'buffer_minutes'=>$buffer, 'allocated_minutes'=>$base === null ? null : $base + ($buffer ?? 0),
            'source'=>$historyUsable ? 'approved_history_median' : ($manual !== null ? 'configured_service' : 'unknown'),
            'sample_count'=>$count, 'valid_before_outliers'=>$validCount, 'minimum_samples'=>$minimum,
            'median_minutes'=>$median, 'history_enabled'=>$historyEnabled, 'history_threshold_met'=>$historyUsable,
            'excluded'=>$excluded, 'outlier_method'=>'IQR fences (Q1 - 1.5 IQR, Q3 + 1.5 IQR); interpolated percentiles',
            'outlier_fences_minutes'=>$low === null ? null : [max(0, $low / 60), $high / 60],
            'fallback'=>$base === null ? 'existing_start_slot_behavior' : null,
        ];
    }

    private static function percentile(array $sorted, float $p): float
    {
        $position = (count($sorted) - 1) * $p; $left = (int) floor($position); $right = (int) ceil($position);
        return $sorted[$left] + ($sorted[$right] - $sorted[$left]) * ($position - $left);
    }

    public function allocation(Service $service): array
    {
        $profile = $this->profile($service);
        return array_intersect_key($profile, array_flip(['minutes','buffer_minutes','allocated_minutes','source','sample_count','minimum_samples']))
            + ['version'=>1, 'recorded_at'=>now()->toIso8601String()];
    }

    public function existing(Appointment $appointment): array
    {
        $snapshot = $appointment->duration_allocation;
        if (is_array($snapshot) && ($snapshot['version'] ?? null) === 1) return $snapshot;
        // Legacy appointments have no allocation snapshot. Only an explicit service
        // value can supply one; new learned estimates never resize old bookings.
        $service = $appointment->service;
        $minutes = $service?->duration_minutes;
        $minutes = is_numeric($minutes) && $minutes >= 1 && $minutes <= 1440 ? (int) $minutes : null;
        $buffer = $service?->scheduling_buffer_minutes;
        return ['minutes'=>$minutes,'buffer_minutes'=>$buffer,'allocated_minutes'=>$minutes === null ? null : $minutes + ($buffer ?? 0),
            'source'=>$minutes === null ? 'legacy_unknown' : 'legacy_configured_service','sample_count'=>0];
    }
}
