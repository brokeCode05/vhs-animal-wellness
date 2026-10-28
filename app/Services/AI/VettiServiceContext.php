<?php

namespace App\Services\AI;

/**
 * Verified PUBLIC service reference only. This class never reads pets, records,
 * appointments, prices or user input from an AI provider. The session stores
 * only a label already present in the current active-service catalog.
 */
final class VettiServiceContext
{
    /** @param list<string> $catalog */
    public static function mentioned(string $message, array $catalog): array
    {
        $matches = [];
        foreach ($catalog as $name) {
            if (!is_string($name) || $name === '' || mb_strlen($name) > 120) continue;
            // Match the FULL public catalog label, not an approximate or partial
            // substring. A reference to 'grooming' alone cannot silently
            // select between Dog Grooming and Cat Grooming.
            $pattern = '~(?<![\pL\pN])'.preg_quote(trim($name), '~').'(?![\pL\pN])~iu';
            if (preg_match($pattern, $message)) $matches[mb_strtolower($name)] = $name;
        }
        $found = array_values($matches);
        return count($found) === 1 ? ['status'=>'one','label'=>$found[0]]
            : (count($found) > 1 ? ['status'=>'ambiguous','label'=>null] : ['status'=>'none','label'=>null]);
    }

    /**
     * Match a complete service term from a specific availability question
     * against whole words in active catalog labels. Never infer a service
     * from a fragment or select an individual service for a booking.
     *
     * @param list<string> $catalog
     * @return list<string>|null Null means this is not a supported specific question.
     */
    public static function relatedServices(string $message, array $catalog): ?array
    {
        $q = trim($message);
        if (!self::serviceQuestion($q)) return null;
        $matched = preg_match('/\A(?:(?:by the way|btw)[, ]+)?(?:do you (?:offer|have)|does (?:the|your) clinic (?:offer|have))\s+(.+?)[?!. ]*\z/iu', $q, $parts)
            || preg_match('/\Amay\s+(.+?)\s+(?:din\s+)?ba\s+kayo[?!. ]*\z/iu', $q, $parts)
            || preg_match('/\Ameron\s+ba\s+kayong\s+(.+?)[?!. ]*\z/iu', $q, $parts);
        if (!$matched) return null;
        $term = trim(preg_replace('/\A(?:a|an|the)\s+/iu', '', $parts[1]) ?? '');
        if (mb_strlen($term) < 3 || preg_match('/\b(?:and|or|at|o)\b|[^\pL\pN\s-]/iu', $term)) return null;
        $pattern = '~(?<![\pL\pN])'.str_replace(' ', '\\s+', preg_quote($term, '~')).'(?![\pL\pN])~iu';
        return array_values(array_filter($catalog, static fn ($name) =>
            is_string($name) && $name !== '' && (bool) preg_match($pattern, $name)));
    }

    public static function serviceQuestion(string $message): bool
    {
        $q = trim($message);
        if (mb_strlen($q) > 140 || $q === '') return false;
        // Restricted to questions about PUBLIC availability/details. Never
        // turn commands, case histories or booking proposals into an FAQ.
        if (preg_match('/\b(?:book|reserve|schedule|appointment|cancel|reschedule|my|mine|record|prescri|diagnos|treat|symptom|emergency|urgent|otp|password)\b|@|\d/iu', $q)) return false;
        return (bool) preg_match('/\A(?:may\s+.{2,85}\s+(?:din\s+)?ba\s+kayo|meron\s+ba\s+kayong\s+.{2,85}|do\s+you\s+(?:offer|have)\s+.{2,85})\??\z/iu', $q)
            || (bool) preg_match('/\A(?:(?:by the way|btw)[, ]+)?(?:do you (?:offer|have)|does (?:the|your) clinic (?:offer|have)|is (?:there|the service)|what about|how about|tell me about|can you tell me about|may (?:service|serbisyo|ba kayong)|meron ba kayong|ano(?:ng)? (?:details|impormasyon) (?:sa|ng))\s+.{2,100}\??\z/iu', $q);
    }

    /** @param list<string> $catalog */
    public static function validateSaved(mixed $name, array $catalog): ?string
    {
        if (!is_string($name) || $name === '') return null;
        foreach ($catalog as $current) {
            if (is_string($current) && hash_equals($current, $name)) return $current;
        }
        return null;
    }

