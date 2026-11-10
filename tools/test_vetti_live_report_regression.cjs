'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ctx={pets:[{petId:1,name:'Luna',species:'Dog'}],activePet:{petId:1,name:'Luna',species:'Dog'},hasPets:true,services:[{serviceId:21,value:'dog_grooming',label:'Dog Grooming',active:true},{serviceId:5,value:'consultation',label:'Consultation',active:true}],appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[]};
const w={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async()=>{throw Error('offline')}};w.window=w;
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout},{filename:f});
(async()=>{
 for(const q of ["Don’t book an appointment.","Don't book an appointment.","Don’t book an appointment.+"]){const a=await w.VettiAI.ask(q,ctx);assert.equal(a.id,'action_opt_out',q);assert.ok(!a.action,q);}
 let a=await w.VettiAI.ask('can you book Luna tomorrow for consultation at 9 am?',ctx);assert.equal(a.action,'openBooking');assert.equal(a.bookingContext.preferredTime,'9:00 AM');assert.match(a.text,/No appointment has been made/);
 a=await w.VettiAI.ask('can you book Luna tomorrow for grooming at 9 am?',ctx);assert.equal(a.bookingContext.serviceId,'dog_grooming');assert.equal(a.bookingContext.preferredTime,'9:00 AM');
 const x=w.VettiState.extractBookingContext('after 4 PM',ctx);assert.ok(!x || !x.preferredTime,'a lower bound must not become a selected time');
 console.log('PASS: curly apostrophe refusal, exact hour preference, species match and unconfirmed handoff');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
