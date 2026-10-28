/* ============================================================
   PUBLIC VETTI — one lightweight assistant for the marketing site
   ------------------------------------------------------------
   ONE IDENTITY
     Vetti is Vetti. The User Portal owns the full, personalized,
     pet-aware Vetti workspace; this file owns the public one.

   ONE CONVERSATION STATE
     Every public mount (the homepage inline card and the floating
     panel on Services / About / Contact) renders the SAME thread,
     kept in sessionStorage for the tab's lifetime. Start a
     conversation on the homepage, open the floating Vetti on
     Services, and the conversation is already there.

     sessionStorage, not localStorage, on purpose: a public
     conversation is tab-scoped and never mixes with the signed-in
     User Portal conversation, which has its own storage.

   HYBRID PUBLIC ASSISTANT
     Laravel answers known clinic questions using backend rules; Gemini may
     answer bounded general questions when explicitly enabled. A local
     deterministic resolver remains the offline fallback.

   CAPABILITY BOUNDARY
     Public Vetti answers about the clinic: services, hours/location,
     booking guidance, visit preparation, login/signup. Anything about
     a specific pet, appointment history or records points to
     login/signup + the User Portal instead of pretending to know it.

   MOUNTS
     <div data-vetti-mount data-vetti-variant="inline"></div>
     <div data-vetti-mount data-vetti-variant="panel"></div>
     <div data-vetti-launcher></div>   (launcher + panel, non-home pages)
   ============================================================ */

