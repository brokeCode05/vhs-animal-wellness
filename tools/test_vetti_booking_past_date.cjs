
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const iso = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
const day = n => { const d=new Date(); d.setDate(d.getDate()+n);return iso(d); };
const ctx={pets:[{petId:7,name:'Bornok',species:'Cat'}], activePet:{petId:7,name:'Bornok',species:'Cat'},
  hasPets:true,firstName:'Owner',services:[{serviceId:22,value:'cat_grooming',label:'Cat Grooming',active:true}],
  appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
function makeHarness(){
  const requests=[];
  const win={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,
    fetch:async url => {requests.push(url);throw new Error('Unexpected network request');}};
  win.window=win;
  const box={window:win,Date,setTimeout,clearTimeout,Promise};
  for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])
    vm.runInNewContext(read(f),box,{filename:f});
  return {win,requests};
}
(async()=>{
  const {win,requests}=makeHarness();
  for(const q of [
    'Book Bornok for grooming yesterday',
    'I want to book Bornok for a wash kahapon',
    'Book Bornok for grooming ' + day(-2),
    'Book Bornok for grooming ' + day(-30)
  ]){
    const state=win.VettiState.resolve(q,ctx);
    assert.equal(state.id,'booking_invalid_date',q);
    assert.equal(state.action,'',q);
    assert.ok(!state.bookingContext,q);
    const answer=await win.VettiAI.ask({message:q},ctx,{timeoutMs:500});
    assert.equal(answer.id,'booking_invalid_date',q);
    assert.ok(!answer.action,q);
    assert.match(answer.text,/date has already passed/i,q);
    assert.equal(requests.length,0,'Rejected past-date booking should not call booking intent API');
  }
  const tomorrow=await win.VettiAI.ask({message:'Book Bornok for grooming tomorrow'},ctx,{timeoutMs:500});
  assert.equal(tomorrow.action,'openBooking','Valid future booking must still open wizard');
  assert.equal(tomorrow.bookingContext.preferredDate,day(1));
  const help=await win.VettiAI.ask({message:'Paano magpa-appointment?'},ctx);
  assert.equal(help.id,'booking_help');
  assert.ok(!help.action);
  const history=win.VettiState.resolve('Show my appointments',ctx);
  assert.equal(history.id,'appointments');
  console.log('PASS: past dates give guidance without openBooking or provider call; valid booking/help/history routes retained.');
})().catch(e=>{console.error(e);process.exitCode=1});
