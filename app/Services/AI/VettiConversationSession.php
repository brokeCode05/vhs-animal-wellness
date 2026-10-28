<?php

namespace App\Services\AI;

use Illuminate\Http\Request;

/**
 * Session-only, bounded PUBLIC clinic topic contexts, keyed by conversation ID.
 * User and anonymous scopes never share a key. No text, pet information,
 * transcripts or AI responses may be stored in this cache.
 */
final class VettiConversationSession
{
    private const LIMIT = 6;

    private static function key(?int $userId): string
    {
        return $userId === null ? 'vetti.public.topics' : 'vetti.user.topics.'.$userId;
    }

    /** Prefix prevents numeric-only conversation IDs from becoming array indexes. */
    private static function slot(string $conversationId): string
    {
        return 'c_'.$conversationId;
    }

    /** @return array<string,mixed>|null */
    public static function read(Request $request, ?int $userId, ?string $conversationId): ?array
    {
        if ($conversationId === null) return null;
        $all = $request->session()->get(self::key($userId), []);
        if (!is_array($all)) return null;
        $saved = $all[self::slot($conversationId)] ?? null;
        return is_array($saved) && ($saved['until'] ?? 0) > time() ? $saved : null;
    }

    /**
     * @param array{topic:?string,service:?string,choices:array,category:?string} $state
     */
    public static function write(Request $request, ?int $userId, string $conversationId, array $state): void
    {
        $key = self::key($userId);
        $all = $request->session()->get($key, []);
        if (!is_array($all)) $all = [];
        // Prune expired entries, even when a chat ID is never reused.
        $all = array_filter($all, static fn ($entry) => is_array($entry) && ($entry['until'] ?? 0) > time());
        // Never spread arbitrary state keys (e.g. messages or browser facts).
        $saved = [
            'id' => $conversationId,
            'topic' => VettiConversationContext::allowed($state['topic'] ?? null),
            'service' => $state['service'] ?? null,
            'choices' => $state['choices'] ?? [],
            'category' => $state['category'] ?? null,
            'until' => time() + 1200,
        ];
        // Reinsert updated chat last, making it the most recently used entry.
        $slot = self::slot($conversationId);
        unset($all[$slot]);
        $all[$slot] = $saved;
        while (count($all) > self::LIMIT) array_shift($all);
        $request->session()->put($key, $all);

        // Compatibility mirror used by existing Stage 1 tests and older
        // diagnostics; never used for retrieval or cross-conversation routing.
        $mirror = $userId === null ? 'vetti.public.topic' : 'vetti.user.topic.'.$userId;
        $request->session()->put($mirror, $saved);
    }
}
