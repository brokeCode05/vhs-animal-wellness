'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c={window:{},Date,Promise,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/doctor/doctor-scribe.js'),'utf8'),c);
const candidates=s=>c.window.DoctorScribe.reviewableVitals(s);
const cases=[
 ['clear weight','Weight is 7 kg.','weight','7'],
 ['clear temp','Temperature is 38.5 C.','temperature','38.5'],
 ['clear pulse','Heart rate is 100 bpm.','heartRate','100'],
 ['broken thermometer after','Temperature is 39 C. The thermometer was broken.','temperature',null],
 ['broken thermometer before','The thermometer was broken. Temperature is 39 C.','temperature',null],
 ['faulty scale after','Weight is 7 kg. The scale was faulty.','weight',null],
 ['generic correction','Temperature is 39 C. Actually that was wrong.','temperature',null],
 ['misheard','Heart rate was 100 bpm. I may have misheard that.','heartRate',null],
 ['uncertainty same sentence','Temperature is possibly 39 C.','temperature',null],
 ['conflict','Weight is 7 kg. Weight is 8 kg.','weight',null],
 ['historical','Weight was 7 kg last month.','weight',null],
 ['hypothetical','What if the weight is 7 kg?','weight',null],
 ['owner estimate','Owner estimates weight is 7 kg.','weight',null],
 ['negation','The weight is not 7 kg.','weight',null],
 ['fahrenheit','Temperature is 103 F.','temperature',null],
 ['independent weight','Weight is 7 kg. Temperature is 39 C but the thermometer was broken.','weight','7'],
 ['independent temp blocked','Weight is 7 kg. Temperature is 39 C but the thermometer was broken.','temperature',null],
 ['not accurate','Temperature is 39 C. The thermometer is not accurate.','temperature',null],
 ['not calibrated','Weight is 7 kg. The scale was not calibrated.','weight',null],
 ['device stopped','Temperature is 39 C. The device stopped working.','temperature',null],
 ['not measured today','Weight is 7 kg. I did not measure it today.','weight',null],
 ['tagalog unsure','Weight is 7 kg. Hindi ito sigurado.','weight',null],
 ['owner attribution','The owner says the following. Weight is 7 kg.','weight',null],
 ['home attribution','Owner reports this was measured at home. Weight is 7 kg.','weight',null],
 ['battery','Temperature is 39 C. The thermometer needs a new battery.','temperature',null],
 ['false readings','Weight is 7 kg. The scale was giving false readings.','weight',null],
 ['correction','The weight is 7 kg. No, I meant 8 kg.','weight',null],
 ['inconsistent thermometer','Temperature is 39 C. The thermometer gave inconsistent results.','temperature',null],
 ['flickering display','Weight is 7 kg. The display was flickering.','weight',null],
 ['guessing','Weight is 7 kg. Actually I was guessing.','weight',null],
 ['no invented unit','Weight is 7.','weight',null],
 ['tagalog uncertainty','Sa pagsusuri timbang ay 7 kg pero sira ang timbangan.','weight',null],
];
for(const [name,text,key,want] of cases){const c=candidates(text)[key];assert.equal(c?.value??null,want,name);if(c)assert.ok(text.includes(c.source),name+' source');console.log('PASS '+name);}
console.log('PASS '+cases.length+' vital candidate cases');

const measurementSources=s=>Array.from(c.window.DoctorScribe.measurementSourcePassages(s));
assert.deepEqual(measurementSources('Last consultation he was 12kg but now 9kg na lang.'),['Last consultation he was 12kg but now 9kg na lang.']);
assert.deepEqual(measurementSources('The food weighs 3 kg. The scale was broken.'),['The food weighs 3 kg.']);
assert.deepEqual(measurementSources('Temperature was 38.5 °C. Heart rate was 120 bpm.'),['Temperature was 38.5 °C.','Heart rate was 120 bpm.']);
assert.deepEqual(measurementSources('Temperature and heart rate are normal.'),[]);
console.log('PASS measurement source passages retain history and ambiguity for review');
assert.deepEqual(measurementSources('Temperature is 38.5 C.'),['Temperature is 38.5 C.']);

const tagalogHistory='anim na kilo siya noong huling bisita at limang kilo ang timbang niya ngayon hindi ko pa nakuha ang temperatura niya';
assert.deepEqual(measurementSources(tagalogHistory),[tagalogHistory]);
assert.equal(candidates(tagalogHistory).weight??null,null);
assert.deepEqual(measurementSources('Limang kilo ang timbang ngayon.'),['Limang kilo ang timbang ngayon.']);
assert.deepEqual(measurementSources('The bag weighs five kilos, not the patient.'),['The bag weighs five kilos, not the patient.']);
console.log('PASS word-form weight passages remain visible without guessing a vital');

// Highlighted spans are copied verbatim, and do not select a patient vital.
const sourceRuns=s=>Array.from(c.window.DoctorScribe.measurementSourceRuns(s));
for(const [text,expected] of [
 ['Last consultation he was 12kg but now 9kg na lang.',['12kg','9kg']],
 ['Sa huling bisita anim na kilo; ngayon limang kilo.',['anim na kilo','limang kilo']],
 ['The food weighs 3 kg, not the patient.',['3 kg']],
 ['Temp 38.5 °C; heart rate 120 bpm.',['38.5 °C','120 bpm']],
 ['No measured weight was supplied.',[]]
]) {
 const runs=sourceRuns(text);
 assert.equal(runs.map(x=>x.text).join(''),text,'source text unchanged');
 assert.deepEqual(runs.filter(x=>x.highlight).map(x=>x.text),expected,'exact highlighted source spans');
}
assert.equal(candidates('Last consultation he was 12kg but now 9kg na lang.').weight??null,null,'no current weight selected from history');
console.log('PASS measurement highlights preserve original wording and never determine the current vital');
