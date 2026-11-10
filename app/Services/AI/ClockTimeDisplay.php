<?php

namespace App\Services\AI;

/** Presentation only; appointment values remain in 24-hour format. */
final class ClockTimeDisplay
{
    public static function from24(string $time): string
    {
        if (!preg_match('/\A([01]\d|2[0-3]):([0-5]\d)\z/', $time, $parts)) return $time;
        $hour=(int) $parts[1];
        return (($hour % 12) ?: 12).':'.$parts[2].($hour < 12 ? ' AM' : ' PM');
    }
}
