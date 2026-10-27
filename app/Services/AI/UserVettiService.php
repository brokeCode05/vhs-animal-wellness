<?php

namespace App\Services\AI;

use App\Models\User;

/**
 * Phase 3: authorized text answers and public-only model assistance.
 * Never give the provider free-form owner chat, pet names, appointment data,
 * clinical text, or prior conversation. Structured UI/cards stay in VettiState.
 * Booking interpretation and final booking are separate Phase 4 work.
 */
final class UserVettiService
{
    public function __construct(
        private readonly UserVettiFacts $facts,
        private readonly PublicVettiService $publicVetti,
    ) {
    }

    /** @return array<string,mixed> */
    public function reply(User $user, string $message, string $language = 'en', ?int $petId = null): array
    {
        $input = trim($message);
        $lower = mb_strtolower($input);
        $taglish = $language === 'taglish';

        if (preg_match('/\b(emergency|urgent|not breathing|unconscious|seizures?|convulsions?|poison|collapse|difficulty breathing)\b|hindi makahinga|nahihirapan huminga|nangingisay/iu', $lower)) {
            return $this->answer($taglish
                ? 'Kung emergency ito, tawagan agad ang veterinarian o emergency clinic. Huwag maghintay ng chat reply.'
                : 'If this may be an emergency, call a veterinarian or emergency clinic immediately rather than waiting for chat.', 'rule', 'urgent');
        }
        if (preg_match('/\b(ignore (?:previous|all) instructions|system prompt|secret|password|otp|api key|token)\b/iu', $lower)) {
            return $this->answer('I can help with your pets, appointments, and clinic questions, but not account secrets.', 'rule', 'unsupported');
        }
        if (preg_match('/\b(show|list|display|view|what are|who are)\b.{0,15}\b(my pets|my pet|pets)\b|\b(my pets|mga alaga ko|mga pets ko)\b/iu', $lower)) {
            $pets = $this->facts->pets($user);
            if (! $pets) {
                return $this->answer($taglish ? 'Wala pang pet sa account mo. Gamitin ang Add Pet para mag-register.' : 'There are no pets on your account yet. Use Add Pet to register one.', 'rule', 'pets');
            }
            $names = array_map(fn (array $pet): string => $pet['name'].' ('.$pet['species'].')', $pets);
            return $this->answer('Your registered pets: '.implode(', ', $names).'.', 'rule', 'pets');
        }
        if (preg_match('/\b(?:what happens if|what if|miss my appointment|missed appointment|no[- ]?show (?:policy|fee)|ma[- ]?miss ko)\b/iu', $lower)) {
            return $this->answer('If you miss an appointment, contact the clinic about its no-show and rescheduling policies. I cannot verify fees or change an appointment from chat.', 'rule', 'missed_visit_help');
        }
        if (preg_match('/\b(?:what vaccines? (?:has|did)|which vaccines? (?:has|did)|vaccines? received|vaccination history|vaccine history)\b/iu', $lower)) {
            return $this->answer('For the actual vaccines administered, check your pet\'s Medical Records or Documents. Please ask the veterinarian to verify the record; I will not guess.', 'rule', 'vaccination_records_help');
        }
        if (preg_match('/\b(?:medical (?:history|record)|vaccination (?:record|passport)|prescription|laboratory result|lab result|clinical history)\b|health records?/iu', $lower)) {
            return $this->answer('Please open your pet\'s Medical Records or Documents section to view authorized records. For interpretation, ask the clinic veterinarian.', 'rule', 'records');
        }
        // How-to guidance must be routed BEFORE private appointment queries.
        // A question such as "Paano magpa-appointment?" must never list history
        // or send identifying context to Gemini.
        if (preg_match('/(?:^|\s)paano\s+(?:po\s+)?(?:(?:ako|kami|ko)\s+)?(?:mag(?:pa)?[- ]?(?:appointment|book|schedule|reserve)|makapag[- ]?book)\b|\bhow\s+(?:(?:do|can|could|should)\s+(?:i|we)\s+|to\s+)(?:book|schedule|make|request|arrange|get|reserve)\b|\b(?:what is the (?:booking|appointment) (?:process|procedure)|how does (?:the )?booking work)\b/iu', $lower)) {
            return $this->answer('To book an appointment, open Book an Appointment in your User Dashboard. Choose one of your registered pets, select a service, date, and available time, then review and confirm using the verification code. You can also ask Vetti to start the booking form.', 'rule', 'booking_help');
        }
        // Read-only appointment queries. An optional pet selector must already
        // have passed the controller's ownership check. Resolve a named pet
        // ONLY against pets owned by this session user, never global search.
        if (preg_match('/\b(?:my appointments?|my next appointment|next appointment|upcoming appointments?|appointment status|status of my appointment|next visit|upcoming visits?)\b|\b(?:schedule ko|appointment ko|appointments ko)\b/iu', $lower)) {
            if ($petId === null && preg_match('/\bwhen is\s+(.{1,60}?)\x27?s next appointment\b/iu', $lower, $named)) {
                $wanted = trim($named[1]);
                $matched = null;
                foreach ($this->facts->pets($user) as $pet) {
                    if (mb_strtolower($pet['name']) === $wanted) {
                        $matched = $pet['id'];
                        break;
                    }
                }
                if ($matched === null) {
                    return $this->answer('I could not find that pet on your account. Please select one of your registered pets.', 'rule', 'pet_not_found');
                }
                $petId = $matched;
            }
            $appointments = $this->facts->upcoming($user, $petId);
            if (! $appointments) {
                return $this->answer('You have no upcoming appointments on your account. You can use Book an Appointment to request a visit.', 'rule', 'appointments');
            }
            $lines = array_map(static fn (array $a): string =>
                $a['pet_name'].' — '.$a['date'].' at '.$a['time'].' ('.$a['service'].'; '.$a['status'].')', $appointments);
            return $this->answer('Your upcoming appointments: '.implode('; ', $lines).'.', 'rule', 'appointments');
        }
        if (preg_match('/\b(?:book|booking|reschedule|cancel|available slot|appointment otp|reserve)\b|magpa.?book|mag.?book|ipa[- ]?groom|magpa[- ]?groom|magpa[- ]?bakuna/iu', $lower)) {
            return $this->answer('You can use the existing Book an Appointment, Reschedule, or Cancel controls. Available slots and any changes are verified by Laravel; Vetti never completes a booking for you.', 'rule', 'booking_guidance');
        }
        if (preg_match('/\b(?:diagnose|diagnosis|prescribe|dosage|medication|vomit|diarrhea|fever|sick|symptoms?|parvo|treat|treatment|pain)\b|nagsusuka|may sakit|pagtatae/iu', $lower)) {
            return $this->answer('I cannot diagnose symptoms or recommend medication. Please contact your veterinarian for guidance.', 'rule', 'medical');
        }

        // Reconstruct a completely public, fixed question from approved topics.
        // Crucially, the raw user text (even a free-form message with a name,
        // number, or private detail) is NEVER forwarded to an AI provider.
        $publicPrompt = $this->publicPrompt($lower);
        if ($publicPrompt !== null) {
            $modelAllowed = (bool) config('ai.user_vetti_enabled', false);
            $public = $this->publicVetti->reply($publicPrompt, $modelAllowed);
            return $this->answer($public['text'], $public['source'], $public['intent']);
        }
        return $this->answer($taglish
            ? 'Maaari kitang tulungan sa pets, appointments, clinic services, at booking guidance. Puwede mo ring gamitin ang mga button sa dashboard.'
            : 'I can help with your pets, appointments, clinic services, and booking guidance. You can also use the dashboard controls.', 'fallback', 'unsupported');
    }

