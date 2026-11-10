'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const w={VHS_DOCTOR_SCRIBE_GEMINI:false};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/doctor/doctor-scribe.js'),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout});
function draft(s){return w.DoctorScribe.generateSoapDraft(s);}
let r=draft('Owner asks whether a temperature of 40 C would be dangerous. No temperature was measured today. Plan: measure temperature during examination.');
assert.equal(r.soap.objective.temperatureC,null);assert.match(r.warnings.join(' '),/hypothetical/i);assert.match(r.soap.subjective,/Owner asks/);
r=draft('What if the weight is 9 kg? Weight was not measured today.');assert.equal(r.soap.objective.weightKg,null);
r=draft('Sabi ng may-ari, timbang ay 8 kg. Sa pagsusuri, timbang ay 9 kg at temperatura ay 38.5 C.');assert.equal(r.soap.objective.weightKg,9);assert.equal(r.soap.objective.temperatureC,38.5);
r=draft('Sa pagsusuri, timbang ay 8 kg at 9 kg.');assert.equal(r.soap.objective.weightKg,null);assert.match(r.warnings.join(' '),/conflicting/i);
r=draft('Sa pagsusuri, hindi sinukat ang timbang.');assert.equal(r.soap.objective.weightKg,null);
for(const text of ['Temperature is 39 C but the thermometer was broken.', 'The thermometer was broken, temperature is 39 C.', 'Temperature is possibly 39 C.', 'The temperature is 39 C but it was misread.']) {
 r=draft(text);assert.equal(r.soap.objective.temperatureC,null,text);assert.match(r.warnings.join(' '),/unreliable|uncertain/i);
}
r=draft('Weight is 7 kg. Temperature is 39 C but the thermometer was broken.');assert.equal(r.soap.objective.weightKg,7);assert.equal(r.soap.objective.temperatureC,null);
r=draft('My assessment is possible ear irritation and I recommend a closer ear examination and a follow-up in one week.');assert.match(r.soap.assessment,/possible ear irritation/i);assert.match(r.soap.plan,/recommend.*follow-up/i);
r=draft('May kaunti po ako napansin sa ilong niya pero hindi ko po alam kung gaano nakatagal yun sige po titignan natin siya sandali alert naman siya ngayon.');assert.equal(r.soap.subjective,'Not provided.');assert.equal(r.soap.plan,'Not provided.');assert.equal(r.unclassified.length,1);
r=draft('Sa ngayon wala akong napansin. Discharge sa mga mata niya.');assert.doesNotMatch(r.soap.plan,/discharge/i);
console.log('PASS: hypothetical, negated, owner-reported and Tagalog measurements');
