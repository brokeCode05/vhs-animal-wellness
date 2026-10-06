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

   NO network call, NO provider key, NO backend endpoint exists here.
   setProvider()/resetProvider() let tests inject a fake provider
   (valid answer, rejection, timeout, malformed shape); production
   call sites never learn which provider is active.

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
  var DEFAULT_TIMEOUT_MS = 8000;

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
        'preferredTime', 'timePreference'];
      var cleaned = {};
      var k;
      for (k = 0; k < allowedBookingKeys.length; k++) {
        var key = allowedBookingKeys[k];
        var value = answer.bookingContext[key];
        if (value === undefined || value === null || value === '') continue;
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
      request = buildRequest(seed, ctx);
    } catch (error) {
      // Request building is the caller's data, not trusted input: if
      // it cannot be built, answer deterministically with what we have.
      return Promise.resolve(fallbackAnswer({ message: '', conversation: [] }, ctx));
    }

    var opts = isPlainObject(options) ? options : {};
    var timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

    var run;
    try {
      run = Promise.resolve(activeProvider()(request, ctx));
    } catch (error) {
      run = Promise.reject(error);
    }

    return withTimeout(run, timeoutMs).then(function (answer) {
      var verdict = validateAnswer(answer);
      if (verdict.ok) return answer;
      return fallbackAnswer(request, ctx);
    }, function () {
      // Rejection or timeout: the deterministic resolver answers. The
      // provider's error never reaches the chat.
      return fallbackAnswer(request, ctx);
    });
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
    version: '5.1.2'
  };
})(window);