    /**
     * A new explicit public service question replaces earlier selection.
     * A price follow-up can retain the same service; any unrelated topic,
     * protected/private reply or ambiguity clears the selection.
     * @param list<string> $catalog
     */
    public static function next(string $message, string $intent, mixed $prior, array $catalog, mixed $pending = []): ?string
    {
        if ($intent === 'service_choice') return self::choose($message, $pending, $catalog);
        if ($intent === 'services' || $intent === 'service_ambiguous') {
            if (!self::serviceQuestion($message)) return null;
            $match = self::mentioned($message, $catalog);
            return $match['status'] === 'one' ? $match['label'] : null;
        }
        if ($intent === 'price') {
            $match = self::mentioned($message, $catalog);
            if ($match['status'] === 'ambiguous') return null;
            return $match['status'] === 'one' ? $match['label'] : self::validateSaved($prior, $catalog);
        }
        return null;
    }
    /**
     * A pending clarification contains ONLY exact active catalog labels.
     * Order follows the user's message, never the database's label ordering.
     * @param list<string> $catalog
     * @return list<string>
     */
    public static function labelsInOrder(string $message, array $catalog): array
    {
        $positions = [];
        foreach ($catalog as $label) {
            if (!is_string($label) || $label === '' || mb_strlen($label) > 120) continue;
            if (preg_match('~(?<![\pL\pN])'.preg_quote(trim($label), '~').'(?![\pL\pN])~iu', $message, $m, PREG_OFFSET_CAPTURE)) {
                $positions[mb_strtolower($label)] = [$m[0][1], $label];
            }
        }
        uasort($positions, static fn ($a, $b) => $a[0] <=> $b[0]);
        return array_values(array_map(static fn ($x) => $x[1], $positions));
    }

    /** @param list<string> $catalog @return list<string> */
    public static function validChoices(mixed $choices, array $catalog): array
    {
        if (!is_array($choices) || count($choices) < 2 || count($choices) > 5) return [];
        $result = [];
        foreach ($choices as $name) {
            $valid = self::validateSaved($name, $catalog);
            if ($valid === null || in_array($valid, $result, true)) return [];
            $result[] = $valid;
        }
        return $result;
    }

    /** Only brief, non-personal clarifications can select a pending option. */
    public static function choose(string $message, mixed $pending, array $catalog): ?string
    {
        $choices = self::validChoices($pending, $catalog);
        $q = trim($message);
        if (!$choices || $q === '' || mb_strlen($q) > 140) return null;
        // Nothing with booking, health, account information, identifiers or
        // multiple mentioned services may resolve a pending choice.
        if (preg_match('/\b(?:book|reserve|schedule|appointment|cancel|reschedule|my|mine|record|diagnos|treat|symptom|emergency|urgent|password|otp|prescri)\b|@|\d{3,}/iu', $q)) return null;
        $normalized = trim(mb_strtolower(preg_replace('/[?!.,]+$/u', '', $q) ?? $q));
        $orders = ['first' => 0, 'second' => 1, 'third' => 2, 'fourth' => 3];
        if (preg_match('/\A(?:the )?(first|second|third|fourth)(?: one| option| service)?\z/iu', $normalized, $m)) {
            return $choices[$orders[$m[1]]] ?? null;
        }
        if (preg_match('/\A(?:option |number |#)?([1-4])\z/u', $normalized, $m)) {
            return $choices[(int) $m[1] - 1] ?? null;
        }
        $name = trim(preg_replace('/\A(?:i (?:mean|choose|pick|want)|the service is|it is|please choose)\s+/iu', '', $normalized) ?? $normalized);
        foreach ($choices as $label) {
            if (mb_strtolower($label) === $name) return $label;
        }
        // 'What about Dog Grooming?' is an explicit, catalog-verified choice.
        if (self::serviceQuestion($q)) {
            $mentioned = self::labelsInOrder($q, $catalog);
            if (count($mentioned) === 1 && in_array($mentioned[0], $choices, true)) return $mentioned[0];
        }
        return null;
    }

    /** A price follow-up must keep an unresolved choice open, not guess. */
    public static function unresolvedFollowUp(string $message, mixed $pending, array $catalog): bool
    {
        return self::validChoices($pending, $catalog) !== []
            && (\App\Services\AI\VettiConversationContext::followUp($message, 'services') === 'price'
                || (bool) preg_match('/\A(?:which one|either|both|what about (?:those|them))\??\z/iu', trim($message)));
    }

    /** @param list<string> $catalog @return list<string> */
    public static function nextChoices(string $message, string $intent, mixed $prior, array $catalog): array
    {
        if ($intent === 'service_ambiguous') {
            if (self::serviceQuestion($message)) {
                $found = self::labelsInOrder($message, $catalog);
                return count($found) >= 2 && count($found) <= 5 ? $found : [];
            }
            return self::validChoices($prior, $catalog);
        }
        return [];
    }

}
