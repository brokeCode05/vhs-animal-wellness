'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p), 'utf8');
const messages = [
  "can you give me the clinic's info",
  'clinic info',
  'clinic information',
  'Tell me about your clinic',
  'How can I contact the clinic?',
  'Where are you located?',
  'Clinic address and phone',
  'What are your clinic hours?',
  'Anong oras kayo bukas?',
  'Saan located ang clinic?',
  'Impormasyon ng clinic'
];
let assertions = 0;
const check = (a,b,msg) => { assert.equal(a,b,msg); assertions++; };
const includes = (hay,needle,msg) => { assert.ok(hay.includes(needle),msg); assertions++; };
const nav=[]; let network=0;
const win={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,
  showSection(section){nav.push(section);},
  fetch(){network++;return Promise.reject(new Error('This test must not access the AI provider'));}};
win.window=win;
const sandbox={window:win,Date,Promise,setTimeout,clearTimeout};
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-tools.js','public/user/vetti-state.js','public/user/vetti-ai.js'])
  vm.runInNewContext(read(f),sandbox,{filename:f});
const pets=[{petId:1,name:'Bornok',species:'Cat'}];
const ctx={firstName:'Test',hasPets:true,pets,activePet:pets[0],
  clinicInfo:{name:'Demo Clinic',address:'Synthetic Test Street',phone:'0000 000 0000',email:'demo@example.invalid'},
  appointments:{upcoming:[],past:[]},services:[],serviceGroups:[],suggestionsWithPet:[],suggestionsNoPet:[]};
(async()=>{
  for(const message of messages) {
    const answer=win.VettiState.resolve(message,ctx);
    check(answer.id,'clinic_info',message);
    check(answer.state,'idle',message);
    includes(answer.text,'Synthetic Test Street',message);
    includes(answer.text,'0000 000 0000',message);
    includes(answer.suggestions,'Open Clinic Info',message);
    assert.ok(!answer.action && !answer.petCards && !answer.appointments,'No unrelated payload'); assertions++;
    const ai=await win.VettiAI.ask({message},ctx,{timeoutMs:1500});
    check(ai.id,'clinic_info',`AI: ${message}`);
  }
  const noData=win.VettiState.resolve('clinic info',{...ctx,clinicInfo:null});
  check(noData.id,'clinic_info');
  assert.ok(!noData.text.includes('Synthetic Test Street')); assertions++;
  includes(noData.text,'Open Clinic Info');
  for(const msg of ['Can you book Bornok at the clinic tomorrow?', 'Show my pets', 'Can you change my profile?', 'I want Bornok documents']) {
    const a=win.VettiState.resolve(msg,ctx);
    assert.notEqual(a.id,'clinic_info',msg);assertions++;
  }
  check(network,0,'No provider or private record fetch');
  check(nav.length,0,'No automatic navigation');
  const res=win.VettiTools.openClinicInfo();
  check(res.ok,true);
  check(res.handledBy,'clinic-info-page');
  check(nav[0],'clinic');
  const ui=read('public/user/vetti-ui.js');
  for(const value of ['clinicInfo: Data.getClinicInfo()', 'data-vetti-action="open-clinic-info"', "name === 'open-clinic-info'",'Tools.openClinicInfo()']) includes(ui,value);
  console.log(`PASS: Vetti clinic information intents (${assertions} assertions; real JS, no backend operations)`);
})().catch(e=>{console.error(e);process.exitCode=1});
