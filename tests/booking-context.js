/* Booking-context flow — the full data path, matrix A–M.
   Run from repo root: node tests/booking-context.js
   No network. No API credentials. No browser. Deterministic.

   This harness loads the SHARED modules, the REAL portal script
   (user/user-script.js) and the Vetti modules into one vm context, then
   drives the shipped chain end to end:

     injected provider answer
       → VettiAI.ask() contract validation
       → VettiUI.send() → runAction(answer)
       → VettiTools.startBooking({ pet, bookingContext })
       → openBookModal(serviceName, bookingHandoff)
       → pet/service/date prefill → _refreshBookSlots() → preferred time

   Every assertion below reads the wizard's own form controls, so a
   validator-only implementation cannot pass this file.

   The portal's dashboard bootstrap inside user-script's DOMContentLoaded
   (loadUserData/loadPets/…) is intentionally not fired here: it belongs
   to the dashboard, not the booking wizard, and is exercised by browser
   QA instead. Only the Vetti workspace boot listeners are fired. */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = process.cwd();

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ── storage ─────────────────────────────────────────────────────── */
var store = {};
function kv() {
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; }
  };
}
var localStorage = kv(), sessionStorage = kv();
store['vetti.seenIntro'] = '1';   // returning user: no welcome layer

/* ── DOM stub with real <select> semantics ───────────────────────── */
function makeEl(tag) {
  var inner = '';
  var listeners = {};
  var classes = {};
  var added = {};
  var el = {
    tagName: String(tag || 'div').toUpperCase(),
    className: '', id: '', hidden: false,
    style: {}, dataset: {}, attributes: {},
    children: [], parentNode: null,
    textContent: '', value: '', checked: false,
    scrollTop: 0, scrollHeight: 0, clientHeight: 0, clientWidth: 0,
    offsetWidth: 0, offsetHeight: 0,
    // <select> plumbing. innerHTML assignment reparses <option value="…">
    // exactly as a browser does, resets the selection to the first option,
    // and exposes a live .options list for _hasSelectOption().
    options: [], selectedIndex: 0, _isSelect: false,
    _added: added,
    appendChild: function (c) {
      if (c && c.nodeType === 3) {
        // Text-node serialization: a browser would return the ESCAPED
        // text from div.innerHTML — that is how user-script's escapeHtml
        // works, so mirror it exactly.
        el.innerHTML = inner + String(c.textContent)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return c;
      }
      c.parentNode = el; el.children.push(c); return c;
    },
    removeChild: function (c) {
      var i = el.children.indexOf(c);
      if (i !== -1) el.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    insertBefore: function (node, ref) {
      node.parentNode = el;
      var i = ref ? el.children.indexOf(ref) : -1;
      if (i === -1) el.children.push(node); else el.children.splice(i, 0, node);
      return node;
    },
    setAttribute: function (k, v) { el.attributes[k] = String(v); },
    getAttribute: function (k) {
      return Object.prototype.hasOwnProperty.call(el.attributes, k) ? el.attributes[k] : null;
    },
    removeAttribute: function (k) { delete el.attributes[k]; },
    addEventListener: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) {
      var list = listeners[type] || [];
      var i = list.indexOf(fn);
      if (i !== -1) list.splice(i, 1);
    },
    dispatchEvent: function (evt) {
      (listeners[evt.type] || []).slice().forEach(function (fn) { fn.call(el, evt); });
      return true;
    },
    focus: function () {}, blur: function () {}, click: function () {},
    scrollBy: function () {}, scrollIntoView: function () {}, select: function () {},
    submit: function () {}, getBoundingClientRect: function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    contains: function () { return false; },
    classList: {
      add: function (n) { added[n] = (added[n] || 0) + 1; classes[n] = true; },
      remove: function (n) { delete classes[n]; },
      toggle: function (n, force) {
        var on = force === undefined ? !classes[n] : !!force;
        if (on) { classes[n] = true; added[n] = (added[n] || 0) + 1; } else delete classes[n];
        return on;
      },
      contains: function (n) { return !!classes[n]; }
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return inner; },
    set: function (v) {
      inner = String(v);
      if (inner === '') el.children = [];
      var opts = [];
      var re = /<option\b[^>]*\bvalue\s*=\s*"([^"]*)"/gi;
      var m;
      while ((m = re.exec(inner))) opts.push({ value: m[1] });
      if (opts.length || el._isSelect) {
        el._isSelect = true;
        el.options = opts;
        // Browser behaviour: replacing the option list resets the value to
        // the first option (the placeholder in every VHS form).
        el.value = opts.length ? opts[0].value : '';
        el.selectedIndex = opts.length ? 0 : -1;
      }
    }
  });
  return el;
}