    /** Return a vetted public question, not the user's original text. */
    private function publicPrompt(string $input): ?string
    {
        // Don't even derive a public question from messages that look like PII,
        // personal case histories, clinical details, or prompt injection.
        if (preg_match('/\d|@|https?:|\b(?:my|mine|pet named|named|owner|patient|record|private|address is|phone|email|password|otp|allerg|disease|medic|surgery|blood|chronic|history|prescri|diagnos|injury)\b|\b(?:ko|akin|namin)\b/iu', $input)) {
            return null;
        }
        // Exact known intent -> rules inside the Public Vetti service.
        if (preg_match('/\b(?:services?|serbisyo|grooming|vaccination|microchipping|deworming)\b/iu', $input)) {
            return 'What services do you offer?';
        }
        if (preg_match('/\b(?:hours?|bukas|oras|opening time)\b/iu', $input)) {
            return 'What are your clinic hours?';
        }
        if (preg_match('/\b(?:where|located|location|directions|saan)\b/iu', $input)) {
            return 'Where is the clinic?';
        }
        if (preg_match('/\b(?:register|signup|sign up|login|log in)\b/iu', $input)) {
            return 'How do I register?';
        }
        if (preg_match('/\b(?:work late|after work|weekends?|weekday|evening|visit|clinic appointment|arrange)\b/iu', $input)) {
            return 'I work late on weekdays; can I arrange a clinic visit another way?';
        }
        return null;
    }

    /** @return array{text:string,state:string,suggestions:array,source:string,intent:string,requires_confirmation:bool} */
    private function answer(string $text, string $source, string $intent): array
    {
        return [
            'text' => $text,
            'state' => 'idle',
            'suggestions' => [],
            'source' => $source,
            'intent' => $intent,
            'requires_confirmation' => false,
        ];
    }
}
