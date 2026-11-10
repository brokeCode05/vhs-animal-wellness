 'use strict';
// Real Vetti modules + controlled server responses; no model or patient calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ctx={pets:[{petId:7,name:'FictionalPet',species:'Dog'}],activePet:null,hasPets:true,responseLanguage:'en',
 services:[{value:'blood_test',label:'Blood Test',active:true},{value:'new_catalog_procedure',label:'New Catalog Procedure',active:true},
 {value:'inactive_service',label:'Inactive',active:false}],appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[]};
function harness(semantic,fallback,status=200){
 const calls=[];const window={location:{pathname:'/user/index.html'},VHS_SEMANTIC_VETTI:true,setTimeout,clearTimeout,
 fetch:async(url,options)=>{
  if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fictional'}})};
  const body=JSON.parse(options.body);calls.push({url,body});
  if(url==='/api/ai/semantic-vetti')return {ok:status===200,status,json:async()=>({success:true,data:semantic})};
  if(url==='/api/ai/vetti')return {ok:true,status:200,json:async()=>({success:true,data:fallback})};
  throw Error('Unexpected route '+url);
 }};window.window=window;
 for(const file of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{window,Date,Promise,setTimeout,clearTimeout},{filename:file});
 return {calls,ask:message=>window.VettiAI.ask(message,ctx,{timeoutMs:4000})};
}
(async()=>{
 let checks=0;
 const date=new Date();date.setDate(date.getDate()+1);
 const iso=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const proposal={mode:'semantic',kind:'booking_proposal',pet_id:7,service_hint:'new_catalog_procedure',service_value:'new_catalog_procedure',
 preferred_date:iso,time_preference:'none',booking_created:false,requires_confirmation:true,text:'Review the proposed form. No appointment was made.'};
 let h=harness(proposal);let r=await h.ask('Book the new procedure for FictionalPet tomorrow');
 assert.equal(r.action,'openBooking');assert.equal(r.bookingContext.serviceId,'new_catalog_procedure');assert.equal(h.calls.length,1);checks+=3;
 for(const patch of [{service_value:'unknown'},{service_value:'inactive_service'},{pet_id:999},{booking_created:true},{requires_confirmation:false}]){
  h=harness({...proposal,...patch});r=await h.ask('Book a service tomorrow');
  assert.ok(!r.action);assert.ok(!r.bookingContext);assert.equal(h.calls.filter(c=>c.url==='/api/ai/booking-intent').length,0);checks+=3;
 }
 for(const mode of ['fallback','disabled']){
  h=harness({mode},{source:'rule',text:'The clinic address is Example Road.',state:'idle',action:'openBooking',booking_created:true});
  r=await h.ask('Where is the clinic?');assert.equal(r.id,'verified_offline_answer');assert.match(r.text,/Example Road/);
  assert.ok(!r.action);assert.ok(!r.bookingContext);assert.equal(h.calls.length,2);
  const recovery=h.calls[1];assert.equal(recovery.url,'/api/ai/vetti');assert.equal(recovery.body.fallback_only,true);
  for(const key of ['conversation','pets','appointments','pet_name'])assert.ok(!Object.hasOwn(recovery.body,key));checks+=11;
 }
 for(const status of [401,403]){
  h=harness(null,{source:'rule',text:'Do not reveal cached private records.'},status);r=await h.ask('Show my pets');
  assert.equal(r.id,'semantic_unavailable');assert.ok(!r.petCards);assert.equal(h.calls.length,1);checks+=3;
 }
 h=harness({mode:'fallback'},{source:'ai',text:'An unvalidated AI response must be discarded.'});r=await h.ask('Where is the clinic?');
 assert.equal(r.id,'semantic_unavailable');assert.doesNotMatch(r.text,/unvalidated/);checks+=2;
 h=harness(proposal);await h.ask('My pet is not breathing');assert.equal(h.calls.length,0);checks++;
 console.log(`PASS: current Vetti catalog, provider-free recovery, forged responses, auth expiry and safety (${checks} checks)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
