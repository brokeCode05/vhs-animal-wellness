<?php

namespace App\Services;

/** Detects a limited set of contact identifiers before external text processing. */
final class ScribePrivacyGuard
{
    public function hasContactDetails(string $text): bool
    {
        $email='/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/iu';
        // Philippine mobile formats: 09xx or +63 9xx, with optional separators.
        $mobile='/(?<![\p{L}\p{N}])(?:\+?63[\s().\-]*9|0[\s().\-]*9)(?:[\s().\-]*[0-9]){9}(?![\p{L}\p{N}])/u';
        return preg_match($email,$text)===1 || preg_match($mobile,$text)===1;
    }
}
