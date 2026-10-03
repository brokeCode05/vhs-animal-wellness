/* ============================================================
   VETTIUI — the Ask Vetti workspace (frontend only)

   WORKSPACE STRUCTURE (top to bottom):

     A. WORKSPACE HEADER  — time-aware greeting, one warm supporting
                            line, active-pet selector, Replay intro.
     B. VETTI STAGE       — ONE persistent home for Vetti. This is the
                            ONLY place the mascot, its expression, its
                            state caption and its micro-animation live.
     C. CONVERSATION      — user messages, Vetti replies, inline cards
                            and compact forms. NO mascots here.
     D. SUGGESTED RAIL    — horizontal, conversational sentences.
     E. COMPOSER          — pinned at the bottom.

   THE CORE RULE: state changes, layout stays stable. Changing Vetti's
   state swaps the stage artwork and caption. It never adds, resizes or
   removes anything in the conversation, so the thread never jumps.

   THINKING IS TRANSIENT (VettiState.restingState). The stage enters
   "thinking" while a message is being resolved, a short placeholder
   appears in the thread, and BOTH are cleared before the real reply is
   rendered. No intent may leave the stage sitting in "thinking".

   No inference, no network. Every reply comes from VettiState's
   deterministic intent table. Booking, availability, document
   retrieval and any inference are marked TODO(BACKEND)/TODO(AI).

   IMAGE LOADING: the approved mascot PNGs are large. The stage loads
   its current frame directly and crossfades between frames, so the
   stage is never momentarily blank. No asset is edited or resized.

   v2.0.0
   ============================================================ */
