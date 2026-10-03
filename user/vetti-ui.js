/* ============================================================
   VETTIUI — the Ask Vetti workspace (frontend only)

   VETTI HAS EXACTLY TWO VISUAL ROLAS — never mixed:

     1. CANONICAL CHAT AVATAR
        One single image (vetti-greeting.png) beside EVERY Vetti
        message, at one fixed size. It is identity, not expression, so
        it never switches with state.

     2. HEADER MASCOT
        One compact mascot INSIDE the workspace header, right of the
        greeting and next to the active-pet selector, whose EXPRESSION
        changes with state. This is where idle / thinking / success /
        concerned and the rest are used. There is no separate mascot
        row and no mascot stage anywhere in the workspace.

   WORKSPACE STRUCTURE
     A. .vetti-greeting       compact header (greeting + Vetti + tools)
     B. .vetti-canvas         conversation thread (the only scroller)
     C. .vetti-carousel       suggested prompt rail
     D. .vetti-composer       the composer

   CORE RULES
     - State changes, layout stays stable. Nothing reflows.
     - Thinking is TRANSIENT and never visible alongside the answer.
     - No permanent per-state caption anywhere. The temporary status is
       an ordinary thread row that is removed when the work finishes.

   IMAGE LOADING: the approved PNGs are large. The header mascot loads
   its current frame directly and crossfades between frames, so it is
   never momentarily blank. No asset is edited or resized.

   v4.0.0
   ============================================================ */
