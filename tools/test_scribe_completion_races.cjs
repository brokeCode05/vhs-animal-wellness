'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync('public/doctor/doctor.js','utf8');
const start=source.indexOf("  document.getElementById('complete-consultation').addEventListener('click', async () => {");
const end=source.indexOf('  // Structured consultation object built',start);
assert.ok(start>=0 && end>start);
async function run(hooks={}) {
 const patient={id:1,appointmentId:10,name:'Fictional'},draft={consultationId:11,clinicalRevision:0,startedAt:'2026-11-10T00:00:00Z'};
 const state={generation:1},status={textContent:''},reviewed={checked:true,focus(){}};let handler,flushed=0,saves=0,completed=0,discarded=0;const persisted=[];
 const controls={'save-status':status,reviewed,'context-timer':{replaceChildren(){}},'draft-state':{},'complete-consultation':{addEventListener(type,fn){handler=fn;},classList:{add(){}}}};
 const c={selectedPatient:patient,REC:{RECORDING:'recording',REQUESTING:'requesting'},rec:{state:'idle'},recorder:null,audioTake:null,audioRequestPending:false,audioSending:false,form:{inert:false},currentView:'notes',Date,
 document:{getElementById:id=>controls[id]||null},statusFor:()=>c.liveStatus||'in_consultation',draftFor:()=>draft,captureDraft(){},buildConsultationPayload:()=>({payload:{soap:{subjective:'Fictional'}}}),persistDraft(p){persisted.push(p.id);},durationBetween:()=>0,
 confirmAction:async()=>{if(hooks.confirm)hooks.confirm(c,state,reviewed);return true;},discardScribeRecording(){discarded++;c.rec.state='idle';},renderQueue(){},renderHeader(){},renderRecordActions(){},syncScribePanel(){},
 workingStore:{state:()=>state,flush:async()=>{flushed++;if(hooks.flush)hooks.flush(c,state,reviewed,flushed);return hooks.flushOK!==false;}},
 window:{doctorValidateClinical:()=>true,doctorFirstPrescriptionIssue:()=>null,VHSWrites:{saveConsultation:async()=>{saves++;if(hooks.save)hooks.save(c,state,reviewed);return {ok:true,consultation:{revision:1}};},completeConsultationSession:async(id,review)=>{assert.equal(review.expected_revision,1);assert.equal(review.reviewed,true);completed++;if(hooks.complete)hooks.complete(c,state,reviewed);return {ok:true,consultation:{duration:1,completedAt:'2026-11-10T01:00:00Z'}};}}}};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);await handler();return {completed,discarded,saves,status:status.textContent,inert:c.form.inert,persisted};
}
(async()=>{
 let r=await run();assert.equal(r.completed,1,'unchanged, reviewed consultation can complete');
 for(const confirm of [c=>{c.audioTake={};},c=>{c.rec.state='recording';},c=>{c.selectedPatient={id:2};}]){
  r=await run({confirm});assert.equal(r.completed,0,'new audio or changed patient during confirmation must block completion');assert.equal(r.discarded,0,'completion must never discard a newly started recording');
 }
 for(const mutate of [(c,state)=>{state.generation++;},(c,state,reviewed)=>{reviewed.checked=false;},c=>{c.audioRequestPending=true;},c=>{c.selectedPatient={id:2};}]){
  r=await run({flush:(c,state,reviewed,n)=>{if(n===1)mutate(c,state,reviewed);}});assert.equal(r.completed,0,'new edits, audio, review changes or patient switches during flush must block completion');assert.equal(r.saves,0,'stale payload must not reach clinical save');assert.equal(r.inert,false);
 }
 r=await run({save:c=>{c.selectedPatient={id:2};}});assert.equal(r.completed,0,'switching after save must not finalize an earlier patient');assert.equal(r.inert,false);
 r=await run({flushOK:false});assert.equal(r.completed,0);assert.equal(r.inert,false);
 r=await run({complete:c=>{c.selectedPatient={id:2};}});assert.equal(r.completed,1);assert.ok(r.persisted.every(id=>id===1),'an in-flight completion may update only its original patient');assert.match(r.status,/current patient was not changed/);
 console.log('PASS 11 completion workflows: reviewed control, recording preservation, patient binding, edit/review races and failed flush');
})().catch(error=>{console.error(error);process.exitCode=1;});