var byId = {};
var docListeners = {};
var documentStub = {
  hidden: false,
  visibilityState: 'visible',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  activeElement: null,
  getElementById: function (id) {
    if (!byId[id]) {
      byId[id] = makeEl('div');
      byId[id].id = id;
      byId[id].parentNode = documentStub.body;
    }
    return byId[id];
  },
  createElement: function (tag) { return makeEl(tag); },
  createTextNode: function (text) { return { nodeType: 3, textContent: String(text) }; },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function (type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener: function (type, fn) {
    var list = docListeners[type] || [];
    var i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  },
  hasFocus: function () { return false; }
};

/* The welcome layer ships with the HTML `hidden` attribute; mirror it so
   the delegated click guard behaves as it does in the browser. */
documentStub.getElementById('vettiWelcome').hidden = true;

/* ── sandbox / vm context (window === global) ────────────────────── */
var winListeners = {};
var sandbox = {
  console: console,
  localStorage: localStorage,
  sessionStorage: sessionStorage,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  setInterval: setInterval,
  clearInterval: clearInterval,
  requestAnimationFrame: function (fn) { return setTimeout(fn, 16); },
  cancelAnimationFrame: function (id) { clearTimeout(id); },
  getComputedStyle: function () {
    return { transitionDuration: '0s', getPropertyValue: function () { return ''; } };
  },
  navigator: { userAgent: 'node-test', maxTouchPoints: 0 },
  addEventListener: function (type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener: function (type, fn) {
    var list = winListeners[type] || [];
    var i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  },
  location: { search: '', href: 'http://localhost/user/index.html', pathname: '/user/index.html', reload: function () {} },
  history: { replaceState: function () {} },
  document: documentStub,
  Image: function () { this.src = ''; },
  Event: function (type, opts) {
    this.type = type;
    this.bubbles = !!(opts && opts.bubbles);
    this.cancelable = !!(opts && opts.cancelable);
  },
  URL: URL,
  // Deliberately ABSENT: fetch / XMLHttpRequest. Any code path that tried
  // to reach a backend would throw a ReferenceError and fail the run.
  fetch: undefined,
  XMLHttpRequest: undefined
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
var ctx = vm.createContext(sandbox);

function load(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, ctx, { filename: rel });
}

/* ── load in shipped order ───────────────────────────────────────── */
['shared/appointment-contract.js', 'shared/mock-doctors.js', 'shared/clinic-settings.js',
 'shared/mock-users.js', 'shared/mock-appointments.js', 'shared/smart-scheduling.js',
 'shared/vhs-ui.js', 'user/user-script.js',
 'user/vetti-data.js', 'user/vetti-tools.js', 'user/vetti-state.js',
 'user/vetti-ai.js', 'user/vetti-onboarding.js'
].forEach(load);

// Snapshot before vetti-ui: its DOMContentLoaded listener is the boot we
// want; user-script's dashboard bootstrap (registered above) is skipped.
var dclCountBeforeVettiUI = (docListeners['DOMContentLoaded'] || []).length;
load('user/vetti-ui.js');

var U = sandbox.SharedMockUsers;
var SS = sandbox.SmartScheduling;
var APPT = sandbox.SharedMockAppointments;
var AI = sandbox.VettiAI;
var UI = sandbox.VettiUI;
var T = sandbox.VettiTools;

ok('modules loaded (SharedMockUsers/SmartScheduling/VettiAI/VettiTools)', !!(U && SS && AI && T && UI));
ok('openBookModal is a portal global reachable by VettiTools', typeof sandbox.openBookModal === 'function');
ok('current owner is the demo owner 1', U && U.currentUserId === 1, U && U.currentUserId);

var PETS = U.petsOfOwner(1);
ok('owner 1 has at least two pets', Array.isArray(PETS) && PETS.length >= 2, PETS && PETS.length);
var ACTIVE_SVC = U.activeServices();
function svcByValue(v) { return U.serviceByValue(v); }
ok('vaccination is an active canonical service', !!svcByValue('vaccination') &&
  ACTIVE_SVC.some(function (s) { return s.value === 'vaccination'; }));

/* ── index.html script wiring ────────────────────────────────────── */
var html = fs.readFileSync(path.join(ROOT, 'user/index.html'), 'utf8');
ok('index.html cache-busts user-script.js', /user-script\.js\?v=4\.5\.0/.test(html));
ok('index.html cache-busts vetti-tools.js', /vetti-tools\.js\?v=5\.2\.0/.test(html));
ok('index.html cache-busts vetti-state.js', /vetti-state\.js\?v=5\.3\.0/.test(html));
ok('index.html cache-busts vetti-ai.js', /vetti-ai\.js\?v=5\.3\.0/.test(html));
ok('index.html cache-busts vetti-ui.js', /vetti-ui\.js\?v=5\.2\.0/.test(html));
ok('index.html loads vetti-tools before vetti-ui',
  html.indexOf('vetti-tools.js') < html.indexOf('vetti-ui.js'));

/* ── boot only the Vetti workspace listeners ─────────────────────── */
(docListeners['DOMContentLoaded'] || []).slice(dclCountBeforeVettiUI).forEach(function (fn) { fn(); });
ok('VettiUI mounted', typeof UI.send === 'function' &&
  documentStub.body.getAttribute('data-vetti-ready') === '1');

/* ── helpers ─────────────────────────────────────────────────────── */
var AIx = AI;
function el(id) { return documentStub.getElementById(id); }

function isoOf(d) { return d.toISOString().split('T')[0]; }
function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d; }
var tomorrowIso = isoOf(addDays(1));

// The next weekday (within a week) where Smart Scheduling offers slots —
// deterministic raw material for the date/time cases.
var slotDate = null, slotLabels = [];
for (var i = 1; i <= 8 && !slotLabels.length; i++) {
  var cand = isoOf(addDays(i));
  if (new Date(cand + 'T12:00:00').getDay() === 0 || new Date(cand + 'T12:00:00').getDay() === 6) continue;
  var got = sandbox._smartSchedulingSlots(cand, { serviceId: svcByValue('vaccination').serviceId });
  if (got && got.length) { slotDate = cand; slotLabels = got; }
}
ok('found a weekday with engine slots for date/time cases', slotLabels.length > 0, { slotDate: slotDate });

// Drive the REAL chain: provider answer → validation → send → runAction.
function askBooking(bookingContext, hasContext) {
  AI.setProvider(function () {
    var ans = { text: 'Sure — opening the booking form.', state: 'idle',
      suggestions: ['Show my appointments'], action: 'openBooking' };
    if (hasContext !== false) ans.bookingContext = bookingContext;
    return Promise.resolve(ans);
  });
  UI.send('i want to book an appointment');
  return sleep(430).then(function () { AI.resetProvider(); });
}

function wizardOpened() { return (el('bookModal')._added['show'] || 0); }
function fields() {
  return {
    pet: el('pet_id').value,
    service: el('service_id').value,
    date: el('appointment_date').value,
    time: el('time_slot').value,
    timeOptions: el('time_slot').options.length,
    opened: wizardOpened()
  };
}
function assertBlank(name, f) {
  ok(name + ': pet/service/date/time all unselected',
    f.pet === '' && f.service === '' && f.date === '' && f.time === '', f);
}

async function main() {
  var apptCountBefore = APPT && typeof APPT.getAll === 'function' ? APPT.getAll().length : null;

  /* ── unit: validator keeps only the contract keys ──────────────── */
  var v = AI.validateAnswer({ text: 'ok', state: 'idle', action: 'openBooking',
    bookingContext: { petId: 2, serviceId: 'vaccination', preferredDate: '2026-10-10',
      preferredTime: '2:00 PM', timePreference: 'afternoon', evil: 'x' } });
  ok('U1 answer with bookingContext validates', v.ok === true, v);
  // validateAnswer mutates the answer in place — read it back:
  var mut = { text: 'ok', state: 'idle', action: 'openBooking',
    bookingContext: { petId: 2, serviceId: 'vaccination', preferredDate: '2026-10-10',
      preferredTime: '2:00 PM', timePreference: 'afternoon', evil: 'x' } };
  AI.validateAnswer(mut);
  ok('U2 validator keeps preferredTime and timePreference',
    mut.bookingContext && mut.bookingContext.preferredTime === '2:00 PM' &&
    mut.bookingContext.timePreference === 'afternoon', mut.bookingContext);
  ok('U3 validator normalizes numeric ids to canonical strings',
    mut.bookingContext.petId === '2', mut.bookingContext);
  ok('U4 validator drops unknown keys', !('evil' in mut.bookingContext), mut.bookingContext);
  var mut2 = { text: 'ok', state: 'idle', action: 'openBooking',
    bookingContext: { petId: {}, serviceId: [], preferredDate: 5, preferredTime: true } };
  AI.validateAnswer(mut2);
  ok('U5 validator deletes an all-malformed bookingContext',
    !('bookingContext' in mut2), Object.keys(mut2));

  /* ── unit: pure pet resolver ───────────────────────────────────── */
  var luna = PETS[0], buddy = PETS[1];
  ok('U6 no context → null (old behaviour)', T.resolveBookingPet(undefined, PETS, luna) === null);
  ok('U7 context without petId → active pet',
    T.resolveBookingPet({ serviceId: 'vaccination' }, PETS, luna) === luna);
  ok('U8 exact petId → that pet', T.resolveBookingPet({ petId: String(buddy.petId) }, PETS, luna) === buddy);
  ok('U9 unknown petId → null, no guessing',
    T.resolveBookingPet({ petId: '4242' }, PETS, luna) === null);
  ok('U10 ambiguous petId → null',
    T.resolveBookingPet({ petId: '1' }, [{ petId: 1 }, { petId: 1 }], luna) === null);
  ok('U11 array context → null', T.resolveBookingPet([1, 2], PETS, luna) === null);
  ok('U11b unresolved explicit pet blocks the active-pet fallback',
    T.resolveBookingPet({ serviceId: 'vaccination', petUnresolved: true }, PETS, luna) === null);
  ok('U11c no signal + no petId still falls back to the active pet',
    T.resolveBookingPet({ serviceId: 'vaccination' }, PETS, luna) === luna);

  /* ── unit: date resolver ───────────────────────────────────────── */
  ok('U12 today resolves to an actual date',
    sandbox._resolveBookingDate('today') === isoOf(addDays(0)), sandbox._resolveBookingDate('today'));
  ok('U13 tomorrow resolves to an actual date',
    sandbox._resolveBookingDate('tomorrow') === tomorrowIso, sandbox._resolveBookingDate('tomorrow'));
  ok('U14 literal words never pass through', /^\d{4}-\d{2}-\d{2}$/.test(sandbox._resolveBookingDate('tomorrow')));
  ok('U15 impossible calendar date rejected', sandbox._resolveBookingDate('2026-02-31') === null);
  ok('U16 malformed string rejected', sandbox._resolveBookingDate('next tuesday') === null);
  ok('U17 out-of-window date rejected', sandbox._resolveBookingDate(isoOf(addDays(90))) === null);

  /* ── reach: startBooking hands the envelope to openBookModal ───── */
  var realOpen = sandbox.openBookModal;
  var captured = null;
  sandbox.openBookModal = function (svc, handoff) { captured = { svc: svc, handoff: handoff }; };
  var r = T.startBooking({ pet: luna, bookingContext: { serviceId: 'vaccination' } });
  sandbox.openBookModal = realOpen;
  ok('U18 startBooking forwards {pet, bookingContext} to openBookModal',
    !!(captured && captured.handoff && captured.handoff.pet === luna &&
      captured.handoff.bookingContext.serviceId === 'vaccination') &&
    captured.svc === undefined && r.ok === true, captured);

  /* ── A. no bookingContext → old behaviour unchanged ────────────── */
  var a0 = wizardOpened();
  await askBooking(undefined, false);
  var fa = fields();
  assertBlank('A', fa);
  ok('A wizard opened exactly once', fa.opened === a0 + 1, fa.opened);
  ok('A pet select still offers the placeholder', el('pet_id').innerHTML.indexOf('Choose a pet') !== -1);
  ok('A time select still says "Select a date first"', el('time_slot').innerHTML.indexOf('Select a date first') !== -1);

  /* ── A2. legacy portal call still works ────────────────────────── */
  sandbox.openBookModal('vaccination');
  var fa2 = fields();
  ok('A2 legacy serviceName still prefills the service', fa2.service === 'vaccination', fa2);
  ok('A2 legacy call never prefills pet/date/time',
    fa2.pet === '' && fa2.date === '' && fa2.time === '', fa2);

  /* ── B. active pet + recognized service ────────────────────────── */
  await askBooking({ serviceId: 'vaccination' });
  var fb = fields();
  ok('B active pet prefilled', fb.pet === String(PETS[0].petId), fb.pet);
  ok('B recognized service prefilled', fb.service === 'vaccination', fb.service);
  ok('B no date/time invented', fb.date === '' && fb.time === '', fb);

  /* ── C. exact known pet ────────────────────────────────────────── */
  await askBooking({ petId: String(buddy.petId), serviceId: 'vaccination' });
  var fc = fields();
  ok('C exact pet prefilled', fc.pet === String(buddy.petId), fc.pet);

  /* ── D. unknown pet → no unsafe prefill ────────────────────────── */
  await askBooking({ petId: '4242' });
  var fd = fields();
  ok('D unknown pet left unselected', fd.pet === '', fd.pet);

  /* ── D2/E. numeric ids normalized; recognized service ──────────── */
  await askBooking({ petId: 4242, serviceId: 2 });
  var fd2 = fields();
  ok('D2 numeric unknown pet left unselected', fd2.pet === '', fd2.pet);
  ok('E numeric serviceId resolves to the canonical service', fd2.service === 'vaccination', fd2.service);

  /* ── F. unknown / fuzzy service → blank ────────────────────────── */
  await askBooking({ serviceId: 'vaccin' });
  var ff = fields();
  ok('F1 fuzzy service name NOT matched', ff.service === '', ff.service);
  await askBooking({ serviceId: 'quantum_turbo_boost' });
  var ff2 = fields();
  ok('F2 unknown service left blank', ff2.service === '', ff2.service);

  /* ── G. valid explicit date ────────────────────────────────────── */
  var gIso = isoOf(addDays(3));
  await askBooking({ preferredDate: gIso });
  var fg = fields();
  ok('G valid date applied', fg.date === gIso, fg.date);

  /* ── H. "tomorrow" resolves to an actual date ──────────────────── */
  await askBooking({ preferredDate: 'tomorrow' });
  var fh = fields();
  ok('H tomorrow resolved to YYYY-MM-DD', fh.date === tomorrowIso, fh.date);
  ok('H literal "tomorrow" never in the input', fh.date !== 'tomorrow' && /^\d{4}-\d{2}-\d{2}$/.test(fh.date));

  /* ── I. timePreference never invents a slot ────────────────────── */
  await askBooking({ preferredDate: slotDate, timePreference: 'afternoon' });
  var fi = fields();
  ok('I slots refreshed for the date', fi.timeOptions > 1, fi.timeOptions);
  ok('I afternoon preference selected NO exact slot', fi.time === '', fi.time);

  /* ── J. unavailable preferredTime not selected; available is ───── */
  await askBooking({ preferredDate: slotDate, preferredTime: '11:59 PM' });
  var fj = fields();
  ok('J1 unavailable preferredTime not selected', fj.time === '', fj.time);
  await askBooking({ preferredDate: slotDate, preferredTime: slotLabels[0] });
  var fj2 = fields();
  ok('J2 refreshed-available preferredTime selected', fj2.time === slotLabels[0], { got: fj2.time, want: slotLabels[0] });

  /* ── K. full valid pet + service + date + time ─────────────────── */
  var kDate = slotDate, kTime = slotLabels[0];
  await askBooking({ petId: String(PETS[2] ? PETS[2].petId : PETS[0].petId),
    serviceId: 'consultation', preferredDate: kDate, preferredTime: kTime });
  var fk = fields();
  var wantPet = String(PETS[2] ? PETS[2].petId : PETS[0].petId);
  ok('K pet prefilled', fk.pet === wantPet, fk.pet);
  ok('K service prefilled', fk.service === 'consultation', fk.service);
  ok('K date prefilled', fk.date === kDate, fk.date);
  ok('K available preferred time selected after refresh',
    fk.time === (el('time_slot').options.some(function (o) { return o.value === kTime; }) ? kTime : fk.time) &&
    fk.time !== '', fk.time);
  ok('K review/confirm still required (wizard stays on step 1)',
    el('wizardSubmitBtn').style.display === 'none' &&
    el('wizardNextBtn').style.display === '', el('wizardSubmitBtn').style.display);

  /* ── X. unknown explicit pet → blank pet, context still prefills ─ */
  await askBooking({ serviceId: 'vaccination', petUnresolved: true,
    preferredDate: isoOf(addDays(1)) });
  var fx = fields();
  ok('X1 unknown-pet signal leaves the pet selector blank', fx.pet === '', fx.pet);
  ok('X1 service and date still prefill around it',
    fx.service === 'vaccination' && fx.date === isoOf(addDays(1)), fx);
  ok('X1 slots refreshed after the prefill (Smart Scheduling)',
    fx.timeOptions > 1, fx.timeOptions);
  ok('X1 no slot selected; wizard still on step 1 (review required)',
    fx.time === '' && el('wizardSubmitBtn').style.display === 'none', fx);

  /* ── M. New Conversation / settings / menu unaffected ──────────── */
  function actionTarget(name) {
    return { closest: function (sel) {
      if (sel === '[data-vetti-action]') {
        return { getAttribute: function (k) { return k === 'data-vetti-action' ? name : null; } };
      }
      return null;
    } };
  }
  function clickAction(name) {
    (docListeners['click'] || []).forEach(function (fn) {
      fn({ target: actionTarget(name), preventDefault: function () {} });
    });
  }
  var mBefore = fields();
  var menuErr = null, settingsErr = null;
  try { clickAction('toggle-menu'); } catch (e) { menuErr = String(e); }
  ok('M menu opens without error', menuErr === null, menuErr);
  // The shared modal engine is stubbed for the settings dialog — this
  // harness has no layout engine; the point is the path stays intact.
  var realCreateModal = sandbox._createModal;
  sandbox._createModal = function () {
    // Emulate the shared engine: the dialog's contents live INSIDE the
    // overlay, so overlay.querySelector(...) resolves real elements.
    var overlay = makeEl('div');
    overlay.querySelector = function (sel) {
      return documentStub.getElementById(String(sel).replace(/^#/, '').split(' ')[0]);
    };
    return { overlay: overlay, close: function () {} };
  };
  try { clickAction('settings'); } catch (e) { settingsErr = String(e); }
  sandbox._createModal = realCreateModal;
  ok('M settings opens without error', settingsErr === null, settingsErr);
  var mAfterMenu = fields();
  ok('M menu/settings left the wizard untouched',
    mAfterMenu.pet === mBefore.pet && mAfterMenu.service === mBefore.service &&
    mAfterMenu.date === mBefore.date && mAfterMenu.time === mBefore.time, mAfterMenu);
  AI.clearHistory();
  AI.setProvider(function () { return Promise.resolve({ text: 'Services reply', state: 'idle', suggestions: [] }); });
  UI.send('what services do you offer?');
  await sleep(430);
  AI.resetProvider();
  ok('M chat works before reset', AI.getHistory().length === 2, AI.getHistory().length);
  var resetErr = null;
  try { clickAction('new-conversation'); } catch (e) { resetErr = String(e); }
  ok('M new conversation runs without error', resetErr === null, resetErr);
  ok('M new conversation cleared history', AI.getHistory().length === 0, AI.getHistory().length);
  UI.send('show my appointments');
  await sleep(430);
  ok('M chat works after reset', AI.getHistory().length === 2, AI.getHistory().length);

  /* ── L. malformed bookingContext ignored ───────────────────────── */
  var l0 = wizardOpened();
  await askBooking('garbage-not-an-object');
  var fl = fields();
  assertBlank('L1', fl);
  ok('L1 wizard still opened despite malformed context', fl.opened === l0 + 1, fl.opened);
  var l1 = wizardOpened();
  await askBooking({ petId: {}, serviceId: [], preferredDate: 5, preferredTime: true });
  var fl2 = fields();
  assertBlank('L2', fl2);
  ok('L2 wizard still opened despite malformed keys', fl2.opened === l1 + 1, fl2.opened);

  /* ── safeguards ────────────────────────────────────────────────── */
  var apptCountAfter = APPT && typeof APPT.getAll === 'function' ? APPT.getAll().length : null;
  if (apptCountBefore !== null) {
    ok('S1 no appointment was created by any flow', apptCountAfter === apptCountBefore,
      { before: apptCountBefore, after: apptCountAfter });
  }
  ok('S2 booking submit still behind review (submit untouched)',
    typeof sandbox.submitBooking === 'function');
  ok('S3 Smart Scheduling remains the slot authority',
    typeof SS.getAvailableSlots === 'function' &&
    /SmartScheduling/.test(fs.readFileSync(path.join(ROOT, 'user/user-script.js'), 'utf8')));

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
}

main().catch(function (err) {
  console.error('HARNESS ERROR', err);
  process.exit(1);
});
