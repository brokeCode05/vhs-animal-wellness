/* ============================================================
   VETTISTATE — Vetti conversation state model (frontend only)
   ============================================================

   Everything Vetti "knows" in this phase lives here, in ONE place,
   so no other Vetti file re-derives it:

   1. MASCOT ASSETS — the single state → approved PNG mapping.
   2. STATE MODEL — the deterministic states Vetti can be in.
   3. INTENTS — a local keyword matcher that produces a scripted
      reply + state. NOT an LLM. No network call is ever made.
   4. FLAGS — first-time welcome / warm-line rotation, persisted so
      the welcome layer is not repeated on every login.

   PRODUCT RULE: Vetti is the ASSISTED route. Traditional User
   pages stay available for full manual control.

   HONESTY RULE (project standard): Vetti never implies a backend
   call, a saved record, a booking or an AI inference happened when
   it did not. Replies that would need a backend or an LLM say so
   plainly instead of pretending.

   v4.2.0
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

  // The CHAT AVATAR is deliberately NOT one of the expressions above.
  // It is Vetti's fixed identity beside every normal message, so it has
  // its own dedicated asset and never switches with state. Keeping it
  // here means no other file ever hardcodes a filename.
  var CHAT_AVATAR = ASSET_DIR + 'vetti-chat-head.png';

  function chatAvatarFor() {
    return CHAT_AVATAR;
  }

  function mascotFor(state) {
    return MASCOT_BY_STATE[state] || MASCOT_BY_STATE.idle;
  }

  function altFor(state) {
    return ALT_BY_STATE[state] || ALT_BY_STATE.idle;
  }

  // ── 2. STATE MODEL ────────────────────────────────────────────────────
  // These states describe the MAIN VETTI PRESENCE only — the compact
  // mascot near the top of the conversation. They never affect a message
  // avatar: every Vetti message uses the one canonical chat avatar.
  //
  //   motion — one reusable motion class (see vetti.css). All disabled
  //            under prefers-reduced-motion.
  //
  // There is deliberately NO permanent label per state. A caption like
  // "All set" or "Pet profile" is only meaningful while something is
  // actually happening; a static one is noise. Transient status text
  // (thinking / saving) is owned by the UI, not here.
  //
  // CORE RULE: state changes, layout stays stable. Changing state swaps
  // the presence artwork and its micro-animation; nothing in the
  // conversation reflows.
  var STATES = {
    idle:       { motion: 'vetti-motion-breathe' },
    greeting:   { motion: 'vetti-motion-enter' },
    listening:  { motion: 'vetti-motion-listen' },
    thinking:   { motion: 'vetti-motion-think' },
    success:    { motion: 'vetti-motion-enter' },
    excited:    { motion: 'vetti-motion-enter' },
    reminder:   { motion: 'vetti-motion-breathe' },
    concerned:  { motion: 'vetti-motion-breathe' },
    apology:    { motion: 'vetti-motion-breathe' },
    error:      { motion: 'vetti-motion-enter' },
    add_pet:    { motion: 'vetti-motion-enter' },
    booking:    { motion: 'vetti-motion-enter' },
    pet_profile:{ motion: 'vetti-motion-breathe' }
  };

  function isState(name) {
    return Object.prototype.hasOwnProperty.call(STATES, name);
  }

  // Reusable motion class for this state (see vetti.css, MOTION).
  function motionFor(state) {
    return (STATES[state] && STATES[state].motion) || '';
  }

  // §11: thinking is TRANSIENT. It may never be an intent's resting state,
  // or the header mascot would sit in "thinking" forever and read as
  // though the answer were still being produced. Any intent that wants it
  // must be normalised here rather than in each reply.
  function restingState(state) {
    return state === 'thinking' ? 'idle' : state;
  }

  // Reusable motion class for this state (see vetti.css, §MOTION).
  function motionFor(state) {
    return (STATES[state] && STATES[state].motion) || '';
  }

  // ── 3. INTENTS (deterministic, local, no LLM) ─────────────────────────
  // Each intent is a list of lowercase keywords. First match wins, so
  // ORDER IS LOAD-BEARING:
  //
  //   booking  ABOVE  appointments, and booking never lists the bare word
  //   "appointment". Otherwise "Show my appointments" would be answered
  //   with the booking script.
  //
  //   add_pet  ABOVE  another_pet. "Help me add another pet" contains
  //   both "add another" and "another pet", so the form intent has to be
  //   reached first — and "Show me another pet" matches none of its
  //   keywords, so it falls through to another_pet instead of opening
  //   the add-pet form. That was the bug.
  //
  // The reply is a function of the OWNER + PETS + the data the UI already
  // read, so the answer is always consistent with what is on screen.
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
      // Actions ON an existing visit. Listed ABOVE booking and
      // appointments so "I need to reschedule" cannot be swallowed by the
      // booking script, and "Show my upcoming appointment" cannot be
      // answered with the whole list.
      //
      // KAN-50 owns the real mutation. In V1 every one of these identifies
      // the visit, says what is currently booked, and hands off to the
      // portal's own UI \u2014 it never claims the change was made.
      id: 'appointment_actions',
      state: 'reminder',
      // Bare "reschedule" / "cancel" are listed because matching is a
      // SUBSTRING test: "reschedule" contains "schedule", so before these
      // were here a plain reschedule request matched NO keyword on this
      // intent, fell through, and was answered by booking via its
      // "schedule" keyword. Order still puts this intent above booking,
      // and the bare word never appears in the booking keyword list.
      keywords: ['upcoming appointment', 'next appointment', 'i need to reschedule',
                'reschedule', 'i need to cancel', 'cancel', 'cancel this',
                'what should i prepare', 'prepare for'],
      reply: function (ctx) {
        var next = ctx.appointments && ctx.appointments.upcoming.length
          ? ctx.appointments.upcoming[0] : null;

        if (!ctx.hasPets) {
          return {
            text: 'Before we look at visits, let\u2019s add your first pet so I know '
                + 'who the appointment is for.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }

        var q = ctx.query || '';
        var wantsReschedule = q.indexOf('reschedul') !== -1;
        var wantsCancel = q.indexOf('cancel') !== -1;
        var wantsPrep = q.indexOf('prepare') !== -1;

        if (wantsReschedule || wantsCancel) {
          if (!next) {
            return {
              text: 'There is no upcoming visit to ' + (wantsCancel ? 'cancel' : 'reschedule')
                  + ' right now, so there is nothing to change.',
              suggestions: ['Show my appointments', 'I want to book an appointment']
            };
          }
          return {
            text: (wantsCancel ? 'Your next visit is ' : 'To reschedule, your next visit is ')
                + next.pet + ' \u00b7 ' + next.service + ' \u2014 ' + next.date + ', '
                + next.time + '. I can\u2019t change it from here yet, so this opens '
                + 'the clinic\u2019s own ' + (wantsCancel ? 'cancellation' : 'reschedule')
                + ' screen for you to confirm.',
            appointment: next,
            action: wantsCancel ? 'openCancel' : 'openReschedule',
            suggestions: ['Show my appointments', 'What services do you offer?']
          };
        }

        if (wantsPrep) {
          // HONESTY: what to bring is clinic policy, and it is not in any
          // record this page can read. Say so rather than inventing it.
          return {
            text: 'What to bring depends on the visit. I do not have the clinic\u2019s '
                + 'preparation notes yet \u2014 please ask at the front desk, or call '
                + 'ahead using the details on Clinic Info.',
            suggestions: ['Show my appointments', 'What services do you offer?']
          };
        }

        if (!next) {
          return {
            text: 'You have no upcoming visit booked right now.',
            suggestions: ['Show my appointments', 'I want to book an appointment']
          };
        }
        return {
          text: 'Your next visit is ' + next.pet + ' \u00b7 ' + next.service + '.',
          appointment: next,
          suggestions: ['I need to reschedule', 'I need to cancel',
                        'What should I prepare?']
        };
      }
    },
    {
      id: 'booking',
      state: 'booking',
      // NOTE: no bare "appointment" here — see the order note above, and
      // "reschedule" belongs to the appointment_actions intent above.
      keywords: ['book', 'booking', 'schedule', 'magreserv'],
      reply: function (ctx) {
        // ZERO-PET GATE: never move a booking request toward scheduling
        // until the owner has a pet to book FOR.
        if (!ctx.hasPets) {
          return {
            text: 'Before we book a visit, let\u2019s add your first pet so I know '
                + 'who the appointment is for.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }
        // TODO(BACKEND): real availability, smart scheduling and slot
        // locking do not exist yet. KAN-50 replaces this with the
        // deterministic booking tools. Until then Vetti routes to the
        // portal's own booking flow rather than pretending to book.
        var who = (ctx.activePet && ctx.activePet.name) || 'your pet';
        var reply = {
          text: 'I can help you get started with an appointment for ' + who + '. '
              + 'Vetti booking is not connected yet, so I\u2019ll open the existing '
              + 'booking flow for now.',
          action: 'openBooking',
          suggestions: ['What services do you offer?', 'Show my appointments']
        };
        // High-confidence conversational context rides ALONG the same
        // action so the existing wizard can prefill. Nothing here books,
        // holds a slot or claims availability; with nothing safe to
        // extract the reply is the plain openBooking it always was.
        var bookingContext = extractBookingContext(ctx.query, ctx);
        if (bookingContext) reply.bookingContext = bookingContext;
        return reply;
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
        var up = ctx.appointments ? ctx.appointments.upcoming.length : 0;
        return {
          // TODO(BACKEND): read the owner's real appointment list from the
          // API instead of the shared demo store. Until then the card
          // below is the SAME list My Appointments renders, not a
          // paraphrase of it, and the wording says so.
          text: up
            ? 'You have ' + up + (up === 1 ? ' upcoming visit' : ' upcoming visits')
              + ' on your account.'
            : 'You have no upcoming visits right now.',
          appointments: true,
          suggestions: ['Show my upcoming appointment', 'I need to reschedule',
                        'I need to cancel', 'What should I prepare?']
        };
      }
    },
    {
      id: 'add_pet',
      state: 'add_pet',
      // "another pet" is deliberately NOT a keyword here. It was the root
      // of the "Show me another pet opens the form" bug — the form
      // intent claimed the phrase before the list intent could.
      keywords: ['add pet', 'add a pet', 'new pet', 'register pet', 'magdagdag', 'addpet',
                'i want to add', 'another pet to add', 'add another', 'second pet',
                'help me add', 'register another'],
      reply: function (ctx) {
        // The SAME compact form opens either way. Vetti is the assisted
        // route; My Pets stays available as the manual fallback, but it is
        // not where this conversation sends the user first.
        if (ctx.hasPets) {
          return {
            text: 'Sure. I only need the basics for now \u2014 name, species, breed, '
                + 'sex and age. You can add the rest on My Pets whenever you like.',
            state: 'add_pet',
            action: 'openPetForm',
            suggestions: []
          };
        }
        return {
          text: 'Let\u2019s add your first pet. I just need the basics to begin \u2014 '
              + 'name, species, breed, sex and age. You can fill in the rest later.',
          state: 'add_pet',
          action: 'openPetForm',
          suggestions: []
        };
      }
    },
    {
      // §FIX: "Show me another pet" must NEVER open the add-pet form. It
      // walks to the next pet already on the account.
      id: 'another_pet',
      state: 'pet_profile',
      keywords: ['another pet', 'other pet', 'different pet', 'next pet', 'who else',
                'another one', 'some other pet'],
      reply: function (ctx) {
        if (!ctx.hasPets) {
          return {
            text: 'There is no other pet yet \u2014 this account has none on file. '
                + 'Let\u2019s add your first pet.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }
        if (ctx.pets.length < 2) {
          return {
            text: ctx.pets[0].name + ' is the only pet on this account so far.',
            petCard: ctx.pets[0],
            suggestions: ['Help me add another pet', 'I want to book an appointment']
          };
        }
        var next = ctx.anotherPet;
        return {
          text: next.name + ' is the next pet on your account.',
          petCard: next,
          suggestions: ['Show all my pets', 'Help me add another pet',
                        'I want to book ' + next.name + ' an appointment']
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
        var n = ctx.pets.length;
        return {
          // ALL pets, not just the active one. One line per pet is
          // rendered as a compact list card beside this message.
          text: n === 1
            ? ctx.pets[0].name + ' is the only pet on this account so far.'
            : 'You have ' + n + ' pets on this account.',
          petCards: ctx.pets,
          suggestions: n > 1
            ? ['Show me another pet', 'Help me add another pet', bookingPromptFor(ctx)]
            : ['I want to book an appointment', 'Show my appointments']
        };
      }
    },
    {
      id: 'services',
      state: 'idle',   // §11: never rest in thinking
      keywords: ['service', 'services', 'price', 'prices', 'cost', 'how much', 'serbisyo'],
      reply: function (ctx) {
        var groups = ctx.serviceGroups || [];
        return {
          // Summarised by CATEGORY, never a 26-line dump. The cards come
          // from the same shared catalog the Services page renders, so the
          // two can never disagree.
          text: groups.length
            ? 'The clinic groups its services into ' + groups.length
              + ' categories. Here is the short version.'
            : 'The service list is not loaded on this page yet.',
          serviceCategories: true,
          // Drilling in happens from the RAIL, not from a button inside
          // every card — one row of actions beats a wall of links.
          suggestions: categorySuggestions(groups, 3)
        };
      }
    },
    {
      // Drills from a category into its services, and from a service into
      // the sibling services around it. Reads the same catalog as the
      // category cards, so a name can never drift between the two levels.
      id: 'service_detail',
      state: 'idle',
      keywords: ['tell me more', 'more about'],
      reply: function (ctx) {
        var groups = ctx.serviceGroups || [];
        var q = squash(ctx.query);

        // A single service wins over its category: "Vaccination" is a
        // service, while "Preventive & Wellness" is the category holding it.
        var svc = null;
        (ctx.services || []).forEach(function (s) {
          if (q.indexOf(squash(s.label)) !== -1) svc = s;
        });
        if (svc) {
          var group = null;
          groups.forEach(function (g) { if (g.name === svc.group) group = g; });
          var siblings = (group ? group.services : []).filter(function (s) {
            return String(s.serviceId) !== String(svc.serviceId);
          });
          return {
            text: svc.label + ' is under ' + svc.group + '. '
                + (svc.price ? 'Listed at ' + svc.price + '.' : ''),
            service: svc,
            serviceGroupName: svc.group,
            suggestions: siblings.slice(0, 2).map(function (s) {
              return 'Tell me more about ' + s.label;
            }).concat(['Show all service categories'])
          };
        }

        var hit = null;
        for (var i = 0; i < groups.length; i++) {
          if (q.indexOf(squash(groups[i].name)) !== -1) {
            hit = groups[i];
            break;
          }
        }
        if (!hit) {
          // No category or service named — show the overview rather than
          // guessing which one was meant.
          return {
            serviceCategories: true,
            suggestions: categorySuggestions(groups, 3)
          };
        }
        return {
          text: hit.names.length + (hit.names.length === 1 ? ' service sits' : ' services sit')
              + ' under ' + hit.name + ', from ' + hit.priceText + '.',
          serviceGroup: hit,
          suggestions: hit.services.slice(0, 3).map(function (s) {
            return 'Tell me more about ' + s.label;
          }).concat(['Show all service categories'])
        };
      }
    },
    {
      id: 'vaccination',
      // Same gate as booking: a vaccination request is a pet-specific
      // booking action, so it cannot proceed without a pet on file.
      state: 'reminder',
      keywords: ['vaccine', 'vaccination', 'vaccines', 'shots', 'bakuna'],
      reply: function (ctx) {
        if (!ctx.hasPets) {
          return {
            text: 'Before we book a visit, let\u2019s add your first pet so I know '
                + 'who the appointment is for.',
            state: 'add_pet',
            suggestions: ctx.suggestionsNoPet,
            action: 'openPetForm'
          };
        }
        // TODO(AI): vaccination intelligence is explicitly out of scope.
        return {
          text: 'Vaccination reminders come from your pet\u2019s records, which I cannot '
              + 'read yet. Please check Documents, or ask the clinic during your next visit.',
          suggestions: ['What services do you offer?', 'Show my appointments']
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
      // "What can Vetti do?" asks the assistant by NAME, so it has to be
      // matched here \u2014 "what can you do" alone never caught it and the
      // question fell through to the apology reply.
      keywords: ['what can you do', 'what do you do', 'what can vetti', 'vetti do',
                'can vetti', 'help', 'who are you', 'what are you', 'about you', 'kayang'],
      reply: function (ctx) {
        return {
          text: 'I am Vetti, the VHS pet-care assistant. I can:',
          capabilities: true,
          suggestions: ctx.hasPets ? ctx.suggestionsWithPet : ctx.suggestionsNoPet
        };
      }
    }
  ];

  function normalize(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // Compares category names without punctuation or spacing, so "Tell me
  // more about Preventive / Wellness" still finds "Preventive & Wellness"
  // whichever way the two happened to be written.
  function squash(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  // ── DETERMINISTIC BOOKING-CONTEXT EXTRACTION ───────────────────────
  // Small, high-confidence phrase extraction for the BOOKING intent only.
  // It reads the already-normalized query and the SAME ctx the reply
  // sees — the pets, the active pet and the active service catalog — so
  // no lookup table is duplicated here. Every rule is exact-match and
  // anything uncertain is OMITTED, never guessed: no fuzzy medical
  // matching, no invented ids, no "next tuesday", no slot invention.
  // The result only ever rides on action openBooking and only PREFILLS
  // the existing wizard — availability, Smart Scheduling, review and
  // explicit confirmation stay exactly where they are.

  function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Whole-phrase containment: the phrase must sit on non-alphanumeric
  // edges, so "luna" never matches "lunas" and "spay" never "spayed".
  function hasPhrase(text, phrase) {
    var p = String(phrase || '').toLowerCase().trim();
    if (!p) return false;
    var re = new RegExp('(^|[^a-z0-9])' + escapeRegex(p) + '([^a-z0-9]|$)', 'i');
    return re.test(String(text || ''));
  }

  // A local calendar day offset from today, in the portal's own
  // YYYY-MM-DD form — the same toISOString day the booking date input
  // uses for its min/max window.
  function bookingDayIso(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  }

  // A real calendar date — a round-trip rejects 2026-02-31.
  function isRealIsoDate(iso) {
    var parsed = new Date(iso + 'T12:00:00');
    return !isNaN(parsed.getTime()) && parsed.toISOString().split('T')[0] === iso;
  }

  // ── NARROW BOOKING-VERB GUARD (no intent-table reordering) ─────────
  // "schedule" is booking language when spoken as a verb — "schedule
  // vaccination tomorrow". Inside a medical noun phrase — "vaccination
  // schedule" — it is reminder/info language, and the intent that owns
  // that subject should answer. The guard only narrows WHICH cue claims
  // the booking intent; intent order is untouched.
  var SCHEDULE_REMINDER_NOUNS = {
    vaccination: 1, vaccinations: 1, vaccine: 1, vaccines: 1,
    shot: 1, shots: 1, bakuna: 1, booster: 1, boosters: 1,
    immunization: 1, immunisation: 1, reminder: 1, reminders: 1
  };

  function scheduleIsReminderNoun(q, ctx) {
    var idx = q.indexOf('schedule');
    if (idx === -1) return false;
    var re = /schedule/g;
    var m;
    while ((m = re.exec(q))) {
      // Every occurrence must sit behind a medical/service noun; a bare
      // imperative ("schedule tomorrow") or any verbal use keeps the
      // existing booking behaviour.
      var before = q.slice(0, m.index);
      var prev = before.match(/([a-z][a-z'-]*)\s*$/i);
      if (!prev) return false;
      var word = prev[1].toLowerCase().replace(/'s$/, '');
      if (SCHEDULE_REMINDER_NOUNS[word]) continue;
      var services = Array.isArray(ctx.services) ? ctx.services : [];
      var serviceWord = services.some(function (s) {
        if (!s) return false;
        var words = (String(s.label || '') + ' ' + String(s.value || ''))
          .toLowerCase().split(/[^a-z0-9]+/);
        return words.indexOf(word) !== -1;
      });
      if (!serviceWord) return false;
    }
    return true;
  }

  // ── EXPLICIT-BUT-UNRESOLVED PET REFERENCE ──────────────────────────
  // A pet-shaped token after a booking verb or "for" that is not a
  // known pet, not service language and not a stopword/date word is a
  // pet the owner explicitly named and we could NOT identify. The
  // extractor records ONLY that signal — never a fuzzy match, never an
  // invented id — so the wizard can keep the pet selector blank instead
  // of silently substituting the active pet.
  var PET_REFERENCE_STOPWORDS = {
    a: 1, an: 1, the: 1, my: 1, our: 1, your: 1, his: 1, her: 1, its: 1,
    this: 1, that: 1, these: 1, those: 1, another: 1, one: 1,
    pet: 1, pets: 1, appointment: 1, appointments: 1, visit: 1, visits: 1,
    vet: 1, it: 1, them: 1, him: 1, me: 1, us: 1, we: 1, you: 1, i: 1,
    today: 1, tomorrow: 1, tonight: 1, later: 1, morning: 1, afternoon: 1,
    evening: 1, night: 1, noon: 1, at: 1, on: 1, in: 1, for: 1,
    please: 1, soon: 1, now: 1, asap: 1, time: 1, slot: 1, date: 1,
    and: 1, or: 1, with: 1, as: 1, next: 1, last: 1, this: 1,
    week: 1, weeks: 1, weekend: 1, weekends: 1, month: 1, months: 1,
    day: 1, days: 1, weekday: 1, weekdays: 1,
    monday: 1, tuesday: 1, wednesday: 1, thursday: 1,
    friday: 1, saturday: 1, sunday: 1,
    book: 1, booking: 1, schedule: 1
  };

  function hasUnresolvedPetReference(text, pets, services) {
    var re = /\b(?:book|booking|schedule|for)\s+([a-z][a-z'-]*)/g;
    var m;
    while ((m = re.exec(text))) {
      var token = m[1].toLowerCase().replace(/'(s)?$/, '');
      if (PET_REFERENCE_STOPWORDS[token]) continue;
      // Service vocabulary ("vaccination", "blood", "grooming") is
      // service language, not a pet name.
      var serviceWord = services.some(function (s) {
        if (!s) return false;
        var words = (String(s.label || '') + ' ' + String(s.value || ''))
          .toLowerCase().split(/[^a-z0-9]+/);
        return words.indexOf(token) !== -1;
      });
      if (serviceWord) continue;
      // A known pet name is the main matcher's job — resolvable or, when
      // two pets share it, confidently ambiguous (both handled there).
      var knownName = pets.some(function (p) {
        return p && typeof p.name === 'string' &&
          p.name.toLowerCase().replace(/'(s)?$/, '') === token;
      });
      if (knownName) continue;
      return true;
    }
    return false;
  }

  // Returns a PARTIAL bookingContext, or null when nothing safe was
  // found. Partial context is valid; null keeps the plain openBooking.
  function extractBookingContext(query, ctx) {
    var text = String(query || '');
    if (!text || !ctx) return null;
    var found = {};

    // PET — an exact, case-insensitive whole-name match against the pets
    // in context, and only when exactly ONE pet matches. With no pet
    // named, an explicit "my (current) pet" resolves to the active pet.
    // Unknown names, or two pets that could match, omit the petId.
    var pets = Array.isArray(ctx.pets) ? ctx.pets : [];
    var petHits = {};
    pets.forEach(function (p) {
      if (!p || typeof p.name !== 'string') return;
      if (!hasPhrase(text, p.name)) return;
      var id = (p.petId !== undefined && p.petId !== null) ? p.petId : p.id;
      if (id !== undefined && id !== null) petHits[String(id)] = p;
    });
    var petIds = Object.keys(petHits);
    if (petIds.length === 1) {
      found.petId = petIds[0];
    } else if (!petIds.length && ctx.activePet &&
        (hasPhrase(text, 'my pet') || hasPhrase(text, 'my current pet'))) {
      var activeId = (ctx.activePet.petId !== undefined && ctx.activePet.petId !== null)
        ? ctx.activePet.petId : ctx.activePet.id;
      if (activeId !== undefined && activeId !== null) found.petId = String(activeId);
    }

    // SERVICE — an exact whole-phrase match on an ACTIVE catalog label
    // or canonical value, and only when exactly ONE service matches.
    // Partial wording ("grooming") and competing matches ("dog grooming
    // and cat grooming") omit rather than pick. ctx.services is the same
    // active catalog the wizard offers, so an inactive service can never
    // be extracted and nothing is invented.
    var services = Array.isArray(ctx.services) ? ctx.services : [];
    var svcHits = {};
    services.forEach(function (s) {
      if (!s || s.serviceId === undefined || s.serviceId === null) return;
      if ((typeof s.label === 'string' && hasPhrase(text, s.label)) ||
          (typeof s.value === 'string' && hasPhrase(text, s.value))) {
        svcHits[String(s.serviceId)] = s;
      }
    });
    var svcIds = Object.keys(svcHits);
    if (svcIds.length === 1) found.serviceId = svcIds[0];

    // EXPLICIT PET NAMED BUT UNRESOLVED → record the signal so the
    // active-pet fallback is suppressed and the pet selector stays
    // blank. Service/date context still extracts normally around it.
    if (!found.petId && hasUnresolvedPetReference(text, pets, services)) {
      found.petUnresolved = true;
    }

    // DATE — "today", "tomorrow", or an explicit YYYY-MM-DD already in
    // the text, resolved to a real date. Two DIFFERENT dates in one
    // message omit. Phrases like "next tuesday" match nothing here.
    var dates = {};
    if (hasPhrase(text, 'today')) dates[bookingDayIso(0)] = true;
    if (hasPhrase(text, 'tomorrow')) dates[bookingDayIso(1)] = true;
    var isoMatches = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    isoMatches.forEach(function (iso) {
      if (isRealIsoDate(iso)) dates[iso] = true;
    });
    var dateKeys = Object.keys(dates);
    if (dateKeys.length === 1) found.preferredDate = dateKeys[0];

    // TIME PREFERENCE — exactly one of morning/afternoon/evening, kept
    // as a PREFERENCE only. It never selects or implies a slot.
    var prefs = {};
    ['morning', 'afternoon', 'evening'].forEach(function (pref) {
      if (hasPhrase(text, pref)) prefs[pref] = true;
    });
    var prefKeys = Object.keys(prefs);
    if (prefKeys.length === 1) found.timePreference = prefKeys[0];

    // EXACT TIME — only through the EXISTING shared parser and formatter
    // (AppointmentContract), and only for one unambiguous "H:MM AM/PM"
    // in the text. Without the contract loaded, or with more than one
    // time, it is omitted; vague wording ("around lunch") never parses.
    var contract = global.AppointmentContract;
    if (contract && typeof contract.timeToHHMM === 'function' &&
        typeof contract.timeTo12h === 'function') {
      var timeMatches = text.match(/\b\d{1,2}:\d{2}\s*(?:am|pm)\b/gi) || [];
      if (timeMatches.length === 1) {
        var tm = timeMatches[0].match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (tm) {
          var hour = parseInt(tm[1], 10), minute = parseInt(tm[2], 10);
          if (hour >= 1 && hour <= 12 && minute <= 59) {
            var hhmm = contract.timeToHHMM(hour + ':' + tm[2] + ' ' + tm[3].toUpperCase());
            if (hhmm) found.preferredTime = contract.timeTo12h(hhmm);
          }
        }
      }
    }

    return Object.keys(found).length ? found : null;
  }

  // "I want to book Luna an appointment" \u2014 the booking prompt always names
  // the pet the owner is actually working with, so the rail stays relevant
  // after a pet is selected.
  function bookingPromptFor(ctx) {
    var who = ctx.activePet && ctx.activePet.name;
    return who
      ? 'I want to book ' + who + ' an appointment'
      : 'I want to book an appointment';
  }

  // Category prompts for the rail. Capped, then topped up with a single
  // "show everything again" prompt \u2014 the rail is not a second directory.
  function categorySuggestions(groups, limit) {
    var prompts = groups.slice(0, limit).map(function (g) {
      return 'Tell me more about ' + g.shortName;
    });
    if (groups.length > limit) prompts.push('Show all service categories');
    return prompts;
  }

  // The single resolver. Returns { id, state, text, suggestions, ... }
  // plus whichever STRUCTURED payload the intent asked for. An unmatched
  // message is a deterministic "I did not understand" with the closest
  // useful next step — never an invented answer.
  //
  // ctx.query is the normalized message, so a reply can read WHICH
  // service category was named instead of guessing.
  function resolve(message, ctx) {
    var q = normalize(message);
    var context = Object.assign({}, ctx, { query: q });
    if (!q) {
      return { id: 'empty', state: 'idle', text: 'Type a message and I will do my best.', suggestions: ctx.suggestionsWithPet };
    }
    for (var i = 0; i < INTENTS.length; i++) {
      var intent = INTENTS[i];
      for (var k = 0; k < intent.keywords.length; k++) {
        if (q.indexOf(intent.keywords[k]) !== -1) {
          // Narrow booking-verb guard: "schedule" only claims the
          // booking intent when it is spoken as scheduling language,
          // never inside a medical noun phrase like "vaccination
          // schedule" — that defers to the informational intent below.
          if (intent.id === 'booking' && intent.keywords[k] === 'schedule' &&
              scheduleIsReminderNoun(q, context)) {
            continue;
          }
          var answer = intent.reply(context) || {};
          return {
            id: intent.id,
            state: answer.state || intent.state || 'idle',
            text: answer.text || '',
            suggestions: answer.suggestions || [],
            action: answer.action || '',
            // Only the booking intent ever sets this; every other answer
            // carries null, so booking context can never ride along on
            // openReschedule/openCancel/unrelated actions.
            bookingContext: answer.bookingContext || null,
            petCard: answer.petCard || null,
            petCards: answer.petCards || null,
            appointments: answer.appointments || false,
            serviceCategories: answer.serviceCategories || false,
            serviceGroup: answer.serviceGroup || null,
            service: answer.service || null,
            appointment: answer.appointment || null,
            capabilities: answer.capabilities || false
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
  // localStorage = "has ever met Vetti" (survives logout/login). This is
  // the ONLY gate for the first-time welcome layer: it is set when the
  // user finishes or skips the welcome, never when it merely renders, so
  // abandoning it halfway still shows it next time.
  // sessionStorage = "welcome completed this session" (survives nav).
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

  // ── 7. RESPONSE LANGUAGE (UI preference) ────────────────────────────
  // localStorage = the language Vetti's FUTURE replies should use.
  // buildContext() reads it, so every AI request context carries it; the
  // deterministic resolver ignores it today. Stable by design: stored
  // once and never inferred from the language of a typed message, so one
  // message in another language can never flip it. Backend-ready: a
  // profile-backed getter can replace these internals without touching
  // any caller.
  var LS_LANG = 'vetti.responseLanguage';
  var LANG_DEFAULT = 'en';

  function normalizeLanguage(value) {
    return value === 'taglish' ? 'taglish' : LANG_DEFAULT;
  }

  function getResponseLanguage() {
    return normalizeLanguage(safeGet(localStorage, LS_LANG));
  }

  function setResponseLanguage(lang) {
    safeSet(localStorage, LS_LANG, normalizeLanguage(lang));
  }

  global.VettiState = {
    ASSET_DIR: ASSET_DIR,
    CHAT_AVATAR: CHAT_AVATAR,
    chatAvatarFor: chatAvatarFor,
    mascotFor: mascotFor,
    altFor: altFor,
    STATES: STATES,
    isState: isState,
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
    resetIntro: resetIntro,
    getResponseLanguage: getResponseLanguage,
    setResponseLanguage: setResponseLanguage
  };
})(window);