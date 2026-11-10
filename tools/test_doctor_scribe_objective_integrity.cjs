'use strict';
// Verbatim-source protection against corrupted Objective fragments after vital extraction.
// Uses fictional consultations only. No HTTP, DB, microphone, or Gemini calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sandbox = { window: { VHS_DOCTOR_SCRIBE_GEMINI: false }, Promise, Date, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../public/doctor/doctor-scribe.js'), 'utf8'), sandbox);
const s = sandbox.window.DoctorScribe;
let count = 0;
function check(name, transcript, fn) {
  const r = s.generateSoapDraft(transcript);
  assert.equal(r.ok, true, `${name}: should generate`);
  assert.equal(r.meta.engine, 'local-deterministic', 'must never silently call Gemini');
  fn(r);
  count++;
  console.log(`PASS [O${String(count).padStart(2, '0')}] ${name}`);
}
function eq(a, b) { assert.equal(a, b); }
check('Bella: mixed weight and temperature preserve original examination wording',
  "Bella's owner reports reduced appetite since yesterday. On examination, Bella weighs 7 kg and has a temperature of 38.4 C. I suspect mild digestive discomfort and recommend further examination and monitoring her appetite.", r => {
    eq(r.soap.subjective, "Bella's owner reports reduced appetite since yesterday.");
    eq(r.soap.objective.findings, 'On examination, Bella weighs 7 kg and has a temperature of 38.4 C.');
    eq(r.soap.objective.weightKg, 7);
    eq(r.soap.objective.temperatureC, 38.4);
    eq(r.soap.objective.heartRateBpm, null);
    assert.match(r.soap.assessment, /suspect mild digestive discomfort/i);
    assert.match(r.soap.plan, /recommend further examination/i);
  });
check('Max: temperature and heart rate do not leave broken possessives',
  "The owner reports that Max has been coughing for two days. On examination, the dog's temperature is 38.6 C and heart rate is 100 BPM. I suspect a mild respiratory irritation and recommend further examination and follow-up.", r => {
    eq(r.soap.objective.findings, "On examination, the dog's temperature is 38.6 C and heart rate is 100 BPM.");
    eq(r.soap.objective.temperatureC, 38.6);
    eq(r.soap.objective.heartRateBpm, 100);
  });
check('Objective exam tenderness remains verbatim alongside extracted weight',
  'On examination, mild abdominal tenderness was noted and weight was recorded as 7 kg.', r => {
    eq(r.soap.objective.findings, 'On examination, mild abdominal tenderness was noted and weight was recorded as 7 kg.');
    eq(r.soap.objective.weightKg, 7);
  });
check('Finding after measurement is not dropped or grammatically damaged',
  'On examination, the dog weighs 8 kg and has mild abdominal tenderness.', r => {
    eq(r.soap.objective.findings, 'On examination, the dog weighs 8 kg and has mild abdominal tenderness.');
    eq(r.soap.objective.weightKg, 8);
  });
check('Red ears after temperature remain present',
  'On examination, temperature was 38.5 C and mild redness was observed in the ears.', r => {
    assert.match(r.soap.objective.findings, /redness was observed in the ears/);
    eq(r.soap.objective.temperatureC, 38.5);
  });
check('Mixed vital and alertness retain full medical statement',
  'On examination, weight is 8 kg, temperature is 38 C, and the dog is alert.', r => {
    eq(r.soap.objective.findings, 'On examination, weight is 8 kg, temperature is 38 C, and the dog is alert.');
    eq(r.soap.objective.weightKg, 8);
    eq(r.soap.objective.temperatureC, 38);
  });
check('Pure vital sentence is accurately represented and numeric fields set',
  'Temperature is 38.5 C and heart rate is 90 BPM.', r => {
    eq(r.soap.objective.findings, 'Temperature is 38.5 C and heart rate is 90 BPM.');
    eq(r.soap.objective.temperatureC, 38.5);
    eq(r.soap.objective.heartRateBpm, 90);
  });
check('Pure owner complaint must not become examined Objective content',
  'Owner reports dog has been scratching both ears for three days.', r => {
    assert.match(r.soap.subjective, /owner reports/i);
    eq(r.soap.objective.findings, s.NOT_PROVIDED);
    eq(r.soap.objective.temperatureC, null);
  });
check('Conflicting weights remain unfilled and original values visible',
  "On examination, the dog's weight was recorded as 6 kg and 7 kg.", r => {
    eq(r.soap.objective.weightKg, null);
    eq(r.apply.weight, '');
    assert.match(r.soap.objective.findings, /6 kg and 7 kg/);
    assert.ok(r.warnings.some(w => /Conflicting weight/i.test(w)));
  });
check('Conflicting temperatures remain unfilled and original values visible',
  'Temperature was 38.5 C and 39.5 C on repeat examination.', r => {
    eq(r.soap.objective.temperatureC, null);
    eq(r.apply.temperature, '');
    assert.match(r.soap.objective.findings, /38.5 C and 39.5 C/);
    assert.ok(r.warnings.some(w => /Conflicting temperature/i.test(w)));
  });
check('Historical weight is never filled as current',
  "The dog's weight was 8 kg last month. No current weight was measured during today's consultation.", r => {
    eq(r.soap.objective.weightKg, null);
    assert.ok(r.warnings.some(w => /Historical/i.test(w)));
  });
check('Explicit examination redness without vitals unchanged',
  'During examination, mild redness was observed in both ears.', r => {
    eq(r.soap.objective.findings, 'During examination, mild redness was observed in both ears.');
  });
console.log(`\nPASS: ${count}/${count} Objective clinical-text integrity cases`);
