'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/user/vetti-ai.js'), 'utf8');

function harness(localContext, responseData, opts = {}) {
  const sent = [];
  const win = {
    location: { pathname: '/user/index.html' },
    setTimeout, clearTimeout,
    VettiState: {
      resolve: () => ({
        state: 'booking', text: 'Opening the booking wizard.', action: 'openBooking',
        bookingContext: Object.assign({}, opts.localBooking || {})
      }),
      isState: (s) => ['booking', 'idle', 'reminder', 'apology'].includes(s)
    },
    fetch: async (url, options) => {
      sent.push({ url, options });
      if (url === '/api/auth/csrf') return { ok: true, json: async () => ({ data: { csrf_token: 'fake-csrf' } }) };
      if (opts.fail) throw new Error('connection unavailable');
      return { ok: true, json: async () => ({ success: true, data: responseData }) };
    }
  };
  win.window = win;
  vm.runInNewContext(source, { window: win, setTimeout, clearTimeout, Promise });
  return { ask: (text) => win.VettiAI.ask(text, localContext, { timeoutMs: 1000 }), sent };
}

const reply = (service, time) => ({
  service_hint: service, service_ambiguous: false, time_preference: time, source: 'ai',
  requires_confirmation: true, booking_created: false
});

(async () => {
  const ctx = { pets: [{ id: 7, name: 'Bornok' }], activePet: { petId: 7, name: 'Bornok' },
    services: [{ serviceId: 3, label: 'Full Grooming', value: 'full-grooming' },
      { serviceId: 5, label: 'Basic Consultation', value: 'consultation' }] };
  const first = harness(ctx, reply('grooming', 'afternoon'),
    { localBooking: { petId: '7', preferredDate: '2026-10-22' } });
  const a = await first.ask('Book Bornok for a bath tomorrow afternoon');
  assert.equal(a.action, 'openBooking');
  assert.equal(a.bookingContext.petId, '7');
  assert.equal(a.bookingContext.preferredDate, '2026-10-22');
  assert.equal(a.bookingContext.serviceId, 'full-grooming');
  assert.equal(a.bookingContext.timePreference, 'afternoon');
  assert.equal(first.sent.length, 2);
  assert.equal(first.sent[1].url, '/api/ai/booking-intent');
  const payload = JSON.parse(first.sent[1].options.body);
  assert.deepEqual(Object.keys(payload), ['message']);
  assert.equal(payload.message, 'Book Bornok for a bath tomorrow afternoon');
  assert.equal(first.sent.some(x => x.url.includes('generateContent')), false);

  const overwrite = harness(ctx, reply('grooming', 'evening'),
    { localBooking: { serviceId: '5', timePreference: 'morning', petUnresolved: true } });
  const b = await overwrite.ask('Book some unknown pet tomorrow');
  assert.equal(b.bookingContext.serviceId, 'consultation');
  assert.equal(b.bookingContext.timePreference, 'morning');
  assert.equal(b.bookingContext.petUnresolved, true);

  const ambiguous = harness({ services: [
    { serviceId: 1, label: 'Basic Grooming', value: 'basic-grooming' },
    { serviceId: 2, label: 'Full Grooming', value: 'full-grooming' }
  ] }, reply('grooming', 'morning'));
  const c = await ambiguous.ask('Book grooming');
  assert.equal(c.bookingContext.serviceId, undefined);
  assert.equal(c.bookingContext.timePreference, 'morning');

  const failure = harness(ctx, reply('grooming', 'morning'), { fail: true,
    localBooking: { preferredDate: '2026-10-22' } });
  const d = await failure.ask('Book a bath');
  assert.equal(d.action, 'openBooking');
  assert.equal(d.bookingContext.preferredDate, '2026-10-22');
  assert.equal(d.bookingContext.serviceId, 'full-grooming'); // safe catalog alias survives provider outage

  const invalid = harness(ctx, { ...reply('grooming', 'morning'), booking_created: true });
  const e = await invalid.ask('Book grooming');
  assert.equal(e.bookingContext.serviceId, 'full-grooming'); // local catalog vocabulary, not malformed provider command

  console.log('PASS: Phase 4 assisted booking — safe intent merge, exact catalog, ambiguity, privacy boundary, no override, failure fallback.');
})().catch(err => { console.error(err); process.exitCode = 1; });
