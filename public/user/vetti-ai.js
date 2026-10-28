/* ============================================================
   VETTIAI — the asynchronous answer controller (frontend only)

   THE SEAM. Vetti's send() used to build its reply by calling the
   deterministic resolver inline. This module sits between the UI and
   whatever produces answers, so moving to a real backend later
   changes a PROVIDER, not the UI:

     Vetti UI (send)
        -> VettiAI.ask(request, ctx)
             -> buildRequest()    minimal, backend-ready request
             -> provider          default = State.resolve (deterministic)
             -> validateAnswer()  existing answer/render contract only
             -> Promise<answer>   ALWAYS resolves, never rejects

   RULES THIS MODULE ENFORCES:
   - The default provider IS the deterministic resolver, so today's
     replies are exactly what they were before the seam existed, and
     the resolver keeps working as the fallback for any failure.
   - Any provider failure (sync throw, rejected promise, timeout) and
     any answer that fails validation falls back to the deterministic
     resolver. The chat never breaks and never shows a malformed
     answer, and the fallback answer is returned as-is (no second
     validation pass, so fallback can never loop).
   - Only whitelisted action names survive validation, so a future AI
     answer can never name an arbitrary action for runAction() to run.
   - The request is the minimal {message, responseLanguage,
     conversation, activePet} — never the whole buildContext(): the
     pets list, appointments and services stay client-side until a
     backend contract asks for specific ones. The deterministic
     provider still receives the full ctx as its second argument.
   - Conversation history is a bounded, in-memory window of TEXT turns
     ({role: 'user'|'vetti', text}) — the last MAX_HISTORY only. It is
     never persisted: refresh clears it, New Conversation clears it,
     and localStorage stays reserved for the language preference. Rich
     cards and system data never enter history.

   PHASE 3: same-origin Laravel endpoint for authenticated text answers.
   Existing rich cards, booking wizard actions and OTP handoffs stay on
   the deterministic resolver. Backend call sends only current text, language, a temporary conversation
   identifier, an optional public topic label and pet ID: never whole
   context or raw conversation history.
   No API key or direct Gemini call in browser JavaScript.

   Depends on: vetti-state.js (loads AFTER it, BEFORE vetti-ui.js).

   v5.1.2
   ============================================================ */
