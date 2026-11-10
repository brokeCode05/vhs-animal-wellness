'use strict';
// Mocked network, real project frontend files. Not a live browser test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const calls = [];
const win = {
  location:{pathname:'/user/index.html'}, VHS_SEMANTIC_VETTI:true,
  setTimeout, clearTimeout,
  fetch: async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({url,body});
    if (url === '/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'mock'}})};
    if (url === '/api/ai/service-lookup') return {ok:true,json:async()=>({success:true,data:{kind:'answer',state:'idle',text:'The clinic lists Dog Grooming and Cat Grooming in its verified catalog.'}})};
    if (url === '/api/ai/semantic-vetti') {
      // Simulated Laravel response: tests frontend routing, not Gemini itself.
      let data={mode:'semantic',kind:'information',state:'reminder',text:'Synthetic informational answer.'};
      if (/grooming services/i.test(body.message)) data.text='The clinic lists Dog Grooming and Cat Grooming.';
      if (/remind me what I was trying to book/i.test(body.message)) data.text='Your proposed booking is for your pet tomorrow. No appointment has been made.';
      if (body.message === 'Show my pets') data={mode:'semantic',kind:'pets_list',state:'idle',text:'Here are your pets.',pet_ids:[14]};
      return {ok:true,json:async()=>({success:true,data})};
    }
    if (url === '/api/ai/vetti') return {ok:true,json:async()=>({success:true,data:{source:'rule',state:'idle',text:'Please consult the verified Services page.'}})};
    if (url === '/api/ai/booking-intent') return {ok:true,json:async()=>({success:true,data:{booking_created:false,requires_confirmation:true,source:'rule',service_hint:'none',time_preference:'none',service_ambiguous:false}})};
    throw Error('Unexpected endpoint ' + url);
  }
};
win.window=win;
for (const file of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{window:win,Date,Promise,setTimeout,clearTimeout,console},{filename:file});
}
const luna={petId:14,name:'Luna',species:'Dog'};
const ctx={pets:[luna],activePet:luna,hasPets:true,responseLanguage:'en',appointments:{upcoming:[],past:[]},
  services:[{serviceId:31,value:'dog_grooming',label:'Dog Grooming',active:true,group:'Pet Care',price:'₱500'},
    {serviceId:32,value:'cat_grooming',label:'Cat Grooming',active:true,group:'Pet Care',price:'₱600'},
    {serviceId:44,value:'blood_test',label:'Blood Test',active:true,group:'Diagnostics',price:'₱900 – ₱3,000'}],
  serviceGroups:[{name:'Diagnostics',names:['Blood Test'],services:[]},{name:'Pet Care',names:['Dog Grooming','Cat Grooming'],services:[]}],
  suggestionsWithPet:[], suggestionsNoPet:[]};
async function ask(q){const a=await win.VettiAI.ask(q,ctx);win.VettiAI.recordTurn('user',q);win.VettiAI.recordTurn('vetti',a.text||'');return a;}
(async()=>{
  let count=0;
  await ask('What services do you offer?'); count++;
  await ask('What about Diagnostics?'); count++;
  await ask('How much is a blood test?'); count++;
  await ask('I want to book an appointment for Luna tomorrow.'); count++;
  let a=await ask('Actually, can you tell me about grooming services?');
  assert.match(a.text,/Dog Grooming|Cat Grooming/i,'Explicit public-service inquiry must not display pet profile');
  assert.doesNotMatch(a.text,/you have 1 pets|Luna.*Aspin/i);
  assert.equal(calls.at(-1).url,'/api/ai/semantic-vetti');
  count+=3;
  const before=calls.length;
  a=await ask('Can you remind me what I was trying to book?');
  assert.equal(a.id,'semantic_information');
  assert.match(a.text,/your pet/i);
  assert.match(a.text,/tomorrow/i);
  assert.match(a.text,/No appointment has been made/i);
  assert.ok(!a.action);
  assert.equal(calls.length,before+1,'Recap reaches the semantic endpoint');
  count+=6;
  // Laravel-authorized pet IDs are mapped to the already loaded owner-scoped cards.
  const beforePets=calls.length;
  a=await ask('Show my pets');
  assert.ok(a.petCards || /pets/i.test(a.text || ''));
  assert.equal(calls.length,beforePets+1);
  assert.equal(calls.at(-1).url,'/api/ai/semantic-vetti');
  count+=2;
  for(const call of calls){
    if (call.url === '/api/auth/csrf') continue;
    assert.ok(!call.body || !('conversation' in call.body));
    assert.ok(!call.body || !('pets' in call.body));
    assert.ok(!call.body || !('appointments' in call.body));
    count+=3;
  }
  console.log('PASS: semantic service routing, read-only pending recall, owned-pet cards, payload privacy ('+count+' assertions)');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
