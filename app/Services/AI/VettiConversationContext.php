<?php

namespace App\Services\AI;

/**
 * Short-lived, non-personal conversation topic. No user utterances, records,
 * identifiers, pet data or AI responses are retained or sent to a provider.
 * Context never authorizes a database query or a state-changing action.
 */
final class VettiConversationContext
{
    public const TOPICS = ['services', 'hours', 'location', 'hours_location', 'booking', 'register', 'price', 'preparation', 'clinic_info'];

    public static function allowed(mixed $value): ?string
    {
        return is_string($value) && in_array($value, self::TOPICS, true) ? $value : null;
    }

    public static function followUp(string $message, ?string $previous): ?string
    {
        if (self::allowed($previous) === null) return null;
        $q = mb_strtolower(trim($message));
        $q = preg_replace('/[\s?!.,]+/u', ' ', $q) ?? '';
        $q = trim($q);
        if ($q === '' || mb_strlen($q) > 115) return null;

        // Do not reinterpret commands, identifying information, clinical text,
        // or emergency messages as an innocent FAQ follow-up.
        if (preg_match('/\b(?:my|mine|our|ko|akin|namin|pet|dog|cat|record|account|appointment status|cancel|reschedule|book now|confirm|diagnos|treat|prescri|medicine|medication|fever|seizure|emergency|urgent|password|otp|ignore instructions)\b|\d|@/iu', $q)) return null;
        // A few short deictic price questions are safe to resolve using a
        // separately verified catalog selection, never a guessed service.
        if (preg_match('/\A(?:magkano(?: po)?(?: (?:yun|yon|iyan|yan|ito|niyan|nyan))?|how much for (?:that|this|it|those))\z/iu', $q)) return 'price';
        if (preg_match('/\A(?:and |what about |how about |so )?(?:how much(?: (?:does|do) (?:that|this|it) cost| (?:is|does) (?:it|that|this))?|what (?:is|about) (?:the )?(?:price|cost|fee)|magkano|presyo)(?: (?:is|does) (?:it|that|this|those))?\z/iu', $q)) return 'price';
        if (preg_match('/\A(?:and |what about |how about )?(?:where (?:is|are) (?:it|that|you|the clinic)|where|saan|what(?: is)? (?:the )?address|location)\z/iu', $q)) return 'location';
        // An unambiguous public visiting-hours question must not become an
        // authenticated appointment-history request merely because it says 'visit'.
        if (preg_match('/\A(?:what time can i visit(?: (?:the clinic|you|there))?|when can i visit(?: (?:the clinic|you|there))?|anong oras (?:ako )?puwedeng pumunta(?: sa clinic)?)\z/iu', $q)) return 'hours';
        // Relative-day questions inherit only an existing visiting-hours topic,
        // never a concrete booking slot or a person's appointment history.
        if (in_array($previous, ['hours', 'hours_location'], true)
            && preg_match('/\A(?:and |what about |how about |so )?(?:tomorrow|bukas|today|ngayon|the next day)\z/iu', $q)) return 'hours';
        if (preg_match('/\A(?:and |what about |how about )?(?:when|what time|what (?:about|are) (?:the )?hours|anong oras|oras|weekends?|saturdays?|sundays?|after work|is it open on weekends?)\z/iu', $q)) return 'hours';
        if (preg_match('/\A(?:and |what about |how about )?(?:how (?:to|can i) (?:book|schedule|reserve)(?: (?:it|that))?|how do i arrange (?:it|that)|can i book (?:it|that)|paano (?:magbook|magpa appointment))\z/iu', $q)) return 'booking';
        if (preg_match('/\A(?:and |what about |how about )?(?:what (?:should|do) i (?:bring|prepare)|do i need to bring anything|what to bring|ano (?:ang )?dadali(?:hin)?|paano magprepare)\z/iu', $q)) return 'preparation';
        if (self::languageSwitch($q) !== null) return $previous;
        if (preg_match('/\A(?:tell me more|more (?:details|info|information|please)|can you explain (?:more|that)|what about (?:that|it)|paano naman|what else|and that)\z/iu', $q)) return $previous;
        return null;
    }

    /** Explicit request to restate public clinic facts; not a generic translation API. */
    public static function languageSwitch(string $message): ?string
    {
        $q = mb_strtolower(trim($message));
        $q = trim(preg_replace('/[\s?!.,]+/u', ' ', $q) ?? '');
        if (preg_match('/\A(?:can you |could you |please )?(?:explain|say|tell|repeat|translate|rephrase)(?: (?:that|it|this|the answer|those services|the services))? (?:in|sa) (?:tagalog|filipino|english)|\A(?:tagalog|filipino|english) (?:please|po)\z/iu', $q)) {
            return preg_match('/\benglish\b/iu', $q) ? 'en' : 'tl';
        }
        return null;
    }

    /** Current active public catalog category only; never user-supplied metadata. */
    public static function validateCategory(mixed $name, array $categories): ?string
    {
        if (!is_string($name)) return null;
        foreach (array_keys($categories) as $category) {
            if (is_string($category) && hash_equals($category, $name)) return $category;
        }
        return null;
    }

    public static function mentionedCategory(string $message, array $categories): ?string
    {
        $matched = [];
        foreach (array_keys($categories) as $category) {
            if (is_string($category) && $category !== '' && preg_match('~(?<![\pL\pN])'.preg_quote($category, '~').'(?![\pL\pN])~iu', $message)) $matched[] = $category;
        }
        return count($matched) === 1 ? $matched[0] : null;
    }

    public static function nextCategory(string $message, string $intent, mixed $prior, array $categories): ?string
    {
        if ($intent !== 'services' && $intent !== 'price') return null;
        $explicit = self::mentionedCategory($message, $categories);
        if ($explicit !== null) return $explicit;
        if (self::languageSwitch($message) !== null || self::followUp($message, 'services') !== null) {
            return self::validateCategory($prior, $categories);
        }
        return null;
    }

    public static function nextTopic(string $intent, ?string $prior = null): ?string
    {
        if (in_array($intent, ['service_ambiguous', 'service_choice'], true)) return 'services';
        if (self::allowed($intent) !== null) {
            // Following up about a service fee must not lose the service topic.
            if ($intent === 'price' && $prior === 'services') return 'services';
            return $intent;
        }
        return null;
    }
}
