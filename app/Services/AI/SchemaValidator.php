<?php

namespace App\Services\AI;

use stdClass;

/**
 * Minimal fail-closed validator for the JSON Schema subset used by VHS.
 * Supports type, properties, required, additionalProperties, items, enum.
 * Schema-constrained generation is NOT a substitute for PHP validation.
 */
final class SchemaValidator
{
    public static function matches(array $schema, mixed $value, int $depth = 0): bool
    {
        if ($depth > 10) {
            return false;
        }
        $types = $schema['type'] ?? null;
        if (! is_string($types) && ! is_array($types)) {
            return false;
        }
        $types = (array) $types;
        $matched = false;
        foreach ($types as $type) {
            $matched = $matched || match ($type) {
                'string' => is_string($value),
                'integer' => is_int($value),
                'number' => is_int($value) || is_float($value),
                'boolean' => is_bool($value),
                'null' => $value === null,
                'array' => is_array($value),
                'object' => $value instanceof stdClass,
                default => false,
            };
        }
        if (! $matched) {
            return false;
        }
        if (array_key_exists('enum', $schema) && ! in_array($value, $schema['enum'], true)) {
            return false;
        }
        if ($value instanceof stdClass) {
            $properties = $schema['properties'] ?? [];
            if (! is_array($properties)) {
                return false;
            }
            foreach (($schema['required'] ?? []) as $key) {
                if (! property_exists($value, $key)) {
                    return false;
                }
            }
            foreach (get_object_vars($value) as $key => $fieldValue) {
                if (! isset($properties[$key])) {
                    if (($schema['additionalProperties'] ?? true) === false) {
                        return false;
                    }
                    continue;
                }
                if (! is_array($properties[$key]) || ! self::matches($properties[$key], $fieldValue, $depth + 1)) {
                    return false;
                }
            }
        }
        if (is_array($value) && isset($schema['items'])) {
            if (! is_array($schema['items'])) {
                return false;
            }
            foreach ($value as $item) {
                if (! self::matches($schema['items'], $item, $depth + 1)) {
                    return false;
                }
            }
        }
        return true;
    }
}
