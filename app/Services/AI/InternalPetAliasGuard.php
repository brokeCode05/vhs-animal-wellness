<?php

namespace App\Services\AI;

/**
 * Internal anonymized pet markers are model-facing identifiers, never
 * user-facing content. Reject rather than trying to guess a pet name.
 */
final class InternalPetAliasGuard
{
    public static function contains(string $text): bool
    {
        return preg_match('/(?<![\p{L}\p{N}_])PET_[\p{L}\p{N}_]+(?![\p{L}\p{N}_])/iu', $text) === 1;
    }
}
