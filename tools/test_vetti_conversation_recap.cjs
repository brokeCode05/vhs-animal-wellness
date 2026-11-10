'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const calls = [];
const win = {
  location:{pathname:'/user/index.html'}, VHS_SEMANTIC_VETTI:true,
  setTimeout,clearTimeout,
  fetch:async (url,opts) => {
    calls.push({url,body:opts && opts.body ? JSON.parse(opts.body):{}});
    if (url==='/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'fake'}})};
    if (url==='/api/ai/service-lookup')return {ok:true,json:async()=>({success:true,data:{kind:'answer',state:'idle',text:'Blood Test fees start at ₱900; verify current pricing.'}})};
    if (url==='/api/ai/semantic-vetti')return {ok:true,json:async()=>({success:true,data:{mode:'semantic',kind:'information',state:'reminder',text:'What type of service would you like for your pet?'}})};
    if (url==='/api/ai/vetti')return {ok:true,json:async()=>({success:true,data:{source:'rule',state:'idle',text:/blood test/i.test(opts.body || '') ? 'For Blood Test, the clinic catalog lists ₱900.00.' : 'Public clinic information is available.'}})};
    if (url==='/api/ai/booking-intent')return {ok:true,json:async()=>({success:true,data:{booking_created:false,requires_confirmation:true,source:'rule',service_hint:'none',time_preference:'none',service_ambiguous:false}})};
    throw Error('Unexpected request: '+url);
  }
}; win.window=win;
for (const file of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{window:win,Date,Promise,setTimeout,clearTimeout,console},{filename:file});
}
// This suite verifies the explicit offline recap. Enabled semantic context is tested separately.
win.VettiAI.resetProvider();
const luna={petId:14,name:'Luna',species:'Cat'};
const ctx={pets:[luna],activePet:luna,hasPets:true,responseLanguage:'en',appointments:{upcoming:[],past:[]},
 services:[{serviceId:44,value:'blood_test',label:'Blood Test',active:true,group:'Diagnostics',price:'₱900.00 – ₱3,000.00'},
  {serviceId:45,value:'urinalysis',label:'Urinalysis',active:true,group:'Diagnostics',price:'₱500.00 – ₱850.00'}],
 serviceGroups:[{name:'Diagnostics',names:['Blood Test','Urinalysis'],services:[],priceText:'₱350 – ₱3,000'}],
 suggestionsWithPet:[],suggestionsNoPet:[]};
async function ask(q){let a=await win.VettiAI.ask(q,ctx);win.VettiAI.recordTurn('user',q);win.VettiAI.recordTurn('vetti',a.text || '');return a;}
(async()=>{
 let checks=0;
 for(const [q,reply] of [
  ['What services do you offer?','The clinic groups services into categories.'],
  ['What about Diagnostics?','Diagnostics includes Blood Test and Urinalysis.'],
  ['How much is a blood test?','Blood Test fees start at ₱900; verify current pricing.']
 ]) {win.VettiAI.recordTurn('user',q);win.VettiAI.recordTurn('vetti',reply);checks++;}
 let a;
 a=await ask('I want to book an appointment for Luna tomorrow.');checks++;
 const count=calls.length;
 a=await ask('What were we discussing earlier?');
 assert.equal(a.id,'conversation_recap');checks++;
 for(const word of ['Diagnostics','Blood Test','Luna','tomorrow','service','No appointment']){assert.match(a.text,new RegExp(word,'i'));checks++;}
 assert.equal(a.action,'');checks++;
 assert.equal(calls.length,count,'The recap never sends history or pet names to the backend/Gemini');checks++;
 const again=await ask('Can you remind me what we talked about?');assert.equal(again.id,'conversation_recap');checks++;
 const localTagalog=await ask('Ano nga ulit yung pinag-usapan natin?');assert.equal(localTagalog.id,'conversation_recap');checks++;
 win.VettiAI.clearHistory();
 a=await ask('What were we discussing earlier?');assert.equal(a.id,'conversation_recap_empty');checks++;
 assert.doesNotMatch(a.text,/Luna|Blood Test/);checks++;
 win.VettiAI.clearHistory();
 await ask('What services do you offer?');
 a=await ask('What were we discussing earlier?');assert.equal(a.id,'conversation_recap');assert.match(a.text,/services/i);checks+=2;
 const backend=calls.filter(c=>c.url==='/api/ai/semantic-vetti' || c.url==='/api/ai/vetti' || c.url==='/api/ai/service-lookup');
 for(const c of backend){for(const key of ['conversation','pets','appointments','pet_name'])assert.ok(!(key in c.body),key+' leaked to '+c.url);checks++;}
 console.log('PASS: safe local conversation recap, service/category continuity, unconfirmed booking, Taglish variants, new chat reset, backend privacy ('+checks+' assertions)');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
