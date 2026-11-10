'use strict';
// Synthetic-only browser routing acceptance. No live user or clinical records.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const calls=[];
const w={location:{pathname:'/user/index.html'},VHS_SEMANTIC_VETTI:true,setTimeout,clearTimeout,
 fetch:async(url,opt)=>{
  if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fake'}})};
  if(url==='/api/ai/semantic-vetti'){
   const body=JSON.parse(opt.body);calls.push(body);
   let text='Public clinic information is available.';
   if(/boarding/i.test(body.message))text='Yes, Boarding is in the public service catalog.';
   if(/how much/i.test(body.message))text='For Boarding, please confirm its listed price.';
   if(/Diagnostics|explain those services in tagalog/i.test(body.message))text='Sa Diagnostics, kasama ang Blood Test at Urinalysis.';
   if(/^surgery/i.test(body.message))text='The clinic lists Spay. Please choose which service.';
   return {ok:true,json:async()=>({success:true,data:{source:'ai',mode:'semantic',kind:'information',state:'idle',text}})};
  }
  throw Error('Unexpected request '+url);
 }};w.window=w;
const ctx={firstName:'Synthetic',pets:[],hasPets:false,activePet:null,
 appointments:{upcoming:[],past:[]},services:[{serviceId:1,label:'Boarding',active:true},{serviceId:2,label:'Dog Grooming',active:true},{serviceId:3,label:'Cat Grooming',active:true},{serviceId:4,label:'Blood Test',active:true},{serviceId:5,label:'Vaccination',active:true}],
 serviceGroups:[{name:'Surgery & Procedures',names:['Spay','Castration']},{name:'Pet Care',names:['Boarding','Dog Grooming','Cat Grooming']},{name:'Diagnostics',names:['Blood Test','Urinalysis']}],suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
for(const file of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout},{filename:file});
(async()=>{
 let r=await w.VettiAI.ask('My dog is having trouble breathing.',ctx);
 assert.equal(r.id,'urgent_safety'); assert.equal(r.action,'');assert.match(r.text,/veterinar|emergency/i);
 assert.equal(calls.length,0,'No Gemini/backend request on emergency');
 for(const phrase of ['My cat has difficulty with breathing.','My dog is gasping.','Hirap huminga yung aso ko.']){
  r=await w.VettiAI.ask(phrase,ctx);assert.equal(r.id,'urgent_safety',phrase);
 }
 r=await w.VettiAI.ask('May boarding din ba kayo?',ctx);
 assert.match(r.text,/Boarding/);assert.equal(calls.length,1,'Verified public-service question reaches Laravel');
 w.VettiAI.recordTurn('user','May boarding din ba kayo?');w.VettiAI.recordTurn('vetti',r.text);
 r=await w.VettiAI.ask('How much does that cost?',ctx);
 assert.match(r.text,/Boarding/);assert.equal(calls.length,2,'Price follow-up reaches Laravel');
 w.VettiAI.clearHistory();
 r=await w.VettiAI.ask('What about Diagnostics?',ctx);
 assert.match(r.text,/Blood Test/);assert.equal(calls.length,3,'Active category question reaches Laravel');
 w.VettiAI.recordTurn('user','What about Diagnostics?');w.VettiAI.recordTurn('vetti',r.text);
 r=await w.VettiAI.ask('Explain those services in Tagalog.',ctx);
 assert.match(r.text,/Diagnostics/);assert.equal(calls.length,4);
 assert.equal(calls[3].message,'Explain those services in Tagalog.');
 assert.ok(calls.every(c=>!Object.hasOwn(c,'context_category')),'Semantic context stays server-side');
 w.VettiAI.clearHistory();
 w.VettiAI.recordTurn('user','What services do you offer?');
 w.VettiAI.recordTurn('vetti','Which listed service would you like the price for?');
 for (const phrase of ['surgery','surgery and procedures','Surgery & Procedures']) {
   r=await w.VettiAI.ask(phrase,ctx); assert.match(r.text,/Spay/); assert.match(r.text,/which service/i);
 }
 const priorCount=calls.length;
 r=await w.VettiAI.ask('how much is vaccination',ctx);
 assert.equal(calls.length,priorCount+1,'Direct named price reaches Laravel');
 assert.equal(calls.at(-1).message,'how much is vaccination');
 for(const call of calls){for(const k of ['conversation','pets','appointments','medical_history','pet_name'])assert.ok(!Object.hasOwn(call,k),'Private data forbidden: '+k)}
 console.log('PASS cross-cutting User Vetti: emergencies, catalog follow-ups, category translation, context privacy (18+ checks)');
})().catch(e=>{console.error(e);process.exitCode=1});
