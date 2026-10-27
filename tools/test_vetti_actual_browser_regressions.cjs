'use strict';
// Exercises the *actual JS files from the uploaded project*, through
// VettiState.resolve AND VettiAI.ask rather than isolated regex helpers.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sources = ['public/shared/appointment-contract.js', 'public/user/vetti-state.js', 'public/user/vetti-ai.js'];
let checks = 0;
function fixture(pets) {
  const bornok = {petId:7,name:'Bornok',species:'Cat'};
  const list = pets || [bornok];
  return {
    hasPets:true, pets:list, activePet:bornok, firstName:'User',
    services:[
      {serviceId:22,value:'cat_grooming',label:'Cat Grooming',active:true},
      {serviceId:21,value:'dog_grooming',label:'Dog Grooming',active:true},
      {serviceId:5,value:'consultation',label:'Consultation',active:true},
      {serviceId:2,value:'vaccination',label:'Vaccination',active:true}
    ],
    appointments:{upcoming:[],past:[]},responseLanguage:'en',
    suggestionsWithPet:[],suggestionsNoPet:[]
  };
}
function harness() {
  const calls = [];
  const window = {
    location:{pathname:'/user/index.html'}, setTimeout, clearTimeout,
    fetch: async url => { calls.push(url); throw new Error('intentionally offline'); }
  };
  window.window = window;
  const context = {window, Date, setTimeout, clearTimeout, Promise};
  for (const name of sources) {
    const code = fs.readFileSync(path.join(root, name),'utf8');
    vm.runInNewContext(code, context, {filename:name});
  }
  return {window,calls};
}
function hasNoAction(answer, prompt, expectedId) {
  assert.equal(answer.action || '', '', 'Unexpected modal for: '+prompt);
  if (expectedId) assert.equal(answer.id, expectedId, prompt);
  checks++;
}
(async function run() {
  const {window,calls} = harness();
  const bornok = {petId:7,name:'Bornok',species:'Cat'};
  const john = {petId:8,name:'John',species:'Dog'};
  const luna = {petId:9,name:'Luna',species:'Dog'};
  const partial = fixture([bornok]); // CRITICAL: current hydrated list misses John.
  const complete = fixture([bornok,john]);
  for (const [ctx,prompt] of [
    [partial,'Book for Bornok and John tomorrow'],
    [partial,'Book Bornok and John tomorrow'],
    [partial,'Book John and Bornok tomorrow'],
    [partial,'Book Bornok & John tomorrow'],
    [partial,'Book Bornok and Luna for grooming tomorrow'],
    [complete,'Book Bornok and John tomorrow'],
    [complete,'Book John and Bornok tomorrow'],
    [fixture([bornok,luna]),'Book Luna and Bornok for grooming tomorrow'],
  ]) {
    hasNoAction(window.VettiState.resolve(prompt,ctx),prompt,'booking_pet_ambiguous');
    const before = calls.length;
    hasNoAction(await window.VettiAI.ask({message:prompt},ctx,{timeoutMs:800}),prompt,'booking_pet_ambiguous');
    assert.equal(calls.length,before,'Unsafe prompt must not go to external inference API');
    checks++;
  }
  for (const prompt of [
    'Book Bornok for grooming 2026-02-31',
    'Book Bornok for grooming 2026-02-30',
    'Book Bornok for grooming yesterday',
    'Book Bornok for grooming 2026-10-10',
  ]) {
    hasNoAction(window.VettiState.resolve(prompt,partial),prompt,'booking_invalid_date');
    hasNoAction(await window.VettiAI.ask({message:prompt},partial,{timeoutMs:800}),prompt,'booking_invalid_date');
  }
  for (const prompt of [
    'What is your cancellation policy?',
    'How much does it cost to cancel?',
    'How do I reschedule?',
    'Can I reschedule my booking?',
  ]) {
    const a=window.VettiState.resolve(prompt,partial);
    hasNoAction(a,prompt,'appointment_change_help');
    assert.doesNotMatch(a.text,/no upcoming visit to cancel|there is no upcoming/i,prompt);
    checks++;
    hasNoAction(await window.VettiAI.ask({message:prompt},partial,{timeoutMs:800}),prompt,'appointment_change_help');
  }
  for(const prompt of ['Book Bornok for grooming tomorrow','Book Bornok and grooming tomorrow','Book Bornok and vaccination tomorrow']){
    const ans=window.VettiState.resolve(prompt,partial);
    assert.equal(ans.action,'openBooking','Valid single-pet booking must still work: '+prompt);
    assert.equal(ans.bookingContext.petId,'7');checks+=2;
  }
  for(const prompt of ["Don't cancel my appointment",'Book an appointment for a pet that is not mine']){
    const ans=window.VettiState.resolve(prompt,partial);
    hasNoAction(ans,prompt);
  }
  const index=fs.readFileSync(path.join(root,'public/user/index.html'),'utf8');
  assert.match(index, /vetti-state\.js\?v=5\.6\.0-capstone-audit/);checks++;
  assert.match(index, /vetti-ai\.js\?v=5\.7\.0-semantic-pilot/);checks++;
  assert.equal(window.VettiState.version,'5.6.0-capstone-audit');checks++;
  assert.equal(window.VettiAI.version,'5.7.0-semantic-pilot');checks++;
  console.log(`PASS: actual uploaded User Vetti regression checks (${checks} assertions), including partial pet hydration, policy, invalid dates, provider safety, and asset versions.`);
})().catch(e => {console.error(e);process.exitCode=1;});