(function (global) {
  'use strict';

  var State = global.VettiState;
  var Onboarding = global.VettiOnboarding;
  var esc = Onboarding.escapeText;

  // §C: the ONE canonical chat avatar. Same image on every Vetti
  // message, so assistant identity never flickers between expressions.
  var CHAT_AVATAR_STATE = 'greeting';

  // §L: expressions that are worth a beat, then settle back to idle.
  // Without this the presence can sit in "Success" or "Concerned" long
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
    lastSuggestions: []
  };

  // §13: 2-4 useful contextual prompts. Fewer reads calmer than a wall of
  // chips, and leaves the rail from needing to scroll on desktop.
  var DEFAULT_SUGGESTIONS_WITH_PET = [
    'Show me my pets',
    'I want to book an appointment',
    'What services do you offer?',
    'Help me add another pet'
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

  // §C + §N: every Vetti message carries the ONE canonical avatar, at a
  // fixed size. It is decorative repetition of identity — the presence
  // above already carries the meaningful, expression-specific alt text —
  // so it is hidden from screen readers to avoid hearing "Vetti" on
  // every single line.
  function chatAvatar() {
    return '<span class="vetti-chat-avatar" aria-hidden="true">'
      + '<img src="' + esc(State.mascotFor(CHAT_AVATAR_STATE)) + '" alt=""'
      + ' width="1254" height="1254" decoding="async" draggable="false">'
      + '</span>';
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

  // ── Structured card ─────────────────────────────────────────────────
  // One container, only useful fields, no nested boxes.
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
    dom.carousel.innerHTML = ''
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

  // ── A. WORKSPACE HEADER ───────────────────────────────────────────────
  function renderGreeting() {
    if (!dom.greeting) return;
    var first = firstName();
    var firstTime = State.isFirstTime();
    var word = State.greetingWord();
    dom.greeting.textContent = firstTime
      ? word + ', ' + first + '! I\u2019m Vetti.'
      : word + ', ' + first + '.';
    if (dom.warmLine) {
      dom.warmLine.textContent = State.warmLine(ownerId(), (activePet() || {}).name || '');
    }
    if (dom.replay) dom.replay.hidden = firstTime;
  }

  // ── FIRST-TIME INTRO ─────────────────────────────────────────────────
  function showIntro() {
    var name = firstName();
    setPresence('greeting');
    renderVetti('Hi ' + name + ', I\u2019m Vetti, your friendly pet-care assistant.');
    renderVetti('I can help you with appointments, clinic services, and your pet information.');
    renderVetti('You can talk to me naturally \u2014 just tell me what you need.');
    renderBlock(Onboarding.introActionsMarkup(), 'vetti-intro-block');
    State.markIntroShown();
    renderCarousel(suggestionsForContext());
    scrollToBottom(true);
  }

  function dismissIntro(message) {
    var node = dom.canvas.querySelector('[data-vetti-intro]');
    if (node) {
      var block = node.closest('.vetti-block') || node.closest('.vetti-row');
      if (block) block.remove();
    }
    State.markIntroShown();
    if (message) renderVetti(message);
    scrollToBottom(true);
  }

  function showOpening() {
    renderGreeting();
    renderPetSelector();

    var firstTime = State.isFirstTime();
    var alreadyThisSession = State.introShownThisSession();

    if (firstTime) {
      setPresence('greeting');
      showIntro();
      if (!alreadyThisSession) {
        State.markSeenForever();
        if (!pets().length) zeroPetNotice();
        else renderCarousel(suggestionsForContext());
      }
      return;
    }

    // Returning user: ONE opening line. The header already says "Good
    // afternoon, Maria.", so repeating it in the thread was pure noise.
    if (dom.replay) dom.replay.hidden = false;
    if (pets().length) {
      setPresence('idle');
      renderVetti('Ask me about ' + activePet().name + ', appointments, or clinic '
        + 'services whenever you need help.');
      renderCarousel(suggestionsForContext());
      return;
    }
    zeroPetNotice();
  }

  // §10: zero pets -> one short explanation -> the compact form appears
  // IMMEDIATELY. No extra click required.
  function zeroPetNotice() {
    setPresence('add_pet');
    renderVetti('Before I can help with pet-specific tasks, let\u2019s add your first pet.');
    renderVetti('I only need the basics for now.');
    renderCarousel(DEFAULT_SUGGESTIONS_NO_PET);
    openPetForm({ focus: false });
  }

  function replayIntro() {
    var node = dom.canvas.querySelector('[data-vetti-intro]');
    if (node) {
      var block = node.closest('.vetti-block') || node.closest('.vetti-row');
      if (block) block.remove();
    }
    State.clearIntroShown();
    showIntro();
    if (typeof showToast === 'function') showToast('Intro replayed.', 'info');
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
    // The whole form must be on screen when it appears — including the
    // footnote and the actions, never clipped by the composer zone.
    // `block: 'nearest'` scrolls the minimum distance needed, so the
    // explanation above it stays in view whenever it fits.
    window.setTimeout(function () {
      var node = form || dom.canvas.querySelector('.vetti-form-block');
      if (node && node.scrollIntoView) {
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
      petSummary: petSummary,
      suggestionsWithPet: DEFAULT_SUGGESTIONS_WITH_PET,
      suggestionsNoPet: DEFAULT_SUGGESTIONS_NO_PET
    };
  }

  function petSummary(pet) {
    if (!pet) return '';
    var facts = [];
    if (pet.species) facts.push(pet.species);
    if (pet.breed) facts.push(pet.breed);
    if (pet.age) facts.push(pet.age + (Number(pet.age) === 1 ? ' year old' : ' years old'));
    if (pet.weightKg) facts.push(pet.weightKg + ' kg');
    return pet.name + (facts.length ? ' \u2014 ' + facts.join(', ') : '')
      + '. Full records live on My Pets.';
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
      if (answer.petCard) renderBlock(petCardMarkup(answer.petCard), 'vetti-card-block');
      if (answer.action === 'openPetForm') openPetForm();

      renderCarousel(answer.suggestions);
      ui.busy = false;
      scrollToBottom(true);
    }, 420);
  }

  // ── Presence micro-animation ─────────────────────────────────────────
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

      var prompt = target.closest('[data-vetti-prompt]');
      if (prompt) { send(prompt.getAttribute('data-vetti-prompt')); return; }

      var action = target.closest('[data-vetti-action]');
      if (action) {
        var name = action.getAttribute('data-vetti-action');
        if (name === 'start-intro') {
          dismissIntro('Great \u2014 tell me what you need.');
          if (dom.input) dom.input.focus();
        } else if (name === 'skip-intro') {
          dismissIntro('No problem. Ask me anything whenever you\u2019re ready.');
          if (dom.input) dom.input.focus();
        } else if (name === 'replay-intro') {
          replayIntro();
        } else if (name === 'cancel-pet-form') {
          closePetForm();
          setPresence(pets().length ? 'idle' : 'add_pet');
        } else if (name === 'open-my-pets') {
          closePetForm();
          if (typeof showSection === 'function') showSection('pets');
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

    if (dom.replay) dom.replay.addEventListener('click', replayIntro);

    var selector = el('vettiActivePet');
    if (selector) {
      selector.addEventListener('change', function () {
        ui.activePetId = selector.value;
        renderGreeting();
        if (pets().length) {
          renderVetti('Now talking about ' + activePet().name + '.');
          setPresence('idle');
          scrollToBottom(true);
        }
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
    openPetForm: openPetForm,
    closePetForm: closePetForm,
    renderPetSelector: renderPetSelector,
    pets: pets,
    activePet: activePet,
    presenceState: function () { return ui.presenceState; },
    resetIntro: function () { State.resetIntro(); }
  };
})(window);