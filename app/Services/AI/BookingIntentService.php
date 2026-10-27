<?php

namespace App\Services\AI;

/**
 * Read-only booking *preferences*. Gemini never sees the owner's wording,
 * pet/owner details, appointment dates, availability, or clinical data.
 * This class cannot create bookings, reserve slots, or select a specific pet.
 */
final class BookingIntentService
{
    private const SERVICE_PATTERNS = [
        'grooming' => ['\bgroom(?:ing)?\b', '\bbath(?:e|ing)?\b', '\bf(?:ur|urry) trim\b', '\bhair\s*cut\b', '\btidy (?:the )?fur\b', '\b(?:ipa[- ]?groom|magpa[- ]?groom|pa[- ]?groom|paliguan)\b', '\b(?:ligo|paligo)\b'],
        'vaccination' => ['\bvaccinat(?:e|ed|ion|ions|ing)\b', '\bvaccine(?:s)?\b', '\bbakuna\b', '\bbooster\b'],
        'consultation' => ['\bconsult(?:ation)?\b', '\bcheck[ -]?up\b', '\bmagpa[ -]?check[ -]?up\b', '\bkonsulta\b', '\bvet (?:visit|check)\b'],
        'deworming' => ['\bdeworm(?:ing)?\b'],
        'microchipping' => ['\bmicro[ -]?chipp?(?:ing|ed)?\b'],
        'spay' => ['\bspay(?:ing)?\b'],
        'neuter' => ['\bneuter(?:ing)?\b'],
        'boarding' => ['\bboard(?:ing)?\b', '\bovernight stay\b'],
        'confinement' => ['\bconfinement\b'],
        'dental' => ['\bdental\b', '\bteeth cleaning\b'],
    ];

    private const TIME_PATTERNS = [
        'morning' => ['\bmorning\b', '\bearly hours?\b', '\bbefore (?:noon|lunch)\b', '\bumaga\b', '\bsa umaga\b'],
        'afternoon' => ['\bafternoon\b', '\bafter lunch\b', '\bmidday\b', '\btanghali\b', '\bhapon\b'],
        'evening' => ['\bevening\b', '\bafter (?:work|my shift|shift)\b', '\bafter dark\b', '\bgabi\b'],
    ];

    // Vague, nonclinical public wording stays ONLY in fixed cue tags.
    // Unlike explicit service names, these hints are filled only when the
    // model confirms them; disabled AI leaves the service selector blank.
    private const ADVISORY_PATTERNS = [
        'pet_wash' => ['\bwash(?:ed|ing)?\b', '\bpaligo(?:an)?\b'],
        'nail_trim' => ['\btrim (?:the )?nails?\b', '\bnail trimming\b'],
        'coat_tidy' => ['\btidy (?:the )?coat\b', '\bbrush(?:ing)? (?:the )?fur\b'],
    ];

    private const BLOCK_MODEL = '/\b(?:emergency|urgent|unconscious|seizure|poison|collapse|bleed(?:ing)?|vomit(?:ing)?|diarrh(?:ea|oea)|fever|diagnos(?:e|is)|medication|prescription|dosage|allerg(?:y|ies)|medical history|otp|password|token|ignore instructions|system prompt|api key)\b/iu';

    public function __construct(private readonly AiGateway $gateway)
    {
    }

