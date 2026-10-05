/* ============================================================
   VETTIUI — the Ask Vetti workspace (frontend only)

   VETTI HAS EXACTLY TWO VISUAL ROLAS — never mixed:

     1. CANONICAL CHAT AVATAR (vetti-chat-head.png)
        One single image beside EVERY Vetti message, at one fixed size.
        It is identity, not expression, so it never switches with state.

     2. HEADER MASCOT
        One compact mascot INSIDE the workspace header, to the LEFT of
        the greeting, whose EXPRESSION changes with state. This is where
        idle / thinking / success / concerned and the rest are used.
        There is no separate mascot row and no mascot stage anywhere in
        the workspace.

   WORKSPACE STRUCTURE
     A. .vetti-greeting       compact header
                              (mascot | greeting | tools)
     B. .vetti-canvas         conversation thread (the only scroller)
     C. .vetti-carousel       suggested prompt rail
     D. .vetti-composer       the composer
     + .vetti-welcome         the one-time welcome layer over A-D

   CORE RULES
     - State changes, layout stays stable. Nothing reflows.
     - Thinking is TRANSIENT and never visible alongside the answer.
     - No permanent per-state caption anywhere. The temporary status is
       an ordinary thread row that is removed when the work finishes.
     - ONE avatar per TURN, never per row: the first row of a reply
       carries it and the rest align to the same gutter.

   IMAGE LOADING: the approved PNGs are large. The header mascot loads
   its current frame directly and crossfades between frames, so it is
   never momentarily blank. No asset is edited or resized.

   v4.2.0
   ============================================================ */