(function (global) {
  'use strict';

  var State = global.VettiState;
  var Onboarding = global.VettiOnboarding;
  var esc = Onboarding.escapeText;

  // ── Local UI state (not conversation content) ─────────────────────────
  var ui = {
    activePetId: null,
    idleAlt: false,          // idle-a <-> idle-b
    thinkFlip: false,        // thinking-a <-> thinking-b
    listening: false,        // composer focused
    thinking: false,         // a message is being resolved
    petFormOpen: false,
    busy: false,
    booted: false,
    stageState: 'idle',
    lastSuggestions: []
  };

  // Conversational sentences, not dashboard labels. §22.
  var DEFAULT_SUGGESTIONS_WITH_PET = [
    'Show me my pets',
    'I want to book an appointment',
    'What services do you offer?',
    'Help me add another pet',
    'What can Vetti do?'
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
    dom.stage = el('vettiStage');
    dom.stageFrame = el('vettiStageFrame');
    dom.stageImg = el('vettiStageMascot');
    dom.stageCaption = el('vettiStageCaption');
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

  // ── B. VETTI STAGE ───────────────────────────────────────────────────
  // The single persistent home for Vetti. Everything stateful about Vetti
  // is expressed here and only here.

  // Swapping src on a rendered <img> blanks the box until a ~750 KB PNG
  // decodes. The stage crossfades instead, so it is never empty.
  //
  // Re-entrancy matters: the stage can be asked to change state faster
  // than a PNG decodes. Each fade carries a token; a superseded fade
  // removes itself and leaves the previously settled face visible, and
  // settling removes every other face so exactly one image is ever left
  // in the frame.
  var stageFadeToken = 0;

  function crossfadeStage(src, alt) {
    if (!dom.stageFrame) return;
    var current = dom.stageFrame.querySelector('img[data-vetti-face]:last-of-type');
    if (current && current.getAttribute('src') === src) return;

    var token = ++stageFadeToken;
    var next = document.createElement('img');
    next.className = 'vetti-stage-mascot';
    next.setAttribute('data-vetti-face', '1');
    next.setAttribute('alt', alt);
    next.width = 1254;
    next.height = 1254;
    next.decoding = 'async';
    next.draggable = false;
    next.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
      + 'object-fit:cover;opacity:0;';

    function drop() {
      if (next.parentNode) next.parentNode.removeChild(next);
    }
    next.addEventListener('error', drop);

    function settle() {
      // A newer fade started while this one was decoding.
      if (token !== stageFadeToken) { drop(); return; }
      var faces = dom.stageFrame.querySelectorAll('img[data-vetti-face]');
      Array.prototype.forEach.call(faces, function (face) {
        if (face !== next && face.parentNode) face.parentNode.removeChild(face);
      });
      dom.stageImg = next;
      next.style.transition = 'opacity .45s ease';
      next.style.opacity = '1';
    }

    dom.stageFrame.appendChild(next);
    if (next.complete && next.naturalWidth) {
      window.requestAnimationFrame(settle);
    } else {
      next.addEventListener('load', settle, { once: true });
    }
    next.src = src;
  }

  function setStage(state) {
    // NOTE: this does NOT normalise thinking. Entering the transient
    // thinking state is a deliberate call from showThinking(); the
    // §11 guard belongs on the reply path (see send), where a resting
    // state is derived from an answer.
    var next = state;
    ui.stageState = next;

    var motion = State.motionFor(next);
    if (dom.stageFrame) {
      if (ui.stageMotion && dom.stageFrame.classList.contains(ui.stageMotion)) {
        dom.stageFrame.classList.remove(ui.stageMotion);
      }
      if (motion) dom.stageFrame.classList.add(motion);
      ui.stageMotion = motion;
    }

    // Idle and thinking each have two approved frames; pick the current one.
    var src = State.mascotFor(next);
    if (next === 'idle' && ui.idleAlt) src = State.mascotFor('idle_alt');
    if (next === 'thinking' && ui.thinkFlip) src = State.mascotFor('thinking_alt');
    crossfadeStage(src, State.altFor(next));

    if (dom.stageCaption) dom.stageCaption.textContent = State.labelFor(next);
    if (dom.stage) dom.stage.setAttribute('data-state', next);
  }

  // ── C. CONVERSATION ───────────────────────────────────────────────────
  function scrollToBottom(smooth) {
    if (!dom.canvas) return;
    dom.canvas.scrollTo
      ? dom.canvas.scrollTo({ top: dom.canvas.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      : (dom.canvas.scrollTop = dom.canvas.scrollHeight);
    if (dom.scrollBtn) dom.scrollBtn.hidden = true;
  }

  // Turn grouping: an assistant reply and any card/form that belongs to it
  // sit inside ONE group, so a turn reads as a single response.
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

  // A Vetti reply. Deliberately has NO avatar: the stage already says who
  // is speaking, and a mascot per message is what made the thread read as
  // a normal chat log with stickers on it.
  function renderVetti(text) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-vetti';
    node.innerHTML = '<div class="vetti-bubble vetti-bubble-vetti">'
      + '<p class="vetti-text">' + esc(text).replace(/\n/g, '<br>') + '</p>'
      + '</div>';
    turnNode().appendChild(node);
    return node;
  }

  // Structured content: intro actions, the compact pet form, result cards.
  function renderBlock(html, extraClass) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-block';
    node.innerHTML = '<div class="vetti-block ' + (extraClass || '') + '">' + html + '</div>';
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

  // ── THINKING (transient) ─────────────────────────────────────────────
  function showThinking() {
    ui.thinking = true;
    setStage('thinking');
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-vetti vetti-thinking-row';
    node.id = 'vettiThinkingRow';
    node.setAttribute('aria-hidden', 'false');
    node.innerHTML = '<div class="vetti-bubble vetti-bubble-vetti vetti-bubble-thinking">'
      + '<span class="vetti-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span>Let me check that for you\u2026</span>'
      + '<span class="vetti-sr-only">Vetti is thinking</span>'
      + '</div>';
    turnNode().appendChild(node);
    scrollToBottom(true);
    return node;
  }

  // Called BEFORE the real reply is rendered, so the placeholder is never
  // visible at the same time as the answer.
  function clearThinking() {
    ui.thinking = false;
    var node = el('vettiThinkingRow');
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  // ── Structured card (§14: VHS card styling, not an AI widget) ─────────
  function petCardMarkup(pet) {
    if (!pet) return '';
    var bits = [];
    if (pet.breed) bits.push(esc(pet.breed));
    if (pet.age) bits.push(esc(pet.age) + (Number(pet.age) === 1 ? ' year old' : ' years old'));
    if (pet.weightKg) bits.push(esc(pet.weightKg) + ' kg');
    return ''
      + '<div class="vetti-card">'
      + '  <div class="vetti-card-head">'
      + '    <span class="vetti-card-title">' + esc(pet.name) + '</span>'
      + '    <span class="vetti-card-sub">' + esc(pet.species || 'Species not set')
      +      (pet.gender ? ' \u00b7 ' + esc(pet.gender) : '') + '</span>'
      + '  </div>'
      + (bits.length ? '<ul class="vetti-card-facts">'
          + bits.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' : '')
      + '  <p class="vetti-card-note">From your records on this device.</p>'
      + '</div>';
  }

  // ── Active-pet selector (§21) ────────────────────────────────────────
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

  // ── D. SUGGESTED PROMPT RAIL (§23) ────────────────────────────────────
  // Horizontal only, directly above the composer. Arrows live INSIDE the
  // rail (which clips) and only appear when the track can scroll.
  function renderCarousel(items) {
    if (!dom.carousel) return;
    var list = (items && items.length) ? items : suggestionsForContext();
    ui.lastSuggestions = list.slice();

    if (!list.length) {
      hideCarousel();
      return;
    }
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
          return '<button type="button" class="vetti-chip" data-vetti-prompt="' + esc(s) + '">'
            + esc(s) + '</button>';
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

  // §19: after a pet is created the rail speaks about THAT pet.
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
    // First time: Vetti introduces herself. Every later login: short.
    dom.greeting.textContent = firstTime
      ? word + ', ' + first + '! I\u2019m Vetti.'
      : word + ', ' + first + '.';
    if (dom.warmLine) {
      dom.warmLine.textContent = State.warmLine(ownerId(), (activePet() || {}).name || '');
    }
    if (dom.replay) dom.replay.hidden = firstTime;
  }

  // ── FIRST-TIME INTRO (§15) ────────────────────────────────────────────
  // Two to three short messages, then the actions. Never auto-replayed
  // on later logins.
  function showIntro() {
    var name = firstName();
    setStage('greeting');
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
      setStage('greeting');
      showIntro();
      if (!alreadyThisSession) {
        // The long introduction is a once-ever moment.
        State.markSeenForever();
        // §17: a first-time owner with no pets still needs the brief
        // explanation of WHY basic details are needed.
        if (!pets().length) zeroPetNotice();
        else renderCarousel(suggestionsForContext());
      }
      return;
    }

    // §20: returning user. Short, never a repeated introduction.
    if (dom.replay) dom.replay.hidden = false;
    if (pets().length) {
      setStage('idle');
      renderVetti('Good to see you, ' + firstName() + '.');
      renderVetti('Happy to help whenever you need it \u2014 ask me about '
        + activePet().name + ' or anything else.');
      renderCarousel(suggestionsForContext());
      return;
    }
    zeroPetNotice();
  }

  // §17: zero-pet. Explain briefly WHY basic info is needed, and offer the
  // compact form. Nothing is blocked and nothing is fabricated.
  function zeroPetNotice() {
    setStage('add_pet');
    renderVetti('Before I can help with pet-specific tasks, let\u2019s add your first pet.');
    renderVetti('I only need the basics for now.');
    renderVetti('You can add the rest later from My Pets, or ask me to help you '
      + 'complete it later.');
    renderCarousel(DEFAULT_SUGGESTIONS_NO_PET);
  }

  // §16: replay the guide. Touches no account data.
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

  // ── COMPACT PET FORM (§18) ────────────────────────────────────────────
  // ONE form for both zero-pet onboarding and "add another pet". It never
  // redirects to My Pets; My Pets stays available as a secondary link.
  function openPetForm(opts) {
    if (ui.petFormOpen) return;
    ui.petFormOpen = true;
    var hasPets = pets().length > 0;
    setStage('add_pet');
    renderBlock(Onboarding.petFormMarkup({ hasPets: hasPets }), 'vetti-form-block');
    var form = el('vettiPetForm');
    if (form) {
      Onboarding.installGuards(form);
      var name = el('vettiPetName');
      if (name) window.setTimeout(function () { name.focus(); }, 60);
    }
    scrollToBottom(true);
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
      // Validation already shows inline field errors and moves focus, so it
      // needs no extra bubble here.
      if (result.error === 'validation') return;
      setStage('error');
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

    // §11: the stage goes to thinking, then to success once saved.
    ui.thinking = true;
    setStage('thinking');

    window.setTimeout(function () {
      ui.thinking = false;
      setStage('success');
      renderVetti(pet.name + ' is now part of your account.');
      renderVetti('You can add more details anytime from My Pets, or ask me to help '
        + 'you complete them later.');
      renderBlock(petCardMarkup(pet), 'vetti-card-block');

      renderPetSelector();
      renderGreeting();
      renderCarousel(successSuggestions(pet));
      scrollToBottom(true);

      // Keep the rest of the portal in step with the new pet.
      if (window.VHSPetOnboarding) window.VHSPetOnboarding.refresh();
      if (typeof loadPets === 'function') loadPets();
    }, 420);
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

      // §11: the stage settles on the answer's RESTING state, so it can
      // never be left sitting in "thinking".
      setStage(State.restingState(answer.state));

      renderVetti(answer.text);
      if (answer.petCard) renderBlock(petCardMarkup(answer.petCard), 'vetti-card-block');
      if (answer.action === 'openPetForm') openPetForm();

      renderCarousel(answer.suggestions);
      ui.busy = false;
      scrollToBottom(true);
    }, 420);
  }

  // ── Stage micro-animation (§12) ──────────────────────────────────────
  // Two approved frames per state, low frequency, transform-only.
  function startStageMotion() {
    window.setInterval(function () {
      if (document.hidden || ui.thinking) return;
      ui.idleAlt = !ui.idleAlt;
      if (ui.stageState === 'idle') setStage('idle');
    }, 6000);

    window.setInterval(function () {
      if (document.hidden || !ui.thinking) return;
      ui.thinkFlip = !ui.thinkFlip;
      setStage('thinking');
    }, 900);
  }

  // §10: composer focused = Vetti is listening.
  function setListening(on) {
    if (ui.listening === on) return;
    ui.listening = on;
    if (dom.stage) dom.stage.classList.toggle('is-listening', on);
    if (on && !ui.busy && !ui.thinking) setStage('listening');
    else if (!on && !ui.busy && !ui.thinking) setStage('idle');
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
      if (prompt) {
        send(prompt.getAttribute('data-vetti-prompt'));
        return;
      }
      var action = target.closest('[data-vetti-action]');
      if (action) {
        var name = action.getAttribute('data-vetti-action');
        if (name === 'start-intro') {
          dismissIntro('Great \u2014 tell me what you need.');
          if (typeof showSection === 'function') { /* stay put */ }
          if (dom.input) dom.input.focus();
        } else if (name === 'skip-intro') {
          dismissIntro('No problem. Ask me anything whenever you\u2019re ready.');
          if (dom.input) dom.input.focus();
        } else if (name === 'replay-intro') {
          replayIntro();
        } else if (name === 'cancel-pet-form') {
          closePetForm();
          setStage(pets().length ? 'idle' : 'add_pet');
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
        // §21: switching is calm — no dramatic state change.
        if (pets().length) {
          renderVetti('Now talking about ' + activePet().name + '.');
          setStage('idle');
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

  // ── DEV/QA ONLY: repeat the true first-login experience ───────────────
  // ?vettiIntro=reset forgets ONLY Vetti's own intro flags and reloads, so
  // the genuine first-login moment can be re-tested on demand instead of
  // clearing site data by hand.
  //
  // It touches nothing else: pets, appointments, documents and profile are
  // left exactly as they are.
  //
  // DEV/QA ONLY — not a production User control. The always-available way
  // back to the intro is the "Replay intro" control.
  // TODO(BACKEND): gate this behind a QA role, or remove it, once there is
  // a real backend and real authentication.
  function applyQaIntroReset() {
    var search = window.location.search || '';
    if (!/[?&]vettiIntro=reset(&|$)/.test(search)) return false;
    State.resetIntro();
    try {
      // Drop only this parameter (keeping ?as=4 etc.), then reload so the
      // intro is re-evaluated on a fresh mount.
      var url = new URL(window.location.href);
      url.searchParams.delete('vettiIntro');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (e) { /* flags are already cleared */ }
    window.location.reload();
    return true;
  }

  // ── Mount ─────────────────────────────────────────────────────────────
  function mount() {
    cacheDom();
    if (!dom.canvas) return;
    if (applyQaIntroReset()) return;   // reloading; nothing else to do

    // Preload the two alternates so the first stage crossfade is instant.
    [State.mascotFor('idle'), State.mascotFor('idle_alt'),
     State.mascotFor('thinking'), State.mascotFor('thinking_alt')]
      .forEach(function (src) { var pre = new Image(); pre.src = src; });

    showOpening();

    bindComposer();
    bindClicks();
    bindFormSubmit();
    startStageMotion();
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
    setStage: setStage,
    showOpening: showOpening,
    replayIntro: replayIntro,
    openPetForm: openPetForm,
    closePetForm: closePetForm,
    renderPetSelector: renderPetSelector,
    pets: pets,
    activePet: activePet,
    stageState: function () { return ui.stageState; },
    resetIntro: function () { State.resetIntro(); }
  };
})(window);