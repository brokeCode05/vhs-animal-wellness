/* Deterministic booking-context extraction — matrix A–P.
   Run from repo root: node tests/booking-extract.js
   No network. No API credentials. No browser. Deterministic.

   Loads the REAL shared catalog/parser (appointment-contract, mock-users)
   plus the resolver and the VettiAI contract, then drives every phrase
   through State.resolve() — the same entry point send() uses — so the
   projection, the intent routing and the validator are all exercised,
   not just the extractor in isolation. */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = process.cwd();

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

/* ── browser-ish globals ─────────────────────────────────────────── */
var store = {};
var localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  clear: function () { store = {}; }
};
var win = { localStorage: localStorage, sessionStorage: localStorage };
win.window = win;
global.window = win;
global.localStorage = localStorage;

['shared/appointment-contract.js', 'shared/mock-users.js',
 'user/vetti-state.js', 'user/vetti-ai.js', 'user/vetti-tools.js'].forEach(function (rel) {
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', 'sessionStorage',
    fs.readFileSync(path.join(ROOT, rel), 'utf8'))(win, localStorage, localStorage);
});

var State = win.VettiState;
var AI = win.VettiAI;
var T = win.VettiTools;
var U = win.SharedMockUsers;
ok('modules loaded (AppointmentContract/VettiState/VettiAI/VettiTools/SharedMockUsers)',
  !!(win.AppointmentContract && State && AI && T && U));

