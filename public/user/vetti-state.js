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
      // Account details are NOT pet profiles. Route owner's account-editing
      // language before the broader pet-profile keyword (which includes
      // 'profile'). Do not open the editor automatically or edit user data.
      id: 'account_profile',
      state: 'idle',
      keywords: [
        'my profile', 'edit profile', 'update profile', 'change profile',
        'account profile', 'personal profile', 'profile ko',
        'account details', 'account information', 'personal information',
        'account settings', 'my phone number', 'my address', 'my password',
        'edit my account', 'update my account'
      ],
      reply: function () {
        return {
          text: 'I can help you reach My Profile. Select Open My Profile, then Edit Profile to change your phone number, address, profile photo or password. Your registered name and email are read-only in that form. I cannot change account details directly in this chat.',
          suggestions: ['Open My Profile', 'Show my pets']
        };
      }
    },
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
        // A checked-in or in-consultation visit is no longer a FUTURE
        // booking. Do not describe it as the owner's "next appointment".
        var upcoming = ctx.appointments && ctx.appointments.upcoming || [];
        var next = upcoming.find(function(a) {
          return a.status === 'confirmed' || a.status === 'pending' || a.status === 'rescheduled';
        }) || null;
        var activeVisit = upcoming.find(function(a) {
          return a.status === 'checked_in' || a.status === 'in_consultation';
        }) || null;

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
        var mentionedVisits = referencedPets(q, ctx.pets || []);
        if (mentionedVisits.length > 1) {
          // A contrastive instruction names the EXCLUDED pet explicitly.
          // Remove only that negated name, never select the active pet.
          var contrast = q.match(/\b(?:not|except|hindi)\s+([a-z][a-z'-]*)\b/i);
          if (contrast) {
            mentionedVisits = mentionedVisits.filter(function(p) {
              return String(p.name || '').toLowerCase() !== contrast[1].replace(/'s$/i, '');
            });
          }
          if (mentionedVisits.length !== 1) return {
            text: 'Please choose one pet so I can identify the correct appointment.',
            suggestions: ['Show my appointments'] };
        }
        if (mentionedVisits.length === 1) {
          var requestedName = String(mentionedVisits[0].name || '').toLowerCase();
          next = upcoming.find(function(a) {
            return /^(confirmed|pending|rescheduled)$/.test(String(a.status || '')) &&
              String(a.pet || '').toLowerCase() === requestedName;
          }) || null;
          activeVisit = upcoming.find(function(a) {
            return /^(checked_in|in_consultation)$/.test(String(a.status || '')) &&
              String(a.pet || '').toLowerCase() === requestedName;
          }) || null;
        }
        var wantsReschedule = q.indexOf('reschedul') !== -1;
        var wantsCancel = q.indexOf('cancel') !== -1;
        var wantsPrep = q.indexOf('prepare') !== -1;

        if (wantsReschedule || wantsCancel) {
          // Never launch a modal for a different pet or arbitrarily pick one
          // when the owner has multiple open visits. The portal still owns
          // the actual cancellation/reschedule confirmation.
          var targetedPets = referencedPets(q, ctx.pets || []);
          // "Cancel John's appointment, not Bornok's" targets John only.
          // If negation makes the target unclear, never open a modal.
          var excluded = q.match(/\b(?:not|except|hindi)\s+([a-z][a-z'-]*)\b/i);
          if (excluded) {
            var excludedName = excluded[1].replace(/'s$/i, '');
            targetedPets = targetedPets.filter(function(p) {
              return String(p.name || '').toLowerCase() !== excludedName;
            });
            if (targetedPets.length !== 1) return {
              text:'I cannot safely identify the intended appointment. Please select it directly in My Appointments.',
              suggestions:['Show my appointments'] };
          }
          if (targetedPets.length > 1) {
            return { text: 'You mentioned more than one pet. Please choose which appointment to change in My Appointments.',
              suggestions: ['Show my appointments'] };
          }
          var choices = upcoming.filter(function(a) {
            if (!/^(confirmed|pending|rescheduled)$/.test(String(a.status || ''))) return false;
            if (!targetedPets.length) return true;
            return String(a.pet || '').toLowerCase() === String(targetedPets[0].name || '').toLowerCase();
          });
          // A named but unknown pet must not silently target the first visit.
          if (!targetedPets.length && /\b(?:cancel|reschedul\w*)\s+(?!my\b|the\b|an?\b|this\b|appointment\b)([a-z][a-z'-]*)\b/.test(q)) {
            return { text: 'I could not identify that pet on your account. Please select the specific appointment in My Appointments.',
              suggestions: ['Show my appointments'] };
          }
          if (choices.length > 1) {
            return { text: 'You have more than one eligible appointment. Please select the specific visit in My Appointments before changing it.',
              suggestions: ['Show my appointments'] };
          }
          next = choices[0] || null;
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
            text: activeVisit
              ? 'You have no future visit booked right now. ' + activeVisit.pet +
                ' is currently ' + (activeVisit.status === 'checked_in'
                ? 'checked in and awaiting clinic service' : 'in consultation') +
                '. Please contact the clinic if this visit was not completed.'
              : 'You have no upcoming visit booked right now.',
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
      keywords: ['book', 'booking', 'schedule', 'magreserv', 'slot', 'availability'],
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
        // REAL AVAILABILITY: this reply never quotes a schedule itself —
        // it hands off to the portal's booking wizard, whose slot list is
        // GET /api/availability (the same Smart Scheduling source the
        // manual booking flow uses: doctor/non-doctor capacity, on-duty
        // pool, same-day past slots, backend conflicts). The wizard's
        // review step and the booking OTP own the confirmation; nothing
        // here books, holds a slot or claims availability.
        var bookingPets = referencedPets(ctx.query || '', ctx.pets || []);
        var who = bookingPets.length === 1 ? bookingPets[0].name : (ctx.activePet && ctx.activePet.name) || 'your pet';
        // A direct slot question gets a direct pointer to where the times
        // live: the booking form lists them straight from the clinic's
        // schedule, so Vetti never repeats (or invents) a timeslot here.
        var slotQuery = /\b(slots?|availability)\b/.test(ctx.query || '');
        var reply = {
          text: slotQuery
            ? 'I can show you the booking form after you select Continue to Booking. The times listed there '
              + 'come straight from the clinic\u2019s live schedule, so what you '
              + 'see is what you can actually book.'
            : 'I can help you get started with an appointment for ' + who + '. '
              + 'After you review this, select Continue to Booking. The form can use what you\u2019ve already '
              + 'told me \u2014 you pick an open time, then confirm with the '
              + 'verification code the clinic sends you.',
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
          // The shared store is hydrated from the owner's authenticated
          // endpoint (GET /api/appointments) at boot and after every
          // booking, so the count below IS the list My Appointments
          // renders — not a paraphrase of it.
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
      // Keep documents ABOVE pet_profile: "my pet's documents" must not
      // match the broader "my pet" pet-list cue first.
      id: 'documents',
      state: 'idle',
      keywords: ['document', 'documents', 'record', 'records', 'result', 'results'],
      reply: function (ctx) {
        var q = String(ctx.query || '');
        // No one else's records may be displayed or opened from Vetti.
        if (/\b(?:someone else(?:'s)?|another (?:owner|person)(?:'s)?|neighbor(?:'s)?|neighbour(?:'s)?|friend(?:'s)?|other owner(?:'s)?|not (?:my|our))\b/i.test(q)) {
          return {
            text: 'I can only help you reach documents for pets on your own account. Please ask the owner to access their documents.',
            suggestions: ['Show my pets']
          };
        }
        var found = referencedPets(q, ctx.pets || []);
        if (found.length > 1) {
          return {
            text: 'You mentioned more than one pet. Please name one registered pet, or open My Documents to review the documents on your account.',
            suggestions: ['Show my pets', 'Open My Documents']
          };
        }
        // Recognize specifically named but unverified pets. Never select
        // the active pet when the requested name cannot be confirmed.
        var named = q.match(/\b(?:i want|show(?: me)?|view|open|find|see|for)\s+(?:the\s+)?([a-z][a-z'-]{1,39})(?:'s)?\s+(?:documents?|records?|results?)\b/i)
          || q.match(/\b([a-z][a-z'-]{1,39})'s\s+(?:documents?|records?|results?)\b/i);
        if (named && !found.length && !/^(?:my|our|pet|pets|the|some|these|all)$/i.test(named[1])) {
          return {
            text: 'I could not verify that pet among the pets on your account. Check My Pets before looking for its documents.',
            suggestions: ['Show my pets']
          };
        }
        var name = found.length === 1 ? String(found[0].name || '') : '';
        return {
          // The portal loads documents from its existing authenticated
          // My Documents page; Vetti never fetches or exposes file contents.
          text: name
            ? 'For ' + name + ', you can view issued documents on My Documents. Look for the documents labeled ' + name + '. I cannot read or interpret them in this chat.'
            : 'You can view your pets\' issued documents on My Documents. I can open that page for you, but I cannot read their contents in this chat.',
          suggestions: ['Open My Documents', 'Show my pets']
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
        // A bare service word is ambiguous: it can mean a new booking,
        // records, or due-date advice. Do not pretend we checked medical data.
        return {
          text: 'Vaccination is a clinic service. Would you like to start a vaccination appointment, or view an existing vaccination record? A veterinarian must confirm whether vaccination is appropriate or due.',
          suggestions: ['Book an appointment', 'Show my pets']
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
    return String(text || '').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ').trim();
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
    // Local calendar date: UTC conversion can shift midnight in PH time.
    return String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  }

  // A real calendar date — a round-trip rejects 2026-02-31.
  function isRealIsoDate(iso) {
    var parsed = new Date(iso + 'T12:00:00');
    return !isNaN(parsed.getTime()) && parsed.toISOString().split('T')[0] === iso;
  }

  // Past dates are NOT booking instructions. Do not open the wizard
  // and then claim we rejected the request: the UI executes answer.action
  // independently of answer.text. Never treat an impossible ISO date as
  // a real appointment date either.
  function hasPastBookingDate(text) {
    if (/\b(?:yesterday|kahapon)\b/i.test(text)) return true;
    var dates = String(text || '').match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    var today = bookingDayIso(0);
    return dates.some(function(date) { return isRealIsoDate(date) && date < today; });
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
    book: 1, booking: 1, schedule: 1, arrange: 1, reserve: 1,
    groom: 1, grooming: 1, wash: 1, washed: 1, bath: 1,
    magpa: 1, ipa: 1, ko: 1, si: 1, sa: 1, bukas: 1, kahapon: 1
  };

  function hasUnresolvedPetReference(text, pets, services) {
    var re = /\b(?:book|booking|schedule|for|si|kay|can|could|may)\s+(?:my\s+|our\s+|the\s+)?([a-z][a-z'-]*)/g;
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
    // "Can Amelia get a bath?" or "Can Bornok get a bath?" — the
    // proper-name slot before 'get' is not necessarily in the owner's list.
    var subject = text.match(/\b(?:can|could|may|pwede bang|puwede bang)\s+([a-z][a-z'-]*)\s+(?:get|have|receive|take)\b/i);
    if (subject && !PET_REFERENCE_STOPWORDS[subject[1].toLowerCase()] &&
        !pets.some(function(p) { return p && String(p.name || '').toLowerCase() === subject[1].toLowerCase(); })) return true;
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

    // DATE — validated against the very same parser as the booking gate.
    // Never prefill a past, impossible, conflicting or >30-day date.
    var parsedDate = bookingDates(text);
    if (parsedDate.date) found.preferredDate = parsedDate.date;

    // TIME PREFERENCE — exactly one of morning/afternoon/evening, kept
    // as a PREFERENCE only. It never selects or implies a slot.
    var prefs = {};
    ['morning', 'afternoon', 'evening'].forEach(function (pref) {
      var aliases = { morning: ['umaga'], afternoon: ['hapon', 'tanghali'], evening: ['gabi'] };
      if (hasPhrase(text, pref) || aliases[pref].some(function (name) { return hasPhrase(text, name); })) prefs[pref] = true;
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
      var timeMatches = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi) || [];
      if (timeMatches.length === 1 && !/\b(?:after|before|past|between|until|by|lampas|pagkatapos)\b/i.test(text)) {
        var tm = timeMatches[0].match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
        if (tm) {
          var hour = parseInt(tm[1], 10), minute = parseInt(tm[2] || '00', 10);
          if (hour >= 1 && hour <= 12 && minute <= 59) {
            var hhmm = contract.timeToHHMM(hour + ':' + String(minute).padStart(2,'0') + ' ' + tm[3].toUpperCase());
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

  // Natural-language booking gate: recognized phrasing is routed into the
  // existing openBooking action, not a new booking implementation.
  function wantsBooking(query) {
    var q = String(query || '');
    if (/\b(?:work late|after work|after my shift)\b/i.test(q) && /\b(?:another way|other options|alternatives?)\b/i.test(q) && !/\b(?:book|reserve|schedule)\b/i.test(q)) return false;
    if (/\b(?:not booking|not (?:trying|looking|planning) to book|not (?:a )?booking|only asking|just asking)\b/i.test(q)) return false;
    if (/\b(?:want to know|information about|tell me about)\b/i.test(q) && !/\b(?:book|schedule|reserve)\b/i.test(q)) return false;
    return /\b(?:book|booking|schedule|reserve|reservation|magbook|magpa[- ]?book|ipa[- ]?book|pa[- ]?book|magpa[- ]?checkup|magpa[- ]?check-up|magpa[- ]?konsulta)\b/i.test(q)
      || /\b(?:gusto ko|pwede bang|puwede bang|paki|need to|i want to|can you|could you|please|can |could |may |need a|needs a)\b.{0,75}\b(?:bath|bathe|wash|groom|bakuna|vaccinat\w*|deworm|konsulta|consult|check[ -]?up|vet visit)\b/i.test(q)
      || /\b(?:ipa[- ]?groom|magpa[- ]?groom|ipa[- ]?bakuna|magpa[- ]?bakuna|ipa[- ]?vaccine|magpa[- ]?vaccine|(?:i\s*)?pa[- ]?vaccine|(?:i\s*)?pa[- ]?bakuna|pa[- ]?groom)\b/i.test(q)
      || /\b(?:pwede|puwede|gusto)(?:\s+ko)?\s+(?:bang|kong|sana)?\s+(?:i\s*)?pa[- ]?(?:vaccine|bakuna|vaccination)\b/i.test(q)
      || /\b(?:arrange|set up|reserve)\b.{0,35}\b(?:wash|bath|groom|visit|appointment|checkup|check-up)\b/i.test(q)
      || /\b(?:appointment for|need an appointment|need (?:a )?consultation(?: for)?|want (?:a )?consultation(?: for)?)\b/i.test(q);
  }

  // An informational question about HOW to book is not a request to
  // view existing appointments or to submit/open a booking automatically.
  // This takes priority over the broad "appointment" keyword matcher.
  function isBookingHowTo(query) {
    var text = String(query || '');
    return /(?:^|\s)paano\s+(?:po\s+)?(?:(?:ako|kami|ko)\s+)?(?:mag(?:pa)?[- ]?(?:appointment|book|schedule|reserve)|makapag[- ]?book)\b/i.test(text)
      || /\bhow\s+(?:(?:do|can|could|should)\s+(?:i|we)\s+|to\s+)(?:book|schedule|make|request|arrange|get|reserve)\b/i.test(text)
      || /\b(?:what is the (?:booking|appointment) (?:process|procedure)|how does (?:the )?booking work)\b/i.test(text);
  }

  // Questions about clinic cancellation/rescheduling policy are NOT a
  // request to open an action modal. The exact cutoff is owned by Laravel.
  function appointmentChangeQuestion(q) {
    return /\b(?:how\s+(?:do|can|could|would)\s+(?:i|we)\b|how to\b|paano\b|what (?:is|are)\b|how much\b|is there\b|can i\b|could i\b|should i\b|may i\b).{0,80}\b(?:cancel(?:lation)?|reschedul\w*)\b/i.test(q)
      || /\b(?:cancellation|rescheduling)\s+(?:fees?|charges?|policy|policies|rules?|process)\b/i.test(q)
      || /\bpaano\b.{0,75}\b(?:kanselahin|kakanselahin|i[- ]?cancel|ikansela|ilipat|ililipat|i[- ]?reschedule)\b.{0,60}\b(?:appointment|booking|schedule)\b/i.test(q);
  }

  // Stop commands that are explicitly negated, before any modal action.
  function actionOptOut(query) {
    return /\b(?:do not|don't|dont|never|not going to|no need to|do not want to|don't want to|dont want to)\s+(?:(?:want|need|plan|wish)\s+to\s+)?(?:book|schedule|reserve|cancel|reschedul\w*)\b/i.test(query)
      || /\b(?:i am not|i'm not|im not)\s+(?:trying|planning|going)\s+to\s+(?:book|schedule|reserve|cancel|reschedul\w*)\b/i.test(query)
      || /\bcancel\s+(?:the\s+)?booking request\b/i.test(query);
  }

  // Exact registered-name lookup. Multiple mentioned owners/pets or a
  // duplicate registered name should always ask for clarification.
  function referencedPets(query, pets) {
    var seen = {};
    (Array.isArray(pets) ? pets : []).forEach(function(p) {
      if (!p || !p.name || !hasPhrase(query, p.name)) return;
      var id = p.petId !== undefined && p.petId !== null ? p.petId : p.id;
      if (id !== undefined && id !== null) seen[String(id)] = p;
    });
    return Object.keys(seen).map(function(id) { return seen[id]; });
  }

  // Safety rule: never silently choose the active pet when a request
  // explicitly joins a registered pet with a second, *unresolved* name.
  // The old check only counted pets present in the currently hydrated
  // client list, so 'Bornok and John' failed open when John was absent
  // from that list (stale hydration, another owner's pet, etc.).
  // A booking is for ONE verified owner pet; clarify rather than guess.
  function multiplePetReferenceIssue(query, pets, services) {
    var owned = referencedPets(query, pets);
    if (owned.length > 1) return true;
    if (!owned.length) return false;

    var text = String(query || '');
    var knownNames = (Array.isArray(pets) ? pets : []).map(function(p) {
      return String(p && p.name || '').toLowerCase().trim();
    }).filter(Boolean);
    var nonPetWords = {
      a:1, an:1, the:1, my:1, our:1, your:1, i:1, me:1, you:1,
      he:1, she:1, we:1, they:1, their:1, his:1, her:1, pet:1, pets:1,
      dog:1, dogs:1, cat:1, cats:1, puppy:1, kitten:1,
      today:1, tomorrow:1, yesterday:1, bukas:1, next:1, later:1,
      morning:1, afternoon:1, evening:1, night:1, at:1, for:1,
      groom:1, grooming:1, bath:1, bathing:1, wash:1, washed:1,
      vaccination:1, vaccine:1, vaccines:1, consultation:1, consult:1,
      checkup:1, deworming:1, boarding:1, spay:1, neuter:1,
      appointment:1, appointments:1, schedule:1, service:1, services:1,
      time:1, slot:1, date:1, please:1, also:1, include:1,
      monday:1, tuesday:1, wednesday:1, thursday:1, friday:1,
      saturday:1, sunday:1
    };
    var svcWords = {};
    (Array.isArray(services) ? services : []).forEach(function(svc) {
      String((svc && svc.label || '') + ' ' + (svc && svc.value || ''))
        .toLowerCase().split(/[^a-z0-9]+/).forEach(function(word) {
          if (word) svcWords[word] = true;
        });
    });
    function secondPetCandidate(word) {
      word = String(word || '').toLowerCase().replace(/'s$/, '');
      if (!word || nonPetWords[word] || svcWords[word]) return false;
      // A complete known name is handled above, but an unknown name
      // still requires explicit selection instead of active-pet fallback.
      return !knownNames.some(function(name) { return name === word; });
    }
    return owned.some(function(pet) {
      var name = escapeRegex(String(pet.name || '').toLowerCase().trim());
      if (!name) return false;
      // 'Bornok and John' / 'Bornok & John'. Keep word boundaries to
      // prevent matching substrings of other registered pet names.
      var following = new RegExp('(?:^|[^a-z0-9])' + name +
        "\\s+(?:and|&)\\s+([a-z][a-z'-]{0,39})(?=$|[^a-z])", 'i');
      var after = text.match(following);
      if (after && secondPetCandidate(after[1])) return true;
      // Symmetric phrase 'John and Bornok'. Don't treat natural service
      // conjunctions as unknown pet names.
      var preceding = new RegExp("(?:^|[^a-z0-9])([a-z][a-z'-]{0,39})" +
        '\\s+(?:and|&)\\s+' + name + '(?=$|[^a-z0-9])', 'i');
      var before = text.match(preceding);
      return !!(before && secondPetCandidate(before[1]));
    });
  }

  // A single clinic-local calendar parser is used for BOTH validation and
  // wizard prefill. The 30-day limit comes from the existing booking wizard.
  // Do not use Date.parse on free text: JS normalizes impossible dates.
  function bookingDates(query) {
    var text = String(query || '');
    var dates = {}, errors = [];
    function add(year, month, day) {
      var iso = [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
      if (!isRealIsoDate(iso)) errors.push('invalid');
      else dates[iso] = true;
    }
    if (/\b(?:yesterday|kahapon)\b/i.test(text)) errors.push('past');
    (text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).forEach(function(date) {
      add(+date.slice(0, 4), +date.slice(5, 7), +date.slice(8, 10));
    });
    // Distinguish numeric US MM/DD/YYYY dates from year-first ISO strings.
    Array.from(text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)).forEach(function(m) {
      add(+m[3], +m[1], +m[2]);
    });
    var months = {january:1, february:2, march:3, april:4, may:5, june:6,
      july:7, august:8, september:9, october:10, november:11, december:12};
    Array.from(text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi)).forEach(function(m) {
      // Yearless named dates are ambiguous around a year boundary: ask.
      if (!m[3]) errors.push('ambiguous');
      else add(+m[3], months[m[1].toLowerCase()], +m[2]);
    });
    if (/\b(?:day after tomorrow|makalawa)\b/i.test(text)) dates[bookingDayIso(2)] = true;
    else if (/\b(?:tomorrow|bukas)\b/i.test(text)) dates[bookingDayIso(1)] = true;
    if (/\btoday\b|\bngayon\b/i.test(text)) dates[bookingDayIso(0)] = true;
    var weekdays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    var offset = (new Date().getDay() + 6) % 7;
    var named = Array.from(text.matchAll(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi));
    named.forEach(function(m) { dates[bookingDayIso(7-offset+weekdays.indexOf(m[1].toLowerCase()))] = true; });
    if (!named.length) Array.from(text.matchAll(/\b(?:sa|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi)).forEach(function(m) {
      var delta=(weekdays.indexOf(m[1].toLowerCase())-offset+7)%7;
      dates[bookingDayIso(delta || 7)] = true;
    });
    if (/\bnext week\b|\bsa susunod na linggo\b/i.test(text) && !named.length) errors.push('ambiguous');
    var list = Object.keys(dates);
    if (list.some(function(date) { return date < bookingDayIso(0); })) errors.push('past');
    if (list.some(function(date) { return date > bookingDayIso(30); })) errors.push('too_far');
    if (list.length > 1) errors.push('ambiguous');
    return { date: errors.length || list.length !== 1 ? null : list[0],
      error: errors[0] || null };
  }

  function bookingDateIssue(query) {
    return bookingDates(query).error;
  }

  function bookingTimeIssue(query) {
    // This is a requested time, not an available slot; the wizard will
    // fetch availability. Obvious impossible/outside-window requests are
    // rejected before a modal can be offered.
    var q = String(query || '');
    if (/\b(?:midnight|hatinggabi|12\s*:?\s*00\s*am|(?:10|11)\s*:?\s*\d{0,2}\s*pm|1\s*am|2\s*am|3\s*am|4\s*am|5\s*am)\b/i.test(q)) return 'outside_hours';
    var times = Array.from(q.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi));
    if (times.length > 1) return 'ambiguous';
    if (times.some(function(t) { return +t[1] < 1 || +t[1] > 12 || +t[2] > 59; })) return 'invalid';
    return null;
  }

  function thirdPartyPetRequest(q) {
    return /\b(?:neighbor(?:'s|s')?|neighbour(?:'s|s')?|friend(?:'s|s')?|someone else(?:'s)?|other owner(?:'s)?|not my|not our)\s+(?:(?:pet|dog|cat|animal)\b)?|\b(?:pet|dog|cat)\s+(?:of|belonging to)\s+(?:my\s+)?(?:neighbor|neighbour|friend)\b/i.test(q);
  }

  // Information requests cannot be converted into mutating actions just
  // because they mention a service, an appointment or a scheduling word.
  function informationalQuestion(q) {
    if (/\b(?:what happens if|what if|if i miss|if we miss|miss my appointment|miss an appointment|no[- ]?show policy|missed appointment|ma[- ]?miss (?:ko|namin))\b/i.test(q)) {
      return { id:'missed_visit_help', state:'reminder', action:'',
        text:'If you miss a visit, contact the clinic to ask about its no-show and rebooking policy. I cannot confirm any fees or reschedule it automatically.',
        suggestions:['Show my appointments', 'Clinic information'] };
    }
    if (/\b(?:what (?:vaccines|shots|vaccinations) (?:has|did)|vaccination history|vaccine history|vaccines? received|bakuna (?:na|ni))\b/i.test(q)) {
      return { id:'vaccination_records_help', state:'reminder', action:'',
        text:'For actual vaccines administered, check your pet\'s Medical Records or Documents. I won\'t guess which vaccines were given; ask your veterinarian to verify the record.',
        suggestions:['Show my pets', 'Clinic information'] };
    }
    if (/\b(?:what|which|tell me|explain|list|describe|information|details|magkano|ano(?:ng)?|alin)\b.{0,75}\b(?:services?|grooming|vaccination|bath|bakuna|appointment policy)\b/i.test(q) ||
        /\b(?:services?|grooming|vaccination)\b.{0,45}\b(?:offer|available|include|price|cost|requirements|policy)\b/i.test(q)) return null; // Existing service/catalog FAQ.
    return false;
  }

  function deniedBookingRequest(query) {
    return /\b(?:do not book|don't book|dont book|never book|cancel (?:the )?booking request)\b/i.test(query)
      || /\b(?:pet that (?:is not|isn't|isnt) mine|(?:isn't|isnt|is not) (?:my|our) pet|not (?:my|our) pet|someone else's pet|another owner's pet|pet (?:i|we) (?:do not|don't|dont) own|not owned by me)\b/i.test(query)
      || /\b(?:pet|dog|cat|animal|puppy|kitten)\b.{0,35}\b(?:that is|that isn't|that isnt|is|isn't|isnt|not|don't|dont)\s+(?:not\s+)?(?:mine|ours|my\b|owned by me)\b/i.test(query)
      || /\b(?:both|two|multiple|several)\s+(?:of\s+)?(?:my\s+)?pets\b/i.test(query)
      || /\b(?:hindi (?:ko|akin|namin) (?:alaga|pet)|hindi (?:sa akin|akin) (?:yung|ang)? ?(?:pet|alaga))\b/i.test(query);
  }

  function bookingAnswer(context) {
    var booking = INTENTS.filter(function (intent) { return intent.id === 'booking'; })[0];
    var answer = booking.reply(context) || {};
    return {
      id: 'booking', state: answer.state || booking.state, text: answer.text || '',
      suggestions: answer.suggestions || [], action: answer.action || '',
      bookingContext: answer.bookingContext || null
    };
  }

  // Catalog-category information is evaluated from the current shared
  // active UI catalog, never a fixed services table. Laravel independently
  // answers the same request from the authoritative database.
  function groupQuestion(message, ctx) {
    var q=String(message||'');
    if(q.length>180 || !/\b(?:services?|serbisyo|serbisyong|under|category|categories|nasa|what about|how about)\b/i.test(q) ||
       /\b(?:book|appointment|my|mine|records?|diagnos|prescri|treat|emergency|cancel)\b/i.test(q))return null;
    var groups=Array.isArray(ctx.serviceGroups)?ctx.serviceGroups:[];
    var hits=groups.filter(function(g){
      var label=String(g&&g.name||'').toLowerCase().trim();
      if(!label)return false;
      // Punctuation-neutral exact category phrase (not partial words).
      var target=label.replace(/[^a-z0-9]+/g,' ' ).trim();
      var source=q.toLowerCase().replace(/[^a-z0-9]+/g,' ');
      return (' '+source+' ').indexOf(' '+target+' ')!==-1;
    });
    if(hits.length>1)return {id:'service_category_ambiguous',state:'reminder',action:'',text:'Which service category would you like to explore?',suggestions:[]};
    if(hits.length!==1)return null;
    var group=hits[0];
    var names=Array.isArray(group.names)?group.names:[];
    return {id:'services_filtered',state:'idle',action:'',
      text:'Currently listed services under '+group.name+': '+(names.length?names.join(', '):'none listed')+'. Check the Services page for current fees.',
      serviceGroup:group,suggestions:names.slice(0,3).map(function(n){return 'Tell me about '+n;})};
  }

  // The single resolver. Returns { id, state, text, suggestions, ... }
  // plus whichever STRUCTURED payload the intent asked for. An unmatched
  // message is a deterministic "I did not understand" with the closest
  // useful next step — never an invented answer.
  //
  // ctx.query is the normalized message, so a reply can read WHICH
  // service category was named instead of guessing.
  // Clinic information is a safe public-data read, not a pet, booking,
  // document, or medical-record request. Keep phrases narrow so requests
  // such as "book a clinic visit" stay with the booking wizard.
  function isClinicInformationRequest(q) {
    // Recognize natural possessives and colloquial plural spellings ("clinics info")
    // as the same public clinic-details intent. Do NOT relax booking or
    // medical-record access rules just to accommodate spelling variation.
    var text = String(q || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
    if (/\b(?:my|our|another|someone(?:\s+else)?'s)\s+(?:pets?|dogs?|cats?|documents?|records?|appointments?|prescriptions?|lab\s+results?)\b/.test(text)) return false;
    if (/\b(?:cancel|reschedule|book|booking|reserve|schedule|appointment\s+(?:status|history))\b/.test(text)) return false;
    var place = "(?:the\\s+|your\\s+|our\\s+)?(?:vhs\\s+)?(?:vet\\s+)?(?:clinic(?:'s|s)?|klinika|vhs)";
    var info = '(?:info(?:rmation|s)?|impormasyon|details?|contact(?:s|\\s+(?:details?|info))?|address|location|phone(?:\\s+number)?|email|hours?|opening\\s+hours|operating\\s+hours)';
    var direct = new RegExp('\\b' + place + '\\s+' + info + '\\b','i');
    var reversed = new RegExp('\\b' + info + '\\s+(?:about|of|for|on|ng|sa)\\s+' + place + '\\b','i');
    return direct.test(text) || reversed.test(text) ||
      /\b(?:tell|give|show|share|provide)\s+(?:me\s+)?(?:about\s+)?(?:the\s+|your\s+)?(?:vhs\s+)?(?:vet\s+)?(?:clinic|klinika)\b/i.test(text) ||
      /\b(?:where\s+(?:are\s+you|is\s+(?:the|your)\s+clinic)\s+located|how\s+(?:can|do)\s+i\s+(?:contact|reach)\s+(?:you|the\s+clinic)|saan\s+(?:matatagpuan|located)(?:\s+ang)?\s+(?:clinic|vhs)|anong\s+oras\s+(?:kayo|ang\s+clinic)\s+(?:bukas|open))\b/i.test(text) ||
      /\b(?:pahingi|bigay|pakibigay|ano|anong)\s+(?:po\s+)?(?:ng\s+)?(?:info|impormasyon|details?)\s+(?:ng|sa|about)\s+(?:clinic|klinika|vhs)\b/i.test(text);
  }

  function clinicInformationAnswer(ctx) {
    // Contact information comes from the same clinic-settings adapter as
    // the User Portal. Do not freeze admin-editable details in this file.
    var info = ctx && ctx.clinicInfo;
    var lines = [];
    if (info && typeof info === 'object') {
      ['name', 'address', 'phone', 'email'].forEach(function (key) {
        var value = info[key];
        if (typeof value === 'string' && value.trim()) {
          var label = key.charAt(0).toUpperCase() + key.slice(1);
          lines.push(label + ': ' + value.trim().slice(0, 300));
        }
      });
    }
    return {
      id: 'clinic_info', state: 'idle', action: '',
      text: lines.length
        ? 'Here is the clinic information available in your User Portal:\n' + lines.join('\n')
          + '\nFor appointment hours, directions and other details, select Open Clinic Info.'
        : 'You can find the clinic\'s contact information, location and appointment hours in Clinic Info. Select Open Clinic Info to view the latest details.',
      suggestions: ['Open Clinic Info', 'What services do you offer?']
    };
  }

  function isUrgentVettiMessage(message) {
    var q = String(message || '').toLowerCase();
    return /\b(?:emergency|urgent|poison(?:ed|ing)?|seizures?|convulsions?|collapse|unconscious|not breathing|can['\u2019]?t breathe|cannot breathe|bleed(?:ing)? heavily|difficulty breathing|struggling to breathe|having trouble breathing|has trouble breathing|hard time breathing|gasping|choking)\b|\b(?:having|has|have|with|experiencing|showing)\s+(?:(?:a|some)\s+)?(?:trouble|problems?|difficulty|difficulties|a hard time)\s+(?:with\s+)?breathing\b|hindi makahinga|hirap huminga|nahihirapan huminga|nahihirapang huminga/iu.test(q);
  }

  function resolve(message, ctx) {
    var q = normalize(message);
    var context = Object.assign({}, ctx, { query: q });
    if (!q) {
      return { id: 'empty', state: 'idle', text: 'Type a message and I will do my best.', suggestions: ctx.suggestionsWithPet };
    }
    // Safety has absolute priority over greeting, service, booking and personal-data intents.
    // Free-form emergencies are never sent to Gemini or treated as a greeting.
    if (isUrgentVettiMessage(q)) {
      return {id:'urgent_safety',state:'concerned',action:'',
        text:'This may be an emergency. Contact a veterinarian or emergency veterinary facility immediately. Do not wait for a chatbot or give medicine based on this chat.',
        suggestions:['Clinic information']};
    }
    if (/\b(?:gcash|maya|credit card|debit card|cash|payment methods?|payment options?|mode of payment)\b/i.test(q) && /\b(?:accept|take|pay|payment|pwede|puwede|tumatanggap|bayad|gamitin)\b/i.test(q) && !/\b(?:book|reserve|cancel|reschedule|emergency|urgent|sick|pain|fever|vomit\w*|nagsusuka|may sakit|hindi makahinga)\b/i.test(q)) {
      return {id:'payment_policy',state:'idle',action:'',text:/\b(?:pwede|puwede|tumatanggap|bayad|gamitin)\b/i.test(q) ? 'Hindi ko makumpirma kung anong payment methods ang tinatanggap ng clinic. Tumawag muna sa clinic para makasiguro.' : 'I cannot verify which payment methods the clinic accepts. Please contact the clinic to confirm before your visit.',suggestions:['Clinic information']};
    }
    if (/\b(?:late|running late|mahuhuli|male[- ]?late|ma[- ]?late)\b/i.test(q) && /\b(?:appointment|visit|booking|check[ -]?up)\b/i.test(q) && !/\b(?:book|reserve|cancel|reschedule|emergency|urgent|sick|pain|fever|vomit\w*|nagsusuka|may sakit|hindi makahinga)\b/i.test(q)) {
      return {id:'late_visit_guidance',state:'idle',action:'',text:/\b(?:mahuhuli|male[- ]?late|ma[- ]?late)\b/i.test(q) ? 'Kung mahuhuli ka, tawagan agad ang clinic para malaman kung puwede ka pa nilang tanggapin o kailangan mong mag-reschedule. Hindi ko makumpirma ang late-arrival policy, at walang binago sa appointment mo.' : 'If you may arrive late, contact the clinic as soon as possible to ask whether they can still see you or need to reschedule. I cannot verify its late-arrival policy; your appointment has not been changed.',suggestions:['Clinic information','Show my appointments']};
    }
    // Policy questions are informational: never infer permission to change a visit.
    if (/\b(?:walk[ -]?in|walkin)\b/i.test(q) && !/\b(?:book|reserve|cancel|reschedule|emergency|urgent|sick|pain|fever|vomit\w*|nagsusuka|may sakit|hindi makahinga)\b/i.test(q)) {
      return {id:'walk_in_policy',state:'idle',action:'',text:/\b(?:pwede|puwede|maaari|ba|po)\b/i.test(q) ? 'Hindi ko makumpirma kung tumatanggap ang clinic ng walk-in. Tumawag muna sa clinic para malaman ang patakaran at availability.' : 'I cannot verify whether the clinic accepts walk-ins. Please contact the clinic to confirm its policy and availability.',suggestions:['Clinic information']};
    }
    if (/\b(?:bayad|fee|fees|charge|cost|penalty|magkano)\b/i.test(q) && /\b(?:cancel\w*|kansela\w*|kinansela\w*|kakanselahin|reschedul\w*|reschedule)\b/i.test(q) && !/\b(?:emergency|urgent|sick|pain|fever|vomit\w*|nagsusuka|may sakit|hindi makahinga)\b/i.test(q)) {
      return {id:'appointment_change_help',state:'idle',action:'',text:/\b(?:bayad|magkano|kansela\w*|kinansela\w*|kakanselahin)\b/i.test(q) ? 'Hindi ko makumpirma kung may bayad sa pagkansela o pagpapalit ng appointment. Makipag-ugnayan sa clinic para sa kasalukuyang patakaran. Walang binago sa appointment mo.' : 'I cannot verify cancellation or rescheduling fees. Please contact the clinic for its current policy. No appointment was changed.',suggestions:['Clinic information','Show my appointments']};
    }
    if (/\b(?:bukas|open)\b.{0,25}\b(?:clinic|klinika|kayo)\b.{0,35}\b(?:linggo|sunday|weekend)\b/i.test(q) && !/\b(?:book|reserve|cancel|reschedule|emergency|urgent|sick|pain|fever|vomit\w*|nagsusuka|may sakit|hindi makahinga)\b/i.test(q)) {
      var sundayAnswer = clinicInformationAnswer(context);
      sundayAnswer.text = 'Hindi ko makumpirma kung bukas ang clinic tuwing Linggo. Tumawag sa clinic bago pumunta; ang oras ng appointment ay hindi palaging oras ng pagbubukas.\n' + sundayAnswer.text;
      return sundayAnswer;
    }
    if (!/\b(?:vomit\w*|diarrh\w*|fever|pain|injur\w*|medicine|medication|dosage|prescri\w*)\b/i.test(q) && /(?:\b(?:clinic|opening|operating)\s+hours\b|\bwhen (?:do you|does the clinic) (?:open|close)\b|\banong oras (?:po )?(?:kayo|ang clinic|ang klinika) (?:bukas|open)\b)/i.test(q)) {
      var hoursAnswer = clinicInformationAnswer(context);
      hoursAnswer.text = (/\banong oras\b/i.test(q) ? 'Hindi ko makumpirma ang oras ng pagbubukas. Tingnan ang Clinic Info o tumawag sa clinic bago pumunta.\n' : 'I cannot verify the clinic’s opening hours from the available information. Please check Clinic Info or call the clinic to confirm before visiting.\n') + hoursAnswer.text;
      return hoursAnswer;
    }
    if (/^(?:kumusta|kamusta)\s+(?:ka|po)(?:\s+(?:po|vetti))?(?:\s+vetti)?[?!. ]*$/i.test(q)) {
      return {id:'tagalog_greeting',state:'greeting',action:'',text:'Kumusta! Handa akong tumulong. Ano ang gusto mong malaman tungkol sa iyong alaga o sa clinic?',suggestions:context.suggestionsWithPet};
    }
    if (/^(?:hi|hello|hey)(?:\s+vetti)?[!,. ]+(?:how are you|kumusta ka)[?!. ]*$/i.test(q)) {
      return {id:'greeting_hello',state:'greeting',action:'',text:'Hello! I’m here and ready to help. What would you like to know about your pets or the clinic?',suggestions:context.suggestionsWithPet};
    }
    // Information about a listed service is not a request to make a visit.
    if (/\b(?:want to know|tell me|information|details|learn)\b.{0,60}\b(?:vaccination|vaccine|grooming|deworming)\b/i.test(q) && !/\b(?:book|schedule|reserve|vomit\w*|diarrh\w*|fever|pain|injur\w*|medicine|medication|dosage|prescri\w*)\b/i.test(q)) {
      var namedServices = (context.services || []).filter(function(s) {
        return s && s.active !== false && s.label && q.indexOf(String(s.label).toLowerCase()) !== -1;
      });
      if (namedServices.length === 1) {
        var service = namedServices[0];
        return {id:'service_information',state:'idle',action:'',text:service.label + ' is listed by the clinic. ' + (service.price && /\d/.test(service.price) ? 'The listed fee is ' + service.price + '. ' : 'Please contact the clinic for the current fee. ') + 'A veterinarian can advise on the right care for your pet.',suggestions:['What services do you offer?','Clinic information']};
      }
    }
    var categoryRequest=groupQuestion(q,context);
    if(categoryRequest)return categoryRequest;
    // Resolve explicit clinic-information questions before broad pet and booking terms.
    if (isClinicInformationRequest(q) && !wantsBooking(q)) return clinicInformationAnswer(context);
    // Explicitly informational requests are never executable appointment
    // commands, even if the older keyword table happens to match.
    var information = informationalQuestion(q);
    if (information && information !== true) return information;
    if (thirdPartyPetRequest(q) && wantsBooking(q)) {
      return { id:'booking_ownership', state:'reminder', action:'',
        text:'I can only start appointments for pets registered to your account. For someone else\'s pet, please ask the owner to book or contact the clinic.',
        suggestions:['Clinic information'] };
    }
    if (/\b(?:grooming|bath|wash|check[ -]?up|consultation|vaccination|bakuna)\b.{0,60}\b(?:and|&)\b.{0,60}\b(?:grooming|bath|wash|check[ -]?up|consultation|vaccination|bakuna)\b/i.test(q) && wantsBooking(q)) {
      return { id:'booking_service_ambiguous', state:'reminder', action:'',
        text:'I found multiple requested services. Please request one pet and one service per appointment, or specify which visit to start first.',
        suggestions:['Book an appointment', 'What services do you offer?'] };
    }
    // Urgent and clinical descriptions are NOT a grooming/booking shortcut.
    // A real veterinarian, not the booking interpreter, must triage them.
    if (/\b(?:bleed(?:ing)?|poison(?:ed|ing)?|seizures?|convulsions?|fits|collapse|unconscious|not breathing|can[\x27\u2019]?t breathe|cannot breathe|struggling to breathe|difficulty breathing|emergency|urgent|vomit(?:ing)?|diarrhea|fever|pain|injur(?:y|ed)|dosage|medication|medicine|prescri(?:be|ption))\b|hindi makahinga|hirap huminga|nahihirapan huminga|nagsusuka|nangingisay|kinukumbulsyon/iu.test(q)) {
      return {
        id: 'urgent_safety', state: 'concerned', action: '',
        text: 'This may need urgent veterinary care. Call a veterinarian or emergency clinic now. Do not give medicines or doses based on a chatbot, and do not wait for an appointment chat response.',
        suggestions: ['Clinic information']
      };
    }
    if (actionOptOut(q)) {
      var infoGroom = /\b(?:grooming|bath|wash|paligo)\b/i.test(q) &&
        /\b(?:tell|explain|services?|about|ano|serbisyo|lang)\b/i.test(q);
      var listed = (context.services || []).filter(function(service) {
        return service && service.active !== false && /\bgroom/i.test(String(service.label || ''));
      }).map(function(service) { return service.label; });
      return { id: 'action_opt_out', state: 'reminder', action: '',
        text: infoGroom
          ? 'No booking or change was made. Listed grooming services: ' +
            (listed.length ? listed.join(', ') : 'Please check the Services page for current options and prices.') + '.'
          : 'Understood. I will not open or change any appointment. No booking or cancellation was made.',
        suggestions: ['Show my appointments', 'What services do you offer?'] };
    }
    if (/\b(?:how much|price|cost|fee|magkano|presyo)\b/i.test(q) && /\b(?:grooming|groom|paligo)\b/i.test(q) && !/\b(?:book|reserve|schedule|cancel|reschedule|record|history|diagnos\w*|treat\w*|symptom|sick)\b/i.test(q)) {
      var cat = /\b(?:cat|kitten|pusa)\b/i.test(q), dog = /\b(?:dog|puppy|aso)\b/i.test(q);
      var grooming = (context.services || []).filter(function(s) {
        return s && s.active !== false && ((cat && !dog && /^cat grooming$/i.test(s.label || '')) || (dog && !cat && /^dog grooming$/i.test(s.label || '')));
      });
      if (grooming.length === 1) return {id:'service_price_local',state:'idle',action:'',text:grooming[0].label + ': ' + (grooming[0].price || 'Please contact the clinic for the current fee.'),suggestions:['What services do you offer?']};
    }
    if (/\b(?:work late|after work|after my shift)\b/i.test(q) && /\b(?:another way|other options|alternatives?)\b/i.test(q) && !/\b(?:book|reserve|schedule|cancel|reschedule)\b/i.test(q)) {
      return {id:'visit_options',state:'idle',action:'',text:'Please contact the clinic to discuss visit options that fit your schedule. I cannot confirm availability here.',suggestions:['Clinic information']};
    }
    if (/\b(?:consultation|consult|check[ -]?up|vet visit)\b/i.test(q) && /\b(?:what happens|what to expect|how does|explain|tell me about|what is|ano ang|paano)\b/i.test(q) && !/\b(?:book|schedule|reserve|cancel|reschedule|my appointment|records?|history|symptom|sick|diagnos\w*|treat\w*)\b/i.test(q)) {
      return {id:'consultation_information',state:'idle',action:'',text:/\b(?:ano|paano)\b/i.test(q) ? 'Sa consultation, karaniwang magtatanong ang beterinaryo tungkol sa iyong alaga at mga alalahanin mo, susuriin ang alaga, at ipapaliwanag ang susunod na hakbang. Ang mga pagsusuri o gamutan ay nakadepende sa pagtatasa ng beterinaryo. Maaaring magtanong sa clinic tungkol sa kanilang proseso.' : 'During a consultation, the veterinarian typically asks about your pet and your concerns, examines your pet, and discusses their findings and next steps with you. Any tests or treatment depend on the veterinarian’s assessment. The clinic can explain its specific process.',suggestions:['What should I bring?', 'What services do you offer?']};
    }
    if (appointmentChangeQuestion(q)) {
      return { id: 'appointment_change_help', state: 'reminder', action: '',
        text: /\bpaano\b/i.test(q) ? 'Buksan ang My Appointments at piliin ang appointment. Gamitin ang Cancel o Reschedule at suriin ang mga detalye bago kumpirmahin. Ang clinic ang nagtatakda ng mga patakaran at cutoff; tawagan sila para sa fees o iba pang detalye. Walang binago sa appointment mo.' : 'You can review cancellation or rescheduling options in My Appointments. The clinic applies its current cutoff and eligibility rules when you select a visit. For fees or policy details, please contact the clinic.',
        suggestions: ['Show my appointments', 'Clinic information'] };
    }
    // A request naming multiple owned pets cannot become one wizard booking
    // by silently substituting the currently selected pet.
    if (wantsBooking(q) && multiplePetReferenceIssue(q, context.pets, context.services)) {
      return { id: 'booking_pet_ambiguous', state: 'reminder', action: '',
        text: 'You mentioned more than one pet or an unrecognized pet name. Please choose one pet registered to your account for this booking.',
        suggestions: ['Show my pets', 'Book an appointment'] };
    }
    if (wantsBooking(q) && /\b(?:both|two|multiple|several)\s+(?:of\s+)?(?:my\s+)?pets\b/i.test(q)) {
      return { id: 'booking_pet_ambiguous', state: 'reminder', action: '',
        text: 'The booking wizard handles one pet per appointment. Please name or choose a single registered pet.',
        suggestions: ['Show my pets', 'Book an appointment'] };
    }
    if (/\b(?:my other pet|another pet|other pet|ibang alaga)\b/i.test(q) &&
        /\b(?:appointments?|visits?|bookings?|schedule)\b/i.test(q)) {
      return {id:'appointments_pet_clarify', state:'reminder', action:'',
        text:'Which registered pet do you mean? Please tell me the pet name so I can show the correct appointment information.',
        suggestions:['Show my pets', 'Show my appointments']};
    }
    // A negated booking or an explicitly unowned pet is NEVER silently
    // changed into a booking for the currently selected pet.
    if (deniedBookingRequest(q)) {
      return {
        id: 'booking_ownership', state: 'reminder', action: '',
        text: 'I can only help you book a visit for pets registered to your account. Please choose one of your own pets, or contact the clinic for assistance.',
        suggestions: ['Show my pets', 'Book an appointment']
      };
    }
    // "Paano magpa-appointment?" is HOW-TO guidance, not "show my
    // appointments". Explain the existing process and suggest the trusted
    // wizard, but do not open it automatically or show private history.
    if (isBookingHowTo(q)) {
      return {
        id: 'booking_help', state: 'booking', action: '',
        text: 'To book an appointment, select Book an Appointment in the User Dashboard, choose your registered pet and the service, then pick a date and an available time. Review the details and confirm with the verification code. I can also open the booking form when you ask me to book a visit.',
        suggestions: ['Book an appointment', 'What services do you offer?']
      };
    }
    if (wantsBooking(q) && hasUnresolvedPetReference(q, context.pets || [], context.services || [])) {
      return {id:'booking_pet_ambiguous', state:'reminder', action:'',
        text:'I could not verify the pet you named among your registered pets. Please confirm the name in My Pets before opening a booking.',
        suggestions:['Show my pets', 'Book an appointment']};
    }
    // Reject explicitly past booking dates BEFORE any openBooking action
    // is issued. Otherwise the booking reply may say "date has passed"
    // while runAction still opens the wizard (reported browser bug).
    if (wantsBooking(q)) {
      var dateIssue = bookingDateIssue(q);
      var timeIssue = bookingTimeIssue(q);
      if (timeIssue) {
        return { id:'booking_invalid_time', state:'reminder', action:'', bookingContext:null,
          text: timeIssue === 'outside_hours'
            ? 'That time is outside normal appointment hours. Please choose an available time in the booking window.'
            : 'The requested time is invalid or ambiguous. Please give a single valid time preference.',
          suggestions:['Book an appointment', 'Clinic information'] };
      }
      if (dateIssue) {
        var dateHelp = {
          past: 'That appointment date has already passed. Please request a future date instead.',
          invalid: 'That calendar date does not exist. Please provide a real date.',
          too_far: 'The booking form accepts dates up to 30 days ahead. Please choose a date within that range.',
          ambiguous: 'I need one exact appointment date. Please specify a single day within the next 30 days.'
        };
        return { id: 'booking_invalid_date', state: 'reminder', action: '', bookingContext: null,
          text: dateHelp[dateIssue] + ' No booking form was opened and no appointment was created.',
          suggestions: ['Book an appointment', 'What services do you offer?'] };
      }
    }
    // Route new English/Taglish wording BEFORE broad appointment/clinic
    // keyword matches. Pure information questions still use their intents.
    if (wantsBooking(q) && !scheduleIsReminderNoun(q, context) &&
        !/\b(?:how (?:do|can|to) (?:i |we )?book|how does booking|paano (?:magbook|magpa book)|(?:show|list|view|check) my (?:existing |next |upcoming )?(?:appointments?|bookings?)|reschedul\w*|cancel\w*)\b/i.test(q)) {
      return bookingAnswer(context);
    }
    // Service-specific catalog questions use actual currently loaded service
    // labels, not a fixed keyword category list or invented pricing.
    // Never execute booking or expose any user record from this path.
    var serviceNarrow = /^(?:what|which)\s+([a-z][a-z\s-]{1,55}?)\s+services?\s+(?:do you offer|are available)[?!. ]*$/i.exec(q);
    if (!wantsBooking(q) && serviceNarrow) {
      var wanted = serviceNarrow[1].trim().toLowerCase();
      var matches = (context.services || []).filter(function(s) {
        return s && s.active !== false &&
          String(s.label || '').toLowerCase().indexOf(wanted) !== -1;
      }).slice(0, 10);
      if (matches.length) {
        return {id:'services_filtered',state:'idle',action:'',
          text:'Currently listed ' + wanted + ' services: ' +
            matches.map(function(s) { return s.label; }).join(', ') +
            '. Check the Services page for the latest details and listed fees.',
          suggestions:['Show all service categories']};
      }
    }
    for (var i = 0; i < INTENTS.length; i++) {
      var intent = INTENTS[i];
      for (var k = 0; k < intent.keywords.length; k++) {
        if (q.indexOf(intent.keywords[k]) !== -1) {
          // 'hi' is a substring of 'breathing'. Greetings must be their own utterance.
          if (intent.id === 'greeting_hello' &&
              !/^(?:hi|hello|hey|kumusta|good morning|good afternoon|good evening)[!.,? ]*$/i.test(q)) continue;
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
    extractBookingContext: extractBookingContext,
    bookingDateIssue: bookingDateIssue,
    bookingTimeIssue: bookingTimeIssue,
    // Diagnostic build ID: verify the actual JavaScript loaded by the
    // running browser, especially when using Cloudflare or older tabs.
    version: '5.6.0-capstone-audit',
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
