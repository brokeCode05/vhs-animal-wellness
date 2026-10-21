<?php

namespace App\Services\AI;

/**
 * Rule-first selection for later Vetti endpoints. This class NEVER runs actions.
 * It only matches exact, unambiguous known aliases. A caller must handle
 * clarification, authorization and the eventual backend action separately.
 * Unknown text is a candidate for approved LLM interpretation, not a command.
 */
final class DeterministicIntentRouter
{
    /**
     * @param array<string, array{aliases: array<int, string>, required?: array<int, string>}> $registry
     * @param array<string, scalar|null> $arguments Already validated by caller.
     * @return array{route: string, intent: ?string, missing: array<int, string>}
     */
    public function route(string $message, array $registry, array $arguments = []): array
    {
        $normalized = self::normalize($message);
        if ($normalized === '') {
            return ['route' => 'reject', 'intent' => null, 'missing' => []];
        }

        $matches = [];
        foreach ($registry as $intent => $rule) {
            foreach (($rule['aliases'] ?? []) as $alias) {
                if ($normalized === self::normalize($alias)) {
                    $matches[$intent] = $rule;
                    break;
                }
            }
        }

        // Duplicated aliases are unsafe: do not arbitrarily select an intent.
        if (count($matches) !== 1) {
            return ['route' => count($matches) > 1 ? 'clarify' : 'llm_candidate', 'intent' => null, 'missing' => []];
        }
        $intent = array_key_first($matches);
        $missing = [];
        foreach (($matches[$intent]['required'] ?? []) as $key) {
            if (! array_key_exists($key, $arguments) || $arguments[$key] === null
                || (is_string($arguments[$key]) && trim($arguments[$key]) === '')) {
                $missing[] = $key;
            }
        }
        return ['route' => $missing ? 'clarify' : 'rule', 'intent' => $intent, 'missing' => $missing];
    }

    private static function normalize(string $value): string
    {
        return trim(preg_replace('/\s+/u', ' ', strtolower(trim($value))) ?? '');
    }
}
