'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const requests=[];
const w={location:{pathname:'/user/index.html'},VHS_SEMANTIC_VETTI:true,setTimeout,clearTimeout, fetch:async(url,opt)=>{
  if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fictional'}})};
  if(url==='/api/ai/semantic-vetti'){
    const request=JSON.parse(opt.body);requests.push(request);
    let text='Current visiting-hour facts need clinic verification.';
    if(/grooming/i.test(request.message))text='The clinic lists Grooming.';
    if(/how much/i.test(request.message))text='The Services page shows current fees.';
    if(/tomorrow/i.test(request.message))text='Tomorrow is not confirmed open; contact the clinic.';
    if(/Tagalog/i.test(request.message))text='Para sa oras ng pagbisita, kumpirmahin sa clinic.';
    return {ok:true,json:async()=>({success:true,data:{text,state:'idle',source:'ai',mode:'semantic',kind:'information'}})};
  }
  throw new Error('Unexpected request: '+url);
}};w.window=w;
const ctx={pets:[{petId:7,name:'Fictional',species:'Dog'}],hasPets:true,activePet:null,
 appointments:{upcoming:[{date:'2026-10-29',pet_name:'Fictional',status:'Confirmed'}],past:[]},
 services:[{serviceId:25,label:'Grooming',active:true}],serviceGroups:[{name:'Pet Care',services:[],names:['Grooming'],priceText:'varies'}],
 suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
for(const file of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js']){
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout},{filename:file});
}
(async()=>{
 const a = await w.VettiAI.ask('What grooming services do you offer?',ctx);assert.match(a.text,/Grooming/);
 w.VettiAI.recordTurn('user','What grooming services do you offer?');w.VettiAI.recordTurn('vetti',a.text||'Services');
 const b= await w.VettiAI.ask('How much is it?',ctx);assert.match(b.text,/fees/i);
 w.VettiAI.recordTurn('user','How much is it?');w.VettiAI.recordTurn('vetti',b.text);
 const c= await w.VettiAI.ask('What time can I visit?',ctx);
 assert.ok(!c.appointments,'Must not show appointment history for clinic visiting hours');
 assert.match(c.text,/visiting-hour/i);
 w.VettiAI.recordTurn('user','What time can I visit?');w.VettiAI.recordTurn('vetti',c.text);
 const d= await w.VettiAI.ask('What about tomorrow?',ctx);
 assert.match(d.text,/tomorrow/i);
 w.VettiAI.recordTurn('user','What about tomorrow?');w.VettiAI.recordTurn('vetti',d.text);
 const e= await w.VettiAI.ask('Can you explain that in Tagalog?',ctx);
 assert.match(e.text,/Para sa oras/);
 assert.equal(requests.length,5,'Each current message reaches the active server path once');
 for (const r of requests) {
  assert.ok(!('conversation' in r),'raw history must not be sent');
  assert.ok(!('pets' in r),'pet records must not be sent');
  assert.ok(!('appointments' in r),'appointment history must not be sent');
 }
 assert.equal(requests[0].message,'What grooming services do you offer?');
 assert.equal(requests[2].message,'What time can I visit?');
 assert.ok(requests.every(r=>!Object.hasOwn(r,'context_topic')),'Server owns semantic public context');
 assert.equal(typeof requests[0].conversation_id,'string');
 console.log('PASS five-turn User Vetti routing, contextual requests, privacy and no appointment-list hijack (19 assertions)');
})().catch(err=>{console.error(err);process.exitCode=1});
