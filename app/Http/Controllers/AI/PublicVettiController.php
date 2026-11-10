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
        // Do not broaden a removed service/category into the whole catalog.
        // A new explicit question can establish a fresh verified topic.
        if ($prior !== null && is_array($saved) && (
            (($saved['service'] ?? null) !== null && $selected === null)
            || (is_array($saved['choices'] ?? null) && count($saved['choices']) !== count($pending))
            || (($saved['category'] ?? null) !== null && $category === null)
        )) {
            $prior = null; $selected = null; $pending = []; $category = null;
        }
        $reply = $vetti->reply($validated['message'], null, $prior, $selected, $pending, $category);
        // A failed Gemini turn must not rewrite a previously verified topic.
        $geminiFailure = ($reply['source'] ?? null) === 'fallback'
            && (bool) config('ai.public_conversation_enabled', false)
            && (bool) config('ai.public_vetti_enabled', false)
            && (bool) config('ai.paid_data_approved', false)
            && (bool) config('ai.semantic_privacy_cleared', false);
        if ($conversationId !== null && !$geminiFailure && !(($reply['intent'] ?? '')==='social' && ($reply['context_unchanged'] ?? false))) {
            $topic = ($reply['source'] ?? null) === 'ai'
                ? \App\Services\AI\VettiConversationContext::allowed($reply['intent'])
                : \App\Services\AI\VettiConversationContext::nextTopic($reply['intent'], $prior);
            if (($reply['source'] ?? null) === 'ai') {
                // Gemini-led turns retain only a Laravel-verified service.
                // Never infer context from keyword matches in the user text.
                $state = [
                    'topic' => $topic,
                    'service' => VettiServiceContext::validateSaved($reply['verified_service'] ?? null, $catalog),
                    'choices' => VettiServiceContext::validChoices($reply['verified_choices'] ?? [], $catalog),
                    'category' => null,
                ];
            } else {
                // Compatibility path for callers using the legacy public router.
                $state = [
                    'topic' => $topic,
                    'service' => VettiServiceContext::next($validated['message'], $reply['intent'], $selected, $catalog, $pending),
                    'choices' => VettiServiceContext::nextChoices($validated['message'], $reply['intent'], $pending, $catalog),
                    'category' => \App\Services\AI\VettiConversationContext::nextCategory($validated['message'], $reply['intent'], $category, $categories),
                ];
            }
            VettiConversationSession::write($request, null, $conversationId, $state);
        }
        return $this->ok('Public Vetti response ready.', $reply);
    }
}
