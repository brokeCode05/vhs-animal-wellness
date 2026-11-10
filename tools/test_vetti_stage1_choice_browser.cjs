// Exercises the currently enabled semantic server contract; every response is fictional and mocked.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');const calls=[];
let sessionChoice=false;
const w={VHS_SEMANTIC_VETTI:true,location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async (url,opt)=>{
 if(url==='/api/auth/csrf')return{ok:true,json:async()=>({data:{csrf_token:'synthetic'}})};
 if(url==='/api/ai/semantic-vetti'){
  const body=JSON.parse(opt.body);calls.push(body);
  const q=body.message.toLowerCase();let data;
  if(q.includes('and dog grooming')){sessionChoice=true;data={text:'Which one: Cat Grooming or Dog Grooming?',intent:'service_ambiguous'};}
  else if(q.includes('how much')) data=sessionChoice ? {text:'Which service: Cat Grooming or Dog Grooming?',intent:'service_ambiguous'}:{text:'For Dog Grooming, confirm fee',intent:'price'};
  else if(q.includes('second')){sessionChoice=false;data={text:'You selected Dog Grooming.',intent:'service_choice'};}
  else data={text:'Service information',intent:'services'};
  return{ok:true,json:async()=>({success:true,data:{...data,mode:'semantic',kind:'information',state:'idle',requires_confirmation:false}})};
 }
 throw Error('Unexpected URL '+url);
}};w.window=w;
const ctx={pets:[],hasPets:false,activePet:null,appointments:{upcoming:[],past:[]},services:[{label:'Cat Grooming',serviceId:1,active:true},{label:'Dog Grooming',serviceId:2,active:true}],serviceGroups:[],suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'en'};
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout},{filename:f});
(async()=>{
 for(const [q,needle] of [
  ['What about cat grooming and dog grooming?','Which one'],
  ['How much is it?','Which service'],
  ['the second one','Dog Grooming'],
  ['How much is it?','Dog Grooming']
 ]) {
  const answer=await w.VettiAI.ask(q,ctx);assert.match(answer.text,new RegExp(needle));
  w.VettiAI.recordTurn('user',q);w.VettiAI.recordTurn('vetti',answer.text);
 }
 assert.equal(calls.length,4,'All four related turns must reach Laravel');
 for(const req of calls){
  for(const forbidden of ['conversation','pets','appointments','selected_service','choices','service_id']) assert.equal(Object.hasOwn(req,forbidden),false,'Unsafe browser-supplied field '+forbidden);
  assert.equal(typeof req.conversation_id,'string');
 }
 console.log('PASS: User Vetti multi-turn ambiguity and ordinal resolution reached Laravel without private data (4 turns)');
})().catch(e=>{console.error(e);process.exitCode=1});
