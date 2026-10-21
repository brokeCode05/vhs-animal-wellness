<?php

namespace App\Services\AI;

use App\Models\ClinicSetting;
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
            'services' => [],
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
            }

            $result['services'] = Service::query()
                ->where('active', true)
                ->orderBy('id')
                ->limit(25)
                ->pluck('label')
                ->map(fn ($label) => $this->shortText($label, 120))
                ->filter()
                ->values()
                ->all();
            $result['available'] = true;
        } catch (Throwable) {
            // Keep the assistant usable when the database is not configured.
            // Do not pass unverified clinic details to the model.
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