(function (global) {
  'use strict';

  var State = global.VettiState;

  // ── Bounds ────────────────────────────────────────────────────────
  // The recent window a future backend request carries. Small on
  // purpose: enough for follow-up questions, short enough to keep a
  // request cheap and to avoid shipping a whole session.
  var MAX_HISTORY = 12;
  // Per-turn caps. The composer is the real input bound; these only
  // stop an oversized string from riding along in history.
  var MAX_TURN_CHARS = 2000;
  // How long a provider may take before the deterministic resolver
  // answers instead. Generous: the default provider is synchronous.
  var DEFAULT_TIMEOUT_MS = 65000;

  // The ONLY action names an answer may carry. These are exactly the
  // cases runAction() already understands — nothing else executes.
  var ALLOWED_ACTIONS = ['openPetForm', 'openBooking', 'openReschedule', 'openCancel'];

  // Answer/render-contract keys by type. The renderer reads a fixed
  // set of fields; anything outside these is inert and ignored.
  var BOOLEAN_KEYS = ['appointments', 'serviceCategories', 'capabilities'];
  var OBJECT_KEYS = ['petCard', 'appointment', 'service', 'serviceGroup'];
  var ARRAY_KEYS = ['petCards'];

  // ── State ─────────────────────────────────────────────────────────
  // In-memory only by design: history is conversation scratch, not a
  // stored record. The language preference lives in localStorage and
  // is untouched by anything here.
  var history = [];
  // Anonymous per-chat identifier: Laravel session owns the actual pending state.
  // This is NOT an authentication token, ID, or user record.
  var semanticConversationId = 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  var semanticAvailability = null;
  // Ephemeral, local-only booking proposal: no browser storage or provider
  // history. Never treats context as a confirmed appointment.
  var pendingBooking = null;
  var provider = null;   // null = the deterministic default is active

  // ── Small helpers ─────────────────────────────────────────────────
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  // Same rule as vetti-state.js: only the two stored values exist,
  // everything else is English — a preference can never drift into an
  // unsupported language code.
  function normalizeLanguage(value) {
    return value === 'taglish' ? 'taglish' : 'en';
  }

  // ── Conversation history ──────────────────────────────────────────
  // Textual turns only, newest kept, window trimmed to MAX_HISTORY.
  // Invalid roles and empty text are dropped rather than stored, so a
  // caller mistake can never pollute what a future request sends.
  function recordTurn(role, text) {
    if (role !== 'user' && role !== 'vetti') return;
    var value = typeof text === 'string' ? text.trim() : '';
    if (!value) return;
    history.push({ role: role, text: value.slice(0, MAX_TURN_CHARS) });
    if (history.length > MAX_HISTORY) {
      history = history.slice(history.length - MAX_HISTORY);
    }
  }

  function getHistory() {
    return history.slice();
  }

  function clearHistory() {
    history = [];
    pendingBooking = null;
    semanticConversationId = 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
  }

  // ── Request building ──────────────────────────────────────────────
  // Minimal pet context: identity only, whatever fields exist. Never
  // the full pet record (medical notes, chip id, allergies stay out).
  function minimalPet(pet) {
    if (!isPlainObject(pet)) return null;
    var out = {};
    if (pet.petId !== undefined && pet.petId !== null && pet.petId !== '') out.petId = pet.petId;
    if (typeof pet.name === 'string' && pet.name.trim()) out.name = pet.name.trim();
    if (typeof pet.species === 'string' && pet.species.trim()) out.species = pet.species.trim();
    return Object.keys(out).length ? out : null;
  }

  function sanitizeTurnList(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var turn = list[i];
      if (!isPlainObject(turn)) continue;
      if (turn.role !== 'user' && turn.role !== 'vetti') continue;
      var text = typeof turn.text === 'string' ? turn.text.trim() : '';
      if (!text) continue;
      out.push({ role: turn.role, text: text.slice(0, MAX_TURN_CHARS) });
    }
    return out.slice(-MAX_HISTORY);
  }

  // The minimal request object. seed may carry overrides (used by the
  // future backend path and by tests); anything absent is derived:
  //   message            — trimmed, the current turn (history holds PRIOR turns)
  //   responseLanguage   — from seed, else the UI context, else 'en'
  //   conversation       — seed's list, else the bounded in-memory window
  //   activePet          — minimal {petId, name, species} or null
  function buildRequest(seed, ctx) {
    var s = typeof seed === 'string' ? { message: seed } : (isPlainObject(seed) ? seed : {});
    var c = isPlainObject(ctx) ? ctx : {};
    return {
      message: String(s.message === undefined || s.message === null ? '' : s.message).trim(),
      responseLanguage: normalizeLanguage(
        s.responseLanguage !== undefined ? s.responseLanguage : c.responseLanguage
      ),
      conversation: s.conversation !== undefined
        ? sanitizeTurnList(s.conversation)
        : getHistory(),
      activePet: s.activePet !== undefined
        ? minimalPet(s.activePet)
        : minimalPet(c.activePet)
    };
  }

  // ── Response validation ───────────────────────────────────────────
  // Lightweight by design: it checks the answer/render contract the
  // renderer already relies on. It never fills in missing business
  // data — an answer it cannot vouch for is rejected outright and the
  // deterministic resolver answers instead.
  function validateAnswer(answer) {
    if (!isPlainObject(answer)) return { ok: false, reason: 'not_an_object' };

    // text: a string when present (the renderer escapes it as-is).
    if (answer.text !== undefined && answer.text !== null && typeof answer.text !== 'string') {
      return { ok: false, reason: 'text_not_a_string' };
    }

    // state: required, and it must be a state the mascot actually has.
    if (typeof answer.state !== 'string' || !State || typeof State.isState !== 'function'
        || !State.isState(answer.state)) {
      return { ok: false, reason: 'unsupported_state' };
    }

    // suggestions: an array of non-empty strings when present.
    if (answer.suggestions !== undefined && answer.suggestions !== null) {
      if (!Array.isArray(answer.suggestions)) return { ok: false, reason: 'suggestions_not_an_array' };
      for (var i = 0; i < answer.suggestions.length; i++) {
        if (typeof answer.suggestions[i] !== 'string' || !answer.suggestions[i].trim()) {
          return { ok: false, reason: 'suggestion_not_a_string' };
        }
      }
    }

    // action: absent, null/'' — or one of the whitelisted names. Any
    // other string is refused here so runAction() never sees it.
    if (answer.action !== undefined && answer.action !== null && answer.action !== '') {
      if (typeof answer.action !== 'string' || ALLOWED_ACTIONS.indexOf(answer.action) === -1) {
        return { ok: false, reason: 'unsupported_action' };
      }
    }

    // Optional openBooking booking context: the UI may prefill the
    // existing booking wizard with context the conversation already
    // carries. Only these keys survive; the rest is ignored. Every key
    // is optional, so a partial or empty context always opens the wizard
    // normally. Ids may arrive as strings or numbers and are normalized
    // to the canonical string form the booking selects compare against;
    // preferredTime keeps its exact slot label (or numeric hour string).
    if (answer.action === 'openBooking' && isPlainObject(answer.bookingContext)) {
      var allowedBookingKeys = ['petId', 'serviceId', 'preferredDate',
        'preferredTime', 'timePreference', 'earliestTime', 'petUnresolved'];
      var cleaned = {};
      var k;
      for (k = 0; k < allowedBookingKeys.length; k++) {
        var key = allowedBookingKeys[k];
        var value = answer.bookingContext[key];
        if (value === undefined || value === null || value === '') continue;
        if (key === 'petUnresolved') {
          // Boolean signal only: an explicitly named pet could not be
          // resolved, so the UI must NOT fall back to the active pet.
          if (value === true) cleaned[key] = true;
          continue;
        }
        if (key === 'petId' || key === 'serviceId') {
          if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value.trim();
          else if (typeof value === 'number' && isFinite(value)) cleaned[key] = String(value);
          continue;
        }
        if (typeof value === 'string' && value.trim() !== '') cleaned[key] = value.trim();
        else if (key === 'preferredTime' && typeof value === 'number' && isFinite(value)) {
          cleaned[key] = String(value);
        }
      }
      if (Object.keys(cleaned).length) {
        answer.bookingContext = cleaned;
      } else {
        delete answer.bookingContext;
      }
    }

    // Structured payloads: type-check the fields the render blocks
    // read. Wrong types are a shape fault, not content to coerce.
    var k;
    for (k = 0; k < BOOLEAN_KEYS.length; k++) {
      var bk = BOOLEAN_KEYS[k];
      if (answer[bk] !== undefined && answer[bk] !== null && typeof answer[bk] !== 'boolean') {
        return { ok: false, reason: bk + '_not_a_boolean' };
      }
    }
    for (k = 0; k < OBJECT_KEYS.length; k++) {
      var ok2 = OBJECT_KEYS[k];
      if (answer[ok2] !== undefined && answer[ok2] !== null && !isPlainObject(answer[ok2])) {
        return { ok: false, reason: ok2 + '_not_an_object' };
      }
    }
    for (k = 0; k < ARRAY_KEYS.length; k++) {
      var ak = ARRAY_KEYS[k];
      if (answer[ak] !== undefined && answer[ak] !== null && !Array.isArray(answer[ak])) {
        return { ok: false, reason: ak + '_not_an_array' };
      }
    }

    // At least one thing to render: text, a whitelisted action, or a
    // structured payload. An empty husk would draw an empty bubble and
    // silently drop the turn, so it is rejected instead.
    var hasText = typeof answer.text === 'string' && answer.text.trim() !== '';
    var hasPayload = !!answer.action;
    for (k = 0; k < BOOLEAN_KEYS.length && !hasPayload; k++) hasPayload = !!answer[BOOLEAN_KEYS[k]];
    for (k = 0; k < OBJECT_KEYS.length && !hasPayload; k++) hasPayload = !!answer[OBJECT_KEYS[k]];
    for (k = 0; k < ARRAY_KEYS.length && !hasPayload; k++) hasPayload = !!answer[ARRAY_KEYS[k]];
    if (!hasText && !hasPayload) return { ok: false, reason: 'nothing_to_render' };

    return { ok: true };
  }

  // ── Providers ─────────────────────────────────────────────────────
  // The default: today's deterministic resolver, unchanged. It reads
  // the FULL ctx (the minimal request deliberately does not carry it).
  function deterministicProvider(request, ctx) {
    return State.resolve(request.message, ctx);
  }

  function activeProvider() {
    return provider || deterministicProvider;
  }

  // Test seam. The production call site never learns which is active.
  function setProvider(fn) {
    if (typeof fn !== 'function') throw new TypeError('VettiAI.setProvider expects a function');
    provider = fn;
  }

  function resetProvider() {
    provider = null;
  }

  // Bounded wait: a provider that never settles must not leave the
  // composer busy forever. Resolves to the value or rejects on time.
  function withTimeout(promise, timeoutMs) {
    if (!(timeoutMs > 0)) return promise;
    return new Promise(function (resolve, reject) {
      var timer = global.setTimeout(function () {
        reject(new Error('vetti_ai_provider_timeout'));
      }, timeoutMs);
      promise.then(function (value) {
        global.clearTimeout(timer);
        resolve(value);
      }, function (error) {
        global.clearTimeout(timer);
        reject(error);
      });
    });
  }

  // Last resort. Trusted, never re-validated (re-validating the
  // fallback answer would mean the fallback can fail into itself).
  function fallbackAnswer(request, ctx) {
    try {
      return deterministicProvider(request, ctx);
    } catch (error) {
      // The resolver itself could not answer (absent ctx in a bare
      // environment). A plain honest line beats a broken chat, and it
      // claims nothing that did not happen.
      return {
        id: 'ai_error',
        state: 'apology',
        text: 'Something went wrong on my end. Please try again.',
        suggestions: []
      };
    }
  }

  function applyBookingFollowUp(request) {
    var q = String(request.message || '');
    if (!/^(?:actually|instead|change (?:it|that)|make it|rather|ay|palitan|gawin nating)[,\s]/i.test(q) &&
        !/^(?:the )?day after tomorrow\.?$/i.test(q)) return request;
    if (!/\b(?:tomorrow|bukas|makalawa|day after tomorrow|today|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|next (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(q)) return request;
    var turns = request.conversation || [];
    var previous = null;
    // Follow only the immediately preceding user turn, not an earlier
    // booking separated by unrelated questions or an action opt-out.
    for (var i = turns.length - 1; i >= 0; --i) {
      if (turns[i].role === 'user') { previous = turns[i].text; break; }
    }
    if (!previous || !/\b(?:book|booking|schedule|appointment|magpa[- ]?checkup|magpa[- ]?groom)\b/i.test(previous) ||
        /\b(?:don't|do not|not|hindi|neighbor|neighbour|emergency|medicine)\b/i.test(previous)) return request;
    // Replace *only* the date expression; pet and service remain local and
    // must still be validated against the currently hydrated owner records.
    var base = previous.replace(/\b(?:day after tomorrow|tomorrow|today|bukas|makalawa|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:on|sa)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})\b/gi, '');
    return Object.assign({}, request, {message: base + ' ' + q});
  }

  /** A short-lived, local-only pending booking proposal. All fields are
   * revalidated against the CURRENT owned pets / active service catalog.
   * A service-only reply cannot modify an appointment or open the form.
   */
  function updatePendingBooking(message, answer) {
    if (answer && answer.id === 'proposal_availability') return;
    if (answer && answer.action === 'openBooking' && isPlainObject(answer.bookingContext)) {
      pendingBooking = {context:Object.assign({}, answer.bookingContext), until:Date.now()+10*60000, suspended:false,
        serverOwned: answer.id === 'semantic_booking_proposal'};
      return;
    }
    if (!pendingBooking || Date.now() > pendingBooking.until) { pendingBooking=null; return; }
    var text = String(message || '');
    // Explicit opt-outs, appointment-changing actions, unsafe content and
    // ownership failures end a draft. A medical or private turn must never
    // be converted into a booking continuation.
    if (!answer || (answer.action && answer.action !== 'openBooking') ||
        ['action_opt_out','booking_ownership','booking_pet_ambiguous','urgent_safety',
         'booking_service_ambiguous','booking_invalid_date','booking_invalid_time'].indexOf(answer.id) !== -1 ||
        /\b(?:cancel|reschedule|don't book|do not book|stop booking|emergency|urgent|diagnos|treat|prescri|medication|dosage|otp|password|not my pet|neighbor)\b|hindi makahinga|nagsusuka/i.test(text)) {
      pendingBooking = null;
      return;
    }
    // A harmless informational detour should not erase a proposal. Keep its
    // original expiry, but suspend vague date/pet corrections until the user
    // explicitly revisits the draft or starts a new booking.
    pendingBooking.suspended = true;
  }

  function bookingContinuation(request, ctx) {
    if (!pendingBooking || Date.now() > pendingBooking.until) { pendingBooking=null; return null; }
    var text=String(request.semanticOriginalMessage || request.message || '').trim();
    if (!text || text.length>200 || !State || typeof State.extractBookingContext !== 'function') return null;
    if (/\b(?:don't|do not|stop|cancel|reschedule|medical records?|passport|history|diagnos|treat|prescri|sick|emergency|urgent|hurt|fever|vomit|diarrhea|poison|seizure|password|otp|not my|neighbor)\b|hindi makahinga|may sakit|nagsusuka/i.test(text)) { pendingBooking=null; return null; }
    // The user may ask to review an unfinished proposal. It is NOT a lookup
    // of confirmed bookings or permission to create an appointment.
    if (/^(?:ano(?:ng)?(?:\s+na)?(?:\s+ulit)?\s+(?:yung|ang|mga)?\s*(?:details?|detalye|summary)(?:\s+ng)?\s+(?:booking|appointment)(?:\s+ko)?|(?:what(?:'s| is| are)?|show|repeat|summari[sz]e|remind me of)\s+(?:(?:my|the|our|current|proposed|pending)\s+)*(?:booking|appointment)(?:\s+(?:details?|summary|proposal))?|(?:my|the)\s+(?:booking|appointment)\s+(?:details?|summary))[?!. ]*$/i.test(text)) {
      var summaryContext = Object.assign({},pendingBooking.context);
      // Re-check all remembered references against the CURRENT authorized UI
      // data. A draft cannot grant access to a deleted pet/service or expired date.
      var currentPets = Array.isArray(ctx && ctx.pets) ? ctx.pets : [];
      if (summaryContext.petId && !currentPets.some(function(p) {
        return p && String(p.petId !== undefined ? p.petId : p.id) === String(summaryContext.petId);
      })) delete summaryContext.petId;
      if (summaryContext.serviceId && !phase4CanonicalService(ctx && ctx.services, summaryContext.serviceId)) delete summaryContext.serviceId;
      if (summaryContext.preferredDate && State.bookingDateIssue && State.bookingDateIssue(summaryContext.preferredDate)) delete summaryContext.preferredDate;
      if (phase4GroomingMismatch(summaryContext,ctx,'')) delete summaryContext.serviceId;
      pendingBooking.context = Object.assign({},summaryContext);
      pendingBooking.suspended = false;
      var review={id:'booking_proposal_review',state:'booking',action:'openBooking',
        bookingContext:summaryContext,suggestions:[]};
      return phase4BookingSummary(review,ctx,'');
    }
    // A harmless detour keeps the proposal recallable, but an ambiguous
    // follow-up must not edit a draft after that detour.
    if (pendingBooking.suspended) return null;
    // Only explicit lower bounds are interpreted here. The time is a
    // preference, never a selected or reserved slot.
    var after = text.match(/^(?:after|past|pagkatapos ng|lampas ng)\s+(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\s*[?!. ]*$/i);
    if (after) {
      var hour = Number(after[1]);
      if (hour < 1 || hour > 12) { delete pendingBooking.context.earliestTime; return {id:'booking_time_needs_clarification',state:'reminder',action:'',text:'Please provide a valid time, such as after 4 PM.',suggestions:[]}; }
      hour = hour % 12 + (after[3].toLowerCase() === 'pm' ? 12 : 0);
      var nextAfter = Object.assign({}, pendingBooking.context);
      nextAfter.earliestTime = String(hour).padStart(2,'0') + ':' + (after[2] || '00');
      delete nextAfter.preferredTime;
      delete nextAfter.timePreference;
      return phase4BookingSummary({id:'booking_continuation',state:'booking',action:'openBooking',bookingContext:nextAfter,suggestions:[]},ctx,'');
    }
    var relativeDay = /^(?:what about|how about)\s+(?:tomorrow|bukas|today|ngayon)[?!. ]*$/i.test(text);
    if (!relativeDay && /^(?:what|why|how|where|when|anong|ano|saan|bakit|paano)\b/i.test(text)) return null;
    var continuation = relativeDay || /^(?:para\s+(?:sa|kay)|for\s+(?:the\s+)?|(?:it's|it is)\s+for|service\s*(?:is|:)|(?:gusto\s+ko\s+(?:yung|ang))|(?:sa|si|kay)\s+|(?:bukas|tomorrow|today|mamaya|next)\b|(?:morning|afternoon|evening|umaga|hapon|gabi)\b|(?:actually|instead|change|make it|palitan)\b|\d{4}-\d{2}-\d{2}(?:[?!. ]*$)|\d{1,2}\/\d{1,2}\/\d{4}(?:[?!. ]*$)|(?:on|sa)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i.test(text);
    if (!continuation) return null;
    var old=pendingBooking.context;
    var pets=Array.isArray(ctx&&ctx.pets)?ctx.pets:[];
    var svcs=Array.isArray(ctx&&ctx.services)?ctx.services:[];
    var next=Object.assign({},old);
    // Revalidate retained identity against local authenticated ownership.
    if (next.petId && !pets.some(function(p){return p && String(p.petId!==undefined?p.petId:p.id)===String(next.petId);})) delete next.petId;
    if (next.serviceId && !phase4CanonicalService(svcs,next.serviceId)) delete next.serviceId;
    if (State.bookingDateIssue && State.bookingDateIssue(text)) {
      var issue=State.bookingDateIssue(text);
      // A date correction must invalidate the OLD date, not the pet and
      // service. "Next week" is a range, never an invented single slot.
      delete next.preferredDate;
      var dateAnswer={id:'booking_date_needs_clarification',state:'booking',action:'openBooking',
        bookingContext:next,suggestions:[]};
      phase4BookingSummary(dateAnswer,ctx,'');
      dateAnswer.text += issue === 'ambiguous'
        ? '\nPlease choose one specific date next week (within 30 days); no date has been selected.'
        : issue === 'past'
          ? '\nThat date has passed. Please choose a future day; the old date was cleared.'
          : issue === 'too_far'
            ? '\nThe date must be within the next 30 days. Please pick a valid day; the old date was cleared.'
            : '\nThat date is invalid. Please choose one specific day; the old date was cleared.';
      return dateAnswer;
    }
    if (State.bookingTimeIssue && State.bookingTimeIssue(text)) {
      delete next.preferredTime;
      var timeAnswer={id:'booking_time_needs_clarification',state:'booking',action:'openBooking',
        bookingContext:next,suggestions:[]};
      phase4BookingSummary(timeAnswer,ctx,'');
      timeAnswer.text += '\nThe requested time is invalid or outside the configured appointment window. Please choose a valid time; the old exact time was cleared.';
      return timeAnswer;
    }
    var found=State.extractBookingContext(text,ctx)||{};
    if (found.petUnresolved) {pendingBooking=null;return {id:'booking_pet_ambiguous',state:'reminder',action:'',text:'I could not verify that pet among your registered pets. Please choose one of your own pets.',suggestions:['Show my pets']};}
    if (found.petId) next.petId=found.petId;
    if (phase4MultipleServices(text)) {
      delete next.serviceId;
      pendingBooking=null;
      return {id:'booking_service_ambiguous',state:'reminder',action:'',text:'You mentioned more than one service. Which one would you like for this appointment?',suggestions:['What services do you offer?']};
    }
    if (found.serviceId) {
      var exact=phase4CanonicalService(svcs,found.serviceId);
      if (exact) next.serviceId=exact;
    } else {
      // Local service cues resolve ONLY if there is a unique ACTIVE catalog
      // match. The LLM does not select a medical service or patient here.
      var cues=PHASE4_SERVICE_HINTS.filter(function(k){return PHASE4_WORD_GUARDS[k].test(text);});
      if(cues.length===1) {
        var chosen=phase4CatalogMatch(svcs,cues[0],ctx,next,text);
        if(chosen)next.serviceId=chosen;
      }
    }
    // Do not silently pair Dog Grooming with a verified cat or vice versa.
    var groomIssue=phase4GroomingMismatch(next,ctx,text);
    if (groomIssue) delete next.serviceId;
    if (found.preferredDate)next.preferredDate=found.preferredDate;
    if (found.preferredTime)next.preferredTime=found.preferredTime;
    if (found.preferredTime || found.timePreference) delete next.earliestTime;
    if (found.timePreference)next.timePreference=found.timePreference;
    var answer={id:'booking_continuation',state:'booking',action:'openBooking',bookingContext:next,suggestions:[]};
    phase4BookingSummary(answer,ctx,text);
    if (groomIssue) answer.text += '\nThe selected pet and grooming service do not match. Please verify the pet species and choose the correct service.';
    return answer;
  }

  // THE API. Always returns a Promise resolving to a valid answer in
  // the existing shape — it never rejects, whatever a provider does.
  //
  //   ask(seed, ctx, options?)
  //     seed      — partial request (string message or {message, …});
  //                 buildRequest() fills the rest
  //     ctx       — the full deterministic context (buildContext());
  //                 passed to the provider, never serialized into seed
  //     options   — { timeoutMs } override (tests / future tuning)
  function ask(seed, ctx, options) {
    var request;
    try {
      var original = buildRequest(seed, ctx);
      request = applyBookingFollowUp(original);
      request.semanticOriginalMessage = original.message;
    } catch (error) {
      // Request building is the caller's data, not trusted input: if
      // it cannot be built, answer deterministically with what we have.
      return Promise.resolve(fallbackAnswer({ message: '', conversation: [] }, ctx));
    }

    var opts = isPlainObject(options) ? options : {};
    var timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

    // A correction followed by a price question refers to the last named
    // service, not to an appointment action. Match only the current catalog.
    var utterance = String(original.message || '');
    if (pendingBooking && (/\b(?:never mind|nevermind|only asking for information|just asking for information|not booking|not a booking)\b/i.test(utterance) || /^(?:ay\s+)?(?:wag|huwag|ayoko)\s+na(?:\s+pala)?[.!? ]*$/i.test(utterance.trim())) && !/\b(?:emergency|urgent|symptom|medicine|dosage|how much|price|cost|fee|sick|vomit\w*|pain|fever|nagsusuka|sakit|hindi makahinga)\b/i.test(utterance)) {
      pendingBooking = null;
      return Promise.resolve({id:'action_opt_out',state:'idle',action:'',text:/\b(?:wag|huwag|ayoko)\b/i.test(utterance) ? 'Sige, inalis ko ang booking proposal. Walang appointment na ginawa. May iba pa ba akong maitutulong?' : 'Understood. I have cleared the proposed booking; no appointment was made. What information would you like?',suggestions:['What services do you offer?','Clinic information']});
    }
    var recentTurns = Array.isArray(original.conversation) ? original.conversation : [];
    var lastUserTurn = recentTurns.filter(function(t) { return t.role === 'user' && t.text && t.text !== utterance; }).slice(-1)[0];
    // Translate only recognized, fixed clinic guidance. Do not send prior
    // private chat to a provider or claim to translate unsupported content.
    var translation = utterance.trim().match(/^(?:(?:can|could) you\s+|please\s+)?(?:translate|say|repeat|explain|rephrase)\s+(?:that|this|it|the answer)\s+(?:to|in|sa)\s+(english|tagalog|filipino)[?!. ]*$/i);
    if (translation) {
      var targetEnglish = translation[1].toLowerCase() === 'english';
      var lastReply = recentTurns.filter(function(t) { return t.role === 'vetti'; }).slice(-1)[0];
      var pairs = [
        ['Hindi ko makumpirma kung bukas ang clinic tuwing Linggo. Tumawag sa clinic bago pumunta; ang oras ng appointment ay hindi palaging oras ng pagbubukas.', 'I cannot verify whether the clinic is open on Sundays. Please call before visiting; appointment times are not necessarily opening hours.'],
        ['Hindi ko makumpirma ang oras ng pagbubukas. Tingnan ang Clinic Info o tumawag sa clinic bago pumunta.', 'I cannot verify the clinic’s opening hours. Please check Clinic Info or call before visiting.'],
        ['Hindi ko makumpirma kung tumatanggap ang clinic ng walk-in. Tumawag muna sa clinic para malaman ang patakaran at availability.', 'I cannot verify whether the clinic accepts walk-ins. Please contact the clinic to confirm its policy and availability.'],
        ['Hindi ko makumpirma kung anong payment methods ang tinatanggap ng clinic. Tumawag muna sa clinic para makasiguro.', 'I cannot verify which payment methods the clinic accepts. Please contact the clinic to confirm before your visit.'],
        ['Hindi ko makumpirma kung may bayad sa pagkansela o pagpapalit ng appointment. Makipag-ugnayan sa clinic para sa kasalukuyang patakaran. Walang binago sa appointment mo.', 'I cannot verify cancellation or rescheduling fees. Please contact the clinic for its current policy. No appointment was changed.']
      ];
      var previousText = lastReply && String(lastReply.text || '');
      for (var p = 0; p < pairs.length; p++) {
        var sourceText = pairs[p][targetEnglish ? 0 : 1];
        if (previousText && previousText.indexOf(sourceText) === 0 && (previousText.length === sourceText.length || /^\s*(?:Here is the clinic information available in your User Portal:|You can find the clinic.s contact information|Narito ang impormasyon ng clinic sa User Portal:|Makikita ang contact information)/.test(previousText.slice(sourceText.length)))) {
          var translated = pairs[p][targetEnglish ? 1 : 0];
          var extra = previousText.slice(sourceText.length);
          if (extra) translated += targetEnglish ? extra.replace('Narito ang impormasyon ng clinic sa User Portal:', 'Here is the clinic information available in your User Portal:').replace('Pangalan:', 'Name:').replace('Telepono:', 'Phone:').replace('Para sa oras ng appointment, direksyon at iba pang detalye, piliin ang Open Clinic Info.', 'For appointment hours, directions and other details, select Open Clinic Info.').replace('Makikita ang contact information, lokasyon at oras ng appointment sa Clinic Info. Piliin ang Open Clinic Info para sa pinakabagong detalye.', "You can find the clinic's contact information, location and appointment hours in Clinic Info. Select Open Clinic Info to view the latest details.") : extra.replace('Here is the clinic information available in your User Portal:', 'Narito ang impormasyon ng clinic sa User Portal:').replace('Name:', 'Pangalan:').replace('Phone:', 'Telepono:').replace('For appointment hours, directions and other details, select Open Clinic Info.', 'Para sa oras ng appointment, direksyon at iba pang detalye, piliin ang Open Clinic Info.').replace("You can find the clinic's contact information, location and appointment hours in Clinic Info. Select Open Clinic Info to view the latest details.", 'Makikita ang contact information, lokasyon at oras ng appointment sa Clinic Info. Piliin ang Open Clinic Info para sa pinakabagong detalye.');
          return Promise.resolve({id:'clinic_translation',state:'idle',action:'',text:translated,suggestions:['Clinic information']});
        }
      }
      if (!lastReply || /\bto\s+(?:english|tagalog|filipino)\b/i.test(utterance)) return Promise.resolve({id:'translation_unavailable',state:'idle',action:'',text:targetEnglish ? 'I can restate some clinic guidance in English, but I cannot reliably translate that last answer. Please ask the clinic question again in English.' : 'Maaari kong ulitin sa Tagalog ang ilang clinic guidance, pero hindi ko maaasahang maisalin ang huling sagot. Pakitanong muli sa Tagalog.',suggestions:['Clinic information']});
    }
    if (/^paano(?:\s+ko)?\s+(?:ito|iyon|yan|yun)\s+(?:ililipat|ilipat|i[- ]?reschedule)(?:\s+sa\s+ibang\s+(?:araw|petsa))?[?!. ]*$/i.test(utterance.trim()) && lastUserTurn && /\b(?:appointment|booking|visit|appointments|schedule)\b/i.test(lastUserTurn.text)) {
      return Promise.resolve({id:'appointment_change_help',state:'idle',action:'',text:'Buksan ang My Appointments, piliin ang appointment, at gamitin ang Reschedule. Suriin ang available na petsa at oras bago kumpirmahin. Ang clinic ang nagtatakda ng mga patakaran; walang binago sa appointment mo.',suggestions:['Show my appointments']});
    }
    if (/^(?:what should i bring|what do i bring|what should i prepare|what do i need to bring|ano ang dadalhin ko)[?!. ]*$/i.test(utterance.trim()) && lastUserTurn && /\b(?:consultation|consult|check[ -]?up|vet visit)\b/i.test(lastUserTurn.text) && !/\b(?:book|cancel|emergency|symptom)\b/i.test(lastUserTurn.text)) {
      return Promise.resolve({id:'visit_preparation',state:'idle',action:'',text:/\bano\b/i.test(utterance) ? 'Dalhin ang available na vaccination o medical records at listahan ng mga gamot. Isulat ang mga alalahanin para sa beterinaryo. Lagyan ng tali ang aso at ilagay ang pusa sa ligtas na carrier; magtanong sa clinic kung may espesyal na paghahanda.' : 'Bring any available vaccination or medical records and a list of medications. Note your concerns for the veterinarian. Keep dogs on a leash and cats in a secure carrier; ask the clinic about any specific preparation.',suggestions:['Clinic information']});
    }
    var priceCorrection = /\b(?:not booking|not (?:a )?booking|only asking|just asking)\b/i.test(utterance) && /\b(?:how much|price|cost|fee|magkano)\b/i.test(utterance);
    var shortPriceFollowup = /^(?:and\s+)?(?:how much (?:is it|does it cost)|what(?:'s| is) (?:the|its) (?:price|cost|fee)|magkano)(?:[?!. ]*)$/i.test(utterance.trim());
    if ((priceCorrection || shortPriceFollowup) && !/\b(?:emergency|urgent|symptom|medicine|dosage)\b/i.test(utterance)) {
      if (priceCorrection) pendingBooking = null;
      var turns = Array.isArray(original.conversation) ? original.conversation : [];
      var prior = turns.filter(function(t) { return t.role === 'user' && t.text && t.text !== utterance; }).slice(-1)[0];
      var found = (Array.isArray(ctx && ctx.services) ? ctx.services : []).filter(function(s) {
        return prior && s && s.active !== false && s.label && String(prior.text).toLowerCase().indexOf(String(s.label).toLowerCase()) !== -1;
      });
      if (found.length === 1 && prior && /\b(?:want to know|information|details|learn)\b/i.test(prior.text) && !/\b(?:book|schedule|reserve|emergency|symptom)\b/i.test(prior.text)) return Promise.resolve({id:'service_price',state:'idle',action:'',text:(priceCorrection ? 'Understood. ' : '') + found[0].label + ': ' + (found[0].price || 'Please contact the clinic for the current fee.') ,suggestions:['What services do you offer?']});
      if (priceCorrection) return Promise.resolve({id:'service_price_clarify',state:'idle',action:'',text:'Understood. Which service would you like the price for?',suggestions:['What services do you offer?']});
    }

    var availability = proposalAvailability(request, ctx);
    // Server-backed proposals must be interpreted against Laravel's current
    // state, not reconstructed from the browser's local booking draft.
    var followUp = availability || (pendingBooking && pendingBooking.serverOwned && Date.now() < pendingBooking.until)
      ? null : bookingContinuation(request, ctx);
    var run;
    try {
      run = availability || (followUp ? Promise.resolve(followUp) : Promise.resolve(activeProvider()(request, ctx)));
    } catch (error) {
      run = Promise.reject(error);
    }

    return withTimeout(run, timeoutMs).then(function (answer) {
      var verdict = validateAnswer(answer);
      if (verdict.ok) {
        updatePendingBooking(request.message, answer);
        return answer;
      }
      var safe = fallbackAnswer(request, ctx);
      updatePendingBooking(request.message, safe);
      return safe;
    }, function () {
      // Rejection or timeout: the deterministic resolver answers.
      var safe = fallbackAnswer(request, ctx);
      updatePendingBooking(request.message, safe);
      return safe;
    });
  }

  // An explicit read-only control for a pending proposal. Only the server's
  // availability result is displayed; no offline schedule is used here.
  function proposalAvailability(request, ctx) {
    if (!/^check available slots[?!. ]*$/i.test(String(request.semanticOriginalMessage || request.message || '').trim())) return null;
    function reply(text) { return {id:'proposal_availability',state:'reminder',action:'',text:text,suggestions:[]}; }
    var draft = pendingBooking;
    if (!draft || Date.now() >= draft.until) { pendingBooking=null; return Promise.resolve(reply('Please start or review a booking proposal first.')); }
    var c = draft.context || {};
    var service = (Array.isArray(ctx && ctx.services) ? ctx.services : []).filter(function(s) { return s && s.active !== false && String(s.value) === String(c.serviceId); });
    if (!c.preferredDate || (State.bookingDateIssue && State.bookingDateIssue(c.preferredDate))) return Promise.resolve(reply('Please choose a specific valid date before checking slots.'));
    if (c.preferredTime && !/^\d{2}:\d{2}$/.test(c.preferredTime)) return Promise.resolve(reply('Please choose a time in the booking form so it can be checked against the available slots.'));
    if (service.length !== 1 || !/^\d+$/.test(String(service[0].serviceId || ''))) return Promise.resolve(reply('Please choose one available clinic service before checking slots.'));
    if (!global.VHSReads || typeof global.VHSReads.availability !== 'function') return Promise.resolve(reply('I cannot check live availability right now. Please try the booking form.'));
    return Promise.resolve(global.VHSReads.availability({date:c.preferredDate,serviceId:service[0].serviceId})).then(function(r) {
      if (pendingBooking !== draft || pendingBooking.context !== c || Date.now() >= draft.until) return reply('The proposal changed or expired. Please review it before checking slots.');
      if (!r || !r.ok || !r.data || r.data.date !== c.preferredDate || !r.data.service || String(r.data.service.serviceId) !== String(service[0].serviceId) || !Array.isArray(r.data.slots)) return reply('I cannot check live availability right now. Please try the booking form.');
      var slots = r.data.slots.filter(function(t) { return typeof t === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t); });
      if (c.earliestTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(c.earliestTime)) slots=slots.filter(function(t){return t > c.earliestTime;});
      if (c.timePreference === 'morning') slots=slots.filter(function(t){return t < '12:00';});
      if (c.timePreference === 'afternoon') slots=slots.filter(function(t){return t >= '12:00' && t < '18:00';});
      if (c.timePreference === 'evening') slots=slots.filter(function(t){return t >= '18:00';});
      if (c.preferredTime && /^\d{2}:\d{2}$/.test(c.preferredTime)) slots=slots.filter(function(t){return t === c.preferredTime;});
      if (!slots.length) return reply('No matching available slots were returned for ' + c.preferredDate + '. Please choose another date or time preference.');
      return reply('Available times for ' + service[0].label + ' on ' + c.preferredDate + ': ' + slots.slice(0,8).join(', ') + (slots.length > 8 ? ' (more in the booking form)' : '') + '. Availability can change; confirm in the booking form. No appointment has been made.');
    }).catch(function(){ return reply('I cannot check live availability right now. Please try the booking form.'); });
  }

  // Phases 3-4: retain the original cards/actions, add advisory booking hints.
  // The backend handles authenticated text questions; browser data/cards
  // never become AI request context. Book/cancel/reschedule remain entirely
  // in the existing UI and Laravel appointment/OTP workflow.
  var authCsrfToken = null;
  var authCsrfRequest = null;

  function csrfForUserVetti() {
    if (authCsrfToken) return Promise.resolve(authCsrfToken);
    if (authCsrfRequest) return authCsrfRequest;
    authCsrfRequest = global.fetch('/api/auth/csrf', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }).then(function (response) {
      if (!response.ok) throw new Error('user-vetti-csrf-unavailable');
      return response.json();
    }).then(function (body) {
      var token = body && body.data && body.data.csrf_token;
      if (typeof token !== 'string' || !token) throw new Error('user-vetti-csrf-missing');
      authCsrfToken = token;
      return token;
    }).then(function (token) {
      authCsrfRequest = null;
      return token;
    }, function (error) {
      authCsrfRequest = null;
      throw error;
    });
    return authCsrfRequest;
  }

  function hasExistingRichUI(answer) {
    if (!isPlainObject(answer)) return false;
    if (answer.action || answer.petCard || answer.petCards || answer.appointment ||
        answer.appointments || answer.service || answer.serviceGroup ||
        answer.serviceCategories || answer.capabilities) return true;
    return false;
  }

  // Phase 4: backend returns *hints*, never executable booking actions.
  // The action remains the trusted local openBooking; existing OTP and
  // server-side availability validation are unchanged.
  var PHASE4_SERVICE_HINTS = [
    'grooming', 'vaccination', 'consultation', 'deworming', 'microchipping',
    'spay', 'neuter', 'boarding', 'confinement', 'dental'
  ];
  var PHASE4_TIME_HINTS = ['morning', 'afternoon', 'evening'];

  // Read-only, client-side guards against a partial deterministic match
  // accidentally selecting one of several services in the user's request.
  // This also protects the offline fallback, before the Laravel classifier
  // is available. Never use these cues to *choose* a medical procedure.
  var PHASE4_WORD_GUARDS = {
    grooming: /\b(?:groom(?:ing)?|bath(?:ing|e)?|wash(?:ed|ing)?|nail trim(?:ming)?|ipa[- ]?groom|magpa[- ]?groom|pa[- ]?groom|paliguan)\b/i,
    vaccination: /\b(?:vaccinat(?:e|ed|ing|ion|ions)|vaccin(?:e|es)|booster|bakuna|magpa[- ]?bakuna|ipa[- ]?bakuna)\b/i,
    consultation: /\b(?:consultation|consult|check[ -]?up)\b/i,
    deworming: /\bdeworm(?:ing)?\b/i,
    microchipping: /\bmicro[ -]?chipp?(?:ing)?\b/i,
    spay: /\bspay(?:ing)?\b/i,
    neuter: /\bneuter(?:ing)?\b/i,
    boarding: /\bboard(?:ing)?\b/i,
    confinement: /\bconfinement\b/i,
    dental: /\b(?:dental|teeth cleaning)\b/i
  };

  function phase4MultipleServices(text) {
    var count = 0;
    for (var name in PHASE4_WORD_GUARDS) {
      if (Object.prototype.hasOwnProperty.call(PHASE4_WORD_GUARDS, name) &&
          PHASE4_WORD_GUARDS[name].test(String(text || '')) && ++count > 1) return true;
    }
    return false;
  }

  // The wizard <select> has options with the canonical VALUE, not the
  // numeric `serviceId`; use value for all new suggestions.
  function phase4CanonicalService(services, valueOrId) {
    var list = Array.isArray(services) ? services : [];
    var hit = list.filter(function (s) {
      return s && (String(s.serviceId) === String(valueOrId) || String(s.value) === String(valueOrId));
    });
    return hit.length === 1 && typeof hit[0].value === 'string' ? hit[0].value : null;
  }

  // A unique owner-selected cat/dog may disambiguate Dog Grooming vs
  // Cat Grooming. But never pick an animal or a medical service by guess.
  function phase4MentionedSpecies(text) {
    var q=String(text||'').toLowerCase();
    // A species that is the patient ('for my cat', 'pusa ko') takes
    // precedence over species words inside service names (Dog Grooming).
    var patient=q.match(/\b(?:for|para sa|sa|ipa-groom (?:yung|ang)|groom (?:my|our))\s+(?:(?:my|the|our|aking|yung|ang|si)\s+)?(cat|cats|kitten|kittens|feline|pusa|pusang|kuting|dog|dogs|puppy|puppies|canine|aso|asong|tuta)\b/i)
      || q.match(/\b(cat|cats|kitten|pusa|pusang|kuting|dog|dogs|puppy|aso|asong|tuta)\s+ko\b/i)
      || q.match(/\b(?:my|our)\s+(cat|cats|kitten|pusa|dog|dogs|puppy|aso)\b/i);
    if (patient) return /^(?:cat|cats|kitten|kittens|feline|pusa|pusang|kuting)$/i.test(patient[1]) ? 'cat' : 'dog';
    var cat=/\b(?:cat|cats|kitten|kittens|feline|pusa|pusang|kuting|mingming)\b/i.test(q);
    var dog=/\b(?:dog|dogs|puppy|puppies|canine|aso|asong|tuta)\b/i.test(q);
    return cat && !dog ? 'cat' : dog && !cat ? 'dog' : null;
  }

  function phase4PetSpecies(ctx, bookingContext, utterance) {
    var named=phase4MentionedSpecies(utterance);
    if (named) return named;
    if (bookingContext && bookingContext.petUnresolved === true) return null;
    var chosenId = bookingContext && bookingContext.petId;
    var pets = Array.isArray(ctx && ctx.pets) ? ctx.pets : [];
    var pet = null;
    if (chosenId !== undefined && chosenId !== null && chosenId !== '') {
      var hits = pets.filter(function (p) {
        return p && String(p.petId !== undefined ? p.petId : p.id) === String(chosenId);
      });
      if (hits.length === 1) pet = hits[0];
    } else if (ctx && ctx.activePet) {
      pet = ctx.activePet;
    }
    var species = String(pet && (pet.species || pet.type) || '').toLowerCase().trim();
    if (/\b(cat|feline)\b/.test(species)) return 'cat';
    if (/\b(dog|canine)\b/.test(species)) return 'dog';
    return null;
  }

  function phase4GroomingMismatch(booking, ctx, utterance) {
    if (!booking || !booking.serviceId || !/groom/i.test(String(booking.serviceId))) return false;
    var services=Array.isArray(ctx&&ctx.services)?ctx.services:[];
    var chosen=phase4CanonicalService(services,booking.serviceId);
    var svc=services.filter(function(s){return s&&String(s.value)===String(chosen);})[0];
    if (!svc) return true;
    var title=String(svc.label||'').toLowerCase();
    var kind=/\bcat\b/.test(title)?'cat':/\bdog\b/.test(title)?'dog':null;
    if (!kind) return false;
    var named=phase4MentionedSpecies(utterance);
    if (named && named!==kind) return true;
    var petId=booking.petId;
    var pets=Array.isArray(ctx&&ctx.pets)?ctx.pets:[];
    var owned=pets.filter(function(p){return p&&String(p.petId!==undefined?p.petId:p.id)===String(petId);});
    if (owned.length===1) {
      var species=String(owned[0].species||owned[0].type||'').toLowerCase();
      if (/\b(?:cat|feline)\b/.test(species) && kind!=='cat')return true;
      if (/\b(?:dog|canine)\b/.test(species) && kind!=='dog')return true;
    }
    return false;
  }

  function phase4CatalogMatch(services, hint, ctx, bookingContext, utterance) {
    if (PHASE4_SERVICE_HINTS.indexOf(hint) === -1) return null;
    var list = Array.isArray(services) ? services : [];
    var words = {
      grooming: /\bgroom(?:ing)?\b/i,
      vaccination: /\b(?:vaccination|vaccinations|vaccinate|vaccine)\b/i,
      consultation: /\bconsult(?:ation)?\b|\bcheck[ -]?up\b/i,
      deworming: /\bdeworm(?:ing)?\b/i,
      microchipping: /\bmicro[ -]?chip(?:ping)?\b/i,
      spay: /\bspay\b/i,
      neuter: /\bneuter\b/i,
      boarding: /\bboard(?:ing)?\b/i,
      confinement: /\bconfinement\b/i,
      dental: /\bdental\b|\bteeth cleaning\b/i
    };
    var matches = list.filter(function (s) {
      return s && s.active !== false &&
        words[hint].test(String(s.label || '') + ' ' + String(s.value || '').replace(/_/g, ' '));
    });
    if (hint === 'grooming' && matches.length > 1) {
      var species = phase4PetSpecies(ctx, bookingContext, utterance);
      var spoken=String(utterance||'');
      // A specifically requested grooming label contradicting the
      // stated patient species is a clarification, not a substitution.
      if (species === 'cat' && /\bdog\s+groom(?:ing)?\b/i.test(spoken) ||
          species === 'dog' && /\bcat\s+groom(?:ing)?\b/i.test(spoken)) return null;
      if (species) {
        matches = matches.filter(function (s) {
          var title = String(s.label || '') + ' ' + String(s.value || '').replace(/_/g, ' ');
          return new RegExp('\\b' + species + '\\b', 'i').test(title);
        });
      }
    }
    if (matches.length !== 1) return null;
    var value = matches[0].value;
    return typeof value === 'string' && value.trim() ? value : null;
  }

  function phase4RemoveUnsafeLocalService(localAnswer, text) {
    if (!isPlainObject(localAnswer) || localAnswer.action !== 'openBooking') return localAnswer;
    if (phase4MultipleServices(text) && isPlainObject(localAnswer.bookingContext)) {
      delete localAnswer.bookingContext.serviceId;
    }
    return localAnswer;
  }

  function phase4ApplyHints(localAnswer, ctx, data, message) {
    if (!isPlainObject(localAnswer) || localAnswer.action !== 'openBooking' ||
        !isPlainObject(data) || data.booking_created !== false ||
        data.requires_confirmation !== true ||
        ['ai', 'rule'].indexOf(data.source) === -1) return localAnswer;
    if (PHASE4_SERVICE_HINTS.concat(['none']).indexOf(data.service_hint) === -1 ||
        PHASE4_TIME_HINTS.concat(['none']).indexOf(data.time_preference) === -1 ||
        typeof data.service_ambiguous !== 'boolean') return localAnswer;
    var current = isPlainObject(localAnswer.bookingContext) ? localAnswer.bookingContext : {};
    var update = {};
    for (var key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) update[key] = current[key];
    }
    // Local veto is also required if a future server regression returns a
    // single service for a plainly conflicting two-service request.
    if (data.service_ambiguous || phase4MultipleServices(message)) {
      // Veto a partial match from the original deterministic resolver.
      delete update.serviceId;
      localAnswer.id = 'booking_service_ambiguous';
      localAnswer.action = '';
      localAnswer.text = 'I found more than one requested service. Please choose one pet and one service to start with. No booking form has been opened.';
      delete localAnswer.bookingContext;
      return localAnswer;
    } else if (data.service_hint !== 'none') {
      var matched = phase4CatalogMatch(ctx && ctx.services, data.service_hint, ctx, update, message);
      // A LOCAL mismatch (e.g. "wash" accidentally selecting Consultation)
      // must not defeat a unique, explicitly mentioned service determined
      // by Laravel. Only override when the original message really contains
      // the suggested category; never trust an unsolicited AI hint.
      var mentioned = PHASE4_WORD_GUARDS[data.service_hint] &&
        PHASE4_WORD_GUARDS[data.service_hint].test(String(message || ''));
      var canonical = update.serviceId
        ? phase4CanonicalService(ctx && ctx.services, update.serviceId) : null;
      if (matched && mentioned) update.serviceId = matched;
      else if (canonical) update.serviceId = canonical;
      else delete update.serviceId;
      if (!update.serviceId) {
        localAnswer.text = 'I could not verify an exact service; please select it in the booking form after reviewing this proposal.';
      }
    }
    if (!update.timePreference && data.time_preference !== 'none') {
      update.timePreference = data.time_preference;
    }
    if (Object.keys(update).length) localAnswer.bookingContext = update;
    else delete localAnswer.bookingContext;
    return localAnswer;
  }

  // Present only verified local context; this is a proposal, NOT a
  // confirmation or availability claim. Never list a different active pet
  // as though it were named in the user's booking request.
  function phase4BookingSummary(answer, ctx, originalMessage) {
    if (!answer || answer.action !== 'openBooking') return answer;
    var c = answer.bookingContext || {};
    // A verified service alias may be resolved using the EXISTING local
    // guard vocabulary and active catalog when Laravel is unavailable.
    // Never let an LLM's unspecified response invent a service.
    if (!c.serviceId && originalMessage && !phase4MultipleServices(originalMessage)) {
      var cues = PHASE4_SERVICE_HINTS.filter(function(k) {
        return PHASE4_WORD_GUARDS[k].test(originalMessage);
      });
      if (cues.length === 1) {
        var canonicalHint = phase4CatalogMatch(ctx && ctx.services, cues[0], ctx, c, originalMessage);
        if (canonicalHint) {
          c = Object.assign({}, c, {serviceId: canonicalHint});
          answer.bookingContext = c;
        }
      }
    }
    var mismatchedGrooming = phase4GroomingMismatch(c,ctx,originalMessage);
    if (mismatchedGrooming) {
      c=Object.assign({},c);
      delete c.serviceId;
      answer.bookingContext=c;
    }
    var pets = Array.isArray(ctx && ctx.pets) ? ctx.pets : [];
    var services = Array.isArray(ctx && ctx.services) ? ctx.services : [];
    var pet = pets.filter(function(p) { return p && String(p.petId !== undefined ? p.petId : p.id) === String(c.petId); });
    var service = services.filter(function(s) { return s && s.active !== false && String(s.value) === String(c.serviceId); });
    var petLabel = pet.length === 1 ? pet[0].name : 'not selected';
    var serviceLabel = service.length === 1 ? service[0].label : 'not selected';
    answer.text = 'Here is what I understood for your proposed appointment:\n'
      + 'Pet: ' + petLabel + '\n'
      + 'Service: ' + serviceLabel + '\n'
      + 'Date: ' + (c.preferredDate || 'not selected') + '\n'
      + 'Time: ' + (c.earliestTime ? 'after ' + c.earliestTime + ' (preference, not a confirmed slot)' : c.preferredTime || (c.timePreference ? c.timePreference + ' preference (not a confirmed slot)' : 'not selected')) + '\n'
      + 'No appointment has been made. Review this summary, then select Continue to Booking to open the existing form. The available times and OTP confirmation are checked there.'
      + (/vaccinat|vaccine|bakuna/i.test(serviceLabel) ? ' A veterinarian must confirm vaccine eligibility and timing.' : '')
      + (mismatchedGrooming ? '\nThe requested grooming service conflicts with the animal type. Please verify the pet and choose the matching service.' : '');
    answer.suggestions = (Array.isArray(answer.suggestions) ? answer.suggestions : []).concat(['Check available slots']);
    return answer;
  }

  function phase4BookingProvider(request, ctx, localAnswer) {
    // Pet identities and names stay in the local resolver. Only text reaches
    // OUR Laravel endpoint; the backend builds provider-safe cue tags.
    return csrfForUserVetti().then(function (csrf) {
      var controller = global.AbortController ? new global.AbortController() : null;
      var timer = global.setTimeout(function () { if (controller) controller.abort(); }, 9000);
      return global.fetch('/api/ai/booking-intent', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {
          'Accept': 'application/json', 'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ message: request.message }),
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        if (response.status === 419) authCsrfToken = null;
        if (!response.ok) throw new Error('booking-intent-unavailable');
        return response.json();
      }).then(function (response) {
        return response && response.success === true
          ? phase4BookingSummary(phase4ApplyHints(localAnswer, ctx, response.data, request.message), ctx, request.message)
          : phase4BookingSummary(localAnswer, ctx, request.message);
      }).finally(function () {
        global.clearTimeout(timer);
      });
    }).catch(function () {
      // No broken booking wizard even if CSRF, provider or network fails.
      return phase4BookingSummary(localAnswer, ctx, request.message);
    });
  }

  // Phase 5 pilot runs BEFORE the keyword resolver for ordinary messages.
  // The server is the only component that can turn a semantic interpretation
  // into a read-only proposal; Gemini cannot send executable UI actions.
  function semanticCandidate(request, ctx) {
    // Frontend opt-in as well as mandatory backend/privacy gates.
    if (global.VHS_SEMANTIC_VETTI !== true || semanticAvailability === false) return Promise.resolve(null);
    return csrfForUserVetti().then(function(csrf) {
      var controller = global.AbortController ? new global.AbortController() : null;
      var timer = global.setTimeout(function() { if (controller) controller.abort(); }, 45000);
      return global.fetch('/api/ai/semantic-vetti', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Accept':'application/json', 'Content-Type':'application/json',
          'X-CSRF-TOKEN':csrf, 'X-Requested-With':'XMLHttpRequest'},
        body: JSON.stringify({message: request.semanticOriginalMessage || request.message, conversation_id: semanticConversationId}),
        signal: controller ? controller.signal : undefined
      }).then(function(response) {
        if (response.status === 419) authCsrfToken = null;
        if (!response.ok) throw new Error('semantic-unavailable');
        return response.json();
      }).then(function(body) {
        var data = body && body.success === true && body.data;
        if (!isPlainObject(data)) return null;
        if (data.mode === 'disabled') { semanticAvailability = false; return null; }
        if (data.mode === 'fallback') {
          return {id:'semantic_unavailable', state:'reminder', suggestions:[],
            text:'I could not process that message with AI right now. Please try again or use the booking and clinic information pages. No appointment was made.'};
        }
        if (data.mode !== 'semantic') return null;
        semanticAvailability = true;
        if (data.kind === 'information' && typeof data.text === 'string' &&
            data.text.length < 1000 && data.text.trim() &&
            ['idle','reminder','concerned'].indexOf(data.state) !== -1) {
          var infoText = data.text;
          if (/Use Book an Appointment/.test(infoText) && /\b(?:grooming|groom|paligo|bath)\b/i.test(request.message)) {
            var groomingServices = (Array.isArray(ctx && ctx.services) ? ctx.services : []).filter(function(service) {
              return service && service.active !== false && /grooming/i.test(String(service.label || ''));
            }).map(function(service) { return service.label; });
            infoText = (groomingServices.length ? 'The clinic lists: ' + groomingServices.join(', ') + '. ' : 'Please check the Services page for current grooming availability. ') + infoText;
          }
          return {id:'semantic_information', state:data.state, text:infoText, suggestions:[]};
        }
        if (data.kind !== 'booking_proposal' || data.booking_created !== false ||
            data.requires_confirmation !== true ||
            typeof data.pet_id !== 'number' || !Number.isSafeInteger(data.pet_id) ||
            typeof data.preferred_date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(data.preferred_date) ||
            PHASE4_SERVICE_HINTS.indexOf(data.service_hint) === -1 ||
            PHASE4_TIME_HINTS.concat(['none']).indexOf(data.time_preference) === -1) return null;
        // Defense in depth: id must be in the already authorized local pet list.
        var pets = Array.isArray(ctx && ctx.pets) ? ctx.pets : [];
        var owned = pets.filter(function(p) {
          return p && String(p.petId !== undefined ? p.petId : p.id) === String(data.pet_id);
        });
        if (owned.length !== 1) return null;
        var date = new Date(data.preferred_date + 'T12:00:00');
        if (isNaN(date.getTime()) ||
            date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0') !== data.preferred_date) return null;
        var context = {petId:String(data.pet_id),preferredDate:data.preferred_date};
        if (data.time_preference !== 'none') context.timePreference = data.time_preference;
        // The AI classification is a suggestion, NOT verified service identity.
        // Only the local owner's active catalog + explicit service vocabulary
        // may prefill. Novel paraphrases still get a useful interpretation,
        // while the form leaves the service unselected for user review.
        var guard = PHASE4_WORD_GUARDS[data.service_hint];
        var matched = guard && guard.test(request.semanticOriginalMessage || request.message)
          ? phase4CatalogMatch(ctx && ctx.services, data.service_hint, ctx, context, request.semanticOriginalMessage || request.message) : null;
        if (matched) context.serviceId = matched;
        var answer = {id:'semantic_booking_proposal',state:'booking',
          action:'openBooking',bookingContext:context,suggestions:[],
          text:'Please review your proposed booking.'};
        phase4BookingSummary(answer, ctx, '');
        if (!matched) {
          answer.text = answer.text.replace('Service: not selected',
            'Service: not selected (possible ' + data.service_hint + '; choose and verify in the form)');
        }
        return answer;
      }).finally(function() { global.clearTimeout(timer); });
    }).catch(function() {
      return {id:'semantic_unavailable', state:'reminder', suggestions:[],
        text:'I could not process that message with AI right now. Please try again or use the booking and clinic information pages. No appointment was made.'};
    });
  }

  function serviceLookupCandidate(request) {
    if (global.VHS_SEMANTIC_VETTI !== true || semanticAvailability === false) return Promise.resolve(null);
    return csrfForUserVetti().then(function(csrf) {
      var controller = global.AbortController ? new global.AbortController() : null;
      var timer = global.setTimeout(function() { if (controller) controller.abort(); }, 45000);
      return global.fetch('/api/ai/service-lookup', {
        method:'POST', credentials:'same-origin', cache:'no-store',
        headers:{'Accept':'application/json','Content-Type':'application/json','X-CSRF-TOKEN':csrf,'X-Requested-With':'XMLHttpRequest'},
        body:JSON.stringify({message:request.semanticOriginalMessage || request.message}),
        signal:controller ? controller.signal : undefined
      }).then(function(response) {
        if (!response.ok) throw new Error('service-lookup-unavailable');
        return response.json();
      }).then(function(body) {
        var data = body && body.success && body.data;
        if (!isPlainObject(data) || data.kind === 'declined') return null;
        if (['answer','unavailable'].indexOf(data.kind) === -1 || typeof data.text !== 'string'
            || !data.text.trim() || data.text.length > 1200 || ['idle','reminder'].indexOf(data.state) === -1) throw new Error('service-lookup-invalid');
        return {id:'verified_service_lookup', state:data.state, text:data.text, suggestions:[]};
      }).finally(function() { global.clearTimeout(timer); });
    }).catch(function() {
      return {id:'verified_service_unavailable',state:'reminder',suggestions:[],
        text:'I cannot reliably check the service catalog right now. Please use the Services page or contact the clinic.'};
    });
  }

  function userBackendProvider(request, ctx) {
    var local = phase4RemoveUnsafeLocalService(deterministicProvider(request, ctx), request.message);
    // Keep booking and sensitive local safety decisions out of this
    // public-only service lookup. Gemini decides which catalog labels match.
    if (!(pendingBooking && pendingBooking.serverOwned && Date.now() < pendingBooking.until)
        && local && !local.action && isPublicServiceDetailQuestion(request.message)) {
      return serviceLookupCandidate(request).then(function(answer) {
        return answer || legacyUserBackendProvider(request,ctx,true);
      });
    }
    if (local && (local.id === 'service_information' || local.id === 'service_price_local' || local.id === 'consultation_information' || local.id === 'tagalog_greeting' || local.id === 'walk_in_policy' || local.id === 'payment_policy' || local.id === 'late_visit_guidance' || (local.id === 'greeting_hello' && /how are you|kumusta ka/i.test(request.message)))) return Promise.resolve(local);
    // Never let provider semantic output overrule a hard local refusal.
    if (local && ['booking_ownership','urgent_safety','booking_invalid_date',
        'booking_invalid_time','action_opt_out','appointment_change_help'].indexOf(local.id) !== -1) {
      return Promise.resolve(local);
    }
    // Defer ordinary follow-ups to the owner-scoped server proposal. The
    // server independently checks safety, ownership, ambiguity and dates.
    if (pendingBooking && pendingBooking.serverOwned && Date.now() < pendingBooking.until) {
      return semanticCandidate(request, ctx).then(function(answer) {
        return answer || {id:'semantic_unavailable',state:'reminder',suggestions:[],
          text:'I could not process that message with AI right now. Please try again or use the booking and clinic information pages. No appointment was made.'};
      });
    }
    if (local && local.id === 'booking_pet_ambiguous') return Promise.resolve(local);
    // Account data cards, actual appointment history and other rich
    // authenticated UI are served locally; no need to interpret with Gemini.
    // Document navigation is an authenticated local portal action, never an LLM reply.
    if (local && (local.id === 'documents' || local.id === 'account_profile')) return Promise.resolve(local);
    // Resolve a short category reply only from the current public catalog.
    if (lastPublicTopic(request.conversation, ctx) === 'services' && local && !local.action) {
      var categoryReply = String(request.message || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      var categoryMatches = (Array.isArray(ctx && ctx.serviceGroups) ? ctx.serviceGroups : []).filter(function (g) {
        var name = String(g && g.name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        return categoryReply.length >= 4 && (name === categoryReply || name.indexOf(categoryReply + ' ') === 0);
      });
      if (categoryMatches.length === 1) {
        var category = categoryMatches[0];
        var names = Array.isArray(category.names) ? category.names.filter(function (n) { return typeof n === 'string' && n.length; }) : [];
        return Promise.resolve({id:'service_category_choice', state:'idle', action:'', suggestions:[], text:names.length ? 'Services under ' + category.name + ': ' + names.join(', ') + '. Which service would you like the price for?' : 'I could not load services in that category. Please check the Services page.'});
      }
    }
    // Category-specific catalog questions should not turn into the full
    // category cards because the frontend saw the word "services".
    var qCategory=String(request.message||'');
    if (local && !local.action && /\b(?:under|category|categories|nasa)\b/i.test(qCategory)
        && /\b(?:services?|serbisyo|serbisyong|under|category|categories)\b/i.test(qCategory)
        && !/\b(?:my|mine|book|appointment|record|medical|emergency|diagnos|treat)\b/i.test(qCategory)) {
      return legacyUserBackendProvider(request,ctx,true);
    }
    if (local && !local.action && /\b(?:how much|price|cost|fee|magkano|presyo)\b/i.test(request.message)
        && isSafeNamedCatalogPrice(request.message,ctx)) {
      return legacyUserBackendProvider(request,ctx,true);
    }
    // Category cards are trusted local UI; keep the existing fast/offline path.
    // Follow-up questions carry a catalog-validated public category hint.
    if (local && local.id === 'services_filtered') return Promise.resolve(local);
    // Stage 1: let Laravel resolve a clearly public individual-service
    // question against the authoritative current catalog. Local UI must not
    // swallow it as a generic services card; protected actions still win.
    if (local && !local.action && isPublicServiceDetailQuestion(request.message)) {
      return legacyUserBackendProvider(request, ctx, true);
    }
    // Pending service choices are public-only and resolved by the Laravel
    // session. Avoid turning a short choice into a generic services card.
    var priorChoiceTopic = lastPublicTopic(request.conversation, ctx);
    if (priorChoiceTopic === 'services' && local && !local.action &&
        (isShortPublicFollowup(request.message) || isCatalogServiceChoice(request.message, ctx))) {
      return legacyUserBackendProvider(request, ctx, true);
    }
    if (local && local.id === 'clinic_info') return Promise.resolve(local);
    // A visit-hours question is not a request to list the user's visits.
    // Restrict this exception to a public-only utterance: no personal details,
    // booking command, pet name, or record may pass through this shortcut.
    if (isPublicVisitingHours(request.message) && local && !local.action) {
      return legacyUserBackendProvider(request, ctx, true);
    }
    // The old local service-price keyword table interprets "How much is it?"
    // as a fresh services card. For an unambiguous public-topic follow-up,
    // prefer the contextual Laravel answer instead; never override actions,
    // owner data, emergencies or protected UI.
    var priorPublicTopic = lastPublicTopic(request.conversation, ctx);
    var shortPublicFollowup = priorPublicTopic && isShortPublicFollowup(request.message);
    if (shortPublicFollowup && local && !local.action &&
        ['services','unmatched','empty','greeting_hello'].indexOf(local.id) !== -1) {
      return legacyUserBackendProvider(request, ctx, true);
    }
    if (hasExistingRichUI(local) && local.action !== 'openBooking' && !(local.capabilities && /\b(?:appointment|book|booking|schedule|grooming|groom|paligo|magpa)\b/i.test(request.message))) return Promise.resolve(local);
    return semanticCandidate(request, ctx).then(function(answer) {
      return answer || legacyUserBackendProvider(request, ctx);
    });
  }

  // Only a public topic label crosses to Laravel; never earlier message text.
  // The authoritative server still validates its public-only allowlist.
  // Needed because the local Vetti UI may have handled the first turn itself.
  function lastPublicCategory(turns, ctx) {
    if (!Array.isArray(turns) || !Array.isArray(ctx && ctx.serviceGroups)) return null;
    for (var i = turns.length - 1; i >= 0; --i) {
      if (turns[i].role !== 'user') continue;
      var q = String(turns[i].text || '').toLowerCase();
      if (/\b(?:book|cancel|reschedule|medical|record|emergency|urgent|password|otp|my pet)\b/.test(q)) return null;
      for (var j = 0; j < ctx.serviceGroups.length; ++j) {
        var name = String(ctx.serviceGroups[j] && ctx.serviceGroups[j].name || '');
        if (name && (' ' + q.replace(/[^a-z0-9]+/g,' ') + ' ').indexOf(' '+name.toLowerCase().replace(/[^a-z0-9]+/g,' ')+' ') !== -1) return name;
      }
      // A short price or translation follow-up may refer to an earlier category.
      if (!isShortPublicFollowup(q)) return null;
    }
    return null;
  }

  function lastPublicTopic(turns, ctx) {
    if (!Array.isArray(turns)) return null;
    var inspected = 0;
    for (var i = turns.length - 1; i >= 0 && inspected < 4; --i) {
      if (turns[i].role !== 'user') continue;
      inspected++;
      var q = String(turns[i].text || '').toLowerCase();
      // Verify recent catalog service/category references against the current
      // public data, not against a list of free-form keyword aliases.
      if (!/\b(?:book|cancel|reschedule|appointment|medical|record|diagnos(?:e|is)|treat|emergency|urgent|password|otp)\b/i.test(q)) {
        var words = ' ' + q.replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
        var services = Array.isArray(ctx && ctx.services) ? ctx.services : [];
        var groups = Array.isArray(ctx && ctx.serviceGroups) ? ctx.serviceGroups : [];
        if (services.some(function(s){var name=String(s&&s.label||'').toLowerCase();return s&&s.active!==false&&name&&words.indexOf(' '+name.replace(/[^a-z0-9]+/g, ' ').trim()+' ')!==-1;}) ||
            groups.some(function(g){var name=String(g&&g.name||'').toLowerCase();return name&&words.indexOf(' '+name.replace(/[^a-z0-9]+/g, ' ').trim()+' ')!==-1;})) return 'services';
      }
      // Last user turn only. Never leap over an unrelated conversation.
      if (/\b(?:services?|serbisyo|grooming|vaccination|deworming)\b/.test(q)) return 'services';
      if (/\b(?:hours?|opening|bukas|anong oras|when do you open)\b/.test(q) || isPublicVisitingHours(q)) return 'hours';
      if (/\b(?:location|address|where is the clinic|saan kayo)\b/.test(q)) return 'location';
      if (/\b(?:clinic info|clinics info|clinic information|clinic details)\b/.test(q)) return 'clinic_info';
      if (/\b(?:visit preparation|prepare for (?:a|the) visit|what to bring)\b/.test(q)) return 'preparation';
      if (isShortPublicFollowup(q) || /^(?:the )?(?:first|second|third|fourth)(?: one| option| service)?[?!. ]*$/.test(q)) continue;
      return null;
    }
    return null;
  }

  function isCatalogServiceChoice(message, ctx) {
    var q = String(message || '').trim().replace(/[?!.,]+$/, '').toLowerCase();
    q = q.replace(/^(?:i (?:mean|choose|pick|want)|the service is)\s+/, '');
    if (q.length > 120 || /\d|@|\b(?:book|appointment|cancel|my|record|diagnosis|symptom)\b/.test(q)) return false;
    return Array.isArray(ctx && ctx.services) && ctx.services.some(function(s) {
      return s && s.active !== false && String(s.label || '').toLowerCase() === q;
    });
  }

  function isSafeNamedCatalogPrice(message,ctx) {
    var q=String(message||'');
    if(q.length>160 || /\b(?:my|mine|medical|record|book|cancel|reschedule|emergency|symptom|diagnos|treat|prescri|otp)\b|@|\d/i.test(q))return false;
    return Array.isArray(ctx&&ctx.services) && ctx.services.some(function(s){
      var label=String(s&&s.label||'').toLowerCase();
      return s&&s.active!==false && label && q.toLowerCase().indexOf(label)!==-1;
    });
  }

  function isPublicServiceDetailQuestion(message) {
    var q = String(message || '').trim();
    if (q.length > 140 || /\b(?:book|reserve|schedule|appointment|cancel|reschedule|my|mine|record|diagnos|treat|symptom|emergency|urgent|otp|password)\b|@|\d/i.test(q)) return false;
    return /^(?:may\s+.{2,80}\s+(?:din\s+)?ba\s+kayo|meron\s+ba\s+kayong\s+.{2,80}|do you\s+(?:have|offer)\s+.{2,80})[?!. ]*$/i.test(q) || /^(?:(?:by the way|btw)[, ]+)?(?:do you (?:offer|have)|does (?:the|your) clinic (?:offer|have)|is (?:there|the service)|what about|how about|tell me about|can you tell me about|may (?:service|serbisyo|ba kayong)|meron ba kayong)\s+.{2,100}\??$/i.test(q);
  }

  function isPublicVisitingHours(message) {
    return /^(?:what time can i visit(?: (?:the clinic|you|there))?|when can i visit(?: (?:the clinic|you|there))?|anong oras (?:ako )?puwedeng pumunta(?: sa clinic)?)[?!. ]*$/i.test(String(message || '').trim());
  }

  function isShortPublicFollowup(message) {
    var q = String(message || '').trim().toLowerCase();
    if (q.length > 115 || /\b(?:my|mine|our|pet|dog|cat|record|appointment status|cancel|reschedule|emergency|urgent|medical|diagnos|medicine|password|otp)\b|\d|@/.test(q)) return false;
    if (/^(?:the )?(?:first|second|third|fourth)(?: one| option| service)?[?!. ]*$/i.test(q)) return true;
    if (/^(?:which one|either|both|what about (?:those|them)|(?:option |number |#)?[1-4])[?!. ]*$/i.test(q)) return true;
    if (/^(?:(?:and|what about|how about|so)\s+)?(?:tomorrow|bukas|today|ngayon|the next day)[?!. ]*$/i.test(q)) return true;
    if (/^(?:magkano(?: po)?(?: (?:yun|yon|iyan|yan|ito|niyan|nyan))?|how much for (?:that|this|it|those))[?!. ]*$/i.test(q)) return true;
    if (/^(?:(?:can you|could you|please)\s+)?(?:explain|say|tell|repeat|translate|rephrase)(?:\s+(?:that|it|this|the answer|those services|the services))?\s+(?:in|sa)\s+(?:tagalog|filipino|english)[?!. ]*$/i.test(q)) return true;
    return /^(?:(?:and|what about|how about|so)\s+)?(?:how much(?: (?:does|do) (?:that|this|it) cost| is (?:it|that|this))?|what (?:is|about) (?:the )?(?:price|cost|fee)|magkano|presyo|where(?: is (?:it|that|the clinic))?|saan|when|what time|anong oras|what about weekends?|weekends?|tell me more|more (?:details|info|information|please)|how can i book it)[?!. ]*$/i.test(q);
  }

  function legacyUserBackendProvider(request, ctx, preferContext) {
    var localAnswer = phase4RemoveUnsafeLocalService(deterministicProvider(request, ctx), request.message);
    if (localAnswer && localAnswer.action === 'openBooking' && phase4MultipleServices(request.message)) {
      return Promise.resolve({id:'booking_service_ambiguous', state:'reminder', action:'',
        text:'You asked for multiple services. Please request one service for one pet at a time.',
        suggestions:['Book an appointment', 'What services do you offer?']});
    }
    // Negated requests / unowned-pet references are safety decisions.
    // Never let a generic text-only backend answer overwrite that refusal.
    if (localAnswer && ['booking_ownership', 'urgent_safety', 'booking_invalid_date',
        'action_opt_out', 'booking_pet_ambiguous', 'appointment_change_help'].indexOf(localAnswer.id) !== -1) return Promise.resolve(localAnswer);
    // Booking instructions are a trusted local FAQ, not an appointments
    // listing or a model instruction. Keep the explanation and suggestions
    // even when the authenticated text endpoint is available.
    if (localAnswer && localAnswer.id === 'booking_help') return Promise.resolve(localAnswer);
    if (localAnswer && (localAnswer.id === 'documents' || localAnswer.id === 'account_profile')) return Promise.resolve(localAnswer);
    if (localAnswer && localAnswer.id === 'clinic_info') return Promise.resolve(localAnswer);
    if (localAnswer && localAnswer.action === 'openBooking') {
      return phase4BookingProvider(request, ctx, localAnswer);
    }
    // Existing pet cards, appointment lists, booking and cancellation
    // actions are intentional and must never be downgraded to plain text.
    var publicQuestion = /\b(work late|after work|after my shift|visit after work|arrange a clinic visit)\b/i.test(request.message);
    // Never intercept an existing action (including booking) for AI, even
    // when the sentence also mentions work hours or a clinic visit.
    if (!preferContext && hasExistingRichUI(localAnswer) && (!publicQuestion || !!localAnswer.action)) return Promise.resolve(localAnswer);
    var id = request.activePet && Number(request.activePet.petId);
    var body = {
      message: request.message,
      responseLanguage: request.responseLanguage,
      conversation_id: semanticConversationId
    };
    var publicTopic = lastPublicTopic(request.conversation, ctx);
    if (publicTopic) body.context_topic = publicTopic;
    // Public catalog category inferred from the user's own immediately prior
    // utterance; the server revalidates it against active configured categories.
    var categoryHint = lastPublicCategory(request.conversation, ctx);
    if (categoryHint && publicTopic === 'services') body.context_category = categoryHint;
    if (Number.isSafeInteger(id) && id > 0) body.pet_id = id;
    // Deliberately NEVER send request.conversation, ctx, pet name,
    // records, document previews, phone/address or booking details.
    return csrfForUserVetti().then(function (csrf) {
      var controller = global.AbortController ? new global.AbortController() : null;
      var timer = global.setTimeout(function () { if (controller) controller.abort(); }, 50000);
      return global.fetch('/api/ai/vetti', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {
          'Accept': 'application/json', 'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf, 'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        if (response.status === 419) authCsrfToken = null;
        if (!response.ok) throw new Error('user-vetti-unavailable');
        return response.json();
      }).then(function (result) {
        var answer = result && result.success && result.data;
        if (!isPlainObject(answer) || answer.source === 'fallback' ||
            typeof answer.text !== 'string' || !answer.text.trim() ||
            answer.text.length > 1200 || typeof answer.state !== 'string' ||
            answer.action || answer.bookingContext || answer.petCards || answer.appointments) {
          throw new Error('user-vetti-invalid-response');
        }
        // Text-only: a model cannot send executable UI actions or cards.
        return { text: answer.text, state: answer.state, suggestions: [] };
      }).finally(function () {
        global.clearTimeout(timer);
      });
    });
  }

  // Only turn on the network seam on the authenticated User portal. In a
  // test harness or offline page, the original deterministic provider stays.
  if (typeof global.fetch === 'function' && global.location &&
      /^\/user\//.test(global.location.pathname || '')) {
    setProvider(userBackendProvider);
  }

  global.VettiAI = {
    ask: ask,
    buildRequest: buildRequest,
    validateAnswer: validateAnswer,
    recordTurn: recordTurn,
    getHistory: getHistory,
    clearHistory: clearHistory,
    setProvider: setProvider,
    resetProvider: resetProvider,
    ALLOWED_ACTIONS: ALLOWED_ACTIONS,
    MAX_HISTORY: MAX_HISTORY,
    version: '5.7.0-semantic-pilot'
  };
})(window);
