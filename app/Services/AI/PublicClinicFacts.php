<?php

namespace App\Services\AI;

use App\Models\ClinicSetting;
use App\Models\DoctorProfile;
use App\Models\Service;
use Throwable;

/** Read-only, public clinic information. Never loads a patient, owner, or appointment. */
class PublicClinicFacts
{
    /** @return array<string,mixed> */
    public function load(): array
    {
        $result = [
            'available' => false,
            'name' => null,
            'phone' => null,
            'email' => null,
            'address' => null,
            'weekday_appointment_window' => null,
            'weekend_appointment_window' => null,
            'operating_hours' => null,
            'appointment_policy' => null,
            'public_doctors' => null,
            'services' => [],
            'services_by_category' => [],
            'service_details' => [],
            'booking_services' => [],
        ];

        try {
            $setting = ClinicSetting::query()->first(); // never firstOrCreate: public FAQ is read-only
            if ($setting !== null) {
                $result['name'] = $this->shortText($setting->clinic_name ?? null, 100);
                $result['phone'] = $this->shortText($setting->clinic_phone ?? null, 40);
                $result['email'] = $this->shortText($setting->clinic_email ?? null, 120);
                $result['address'] = $this->shortText($setting->clinic_address ?? null, 260);
                $result['weekday_appointment_window'] = $this->window($setting->weekday_first ?? null, $setting->weekday_last ?? null);
                $result['weekend_appointment_window'] = $this->window($setting->weekend_first ?? null, $setting->weekend_last ?? null);
                $result['operating_hours'] = $this->operatingHours($setting->operating_hours);
                $result['appointment_policy'] = [
                    'cancellation_cutoff_minutes' => $setting->cancel_cutoff_minutes,
                    'reschedule_cutoff_minutes' => $setting->reschedule_cutoff_minutes,
                    'no_show_grace_minutes' => $setting->noshow_grace_minutes,
                ];
            }

            // Use the same active-profile policy as the existing public directory.
            try {
                $result['public_doctors'] = DoctorProfile::with('user')
                    ->where('account_status', 'active')
                    ->whereHas('user', fn ($q) => $q->where('status', 'active'))
                    ->orderBy('id')->limit(100)->get()->map(function ($doctor) {
                        return ['name' => $this->shortText($doctor->display_name ?: $doctor->user?->name, 100),
                            'specialization' => $this->shortText($doctor->specialization, 100)];
                    })->filter(fn ($doctor) => $doctor['name'] !== null)->values()->all();
            } catch (Throwable) {
                // Keep other clinic information available if the directory fails.
            }

            // One active catalog read supplies both service names and their
            // authoritative category relation. Do not infer categories in AI.
            $rows = Service::query()->where('active', true)->orderBy('id')
                ->limit(100)->get();
            foreach ($rows as $row) {
                $label = $this->shortText($row->label ?? null, 120);
                $category = $this->shortText($row->category ?? null, 60);
                if ($label === null) continue;
                $result['services'][] = $label;
                $value=$this->shortText($row->value ?? null,120);
                if ($value!==null) $result['booking_services'][]=['value'=>$value,'label'=>$label];
                // Only explicitly configured public pricing is authoritative.
                $type = $row->public_pricing_type;
                $minimum = $row->public_price_min;
                $maximum = $row->public_price_max;
                $valid = in_array($type, ['range','starting','single','contact'], true)
                    && ($type === 'contact' || (is_numeric($minimum) && (float) $minimum >= 0))
                    && ($type !== 'range' || (is_numeric($maximum) && (float) $maximum >= (float) $minimum));
                $result['service_details'][$label] = [
                    'category'=>$category, 'pricing_type'=>$valid ? $type : null,
                    'price_min'=>$valid && $type !== 'contact' ? (string) $minimum : null,
                    'price_max'=>$valid && $type === 'range' ? (string) $maximum : null,
                    'currency'=>$valid && $type !== 'contact' ? $row->currency : null,
                    // Retained for older consumers; unknown is never a quote.
                    'price'=>null,
                ];
                if ($category !== null) {
                    $result['services_by_category'][$category] ??= [];
                    $result['services_by_category'][$category][] = $label;
                }
            }
            $result['available'] = true;
        } catch (Throwable) {
            // Keep the assistant usable when the database is not configured.
            // Do not pass unverified clinic details to the model.
        }

        return $result;
    }

    private function operatingHours(mixed $schedule): ?array
    {
        if (!is_array($schedule)) return null;
        $result = [];
        foreach (['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as $day) {
            $row = $schedule[$day] ?? null;
            if (!is_array($row) || !in_array($row['status'] ?? null, ['open','closed','unknown'], true)) return null;
            if ($row['status'] !== 'open') { $result[$day] = ['status'=>$row['status']]; continue; }
            $open = $row['open'] ?? ''; $close = $row['close'] ?? '';
            if (!is_string($open) || !is_string($close)
                || !preg_match('/\A(?:[01]\d|2[0-3]):[0-5]\d\z/', $open)
                || !preg_match('/\A(?:[01]\d|2[0-3]):[0-5]\d\z/', $close) || $close <= $open) return null;
            $result[$day] = ['status'=>'open', 'open'=>date('g:i A', strtotime($open)), 'close'=>date('g:i A', strtotime($close))];
        }
        return $result;
    }

    private function shortText(mixed $value, int $length): ?string
    {
        $text = trim((string) ($value ?? ''));
        $text = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $text) ?? '';
        return $text === '' ? null : mb_substr($text, 0, $length);
    }

    private function window(mixed $from, mixed $to): ?string
    {
        $first = (string) ($from ?? '');
        $last = (string) ($to ?? '');
        if (! preg_match('/\A\d{2}:\d{2}(?::\d{2})?\z/', $first) || ! preg_match('/\A\d{2}:\d{2}(?::\d{2})?\z/', $last)) {
            return null;
        }
        // These are appointment-window settings, NOT verified opening/closing hours.
        return substr($first, 0, 5).'–'.substr($last, 0, 5);
    }
}
