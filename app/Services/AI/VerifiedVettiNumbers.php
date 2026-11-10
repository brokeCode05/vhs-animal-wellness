<?php

namespace App\Services\AI;

/** Checks numeric claims against whole numeric values in verified facts. */
final class VerifiedVettiNumbers
{
    public static function allPresent(string $text, array $facts): bool
    {
        // Consecutive, standalone list markers describe formatting, not
        // clinic prices or times. Every numeric claim inside an item is checked.
        $listPattern = '/^[ \t]*(\d{1,2})[.)][ \t]+/m';
        preg_match_all($listPattern, $text, $markers);
        $count = count($markers[1]);
        if ($count >= 2 && $count <= 20 && $markers[1] === array_map('strval', range(1, $count))) {
            $text = preg_replace($listPattern, '', $text) ?? $text;
        }
        $pattern = '/\d+(?:[.,:]\d+)*/u';
        preg_match_all($pattern, $text, $claims);
        preg_match_all($pattern, json_encode($facts, JSON_UNESCAPED_UNICODE) ?: '', $available);
        foreach ($claims[0] as $claim) {
            $found = false;
            foreach ($available[0] as $value) {
                $normalizedClaim = self::numericValue($claim);
                $normalizedValue = self::numericValue($value);
                if ($claim === $value || ($normalizedClaim !== null && $normalizedValue !== null && $normalizedClaim === $normalizedValue)) {
                    $found = true;
                    break;
                }
            }
            if (!$found) return false;
        }
        return true;
    }

    private static function numericValue(string $value): ?float
    {
        // Accept conventional thousands separators, but do not reinterpret
        // ambiguous or malformed commas as different verified amounts.
        if (str_contains($value, ',')) {
            if (!preg_match('/\A[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?\z/D', $value)) return null;
            $value = str_replace(',', '', $value);
        }
        return is_numeric($value) ? (float) $value : null;
    }
}
