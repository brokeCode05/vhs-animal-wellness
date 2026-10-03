/* ============================================================
   VETTISTATE — Vetti conversation state model (frontend only)
   ============================================================

   Everything Vetti "knows" in this phase lives here, in ONE place,
   so no other Vetti file re-derives it:

   1. MASCOT ASSETS — the single state → approved PNG mapping.
   2. STATE MODEL — the deterministic states Vetti can be in.
   3. INTENTS — a local keyword matcher that produces a scripted
      reply + state. NOT an LLM. No network call is ever made.
   4. FLAGS — first-time intro / warm-line rotation, persisted so
      the long introduction is not repeated on every login.

   PRODUCT RULE: Vetti is the ASSISTED route. Traditional User
   pages stay available for full manual control.

   HONESTY RULE (project standard): Vetti never implies a backend
   call, a saved record, a booking or an AI inference happened when
   it did not. Replies that would need a backend or an LLM say so
   plainly instead of pretending.

   v2.0.0
   ============================================================ */
(function (global) {
  'use strict';

  // ── 1. MASCOT ASSETS ──────────────────────────────────────────────────
  // Approved canonical assets, unchanged names. Paths are relative to
  // /user/, where this portal lives.
  var ASSET_DIR = '../shared/assets/vetti/';

  // The one canonical mapping. Everything else in Vetti asks for a
  // STATE and receives a path from here — nothing else hardcodes a
  // filename. TODO(AI): add states that need expressions we did not
  // ship yet; do not substitute a generic bot icon.
  var MASCOT_BY_STATE = {
    greeting:        ASSET_DIR + 'vetti-greeting.png',
    idle:            ASSET_DIR + 'vetti-idle-a.png',
    idle_alt:        ASSET_DIR + 'vetti-idle-b.png',
    listening:       ASSET_DIR + 'vetti-listening.png',
    thinking:        ASSET_DIR + 'vetti-thinking-a.png',
    thinking_alt:    ASSET_DIR + 'vetti-thinking-b.png',
    // §10: ONE add-pet state covers both zero-pet onboarding and the
    // "add another pet" flow. Same approved PNG — no new asset, and the
    // earlier split into no_pet/add_pet is gone.
    add_pet:         ASSET_DIR + 'vetti-add-pet.png',
    pet_profile:     ASSET_DIR + 'vetti-pet-profile.png',
    booking:         ASSET_DIR + 'vetti-booking.png',
    success:         ASSET_DIR + 'vetti-success.png',
    excited:         ASSET_DIR + 'vetti-excited.png',
    reminder:        ASSET_DIR + 'vetti-reminder.png',
    concerned:       ASSET_DIR + 'vetti-concerned.png',
    error:           ASSET_DIR + 'vetti-error.png',
    apology:         ASSET_DIR + 'vetti-apology.png'
  };

  // Meaningful alt text. Vetti is a character, so the alt describes the
  // expression rather than naming a file — a screen reader should hear
  // "Vetti looks concerned", not "vetti-concerned.png".
  var ALT_BY_STATE = {
    greeting:     'Vetti the pet-care assistant, smiling in greeting',
    idle:         'Vetti the pet-care assistant',
    idle_alt:     'Vetti the pet-care assistant',
    listening:    'Vetti the pet-care assistant, listening',
    thinking:     'Vetti the pet-care assistant, thinking',
    thinking_alt: 'Vetti the pet-care assistant, thinking',
    add_pet:      'Vetti the pet-care assistant, ready to help add a pet',
    pet_profile:  'Vetti the pet-care assistant, holding a pet profile card',
    booking:      'Vetti the pet-care assistant with a calendar',
    success:      'Vetti the pet-care assistant, pleased',
    excited:      'Vetti the pet-care assistant, excited',
    reminder:     'Vetti the pet-care assistant, offering a reminder',
    concerned:    'Vetti the pet-care assistant, looking concerned',
    error:        'Vetti the pet-care assistant, apologising',
    apology:      'Vetti the pet-care assistant, apologising'
  };

  function mascotFor(state) {
    return MASCOT_BY_STATE[state] || MASCOT_BY_STATE.idle;
  }

  function altFor(state) {
    return ALT_BY_STATE[state] || ALT_BY_STATE.idle;
  }

  // ── 2. STATE MODEL ────────────────────────────────────────────────────
  // Vetti is ONE assistant with ONE visual home (the Vetti Stage). These
  // states therefore describe the STAGE, not individual chat messages.
  //
  //   motion — one reusable motion class (see vetti.css), applied to the
  //            stage mascot. All disabled under prefers-reduced-motion.
  //   label  — the short caption shown under the stage mascot.
  //
  // §9 CORE RULE: state changes, layout stays stable. There is no longer
  // a per-message "featured" mascot tier or a per-message bubble tint —
  // the conversation layout must NOT jump every time Vetti changes state.
  // Only the stage expression, caption and micro-animation change.
  var STATES = {
    idle:       { motion: 'vetti-motion-breathe', label: 'Ready when you are' },
    greeting:   { motion: 'vetti-motion-enter',   label: 'Hello' },
    listening:  { motion: 'vetti-motion-listen',  label: 'Listening' },
    thinking:   { motion: 'vetti-motion-think',   label: 'Let me check…' },
    success:    { motion: 'vetti-motion-enter',   label: 'All set' },
    excited:    { motion: 'vetti-motion-enter',   label: 'Happy to help' },
    reminder:   { motion: 'vetti-motion-breathe', label: 'Worth a look' },
    concerned:  { motion: 'vetti-motion-breathe', label: 'Let’s be careful here' },
    apology:    { motion: 'vetti-motion-breathe', label: 'I didn’t quite catch that' },
    error:      { motion: 'vetti-motion-enter',   label: 'Something went wrong' },
    add_pet:    { motion: 'vetti-motion-enter',   label: 'Let’s add a pet' },
    booking:    { motion: 'vetti-motion-enter',   label: 'Appointments' },
    pet_profile:{ motion: 'vetti-motion-breathe', label: 'Pet profile' }
  };

  function isState(name) {
    return Object.prototype.hasOwnProperty.call(STATES, name);
  }

  function labelFor(state) {
    return (STATES[state] && STATES[state].label) || '';
  }

  // Reusable motion class for this state (see vetti.css, MOTION).
  function motionFor(state) {
    return (STATES[state] && STATES[state].motion) || '';
  }

  // §11: thinking is TRANSIENT. It may never be an intent's resting state,
  // or the stage would sit in "thinking" forever and read as though the
  // answer were still being produced. Any intent that wants it must be
  // normalised here rather than in each reply.
  function restingState(state) {
    return state === 'thinking' ? 'idle' : state;
  }

  // Reusable motion class for this state (see vetti.css, §MOTION).
  function motionFor(state) {
    return (STATES[state] && STATES[state].motion) || '';
  }

  // ── 3. INTENTS (deterministic, local, no LLM) ─────────────────────────
  // Each intent is a list of lowercase keywords. First match wins, so
  // order matters: more specific intents are listed first. The reply is
  // a function of the OWNER + PETS so the answer is always consistent
  // with the data actually on screen.
  //
  // TODO(AI): replace this table with a real assistant call. Until then
  // every answer is a fixed script — nothing here is inference.
  var INTENTS = [
    {
      id: 'greeting_hello',
      state: 'excited',
      keywords: ['hello', 'hi', 'hey', 'kumusta', 'good morning', 'good afternoon', 'good evening'],
      reply: function (ctx) {
        return {
          text: greetingWord() + ', ' + ctx.firstName + '! What can I help you with today?',
          suggestions: ctx.hasPets ? ctx.suggestionsWithPet : ctx.suggestionsNoPet
        };
      }
    },
    {
      id: 'booking',
      state: 'booking',
      keywords: ['book', 'booking', 'schedule', 'appointment', 'reschedule', 'magreserv', 'schedule ng'],
      reply: function (ctx) {
        if (!ctx.hasPets) {
          return {
            text: 'I can take you through booking once you have a pet on file. '
                + 'Let\u2019s add your first pet first \u2014 it only takes a moment.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }
        // TODO(BACKEND): real availability, smart scheduling and slot
        // locking do not exist yet. Say so rather than implying a booking.
        return {
          text: 'I can help you get to the right clinic hours, but live availability '
              + 'and real booking are not connected yet. For now I can take you to '
              + 'My Appointments, where your current visits are listed.',
          suggestions: ['Show my appointments', 'What services do you offer?']
        };
      }
    },
    {
      id: 'appointments',
      state: 'reminder',
      keywords: ['appointment', 'appointments', 'visit', 'visits', 'upcoming'],
      reply: function (ctx) {
        if (!ctx.hasPets) {
          return {
            text: 'There are no appointments yet \u2014 because there are no pets on file. '
                + 'Add your first pet and I can help from there.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }
        return {
          // TODO(BACKEND): read the owner's real appointment list from the API.
          text: 'Your upcoming visits are shown on My Appointments. I do not have live '
              + 'access to them yet, so please open that page for the current list.',
          suggestions: ['Tell me about my pets', 'What services do you offer?']
        };
      }
    },
    {
      id: 'add_pet',
      state: 'add_pet',
      keywords: ['add pet', 'add a pet', 'new pet', 'register pet', 'magdagdag', 'addpet',
                'i want to add', 'another pet', 'add another', 'second pet', 'help me add',
                'register another'],
      reply: function (ctx) {
        // The SAME compact form opens either way. Vetti is the assisted
        // route; My Pets stays available as the manual fallback, but it is
        // not where this conversation sends the user first.
        if (ctx.hasPets) {
          return {
            text: 'Sure. I only need the basics for now \u2014 name and species. '
                + 'You can fill in the rest on My Pets whenever you like.',
            state: 'add_pet',
            action: 'openPetForm',
            suggestions: []
          };
        }
        return {
          text: 'Let\u2019s add your first pet. Just a name and a species to begin \u2014 '
              + 'you can fill in the rest later.',
          state: 'add_pet',
          action: 'openPetForm',
          suggestions: []
        };
      }
    },
    {
      id: 'pet_profile',
      state: 'pet_profile',
      keywords: ['my pet', 'my pets', 'pet info', 'about my', 'tell me about', 'profile', 'who is', 'pababa'],
      reply: function (ctx) {
        if (!ctx.hasPets) {
          return {
            text: 'There is no pet profile to show yet. Add your first pet and I can '
                + 'summarise it here.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }
        var active = ctx.activePet;
        return {
          text: ctx.petSummary(active),
          petCard: active,
          suggestions: ctx.pets.length > 1
            ? ['Show me another pet', 'I want to book an appointment']
            : ['I want to book an appointment', 'What services do you offer?']
        };
      }
    },
    {
      id: 'services',
      state: 'idle',   // §11: never rest in thinking
      keywords: ['service', 'services', 'price', 'prices', 'cost', 'how much', 'serbisyo'],
      reply: function () {
        // TODO(BACKEND): pull the live catalogue from GET /services.
        return {
          text: 'The clinic offers consultations, vaccinations, grooming and wellness '
              + 'checks. The full list with current prices is on the Services page \u2014 '
              + 'I do not have a live price list connected yet.',
          suggestions: ['Show me my pets', 'Show my appointments']
        };
      }
    },
    {
      id: 'vaccination',
      state: 'reminder',
      keywords: ['vaccine', 'vaccination', 'vaccines', 'shots', 'bakuna'],
      reply: function () {
        // TODO(AI): vaccination intelligence is explicitly out of scope.
        return {
          text: 'Vaccination reminders come from your pet\u2019s records, which I cannot '
              + 'read yet. Please check Documents, or ask the clinic during your next visit.',
          suggestions: ['Show my documents', 'Talk to the clinic']
        };
      }
    },
    {
      id: 'documents',
      state: 'idle',   // §11: never rest in thinking
      keywords: ['document', 'documents', 'record', 'records', 'result', 'results'],
      reply: function () {
        // TODO(BACKEND): no document retrieval yet.
        return {
          text: 'Documents issued after a consultation appear on My Documents. '
              + 'I cannot open them for you yet \u2014 please use that page.',
          suggestions: ['Show my appointments', 'What can Vetti do?']
        };
      }
    },
    {
      id: 'sick',
      state: 'concerned',
      keywords: ['sick', 'ill', 'fever', 'vomit', 'vomiting', 'cough', 'hurt', 'pain',
                'not eating', 'diarrhea', 'limping', 'sakit'],
      reply: function () {
        // TODO(AI): triage and medical advice are out of scope by design.
        return {
          text: 'I am not able to assess symptoms or give medical advice \u2014 a '
              + 'veterinarian has to do that. Please call the clinic so they can advise '
              + 'you properly. If your pet seems seriously unwell, treat it as urgent.',
          suggestions: ['Show my appointments', 'Talk to the clinic']
        };
      }
    },
    {
      id: 'thanks',
      state: 'success',
      keywords: ['thanks', 'thank you', 'salamat', 'salamat'],
      reply: function (ctx) {
        return {
          text: 'Happy to help, ' + ctx.firstName + '. I am here whenever you need me.',
          suggestions: ctx.suggestionsWithPet
        };
      }
    },
    {
      id: 'bye',
      state: 'idle',
      keywords: ['bye', 'goodbye', 'see you', 'paalam'],
      reply: function () {
        return { text: 'Take care \u2014 I am here whenever you need me.', suggestions: [] };
      }
    },
    {
      id: 'capabilities',
      state: 'idle',   // §11: never rest in thinking
      keywords: ['what can you do', 'help', 'who are you', 'what are you', 'about you', 'kayang'],
      reply: function (ctx) {
        return {
          text: 'I am Vetti, the VHS pet-care assistant. I can add a pet for you, show '
              + 'the pets on your account and point you to appointments, documents and '
              + 'services. Booking and live records are not connected yet.',
          suggestions: ctx.hasPets ? ctx.suggestionsWithPet : ctx.suggestionsNoPet
        };
      }
    }
  ];

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // The single resolver. Returns { id, state, text, suggestions, ... }.
  // An unmatched message is a deterministic "I did not understand" with
  // the closest useful next step — never an invented answer.
  function resolve(message, ctx) {
    var q = normalize(message);
    if (!q) {
      return { id: 'empty', state: 'idle', text: 'Type a message and I will do my best.', suggestions: ctx.suggestionsWithPet };
    }
    for (var i = 0; i < INTENTS.length; i++) {
      var intent = INTENTS[i];
      for (var k = 0; k < intent.keywords.length; k++) {
        if (q.indexOf(intent.keywords[k]) !== -1) {
          var answer = intent.reply(ctx) || {};
          return {
            id: intent.id,
            state: answer.state || intent.state || 'idle',
            text: answer.text || '',
            suggestions: answer.suggestions || [],
            action: answer.action || '',
            petCard: answer.petCard || null
          };
        }
      }
    }
    return {
      id: 'unmatched',
      state: 'apology',
      text: 'I did not quite catch that. I can help with your pets, appointments, '
          + 'documents and services \u2014 try one of the suggestions below.',
      suggestions: ctx.hasPets ? ctx.suggestionsWithPet : ctx.suggestionsNoPet
    };
  }

  // ── 4. TIME-AWARE GREETING ────────────────────────────────────────────
  // Browser-local time (this phase has no server clock to read).
  function greetingWord(now) {
    var h = (now || new Date()).getHours();
    if (h >= 5 && h <= 11) return 'Good morning';
    if (h >= 12 && h <= 17) return 'Good afternoon';
    return 'Good evening';   // 18:00-04:59
  }

  // ── 5. WARM SUPPORTING LINE ───────────────────────────────────────────
  // Understated, and deliberately NOT inspirational. The choice is pinned
  // per owner per day in sessionStorage, so it cannot change while the page
  // is open, and it rotates the next day/session.
  var WARM_LINES = [
    'I\u2019m here whenever you need help with your pet\u2019s care.',
    'Hope you and {pet} are having a good day.',
    'Ask me anything about {pet}\u2019s care.',
    'Happy to help whenever you need it.'
  ];

  function dayKey(now) {
    var d = now || new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function warmLine(ownerId, petName, now) {
    var key = 'vetti.warm.' + ownerId + '.' + dayKey(now);
    var stored = null;
    try { stored = sessionStorage.getItem(key); } catch (e) { stored = null; }
    if (stored) return fillLine(stored, petName);

    // Deterministic pick from owner + day, so it is stable without storage too.
    var idx = (hash(String(ownerId) + '|' + dayKey(now))) % WARM_LINES.length;
    var chosen = WARM_LINES[idx];
    try { sessionStorage.setItem(key, chosen); } catch (e) { /* private mode */ }
    return fillLine(chosen, petName);
  }

  function fillLine(line, petName) {
    if (line.indexOf('{pet}') === -1) return line;
    return petName ? line.replace(/\{pet\}/g, petName) : 'Hope you are having a good day.';
  }

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  // ── 6. FLAGS ──────────────────────────────────────────────────────────
  // localStorage = "has ever met Vetti" (survives logout/login).
  // sessionStorage = "intro already shown this session" (survives nav).
  var LS_SEEN = 'vetti.seenIntro';
  var SS_SHOWN = 'vetti.introShown';

  function safeGet(store, key) {
    try { return store.getItem(key); } catch (e) { return null; }
  }
  function safeSet(store, key, value) {
    try { store.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function safeRemove(store, key) {
    try { store.removeItem(key); } catch (e) { /* private mode */ }
  }

  // True only the very first time this browser meets Vetti.
  function isFirstTime() {
    return safeGet(localStorage, LS_SEEN) !== '1';
  }

  function markSeenForever() {
    safeSet(localStorage, LS_SEEN, '1');
  }

  function introShownThisSession() {
    return safeGet(sessionStorage, SS_SHOWN) === '1';
  }

  function markIntroShown() {
    safeSet(sessionStorage, SS_SHOWN, '1');
  }

  function clearIntroShown() {
    safeRemove(sessionStorage, SS_SHOWN);
  }

  // QA / support helper: forget Vetti completely.
  function resetIntro() {
    safeRemove(localStorage, LS_SEEN);
    safeRemove(sessionStorage, SS_SHOWN);
  }

  global.VettiState = {
    ASSET_DIR: ASSET_DIR,
    mascotFor: mascotFor,
    altFor: altFor,
    STATES: STATES,
    isState: isState,
    labelFor: labelFor,
    motionFor: motionFor,
    restingState: restingState,
    resolve: resolve,
    greetingWord: greetingWord,
    warmLine: warmLine,
    isFirstTime: isFirstTime,
    markSeenForever: markSeenForever,
    introShownThisSession: introShownThisSession,
    markIntroShown: markIntroShown,
    clearIntroShown: clearIntroShown,
    resetIntro: resetIntro
  };
})(window);