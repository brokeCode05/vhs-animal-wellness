'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const pets=[{petId:7,name:'Bornok',species:'Cat'}, {petId:9,name:'Luna',species:'Dog'}];
const ctx={firstName:'Owner',pets,hasPets:true,activePet:pets[0],services:[],appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[]};
const nav=[];let network=0;
const win={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,showSection(section){nav.push(section);},fetch(){network++;return Promise.reject(new Error('No network needed for local profile navigation'));}};
win.window=win;
const sandbox={window:win,Date,Promise,setTimeout,clearTimeout};
for(const name of ['public/shared/appointment-contract.js','public/user/vetti-tools.js','public/user/vetti-state.js','public/user/vetti-ai.js']) vm.runInNewContext(read(name),sandbox,{filename:name});
let n=0;
function check(q){const a=win.VettiState.resolve(q,ctx);assert.equal(a.id,'account_profile',q);n++;assert.match(a.text,/My Profile/i,q);n++;assert.ok(a.suggestions.includes('Open My Profile'),q);n++;assert.ok(!a.action,q);n++;assert.equal(a.petCards,null,q);n++;return a;}
(async()=>{
for(const q of ['Can you change my profile?','Open My Profile','How do I edit my profile?','Update my phone number','Change my address','I want to change my password','Gusto kong baguhin ang profile ko'])check(q);
for(const q of ['Show my pets','Show me Bornok\'s profile','Update my pet profile']){const a=win.VettiState.resolve(q,ctx);assert.equal(a.id,'pet_profile',q);n++;}
for(const q of ['Can you change my profile?','I want to change my password']){const a=await win.VettiAI.ask({message:q},ctx,{timeoutMs:1500});assert.equal(a.id,'account_profile',q);n++;}
assert.equal(network,0);n++;
assert.deepEqual(nav,[]);n++;
const result=win.VettiTools.openAccountProfile();assert.equal(result.ok,true);n++;assert.equal(result.handledBy,'account-profile-page');n++;assert.deepEqual(nav,['profile']);n++;
const ui=read('public/user/vetti-ui.js');assert.ok(ui.includes('data-vetti-action="open-account-profile"'));n++;assert.ok(ui.includes("name === 'open-account-profile'"));n++;assert.ok(ui.includes('Tools.openAccountProfile()'));n++;
console.log(`PASS: account profile intent/navigation (${n} assertions; authenticated local UI, no mutations or provider calls)`);
})().catch(e=>{console.error(e);process.exitCode=1});
