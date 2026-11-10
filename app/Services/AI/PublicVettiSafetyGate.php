<?php

namespace App\Services\AI;

/** Public-chat safety boundaries, evaluated before any provider request. */
final class PublicVettiSafetyGate
{
    /** Emergency and instruction attacks take priority over all FAQ handling. */
    public static function priority(string $message): ?string
    {
        if (preg_match('/\b(?:emergency|urgent|poison|collapse|seizures?|convulsions?|unconscious|not breathing|can[\x27\x{2019}]?t breathe|cannot breathe|struggling to breathe|difficulty breathing|having trouble breathing|has trouble breathing|hard time breathing|gasping|choking|bleeding heavily|emergency vet)\b|\b(?:having|has|have|experiencing|with)\s+(?:(?:a|some)\s+)?(?:trouble|problems?|difficulty|difficulties|a hard time)\s+(?:with\s+)?breathing\b|nahihirapan huminga|hirap huminga|hindi makahinga/iu', $message)) return 'urgent';
        if (preg_match('/\b(ignore (?:all |previous |your )?instructions|system prompt|api key|session token|password|otp|secret key|reveal prompt)\b/iu', $message)) return 'unsupported';
        return null;
    }

    /**
     * Remove generic ownership wording before screening. This is data minimization,
     * not a guarantee that arbitrary free text contains no identifiers.
     */
    public static function providerMessage(string $message): ?string
    {
        // Never neutralize a named pet or a potentially identifying reference.
        if (preg_match('/\b(?:my|our)\s+(?:pet|dog|cat|puppy|kitten)\s+(?:named|called|[\p{L}]+[\x27\x{2019}]s)\b/iu', $message)
            || preg_match('/\b(?:my|our)\s+(?:pet|dog|cat|puppy|kitten)\s*[,(:]\s*[\p{L}]/iu', $message)) return null;
        $safe = preg_replace('/\b(?:my|our)\s+(pet|dog|cat|puppy|kitten)([\x27\x{2019}]s)\b/iu', 'a $1$2', $message);
        if (!is_string($safe) || self::privateOrMedical($safe) !== null) return null;
        // Account and record references must not be made public by redaction.
        if ($safe !== $message && preg_match('/\b(?:appointment|booking|record|profile|account|address|phone|email|prescription|medical|name|named|called)\b/iu', $safe)) return null;
        return $safe;
    }

    /** Refuse private and clinical text at the public provider boundary. */
    public static function privateOrMedical(string $message): ?string
    {
        if (VettiReplyPolicy::thirdParty($message)) return 'private';
        // Public chat cannot retrieve anybody's account or clinical records.
        if (preg_match('/\b(?:show|retrieve|access|download|read|list|give)\b.{0,70}\b(?:records?|histories|history|results?|owner details)\b|\b(?:another|other) owner(?:\x27s)?\b/iu', $message)) return 'private';
        // Dates are not phone numbers. Screen other long number sequences,
        // including local landlines and international formats, before any AI call.
        $numberScreen = preg_replace('/\b\d{4}-\d{2}-\d{2}\b/u', '[DATE]', $message) ?? $message;
        preg_match_all('/(?<!\d)\+?\d[\d\s().-]{6,}\d(?!\d)/u', $numberScreen, $numberCandidates);
        foreach ($numberCandidates[0] as $candidate) {
            $digits = preg_replace('/\D/u', '', $candidate) ?? '';
            if (strlen($digits) >= 8 && strlen($digits) <= 15) return 'private';
        }
        // Filipino 'ako' means I, not my; ownership suffixes and explicit
        // identity disclosures are checked separately below.
        if (preg_match('/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu', $message)
            || preg_match('/\b(?:\+?63|0)9\d{9}\b/u', preg_replace('/[\s\-()]/', '', $message) ?? '')
            || preg_match('/\b(?:my|our|mine|ko|akin|aking|namin)\b.{0,65}\b(?:pet|dog|cat|puppy|kitten|appointment|booking|record|medical|prescription|profile|account|address|number|phone|email)\b/iu', $message)
            || preg_match('/\b(?:my name is|i live at|my birthday|owner is|patient id|pet id|account number|ako si|pangalan ko|nakatira ako)\b/iu', $message)
            || preg_match('/\b(?:appointments?|bookings?|pets?|alaga|aso|pusa|records?|profiles?|accounts?|reseta)\s+(?:ko|namin|akin)\b/iu', $message)) return 'private';
        if (preg_match('/\b(vomit|vomiting|diarrhea|diarrhoea|fever|swollen|swelling|bleeding|symptom|symptoms|diagnose|diagnosis|prescribe|dosage|dose|medicine|medication|treat|treatment|sick|illness|injury|pain|disease|parvo|trembling|shivering)\b|nagsusuka|may sakit|pagtatae|nanginginig|panginginig/iu', $message)) return 'medical';
        return null;
    }
}
