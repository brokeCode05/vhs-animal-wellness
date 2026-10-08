'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = process.cwd();
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
global.sessionStorage = localStorage;
global.Date = Date;

// Load shared dependencies in a browser-ish-ish manner.
[
  'shared/appointment-contract.js',
  'shared/mock-users.js',
  'shared/mock-appointments.js'
].forEach(function (rel) {
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', 'sessionStorage',
    fs.readFileSync(path.join(ROOT, rel), 'utf8'))(win, localStorage, localStorage);
});

var S = win.SharedMockAppointments;
var C = win.AppointmentContract;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

ok('shared mock appointments loaded', !!S);
ok('store api exists', !!(S.all && S.byId && S.todays && S.add));
ok('contract exists', !!(C && C.normalizeStatus && C.fromLegacy));

// ---- A. today's local date semantics ----
var localToday = (new Date()).getFullYear()
  + '-' + String((new Date()).getMonth() + 1).padStart(2, '0')
  + '-' + String((new Date()).getDate()).padStart(2, '0');
var all = S.all();
var byDate = {};
all.forEach(function (a) {
  byDate[a.appointmentDate] = byDate[a.appointmentDate] || [];
  byDate[a.appointmentDate].push(a);
});

ok('today bucket exists', !!byDate[localToday], localToday);
var todayAppts = byDate[localToday] || [];
var idsToday = todayAppts.map(function (a) { return a.appointmentId; }).sort();

ok('apt301 is today', idsToday.indexOf('apt301') !== -1, idsToday);
ok('apt303 is today', idsToday.indexOf('apt303') !== -1, idsToday);
ok('apt304 is today', idsToday.indexOf('apt304') !== -1, idsToday);
ok('exactly 3 today seeds', idsToday.length === 3, idsToday);

var apt301 = S.byId('apt301');
ok('apt301 byId exists', !!apt301);
if (apt301) {
  ok('A. apt301 date == local today', apt301.appointmentDate === localToday, apt301.appointmentDate + ' vs ' + localToday);
  ok('B. apt301 status == checked_in', C.normalizeStatus(apt301.status) === 'checked_in', C.normalizeStatus(apt301.status));
  ok('C. apt301 id unchanged', apt301.appointmentId === 'apt301', apt301.appointmentId);
  ok('D. apt301 reference preserved', apt301.referenceNo === 'VHS-20260926-A1B2C3', apt301.referenceNo);
  ok('E. apt301 checkedInAt is today', apt301.checkedInAt && apt301.checkedInAt.indexOf(localToday) === 0, apt301.checkedInAt);
  ok('apt301 owner unchanged', apt301.owner && apt301.owner.name === 'Maria Santos', apt301.owner);
  ok('apt301 pet unchanged', apt301.pet && apt301.pet.name === 'Luna', apt301.pet);
  ok('apt301 service unchanged', String(apt301.service) === 'Consultation', apt301.service);
  ok('apt301 time unchanged', apt301.appointmentTime === '10:00', apt301.appointmentTime);
  ok('apt301 assignedVetId unchanged', apt301.assignedVetId === 2, apt301.assignedVetId);
}

// ---- F/G. historical/future roles ----
var pastAppts = all.filter(function (a) {
  return a.appointmentDate < localToday;
});
var futureAppts = all.filter(function (a) {
  return a.appointmentDate > localToday;
});

ok('F. historical seed apt302 remains past', byDate['apt302'] === undefined && pastAppts.some(function (a) { return a.appointmentId === 'apt302'; }), pastAppts.map(function (a) { return a.appointmentId; }));
ok('F. historical seed apt305 remains past', byDate['apt305'] === undefined && pastAppts.some(function (a) { return a.appointmentId === 'apt305'; }), pastAppts.map(function (a) { return a.appointmentId; }));
ok('F. demo seed apt900 remains past', byDate['apt900'] === undefined && pastAppts.some(function (a) { return a.appointmentId === 'apt900'; }), pastAppts.map(function (a) { return a.appointmentId; }));
ok('G. future seed apt306 remains future', byDate['apt306'] === undefined && futureAppts.some(function (a) { return a.appointmentId === 'apt306'; }), futureAppts.map(function (a) { return a.appointmentId; }));

// Ensure no seed accidentally collapsed onto the same target day.
var todayIds = todayAppts.map(function (a) { return a.appointmentId; });
ok('no apt302/305/900/306 merged into today', !todayIds.some(function (id) { return id === 'apt302' || id === 'apt305' || id === 'apt900' || id === 'apt306'; }), todayIds);

// ---- H/I/J/K. filtered views ----
var todays = S.todays();
ok('H. todays() includes apt301', todays.some(function (a) { return a.appointmentId === 'apt301'; }), todays.map(function (a) { return a.appointmentId; }));

var userActiveToday = todayAppts.filter(function (a) {
  var s = C.normalizeStatus(a.status);
  return !!(s === 'pending' || s === 'confirmed' || s === 'checked_in' || s === 'in_consultation' || s === 'rescheduled');
});
ok('I. apt301 would be in user active/upcoming today', userActiveToday.some(function (a) { return a.appointmentId === 'apt301'; }), userActiveToday.map(function (a) { return a.appointmentId; }));

ok('J. doctor queue source sees apt301', todays.some(function (a) { return a.appointmentId === 'apt301'; }));
ok('K. admin todaysSchedule source sees apt301', todays.some(function (a) { return a.appointmentId === 'apt301'; }));

// ---- L/M. uniqueness ----
var seenIds = {};
var idDup = false;
all.forEach(function (a) {
  if (seenIds[a.appointmentId]) idDup = true;
  seenIds[a.appointmentId] = true;
});
ok('L. no duplicate seed IDs', !idDup, Object.keys(seenIds));

var refs = all.map(function (a) { return a.referenceNo; });
var refDup = refs.length !== new Set(refs).size;
ok('M. no duplicate reference numbers', !refDup, refs);

// ---- N. persistence layering intact ----
var beforeKeys = Object.keys(store).slice().sort();
var added = S.add({
  appointmentId: 'apt999',
  referenceNo: 'VHS-TEST-999',
  userId: 1,
  petId: 1,
  assignedVetId: 2,
  service: 'Consultation',
  appointmentDate: localToday,
  appointmentTime: '13:00',
  visitContext: 'Test',
  notes: '',
  status: 'confirmed'
});
ok('N. add returns ok', added.ok === true, added);
ok('N. added record reachable byId', !!S.byId('apt999'));
var afterKeys = Object.keys(store).slice().sort();
ok('N. exactly one localStorage key written during add', afterKeys.length === beforeKeys.length + 1, [beforeKeys, afterKeys]);

// Clean up the temp key so baseline stays clean for any other runner.
S.update('apt999', { status: 'canceled' });

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
