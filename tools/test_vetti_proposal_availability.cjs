'use strict';
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), calls=[];
const w={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,console,
 fetch:async(url,opts)=>{
  if(url==='/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'fake'}})};
  if(url==='/api/ai/booking-intent') { calls.push({url,body:JSON.parse(opts.body)}); return {ok:true,json:async()=>({success:true,data:{booking_created:false,requires_confirmation:true,source:'rule',service_hint:'vaccination',time_preference:'none',service_ambiguous:false}})}; }
  if(url==='/api/ai/vetti') {calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>({success:true,data:{source:'rule',intent:'location',state:'idle',text: /how much/i.test(JSON.parse(opts.body).message) ? 'For Vaccination, the currently listed service fee is ₱500.00.' : 'The clinic address comes from the portal.'}})};}
  throw Error(url);
 }};w.window=w;
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js']) {
 vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout,console},{filename:f});
}
const ctx={pets:[{petId:11,name:'Luna',species:'Cat'}],activePet:{petId:11,name:'Luna',species:'Cat'},hasPets:true,
 services:[{serviceId:22,value:'vaccination',label:'Vaccination',active:true}], serviceGroups:[{name:'Preventive & Wellness',names:['Vaccination'],services:[]}], appointments:{upcoming:[],past:[]},
 clinicInfo:{name:'Fictional Clinic',address:'Fictional Street'},suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'taglish'};
async function ask(message,context=ctx){const a=await w.VettiAI.ask(message,context);w.VettiAI.recordTurn('user',message);w.VettiAI.recordTurn('vetti',a.text||'');return a;}
(async()=>{
 w.VettiAI.clearHistory();
 let callsToAvailability=[];
 w.VHSReads={availability:async p=>{callsToAvailability.push(p);return {ok:true,data:{date:p.date,service:{serviceId:22},slots:['09:00','13:00','16:00']}}}};
 let a=await ask('Book Luna for vaccination.');assert.equal(a.action,'openBooking');
 a=await ask('Bukas ng hapon sana.');let date=a.bookingContext.preferredDate;
 a=await ask('Check available slots');assert.match(a.text,/1:00 PM, 4:00 PM/);assert.doesNotMatch(a.text,/9:00 AM/);assert.match(a.text,/No appointment has been made/);assert.equal(callsToAvailability[0].serviceId,22);assert.equal(callsToAvailability[0].date,date);
 a=await ask('What are my proposed booking details?');assert.equal(a.bookingContext.preferredDate,date);
 w.VHSReads.availability=async p=>({ok:true,data:{date:p.date,service:{serviceId:22},slots:[]}});
 a=await ask('Check available slots');assert.match(a.text,/No matching available slots/);
 w.VHSReads.availability=async()=>{throw Error('offline')};
 a=await ask('Check available slots');assert.match(a.text,/cannot check live availability/i);
 w.VettiAI.clearHistory();
 await ask('Book Luna for vaccination.');
 a=await ask('Bukas sana.');date=a.bookingContext.preferredDate;
 a=await ask('After 4 PM.');assert.equal(a.bookingContext.earliestTime,'16:00');assert.match(a.text,/after 4:00 PM/);
 w.VHSReads.availability=async p=>({ok:true,data:{date:p.date,service:{serviceId:22},slots:['15:00','16:00','17:00']}});
 a=await ask('How much is vaccination?');assert.match(a.text,/Vaccination|services/i);
 a=await ask('What are my proposed booking details?');assert.equal(a.bookingContext.earliestTime,'16:00');assert.equal(a.bookingContext.preferredDate,date);
 a=await ask('Check available slots');assert.match(a.text,/5:00 PM/);assert.doesNotMatch(a.text,/3:00 PM|4:00 PM/);
 w.VettiAI.clearHistory();a=await ask('Check available slots');assert.match(a.text,/start or review/);
 console.log('PASS: read-only proposal availability, daypart, empty result, outage, reset');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
