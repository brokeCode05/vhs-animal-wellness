<?php
namespace App\Services\AI;

/** Server-only credential selection. No config mutation and no cross-feature fallback. */
final class AiCredentials
{
    public static function scopeForTask(string $task): string
    {
        return $task==='scribe'?'scribe':'vetti';
    }

    public static function key(string $provider,string $scope='shared'): string
    {
        if (!in_array($provider,['gemini','groq'],true) || !in_array($scope,['shared','vetti','scribe'],true))
            throw new \InvalidArgumentException('Unsupported AI credential scope.');
        $shared=$provider==='gemini'?'ai.api_key':'ai.groq_api_key';
        if ($scope!=='shared') {
            $setting=$provider==='gemini'?'ai.'.$scope.'_api_key':'ai.groq_'.$scope.'_api_key';
            $dedicated=trim((string)config($setting,''));
            if ($dedicated!=='') return $dedicated;
        }
        // Empty feature fields preserve the existing configuration during setup.
        // A missing Scribe key must never borrow Vetti's dedicated key, or vice versa.
        return trim((string)config($shared,''));
    }
}
