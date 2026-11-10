'use strict';
// Independent, read-only stress tests for the current Doctor Scribe local parser.
// No changes to clinic data; no Gemini requests; no Laravel/database needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'public/doctor/doctor-scribe.js');
if (!fs.existsSync(file)) {
  console.error('ERROR: Missing ' + file + '. Place this script under your Laravel project tools/ directory.');
  process.exit(2);
}
const sandbox = { window: { VHS_DOCTOR_SCRIBE_GEMINI: false }, Date, Promise, setTimeout, clearTimeout };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: 'doctor-scribe.js' });
const s = sandbox.window.DoctorScribe;
if (!s || typeof s.generateSoapDraft !== 'function') throw new Error('DoctorScribe.generateSoapDraft not found');
const results = [];
function draft(input) { const r = s.generateSoapDraft(input); assert.equal(r.ok, true, `Rejected valid transcript: ${input}`); return r; }
function has(value, needle) { assert.ok(String(value).toLowerCase().includes(needle.toLowerCase()), `Expected "${needle}" in "${value}"`); }
function test(id, level, name, fn) {
  try { fn(); results.push({id,level,name,pass:true}); console.log(`PASS [${id}] ${name}`); }
  catch (e) { results.push({id,level,name,pass:false,error:e.message}); console.log(`FAIL [${id}] (${level}) ${name}\n    ${e.message}`); }
}
test('T01','high','Owner complaint routes only to Subjective', () => {
  const r=draft('Owner says the dog has been vomiting since last night.'); has(r.soap.subjective,'Owner says');assert.equal(r.soap.objective.findings,s.NOT_PROVIDED);assert.equal(r.soap.assessment,s.NOT_PROVIDED);assert.equal(r.soap.plan,s.NOT_PROVIDED);
});
test('T02','high','Exam findings route to Objective',()=>{const r=draft('On examination, redness observed in both ears.');has(r.soap.objective.findings,'redness');assert.equal(r.soap.subjective,s.NOT_PROVIDED);});
test('T03','high','Assessment remains a documented suspicion',()=>{const r=draft('I suspect mild ear irritation, needs further examination.');has(r.soap.assessment,'suspect');assert.equal(r.soap.plan,s.NOT_PROVIDED);});
test('T04','high','Proposed exam routes to Plan, not completed exam',()=>{const r=draft('I recommend an ear examination and follow up in one week.');has(r.soap.plan,'recommend');assert.equal(r.soap.objective.findings,s.NOT_PROVIDED);});
test('T05','high','Four-section paragraph without SOAP labels',()=>{
  const r=draft('Owner reports vomiting yesterday. On examination, mild dehydration observed. I suspect gastroenteritis. Recommend oral fluids and recheck tomorrow.');
  has(r.soap.subjective,'vomiting');has(r.soap.objective.findings,'dehydration');has(r.soap.assessment,'suspect');has(r.soap.plan,'Recommend');
});
test('T06','high','Four-section Taglish',()=>{
  const r=draft('Sabi ng owner, nangangati ang aso nitong dalawang araw. Sa pagsusuri, may pamumula sa balat. Posibleng allergy. Pinayuhan na bumalik sa isang linggo.');
  has(r.soap.subjective,'nangangati');has(r.soap.objective.findings,'pamumula');has(r.soap.assessment,'Posibleng');has(r.soap.plan,'Pinayuhan');
});
test('T07','high','Explicit SOAP labels',()=>{
  const r=draft('Subjective: Coughing at night. Objective: On examination wheezing noted. Assessment: Suspected respiratory irritation. Plan: Recheck in three days.');
  has(r.soap.subjective,'Coughing');has(r.soap.objective.findings,'wheezing');has(r.soap.assessment,'Suspected');has(r.soap.plan,'Recheck');
});
test('T08','critical','Measurement precision: kilograms, Celsius, BPM',()=>{
  const r=draft('Weight: 8.5 kg. Temperature 38.5 C. HR: 120 bpm.');
  assert.equal(r.soap.objective.weightKg,8.5);assert.equal(r.soap.objective.temperatureC,38.5);assert.equal(r.soap.objective.heartRateBpm,120);
});
test('T09','critical','Fahrenheit must not be entered as Celsius',()=>{
  const r=draft('Temperature 102.2 F and heart rate 130 bpm.');
  assert.equal(r.soap.objective.temperatureC,null);assert.equal(r.soap.objective.heartRateBpm,130);has(r.warnings.join(' '),'Fahrenheit');
});
test('T10','critical','Owner-reported historical weight not a current measurement',()=>{
  const r=draft('Owner reports weight 8 kg last month.');assert.equal(r.soap.objective.weightKg,null);has(r.soap.subjective,'last month');
});
test('T11','critical','Home temperature not clinician-measured vital',()=>{
  const r=draft('Owner reports temperature 39 C taken at home.');assert.equal(r.soap.objective.temperatureC,null);has(r.soap.subjective,'temperature');
});
test('T12','critical','Two contradictory temperatures across sentences must blank value',()=>{
  const r=draft('Temperature 38.5 C. Temperature 39.5 C.');assert.equal(r.soap.objective.temperatureC,null);has(r.warnings.join(' '),'Conflicting');
});
test('T13','critical','Two contradictory weights across sentences must blank value',()=>{
  const r=draft('Weight 6 kg. Weight 7 kg.');assert.equal(r.soap.objective.weightKg,null);has(r.warnings.join(' '),'Conflicting');
});
test('T14','high','Repeated identical vital is accepted',()=>{
  const r=draft('Temperature 38.5 C. Temperature 38.5 C.');assert.equal(r.soap.objective.temperatureC,38.5);
});
test('T15','high','Negated owner complaint preserved verbatim',()=>{
  const r=draft('Owner says dog is not vomiting and is eating normally.');has(r.soap.subjective,'not vomiting');assert.equal(r.soap.assessment,s.NOT_PROVIDED);
});
test('T16','critical','Symptom alone must not invent diagnosis or prescription',()=>{
  const r=draft('Owner reports frequent scratching of both ears.');assert.equal(r.soap.assessment,s.NOT_PROVIDED);assert.equal(r.soap.plan,s.NOT_PROVIDED);assert.equal(r.soap.objective.temperatureC,null);
});
test('T17','high','Ambiguous pet description not misrepresented as clinician exam',()=>{
  const r=draft('The dog has red ears.');assert.equal(r.soap.objective.findings,s.NOT_PROVIDED);assert.equal(r.unclassified.length,1);
});
test('T18','medium','Unsupported slang preserved for doctor review',()=>{
  const r=draft('owners sez nag susuka ang aso. red ears. meds needed.');assert.ok(r.unclassified.length>=1,'Unrecognized wording should be visible to doctor');
});
test('T19','high','Pure clinician exam can preserve clinical negation',()=>{
  const r=draft('On examination, no visible wounds or swelling.');has(r.soap.objective.findings,'no visible wounds');
});
test('T20','critical','Missing measurements clear proposed apply values',()=>{
  const r=draft('Owner reports reduced appetite for two days.');assert.equal(r.apply.weight,'');assert.equal(r.apply.temperature,'');assert.equal(r.apply.heartRate,'');
});
test('T21','medium','Empty transcript rejected',()=>{assert.equal(s.generateSoapDraft('').ok,false);});
test('T22','medium','Tiny transcript rejected',()=>{assert.equal(s.generateSoapDraft('Hi').ok,false);});
test('T23','medium','Oversized transcript rejected',()=>{assert.equal(s.generateSoapDraft('x'.repeat(8001)).ok,false);});
test('T24','high','Local mode identifies itself and does not claim Gemini',()=>{
  const r=draft('Owner reports scratching both ears.');assert.equal(r.meta.engine,'local-deterministic');
});
test('T25','critical','Conflicting weights in ONE sentence must blank the vital',()=>{
  const r=draft('On exam weight is 6 kg and 7 kg.');assert.equal(r.soap.objective.weightKg,null,'Ambiguous 6 kg vs 7 kg must not auto-fill');has(r.warnings.join(' '),'Conflicting');
});
test('T26','critical','Conflicting temperatures in ONE sentence must blank the vital',()=>{
  const r=draft('Temperature 38.5 C, 39.5 C on repeat.');assert.equal(r.soap.objective.temperatureC,null,'Two temperatures must not silently select the first');has(r.warnings.join(' '),'Conflicting');
});
test('T27','high','Historical clinician reading alone must not become a current vital',()=>{
  const r=draft('Weight 8 kg last month.');assert.equal(r.soap.objective.weightKg,null,'Historical value is not current');
});
const passed=results.filter(r=>r.pass).length;const failed=results.length-passed;
console.log(`\nEXTENDED DOCTOR SCRIBE QA: ${passed}/${results.length} scenarios passed, ${failed} failed.`);
if (failed) {
  console.log('Failures require source fixes or explicit clinical review; tests do not modify the application.');
  results.filter(r=>!r.pass).forEach(r=>console.log(`  ${r.id} [${r.level}]: ${r.name}`));
  process.exitCode=1;
}
