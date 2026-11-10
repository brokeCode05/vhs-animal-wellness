<?php

namespace App\Services\AI;

/** Validates a proposed read-only public-information operation against Laravel data. */
final class PublicClinicDataResolver
{
    public const OPERATIONS=['location','contact','clinic_info','hours','hours_location','register','services','service','price','booking_help','preparation','identity','capabilities','doctors','policy'];
    public function __construct(private readonly PublicClinicFacts $facts) {}

    /** The operation is untrusted model output; it never grants database or action access. */
    public function resolve(array $operation): array
    {
        if (array_diff(array_keys($operation), ['type', 'service']) !== []
            || !isset($operation['type']) || !is_string($operation['type'])
            || (array_key_exists('service', $operation) && !is_string($operation['service']))) {
            return ['status'=>'invalid_request'];
        }
        $type = $operation['type'];
        if (!in_array($type, self::OPERATIONS, true)) {
            return ['status'=>'unsupported'];
        }
        if (!in_array($type, ['service', 'price'], true) && array_key_exists('service', $operation)) {
            return ['status'=>'invalid_request'];
        }
        if (in_array($type, ['service', 'price'], true)
            && (!isset($operation['service']) || trim($operation['service']) === '' || mb_strlen($operation['service']) > 120)) {
            return ['status'=>'needs_service'];
        }
        if (in_array($type,['identity','capabilities'],true)) return ['status'=>'ok'] + VettiReplyPolicy::capabilities();
        if ($type === 'preparation') return ['status'=>'ok', 'clinic_specific_requirements'=>'unverified', 'advice_scope'=>'general visit preparation only'];
        if ($type === 'register') return ['status'=>'ok','process'=>'Use Log In or Sign Up on the website. The User Portal is where owners manage their own pets and appointments.'];
        if ($type === 'booking_help') return ['status'=>'ok',
            'process'=>'Sign in or register, use Book an Appointment, choose a registered pet, service and an available date and time, then review and complete confirmation and OTP.'];

        try { $facts = $this->facts->load(); } catch (\Throwable) { return ['status'=>'unavailable']; }
        if (($facts['available'] ?? false) !== true) return ['status'=>'unavailable'];
        if ($type === 'doctors') return ['status'=>'ok', 'public_doctors'=>$facts['public_doctors'] ?? null, 'assigned_doctor'=>'unverified', 'clinic_contact'=>$facts['phone'] ?? null];
        if ($type === 'policy') return ['status'=>'ok', 'appointment_policy'=>$facts['appointment_policy'] ?? null, 'clinic_contact'=>$facts['phone'] ?? null];
        if (in_array($type, ['hours','hours_location'], true)) {
            // Appointment windows are not verified opening or visiting hours.
            return ['status'=>'ok', 'visiting_hours'=>null, 'regular_operating_hours'=>$facts['operating_hours'] ?? null,
                'current_local_datetime'=>now('Asia/Manila')->format('l, F j, Y g:i A'),
                'schedule_exceptions'=>'unverified', 'clinic_contact'=>$facts['phone'] ?? null]
                + ($type === 'hours_location' ? ['address'=>$facts['address'] ?? null] : []);
        }
        if ($type === 'clinic_info') {
            $data = array_filter(['address'=>$facts['address'] ?? null, 'phone'=>$facts['phone'] ?? null,
                'email'=>$facts['email'] ?? null], static fn ($v) => is_string($v) && trim($v) !== '');
            return $data === [] ? ['status'=>'not_available'] : ['status'=>'ok'] + $data;
        }
        if ($type === 'location') {
            $address = $facts['address'] ?? null;
            return is_string($address) && trim($address) !== ''
                ? ['status'=>'ok', 'address'=>$address] : ['status'=>'not_available'];
        }
        if ($type === 'contact') {
            $data = array_filter(['phone'=>$facts['phone'] ?? null, 'email'=>$facts['email'] ?? null],
                static fn ($v) => is_string($v) && trim($v) !== '');
            return $data === [] ? ['status'=>'not_available'] : ['status'=>'ok'] + $data;
        }
        $services = $facts['service_details'] ?? [];
        if (!is_array($services)) return ['status'=>'unavailable'];
        if ($type === 'services') return ['status'=>'ok', 'services'=>array_keys($services)];

        // Exact catalog membership is an authorization/data validation boundary,
        // not a conversational keyword router: Gemini chooses a proposed label.
        $label = $operation['service'];
        if (!array_key_exists($label, $services) || !is_array($services[$label])) return ['status'=>'not_found'];
        $service = $services[$label];
        if ($type === 'service') return ['status'=>'ok', 'service'=>$label, 'category'=>$service['category'] ?? null];
        return self::priceDetails($label, $service);
    }

    /** One validation contract for AI answers and verified offline prices. */
    public static function priceDetails(string $label, array $service): array
    {
        $priceType = $service['pricing_type'] ?? null;
        if (!in_array($priceType, ['single', 'starting', 'range', 'contact'], true)) {
            return ['status'=>'not_available', 'service'=>$label];
        }
        if ($priceType !== 'contact' && (!is_numeric($service['price_min'] ?? null) || (float) $service['price_min'] < 0)) {
            return ['status'=>'not_available', 'service'=>$label];
        }
        if ($priceType === 'range' && (!is_numeric($service['price_max'] ?? null) || (float) $service['price_max'] < (float) $service['price_min'])) {
            return ['status'=>'not_available', 'service'=>$label];
        }
        return ['status'=>'ok', 'service'=>$label, 'pricing_type'=>$priceType,
            'price_min'=>$priceType === 'contact' ? null : $service['price_min'],
            'price_max'=>$priceType === 'range' ? $service['price_max'] : null,
            'currency'=>$priceType === 'contact' ? null : ($service['currency'] ?? null)];
    }
}
