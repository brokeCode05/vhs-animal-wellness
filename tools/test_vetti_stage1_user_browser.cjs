// Exercises the currently enabled semantic server contract; every response is fictional and mocked.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), calls=[];
const w={VHS_SEMANTIC_VETTI:true,location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async (url,opt)=>{
 if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fictional'}})};
 if(url==='/api/ai/semantic-vetti'){
   const r=JSON.parse(opt.body);calls.push(r);
   let text = /cat grooming/i.test(r.message) ? 'Cat Grooming is listed.' : /dog grooming/i.test(r.message)?'Dog Grooming is listed.':'For Cat Grooming, please verify the listed fee.';
   return {ok:true,json:async()=>({success:true,data:{text,mode:'semantic',kind:'information',state:'idle'}})};
 }
 throw Error('Unexpected URL: '+url);
}};w.window=w;
const ctx={pets:[],hasPets:false,activePet:null,appointments:{upcoming:[],past:[]},
 services:[{serviceId:11,label:'Cat Grooming',active:true},{serviceId:12,label:'Dog Grooming',active:true}],
 serviceGroups:[{name:'Pet Care',services:[],names:['Cat Grooming','Dog Grooming'],priceText:'varies'}],
 suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout},{filename:f});
(async()=>{
 const one=await w.VettiAI.ask('Do you offer cat grooming?',ctx);
 assert.match(one.text,/Cat Grooming/);assert.equal(calls.length,1,'First exact service request must reach Laravel catalog');
 w.VettiAI.recordTurn('user','Do you offer cat grooming?');w.VettiAI.recordTurn('vetti',one.text);
 const two=await w.VettiAI.ask('How much does that cost?',ctx);
 assert.match(two.text,/Cat Grooming/);assert.equal(calls.length,2,'Pronoun price request must reach Laravel context');
 w.VettiAI.recordTurn('user','How much does that cost?');w.VettiAI.recordTurn('vetti',two.text);
 const three=await w.VettiAI.ask('What about dog grooming?',ctx);
 assert.match(three.text,/Dog Grooming/);assert.equal(calls.length,3,'Service switch must reach Laravel catalog');
 for(const req of calls) {
   for(const forbidden of ['conversation','pets','appointments','service_id','selected_service']) assert.equal(Object.hasOwn(req,forbidden),false,'Disallowed frontend input: '+forbidden);
   assert.equal(typeof req.conversation_id,'string');
 }
 console.log('PASS: Stage 1 User Vetti service question, pronoun pricing, service switch, no private history/provider payload ('+calls.length+' requests)');
})().catch(e=>{console.error(e);process.exitCode=1});