/* ── context shaped like VettiUI.buildContext() ──────────────────── */
var PETS = U.petsOfOwner(1);
var SERVICES = U.activeServices();
function ctx(extra) {
  return Object.assign({
    hasPets: PETS.length > 0,
    firstName: 'Maria',
    pets: PETS,
    activePet: PETS[0] || null,
    anotherPet: PETS[1] || null,
    appointments: { upcoming: [], past: [] },
    services: SERVICES,
    serviceGroups: [],
    suggestionsWithPet: ['Show my appointments'],
    suggestionsNoPet: ['What can Vetti do?'],
    responseLanguage: 'en'
  }, extra || {});
}
function ask(message, extra) { return State.resolve(message, ctx(extra)); }
function bc(answer) { return answer && answer.bookingContext ? answer.bookingContext : null; }
function idOf(name) {
  var s = U.serviceByValue(name);
  return s ? String(s.serviceId) : null;
}
function iso(offset) {
  var d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

ok('fixture: owner 1 has pets (Luna/Buddy/Mochi)', PETS.length >= 3, PETS.length);
ok('fixture: vaccination is an active catalog service', idOf('vaccination') === '2', idOf('vaccination'));

/* ── A. plain booking → no unsafe context ────────────────────────── */
var a = ask('book an appointment');
ok('A routes to the booking intent', a.id === 'booking' && a.action === 'openBooking', a.id);
ok('A carries NO bookingContext', bc(a) === null, a.bookingContext);
ok('A reply text unchanged', a.text.indexOf('booking flow for now') !== -1, a.text);

/* ── B/C. exact pet name, case-insensitive ───────────────────────── */
var b = ask('book luna for vaccination');
ok('B exact pet name resolved', bc(b) && bc(b).petId === String(PETS[0].petId), bc(b));
var c = ask('Book LUNA for vaccination');
ok('C pet name is case-insensitive', bc(c) && bc(c).petId === String(PETS[0].petId), bc(c));

/* ── D. unknown pet omitted ──────────────────────────────────────── */
var d = ask('book rex for vaccination');
ok('D unknown pet omitted, service kept',
  bc(d) && !('petId' in bc(d)) && bc(d).serviceId === idOf('vaccination'), bc(d));

/* ── E. exact recognized services ────────────────────────────────── */
var e1 = ask('book a blood test');
ok('E1 label match (Blood Test)', bc(e1) && bc(e1).serviceId === idOf('blood_test'), bc(e1));
var e2 = ask('book consultation');
ok('E2 label match (Consultation)', bc(e2) && bc(e2).serviceId === idOf('consultation'), bc(e2));

/* ── F. unknown / partial / ambiguous service omitted ────────────── */
var f1 = ask('book quantum therapy');
ok('F1 unknown service omitted (no serviceId, no petId ever invented)',
  bc(f1) === null || (!('serviceId' in bc(f1)) && !('petId' in bc(f1))), bc(f1));
var f2 = ask('book grooming');
ok('F2 partial wording omitted (not a full service name)', bc(f2) === null, bc(f2));
var f3 = ask('book dog grooming and cat grooming');
ok('F3 ambiguous (two services) omitted entirely', bc(f3) === null, bc(f3));

/* ── G. today / explicit ISO ─────────────────────────────────────── */
var g1 = ask('book today');
ok('G1 "today" resolves to YYYY-MM-DD', bc(g1) && bc(g1).preferredDate === iso(0), bc(g1));
var g2 = ask('book luna on 2026-10-15');
ok('G2 explicit safe YYYY-MM-DD kept', bc(g2) && bc(g2).preferredDate === '2026-10-15', bc(g2));

/* ── H. tomorrow ─────────────────────────────────────────────────── */
var h = ask('book tomorrow');
ok('H "tomorrow" resolves to YYYY-MM-DD',
  bc(h) && bc(h).preferredDate === iso(1) && /^\d{4}-\d{2}-\d{2}$/.test(bc(h).preferredDate), bc(h));

/* ── I/J/K. time preferences ─────────────────────────────────────── */
var i = ask('book tomorrow afternoon');
ok('I afternoon → timePreference', bc(i) && bc(i).timePreference === 'afternoon', bc(i));
var j = ask('book an appointment in the morning');
ok('J morning → timePreference', bc(j) && bc(j).timePreference === 'morning', bc(j));
var k = ask('book an appointment in the evening');
ok('K evening → timePreference', bc(k) && bc(k).timePreference === 'evening', bc(k));

/* ── L. full phrase ──────────────────────────────────────────────── */
var l = ask('book luna for vaccination tomorrow afternoon');
ok('L full phrase → pet + service + date + preference',
  bc(l) && bc(l).petId === String(PETS[0].petId) &&
  bc(l).serviceId === idOf('vaccination') &&
  bc(l).preferredDate === iso(1) &&
  bc(l).timePreference === 'afternoon' &&
  Object.keys(bc(l)).length === 4, bc(l));
ok('L no slot invented from "afternoon"', !('preferredTime' in bc(l)), bc(l));

/* ── M. unsupported date phrases invent nothing ──────────────────── */
var m1 = ask('book next tuesday');
ok('M1 "next tuesday" invents no date', bc(m1) === null, bc(m1));
var m2 = ask('book an appointment next week');
ok('M2 "next week" invents no date', bc(m2) === null, bc(m2));
var m3 = ask('book luna on 2026-02-31');
ok('M3 impossible calendar date rejected',
  bc(m3) !== null && !('preferredDate' in bc(m3)), bc(m3));

/* ── N. context rides ONLY on openBooking ────────────────────────── */
var withAppt = {
  appointments: { upcoming: [{ pet: 'Luna', service: 'Vaccination', date: 'Oct 10, 2026', time: '3:00 PM' }], past: [] }
};
var n1 = ask('i need to reschedule', withAppt);
ok('N1 reschedule action has NO bookingContext',
  n1.action === 'openReschedule' && bc(n1) === null, { action: n1.action, bc: n1.bookingContext });
var n2 = ask('i need to cancel', withAppt);
ok('N2 cancel action has NO bookingContext',
  n2.action === 'openCancel' && bc(n2) === null, { action: n2.action, bc: n2.bookingContext });
var n3 = State.resolve('book an appointment', ctx({ hasPets: false, pets: [], activePet: null }));
ok('N3 zero-pet booking gate (openPetForm) has NO bookingContext',
  n3.action === 'openPetForm' && bc(n3) === null, { action: n3.action, bc: n3.bookingContext });

/* ── O. partial context still opens booking ──────────────────────── */
var o = ask('book luna');
ok('O pet-only context is valid and partial',
  o.action === 'openBooking' && bc(o) && Object.keys(bc(o)).length === 1 &&
  bc(o).petId === String(PETS[0].petId), bc(o));

/* ── P. extracted context passes the existing VettiAI validator ──── */
var p = AI.validateAnswer(l);
ok('P full-phrase answer validates', p.ok === true, p);
ok('P validator keeps every extracted key',
  bc(l) && ['petId', 'serviceId', 'preferredDate', 'timePreference'].every(function (key) {
    return key in l.bookingContext;
  }) && l.bookingContext.timePreference === 'afternoon', l.bookingContext);
ok('P plain answer still validates', AI.validateAnswer(a).ok === true, AI.validateAnswer(a));
ok('P pet-only answer validates', AI.validateAnswer(o).ok === true, AI.validateAnswer(o));

/* ── extra: explicit time via the EXISTING shared parser only ────── */
var q1 = ask('book luna tomorrow at 10:00 AM');
ok('Q1 explicit "10:00 AM" → preferredTime in slot-label form',
  bc(q1) && bc(q1).preferredTime === '10:00 AM', bc(q1));
ok('Q1 full answer with time validates', AI.validateAnswer(q1).ok === true, AI.validateAnswer(q1));
var q2 = ask('book tomorrow around lunch for luna');
ok('Q2 vague time wording invents no preferredTime',
  bc(q2) && !('preferredTime' in bc(q2)), bc(q2));

/* ── safety: extraction never touches responseLanguage ───────────── */
var en = ask('book luna tomorrow afternoon', { responseLanguage: 'en' });
var tl = ask('book luna tomorrow afternoon', { responseLanguage: 'taglish' });
ok('X extraction independent of responseLanguage',
  JSON.stringify(bc(en)) === JSON.stringify(bc(tl)) && bc(en), bc(en));

/* ── Issue 1: booking language vs vaccination reminder ───────────── */
var r1 = ask('book vaccination tomorrow');
ok('R1 "book vaccination tomorrow" → openBooking + service + date',
  r1.action === 'openBooking' && bc(r1) && bc(r1).serviceId === idOf('vaccination') &&
  bc(r1).preferredDate === iso(1), { id: r1.id, bc: r1.bookingContext });
var r2 = ask('schedule vaccination tomorrow');
ok('R2 "schedule vaccination tomorrow" → openBooking + service + date',
  r2.action === 'openBooking' && bc(r2) && bc(r2).serviceId === idOf('vaccination') &&
  bc(r2).preferredDate === iso(1), { id: r2.id, bc: r2.bookingContext });
var r3 = ask('book Luna for vaccination tomorrow');
ok('R3 "book Luna for vaccination tomorrow" → pet + service + date',
  r3.action === 'openBooking' && bc(r3) && bc(r3).petId === String(PETS[0].petId) &&
  bc(r3).serviceId === idOf('vaccination') && bc(r3).preferredDate === iso(1), bc(r3));
var r4 = ask('schedule an appointment for vaccination tomorrow');
ok('R4 full scheduling phrase → openBooking + service + date',
  r4.action === 'openBooking' && bc(r4) && bc(r4).serviceId === idOf('vaccination') &&
  bc(r4).preferredDate === iso(1), { id: r4.id, bc: r4.bookingContext });
var r5 = ask('vaccination reminder');
ok('R5 "vaccination reminder" stays the reminder intent',
  r5.id === 'vaccination' && !r5.action && bc(r5) === null, { id: r5.id, action: r5.action });
var r6 = ask("when is Luna's vaccination due?");
ok('R6 informational vaccination question stays non-booking',
  r6.id === 'vaccination' && !r6.action && bc(r6) === null, { id: r6.id, action: r6.action });
var r7 = ask('tell me about vaccination');
ok('R7 "tell me about vaccination" keeps its existing intent',
  r7.id === 'pet_profile' && !r7.action && bc(r7) === null, { id: r7.id, action: r7.action });
var r8 = ask('vaccination schedule');
ok('R8 "vaccination schedule" noun phrase stays reminder, not booking',
  r8.id === 'vaccination' && !r8.action && bc(r8) === null,
  { id: r8.id, action: r8.action, bc: r8.bookingContext });
var r9 = ask('book vaccination schedule');
ok('R9 explicit "book" verb still books after a medical noun phrase',
  r9.action === 'openBooking' && bc(r9) && bc(r9).serviceId === idOf('vaccination'), bc(r9));
var r10 = ask('Vaccination tomorrow');
ok('R10 bare "Vaccination tomorrow" keeps existing reminder behaviour',
  r10.id === 'vaccination' && !r10.action && bc(r10) === null,
  { id: r10.id, action: r10.action });

/* ── Issue 2: unknown explicit pet must NOT fall back ────────────── */
var u1 = ask('book Rex for vaccination');
ok('U1 unknown explicit pet → no petId, signal set, service kept',
  bc(u1) && !('petId' in bc(u1)) && bc(u1).petUnresolved === true &&
  bc(u1).serviceId === idOf('vaccination'), bc(u1));
ok('U1 signal passes the VettiAI validator',
  AI.validateAnswer(u1).ok === true && u1.bookingContext.petUnresolved === true,
  AI.validateAnswer(u1));
ok('U1 resolver refuses the active-pet fallback',
  T.resolveBookingPet(bc(u1), PETS, PETS[0]) === null);
var u2 = ask('book Rex tomorrow');
ok('U2 unknown pet alone → signal + date, no petId',
  bc(u2) && bc(u2).petUnresolved === true && bc(u2).preferredDate === iso(1) &&
  !('petId' in bc(u2)), bc(u2));
var u3 = ask('book vaccination tomorrow');
ok('U3 no pet named → no signal, active-pet fallback still allowed',
  bc(u3) && !('petUnresolved' in bc(u3)) && !('petId' in bc(u3)) &&
  T.resolveBookingPet(bc(u3), PETS, PETS[0]) === PETS[0], bc(u3));
var u4 = ask('book luna for vaccination');
ok('U4 exact known pet resolves, no signal, resolver returns Luna',
  bc(u4) && bc(u4).petId === String(PETS[0].petId) && !('petUnresolved' in bc(u4)) &&
  T.resolveBookingPet(bc(u4), PETS, PETS[1]) === PETS[0], bc(u4));
var u5 = ask('book blood test tomorrow');
ok('U5 service vocabulary is never flagged as an unknown pet',
  bc(u5) && !('petUnresolved' in bc(u5)) && bc(u5).serviceId === idOf('blood_test') &&
  bc(u5).preferredDate === iso(1), bc(u5));
var u6 = ask('book my pet tomorrow');
ok('U6 "my pet" keeps the active-pet fallback path',
  bc(u6) && !('petUnresolved' in bc(u6)) && bc(u6).petId === String(PETS[0].petId) &&
  bc(u6).preferredDate === iso(1), bc(u6));
ok('U6 wizard-side resolver returns the active pet for it',
  T.resolveBookingPet(bc(u6), PETS, PETS[0]) === PETS[0]);
var u7 = ask('book an appointment');
ok('U7 plain booking keeps NO context and no signal (fallback allowed)',
  u7.action === 'openBooking' && bc(u7) === null &&
  T.resolveBookingPet(bc(u7), PETS, PETS[0]) === null, bc(u7));

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
