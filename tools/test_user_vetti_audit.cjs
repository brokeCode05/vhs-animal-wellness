'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pets=[{petId:7,name:'Bornok',species:'Cat'},{petId:8,name:'Luna',species:'Dog'}];
function datePlus(days) {const d=new Date(); d.setDate(d.getDate()+days);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function fixture(appointments){return {hasPets:true,pets,activePet:pets[0],firstName:'User',services:[{serviceId:22,value:'cat_grooming',label:'Cat Grooming',active:true},{serviceId:21,value:'dog_grooming',label:'Dog Grooming',active:true},{serviceId:5,value:'consultation',label:'Consultation',active:true},{serviceId:2,value:'vaccination',label:'Vaccination',active:true}], appointments:{upcoming:appointments||[{id:101,pet:'Bornok',service:'Consultation',date:datePlus(1),time:'09:00 AM',status:'confirmed'},{id:102,pet:'Luna',service:'Grooming',date:datePlus(2),time:'10:00 AM',status:'confirmed'}],past:[]}, suggestionsWithPet:[], suggestionsNoPet:[],responseLanguage:'en'};}
function harness(){const calls=[];const window={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async (url)=>{calls.push(url);throw new Error('Offline test');}};window.window=window;const box={window,Date,setTimeout,clearTimeout,Promise};for(const source of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(path.join(root,source),'utf8'),box,{filename:source});return {window,calls};}
(async()=>{const {window,calls}=harness(),ctx=fixture();let n=0;
  async function noAction(q,id){const before=calls.length;const a=await window.VettiAI.ask({message:q},ctx,{timeoutMs:750});assert.equal(a.action||'', '',`Unexpected action: ${q}`);if(id)assert.equal(a.id,id,q);assert.equal(calls.length,before,`Unexpected backend request: ${q}`);n++;return a;}
  for(const q of ["I don't want to book an appointment",'Do not cancel my appointment',"Don't reschedule my appointment",'Cancel the booking request'])await noAction(q,'action_opt_out');
  for(const q of ['Book Bornok and Luna for grooming tomorrow','Book Luna and Bornok for vaccination tomorrow','Book both my pets tomorrow'])await noAction(q,'booking_pet_ambiguous');
  for(const q of ['Book Bornok for grooming 2026-02-31','Book Bornok yesterday','Book Bornok tomorrow and next Friday','Book Bornok for grooming '+datePlus(31)])await noAction(q,'booking_invalid_date');
  for(const q of ['Can you help book vaccination for a dog that is not mine?','Book an appointment for a pet that isn\'t mine'])await noAction(q,'booking_ownership');
  for(const q of ["What is your cancellation policy?",'How do I cancel my appointment?', 'Can I reschedule my booking?','How much does it cost to cancel?'])await noAction(q,'appointment_change_help');
  for(const [query,action,pet] of [['Cancel Luna appointment','openCancel','Luna'],['Reschedule Luna appointment','openReschedule','Luna']]){const a=await window.VettiAI.ask({message:query},ctx,{timeoutMs:750});assert.equal(a.action,action,query);assert.equal(a.appointment.pet,pet,query);n++;}
  {
    const c=fixture([{id:120,pet:'Luna',service:'Grooming',date:datePlus(1),time:'10 AM',status:'confirmed'},{id:121,pet:'Luna',service:'Consultation',date:datePlus(2),time:'11 AM',status:'confirmed'}]);
    const a=window.VettiState.resolve('Cancel Luna appointment',c);assert.ok(!a.action,'Ambiguous same-pet cancellation must not launch modal');n++;
  }
  {
    const a=window.VettiState.resolve('Cancel Fido appointment',ctx);assert.ok(!a.action,'Unknown pet cancellation must not target Bornok');n++;
  }
  {
    const a=window.VettiState.resolve("When is Luna's next appointment?",ctx);assert.ok(!a.appointment || a.appointment.pet==='Luna','A named pet should not show a different pet appointment');n++;
  }
  {
    const a=await window.VettiAI.ask({message:'Book Luna for grooming tomorrow'},ctx,{timeoutMs:750});assert.equal(a.action,'openBooking');assert.equal(a.bookingContext.petId,'8');assert.match(a.text,/Luna/);assert.doesNotMatch(a.text,/for Bornok/);n++;
  }
  {
    const a=window.VettiState.resolve('Hi, I need consultation for Bornok tomorrow',ctx);assert.equal(a.action,'openBooking');assert.equal(a.bookingContext.petId,'7');n++;
  }
  console.log(`PASS: User Vetti safety audit — ${n} scenarios, no unrequested modals, correct pet/appointment targeting, date and intent guards.`);
})().catch(err=>{console.error(err);process.exitCode=1});
