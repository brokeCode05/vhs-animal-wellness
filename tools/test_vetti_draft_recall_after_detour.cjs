'use strict';
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), calls=[];
const w={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,console,
 fetch:async(url,opts)=>{
  if(url==='/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'fake'}})};
  if(url==='/api/ai/booking-intent') { calls.push({url,body:JSON.parse(opts.body)}); return {ok:true,json:async()=>({success:true,data:{booking_created:false,requires_confirmation:true,source:'rule',service_hint:'vaccination',time_preference:'none',service_ambiguous:false}})}; }
  if(url==='/api/ai/vetti') {calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({success:true,data:{source:'rule',intent:'location',state:'idle',text:'The clinic address comes from the portal.'}})};}
  throw Error(url);
 }};w.window=w;
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js']) {
 vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout,console},{filename:f});
}
const ctx={pets:[{petId:11,name:'Luna',species:'Cat'}],activePet:{petId:11,name:'Luna',species:'Cat'},hasPets:true,
 services:[{serviceId:22,value:'vaccination',label:'Vaccination',active:true}], appointments:{upcoming:[],past:[]},
 clinicInfo:{name:'Fictional Clinic',address:'Fictional Street'},suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'taglish'};
async function ask(message,context=ctx){const a=await w.VettiAI.ask(message,context);w.VettiAI.recordTurn('user',message);w.VettiAI.recordTurn('vetti',a.text||'');return a;}
(async()=>{
 w.VettiAI.clearHistory();
 let a=await ask('Book Luna for vaccination.'); assert.equal(a.action,'openBooking');assert.match(a.text,/Pet: Luna/);
 a=await ask('Bukas ng hapon sana.'); assert.match(a.text,/Service: Vaccination/);assert.match(a.text,/afternoon preference/);
 const expectedDate=a.bookingContext.preferredDate;
 a=await ask('Where is your clinic located?'); assert.ok(!a.action || a.action!=='openBooking');
 // Vague corrections after an unrelated question must not silently edit a stale draft.
 await ask('Actually next week na lang.');
 a=await ask('Ano na ulit yung details ng booking ko?');
 assert.equal(a.id,'booking_proposal_review');assert.match(a.text,/Pet: Luna/);assert.match(a.text,/Service: Vaccination/);
 assert.equal(a.bookingContext.preferredDate,expectedDate);
 assert.match(a.text,/No appointment has been made/);
 // If an owner pet disappears, the old draft must not prefill that ID.
 const missingPet=Object.assign({},ctx,{pets:[],hasPets:false,activePet:null});
 a=await ask('What are my proposed booking details?',missingPet);
 assert.equal(a.id,'booking_proposal_review');assert.ok(!('petId' in a.bookingContext));assert.match(a.text,/Pet: not selected/);
 a=await ask('Cancel booking request');
 a=await ask('What are my proposed booking details?');assert.notEqual(a.id,'booking_proposal_review');
 w.VettiAI.clearHistory();
 a=await ask('What are my proposed booking details?');assert.notEqual(a.id,'booking_proposal_review');
 assert.ok(!calls.some(x=>x.body&&('conversation' in x.body || 'pets' in x.body || 'appointments' in x.body)));
 console.log('PASS: recall after harmless detour, suspended corrections, ownership recheck, opt-out/reset, privacy');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
