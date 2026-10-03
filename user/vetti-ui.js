/* ============================================================
   VETTIUI — the Ask Vetti workspace (frontend only)
   ============================================================

   The single renderer for the assisted workspace:

   1. GREETING — time-aware, with one warm supporting line.
   2. ACTIVE-PET SELECTOR — only when the owner has pets.
   3. CONVERSATION CANVAS — Vetti + user messages, mascot state,
      the first-pet form inline, and future structured cards.
   4. SUGGESTED-PROMPT CAROUSEL — horizontal, directly above the
      composer.
   5. COMPOSER — pinned at the bottom of the Vetti area.

   No inference, no network. Every reply comes from VettiState's
   deterministic intent table. Structured cards, booking results and
   backend reads are marked TODO(BACKEND)/TODO(AI) where they would go.

   IMAGE LOADING: the approved mascot PNGs are large, so an image is
   only given a src the first time its state is actually shown, and
   the two idle variants are preloaded. No asset is edited or resized.

   v1.0.0
   ============================================================ */
(function (global) {
  'use strict';

  var State = global.VettiState;
  var Onboarding = global.VettiOnboarding;
  var esc = Onboarding.escapeText;

  // ── Local UI state (not conversation content) ─────────────────────────
  var ui = {
    activePetId: null,
    idleAlt: false,          // alternates idle-a / idle-b
    petFormOpen: false,
    busy: false,
    booted: false,
    loaded: {},              // asset path -> true, so src is set once
    lastSuggestions: []
  };

  var DEFAULT_SUGGESTIONS_WITH_PET = [
    'Show my pets',
    'Book an appointment',
    'What services do you offer?',
    'What can Vetti do?'
  ];
  var DEFAULT_SUGGESTIONS_NO_PET = [
    'Add a pet',
    'What can Vetti do?'
  ];

  // ── DOM refs (resolved on mount; the section exists from page load) ────
  function el(id) { return document.getElementById(id); }

  var dom = {};

  function cacheDom() {
    dom.greeting = el('vettiGreeting');
    dom.warmLine = el('vettiWarmLine');
    dom.petSelectorHost = el('vettiPetSelector');
    dom.canvas = el('vettiCanvas');
    dom.carousel = el('vettiCarousel');
    dom.composer = el('vettiComposer');
    dom.input = el('vettiInput');
    dom.send = el('vettiSend');
    dom.replay = el('vettiReplayIntro');
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

  // ── Lazy mascot images ────────────────────────────────────────────────
  // The approved PNGs total ~12 MB, so only the states actually shown
  // get a src. The asset files themselves are untouched.
  function mascotImg(state, className) {
    var src = State.mascotFor(state);
    var preloaded = ui.loaded[src] ? ' src="' + src + '"' : '';
    // Mark as requested now so a re-render does not flash an empty box.
    ui.loaded[src] = true;
    return '<img class="' + className + '"' + preloaded
      + ' data-vetti-src="' + src + '"'
      + ' alt="' + esc(State.altFor(state)) + '"'
      + ' width="1254" height="1254" decoding="async" draggable="false">';
  }

  // The src is attached after the node is in the document so the browser
  // does not block first paint on a large PNG.
  function hydrateMascots(scope) {
    (scope || dom.canvas).querySelectorAll('img[data-vetti-src]').forEach(function (img) {
      if (img.getAttribute('src')) return;
      img.setAttribute('src', img.getAttribute('data-vetti-src'));
    });
  }

  function preloadIdle() {
    [State.mascotFor('idle'), State.mascotFor('idle_alt')].forEach(function (src) {
      if (ui.loaded[src]) return;
      var pre = new Image();
      pre.src = src;
      ui.loaded[src] = true;
    });
  }

  // ── Rendering: messages ───────────────────────────────────────────────
  function scrollToBottom(smooth) {
    if (!dom.canvas) return;
    dom.canvas.scrollTo
      ? dom.canvas.scrollTo({ top: dom.canvas.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
      : (dom.canvas.scrollTop = dom.canvas.scrollHeight);
    if (dom.scrollBtn) dom.scrollBtn.hidden = true;
  }

  function renderVetti(text, state, extraClass) {
    var featured = State.isFeatured(state);
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-vetti' + (featured ? ' vetti-row-featured' : '');
    node.innerHTML = (featured
      ? '<div class="vetti-mascot-lg" data-state="' + esc(state) + '">'
        + mascotImg(state, 'vetti-mascot-img') + '</div>'
      : '<span class="vetti-avatar" data-state="' + esc(state) + '">'
        + mascotImg(state, 'vetti-avatar-img') + '</span>')
      + '<div class="vetti-bubble vetti-bubble-vetti' + (extraClass ? ' ' + extraClass : '') + '">'
      + '<p class="vetti-text">' + esc(text).replace(/\n/g, '<br>') + '</p>'
      + '</div>';
    dom.canvas.appendChild(node);
    // Hydrate this node immediately: any path that appends a mascot must
    // resolve its src, or the browser renders a broken image.
    hydrateMascots(node);
    return node;
  }

  function renderUser(text) {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-user';
    node.innerHTML = '<div class="vetti-bubble vetti-bubble-user">'
      + '<p class="vetti-text">' + esc(text).replace(/\n/g, '<br>') + '</p>'
      + '</div>';
    dom.canvas.appendChild(node);
    return node;
  }

  // Rich block (intro, pet form, pet card) appended inside a Vetti bubble.
  function renderBlock(state, html, extraClass) {
    var node = renderVetti('', state, extraClass);
    var bubble = node.querySelector('.vetti-bubble');
    var p = bubble.querySelector('.vetti-text');
    if (p) p.remove();
    bubble.insertAdjacentHTML('afterbegin', html);
    return node;
  }

  // A transient "thinking" note. Deliberately short and fixed — this is a
  // UI state, not a simulated model thinking.
  function showThinking() {
    var node = document.createElement('div');
    node.className = 'vetti-row vetti-row-vetti vetti-thinking-row';
    node.id = 'vettiThinkingRow';
    node.innerHTML = '<span class="vetti-avatar" data-state="thinking">'
      + mascotImg('thinking', 'vetti-avatar-img') + '</span>'
      + '<div class="vetti-bubble vetti-bubble-vetti vetti-bubble-thinking">'
      + '<span class="vetti-dots" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span class="vetti-sr-only">Vetti is thinking</span>'
      + '</div>';
    dom.canvas.appendChild(node);
    hydrateMascots(node);
    scrollToBottom(true);
    return node;
  }

  function clearThinking() {
    var node = el('vettiThinkingRow');
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  // ── Pet summary (future structured card) ─────────────────────────────
  function petCardMarkup(pet) {
    if (!pet) return '';
    // Species already sits in the card header, so it is not repeated here.
    var bits = [];
    if (pet.breed) bits.push(esc(pet.breed));
    if (pet.age) bits.push(esc(pet.age) + (Number(pet.age) === 1 ? ' year old' : ' years old'));
    if (pet.weightKg) bits.push(esc(pet.weightKg) + ' kg');
    return ''
      + '<div class="vetti-petcard">'
      + '  <div class="vetti-petcard-head">'
      + '    <span class="vetti-petcard-name">' + esc(pet.name) + '</span>'
      + '    <span class="vetti-petcard-species">' + esc(pet.species || 'Species not set') + '</span>'
      + '  </div>'
      + (bits.length ? '<ul class="vetti-petcard-facts">'
          + bits.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' : '')
      + '  <p class="vetti-petcard-note">From your records on this device.</p>'
      + '</div>';
  }

  // ── Pet selector ──────────────────────────────────────────────────────
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

  // ── Suggested prompt carousel ─────────────────────────────────────────
  // Horizontal only. Keyboard reachable, labelled for screen readers.
  function renderCarousel(items) {
    if (!dom.carousel) return;
    var list = (items && items.length) ? items : suggestionsForContext();
    ui.lastSuggestions = list.slice();

    if (!list.length) {
      dom.carousel.innerHTML = '';
      dom.carousel.hidden = true;
      return;
    }
    dom.carousel.hidden = false;
    dom.carousel.innerHTML = ''
      + '<div class="vetti-carousel-head">'
      + '  <span class="vetti-carousel-label" id="vettiCarouselLabel">Suggestions</span>'
      + '  <div class="vetti-carousel-controls">'
      + '    <button type="button" class="vetti-carousel-btn" data-vetti-scroll="-1"'
      + '            aria-label="Scroll suggestions left">'
      + '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + '           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '        <polyline points="15 18 9 12 15 6"/></svg>'
      + '    </button>'
      + '    <button type="button" class="vetti-carousel-btn" data-vetti-scroll="1"'
      + '            aria-label="Scroll suggestions right">'
      + '      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + '           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '        <polyline points="9 18 15 12 9 6"/></svg>'
      + '    </button>'
      + '  </div>'
      + '</div>'
      + '<div class="vetti-carousel-track" id="vettiCarouselTrack" role="group"'
      + '     aria-labelledby="vettiCarouselLabel">'
      + list.map(function (s) {
          return '<button type="button" class="vetti-chip" data-vetti-prompt="' + esc(s) + '">'
            + esc(s) + '</button>';
        }).join('')
      + '</div>';
  }

  function suggestionsForContext() {
    return pets().length ? DEFAULT_SUGGESTIONS_WITH_PET : DEFAULT_SUGGESTIONS_NO_PET;
  }

  // ── Greeting ──────────────────────────────────────────────────────────
  function renderGreeting() {
    if (!dom.greeting) return;
    var first = firstName();
    var firstTime = State.isFirstTime();
    var word = State.greetingWord();
    // First time: Vetti introduces herself. Every later login: short.
    dom.greeting.textContent = firstTime
      ? word + ', ' + first + '! I\u2019m Vetti.'
      : word + ', ' + first + '.';

    var pet = activePet();
    if (dom.warmLine) {
      dom.warmLine.textContent = State.warmLine(ownerId(), pet ? pet.name : '');
    }
    if (dom.replay) {
      // The replay control only exists once Vetti has been introduced.
      dom.replay.hidden = firstTime;
    }
  }

  // ── Intro ─────────────────────────────────────────────────────────────
  function showIntro() {
    var state = 'greeting';
    renderBlock(state, Onboarding.introMarkup(firstName()), 'vetti-bubble-intro');
    State.markIntroShown();
    renderCarousel(suggestionsForContext());
    hydrateMascots();
    scrollToBottom(true);
  }

  function showOpening() {
    renderGreeting();
    renderPetSelector();

    var firstTime = State.isFirstTime();
    var alreadyThisSession = State.introShownThisSession();

    if (firstTime && !alreadyThisSession) {
      showIntro();
      // The long intro is a once-ever moment. After it, later logins get
      // only the short greeting line above.
      State.markSeenForever();
      renderVetti(
        pets().length
          ? 'You have ' + pets().length + (pets().length === 1 ? ' pet' : ' pets') + ' on file. '
            + 'Ask me about ' + activePet().name + ', or anything else.'
          : 'You have no pets on file yet. I can help you add your first one right here.',
        'idle'
      );
      return;
    }

    if (firstTime && alreadyThisSession) {
      showIntro();
      return;
    }

    // Returning user — one short line, never the long introduction again.
    if (dom.replay) dom.replay.hidden = false;
    var pet = activePet();
    renderVetti(
      pets().length
        ? 'Good to see you, ' + firstName() + '. Ask me about ' + pet.name + ' or anything else.'
        : 'Good to see you, ' + firstName() + '. You have no pets on file yet \u2014 '
          + 'I can help you add your first one right here.',
      pets().length ? 'idle' : 'no_pet'
    );
    renderCarousel(suggestionsForContext());
  }

  // QA/support: replay the intro without wiping the account.
  function replayIntro() {
    State.clearIntroShown();
    var row = dom.canvas.querySelector('[data-vetti-intro]');
    if (row) {
      var bubble = row.closest('.vetti-row');
      if (bubble) bubble.remove();
    }
    showIntro();
    if (typeof showToast === 'function') {
      showToast('Intro replayed.', 'info');
    }
  }

  // ── Zero-pet path + inline pet form ───────────────────────────────────
  function openPetForm() {
    if (ui.petFormOpen) return;
    ui.petFormOpen = true;
    renderBlock('no_pet', Onboarding.petFormMarkup(), 'vetti-bubble-form');
    hydrateMascots();
    var form = el('vettiPetForm');
    if (form) {
      Onboarding.installGuards(form);
      var name = el('vettiPetName');
      if (name) setTimeout(function () { name.focus(); }, 60);
    }
    scrollToBottom(true);
  }

  function closePetForm() {
    var node = dom.canvas.querySelector('.vetti-bubble-form');
    if (node) {
      var row = node.closest('.vetti-row');
      if (row) row.remove();
    }
    ui.petFormOpen = false;
    Onboarding.clearErrors();
  }

  function handlePetFormSubmit(event) {
    event.preventDefault();
    var result = Onboarding.submitPetForm();
    if (!result.ok) {
      // A validation failure already shows its own inline field errors and
      // moves focus to the first bad field, so it needs no bubble here.
      if (result.error === 'validation') return;
      renderVetti(
        result.error === 'no_session'
          ? 'I could not tell who you are, so I stopped rather than save the pet to the wrong account.'
          : 'Something went wrong saving that pet. Please try again.',
        'error'
      );
      return;
    }
    var pet = result.pet;
    closePetForm();
    ui.activePetId = pet.petId;

    // Exactly one pet was created. No appointment, document or vaccine.
    renderVetti(pet.name + ' is on your account now.', 'success');
    renderBlock('pet_profile', petCardMarkup(pet), 'vetti-bubble-card');
    renderVetti(
      'That is the only record created \u2014 no appointments or documents were made up. '
      + 'You can add more details on My Pets whenever you like.',
      'idle'
    );

    renderPetSelector();
    renderGreeting();
    renderCarousel(DEFAULT_SUGGESTIONS_WITH_PET);
    scrollToBottom(true);

    // Keep the rest of the portal in step with the new pet.
    if (window.VHSPetOnboarding) window.VHSPetOnboarding.refresh();
    if (typeof loadPets === 'function') loadPets();
  }

  // ── Sending a message ─────────────────────────────────────────────────
  function buildContext() {
    var list = pets();
    var pet = activePet();
    return {
      firstName: firstName(),
      hasPets: list.length > 0,
      pets: list,
      activePet: pet,
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
    renderCarousel([]);
    scrollToBottom(true);

    ui.busy = true;
    if (dom.input) dom.input.disabled = false;
    showThinking();

    // Fixed, short delay purely so the thinking state is legible. It is
    // not a network call and not model latency.
    window.setTimeout(function () {
      clearThinking();
      var ctx = buildContext();
      var answer = State.resolve(message, ctx);
      var node = renderVetti(answer.text, answer.state);

      if (answer.petCard) {
        node.querySelector('.vetti-bubble').insertAdjacentHTML(
          'beforeend', petCardMarkup(answer.petCard));
      }

      if (answer.action === 'openPetForm') {
        openPetForm();
      }
      renderCarousel(answer.suggestions);
      ui.busy = false;
      hydrateMascots();
      scrollToBottom(true);
    }, 420);
  }

  // ── Idle alternation (subtle, controlled) ─────────────────────────────
  // Only two idle frames, swapped on a slow timer, and only while the
  // user is not mid-conversation. No continuous mascot animation.
  function startIdleAlternation() {
    window.setInterval(function () {
      if (ui.busy || document.hidden) return;
      ui.idleAlt = !ui.idleAlt;
      var avatars = dom.canvas.querySelectorAll('.vetti-avatar[data-state="idle"]');
      Array.prototype.forEach.call(avatars, function (node) {
        var src = State.mascotFor(ui.idleAlt ? 'idle_alt' : 'idle');
        var img = node.querySelector('img');
        if (!img || img.getAttribute('src') === src) return;
        img.setAttribute('src', src);
        img.setAttribute('alt', State.altFor(ui.idleAlt ? 'idle_alt' : 'idle'));
      });
    }, 6000);
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
    // Enter sends; Shift+Enter is a newline. Matches the composer label.
    if (dom.input) {
      dom.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (dom.composer) dom.composer.requestSubmit
            ? dom.composer.requestSubmit()
            : dom.composer.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    }
  }

  function bindClicks() {
    // Delegated: the canvas is re-rendered constantly, so per-node
    // listeners would be lost.
    document.addEventListener('click', function (e) {
      var target = e.target;

      var prompt = target.closest && target.closest('[data-vetti-prompt]');
      if (prompt) {
        send(prompt.getAttribute('data-vetti-prompt'));
        return;
      }
      var action = target.closest && target.closest('[data-vetti-action]');
      if (action) {
        var name = action.getAttribute('data-vetti-action');
        if (name === 'skip-intro') skipIntro();
        else if (name === 'replay-intro') replayIntro();
        else if (name === 'cancel-pet-form') closePetForm();
        return;
      }
      var scroll = target.closest && target.closest('[data-vetti-scroll]');
      if (scroll) {
        var track = el('vettiCarouselTrack');
        if (!track) return;
        var dir = parseInt(scroll.getAttribute('data-vetti-scroll'), 10) || 1;
        track.scrollBy({ left: dir * Math.max(180, track.clientWidth * 0.7), behavior: 'smooth' });
        return;
      }
      // Keep the "jump to latest" control in step with manual scrolling.
      if (dom.canvas && target === dom.scrollBtn) {
        scrollToBottom(true);
      }
    });

    if (dom.replay) {
      dom.replay.addEventListener('click', replayIntro);
    }

    var selector = el('vettiActivePet');
    if (selector) {
      selector.addEventListener('change', function () {
        ui.activePetId = selector.value;
        renderGreeting();
        if (pets().length) {
          var pet = activePet();
          renderVetti('Now talking about ' + pet.name + '.', 'idle');
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

  function skipIntro() {
    var row = dom.canvas.querySelector('[data-vetti-intro]');
    if (row) {
      var bubble = row.closest('.vetti-row');
      if (bubble) bubble.remove();
    }
    State.markIntroShown();
    renderVetti(
      'No problem. Ask me anything about your pets whenever you are ready.',
      'idle'
    );
    scrollToBottom(true);
  }

  // ── Mount ─────────────────────────────────────────────────────────────
  function mount() {
    cacheDom();
    if (!dom.canvas) return;

    showOpening();
    hydrateMascots();
    preloadIdle();

    bindComposer();
    bindClicks();
    bindFormSubmit();
    startIdleAlternation();
    syncLegacyChatbot();

    ui.booted = true;
    document.body.setAttribute('data-vetti-ready', '1');
  }

  // The portal already pins a legacy "VHS Assistant" bubble to the bottom
  // right. It would sit on top of Vetti's send button, so it is suppressed
  // while this workspace is open and restored everywhere else. Nothing is
  // removed from the other sections — this only follows the active one.
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
    // Sits after the portal's own init, so showSection() and the session
    // helpers already exist.
    mount();

    // Ask Vetti is the assisted default. The traditional pages stay
    // reachable from the sidebar.
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
    showOpening: showOpening,
    replayIntro: replayIntro,
    skipIntro: skipIntro,
    openPetForm: openPetForm,
    closePetForm: closePetForm,
    renderPetSelector: renderPetSelector,
    pets: pets,
    activePet: activePet,
    resetIntro: function () { State.resetIntro(); }
  };
})(window);