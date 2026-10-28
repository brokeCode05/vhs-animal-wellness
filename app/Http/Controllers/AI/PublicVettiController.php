<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\PublicVettiService;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\VettiServiceContext;
use App\Services\AI\VettiConversationSession;
use App\Support\ApiResponse;
use Illuminate\Http\Request;

final class PublicVettiController extends Controller
{
    use ApiResponse;

    public function reply(Request $request, PublicVettiService $vetti, PublicClinicFacts $facts)
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:450'],
            'conversation_id' => ['sometimes', 'string', 'regex:/\A[a-zA-Z0-9_-]{12,70}\z/'],
        ]);

        // Strict public scope. Do not accept user IDs, pet IDs, conversation
        // history, or browser-supplied clinic facts as provider context.
        $conversationId = $validated['conversation_id'] ?? null;
        $saved = VettiConversationSession::read($request, null, $conversationId);
        $prior = is_array($saved) && $conversationId !== null
            && ($saved['id'] ?? null) === $conversationId
            && ($saved['until'] ?? 0) > time()
            ? \App\Services\AI\VettiConversationContext::allowed($saved['topic'] ?? null) : null;
        $publicFacts = $facts->load();
        $catalog = $publicFacts['services'];
        $categories = $publicFacts['services_by_category'] ?? [];
        $selected = $prior !== null && is_array($saved) && ($saved['id'] ?? null) === $conversationId
            ? VettiServiceContext::validateSaved($saved['service'] ?? null, $catalog) : null;
        $pending = $prior !== null && is_array($saved) && ($saved['id'] ?? null) === $conversationId
            ? VettiServiceContext::validChoices($saved['choices'] ?? [], $catalog) : [];
        $category = $prior !== null && is_array($saved) && ($saved['id'] ?? null) === $conversationId
            ? \App\Services\AI\VettiConversationContext::validateCategory($saved['category'] ?? null, $categories) : null;
        $reply = $vetti->reply($validated['message'], null, $prior, $selected, $pending, $category);
        if ($conversationId !== null) {
            $topic = \App\Services\AI\VettiConversationContext::nextTopic($reply['intent'], $prior);
            VettiConversationSession::write($request, null, $conversationId, [
                'topic' => $topic,
                'service' => VettiServiceContext::next($validated['message'], $reply['intent'], $selected, $catalog, $pending),
                'choices' => VettiServiceContext::nextChoices($validated['message'], $reply['intent'], $pending, $catalog),
                'category' => \App\Services\AI\VettiConversationContext::nextCategory($validated['message'], $reply['intent'], $category, $categories),
            ]);
        }
        return $this->ok('Public Vetti response ready.', $reply);
    }
}
