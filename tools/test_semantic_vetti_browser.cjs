'use strict';
// Frontend integration test (real project modules, mocked server; no API key).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=f=>fs.readFileSync(path.join(root,f),'utf8');
const pets=[{petId:7,name:'Bornok',species:'Cat'},{petId:8,name:'John',species:'Dog'}];
const ctx={pets,activePet:pets[0],hasPets:true,firstName:'Owner',
  services:[{serviceId:22,value:'cat_grooming',label:'Cat Grooming',active:true},
    {serviceId:21,value:'dog_grooming',label:'Dog Grooming',active:true},
    {serviceId:5,value:'consultation',label:'Consultation',active:true}],
  appointments:{upcoming:[],past:[]},responseLanguage:'taglish',suggestionsWithPet:[],suggestionsNoPet:[]};
function create(serverAnswer){
  const calls=[];
  const window={location:{pathname:'/user/index.html'},VHS_SEMANTIC_VETTI:true,
    setTimeout,clearTimeout,fetch:async (url,options)=>{
      calls.push({url,options});
      if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fake'}})};
      if(url==='/api/ai/semantic-vetti')return {ok:true,json:async()=>({success:true,data:serverAnswer})};
      return {ok:false,json:async()=>({success:false})};
    }};
  window.window=window;
  const sandbox={window,Date,Promise,setTimeout,clearTimeout};
  for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])
    vm.runInNewContext(source(f),sandbox,{filename:f});
  return {window,calls,ask:q=>window.VettiAI.ask({message:q},ctx,{timeoutMs:4000})};
}
(async()=>{
  let checks=0;
  const proposal={mode:'semantic',kind:'booking_proposal',pet_id:7,service_hint:'grooming',
    preferred_date:new Date(Date.now()+86400000).toLocaleDateString('en-CA'),
    time_preference:'none',booking_created:false,requires_confirmation:true};
  // use local date to avoid UTC timezone shift
  const t=new Date();t.setDate(t.getDate()+1);
  proposal.preferred_date=[t.getFullYear(),String(t.getMonth()+1).padStart(2,'0'),String(t.getDate()).padStart(2,'0')].join('-');
  const h=create(proposal);
  const a=await h.ask('Gusto ko sana paliguan si Bornok bukas');
  assert.equal(a.action,'openBooking');checks++;
  assert.equal(a.bookingContext.petId,'7');checks++;
  assert.equal(a.bookingContext.serviceId,'cat_grooming');checks++;
  assert.match(a.text,/Continue to Booking/);checks++;
  assert.equal(h.calls.find(c=>c.url==='/api/ai/semantic-vetti').options.method,'POST');checks++;
  const bad=create({...proposal,pet_id:999});
  const badAnswer=await bad.ask('Could you help me?');
  assert.notEqual(badAnswer.bookingContext?.petId,'999');checks++;
  const info=create({mode:'semantic',kind:'information',state:'reminder',
    text:'Please contact the clinic about its no-show policy.'});
  const answer=await info.ask('What happens if I miss my appointment?');
  assert.match(answer.text,/no-show policy/);checks++;
  assert.ok(!answer.action);checks++;
  const disabled=create({mode:'disabled'});
  const fallback=await disabled.ask('Book Bornok for grooming tomorrow');
  assert.equal(fallback.action,'openBooking');checks++;
  const legacy=disabled.calls.filter(c=>c.url==='/api/ai/booking-intent');
  assert.equal(legacy.length,1);checks++;
  console.log(`PASS: opt-in semantic Vetti browser integration (${checks} assertions)`);
})().catch(e=>{console.error(e);process.exitCode=1});
