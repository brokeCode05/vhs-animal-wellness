// Phase 4 NLU regression: booking HOW-TO must not turn into private history.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const window = {location:{pathname:'/user/index.html'},setTimeout,clearTimeout};
const calls=[];
window.fetch = async url => {calls.push(url);throw new Error('backend should not be needed for help');};
window.window=window;
const box={window,Date,Promise,setTimeout,clearTimeout};
for(const file of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js']){
  vm.runInNewContext(read(file),box,{filename:file});
}
const ctx={pets:[{petId:7,name:'Bornok',species:'Cat'}],activePet:{petId:7,name:'Bornok',species:'Cat'},
  firstName:'Owner',hasPets:true,services:[],appointments:{upcoming:[],past:[]},
  suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
(async()=>{
  for(const question of ['Paano magpa-appointment?','Paano magbook?',
     'How can I book an appointment?', 'How do I schedule a visit?','What is the booking process?']){
    const a = await window.VettiAI.ask({message:question},ctx);
    assert.equal(a.id,'booking_help',question);
    assert.equal(a.action,'',question);
    assert.ok(!a.appointments,question);
    assert.match(a.text,/book an appointment/i,question);
    assert.ok(Array.isArray(a.suggestions) && a.suggestions.includes('Book an appointment'));
  }
  assert.equal(calls.length,0,'Local help must not transmit records or call API');
  const upcoming=window.VettiState.resolve('Show my appointments',ctx);
  assert.equal(upcoming.id,'appointments');
  const next=window.VettiState.resolve('When is my next appointment?',ctx);
  assert.equal(next.id,'appointment_actions');
  const book=window.VettiState.resolve('Book Bornok tomorrow',ctx);
  assert.equal(book.action,'openBooking');
  console.log('PASS: User Vetti booking how-to routes to guidance, never private appointment history; appointment listing and booking still work.');
})().catch(err=>{console.error(err);process.exitCode=1});