    /** @return array{service_hint:string,service_ambiguous:bool,time_preference:string,source:string,requires_confirmation:bool,booking_created:bool} */
    public function interpret(string $message): array
    {
        // A medical or urgent message must not be transformed into a
        // preselected nonclinical service. The frontend presents an urgent
        // safety message; this read-only endpoint abstains completely.
        if (preg_match(self::BLOCK_MODEL, $message)) {
            return $this->result('none', 'none', 'rule');
        }
        $services = $this->cues(mb_strtolower($message), self::SERVICE_PATTERNS);
        $times = $this->cues(mb_strtolower($message), self::TIME_PATTERNS);
        $advisory = $this->cues(mb_strtolower($message), self::ADVISORY_PATTERNS);

        // A wash/bath advisory means grooming, so a simultaneous DIFFERENT
        // explicit service is ambiguous too (e.g. wash + vaccination).
        // In all ambiguous cases return a machine-readable veto; frontend
        // must clear even a previously detected local exact service match.
        $serviceAmbiguous = count($services) > 1
            || ($advisory && count($services) === 1 && $services[0] !== 'grooming');
        $service = ! $serviceAmbiguous && count($services) === 1 ? $services[0] : 'none';
        $time = count($times) === 1 ? $times[0] : 'none';

        // "Get washed" is a sufficiently specific nonclinical grooming
        // request in the booking flow. Keep it as an authenticated, local
        // rule so provider abstention, outages and disabled AI do not leave
        // the service blank. A second named service still vetoes it, and
        // clinical/emergency wording must not get this shortcut.
        $ruleService = $service;
        if (! $serviceAmbiguous && $service === 'none'
            && in_array('pet_wash', $advisory, true)
            && ! preg_match(self::BLOCK_MODEL, $message)) {
            $ruleService = 'grooming';
        }
        $fallback = $this->result($ruleService, $time, 'rule', $serviceAmbiguous);

        if (! config('ai.booking_intent_enabled', false) || ! config('ai.enabled', false)
            || preg_match(self::BLOCK_MODEL, $message) || (! $services && ! $times && ! $advisory)
            || $serviceAmbiguous || count($times) > 1
            || ($service !== 'none' && $service !== 'grooming' && $advisory)) {
            return $fallback;
        }

        // Whitelisted labels constructed inside PHP: NEVER send raw input,
        // pet names, numbers, dates, chat history or other personal data.
        $safeMessage = 'service_cues='.($services ? implode(',', $services) : 'none')
            .'; time_cues='.($times ? implode(',', $times) : 'none');
        if ($advisory) {
            $safeMessage .= '; advisory_cues='.implode(',', $advisory);
        }
        $schema = [
            'type' => 'object',
            'properties' => [
                'service_hint' => [
                    'type' => 'string',
                    'enum' => array_merge(['none'], array_keys(self::SERVICE_PATTERNS)),
                ],
                'time_preference' => ['type' => 'string', 'enum' => ['none', 'morning', 'afternoon', 'evening']],
            ],
            'required' => ['service_hint', 'time_preference'],
            'additionalProperties' => false,
        ];
        $instructions = 'You classify sanitized public booking vocabulary only, not patient requests. '
            .'Reply using the supplied JSON schema. Use only the service and time cues given. '
            .'If no unique service/time is provided, return none. Do not suggest a date, pet, slot, '
            .'medical recommendation, appointment creation or clinic availability.';
        $ai = $this->gateway->structured('booking_intent', $safeMessage, $instructions, 'sanitized', $schema);
        if (! ($ai['ok'] ?? false) || ! is_array($ai['data'] ?? null)) {
            return $fallback;
        }
        $parsed = $ai['data'];
        $aiService = $parsed['service_hint'] ?? 'none';
        $aiTime = $parsed['time_preference'] ?? 'none';
        // Server-side allowlist intersection: even schema-valid but mismatched
        // model output may not introduce a new/ambiguous service or daypart.
        $allowedService = $service === 'none' && $advisory ? 'grooming' : $service;
        // Advisory grooming may be inferred only from our fixed safe tags;
        // neither novel medical services nor arbitrary model guesses survive.
        if (($aiService !== $service && $aiService !== $allowedService)
            || $aiTime !== $time) {
            return $fallback;
        }
        // Gemini can corroborate the safe wash alias, but may not erase it
        // by returning `none` when the fixed cue has a unique local meaning.
        if ($ruleService === 'grooming' && $aiService === 'none') {
            return $fallback;
        }
        return $this->result($aiService, $aiTime, 'ai', false);
    }

    /** @param array<string,array<int,string>> $patterns @return array<int,string> */
    private function cues(string $message, array $patterns): array
    {
        $matched = [];
        foreach ($patterns as $name => $expressions) {
            foreach ($expressions as $expression) {
                if (preg_match('/'.$expression.'/iu', $message)) {
                    $matched[] = $name;
                    break;
                }
            }
        }
        return $matched;
    }

    private function result(string $service, string $time, string $source, bool $ambiguous = false): array
    {
        return [
            'service_hint' => $service,
            'service_ambiguous' => $ambiguous,
            'time_preference' => $time,
            'source' => $source,
            'requires_confirmation' => true,
            'booking_created' => false,
        ];
    }
}