(function () {
  "use strict";

  var THREAD_KEY = "vhs.publicVetti.thread.v2";
  // Opaque tab-scoped identifier; server stores only a bounded public topic.
  // The previous chat text is never included in network requests.
  var CONTEXT_KEY = 'vhs.publicVetti.contextId.v1';
  function freshContextId() {
    return 'vpub_' + Math.random().toString(36).slice(2, 14) + '_' + Date.now().toString(36);
  }
  function loadContextId() {
    try {
      var existing = window.sessionStorage.getItem(CONTEXT_KEY);
      if (/^vpub_[a-z0-9_]{12,60}$/.test(existing || '')) return existing;
      var next = freshContextId();
      window.sessionStorage.setItem(CONTEXT_KEY, next);
      return next;
    } catch (e) { return freshContextId(); }
  }
  var conversationId = loadContextId();
  var VETTI_ASSET_BASE = "../shared/assets/vetti/";
  var CHAT_AVATAR = VETTI_ASSET_BASE + "vetti-chat-head.png";
  var LAUNCHER_ASSET = VETTI_ASSET_BASE + "vetti-idle-a.png";


  var GREETING = {
    role: "vetti",
    text:
      "Hello! I'm Vetti. I can help with our clinic services, hours and " +
      "location, booking guidance, or preparing for a visit. What would you " +
      "like to know?"
  };

  /* Short labels: the question is what gets asked, the label is what fits
     on one rail. Same four starters on every public page. */
  var CHIPS = [
    { label: "How can I book?", ask: "How can I book an appointment?" },
    { label: "Services offered", ask: "What services do you offer?" },
    { label: "Hours & location", ask: "What are your clinic hours and location?" },
    { label: "Preparing for a visit", ask: "What should I prepare for my pet's visit?" }
  ];

  /* Rule table. First match wins; keep the private-data rule first so
     "my pet's appointment" can never fall through to the booking answer. */
  var RULES = [
    {
      keys: [
        "my pet", "my pets", "my dog", "my cat", "my puppy", "my kitten",
        "my appointment", "my booking", "my account", "my profile", "my record",
        "medical history", "medical record", "my prescription", "my invoice",
        "my reminder"
      ],
      reply:
        "That needs your own clinic details, so please log in or sign up and " +
        "open Vetti in the User Portal — the full Vetti is pet-aware and can " +
        "help you navigate your pets, appointments and records. Here I can help with general " +
        "clinic questions."
    },
    {
      keys: ["emergency", "urgent", "critical", "bleeding", "poison", "collapse"],
      reply:
        "If your pet may need urgent care, contact a veterinarian or emergency veterinary facility immediately. Do not wait for chat."
    },
    {
      keys: ["book", "appointment", "schedule", "reschedule", "slot", "available time"],
      reply:
        "Booking is done online: sign up or log in, then choose Book an " +
        "Appointment and pick a service, date and time. For same-day requests, contact the clinic via its Contact page."
    },
    {
      keys: [
        "service", "services", "offer", "treatment", "grooming", "groom",
        "vaccin", "spay", "neuter", "surgery", "deworm", "microchip",
        "blood test", "laboratory", "lab", "diagnostic", "x-ray", "boarding",
        "confinement", "health certificate", "home service", "home visit",
        "house call"
      ],
      reply:
        "Please visit the Services page for the current clinic service list. The clinic can confirm which services are presently offered."
    },
    {
      keys: [
        "hour", "hours", "open", "close", "closing", "location", "where",
        "address", "direction", "map", "contact", "phone", "number", "email", "clinic at"
      ],
      reply:
        "Please check the Contact page for the current clinic address, phone, email and directions. Appointment windows are not necessarily opening hours."
    },
    {
      keys: [
        "prepare", "bring", "first visit", "first time", "carrier", "leash", "vaccination card", "what to expect"
      ],
      reply:
        "For a visit: bring your pet's vaccination or health record if you " +
        "have one, keep dogs on a leash and cats in a carrier, and note any " +
        "symptoms, diet changes or medications. Arriving a few minutes early " +
        "helps us settle your pet in."
    },
    {
      keys: ["login", "log in", "sign up", "signup", "register", "account", "portal", "password"],
      reply:
        "Use the Login or Sign Up buttons in the navigation. Once you're " +
        "signed in, the User Portal gives you the full Vetti plus your pets " +
        "and appointments."
    },
    {
      keys: ["price", "cost", "fee", "how much", "rate", "payment"],
      reply:
        "Fees depend on the service and your pet's needs, so the clinic " +
        "confirms them directly. Check the Services and Contact pages for current details."
    },
    {
      keys: ["hi", "hello", "hey", "good morning", "good afternoon", "thanks", "thank you"],
      reply:
        "Happy to help! Ask me about our services, clinic hours, booking, or " +
        "preparing for a visit."
    }
  ];

  var FALLBACK =
    "I can help with clinic services, hours and location, booking guidance, " +
    "visit preparation, and login or signup questions. For anything specific " +
    "to your pet, log in and open the full Vetti in the User Portal.";

  function isGeneralClinicInfo(question) {
    var q = String(question || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").trim();
    return /\b(?:vhs\s+)?(?:vet\s+)?(?:clinics?|clinic\'s|klinika)\s+(?:info(?:rmation)?|details?|contacts?|address|location|phone(?:\s+number)?|email)\b/.test(q) ||
      /\b(?:info(?:rmation)?|impormasyon|details?)\s+(?:about|on|of|for|ng|sa)\s+(?:the\s+|your\s+)?(?:clinic|klinika)\b/.test(q) ||
      /\b(?:tell me about|about)\s+(?:the\s+|your\s+)?(?:clinic|klinika)\b/.test(q) ||
      /\b(?:pahingi|bigay)\s+(?:po\s+)?(?:ng\s+)?(?:info|impormasyon|details?)\s+(?:ng|sa)\s+(?:clinic|klinika)\b/.test(q);
  }

  // Restrict FAQ keywords to token or phrase boundaries. "hi" in "this"
  // and "book" in an unrelated larger word must never determine the intent.
  function hasFaqTerm(text, term) {
    var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var isStem = /^(vaccin|deworm|microchip|groom|magreserv)$/.test(term);
    return new RegExp('(^|[^\\p{L}\\p{N}])' + escaped + (isStem ? '' : '(?![\\p{L}\\p{N}])'), 'iu').test(text);
  }

  function answer(question) {
    var q = String(question || "").toLowerCase();
    // Public-only FAQ aliases; never reference private owner/pet data.
    // Retain the original privacy/emergency rules ahead of general intents.
    // Immediate safety advice must not be hidden by the "my pet" privacy
    // rule or by a broad service/appointment keyword in offline mode.
    if (/\b(?:emergency|urgent|poison|bleeding|seizures?|convulsions?|collapsed?|unconscious|not breathing|can['\u2019]?t breathe|cannot breathe|struggling to breathe|difficulty breathing)\b|hindi makahinga|hirap huminga|nahihirapan huminga|nangingisay/i.test(q)) return RULES[1].reply;
    if (/\b(?:my pet|my pets|my dog|my cat|my appointment|my booking|my records|aking alaga|mga alaga ko)\b/i.test(q)) return RULES[0].reply;
    if (/\b(?:medicine|medication|dosage|prescri(?:be|ption)|diagnos(?:e|is)|vomit(?:ing)?|diarrhea|fever|sick)\b/i.test(q))
      return 'I cannot diagnose or recommend medication in chat. Please contact a veterinarian for an assessment; for severe symptoms seek emergency care.';
    if (isGeneralClinicInfo(q)) return 'For current clinic information, please visit the Contact page for its verified address, phone and email, and the Services page for services.';
    if (/\b(?:paano magbook|paano magpa[- ]?book|paano magpa[- ]?appointment|magpa[- ]?book|mag[- ]?book)\b/i.test(q)) return RULES[2].reply;
    if (/\b(?:anong (?:services|serbisyo)|services ninyo|serbisyo nyo|may grooming|may bakuna)\b/i.test(q)) return RULES[3].reply;
    if (/\b(?:saan (?:kayo|ang clinic)|paano pumunta|address ng clinic|anong oras|oras ng clinic|what time bukas)\b/i.test(q)) return RULES[4].reply;
    if (/\b(?:paano mag[- ]?register|paano mag[- ]?login|paano mag[- ]?signup)\b/i.test(q)) return RULES[6].reply;
    if (/\b(?:magkano|presyo|price ng clinic)\b/i.test(q)) return RULES[7].reply;
    for (var i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      for (var j = 0; j < rule.keys.length; j++) {
        if (hasFaqTerm(q, rule.keys[j])) return rule.reply;
      }
    }
    return FALLBACK;
  }

  /* Phase 2: same-origin Laravel API. No Gemini key, pet data, or conversation
     history is sent by the browser. On any failure, retain the original rules. */
  var csrfToken = null;
  var csrfRequest = null;

  function csrfForPublicVetti() {
    if (csrfToken) return Promise.resolve(csrfToken);
    if (csrfRequest) return csrfRequest;
    csrfRequest = fetch("/api/auth/csrf", {
      method: "GET", credentials: "same-origin", cache: "no-store",
      headers: { "Accept": "application/json" }
    }).then(function (response) {
      if (!response.ok) throw new Error("csrf-unavailable");
      return response.json();
    }).then(function (body) {
      var value = body && body.data && body.data.csrf_token;
      if (typeof value !== "string" || !value) throw new Error("csrf-missing");
      csrfToken = value;
      return value;
    }).then(function (token) {
      csrfRequest = null;
      return token;
    }, function (error) {
      csrfRequest = null;
      throw error;
    });
    return csrfRequest;
  }

  function requestPublicVetti(question) {
    if (typeof window.fetch !== "function") return Promise.resolve(answer(question));
    return csrfForPublicVetti().then(function (token) {
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = window.setTimeout(function () {
        if (controller) controller.abort();
      }, 50000);
      return fetch("/api/ai/public-vetti", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": token,
          "X-Requested-With": "XMLHttpRequest"
        },
        body: JSON.stringify({ message: question, conversation_id: conversationId }),
        signal: controller ? controller.signal : undefined
      }).then(function (response) {
        if (response.status === 419) csrfToken = null;
        if (!response.ok) throw new Error("public-vetti-unavailable");
        return response.json();
      }).then(function (body) {
        var text = body && body.success && body.data && body.data.text;
        if (typeof text !== "string" || !text.trim() || text.length > 1200) {
          throw new Error("public-vetti-invalid-response");
        }
        return text;
      }).finally(function () {
        window.clearTimeout(timeout);
      });
    }).catch(function () {
      return answer(question);
    });
  }

  /* ---- shared state ------------------------------------------------- */

  var thread = load();
  var busy = false;
  var mounts = [];

  /* ---- Vetti mascot state machine (simple, visible) ===================== */
  /* Approved assets only (no generated images). Crossfade is a 300ms
   * opacity transition between the two <img> elements the mount holds:
   *   main-idle   -> vetti-idle-a.png (default resting face)
   *   main-greeting -> vetti-greeting.png (wave when the user taps the
   *                         mascot / section head)
   *   main-thinking -> vetti-thinking-a.png (immediately on user send)
   *   main-success  -> vetti-success.png (brief happy return, then back
   *                         to idle)
   *
   * The visual swap is done by swapping the src of the visible <img>
   * (the one inside .vetti-state-swapper), so the change is obvious in
   * the browser — not just a class string set on an element.
   *
   * Two <img> elements live in the mount at all times; the second is the
   * "next state ready" layer. A 150ms crossfade between them keeps the
   * mascot identity stable. prefers-reduced-motion disables the swap. */
  var _STATE_ASSETS = [
    { id: "main-idle",     image: VETTI_ASSET_BASE + "vetti-idle-a.png" },
    { id: "main-greeting", image: VETTI_ASSET_BASE + "vetti-greeting.png" },
    { id: "main-thinking", image: VETTI_ASSET_BASE + "vetti-thinking-a.png" },
    { id: "main-success",  image: VETTI_ASSET_BASE + "vetti-success.png" }
  ];

  var _currentState = "main-idle";
  var _currentAsset = "vetti-idle-a.png";
  var _idle = document.createElement("img");
  var _next = document.createElement("img");
  var _motionReduced = false;

  function _isMotionReduced() {
    if (!_motionReduced) {
      _motionReduced = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return _motionReduced;
  }

  function _setMascotState(host, stateClass) {
    _syncStatus(stateClass);
    if (!host) return;
    host.setAttribute("data-vetti-state-class", stateClass);
  }

  /* The homepage section head carries a small live status pill under the
     subtitle. It mirrors the same state machine as the mascot: one label
     per state, neutral wording only. Pages without the inline section
     (Services / About / Contact) have no #vettiStatus node, so this is a
     no-op there. */
  var STATUS_TEXT = {
    "main-idle": "Ready to help",
    "main-greeting": "Hello!",
    "main-thinking": "Thinking…",
    "main-success": "Happy to help!"
  };

  function _syncStatus(stateClass) {
    var pill = document.getElementById("vettiStatus");
    if (!pill) return;
    if (STATUS_TEXT[stateClass]) {
      var label = pill.querySelector(".vetti-inline__status-txt");
      if (label) label.textContent = STATUS_TEXT[stateClass];
    }
    pill.classList.toggle("vetti-inline__status--thinking", stateClass === "main-thinking");
  }

  /* Force the visible image to the asset for the given state. */
  function _applyState(host, stateClass) {
    if (!_currentState) {
      /* Mount not ready yet (init order). Cache for later. */
      _currentState = stateClass;
      return;
    }
    if (_isMotionReduced()) {
      /* No swap at all when the user prefers reduced motion. */
      return;
    }
    var spec = null;
    for (var i = 0; i < _STATE_ASSETS.length; i++) {
      if (_STATE_ASSETS[i].id === stateClass) { spec = _STATE_ASSETS[i]; break; }
    }
    if (!spec) return;
    var hostEl = host || document.querySelector(".vetti-state-swapper[data-vetti-state-class='" + stateClass + "']");
    if (!hostEl) return;
    var directImgs = hostEl.children;
    var img = null;
    for (var k = 0; k < directImgs.length; k++) {
      if (directImgs[k].tagName === "IMG" && !directImgs[k].classList.contains("is-hidden")) { img = directImgs[k]; break; }
    }
    if (!img) return;
    /* Force a re-paint so the crossfade actually happens. */
    img.style.opacity = "0";
    (function () {
      var tmp = img.src;
      img.src = img.src;
    })();
    img.style.opacity = "";
    if (img.getAttribute("data-vetti-next")) {
      img.removeAttribute("data-vetti-next");
      img.classList.remove("is-hidden");
    }
    img.src = spec.image;
    img.alt = "Vetti";
    _currentState = stateClass;
    host.setAttribute("data-vetti-state-class", stateClass);
  }

  function _setMascotIdle(host) {
    _setMascotState(host, "main-idle");
    _applyState(host, "main-idle");
  }

  function _setMascotGreeting(host) {
    _setMascotState(host, "main-greeting");
    _applyState(host, "main-greeting");
    window.setTimeout(function () {
      if (host) _setMascotIdle(host);
    }, 1200);
  }

  function _setMascotThinking(host) {
    _setMascotState(host, "main-thinking");
    _applyState(host, "main-thinking");
  }

  function _setMascotSuccess(host) {
    _setMascotState(host, "main-success");
    _applyState(host, "main-success");
    window.setTimeout(function () {
      if (host) _setMascotIdle(host);
    }, 1000);
  }

  /* The initial preview state: one greeting plus one example exchange, so
     the thread immediately reads like a conversation the visitor can join
     instead of an empty box. The example wording runs straight through the
     same answer() rule table, so it is deterministic, matches what a real
     send would produce, and never fakes personalized data. */
  var BOOKING_DEMO_QUESTION = "How can I book an appointment?";

  function seedThread() {
    return [
      { role: GREETING.role, text: GREETING.text, demo: true },
      { role: "user", text: BOOKING_DEMO_QUESTION, demo: true },
      { role: "vetti", text: answer(BOOKING_DEMO_QUESTION), demo: true }
    ];
  }

  function load() {
    var fresh = seedThread();
    try {
      var raw = window.sessionStorage.getItem(THREAD_KEY);
      if (!raw) return fresh;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fresh;
      var clean = parsed.filter(function (m) {
        return (
          m &&
          (m.role === "vetti" || m.role === "user") &&
          typeof m.text === "string" &&
          m.text.length > 0
        );
      });
      /* Demo seed messages keep their demo flag so the suggestion chips
         still show on a fresh load: the example exchange is preview
         content, not something the visitor typed. */
      return clean.length ? clean : fresh;
    } catch (e) {
      return fresh;
    }
  }

  function save() {
    try {
      window.sessionStorage.setItem(THREAD_KEY, JSON.stringify(thread));
    } catch (e) {
      /* Private mode / quota: the conversation still works for this page. */
    }
  }

  /* Only REAL visitor messages retire the suggestion chips — the
     deterministic demo exchange is preview content, not a question the
     visitor asked. */
  function hasUserMessage() {
    return thread.some(function (m) {
      return m.role === "user" && !m.demo;
    });
  }

  /* ---- DOM helpers --------------------------------------------------- */

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  /* ONE canonical chat avatar (vetti-chat-head.png) beside every Vetti
     message. It stays the same image; the section head mascot does the
     idle → greeting swap so the section head feels alive while the card
     keeps a stable, readable identity. */
  var MESSAGES_AVATAR = CHAT_AVATAR;

  function avatarNode(className) {
    var wrap = el("span", className);
    var img = document.createElement("img");
    img.src = MESSAGES_AVATAR;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    wrap.appendChild(img);
    return wrap;
  }

  /* Vetti's own bubbles are neutral with a soft edge, exactly like the
     User Portal thread; the user's bubble carries the purple accent. */
  function bubbleNode(message) {
    var bubble = el("p", "vetti-bubble vetti-bubble--" + message.role);
    bubble.textContent = message.text;
    return bubble;
  }

  function messageNode(message) {
    var row = el("div", "vetti-msg vetti-msg--" + message.role);
    if (message.role === "vetti") row.appendChild(avatarNode("vetti-msg__avatar"));
    row.appendChild(bubbleNode(message));
    return row;
  }

  function typingNode() {
    var row = el("div", "vetti-msg vetti-msg--vetti vetti-msg--typing");
    row.appendChild(avatarNode("vetti-msg__avatar"));
    var dots = el("span", "vetti-dots");
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement("i"));
    row.appendChild(dots);
    return row;
  }

  function sendIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML =
      '<line x1="22" y1="2" x2="11" y2="13"></line>' +
      '<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>';
    return svg;
  }

  /* ---- mount construction -------------------------------------------- */

  function buildMount(host) {
    var variant = host.getAttribute("data-vetti-variant") || "inline";
    var mount = { host: host, variant: variant };

    var card = el("div", "vetti-card vetti-card--" + variant);

    var head = el("div", "vetti-card__head");
    head.appendChild(avatarNode("vetti-card__avatar"));
    var identity = el("div", "vetti-card__identity");
    var name = el("span", "vetti-card__name");
    name.textContent = "Vetti";
    var role = el("span", "vetti-card__role");
    role.textContent = "Your VetHaven assistant";
    identity.appendChild(name);
    identity.appendChild(role);
    head.appendChild(identity);

    /* ONE canonical section header: the homepage section head (static HTML
       in index.html) owns the mascot + heading + subtitle. The card only
       carries the identity bar, so neither mascot nor heading is ever
       rendered twice. */
    card.appendChild(head);

    mount.threadEl = el("div", "vetti-thread");
    mount.threadEl.setAttribute("role", "log");
    mount.threadEl.setAttribute("aria-live", "polite");
    card.appendChild(mount.threadEl);

    mount.suggestEl = el("div", "vetti-suggest");
    card.appendChild(mount.suggestEl);

    var form = el("form", "vetti-composer");
    var input = el("input", "vetti-input");
    input.type = "text";
    input.placeholder = "Ask Vetti a question...";
    input.setAttribute("aria-label", "Ask Vetti a question");
    input.setAttribute("autocomplete", "off");
    var send = el("button", "vetti-send");
    send.type = "submit";
    send.setAttribute("aria-label", "Send message");
    send.appendChild(sendIcon());
    form.appendChild(input);
    form.appendChild(send);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submit(mount);
    });
    card.appendChild(form);

    mount.inputEl = input;

    /* One quiet line replaces the old quick-information panel and the
       duplicated footnotes. */
    var note = el("p", "vetti-note");
    note.innerHTML =
      'General clinic guidance only — for urgent concerns contact a veterinarian or emergency clinic.';
    card.appendChild(note);

    host.appendChild(card);
    return mount;
  }

  /* The mascot state is stored on the mount itself by default. This is the
     fallback for code that calls the public-setter when the mount is not
     yet on the page. */
  function _hostForStateClass(stateClass) {
    var sel = ".vetti-state-swapper[data-vetti-state-class='" + stateClass + "']";
    return document.querySelector(sel);
  }

  function renderMount(mount) {
    var threadEl = mount.threadEl;
    threadEl.textContent = "";

    thread.forEach(function (message) {
      threadEl.appendChild(messageNode(message));
    });

    if (busy) threadEl.appendChild(typingNode());

    /* The chips are a starter affordance, not permanent furniture: they
       leave as soon as the visitor has asked something. */
    mount.suggestEl.textContent = "";
    if (!hasUserMessage() && !busy) {
      CHIPS.forEach(function (chipSpec) {
        var chip = el("button", "vetti-chip");
        chip.type = "button";
        chip.textContent = chipSpec.label;
        chip.addEventListener("click", function () {
          /* Pressed feedback first, then the send: the chip visibly
             registers the tap before the message lands. sendText clears the
             chips right after, so the flash stays short on purpose. */
          chip.classList.add("is-pressed");
          window.setTimeout(function () {
            sendText(chipSpec.ask);
          }, 130);
        });
        mount.suggestEl.appendChild(chip);
      });
    }

    threadEl.scrollTop = threadEl.scrollHeight;

    /* Re-apply the state on every render so a fresh mount that got a stale
       class (e.g. re-made by hot reload or a second mount) keeps its face. */
    var host = mount.host.querySelector(".vetti-state-swapper");
    if (host && host.getAttribute("data-vetti-state-class") &&
        host.getAttribute("data-vetti-state-class") !== "main-idle") {
      _applyState(host, host.getAttribute("data-vetti-state-class"));
    }
  }

  function scrollThreadToEnd(mount) {
    /* Wait for layout so the newest bubble is measured, then pin it. */
    window.requestAnimationFrame(function () {
      mount.threadEl.scrollTop = mount.threadEl.scrollHeight;
    });
  }

  function renderAll() {
    mounts.forEach(function (mount) {
      renderMount(mount);
      scrollThreadToEnd(mount);
    });
  }

  function submit(mount) {
    var text = mount.inputEl.value.trim();
    if (!text) return;
    mount.inputEl.value = "";
    sendText(text);
  }

  /* The section-head mascot is the one visible state display on the
     homepage (the card keeps its stable chat avatar). */
  function sectionMascot() {
    var section = document.getElementById("vetti");
    return section ? section.querySelector(".vetti-state-swapper") : null;
  }

  function sendText(text) {
    var question = String(text || "").trim();
    if (!question || busy) return;

    thread.push({ role: "user", text: question });
    busy = true;
    save();
    renderAll();

    /* Thinking face is shown for the whole wait, not for an instant. */
    _setMascotThinking(sectionMascot());

    /* The dots under the avatar are the "working" signal. With motion
       reduced they cannot pulse, so the pause is shortened instead of
       leaving the visitor watching a frozen indicator. */
    var thinkMs =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 120
        : 550;

    /* Start the request immediately, keeping the same minimum thinking time. */
    var responseTask = requestPublicVetti(question);
    window.setTimeout(function () {
      responseTask.then(function (reply) {
        thread.push({ role: "vetti", text: reply });
      }, function () {
        thread.push({ role: "vetti", text: answer(question) });
      }).finally(function () {
        busy = false;
        save();
        renderAll();
        /* Existing mascot behavior, layouts and mount logic remain unchanged. */
        _setMascotSuccess(sectionMascot());
      });
    }, thinkMs);
  }

  /* ---- the inline (homepage) instance -------------------------------- */

  function inlineMount() {
    for (var i = 0; i < mounts.length; i++) {
      if (mounts[i].variant === "inline") return mounts[i];
    }
    return null;
  }

  var HIGHLIGHT_CLASS = "is-highlighted";
  var highlightTimer = null;

  /* "Ask Vetti" on the homepage lands here: scroll to the inline section,
     flash it, and put the caret in the input. */
  function goToInline() {
    var mount = inlineMount();
    if (!mount) return;
    var section = document.getElementById("vetti") || mount.host;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start"
    });

    window.clearTimeout(highlightTimer);
    mount.host.classList.add(HIGHLIGHT_CLASS);
    highlightTimer = window.setTimeout(function () {
      mount.host.classList.remove(HIGHLIGHT_CLASS);
    }, 1600);

    mount.inputEl.focus({ preventScroll: true });
  }

  /* ---- the floating instance (non-home pages) ------------------------ */

  var fab = null;
  var panel = null;
  var panelMount = null;

  function panelOpen() {
    return !!panel && panel.classList.contains("is-open");
  }

  function setPanel(open) {
    if (!panel || !fab) return;
    panel.classList.toggle("is-open", open);
    fab.classList.toggle("is-open", open);
    var button = fab.querySelector(".vetti-fab__btn");
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    hideTeaser();
    if (open && panelMount) panelMount.inputEl.focus({ preventScroll: true });
  }

  var TEASER_SHOW = null;
  var TEASER_HIDE = null;
  var TEASER_LOOP = null;

  function showTeaser() {
    if (!fab || panelOpen() || !teaser) return;
    teaser.classList.add("is-visible");
  }

  function hideTeaser() {
    if (!teaser) return;
    window.clearTimeout(TEASER_HIDE);
    teaser.classList.remove("is-visible");
  }

  var teaser = null;

  function buildLauncher() {
    var host = document.querySelector("[data-vetti-launcher]");
    /* The homepage already has the inline Vetti; a second entry point there
       would just be a duplicate, so the launcher is skipped whenever an
       inline mount exists on the page. */
    if (!host || document.querySelector('[data-vetti-mount][data-vetti-variant="inline"]')) {
      return;
    }

    fab = el("div", "vetti-fab");

    teaser = el("button", "vetti-fab__teaser");
    teaser.type = "button";
    teaser.setAttribute("aria-label", "Ask Vetti");
    teaser.innerHTML = 'Need help? <strong>Ask Vetti</strong>';
    teaser.addEventListener("click", function () {
      setPanel(true);
    });

    var button = el("button", "vetti-fab__btn");
    button.type = "button";
    button.setAttribute("aria-label", "Open Vetti chat");
    button.setAttribute("aria-expanded", "false");
    var img = document.createElement("img");
    img.src = host.getAttribute("data-vetti-asset") || LAUNCHER_ASSET;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    button.appendChild(img);
    button.addEventListener("click", function () {
      setPanel(!panelOpen());
    });

    panel = el("div", "vetti-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Vetti chat");
    /* It is a mount like any other, so init() builds it through the same code
       path as the inline card — that is what keeps one shared conversation
       rendering into both places. */
    panel.setAttribute("data-vetti-mount", "");
    panel.setAttribute("data-vetti-variant", "panel");
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setPanel(false);
    });

    fab.appendChild(teaser);
    fab.appendChild(button);
    fab.appendChild(panel);
    host.appendChild(fab);

    TEASER_SHOW = window.setTimeout(showTeaser, 6000);
    TEASER_HIDE = window.setTimeout(hideTeaser, 17000);
    TEASER_LOOP = window.setInterval(function () {
      if (panelOpen()) return;
      showTeaser();
      window.clearTimeout(TEASER_HIDE);
      TEASER_HIDE = window.setTimeout(hideTeaser, 11000);
    }, 70000);
  }

  /* ---- wiring -------------------------------------------------------- */

  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;

    var opener = target.closest("[data-open-vetti]");
    if (!opener) return;
    e.preventDefault();

    if (inlineMount()) {
      goToInline();
    } else {
      setPanel(true);
    }
  });

  /* ---- hero viewport fit --------------------------------------------- */
  /* Not chat logic. The homepage hero is sized as "first screen minus the
     navbar", and the navbar's real height changes per breakpoint (and again
     when the root font drops on small phones), so measure it instead of
     hardcoding a number per media query. Pages without a hero simply never
     use the variable. */
  function syncNavHeight() {
    var header = document.querySelector("header");
    if (!header) return;
    var h = Math.round(header.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--pv-nav-h", h + "px");
  }

  function watchNavHeight() {
    var header = document.querySelector("header");
    if (!header) return;
    syncNavHeight();
    window.addEventListener("resize", syncNavHeight);
    window.addEventListener("orientationchange", syncNavHeight);
    /* Late webfonts can settle the navbar a pixel or two after load. */
    if (window.ResizeObserver) {
      new window.ResizeObserver(syncNavHeight).observe(header);
    }
  }

  function init() {
    buildLauncher();
    watchNavHeight();

    mounts = [].slice
      .call(document.querySelectorAll("[data-vetti-mount]"))
      .map(buildMount);

    mounts.forEach(function (mount) {
      if (mount.variant === "panel") panelMount = mount;
    });

    /* Tap the section-head mascot for a wave — the greeting state's trigger.
       Purely additive: layout and chat never depend on it. */
    var headMascot = sectionMascot();
    if (headMascot) {
      headMascot.style.cursor = "pointer";
      headMascot.addEventListener("click", function () {
        if (!busy) _setMascotGreeting(sectionMascot());
      });
    }

    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* Exposed for the page and for tests: one public thread, one renderer. */
  window.VettiPublic = {
    answer: answer,
    thread: function () {
      return thread.slice();
    },
    reset: function () {
      conversationId = freshContextId();
      try { window.sessionStorage.setItem(CONTEXT_KEY, conversationId); } catch (e) { /* no storage */ }
      thread = seedThread();
      save();
      renderAll();
    }
  };
})();
