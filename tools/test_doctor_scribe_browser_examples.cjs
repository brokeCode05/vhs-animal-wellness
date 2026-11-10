'use strict';
// Regression cases transcribed from the Doctor Portal screenshots, plus variants.
// Operates only on the local parser with fictitious data; no AI requests/database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.resolve(__dirname, '../public/doctor/doctor-scribe.js'), 'utf8');
const sandbox = { window: { VHS_DOCTOR_SCRIBE_GEMINI: false }, Date, Promise, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'doctor-scribe.js' });
const s = sandbox.window.DoctorScribe;
let count = 0;
function test(name, text, check) {
  const r = s.generateSoapDraft(text);
  assert.equal(r.ok, true, `${name}: draft should succeed`);
  check(r);
  console.log(`PASS [B${String(++count).padStart(2, '0')}] ${name}`);
}
function warn(r, fragment) {
  assert.ok(r.warnings.some(w => w.toLowerCase().includes(fragment.toLowerCase())), `Expected warning ${fragment}, got: ${r.warnings.join('; ')}`);
}
test('Screenshot: full SOAP includes explicitly examined redness',
  'The owner reports that the dog has been scratching both ears for three days and has been shaking its head frequently. During examination, mild redness was observed in both ears. Temperature is 38.5 C, weight is 8 kg, and heart rate is 95 BPM. I suspect ear irritation, but further examination is needed. I recommend an ear examination and follow-up in one week.', r => {
    assert.match(r.soap.subjective, /owner reports.*scratching/i);
    assert.match(r.soap.objective.findings, /during examination.*redness/i);
    assert.match(r.soap.assessment, /I suspect ear irritation/);
    assert.match(r.soap.plan, /I recommend an ear examination/);
    assert.equal(r.soap.objective.weightKg, 8);
    assert.equal(r.soap.objective.temperatureC, 38.5);
    assert.equal(r.soap.objective.heartRateBpm, 95);
    assert.equal(r.unclassified.length, 0, 'Explicit exam observation should not be unclassified');
  });
test('Screenshot: 6 kg vs 7 kg recorded in one sentence shows warning',
  "On examination, the dog's weight was recorded as 6 kg and 7 kg.", r => {
    assert.equal(r.soap.objective.weightKg, null);
    assert.equal(r.apply.weight, '');
    warn(r, 'Conflicting weight');
    assert.match(r.soap.objective.findings, /6 kg and 7 kg/);
  });
test('Screenshot: 38.5 C vs 39.5 C on repeat shows warning',
  'Temperature was 38.5 C and 39.5 C on repeat examination.', r => {
    assert.equal(r.soap.objective.temperatureC, null);
    assert.equal(r.apply.temperature, '');
    warn(r, 'Conflicting temperature');
    assert.match(r.soap.objective.findings, /38.5 C and 39.5 C/);
  });
test('Screenshot: historical 8 kg stays historical, never current',
  "The dog's weight was 8 kg last month. No current weight was measured during today's consultation.", r => {
    assert.equal(r.soap.objective.weightKg, null);
    assert.equal(r.apply.weight, '');
    warn(r, 'Historical measurement');
  });
test('Single weight in past tense remains accurately extracted',
  'On examination the weight was 8 kg.', r => {
    assert.equal(r.soap.objective.weightKg, 8);
    assert.equal(r.apply.weight, '8');
  });
test('Single temperature in past tense remains accurately extracted',
  'Temperature was 38.5 C on examination.', r => {
    assert.equal(r.soap.objective.temperatureC, 38.5);
  });
test('Single heart rate in past tense remains accurately extracted',
  'Heart rate was 90 bpm on examination.', r => {
    assert.equal(r.soap.objective.heartRateBpm, 90);
  });
test('Two readings recorded as same value are not treated as conflict',
  'Temperature was 38.5 C and 38.5 C on repeat examination.', r => {
    assert.equal(r.soap.objective.temperatureC, 38.5);
    assert.ok(!r.warnings.some(x => /conflict/i.test(x)));
  });
test('Owner reported measured weight is not entered as current vital',
  'The owner reports weight was recorded as 8 kg at home.', r => {
    assert.equal(r.soap.objective.weightKg, null);
    assert.match(r.soap.subjective, /owner reports/i);
  });
test('Historical clinician temperature is not entered as current',
  'Temperature was measured at 38.5 C last month.', r => {
    assert.equal(r.soap.objective.temperatureC, null);
    warn(r, 'Historical measurement');
  });
test('No-current-weight statement cannot invent a measurement',
  "No current weight was measured during today's consultation.", r => {
    assert.equal(r.soap.objective.weightKg, null);
  });
test('New recognition of exam observation does not change proposed future exam',
  'I recommend an examination of both ears tomorrow.', r => {
    assert.match(r.soap.plan, /recommend/i);
    assert.equal(r.soap.objective.findings, s.NOT_PROVIDED);
  });
test('The adapter identifies local processing with Gemini disabled',
  'Owner reports the dog has been scratching its ears.', r => {
    assert.equal(r.meta.engine, 'local-deterministic');
  });
console.log(`\nPASS ${count}/${count} screenshot-driven browser regression scenarios`);
