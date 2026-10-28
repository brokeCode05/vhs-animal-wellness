<?php

namespace App\Http\Controllers\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\UserVettiFacts;
use App\Services\AI\UserVettiService;
use App\Services\AI\PublicClinicFacts;
use App\Services\AI\VettiServiceContext;
use App\Services\AI\VettiConversationSession;
use App\Support\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class UserVettiController extends Controller
{
    use ApiResponse;

    public function reply(Request $request, UserVettiService $vetti, UserVettiFacts $facts, PublicClinicFacts $clinicFacts)
    {
        $input = $request->validate([
            'message' => ['required', 'string', 'min:2', 'max:450'],
            'responseLanguage' => ['sometimes', 'string', Rule::in(['en', 'taglish'])],
            'pet_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'conversation_id' => ['sometimes', 'string', 'regex:/\A[a-zA-Z0-9_-]{12,70}\z/'],
            'context_topic' => ['sometimes', 'string', Rule::in(\App\Services\AI\VettiConversationContext::TOPICS)],
            'context_category' => ['sometimes','string','max:90'],
        ]);
        $user = $request->user();
        // No client-supplied identity, pet metadata, conversation history or
        // AI context is trusted. Even unrelated questions cannot probe pet IDs.
        $petId = isset($input['pet_id']) ? (int) $input['pet_id'] : null;
        abort_unless($petId === null || $facts->ownsPet($user, $petId), 403, 'Access denied.');

        $id = $input['conversation_id'] ?? null;
        $saved = VettiConversationSession::read($request, (int) $user->getKey(), $id);
        $sessionValid = $id !== null && is_array($saved) && ($saved['id'] ?? null) === $id
            && ($saved['until'] ?? 0) > time();
        $prior = $sessionValid
            ? \App\Services\AI\VettiConversationContext::allowed($saved['topic'] ?? null) : null;
        // A public-topic hint from the browser bridges turns answered by the
        // existing local UI without ever sending the earlier user utterance.
        // The hint cannot authorize protected reads, actions, or provider calls.
        $prior ??= \App\Services\AI\VettiConversationContext::allowed($input['context_topic'] ?? null);
        $publicFacts = $clinicFacts->load();
        $catalog = $publicFacts['services'];
        $categories = $publicFacts['services_by_category'] ?? [];
        $selected = $sessionValid && $prior !== null
            ? VettiServiceContext::validateSaved($saved['service'] ?? null, $catalog) : null;
        $pending = $sessionValid && $prior !== null
            ? VettiServiceContext::validChoices($saved['choices'] ?? [], $catalog) : [];
        $category = $sessionValid && $prior !== null
            ? \App\Services\AI\VettiConversationContext::validateCategory($saved['category'] ?? null, $categories) : null;
        // Read-only public context hint for turns previously handled locally.
        // A forged category never authorizes any action and must be catalog-valid.
        $categoryHint = $prior === 'services'
            ? \App\Services\AI\VettiConversationContext::validateCategory($input['context_category'] ?? null, $categories) : null;
        if ($categoryHint !== null) $category = $categoryHint;
        $reply = $vetti->reply(
            $user, $input['message'], $input['responseLanguage'] ?? 'en', $petId, $prior, $selected, $pending, $category,
        );
        if ($id !== null) {
            $topic = \App\Services\AI\VettiConversationContext::nextTopic($reply['intent'], $prior);
            VettiConversationSession::write($request, (int) $user->getKey(), $id, [
                'topic' => $topic,
                'service' => VettiServiceContext::next($input['message'], $reply['intent'], $selected, $catalog, $pending),
                'choices' => VettiServiceContext::nextChoices($input['message'], $reply['intent'], $pending, $catalog),
                'category' => \App\Services\AI\VettiConversationContext::nextCategory($input['message'], $reply['intent'], $category, $categories),
            ]);
        }
        return $this->ok('User Vetti response ready.', $reply);
    }
}
