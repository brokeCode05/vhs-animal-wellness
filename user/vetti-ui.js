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
    presenceState: 'idle',
    presenceMotion: '',
    presenceReturn: 0,
    lastSuggestions: [],
    welcomeReturn: '',
    welcomeReplayed: false
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
    dom.replay = el('vettiReplayIntro');
    dom.presence = el('vettiHeaderMascotFrame');
    dom.presenceFrame = el('vettiHeaderMascotFrame');
    dom.presenceImg = el('vettiHeaderMascot');
    dom.canvas = el('vettiCanvas');
    dom.carousel = el('vettiCarousel');
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
  }

  // ── Identity + pets ───────────────────────────────────────────────────
  function sessionUser() {
    if (typeof _getSessionUser === 'function') return _getSessionUser() || {};
    return {};
  }

  function ownerId() {
    if (typeof _currentOwnerId === 'function') {
      var id = _currentOwnerId();
      if (id) return id;
    }
    return window.SharedMockUsers ? window.SharedMockUsers.currentUserId : null;
  }

  function firstName() {
    var u = sessionUser();
    return u.firstName || (u.name ? String(u.name).split(' ')[0] : '') || 'there';
  }

  function pets() {
    if (window.VHSPetOnboarding) return window.VHSPetOnboarding.petsForCurrentUser();
    if (window.SharedMockUsers && ownerId()) {
      return window.SharedMockUsers.petsOfOwner(ownerId());
    }
    return [];
  }

  function activePet() {
    var list = pets();
    if (!list.length) return null;
    var hit = list.filter(function (p) {
      return String(p.petId) === String(ui.activePetId);
    })[0];
    if (hit) return hit;
    ui.activePetId = list[0].petId;
    return list[0];
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
  // shared catalog the Services page renders, so the two agree.
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
            +   '<span class="vetti-service-name">' + esc(g.name) + '</span>'
            +   '<span class="vetti-service-count">' + g.count
            +     (g.count === 1 ? ' service' : ' services') + '</span>'
            + '</div>'
            + '<p class="vetti-service-price">' + esc(g.priceText) + '</p>'
            + '<button type="button" class="vetti-service-cta"'
            +   ' data-vetti-prompt="Tell me more about ' + esc(g.name) + '">'
            +   'Tell me more about ' + esc(g.shortName) + '</button>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="vetti-block-actions">'
      + '  <button type="button" class="vetti-inline-link" data-vetti-action="open-services">'
      + '    Open the full Services page</button>'
      + '</div>';
  }

  // ONE category, with what is actually in it.
  function serviceGroupMarkup(group) {
    if (!group) return '';
    return ''
      + '<div class="vetti-card">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">' + esc(group.name) + '</span>'
      + '    <span class="vetti-card-sub">' + esc(group.priceText) + '</span>'
      + '  </div>'
      + '  <ul class="vetti-service-items">'
      + group.names.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('')
      + '  </ul>'
      + '  <p class="vetti-card-note">Prices from the clinic service list on this device.</p>'
      + '</div>';
  }

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
    if (rail) rail.classList.toggle('is-scrollable', scrollable);
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

    var names = list.slice(0, 3).map(function (p) { return p.name; });
    var petLine = names.join(', ')
      + (list.length > names.length ? ' and ' + (list.length - names.length) + ' more' : '')
      + (list.length === 1 ? ' on this account' : ' on this account');

    var buckets = appointmentsFor();
    var up = buckets.upcoming;
    var line2 = up.length
      ? up.length + (up.length === 1 ? ' upcoming visit' : ' upcoming visits')
        + ' \u00b7 Next: ' + up[0].pet + ' \u00b7 ' + up[0].service + ' \u2014 '
        + up[0].date + ', ' + up[0].time
      : 'No upcoming visits booked yet.';

    return ''
      + '<div class="vetti-card vetti-glance">'
      + '  <p class="vetti-glance-line">' + esc(petLine) + '</p>'
      + '  <p class="vetti-glance-line is-quiet">' + esc(line2) + '</p>'
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
    if (dom.replay) dom.replay.hidden = State.isFirstTime();
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

  // Replay runs the same layer over the live workspace. The thread behind
  // it is left alone, so nothing is duplicated when the user dismisses it.
  function replayIntro() {
    ui.welcomeReturn = pets().length ? 'idle' : 'add_pet';
    ui.welcomeReplayed = true;
    State.clearIntroShown();
    openWelcome();
    if (typeof showToast === 'function') showToast('Welcome replayed.', 'info');
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
    if (dom.replay) dom.replay.hidden = false;
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
    ui.activePetId = pet.petId;

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

      if (window.VHSPetOnboarding) window.VHSPetOnboarding.refresh();
      if (typeof loadPets === 'function') loadPets();
    }, 460);
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
      serviceGroups: serviceGroups(),
      suggestionsWithPet: DEFAULT_SUGGESTIONS_WITH_PET,
      suggestionsNoPet: DEFAULT_SUGGESTIONS_NO_PET
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
  // them, read from the SAME shared store that page renders.
  // TODO(BACKEND): both buckets come from GET /appointments?scope=mine.
  function appointmentsFor() {
    var buckets = { upcoming: [], past: [] };
    if (!window.SharedMockAppointments) return buckets;
    var me = ownerId();
    var all = window.SharedMockAppointments.all() || [];
    var normalize = window.AppointmentContract
      ? window.AppointmentContract.normalizeStatus
      : function (s) { return s; };
    var ACTIVE = { pending: 1, confirmed: 1, checked_in: 1, in_consultation: 1, rescheduled: 1 };
    var today = new Date();
    var todayStr = today.getFullYear() + '-'
      + String(today.getMonth() + 1).padStart(2, '0') + '-'
      + String(today.getDate()).padStart(2, '0');

    all.forEach(function (a) {
      if (me && String(a.userId) !== String(me)) return;
      var status = normalize(a.status);
      var date = String(a.appointmentDate || '');
      // Exactly the rule renderAppointmentCards() uses on My Appointments:
      // upcoming = an active status AND today or later. Matching it is
      // what keeps the count in Vetti equal to the sidebar badge.
      var isUpcoming = !!ACTIVE[status] && (!date || date >= todayStr);
      var label = window.SharedMockUsers && window.SharedMockUsers.serviceLabel;
      // Sorting happens on the raw record, before the display strings are
      // built, so nothing invisible has to ride along in the card.
      var raw = {
        sort: date + ' ' + String(a.appointmentTime || ''),
        display: {
          pet: (a.pet && a.pet.name) || '\u2014',
          service: label ? (label(a.service) || a.service || '\u2014') : (a.service || '\u2014'),
          date: fmtDate(date),
          time: fmtTime(a.appointmentTime),
          status: status
        }
      };
      if (isUpcoming) buckets.upcoming.push(raw);
      else buckets.past.push(raw);
    });
    buckets.upcoming.sort(function (a, b) { return a.sort.localeCompare(b.sort); });
    buckets.past.sort(function (a, b) { return b.sort.localeCompare(a.sort); });
    return {
      upcoming: buckets.upcoming.map(function (r) { return r.display; }),
      past: buckets.past.map(function (r) { return r.display; })
    };
  }

  // Service categories, read from the SAME shared catalog the Services
  // page renders, so a category card can never disagree with the page.
  // TODO(BACKEND): GET /services replaces this read.
  function serviceGroups() {
    if (!window.SharedMockUsers) return [];
    var catalog = window.SharedMockUsers.activeServices
      ? window.SharedMockUsers.activeServices()
      : (window.SharedMockUsers.services ? window.SharedMockUsers.services() : []);
    var byGroup = {};
    catalog.forEach(function (s) {
      var name = s.group || 'Other';
      if (!byGroup[name]) byGroup[name] = { name: name, labels: [], min: null, max: null };
      byGroup[name].labels.push(s.label);
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
        // one fewer symbol in a button label.
        shortName: name.replace(/\s*&\s*/g, ' / '),
        count: g.labels.length,
        names: g.labels,
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

    ui.busy = true;
    showThinking();

    // Fixed, short delay purely so the thinking state is legible. It is
    // not a network call and not model latency.
    window.setTimeout(function () {
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
      }
      if (answer.serviceGroup) {
        renderBlock(serviceGroupMarkup(answer.serviceGroup), 'vetti-card-block');
      } else if (answer.serviceCategories) {
        renderBlock(serviceCategoriesMarkup(serviceGroups()));
      }

      if (answer.action === 'openPetForm') openPetForm();

      renderCarousel(answer.suggestions);
      ui.busy = false;
      scrollToBottom(true);
    }, 420);
  }

  // ── Presence micro-animation ─────────────────────────────────────────
  function selectPet(petId) {
    var list = pets();
    var hit = list.filter(function (p) {
      return String(p.petId) === String(petId);
    })[0];
    if (!hit) return;
    var changed = String(hit.petId) !== String(ui.activePetId);
    ui.activePetId = hit.petId;
    renderPetSelector();
    renderGreeting();
    if (changed) {
      // Choosing a pet is a user action, not part of the previous reply,
      // so it opens a fresh turn instead of trailing off the old one.
      closeTurn();
      setPresence('idle');
      renderVetti('Now talking about ' + hit.name + '.');
      renderCarousel(suggestionsForContext());
      scrollToBottom(true);
    }
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
          if (typeof showSection === 'function') showSection('pets');
        } else if (name === 'open-services') {
          if (typeof showSection === 'function') showSection('services');
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

    // The welcome layer's own two exits. Bound directly rather than
    // through the document listener, which ignores clicks on a hidden
    // layer and anything behind a visible one.
    if (dom.welcomeStart) {
      dom.welcomeStart.addEventListener('click', function () { completeWelcome(false); });
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

    if (dom.replay) dom.replay.addEventListener('click', replayIntro);

    var selector = el('vettiActivePet');
    if (selector) {
      selector.addEventListener('change', function () { selectPet(selector.value); });
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
  // Owner-scoped on purpose: it rewrites only the shared pet store and
  // only for the CURRENT demo owner, removing their added pets and their
  // pet overrides. It never clears all of localStorage, never touches
  // another owner's pets, appointments, documents or profile.
  function applyQaPetDemoReset() {
    if (!/[?&]vettiPetDemo=reset(&|$)/.test(window.location.search || '')) return false;
    var target = String(ownerId() || '');
    try {
      var KEY = 'vhs_mock_users_pets_v1';
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      raw.petAdded = raw.petAdded || [];
      raw.petOverrides = raw.petOverrides || {};

      // Remember which pets belonged to this owner BEFORE pruning, so
      // their overrides can be dropped too.
      var mine = [];
      if (window.SharedMockUsers && target) {
        mine = (window.SharedMockUsers.petsOfOwner(target) || [])
          .map(function (p) { return String(p.petId); });
      }
      raw.petAdded = raw.petAdded.filter(function (p) {
        return String(p.ownerId) !== target;
      });
      mine.forEach(function (id) { delete raw.petOverrides[id]; });

      localStorage.setItem(KEY, JSON.stringify(raw));
    } catch (e) { /* storage unavailable; nothing to reset */ }
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
      window.setTimeout(function () { showSection('vetti'); }, 0);
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