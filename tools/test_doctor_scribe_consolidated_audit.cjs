/**
 * Consolidated Phase 6 adversarial scenarios. Fictional records only.
 * No network, API keys, database or live consultation data.
 */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/doctor/doctor-scribe.js'),'utf8');
const sandbox={window:{},Date,Promise,console,setTimeout,clearTimeout};vm.createContext(sandbox);vm.runInContext(source,sandbox);
const S=sandbox.window.DoctorScribe;
const cases=[
 {name:'Same-sentence owner history and exam are kept in separate SOAP sections',input:'Owner reports vomiting, but on exam abdominal tenderness was observed.', check:r=>{assert.match(r.soap.subjective,/owner reports vomiting/i);assert.match(r.soap.objective.findings,/abdominal tenderness was observed/i);}},
 {name:'Owner attribution without conjunction splits before exam',input:'Owner reports scratching, on exam erythema was observed.', check:r=>{assert.match(r.soap.subjective,/owner reports scratching/i);assert.match(r.soap.objective.findings,/erythema was observed/i);}},
 {name:'Exam then owner report stays separate',input:'On examination, the dog weighs 8 kg, and owner reports coughing for two days.', check:r=>{assert.equal(r.soap.objective.weightKg,8);assert.match(r.soap.subjective,/owner reports coughing/i);}},
 {name:'Owner-estimated pulse is subjective only',input:'Owner estimates heart rate 110 bpm at home.',check:r=>{assert.equal(r.soap.objective.heartRateBpm,null);assert.match(r.soap.subjective,/owner estimates/i);}},
 {name:'Owner believes pet had a fever',input:'Owner believes temperature was 39 C yesterday.',check:r=>{assert.equal(r.soap.objective.temperatureC,null);assert.match(r.soap.subjective,/owner believes/i);}},
 {name:'Owner-reported weight cannot become exam vital',input:'Owner measured the dog at 8 kg last month.', check:r=>{assert.equal(r.soap.objective.weightKg,null);assert.match(r.soap.subjective,/owner measured/i);}},
 {name:'Denied current weight is retained as Objective documentation',input:'Weight was not measured today.',check:r=>{assert.equal(r.soap.objective.weightKg,null);assert.match(r.soap.objective.findings,/not measured today/i);}},
 {name:'Denied heart-rate measurement and owner estimate remain distinct',input:'Heart rate was not measured. Owner estimates 110 bpm.',check:r=>{assert.equal(r.soap.objective.heartRateBpm,null);assert.match(r.soap.objective.findings,/not measured/i);assert.match(r.soap.subjective,/owner estimates/i);}},
 {name:'Two conflicting weights blank structured value',input:'On examination, weight was recorded as 6 kg and 7 kg.',check:r=>{assert.equal(r.soap.objective.weightKg,null);assert.match(r.warnings.join(' '),/conflicting weight/i);}},
 {name:'Two conflicting temperatures blank structured value',input:'Temperature was 38.5 C and 39.5 C on repeat examination.',check:r=>{assert.equal(r.soap.objective.temperatureC,null);assert.match(r.warnings.join(' '),/conflicting temperature/i);}},
 {name:'Repeated identical vital can be used',input:'Temperature was 38.5 C and 38.5 C on repeat examination.',check:r=>assert.equal(r.soap.objective.temperatureC,38.5)},
 {name:'Fahrenheit does not enter Celsius',input:'Temperature is 102 F.',check:r=>assert.equal(r.soap.objective.temperatureC,null)},
 {name:'Historical weight and current measurement separated',input:'Weight 8 kg last month. On examination, weight is 10 kg today.',check:r=>assert.equal(r.soap.objective.weightKg,10)},
 {name:'Symptoms do not invent diagnosis',input:'Owner reports coughing for three days.',check:r=>{assert.equal(r.soap.assessment,S.NOT_PROVIDED);assert.equal(r.soap.plan,S.NOT_PROVIDED);}},
 {name:'Clinical negation is retained',input:'During examination, no abdominal tenderness was noted.',check:r=>assert.match(r.soap.objective.findings,/no abdominal tenderness/i)},
 {name:'Mixed four-section narrative',input:'Owner reports poor appetite. During examination, mild redness was observed. Weight 7 kg. Temperature 38.4 C. I suspect skin irritation. I recommend follow-up in three days.',check:r=>{assert.match(r.soap.subjective,/poor appetite/i);assert.match(r.soap.objective.findings,/mild redness/i);assert.equal(r.soap.objective.weightKg,7);assert.match(r.soap.assessment,/I suspect/i);assert.match(r.soap.plan,/I recommend/i);}},
 {name:'Transcript length cap is enforced',input:'x'.repeat(8001),check:r=>assert.equal(r.ok,false)},
 {name:'No external mode enabled by this script',input:'Owner reports poor appetite.',check:r=>assert.equal(r.meta.engine,'local-deterministic')},
];
let passed=0;
for(const t of cases){const r=S.generateSoapDraft(t.input);try{t.check(r);passed++;console.log('PASS',t.name);}catch(e){console.error('FAIL',t.name,'\n',e.message);process.exitCode=1;}}
console.log(`CONSOLIDATED SOAP PROVENANCE: ${passed}/${cases.length} cases passed`);
