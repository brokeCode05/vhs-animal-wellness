'use strict';
// No Laravel, database, network, or clinical records. Synthetic-only safety tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.resolve(__dirname, '../public/doctor/doctor-scribe.js'), 'utf8');
const ctx = { window: { VHS_DOCTOR_SCRIBE_GEMINI: false }, Date, Promise, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'doctor-scribe.js' });
const scribe = ctx.window.DoctorScribe;
let count = 0;
function run(name, transcript, expect) {
  const result = scribe.generateSoapDraft(transcript);
  assert.equal(result.ok, true, name + ': must generate draft');
  expect(result);
  count++;
  console.log('PASS [' + String(count).padStart(2, '0') + '] ' + name);
}
function warn(result, text) {
  assert.ok(result.warnings.some(w => w.toLowerCase().includes(text.toLowerCase())),
    'Expected warning containing ' + text + ', got ' + JSON.stringify(result.warnings));
}
run('Two conflicting weights in one sentence are never autofilled',
  'On exam weight is 6 kg and 7 kg.', r => {
    assert.equal(r.soap.objective.weightKg, null); assert.equal(r.apply.weight, ''); warn(r, 'Conflicting weight');
    assert.match(r.soap.objective.findings, /6 kg and 7 kg/);
  });
run('Two conflicting temperatures in one sentence are never autofilled',
  'Temperature 38.5 C, 39.5 C on repeat.', r => {
    assert.equal(r.soap.objective.temperatureC, null); assert.equal(r.apply.temperature, ''); warn(r, 'Conflicting temperature');
  });
run('Prior clinical weight is not a current measurement',
  'Weight 8 kg last month.', r => {
    assert.equal(r.soap.objective.weightKg, null); assert.equal(r.apply.weight, ''); warn(r, 'Historical');
    assert.ok(r.soap.objective.findings.includes('last month') || r.soap.subjective.includes('last month') || r.unclassified.join(' ').includes('last month'));
  });
run('Yesterday reading is not current',
  'Temperature 39 C yesterday.', r => {
    assert.equal(r.soap.objective.temperatureC, null); assert.equal(r.apply.temperature, ''); warn(r, 'Historical');
  });
run('Repeat of the same weight remains admissible',
  'On exam weight 8 kg and 8 kg repeated.', r => {
    assert.equal(r.soap.objective.weightKg, 8); assert.equal(r.apply.weight, '8');
  });
run('Conflicting heart rates are flagged too',
  'Heart rate 110 bpm and 125 bpm.', r => {
    assert.equal(r.soap.objective.heartRateBpm, null); assert.equal(r.apply.heartRate, ''); warn(r, 'Conflicting heart rate');
  });
run('A conflict remains blocking even if a later sentence has a value',
  'Weight 6 kg and 7 kg. Weight 8 kg.', r => {
    assert.equal(r.soap.objective.weightKg, null); assert.equal(r.apply.weight, ''); warn(r, 'Conflicting weight');
  });
run('A past reading plus a separate current reading uses current reading only',
  'Weight 7 kg last month. Weight 8 kg today.', r => {
    assert.equal(r.soap.objective.weightKg, 8); assert.equal(r.apply.weight, '8'); warn(r, 'Historical');
  });
run('Mixed measurements without conflicts keep separate vital fields',
  'Weight 8.5 kg and temperature 38.5 C. Heart rate 120 bpm.', r => {
    assert.equal(r.soap.objective.weightKg, 8.5);
    assert.equal(r.soap.objective.temperatureC, 38.5);
    assert.equal(r.soap.objective.heartRateBpm, 120);
  });
run('Bare food weight is not a patient weight',
  'The dog ate 8 kg of food according to the owner.', r => {
    assert.equal(r.soap.objective.weightKg, null);
  });
run('Fahrenheit does not fill Celsius',
  'Temperature 102.2 F and temperature 38.5 C.', r => {
    assert.equal(r.soap.objective.temperatureC, null); warn(r, 'Fahrenheit');
  });
run('The parser stays local with Gemini clinical processing disabled',
  'Owner reports coughing at night.', r => {
    assert.equal(r.meta.engine, 'local-deterministic');
  });
console.log('\nPASS: ' + count + '/' + count + ' additional vital-safety cases');
