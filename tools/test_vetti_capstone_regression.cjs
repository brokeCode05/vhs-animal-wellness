'use strict';
// Exercises the actual user Vetti JS (no duplicated intent implementation).
// No live Gemini, database, OTP, or external calls are made.
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const bornok={petId:7,name:'Bornok',species:'Cat'};
const john={petId:8,name:'John',species:'Dog'};
const services=[
 {serviceId:22,value:'cat_grooming',label:'Cat Grooming',active:true},
 {serviceId:21,value:'dog_grooming',label:'Dog Grooming',active:true},
 {serviceId:5,value:'consultation',label:'Consultation',active:true},
 {serviceId:2,value:'vaccination',label:'Vaccination',active:true},
];
const next=(offset)=>{const d=new Date();d.setDate(d.getDate()+offset);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
function fixture(){return {pets:[bornok,john],activePet:bornok,hasPets:true,firstName:'Owner',services,
  appointments:{upcoming:[
    {appointmentId:31,pet:'Bornok',service:'Consultation',status:'confirmed',date:'Nov 1',time:'10:00 AM'},
    {appointmentId:32,pet:'John',service:'Vaccination',status:'confirmed',date:'Nov 2',time:'11:00 AM'}],past:[]},
  responseLanguage:'taglish',suggestionsWithPet:[],suggestionsNoPet:[]};}
function engine({offline=false, providerData=null,customPets=null}={}){
 const calls=[];
 const window={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async(url,opts)=>{
   calls.push({url,opts});
   if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'test'}})};
   if(offline)throw Error('intentionally offline');
   if(url==='/api/ai/booking-intent')return {ok:true,json:async()=>({success:true,data:providerData||{service_hint:'none',time_preference:'none',service_ambiguous:false,source:'rule',requires_confirmation:true,booking_created:false}})};
   return {ok:false,json:async()=>({})};
 }};
 window.window=window;
 const box={window,Date,Promise,setTimeout,clearTimeout};
 for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(read(f),box,{filename:f});
 const ctx=fixture();if(customPets)ctx.pets=customPets;
 return {window,ctx,calls,ask:q=>window.VettiAI.ask({message:q},ctx,{timeoutMs:1500}),resolve:q=>window.VettiState.resolve(q,ctx)};
}
const doesNotBook=(a,q)=>assert.notEqual(a.action,'openBooking','Unexpected proposed booking for '+q);
const doesNotAct=(a,q)=>assert.ok(!a.action,'Unexpected executable action for '+q+': '+a.action);
let checks=0;
(async()=>{
 const h=engine({offline:true});
 for(const [q,hint] of [
  ['Can Bornok get a bath tomorrow?','cat_grooming'],
  ['Pwede bang magpa-checkup si Bornok bukas?','consultation'],
  ['Book Bornok to get washed tomorrow','cat_grooming'],
  ['Gusto ko ipa-groom si Bornok bukas','cat_grooming'],
  ['Book Bornok for grooming tomorrow','cat_grooming'],
 ]){
  const a=await h.ask(q);assert.equal(a.action,'openBooking',q);
  assert.equal(a.bookingContext.petId,'7',q);
  assert.equal(a.bookingContext.serviceId,hint,q);
  assert.equal(a.bookingContext.preferredDate,next(1),q);
  assert.match(a.text,/Continue to Booking/);checks+=5;
 }
 for(const q of [
  "Schedule a vaccination for my neighbor's dog",
  'Can Amelia get a bath tomorrow?',
  'Book Bornok for grooming on November 30, 2026',
  'Book an appointment on February 29, 2027',
  'Book Bornok at midnight tomorrow',
  'Book Bornok for grooming yesterday',
  'Book Bornok for grooming tomorrow and vaccination',
  'Want grooming for Bornok and a checkup for John',
  'Book Bornok and John for grooming tomorrow',
  'Book Bornok for grooming next week',
  "Don't book anything. Just tell me your grooming services.",
  'What happens if I miss my appointment?',
  'What vaccines has Bornok received?',
  'Show me appointments for my other pet',
  'My cat is having seizures. What medicine should I give?',
  'What is the booking process?',
 ]){
  const a=await h.ask(q);doesNotAct(a,q);checks++;
 }
 const missed=await h.ask('What happens if I miss my appointment?');assert.equal(missed.id,'missed_visit_help');checks++;
 const neighbor=await h.ask("Schedule a vaccination for my neighbor's dog");assert.equal(neighbor.id,'booking_ownership');checks++;
 const invalid=await h.ask('Book an appointment on February 29, 2027');assert.equal(invalid.id,'booking_invalid_date');checks++;
 const out=await h.ask('Book Bornok for grooming on November 30, 2026');assert.equal(out.id,'booking_invalid_date');checks++;
 const safety=await h.ask('My cat is having seizures. What medicine should I give?');
 assert.equal(safety.id,'urgent_safety');assert.match(safety.text,/veterinar|emergency/i);checks+=2;
 // Contrastive negative target: John is selected, not Bornok (still only a
 // prepared action; the portal modal retains confirmation and eligibility).
 const cancel=h.resolve("Cancel John's appointment, not Bornok's");
 assert.equal(cancel.action,'openCancel');assert.equal(cancel.appointment.appointmentId,32);checks+=2;
 const ambiguous=h.resolve('Cancel John and Bornok appointments');doesNotAct(ambiguous,'two-pet cancellation');checks++;
 // Multiple owners/pets + no choice must never silently preselect active pet.
 const generic=await h.ask('Book an appointment');assert.equal(generic.action,'openBooking');
 assert.ok(!generic.bookingContext || !generic.bookingContext.petId);checks+=2;
 // Change only the date in the immediately preceding booking message.
 h.window.VettiAI.clearHistory();h.window.VettiAI.recordTurn('user','Book Bornok for grooming tomorrow');
 h.window.VettiAI.recordTurn('vetti','Your appointment proposal is ready.');
 const follow=await h.ask('Actually, make it the day after tomorrow.');
 assert.equal(follow.action,'openBooking');assert.equal(follow.bookingContext.preferredDate,next(2));
 assert.equal(follow.bookingContext.petId,'7');checks+=3;
 h.window.VettiAI.clearHistory();
 const unsupported=await h.ask('Actually, make it the day after tomorrow.');doesNotAct(unsupported,'unanchored follow-up');checks++;
 // Request to Gemini booking service never carries secrets or whole context;
 // the real BookingIntentService sanitizes this on the server.
 assert.ok(!h.calls.some(c=>/generativelanguage/.test(c.url)));checks++;
 const o=engine({offline:false,providerData:{service_hint:'grooming',service_ambiguous:false,time_preference:'morning',source:'ai',requires_confirmation:true,booking_created:false}});
 const online=await o.ask('Book Bornok for grooming tomorrow morning');assert.equal(online.action,'openBooking');
 assert.equal(online.bookingContext.serviceId,'cat_grooming');
 assert.ok(o.calls.some(c=>c.url==='/api/ai/booking-intent'));checks+=3;
 const ui=read('public/user/vetti-ui.js');
 assert.match(ui,/if \(answer\.action === 'openBooking'\) renderBookingProposal\(answer\)/);
 assert.match(ui,/data-vetti-action="continue-booking"/);
 assert.match(ui,/pending\.ticket !== continueBooking\.getAttribute/);
 assert.match(ui,/invalidateBookingProposal\(\); \/\/ double-click/);
 assert.match(ui,/else runAction\(answer\)/);checks+=5;
 const css=read('public/user/vetti.css');assert.match(css,/\.vetti-continue-booking/);checks++;
 console.log(`PASS: capstone Vetti safety/booking regressions (${checks} assertions, authentic JS modules, offline + response stubs).`);
})().catch(e=>{console.error(e);process.exitCode=1});
