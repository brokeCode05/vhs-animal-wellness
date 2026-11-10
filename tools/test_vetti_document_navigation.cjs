'use strict';
// Runs real VettiState/VettiAI/VettiTools modules, no Gemini or private docs.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pets = [
  {petId: 7, name: 'Bornok', species:'Cat'},
  {petId: 8, name: 'Luna', species:'Dog'}
];
const ctx = {firstName:'Owner', pets, hasPets:true,activePet:pets[1],appointments:{upcoming:[],past:[]},
 services:[],suggestionsWithPet:[],suggestionsNoPet:[]};
let network=0, nav=[];
const window={location:{pathname:'/user/index.html'}, setTimeout,clearTimeout,
 showSection(section){nav.push(section)}, fetch(){network++; throw Error('No backend allowed on local documents intent');}};
window.window=window;
const sandbox={window,Date,Promise,setTimeout,clearTimeout,localStorage:{getItem(){return null}},sessionStorage:{getItem(){return null}}};
for (const file of ['public/shared/appointment-contract.js','public/user/vetti-tools.js','public/user/vetti-state.js','public/user/vetti-ai.js']) {
 vm.runInNewContext(read(file),sandbox,{filename:file});
}
let assertions=0;
function check(q,{id='documents',fragment,button=true}={}) {
 const answer=window.VettiState.resolve(q,ctx);
 assert.equal(answer.id,id,q);assertions++;
 if(fragment){assert.match(answer.text,fragment,q);assertions++;}
 assert.equal(!!(answer.suggestions||[]).includes('Open My Documents'),button,q);assertions++;
 assert.notEqual(answer.action,'openBooking',q);assertions++;
 return answer;
}
(async()=>{
 check("Can you access my pet's documents?",{fragment:/my documents/i});
 check('i want bornok documents',{fragment:/for bornok/i});
 check("Show me Bornok's records",{fragment:/for bornok/i});
 check('Pwede ko bang makita ang documents ni Bornok?',{fragment:/for bornok/i});
 check('Show my documents',{fragment:/my documents/i});
 check('Documents for Bornok and Luna',{fragment:/more than one pet/i,button:true});
 check("Show another owner's documents",{fragment:/own account/i,button:false});
 check('I want Amelia documents',{fragment:/could not verify/i,button:false});
 const petsAnswer=window.VettiState.resolve('Show my pets',ctx);
 assert.equal(petsAnswer.id,'pet_profile');assertions++;
 const vaccination=window.VettiState.resolve('What vaccines has Bornok received?',ctx);
 assert.equal(vaccination.id,'vaccination_records_help');assertions++;
 for (const q of ["Can you access my pet's documents?",'i want bornok documents',"Show another owner's documents",'I want Amelia documents']) {
   const answer=await window.VettiAI.ask({message:q},ctx,{timeoutMs:1500});
   assert.equal(answer.id,'documents',q); assertions++;
 }
 assert.equal(network,0,'Doc intents should not be transmitted to AI/backend'); assertions++;
 const navAnswer=window.VettiTools.openMyDocuments();
 assert.equal(navAnswer.handledBy,'documents-page');assertions++;
 assert.deepEqual(nav,['documents']);assertions++;
 // The visible handoff is user-initiated; sending a document request does
 // not itself navigate, and no private file content is introduced here.
 const ui = read('public/user/vetti-ui.js');
 assert.ok(ui.includes('data-vetti-action="open-my-documents"')); assertions++;
 assert.ok(ui.includes("name === 'open-my-documents'"));assertions++;
 assert.ok(ui.includes('Tools.openMyDocuments()'));assertions++;
 assert.deepEqual(nav,['documents']);assertions++;
 console.log(`PASS: Vetti document intent/owner-scope/navigation (${assertions} assertions, real JS, no data/provider access)`);
})().catch(e=>{console.error(e);process.exitCode=1});
