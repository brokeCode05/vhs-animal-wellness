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
      keywords: ['upcoming appointment', 'next appointment', 'i need to reschedule',
                'reschedule my', 'i need to cancel', 'cancel my', 'cancel this',
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
        return {
          text: 'I can help you get started with an appointment for ' + who + '. '
              + 'Vetti booking is not connected yet, so I\u2019ll open the existing '
              + 'booking flow for now.',
          action: 'openBooking',
          suggestions: ['What services do you offer?', 'Show my appointments']
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
          var answer = intent.reply(context) || {};
          return {
            id: intent.id,
            state: answer.state || intent.state || 'idle',
            text: answer.text || '',
            suggestions: answer.suggestions || [],
            action: answer.action || '',
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
    resetIntro: resetIntro
  };
})(window);