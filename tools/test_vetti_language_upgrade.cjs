'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
const read = f => fs.readFileSync(path.join(root,f),'utf8');
const stock = [
  {serviceId:21,value:'dog_grooming',label:'Dog Grooming',active:true},
  {serviceId:22,value:'cat_grooming',label:'Cat Grooming',active:true},
  {serviceId:2,value:'vaccination',label:'Vaccination',active:true},
  {serviceId:5,value:'consultation',label:'Consultation',active:true}
];
const bornok={petId:7,name:'Bornok',species:'Cat'};
const context={pets:[bornok],activePet:bornok,hasPets:true,firstName:'Owner',services:stock,
  appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
function day(offset){const d=new Date();d.setDate(d.getDate()+offset);return iso(d)}
function harness(data={service_hint:'grooming',service_ambiguous:false,time_preference:'none',source:'rule',requires_confirmation:true,booking_created:false}, opts={}){
 let calls=[];
 const window={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async (url,req)=>{
  calls.push(url);
  if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'test'}})};
  if(opts.offline)throw new Error('offline');
  return {ok:true,json:async()=>({success:true,data})};
 }};
 window.window=window;
 const box={window,Date,setTimeout,clearTimeout,Promise};
 for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(read(f),box,{filename:f});
 return {state:window.VettiState, ask:message=>window.VettiAI.ask({message},context,{timeoutMs:1500}),calls};
}
(async()=>{
  let h=harness();let a=await h.ask('Gusto ko ipa-groom si Bornok bukas');
  assert.equal(a.action,'openBooking');assert.equal(a.bookingContext.petId,'7');
  assert.equal(a.bookingContext.serviceId,'cat_grooming');assert.equal(a.bookingContext.preferredDate,day(1));

  h=harness();a=await h.ask('Can you arrange a wash for Bornok tomorrow?');
  assert.equal(a.action,'openBooking');assert.equal(a.bookingContext.serviceId,'cat_grooming');assert.equal(a.bookingContext.preferredDate,day(1));

  h=harness();a=await h.ask('Book an appointment for a pet that isn\'t mine');
  assert.notEqual(a.action,'openBooking');assert.match(a.text,/pets registered to your account/i);
  assert.equal(h.calls.length,0);

  h=harness();a=await h.ask("Don't book Bornok tomorrow");
  assert.notEqual(a.action,'openBooking');

  h=harness();a=await h.ask('Book Bornok grooming because he is bleeding');
  assert.notEqual(a.action,'openBooking');assert.match(a.text,/veterinar/i);assert.equal(h.calls.length,0);

  h=harness({service_hint:'grooming',service_ambiguous:false,time_preference:'none',source:'ai',requires_confirmation:true,booking_created:false});
  a=await h.ask('Book grooming and vaccination tomorrow');
  assert.notEqual(a.action,'openBooking');assert.ok(!a.bookingContext || !a.bookingContext.serviceId);

  h=harness();a=await h.ask('Book Bornok for grooming next Friday');
  const now=new Date(), mondayOffset=(now.getDay()+6)%7;
  assert.equal(a.bookingContext.preferredDate,day(7-mondayOffset+4));

  h=harness();a=await h.ask('Book Bornok for grooming yesterday');
  assert.notEqual(a.action,'openBooking');assert.equal(a.id,'booking_invalid_date');assert.match(a.text,/date has already passed/i);
  assert.ok(!a.bookingContext || !a.bookingContext.preferredDate);

  h=harness();a=await h.ask('Book Bornok for grooming tomorrow at 11:00 PM');
  assert.notEqual(a.action,'openBooking');assert.equal(a.id,'booking_invalid_time'); // out-of-window request is rejected early

  h=harness();a=await h.ask('Show my appointments');
  assert.notEqual(a.action,'openBooking');

  h=harness();a=await h.ask('Vaccination schedule');
  assert.notEqual(a.action,'openBooking');

  h=harness({service_hint:'grooming',service_ambiguous:false,time_preference:'none',source:'rule',requires_confirmation:true,booking_created:false},{offline:true});
  a=await h.ask('Book grooming and vaccination tomorrow');
  assert.ok(!a.bookingContext || !a.bookingContext.serviceId);

  // Public assistant's offline FAQ responses still enforce public/private boundary.
  const doc={readyState:'loading',addEventListener() {},createElement(){return {}}};
  const storage={getItem(){return null},setItem(){}};
  const pwin={sessionStorage:storage};
  const pub={window:pwin,document:doc,sessionStorage:storage};
  vm.runInNewContext(read('public/web-page/public-vetti.js'),pub);
  assert.match(pwin.VettiPublic.answer('Paano magpa-appointment?'),/log in/i);
  assert.match(pwin.VettiPublic.answer('Anong serbisyo ninyo?'),/consultations/i);
  assert.match(pwin.VettiPublic.answer('Saan kayo located?'),/Cubao/i);
  assert.match(pwin.VettiPublic.answer('my pet appointment'),/log in/i);
  console.log('PASS: extended Vetti NLU — Taglish booking, wash, ownership/negation, relative and past dates, service ambiguity, offline privacy and public FAQ.');
})().catch(e=>{console.error(e);process.exitCode=1});