(function (global) {
  'use strict';

  var State = global.VettiState;
  var Onboarding = global.VettiOnboarding;
  // Vetti reads clinic data ONLY through VettiData and asks the portal to
  // act ONLY through VettiTools. This module deliberately names no mock
  // store and no portal action of its own, so swapping the local adapter
  // for an API one never reaches this file.
  var Data = global.VettiData;
  var Tools = global.VettiTools;
  var esc = Onboarding.escapeText;

  // §4: the ONE canonical chat avatar. It is vetti-chat-head.png — Vetti's
  // fixed identity beside every normal message. It is deliberately NOT a
  // state expression, so assistant identity never flickers between the
  // header mascot's faces.

  // §L: expressions that are worth a beat, then settle back to idle.
  // Without this the header mascot can sit in "Success" or "Concerned" long
  // after the moment has passed.
  var TRANSIENT_STATES = {
    success: 1, excited: 1, reminder: 1, concerned: 1,
    apology: 1, error: 1, booking: 1, pet_profile: 1
  };
  var TRANSIENT_MS = 2800;

  // ── Local UI state (not conversation content) ─────────────────────────
  var ui = {
    activePetId: null,
    idleAlt: false,          // idle-a <-> idle-b
    thinkFlip: false,        // thinking-a <-> thinking-b
    listening: false,        // composer focused
    thinking: false,         // a message is being resolved
    saving: false,           // a pet is being saved
    petFormOpen: false,
    busy: false,
    booted: false,
    epoch: 0,                // bumped by New Conversation to void in-flight replies
    presenceState: 'idle',
    presenceMotion: '',
    presenceReturn: 0,
    lastSuggestions: [],
    welcomeReturn: '',
    welcomeReplayed: false,
    tourIndex: 0
  };

  // §13: 2-4 useful contextual prompts. Fewer reads calmer than a wall of
  // chips, and leaves the rail from needing to scroll on desktop. These
  // four are the ones Vetti can actually ANSWER with something useful —
  // "Help me add another pet" is deliberately not on the opening rail; it
  // shows up once the user has seen the pet list, where adding a pet is
  // the obvious next thought.
  var DEFAULT_SUGGESTIONS_WITH_PET = [
    'Show my pets',
    'I want to book an appointment',
    'What services do you offer?',
    'Show my appointments'
  ];
  var DEFAULT_SUGGESTIONS_NO_PET = [
    'Help me add a pet',
    'What can Vetti do?'
  ];

  // ── DOM refs ──────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  var dom = {};

  function cacheDom() {
    dom.greeting = el('vettiGreeting');
    dom.warmLine = el('vettiWarmLine');
    dom.petSelectorHost = el('vettiPetSelector');
    dom.menu = el('vettiMenu');
    dom.menuBtn = el('vettiMenuBtn');
    dom.menuPop = el('vettiMenuPop');
    dom.presence = el('vettiHeaderMascotFrame');
    dom.presenceFrame = el('vettiHeaderMascotFrame');
    dom.presenceImg = el('vettiHeaderMascot');
    dom.canvas = el('vettiCanvas');
    dom.carousel = el('vettiCarousel');
    dom.inputZone = document.querySelector('.vetti-input-zone');
    dom.composer = el('vettiComposer');
    dom.input = el('vettiInput');
    dom.send = el('vettiSend');
    dom.scrollBtn = el('vettiScrollDown');
    dom.welcome = el('vettiWelcome');
    dom.welcomeTitle = el('vettiWelcomeTitle');
    dom.welcomeLead = el('vettiWelcomeLead');
    dom.welcomeSteps = el('vettiWelcomeSteps');
    dom.welcomeNote = el('vettiWelcomeNote');
    dom.welcomeStart = el('vettiWelcomeStart');
    dom.welcomeSkip = el('vettiWelcomeSkip');
    dom.welcomeMascot = el('vettiWelcomeMascot');
    dom.tour = el('vettiTour');
    dom.tourFrame = el('vettiTourFrame');
    dom.tourRing = el('vettiTourRing');
    dom.tourCard = el('vettiTourCard');
    dom.tourCount = el('vettiTourCount');
    dom.tourTitle = el('vettiTourTitle');
    dom.tourBody = el('vettiTourBody');
    dom.tourNext = el('vettiTourNext');
    dom.tourBack = el('vettiTourBack');
    dom.tourSkip = el('vettiTourSkip');
    dom.tourMasks = {
      top: document.querySelector('[data-vetti-tour-mask="top"]'),
      left: document.querySelector('[data-vetti-tour-mask="left"]'),
      right: document.querySelector('[data-vetti-tour-mask="right"]'),
      bottom: document.querySelector('[data-vetti-tour-mask="bottom"]')
    };
  }

  // ── Identity + pets ───────────────────────────────────────────────────
  function ownerId() {
    return Data.getOwnerId();
  }

  function firstName() {
    return Data.getFirstName() || 'there';
  }

  function pets() {
    return Data.getPets();
  }

  // ui.activePetId stays the ONE authoritative active-pet state; the
  // adapter only resolves that id against the store's current pets.
  function activePet() {
    var hit = Data.getActivePet(ui.activePetId);
    // Resolve-to-first is recorded, not just assumed, so the setter, the
    // dropdown and this read can never disagree about the active pet.
    if (hit) ui.activePetId = hit.petId;
    return hit;
  }

  // ── HEADER VETTI MASCOT ──────────────────────────────────────────────
  // Vetti lives INSIDE the workspace header. One location, one size, and
  // only the EXPRESSION changes here. No separate row, no square frame,
  // no permanent caption.
  //
  // Crossfade rather than swap src: replacing the src on a rendered
  // <img> blanks the box until a ~750 KB PNG decodes, which is very
  // visible on the one mascot the user is looking at. Each fade carries
  // a token so a faster state change supersedes a slower one instead of
  // orphaning faces.
  var presenceToken = 0;

  function crossfadePresence(src, alt) {
    if (!dom.presenceFrame) return;
    var current = dom.presenceFrame.querySelector('img[data-vetti-face]:last-of-type');
    if (current && current.getAttribute('src') === src) return;

    var token = ++presenceToken;
    var next = document.createElement('img');
    next.className = 'vetti-header-mascot-img';
    // Keep the id so the element stays referenceable after a swap.
    next.id = 'vettiHeaderMascot';
    next.setAttribute('data-vetti-face', '1');
    next.setAttribute('alt', alt);
    next.width = 1254;
    next.height = 1254;
    next.decoding = 'async';
    next.draggable = false;
    next.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
      + 'object-fit:contain;opacity:0;';

    function drop() {
      if (next.parentNode) next.parentNode.removeChild(next);
    }
    next.addEventListener('error', drop);

    function settle() {
      if (token !== presenceToken) { drop(); return; }
      var faces = dom.presenceFrame.querySelectorAll('img[data-vetti-face]');
      Array.prototype.forEach.call(faces, function (face) {
        if (face !== next && face.parentNode) face.parentNode.removeChild(face);
      });
      dom.presenceImg = next;
      next.style.transition = 'opacity .4s ease';
      next.style.opacity = '1';
    }

    dom.presenceFrame.appendChild(next);
    if (next.complete && next.naturalWidth) {
      window.requestAnimationFrame(settle);
    } else {
      next.addEventListener('load', settle, { once: true });
    }
    next.src = src;
  }

  // The temporary status lives in the THREAD as a transient bubble, so
  // there is no second status element to keep in sync with the header.
  function showTransient(text, dots) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-vetti vetti-thinking-row';
    node.id = 'vettiThinkingRow';
    node.innerHTML = chatAvatar()
      + '<div class="vetti-bubble vetti-bubble-vetti vetti-bubble-thinking">'
      + (dots === false ? '' : '<span class="vetti-dots" aria-hidden="true"><i></i><i></i><i></i></span>')
      + '<span>' + esc(text) + '</span>'
      + '</div>';
    turnNode().appendChild(node);
    scrollToBottom(true);
    return node;
  }

  function clearTransient() {
    var node = el('vettiThinkingRow');
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function setPresence(state) {
    var next = state;
    ui.presenceState = next;

    var motion = State.motionFor(next);
    if (dom.presenceFrame) {
      if (ui.presenceMotion && dom.presenceFrame.classList.contains(ui.presenceMotion)) {
        dom.presenceFrame.classList.remove(ui.presenceMotion);
      }
      if (motion) dom.presenceFrame.classList.add(motion);
      ui.presenceMotion = motion;
      dom.presenceFrame.setAttribute('data-state', next);
    }

    var src = State.mascotFor(next);
    if (next === 'idle' && ui.idleAlt) src = State.mascotFor('idle_alt');
    if (next === 'thinking' && ui.thinkFlip) src = State.mascotFor('thinking_alt');
    crossfadePresence(src, State.altFor(next));

    // §L: settle back to idle once a one-off expression has landed.
    window.clearTimeout(ui.presenceReturn);
    if (TRANSIENT_STATES[next] && !ui.busy && !ui.thinking && !ui.saving) {
      ui.presenceReturn = window.setTimeout(function () {
        if (!ui.busy && !ui.thinking && !ui.saving && !ui.listening) setPresence('idle');
      }, TRANSIENT_MS);
    }
  }

  // ── C. CONVERSATION THREAD ───────────────────────────────────────────
  function scrollToBottom(smooth) {
    if (!dom.canvas) return;
    dom.canvas.scrollTo
      ? dom.canvas.scrollTo({ top: dom.canvas.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      : (dom.canvas.scrollTop = dom.canvas.scrollHeight);
    if (dom.scrollBtn) dom.scrollBtn.hidden = true;
  }

  // Turn grouping: a reply and any card/form belonging to it sit in ONE
  // group, so a turn reads as a single response.
  var openTurn = null;

  function turnNode() {
    if (!openTurn || !openTurn.parentNode) {
      openTurn = document.createElement('div');
      openTurn.className = 'vetti-turn';
      dom.canvas.appendChild(openTurn);
    }
    return openTurn;
  }

  function closeTurn() { openTurn = null; }

  // §C + §N: ONE canonical avatar, ONE size. It appears on the FIRST row
  // of a turn only — repeating the same face on every row of one reply
  // reads as noise, and that repetition is what made the thread look
  // busy. Later rows in the same turn get an empty gutter instead, so
  // messages and cards stay aligned to one text column.
  //
  // Hidden from screen readers: the presence above already carries the
  // meaningful, expression-specific alt text.
  function chatAvatar() {
    if (turnHasRow()) {
      return '<span class="vetti-chat-avatar is-gutter" aria-hidden="true"></span>';
    }
    return '<span class="vetti-chat-avatar" aria-hidden="true">'
      + '<img src="' + esc(State.chatAvatarFor()) + '" alt=""'
      + ' width="1254" height="1254" decoding="async" draggable="false">'
      + '</span>';
  }

  function turnHasRow() {
    return !!(openTurn && openTurn.querySelector('.vetti-row'));
  }

  function renderVetti(text) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-vetti';
    node.innerHTML = chatAvatar()
      + '<div class="vetti-bubble vetti-bubble-vetti">'
      + '<p class="vetti-text">' + esc(text).replace(/\n/g, '<br>') + '</p>'
      + '</div>';
    turnNode().appendChild(node);
    return node;
  }

  function renderBlock(html, extraClass) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-block';
    node.innerHTML = chatAvatar()
      + '<div class="vetti-block ' + (extraClass || '') + '">' + html + '</div>';
    turnNode().appendChild(node);
    return node;
  }

  function renderUser(text) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-user';
    node.innerHTML = '<div class="vetti-bubble vetti-bubble-user">'
      + '<p class="vetti-text">' + esc(text).replace(/\n/g, '<br>') + '</p>'
      + '</div>';
    closeTurn();                       // the user speaks; the turn closes
    dom.canvas.appendChild(node);
    return node;
  }

  // ── THINKING (strictly transient) ───────────────────────────────────
  // §9: header mascot -> thinking, a temporary status bubble appears, and
  // the answer is NOT rendered yet. clearThinking() runs BEFORE the reply
  // is rendered, so "thinking" and a complete answer are never on screen
  // together.
  function showThinking() {
    ui.thinking = true;
    setPresence('thinking');
    return showTransient('Let me check that for you\u2026');
  }

  function clearThinking() {
    ui.thinking = false;
    clearTransient();
  }

  // ── Structured cards ───────────────────────────────────────────────
  // One container, only useful fields, no nested boxes. Three shapes:
  // a single pet, the full pet list, service categories and visits.

  // "Breed / Age / Weight" as a definition list. One pet, full detail.
  function petCardMarkup(pet) {
    if (!pet) return '';
    var rows = [];
    if (pet.breed) rows.push(['Breed', pet.breed]);
    if (pet.age) rows.push(['Age', pet.age + (Number(pet.age) === 1 ? ' year' : ' years')]);
    if (pet.weightKg) rows.push(['Weight', pet.weightKg + ' kg']);
    return ''
      + '<div class="vetti-card">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">' + esc(pet.name) + '</span>'
      + '    <span class="vetti-card-sub">' + esc(pet.species || 'Species not set')
      +      (pet.gender ? ' \u00b7 ' + esc(pet.gender) : '') + '</span>'
      + '  </div>'
      + (rows.length ? '<dl class="vetti-card-facts">'
          + rows.map(function (r) {
              return '<div class="vetti-card-fact"><dt>' + esc(r[0])
                + '</dt><dd>' + esc(r[1]) + '</dd></div>';
            }).join('')
          + '</dl>' : '')
      + '  <p class="vetti-card-note">From your records on this device.</p>'
      + '</div>';
  }

  function petAgeText(pet) {
    var bits = [];
    if (pet.age) bits.push(pet.age + (Number(pet.age) === 1 ? ' yr' : ' yrs'));
    if (pet.weightKg) bits.push(pet.weightKg + ' kg');
    return bits.join(' \u00b7 ');
  }

  // ALL pets, one compact row each, inside ONE card. A row is a button:
  // tapping it makes that pet the active one, which is the same thing
  // the header selector does — so the list doubles as a selector instead
  // of being a dead read-out.
  function petListMarkup(list) {
    if (!list || !list.length) return '';
    return ''
      + '<div class="vetti-card vetti-card-list">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">Your pets</span>'
      + '    <span class="vetti-card-sub">' + list.length
      +      (list.length === 1 ? ' pet on this account' : ' pets on this account') + '</span>'
      + '  </div>'
      + '  <ul class="vetti-petlist">'
      + list.map(function (pet) {
          var meta = [pet.species, pet.breed].filter(Boolean).join(' \u00b7 ');
          var age = petAgeText(pet);
          return '<li class="vetti-petlist-item">'
            + '<button type="button" class="vetti-petlist-row"'
            +   ' data-vetti-pet="' + esc(pet.petId) + '"'
            +   ' title="Talk about ' + esc(pet.name) + '">'
            +   '<span class="vetti-petlist-name">' + esc(pet.name) + '</span>'
            +   '<span class="vetti-petlist-meta">' + esc(meta || 'Species not set') + '</span>'
            +   '<span class="vetti-petlist-age">' + esc(age || '\u2014') + '</span>'
            + '</button></li>';
        }).join('')
      + '  </ul>'
      + '  <p class="vetti-card-note">From your records on this device.</p>'
      + '</div>';
  }

  // Service CATEGORIES, never the whole catalogue. Built from the same
  // shared catalog the Services page renders, so the two can never
  // disagree.
  //
  // Deliberately NO per-card button. Drilling in happens from the prompt
  // rail, so these cards stay scannable instead of turning into a wall of
  // links.
  function serviceCategoriesMarkup(groups) {
    if (!groups || !groups.length) {
      return '<div class="vetti-card"><p class="vetti-card-note">'
        + 'The service list is not loaded on this page yet.</p></div>';
    }
    return ''
      + '<div class="vetti-servicelist">'
      + groups.map(function (g) {
          return '<div class="vetti-service">'
            + '<div class="vetti-service-head">'
            + '  <span class="vetti-service-name">' + esc(g.name) + '</span>'
            + '  <span class="vetti-service-count">' + g.count
            +    (g.count === 1 ? ' service' : ' services') + '</span>'
            + '</div>'
            + '<p class="vetti-service-price">' + esc(g.priceText) + '</p>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="vetti-block-actions">'
      + '  <button type="button" class="vetti-inline-link" data-vetti-action="open-services">'
      + '    Open the full Services page</button>'
      + '</div>';
  }

  // ONE category, with the services actually inside it — only the fields
  // the shared catalog actually carries.
  function serviceGroupMarkup(group) {
    if (!group) return '';
    return ''
      + '<div class="vetti-card">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">' + esc(group.name) + '</span>'
      + '    <span class="vetti-card-sub">' + esc(group.priceText) + '</span>'
      + '  </div>'
      + '  <ul class="vetti-service-items">'
      + group.services.map(function (s) {
          return '<li class="vetti-service-item">'
            + '<span class="vetti-service-item-name">' + esc(s.label) + '</span>'
            + '<span class="vetti-service-item-price">'
            +   esc(s.price || 'Contact us for pricing') + '</span>'
            + '</li>';
        }).join('')
      + '  </ul>'
      + '  <p class="vetti-card-note">From the clinic service list on this device.</p>'
      + '</div>';
  }

  // ONE service. The catalog carries a label, a group and a price — and
  // nothing else, so nothing else is shown here. Writing a description
  // would be inventing clinical copy the clinic never published.
  function serviceDetailMarkup(service) {
    if (!service) return '';
    return ''
      + '<div class="vetti-card">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">' + esc(service.label) + '</span>'
      + '    <span class="vetti-card-sub">' + esc(service.group) + '</span>'
      + '  </div>'
      + '  <dl class="vetti-card-facts">'
      + '    <div class="vetti-card-fact"><dt>Price</dt><dd>'
      +      esc(service.price || 'Contact us for pricing') + '</dd></div>'
      + '  </dl>'
      + '  <p class="vetti-card-note">The service list has no description for this '
      + 'one yet \u2014 the Services page is the source of truth.</p>'
      + '</div>';
  }

  // "What can Vetti do?" \u2014 the honest list of what is actually wired up,
  // including what is NOT.
  function capabilityListMarkup() {
    return ''
      + '<div class="vetti-card">'
      + '  <ul class="vetti-capabilities">'
      + '    <li>Keep track of your pets and their details.</li>'
      + '    <li>Show your pets and your appointments as simple cards.</li>'
      + '    <li>Explain what the clinic offers, by category.</li>'
      + '    <li>Guide you through adding a pet, step by step.</li>'
      + '    <li>Get an appointment started in the clinic\u2019s own booking flow.</li>'
      + '    <li>Answer simple questions about the portal and clinic hours.</li>'
      + '  </ul>'
      + '  <p class="vetti-card-note">I can\u2019t diagnose, prescribe, or make a live '
      + 'booking for you \u2014 that still goes through the clinic.</p>'
      + '</div>';
  }

  // ── APPOINTMENTS ──
  // Appointments: Pet / Service / Date / Time / Status. Upcoming first,
  // then the most recent past visits, both capped so the answer stays a
  // summary rather than a dump.
  function appointmentListMarkup(buckets) {
    var upcoming = buckets.upcoming.slice(0, 3);
    var past = buckets.past.slice(0, 3);
    if (!upcoming.length && !past.length) {
      return ''
        + '<div class="vetti-card">'
        + '  <p class="vetti-card-note">No visits are recorded on this account yet.</p>'
        + '</div>';
    }
    function group(label, rows, tone) {
      if (!rows.length) return '';
      return '<div class="vetti-appt-group">'
        + '<p class="vetti-appt-group-label">' + label + '</p>'
        + '<ul class="vetti-appt-list">'
        + rows.map(function (a) {
            return '<li class="vetti-appt' + (tone ? ' is-' + tone : '') + '">'
              + '<div class="vetti-appt-head">'
              +   '<span class="vetti-appt-pet">' + esc(a.pet) + '</span>'
              +   apptStatusBadge(a.status)
              + '</div>'
              + '<p class="vetti-appt-service">' + esc(a.service) + '</p>'
              + '<p class="vetti-appt-when">' + esc(a.date) + ' \u00b7 ' + esc(a.time) + '</p>'
              + '</li>';
          }).join('')
        + '</ul></div>';
    }
    return ''
      + '<div class="vetti-block vetti-block-appts">'
      + group('Upcoming', upcoming, '')
      + group('Recent visits', past, 'past')
      + '<p class="vetti-card-note">From the clinic demo records on this device.</p>'
      + '</div>';
  }

  // ONE appointment, for "show me my upcoming visit" and for the
  // reschedule / cancel hand-off. Carries the reference number when the
  // shared record has one, because that is what the clinic asks for.
  function singleAppointmentMarkup(a) {
    if (!a) return '';
    return ''
      + '<div class="vetti-card vetti-appt is-single">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">' + esc(a.pet) + '</span>'
      +    apptStatusBadge(a.status)
      + '  </div>'
      + '  <p class="vetti-appt-service">' + esc(a.service) + '</p>'
      + '  <p class="vetti-appt-when">' + esc(a.date) + ' \u00b7 ' + esc(a.time) + '</p>'
      + (a.referenceNo
          ? '  <p class="vetti-card-note">Reference ' + esc(a.referenceNo) + '</p>' : '')
      + '</div>';
  }

  // Reuses the portal's own badge markup so a status never looks like a
  // different status than it does on My Appointments.
  function apptStatusBadge(status) {
    if (typeof _apptStatusBadge === 'function') return _apptStatusBadge(status);
    return '<span class="status-badge ' + esc(status) + '">' + esc(status) + '</span>';
  }

  function fmtDate(value) {
    if (typeof _fmtApptDateShort === 'function') return _fmtApptDateShort(value);
    return String(value || '\u2014');
  }
  function fmtTime(value) {
    if (typeof _fmtApptTimeShort === 'function') return _fmtApptTimeShort(value);
    return String(value || '');
  }

  // ── Active-pet selector ────────────────────────────────────────────
  function renderPetSelector() {
    if (!dom.petSelectorHost) return;
    var list = pets();
    if (list.length === 0) {
      dom.petSelectorHost.hidden = true;
      dom.petSelectorHost.innerHTML = '';
      return;
    }
    dom.petSelectorHost.hidden = false;
    var current = activePet();
    dom.petSelectorHost.innerHTML = ''
      + '<label for="vettiActivePet">Talking about</label>'
      + '<select id="vettiActivePet">'
      + list.map(function (p) {
          return '<option value="' + esc(p.petId) + '"'
            + (String(p.petId) === String(current.petId) ? ' selected' : '') + '>'
            + esc(p.name) + '</option>';
        }).join('')
      + '</select>';
  }

  // ── D + E. SUGGESTED PROMPT RAIL ──────────────────────────────────────
  function renderCarousel(items) {
    if (!dom.carousel) return;
    var list = (items && items.length) ? items : suggestionsForContext();
    ui.lastSuggestions = list.slice();

    if (!list.length) { hideCarousel(); return; }
    dom.carousel.hidden = false;
    // The label is what makes the rail read as guided assistant prompts
    // rather than a row of unexplained buttons. One short line, and it is
    // hidden from screen readers because the track already announces
    // itself as a group.
    dom.carousel.innerHTML = ''
      + '<p class="vetti-carousel-label" aria-hidden="true">Try asking</p>'
      + '<div class="vetti-carousel-rail">'
      + '  <button type="button" class="vetti-carousel-btn vetti-carousel-prev"'
      + '          data-vetti-scroll="-1" aria-label="Scroll suggestions left"'
      + '          aria-controls="vettiCarouselTrack" disabled>'
      + '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + '         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '      <polyline points="15 18 9 12 15 6"/></svg>'
      + '  </button>'
      + '  <div class="vetti-carousel-track" id="vettiCarouselTrack" role="group"'
      + '       aria-label="Suggested questions" tabindex="0">'
      + list.map(function (s) {
          // The label lives in its own span so a long prompt can ellipsis
          // inside the pill instead of spilling out past its own border.
          return '<button type="button" class="vetti-chip" data-vetti-prompt="' + esc(s) + '"'
            + ' title="' + esc(s) + '">'
            + '<span class="vetti-chip-label">' + esc(s) + '</span></button>';
        }).join('')
      + '  </div>'
      + '  <button type="button" class="vetti-carousel-btn vetti-carousel-next"'
      + '          data-vetti-scroll="1" aria-label="Scroll suggestions right"'
      + '          aria-controls="vettiCarouselTrack" disabled>'
      + '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + '         stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '      <polyline points="9 18 15 12 9 6"/></svg>'
      + '  </button>'
      + '</div>';

    window.requestAnimationFrame(syncCarouselControls);
  }

  function hideCarousel() {
    if (!dom.carousel) return;
    dom.carousel.innerHTML = '';
    dom.carousel.hidden = true;
  }

  function syncCarouselControls() {
    var track = el('vettiCarouselTrack');
    if (!track) return;
    var rail = track.parentNode;
    var scrollable = track.scrollWidth - track.clientWidth > 4;
    var atStart = track.scrollLeft <= 1;
    var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
    // is-at-start / is-at-end let CSS fade only the edge that still has
    // content behind it, so a phone never shows a fade over a chip the
    // user is already looking at.
    if (rail) {
      rail.classList.toggle('is-scrollable', scrollable);
      rail.classList.toggle('is-at-start', atStart);
      rail.classList.toggle('is-at-end', atEnd);
    }
    var prev = dom.carousel ? dom.carousel.querySelector('.vetti-carousel-prev') : null;
    var next = dom.carousel ? dom.carousel.querySelector('.vetti-carousel-next') : null;
    if (prev) prev.disabled = !scrollable || atStart;
    if (next) next.disabled = !scrollable || atEnd;
  }

  function suggestionsForContext() {
    return pets().length ? DEFAULT_SUGGESTIONS_WITH_PET : DEFAULT_SUGGESTIONS_NO_PET;
  }

  function successSuggestions(pet) {
    if (!pet) return DEFAULT_SUGGESTIONS_WITH_PET;
    return [
      'I want to book ' + pet.name + ' an appointment',
      'Show me ' + pet.name + "'s profile",
      'What services do you offer?'
    ];
  }

  // ── ACCOUNT SNAPSHOT ─────────────────────────────────────────────────
  // ONE compact card, two lines: who is on this account and when the
  // next visit is. Not a dashboard \u2014 no counters, no icons, no chart.
  // It exists because an owner opening Vetti should see something true
  // about their OWN account, instead of one sentence floating above a
  // field of empty thread. Every figure is read from the same stores the
  // My Pets and My Appointments pages read.
  //
  // Nothing here is invented: no pets means no snapshot at all.
  function glanceMarkup() {
    var list = pets();
    if (!list.length) return '';

    var buckets = appointmentsFor();
    var next = buckets.upcoming[0];

    return ''
      + '<div class="vetti-card vetti-glance">'
      + '  <p class="vetti-glance-label">Your pets</p>'
      + '  <p class="vetti-glance-line">'
      + '    <strong>' + list.length + (list.length === 1 ? ' pet' : ' pets') + '</strong>'
      + '  </p>'
      + '  <p class="vetti-glance-names">'
      +    esc(list.map(function (p) { return p.name; }).join(' \u00b7 '))
      + '  </p>'
      + '  <p class="vetti-glance-label">Upcoming</p>'
      + (next
          ? '  <p class="vetti-glance-line"><strong>' + esc(next.pet) + '</strong></p>'
            + '  <p class="vetti-glance-sub">' + esc(next.service) + '</p>'
            + '  <p class="vetti-glance-sub is-quiet">' + esc(next.date)
            + ' \u00b7 ' + esc(next.time) + '</p>'
          : '  <p class="vetti-glance-sub is-quiet">No upcoming visits booked yet.</p>')
      + '</div>';
  }

  // The snapshot card on its own, for the case where the opening LINE is
  // already in the thread (behind the welcome layer, for instance).
  function renderSnapshot() {
    var glance = glanceMarkup();
    if (glance) renderBlock(glance, 'vetti-card-block');
    return !!glance;
  }

  // The opening turn: one line of welcome plus the snapshot, then the
  // rail. Used by the returning-user entry, so the workspace looks the
  // same whichever way a user arrives at it.
  function renderOpening(message) {
    renderVetti(message);
    renderSnapshot();
    renderCarousel(suggestionsForContext());
    scrollToBottom(true);
  }

  // ── A. WORKSPACE HEADER ───────────────────────────────────────────────
  function renderGreeting() {
    if (!dom.greeting) return;
    var first = firstName();
    var word = State.greetingWord();
    // Before the welcome is dismissed Vetti introduces herself in the
    // header too, so the dimmed workspace behind the layer already reads
    // as hers. Afterwards it settles back to a plain greeting.
    dom.greeting.textContent = State.isFirstTime()
      ? word + ', ' + first + '! I\u2019m Vetti.'
      : word + ', ' + first + '.';
    if (dom.warmLine) {
      dom.warmLine.textContent = State.warmLine(ownerId(), (activePet() || {}).name || '');
    }
  }

  // ── THE ONE-TIME WELCOME LAYER ───────────────────────────────────────
  // Vetti's first meeting is a guided layer over the workspace, not a run
  // of chat bubbles. The workspace is rendered BEHIND it and dimmed, so
  // the transition is a layer lifting rather than a page changing — and a
  // zero-pet owner lands straight on the add-pet form underneath.
  function openWelcome() {
    if (!dom.welcome) return;
    setPresence('greeting');
    renderWelcomeCopy();
    dom.welcome.hidden = false;
    // Focus the primary exit. Called synchronously AND on the next frame:
    // when this runs from mount() the layer is still being laid out, and
    // a browser that will not focus an unpainted element leaves the
    // keyboard user outside the dialog.
    if (dom.welcomeStart) {
      dom.welcomeStart.focus();
      window.requestAnimationFrame(function () {
        if (!dom.welcome.hidden && dom.welcomeStart) dom.welcomeStart.focus();
      });
    }
  }

  function renderWelcomeCopy() {
    if (!dom.welcome) return;
    // The welcome's mascot comes from the ONE asset map, like every other
    // Vetti face — swapping the expression here means changing one line in
    // vetti-state.js, not hunting filenames.
    if (dom.welcomeMascot) {
      dom.welcomeMascot.src = State.mascotFor('greeting');
      dom.welcomeMascot.alt = State.altFor('greeting');
    }
    if (dom.welcomeTitle) {
      dom.welcomeTitle.textContent = 'Hi ' + firstName() + ', I\u2019m Vetti.';
    }
    if (dom.welcomeLead) dom.welcomeLead.textContent = Onboarding.welcomeLead();
    if (dom.welcomeNote) dom.welcomeNote.textContent = Onboarding.welcomeNote();
    if (!dom.welcomeSteps) return;
    dom.welcomeSteps.innerHTML = Onboarding.welcomeSteps().map(function (step, i) {
      return '<li class="vetti-welcome-step">'
        + '<span class="vetti-welcome-step-num" aria-hidden="true">' + (i + 1) + '</span>'
        + '<span class="vetti-welcome-step-text">'
        + '<strong>' + esc(step.title) + '</strong>'
        + esc(step.body)
        + '</span>'
        + '</li>';
    }).join('');
  }

  // One exit for both buttons. The flags are set HERE, not when the layer
  // renders, so walking away from the welcome still shows it next time.
  function completeWelcome(skipped) {
    if (!dom.welcome || dom.welcome.hidden) return;
    dom.welcome.hidden = true;
    enterWorkspace(skipped);
  }

  // "Let's Get Started" is NOT a synonym for Skip: it closes the welcome
  // and opens the walkthrough. The workspace is only entered once the
  // walkthrough finishes or is itself skipped.
  function startTutorial() {
    if (!dom.welcome || dom.welcome.hidden) return;
    dom.welcome.hidden = true;
    openTutorial();
  }

  // Shared by all three exits: Skip, Finish, and Skip Tutorial.
  function enterWorkspace(skipped) {
    State.markSeenForever();
    State.markIntroShown();

    // A REPLAY sits over a thread that already has its opening turn, so
    // dismissing it must not add a second copy of that turn. Only the
    // very first welcome renders the opening content.
    if (ui.welcomeReplayed) {
      ui.welcomeReplayed = false;
      if (dom.input) dom.input.focus();
      return;
    }

    // The greeting drops the "I'm Vetti" half now that the layer said it.
    renderGreeting();
    if (ui.welcomeReturn) {
      setPresence(ui.welcomeReturn);
      ui.welcomeReturn = '';
    }
    // The workspace behind the layer already carries whatever it should
    // (the add-pet form for a zero-pet owner), so this only finishes the
    // turn and puts the rail up.
    var hasPets = pets().length > 0;
    if (hasPets) {
      // With pets, the layer is replaced by a real opening line plus the
      // account snapshot — that is the thread the user works in from now on.
      renderVetti(skipped
        ? 'No problem \u2014 ask me about your pets, your visits, or what the clinic offers.'
        : 'Great. Ask me about your pets, your visits, or what the clinic offers.');
      renderSnapshot();
    }
    // With NO pets the guidance and the form are already on screen; a
    // "ask me about your pets" line underneath the form would read as
    // though it came after the form, which is not what it means.
    renderCarousel(suggestionsForContext());
    if (hasPets) {
      scrollToBottom(true);
    } else {
      // Show the guidance line and the top of the form together, rather
      // than dropping straight to the bottom of a form taller than the
      // thread.
      var first = dom.canvas.querySelector('.vetti-row-vetti');
      if (first && first.scrollIntoView) {
        first.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else {
        scrollToBottom(true);
      }
    }
    if (dom.input) dom.input.focus();
  }

  // ── THE GUIDED WALKTHROUGH ────────────────────────────────────────────
  // What "Let's Get Started" opens: four short steps, each pointing at one
  // real element. The spotlight is built from FOUR mask panels around the
  // target, not a full-screen sheet with a hole — so the highlighted
  // element stays genuinely clickable while everything else is blocked.
  //
  // Every step can be exited with Skip Tutorial, and Back/Next are always
  // present where they mean something.
  var TOUR_PAD = 6;          // breathing room around the highlighted target
  var TOUR_GAP = 12;         // space between the target and the card

  function tourSteps() {
    return Onboarding.tutorialSteps(pets().length > 0);
  }

  // ── TUTORIAL-ONLY PRESENTATION ─────────────────────────────────────────
  // The walkthrough is allowed to SHOW examples. It is never allowed to
  // CREATE anything.
  //
  // Hard rules this layer keeps, because the tutorial runs against a real
  // account with real records behind it:
  //   · no pet, appointment, service or owner is written or read;
  //   · nothing is written to localStorage;
  //   · the active pet is never changed;
  //   · no intent is resolved and send() is never called;
  //   · examples are attached straight to the DOM — never through
  //     renderVetti / renderBlock, which would fold them into the real
  //     conversation history;
  //   · every node carries data-vetti-tour-demo, so clearTourDemo() can
  //     sweep the entire set in one query.
  //
  // Two real elements are borrowed for the duration of a step and handed
  // back untouched: the suggestion rail (step 2) and the composer
  // placeholder (step 1). Both are snapshotted first and restored exactly.
  var tourDemo = { active: '', rail: null, placeholder: null };

  function tourDemoMarkup(kind) {
    var hasPets = pets().length > 0;
    if (kind === 'composer') return Onboarding.tutorialExampleInput();
    if (kind === 'suggestions') return Onboarding.tutorialSuggestionChips(hasPets);
    if (kind === 'petform') return Onboarding.tutorialPetFormDemo();
    if (kind === 'result') return Onboarding.tutorialExampleCard();
    return '';
  }

  // One step's example at a time: whatever is on screen is torn down before
  // the next one goes up, so stepping back and forth can never stack two.
  function showTourDemo(kind) {
    clearTourDemo();
    var html = tourDemoMarkup(kind);
    if (!html) return null;

    if (kind === 'suggestions') {
      if (!dom.carousel) return null;
      // Snapshot the REAL rail verbatim and give it back verbatim — an
      // account with no suggestions stays without them afterwards.
      tourDemo.rail = { html: dom.carousel.innerHTML, hidden: dom.carousel.hidden };
      dom.carousel.innerHTML = html;
      dom.carousel.hidden = false;
      var rail = dom.carousel.querySelector('.vetti-carousel-rail');
      if (rail) rail.classList.remove('is-scrollable');
    } else {
      var host = kind === 'composer' ? dom.inputZone : dom.canvas;
      if (!host) return null;
      // Into the thread, but NOT inside a .vetti-turn: the example sits
      // beside the conversation instead of pretending to be part of it.
      host.insertAdjacentHTML(kind === 'composer' ? 'afterbegin' : 'beforeend', html);
    }

    if (kind === 'composer' && dom.input) {
      tourDemo.placeholder = {
        had: dom.input.hasAttribute('placeholder'),
        value: dom.input.getAttribute('placeholder')
      };
      dom.input.setAttribute('placeholder', 'What services do you offer?');
    }

    tourDemo.active = kind;
    var node = document.querySelector('[data-vetti-tour-demo="' + kind + '"]');
    revealInCanvas(node);
    return node;
  }

  // Removes every tutorial-only node and hands back anything borrowed.
  // Called from closeTutorial(), so Finish, Skip Tutorial, Escape and a
  // replay closing all take the same exit.
  function clearTourDemo() {
    var nodes = document.querySelectorAll('[data-vetti-tour-demo]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
    if (tourDemo.rail) {
      if (dom.carousel) {
        dom.carousel.innerHTML = tourDemo.rail.html;
        dom.carousel.hidden = tourDemo.rail.hidden;
      }
      tourDemo.rail = null;
    }
    if (tourDemo.placeholder) {
      if (dom.input) {
        if (tourDemo.placeholder.had) {
          dom.input.setAttribute('placeholder', tourDemo.placeholder.value);
        } else {
          dom.input.removeAttribute('placeholder');
        }
      }
      tourDemo.placeholder = null;
    }
    tourDemo.active = '';
  }

  // Scrolls the example into view using the thread's OWN scrollTop only, so
  // the spotlight never lands on a node clipped outside the canvas.
  function revealInCanvas(node) {
    if (!node || !dom.canvas || !dom.canvas.scrollHeight) return;
    var cr = dom.canvas.getBoundingClientRect();
    var nr = node.getBoundingClientRect();
    if (nr.height >= cr.height) return;
    if (nr.top >= cr.top + 8 && nr.bottom <= cr.bottom - 8) return;
    dom.canvas.scrollTop += (nr.top - cr.top) - (cr.height - nr.height) / 2;
  }

  // What the current step spotlights. Usually the real element named by
  // `target` — the example for that step sits inside it, so framing the
  // element frames both. A step marked `spot: 'demo'` frames its example
  // instead, because there the example IS the thing being taught.
  function currentSpotlight() {
    var step = tourSteps()[ui.tourIndex];
    if (!step) return {};
    var node = step.spot === 'demo' && tourDemo.active
      ? document.querySelector('[data-vetti-tour-demo="' + tourDemo.active + '"]')
      : null;
    return { selector: step.target, node: node };
  }

  function openTutorial() {
    if (!dom.tour) return;
    clearTourDemo();
    ui.tourIndex = 0;
    dom.tour.hidden = false;
    renderTourStep();
    var focus = ui.tourIndex === 0 ? dom.tourNext : dom.tourNext;
    if (focus) focus.focus();
  }

  function renderTourStep() {
    var steps = tourSteps();
    if (!steps.length) { closeTutorial(); enterWorkspace(false); return; }
    ui.tourIndex = Math.max(0, Math.min(ui.tourIndex, steps.length - 1));
    var step = steps[ui.tourIndex];
    var last = ui.tourIndex === steps.length - 1;

    if (dom.tourCount) {
      dom.tourCount.textContent = 'Step ' + (ui.tourIndex + 1) + ' of ' + steps.length;
    }
    if (dom.tourTitle) dom.tourTitle.textContent = step.title;
    if (dom.tourBody) dom.tourBody.textContent = step.body;
    if (dom.tourNext) dom.tourNext.textContent = last ? 'Finish' : 'Next';
    if (dom.tourBack) dom.tourBack.hidden = ui.tourIndex === 0;

    // Every step starts from a clean slate: the previous step's example is
    // torn down even when this step has none of its own, so Back/Next can
    // never leave a stale example on screen.
    clearTourDemo();
    // The example goes up BEFORE the spotlight is measured, so the ring
    // frames a region that already contains it.
    if (step.demo) showTourDemo(step.demo);
    var spot = currentSpotlight();
    positionTour(spot.selector, spot.node);
  }

  // Places the four masks, the ring and the card. Everything is computed
  // against the SHELL, because the walkthrough is anchored to the
  // workspace rather than the viewport — that is what keeps it correct on
  // a phone inside the portal's own layout.
  //
  // `demoNode` is this step's tutorial example when it has one. It is the
  // better target than the region behind it: step 4 should frame the
  // example card, not the whole thread.
  function positionTour(selector, demoNode) {
    if (!dom.tour || !dom.tourFrame) return;
    var shell = dom.tourFrame;
    var shellRect = shell.getBoundingClientRect();
    var demoUsable = demoNode && demoNode.offsetParent !== null && demoNode.offsetWidth > 0;
    var target = demoUsable ? demoNode : (selector ? document.querySelector(selector) : null);

    // A target that is missing or hidden falls back to framing the whole
    // workspace, so a step can never leave the user staring at nothing.
    var visible = target && target.offsetParent !== null && target.offsetWidth > 0;
    var rect = visible
      ? target.getBoundingClientRect()
      : { left: shellRect.left + 8, top: shellRect.top + 8,
          right: shellRect.right - 8, bottom: shellRect.bottom - 8,
          width: shellRect.width - 16, height: shellRect.height - 16 };

    var W = shellRect.width;
    var H = shellRect.height;
    var left = Math.max(0, rect.left - shellRect.left - TOUR_PAD);
    var top = Math.max(0, rect.top - shellRect.top - TOUR_PAD);
    var width = Math.min(W - left, rect.width + TOUR_PAD * 2);
    var height = Math.min(H - top, rect.height + TOUR_PAD * 2);

    // The hole. Four panels, so the hole is genuinely open for clicks.
    setMask('top', 0, 0, W, top);
    setMask('left', 0, top, left, height);
    setMask('right', left + width, top, W - left - width, height);
    setMask('bottom', 0, top + height, W, H - top - height);

    if (dom.tourRing) {
      dom.tourRing.style.left = left + 'px';
      dom.tourRing.style.top = top + 'px';
      dom.tourRing.style.width = width + 'px';
      dom.tourRing.style.height = height + 'px';
    }

    positionTourCard(left, top, width, height, W, H);
  }

  // The card goes BELOW the target when it fits, ABOVE it when it does not,
  // and is clamped horizontally either way — so Skip Tutorial is always on
  // screen and never off the edge of a phone.
  function positionTourCard(left, top, width, height, W, H) {
    if (!dom.tourCard) return;
    var card = dom.tourCard;
    var cardH = card.offsetHeight || 190;
    var below = top + height + TOUR_GAP;
    var y = below + cardH <= H ? below : (top - TOUR_GAP - cardH >= 0 ? top - TOUR_GAP - cardH : Math.max(0, (H - cardH) / 2));
    var x = left + width / 2 - card.offsetWidth / 2;
    card.style.left = Math.max(8, Math.min(x, W - card.offsetWidth - 8)) + 'px';
    card.style.top = Math.max(8, Math.min(y, H - cardH - 8)) + 'px';
  }

  function setMask(which, x, y, w, h) {
    var node = dom.tourMasks ? dom.tourMasks[which] : null;
    if (!node) return;
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.width = Math.max(0, w) + 'px';
    node.style.height = Math.max(0, h) + 'px';
  }

  function closeTutorial() {
    // FIRST, and unconditionally: every exit — Finish, Skip Tutorial,
    // Escape — has to leave the workspace exactly as it found it.
    clearTourDemo();
    if (!dom.tour) return;
    dom.tour.hidden = true;
    ui.tourIndex = 0;
  }

  function nextTourStep() {
    if (ui.tourIndex >= tourSteps().length - 1) { closeTutorial(); enterWorkspace(false); return; }
    ui.tourIndex++;
    renderTourStep();
  }

  function prevTourStep() {
    if (ui.tourIndex === 0) return;
    ui.tourIndex--;
    renderTourStep();
  }

  // Re-entering the workspace through Skip Tutorial is the same outcome as
  // Skip on the welcome — it just says so more honestly.
  function skipTutorial() {
    closeTutorial();
    enterWorkspace(true);
  }

  // Replay runs BOTH layers over the live workspace: the welcome, then the
  // walkthrough if the owner chooses it. The thread behind is left alone,
  // so nothing is duplicated when it is dismissed.
  function replayIntro() {
    ui.welcomeReturn = pets().length ? 'idle' : 'add_pet';
    ui.welcomeReplayed = true;
    State.clearIntroShown();
    openWelcome();
    Tools.notify('Welcome replayed.', 'info');
  }

  // ── OPENING ─────────────────────────────────────────────────────
  function showOpening() {
    renderGreeting();
    renderPetSelector();

    // FIRST TIME: render the real workspace FIRST, then lift the welcome
    // layer over it. The user sees where they are before being asked
    // anything, and a zero-pet owner already has the add-pet form waiting
    // underneath when the layer closes.
    if (State.isFirstTime()) {
      if (!pets().length) zeroPetNotice({ hold: true });
      else {
        setPresence('greeting');
        renderCarousel(suggestionsForContext());
      }
      openWelcome();
      return;
    }

    // RETURNING USER: ONE opening line naming what Vetti can do for the
    // pet this account is actually working with. The header already says
    // "Good afternoon, Maria.", so repeating it in the thread was noise.
    if (pets().length) {
      setPresence('idle');
      renderOpening('Here whenever you need me. I can show you ' + activePet().name
        + ', your other pets, your visits, or what the clinic offers.');
      return;
    }
    zeroPetNotice();
  }

  // §10: zero pets -> one sentence of guidance -> the compact form appears
  // IMMEDIATELY, so the space does something instead of sitting empty.
  function zeroPetNotice(opts) {
    setPresence('add_pet');
    renderVetti('Before we continue, let\u2019s add your first pet.');
    renderVetti('It only takes a moment \u2014 I just need the basics, and you can '
      + 'fill in the rest later.');
    openPetForm({ focus: false });
    // Under the welcome layer the rail sits behind the dimming, so it is
    // rendered by completeWelcome() instead of here.
    if (!(opts && opts.hold)) renderCarousel(DEFAULT_SUGGESTIONS_NO_PET);
  }

  // ── COMPACT PET FORM ─────────────────────────────────────────────────
  // opts.focus defaults to true; the automatic zero-pet path passes false
  // so the page does not steal focus on load.
  function openPetForm(opts) {
    if (ui.petFormOpen) return;
    ui.petFormOpen = true;
    var hasPets = pets().length > 0;
    setPresence('add_pet');
    renderBlock(Onboarding.petFormMarkup({ hasPets: hasPets }), 'vetti-form-block');
    var form = el('vettiPetForm');
    if (form) {
      Onboarding.installGuards(form);
      Onboarding.wireCustomFields(form);
      var name = el('vettiPetName');
      var focus = !opts || opts.focus !== false;
      if (name && focus) window.setTimeout(function () { name.focus(); }, 60);
    }
    // Reveal the form when it appears, so its actions and footnote are
    // never stranded below the fold. If the whole form fits in the
    // thread, `block: 'nearest'` shows it while keeping the explanation
    // above it in view. On a short phone the form is TALLER than the
    // thread, and there the only honest position is the newest content,
    // so scroll to the bottom instead of pretending it all fits.
    window.setTimeout(function () {
      var node = form || dom.canvas.querySelector('.vetti-form-block');
      if (!node) { scrollToBottom(true); return; }
      if (node.offsetHeight <= dom.canvas.clientHeight && node.scrollIntoView) {
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        scrollToBottom(true);
      }
    }, 40);
  }

  function closePetForm() {
    var node = dom.canvas.querySelector('[data-vetti-form]');
    if (node) {
      var block = node.closest('.vetti-block') || node.closest('.vetti-row');
      if (block) block.remove();
    }
    ui.petFormOpen = false;
    Onboarding.clearErrors();
  }

  function handlePetFormSubmit(event) {
    event.preventDefault();
    var result = Onboarding.submitPetForm();
    if (!result.ok) {
      // Validation already shows inline field errors and moves focus.
      if (result.error === 'validation') return;
      setPresence('error');
      renderVetti(
        result.error === 'no_session'
          ? 'I could not tell who you are, so I stopped rather than save the pet to the wrong account.'
          : 'Something went wrong saving that pet. Please try again.'
      );
      return;
    }

    var pet = result.pet;
    closePetForm();
    // The pet just saved IS the active one, and it goes in through the one
    // setter so the dropdown cannot lag behind. Its acknowledgement is
    // the save message below, not a second "now talking about" line.
    applyActivePet(pet.petId);

    // §9/§AC: a transient "Saving Bruno…" bubble, then success.
    ui.saving = true;
    setPresence('thinking');
    showTransient('Saving ' + pet.name + '\u2026', false);

    window.setTimeout(function () {
      ui.saving = false;
      clearTransient();              // removed before the reply renders
      setPresence('success');
      renderVetti(pet.name + ' is now part of your account.');
      renderVetti('You can add more details anytime from My Pets, or ask me to help '
        + 'you complete them later.');
      renderBlock(petCardMarkup(pet), 'vetti-card-block');

      renderPetSelector();
      renderGreeting();
      renderCarousel(successSuggestions(pet));
      scrollToBottom(true);

      Tools.refreshPetViews();
    }, 460);
  }

  // ── Actions that hand off to the portal's own UI ───────────────────────
  // Vetti states an INTENT here and VettiTools decides where it lands. No
  // portal action is named in this file. Every tool degrades safely when
  // the target screen is absent: Vetti never claims a change it did not
  // make, because the mutation happens in the screen the owner already
  // trusts, not here.
  //
  // TODO(BACKEND): reschedule/cancel become POST endpoints once the
  // appointment API owns the lifecycle.
  function runAction(answer) {
    switch (answer.action) {
      case 'openPetForm':
        // Vetti's own in-conversation form, not a portal handoff.
        openPetForm();
        return;
      case 'openBooking':
        Tools.startBooking({ pet: activePet() });
        return;
      case 'openReschedule':
        Tools.prepareReschedule(answer.appointment);
        return;
      case 'openCancel':
        Tools.prepareCancellation(answer.appointment);
        return;
      default:
    }
  }

  // ── Sending a message ─────────────────────────────────────────────────
  function buildContext() {
    var list = pets();
    return {
      firstName: firstName(),
      hasPets: list.length > 0,
      pets: list,
      activePet: activePet(),
      anotherPet: nextPet(),
      appointments: appointmentsFor(),
      services: serviceCatalog(),
      serviceGroups: serviceGroups(),
      suggestionsWithPet: DEFAULT_SUGGESTIONS_WITH_PET,
      suggestionsNoPet: DEFAULT_SUGGESTIONS_NO_PET,
      // Future AI request context: the saved preference rides along.
      // Today's deterministic resolver ignores it; the Gemini controller
      // will read it when composing the request.
      responseLanguage: State.getResponseLanguage()
    };
  }

  // The pet AFTER the active one, wrapping round. This is what "Show me
  // another pet" resolves to \u2014 never the add-pet form.
  function nextPet() {
    var list = pets();
    if (list.length < 2) return list[0] || null;
    var current = activePet();
    var i = 0;
    list.forEach(function (p, index) {
      if (String(p.petId) === String(current.petId)) i = index;
    });
    return list[(i + 1) % list.length];
  }

  // The owner's own visits, split the same way My Appointments splits
  // them. The split, the status normalisation and the display formatting
  // all live in VettiData, so every Vetti screen reads one shape from one
  // place instead of each re-deriving it.
  function appointmentsFor() {
    return Data.getAppointmentsByBucket();
  }
  // The active service catalog, read through the adapter. One read,
  // reused by the category grouping below, so the two can never disagree.
  function serviceCatalog() {
    return Data.getServices();
  }

  // Service categories, read from the SAME shared catalog the Services
  // page renders, so a category card can never disagree with the page.
  function serviceGroups() {
    var catalog = serviceCatalog();
    var byGroup = {};
    catalog.forEach(function (s) {
      var name = s.group || 'Other';
      if (!byGroup[name]) byGroup[name] = { name: name, services: [], min: null, max: null };
      byGroup[name].services.push(s);
      var p = priceNumber(s.price);
      if (p === null) return;
      if (byGroup[name].min === null || p < byGroup[name].min) byGroup[name].min = p;
      if (byGroup[name].max === null || p > byGroup[name].max) byGroup[name].max = p;
    });
    return Object.keys(byGroup).map(function (name) {
      var g = byGroup[name];
      return {
        name: g.name,
        // "Preventive & Wellness" -> "Preventive / Wellness": same words,
        // one fewer symbol in a prompt label.
        shortName: name.replace(/\s*&\s*/g, ' / '),
        count: g.services.length,
        names: g.services.map(function (s) { return s.label; }),
        // The RAW catalog records, so a category card can render exactly
        // what the Services page shows without a second lookup table.
        services: g.services,
        priceText: g.min === null
          ? 'Contact us for pricing'
          : peso(g.min) + (g.max !== g.min ? ' \u2013 ' + peso(g.max) : '')
      };
    });
  }

  // "₱300.00 – ₱2,000.00" -> 300; "₱900.00" -> 900; "Contact us" -> null.
  function priceNumber(value) {
    var m = String(value || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function peso(value) {
    return '\u20b1' + Number(value).toFixed(2);
  }

  function send(text) {
    var message = String(text || '').trim();
    if (!message || ui.busy) return;

    renderUser(message);
    hideCarousel();
    scrollToBottom(true);

    var epoch = ui.epoch;
    ui.busy = true;
    showThinking();

    // Fixed, short delay purely so the thinking state is legible. It is
    // not a network call and not model latency.
    window.setTimeout(function () {
      // A New Conversation reset during the delay voids this reply, so
      // a stale answer can never land in the fresh thread.
      if (epoch !== ui.epoch) return;

      // Clear the placeholder BEFORE rendering the answer, so the two are
      // never on screen together.
      clearThinking();

      var ctx = buildContext();
      var answer = State.resolve(message, ctx);

      setPresence(State.restingState(answer.state));

      renderVetti(answer.text);

      // Structured output. One intent can carry at most one payload, so
      // each line here is a branch rather than a pile of blocks.
      if (answer.petCards) renderBlock(petListMarkup(answer.petCards), 'vetti-card-block');
      else if (answer.petCard) renderBlock(petCardMarkup(answer.petCard), 'vetti-card-block');
      if (answer.appointments) {
        renderBlock(appointmentListMarkup(appointmentsFor()), 'vetti-card-block');
      } else if (answer.appointment) {
        renderBlock(singleAppointmentMarkup(answer.appointment), 'vetti-card-block');
      }
      if (answer.capabilities) {
        renderBlock(capabilityListMarkup(), 'vetti-card-block');
      }
      if (answer.service) {
        renderBlock(serviceDetailMarkup(answer.service), 'vetti-card-block');
      } else if (answer.serviceGroup) {
        renderBlock(serviceGroupMarkup(answer.serviceGroup), 'vetti-card-block');
      } else if (answer.serviceCategories) {
        renderBlock(serviceCategoriesMarkup(serviceGroups()));
      }

      // Manual fallbacks. KAN-50 owns the real mutations, so every one of
      // these hands off to the portal's own UI rather than pretending the
      // change was made in conversation.
      runAction(answer);

      renderCarousel(answer.suggestions);
      ui.busy = false;
      scrollToBottom(true);
    }, 420);
  }

  // ── Active pet ────────────────────────────────────────────────────────
  // ONE authoritative state setter. The header dropdown, a row in the pets
  // card and any Vetti action that deliberately picks a pet all funnel
  // through here, so the dropdown, the greeting and the reply can never
  // disagree about who Vetti is talking about.
  function applyActivePet(petId) {
    var list = pets();
    var hit = list.filter(function (p) {
      return String(p.petId) === String(petId);
    })[0];
    if (!hit) return null;
    ui.activePetId = hit.petId;
    renderPetSelector();
    renderGreeting();
    return hit;
  }

  // The user-facing switch: apply it, then acknowledge it ONCE. Picking
  // the pet that is already active is not a change, so it says nothing
  // rather than repeating the same line.
  function selectPet(petId) {
    var current = activePet();
    var hit = applyActivePet(petId);
    if (!hit) return;
    if (current && String(current.petId) === String(hit.petId)) return;
    announceActivePet(hit);
  }

  function announceActivePet(hit) {
    // Choosing a pet is a user action, not part of the previous reply,
    // so it opens a fresh turn instead of trailing off the old one.
    closeTurn();
    setPresence('idle');
    renderVetti('Now talking about ' + hit.name + '.');
    renderCarousel(suggestionsForContext());
    scrollToBottom(true);
  }

  function startPresenceMotion() {
    window.setInterval(function () {
      if (document.hidden || ui.thinking) return;
      ui.idleAlt = !ui.idleAlt;
      if (ui.presenceState === 'idle') setPresence('idle');
    }, 6000);

    window.setInterval(function () {
      if (document.hidden || !ui.thinking) return;
      ui.thinkFlip = !ui.thinkFlip;
      setPresence('thinking');
    }, 900);
  }

  function setListening(on) {
    if (ui.listening === on) return;
    ui.listening = on;
    if (dom.presence) dom.presence.classList.toggle('is-listening', on);
    if (on && !ui.busy && !ui.thinking && !ui.saving) setPresence('listening');
    else if (!on && !ui.busy && !ui.thinking && !ui.saving) setPresence('idle');
  }

  // ── HEADER MENU (New Conversation / Settings / What Vetti Can Do) ───
  // One overflow home for secondary actions, so the header line stays
  // [ mascot | greeting | pet selector | ⋮ ] at every breakpoint.

  function menuOpen() {
    return !!(dom.menuPop && !dom.menuPop.hidden);
  }

  function openMenu() {
    if (!dom.menuPop || !dom.menuBtn) return;
    dom.menuPop.hidden = false;
    dom.menuBtn.setAttribute('aria-expanded', 'true');
    var items = dom.menuPop.querySelectorAll('[role="menuitem"]');
    if (items.length) items[0].focus();
  }

  function closeMenu(returnFocus) {
    if (!dom.menuPop || dom.menuPop.hidden) return;
    dom.menuPop.hidden = true;
    dom.menuBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus && dom.menuBtn) dom.menuBtn.focus();
  }

  // ── NEW CONVERSATION ────────────────────────────────────────────────
  // Clears only what the conversation OWNS: the thread DOM and the
  // transient flags on top of it. The account, pets, appointments, the
  // active pet and every storage flag (seenIntro, introShown, warm lines,
  // response language) are untouched — showOpening() then rebuilds the
  // normal start state from them. Never resetIntro(), never a reload.

  function hasConversationContent() {
    if (!dom.canvas) return false;
    // Meaningful = the owner has actually spoken (rail chips call send()
    // too). The opening turn alone is the start state, not a conversation.
    return !!dom.canvas.querySelector('.vetti-row-user');
  }

  function newConversation() {
    if (!dom.canvas) return;
    if (!hasConversationContent()) { resetConversation(); return; }
    if (typeof confirmAction === 'function') {
      confirmAction(
        'Start a new conversation? This clears the chat on screen. '
        + 'Your account, pets, appointments and settings stay as they are.',
        resetConversation,
        { title: 'New Conversation' }
      );
    } else {
      resetConversation();
    }
  }

  function resetConversation() {
    // Void any reply still waiting on its delay, so a stale answer can
    // never appear in the fresh thread.
    ui.epoch += 1;
    ui.busy = false;
    ui.thinking = false;
    ui.saving = false;
    ui.petFormOpen = false;
    ui.lastSuggestions = [];
    closeTurn();
    clearThinking();
    closeMenu(false);
    if (dom.canvas) dom.canvas.innerHTML = '';
    setPresence('idle');
    showOpening();
    if (dom.input) dom.input.focus();
  }

  // ── SETTINGS (Response Language) ────────────────────────────────────
  // One preference, built on the shared VHS modal engine so it looks and
  // behaves like every other portal dialog. Stored by vetti-state.js and
  // surfaced through buildContext(); no deterministic reply reads it yet,
  // and the future AI request context will.

  function openSettings() {
    if (typeof _createModal !== 'function' || !dom.menuBtn) return;
    var current = State.getResponseLanguage();
    var message = ''
      + '<fieldset class="vetti-settings-group">'
      + '<legend class="vetti-settings-legend">Response Language</legend>'
      + '<p class="vetti-settings-hint">Vetti will reply in the language you pick here. '
      + 'You can still type in English, Tagalog or Taglish.</p>'
      + '<label class="vetti-settings-option">'
      + '<input type="radio" name="vettiResponseLanguage" value="en"'
      + (current === 'en' ? ' checked' : '') + '><span>English</span></label>'
      + '<label class="vetti-settings-option">'
      + '<input type="radio" name="vettiResponseLanguage" value="taglish"'
      + (current === 'taglish' ? ' checked' : '') + '><span>Taglish</span></label>'
      + '</fieldset>';

    var modal = _createModal({
      title: 'Settings',
      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
          + '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>'
          + '<line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>'
          + '<line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>'
          + '<line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line>'
          + '<line x1="17" y1="16" x2="23" y2="16"></line></svg>',
      message: message,
      footer: {
        html: '<button type="button" class="vhs-btn vhs-btn-primary" id="vettiSettingsSave">Save</button>'
            + '<button type="button" class="vhs-btn vhs-btn-ghost" id="vettiSettingsCancel">Cancel</button>'
      }
    });

    var overlay = modal.overlay;

    // The shared engine closes on Escape and on an overlay click without
    // touching focus, so mirror both paths: focus goes back to the menu
    // button that opened this dialog.
    function restoreFocus() {
      document.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onOverlayClick);
      if (dom.menuBtn) dom.menuBtn.focus();
    }
    function onKey(e) { if (e.key === 'Escape') restoreFocus(); }
    function onOverlayClick(e) { if (e.target === overlay) restoreFocus(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onOverlayClick);

    overlay.querySelector('#vettiSettingsSave').addEventListener('click', function () {
      var picked = overlay.querySelector('input[name="vettiResponseLanguage"]:checked');
      State.setResponseLanguage(picked ? picked.value : 'en');
      if (typeof showToast === 'function') showToast('Response language saved.', 'success');
      restoreFocus();
      modal.close();
    });
    overlay.querySelector('#vettiSettingsCancel').addEventListener('click', function () {
      restoreFocus();
      modal.close();
    });

    // Initial focus moves INTO the dialog, onto the current choice.
    var checked = overlay.querySelector('input[name="vettiResponseLanguage"]:checked');
    if (checked) checked.focus();
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  function bindComposer() {
    if (!dom.composer) return;
    dom.composer.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = dom.input ? dom.input.value : '';
      if (dom.input) dom.input.value = '';
      send(value);
      if (dom.input) dom.input.focus();
    });
    if (dom.input) {
      dom.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (dom.composer) dom.composer.requestSubmit
            ? dom.composer.requestSubmit()
            : dom.composer.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
      dom.input.addEventListener('focus', function () { setListening(true); });
      dom.input.addEventListener('blur', function () { setListening(false); });
    }
  }

  function bindClicks() {
    document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      // The welcome layer is modal over the workspace, so nothing behind
      // it responds while it is up.
      if (dom.welcome && !dom.welcome.hidden && !target.closest('#vettiWelcome')) return;

      // A click outside the header menu closes it. The toggle itself is
      // handled with the other data-vetti-action names below.
      if (menuOpen() && !target.closest('#vettiMenu')) closeMenu(false);

      var prompt = target.closest('[data-vetti-prompt]');
      if (prompt) { send(prompt.getAttribute('data-vetti-prompt')); return; }

      // A row in the pet list is a real selector: it does what the header
      // dropdown does, so the list is never a dead read-out.
      var petRow = target.closest('[data-vetti-pet]');
      if (petRow) { selectPet(petRow.getAttribute('data-vetti-pet')); return; }

      var action = target.closest('[data-vetti-action]');
      if (action) {
        var name = action.getAttribute('data-vetti-action');
        if (name === 'cancel-pet-form') {
          closePetForm();
          setPresence(pets().length ? 'idle' : 'add_pet');
        } else if (name === 'open-my-pets') {
          closePetForm();
          Tools.openMyPets();
        } else if (name === 'open-services') {
          Tools.openServices();
        } else if (name === 'toggle-menu') {
          if (menuOpen()) closeMenu(false);
          else openMenu();
        } else if (name === 'new-conversation') {
          closeMenu(true);
          newConversation();
        } else if (name === 'settings') {
          closeMenu(true);
          openSettings();
        } else if (name === 'what-vetti-can-do') {
          closeMenu(true);
          replayIntro();
        }
        return;
      }
      var scroll = target.closest('[data-vetti-scroll]');
      if (scroll) {
        var track = el('vettiCarouselTrack');
        if (!track) return;
        var dir = parseInt(scroll.getAttribute('data-vetti-scroll'), 10) || 1;
        track.scrollBy({ left: dir * Math.max(180, track.clientWidth * 0.7), behavior: 'smooth' });
        return;
      }
      if (dom.canvas && target === dom.scrollBtn) scrollToBottom(true);
    });

    // The welcome layer's own exits. Bound directly rather than through the
    // document listener, which ignores clicks on a hidden layer and
    // anything behind a visible one.
    if (dom.welcomeStart) {
      dom.welcomeStart.addEventListener('click', startTutorial);
    }
    if (dom.welcomeSkip) {
      dom.welcomeSkip.addEventListener('click', function () { completeWelcome(true); });
    }
    if (dom.welcome) {
      dom.welcome.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { completeWelcome(true); return; }
        if (e.key !== 'Tab') return;
        // Two exits only: keep Tab inside the layer instead of letting it
        // walk into the workspace the layer is covering.
        var focusable = [dom.welcomeStart, dom.welcomeSkip].filter(Boolean);
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }

    // The walkthrough's three controls. Escape skips the tutorial for the
    // same reason it skips the welcome: always an exit, never a trap.
    if (dom.tourNext) dom.tourNext.addEventListener('click', nextTourStep);
    if (dom.tourBack) dom.tourBack.addEventListener('click', prevTourStep);
    if (dom.tourSkip) dom.tourSkip.addEventListener('click', skipTutorial);
    if (dom.tour) {
      dom.tour.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { skipTutorial(); return; }
        if (e.key !== 'Tab') return;
        var focusable = [dom.tourNext, dom.tourBack, dom.tourSkip]
          .filter(function (n) { return n && !n.hidden; });
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      // Re-place the spotlight when the workspace itself reflows.
      dom.tour.addEventListener('click', function (e) {
        if (e.target.closest('.vetti-tour-card')) return;
        var spot = currentSpotlight();
        positionTour(spot.selector, spot.node);
      });
    }
    window.addEventListener('resize', function () {
      if (dom.tour && !dom.tour.hidden) {
        var spot = currentSpotlight();
        positionTour(spot.selector, spot.node);
      }
    });

    // The header menu's keyboard behavior: arrows walk the items, and
    // focus leaving the popover (Tab, click-away to a focusable target)
    // closes it quietly. Escape is handled at the document level below so
    // it works from the button too, and it hands focus back.
    if (dom.menuPop) {
      dom.menuPop.addEventListener('keydown', function (e) {
        var items = Array.prototype.slice.call(dom.menuPop.querySelectorAll('[role="menuitem"]'));
        if (!items.length) return;
        var i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          items[(i + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          items[(i - 1 + items.length) % items.length].focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0].focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1].focus();
        }
      });
      dom.menuPop.addEventListener('focusout', function (e) {
        if (!dom.menuPop.contains(e.relatedTarget)) closeMenu(false);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen()) closeMenu(true);
    });

    // Delegated onto the HOST, never bound to the <select> itself.
    // renderPetSelector() rebuilds that element from innerHTML every time
    // the pet list or the active pet changes, so a direct listener is
    // thrown away on the FIRST switch and every later change silently does
    // nothing. The host outlives every render, so listening there keeps
    // the header dropdown and the pets-card rows on one path.
    if (dom.petSelectorHost) {
      dom.petSelectorHost.addEventListener('change', function (e) {
        var target = e.target;
        if (!target || target.id !== 'vettiActivePet') return;
        selectPet(target.value);
      });
    }

    if (dom.canvas) {
      dom.canvas.addEventListener('scroll', function () {
        if (!dom.scrollBtn) return;
        var atBottom = dom.canvas.scrollHeight - dom.canvas.scrollTop - dom.canvas.clientHeight < 48;
        dom.scrollBtn.hidden = atBottom;
      });
    }

    if (dom.carousel) {
      dom.carousel.addEventListener('scroll', function (e) {
        if (e.target && e.target.id === 'vettiCarouselTrack') syncCarouselControls();
      }, true);
    }
    window.addEventListener('resize', syncCarouselControls);
  }

  function bindFormSubmit() {
    if (dom.canvas) {
      dom.canvas.addEventListener('submit', function (e) {
        if (e.target && e.target.id === 'vettiPetForm') {
          e.preventDefault();
          handlePetFormSubmit(e);
        }
      });
    }
  }

  // ── DEV/QA ONLY ──────────────────────────────────────────────────────
  // TODO(BACKEND): gate both of these behind a QA role, or remove them,
  // once there is a real backend and real authentication.

  // ?vettiIntro=reset — forgets ONLY Vetti's intro flags, so the true
  // first-login flow can be re-tested. Pets are NOT touched.
  function applyQaIntroReset() {
    if (!/[?&]vettiIntro=reset(&|$)/.test(window.location.search || '')) return false;
    State.resetIntro();
    stripParam('vettiIntro');
    window.location.reload();
    return true;
  }

  // ?as=4&vettiPetDemo=reset — restores the zero-pet demo owner to her
  // seeded condition so the zero-pet QA path can be repeated.
  //
  // Owner-scoped on purpose: it repairs only the shared pet store and
  // only for the CURRENT demo owner, removing their added pets and their
  // pet overrides. It never clears all of localStorage, never touches
  // another owner's pets, appointments, documents or profile.
  //
  // The store surgery itself lives in VettiData.qaPruneOwnerPets(), beside
  // the store it repairs, so this UI file never holds a mock store key.
  function applyQaPetDemoReset() {
    if (!/[?&]vettiPetDemo=reset(&|$)/.test(window.location.search || '')) return false;
    Data.qaPruneOwnerPets();
    stripParam('vettiPetDemo');
    window.location.reload();
    return true;
  }

  function stripParam(name) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete(name);
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (e) { /* leaving the URL as-is is harmless */ }
  }

  // ── Mount ─────────────────────────────────────────────────────────────
  function mount() {
    cacheDom();
    if (!dom.canvas) return;
    if (applyQaIntroReset()) return;      // reloading
    if (applyQaPetDemoReset()) return;    // reloading

    // Preload the alternates so the first presence crossfade is instant.
    [State.mascotFor('idle'), State.mascotFor('idle_alt'),
     State.mascotFor('thinking'), State.mascotFor('thinking_alt')]
      .forEach(function (src) { var pre = new Image(); pre.src = src; });

    showOpening();

    bindComposer();
    bindClicks();
    bindFormSubmit();
    startPresenceMotion();
    syncLegacyChatbot();

    ui.booted = true;
    document.body.setAttribute('data-vetti-ready', '1');
  }

  // The portal already pins a legacy "VHS Assistant" bubble to the bottom
  // right. It would sit on top of Vetti's composer, so it is suppressed
  // while this workspace is open and restored everywhere else. Nothing is
  // removed from other sections. The global Vetti chat head is Phase 1B.
  function syncLegacyChatbot() {
    var section = document.querySelector('.page-section.active');
    var isVetti = !!(section && section.id === 'section-vetti');
    document.body.classList.toggle('vetti-active', isVetti);
  }

  function refresh() {
    if (!ui.booted) return;
    renderGreeting();
    renderPetSelector();
  }

  document.addEventListener('DOMContentLoaded', function () {
    mount();
    if (typeof showSection === 'function') {
      window.showSection = (function (original) {
        return function (name) {
          var out = original.apply(this, arguments);
          syncLegacyChatbot();
          return out;
        };
      })(window.showSection);
      window.setTimeout(function () { Tools.openWorkspace(); }, 0);
    }
  });

  global.VettiUI = {
    mount: mount,
    refresh: refresh,
    send: send,
    setPresence: setPresence,
    showOpening: showOpening,
    replayIntro: replayIntro,
    openWelcome: openWelcome,
    completeWelcome: completeWelcome,
    startTutorial: startTutorial,
    skipTutorial: skipTutorial,
    openPetForm: openPetForm,
    closePetForm: closePetForm,
    renderPetSelector: renderPetSelector,
    pets: pets,
    activePet: activePet,
    serviceGroups: serviceGroups,
    appointmentsFor: appointmentsFor,
    presenceState: function () { return ui.presenceState; },
    resetIntro: function () { State.resetIntro(); }
  };
})(window);