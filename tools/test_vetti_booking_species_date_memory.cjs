'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const calls=[];
const w={location:{pathname:'/user/index.html'},setTimeout,clearTimeout,console,fetch:async(url,options)=>{
 if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'demo'}})};
 if(url==='/api/ai/booking-intent') {calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({success:true,data:{booking_created:false,requires_confirmation:true,source:'rule',service_hint:'grooming',time_preference:'none',service_ambiguous:false}})};}
 if(url==='/api/ai/vetti') return {ok:true,json:async()=>({success:true,data:{text:'Approved public info',state:'idle',source:'rule',intent:'general'}})};
 throw Error(url);
}};w.window=w;
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout,console},{filename:f});
const services=[{serviceId:23,value:'cat_grooming',label:'Cat Grooming',active:true},{serviceId:24,value:'dog_grooming',label:'Dog Grooming',active:true},{serviceId:22,value:'vaccination',label:'Vaccination',active:true}];
function makeCtx(species='Cat'){return {pets:[{petId:11,name:'Luna',species},{petId:12,name:'Bornok',species:'Dog'}],services,activePet:{petId:12,name:'Bornok',species:'Dog'},hasPets:true,appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'taglish'};}
async function ask(q,ctx){let r=await w.VettiAI.ask(q,ctx);w.VettiAI.recordTurn('user',q);w.VettiAI.recordTurn('vetti',r.text||'');console.log(q,'=>',r.id,r.text.split('\n').filter(x=>/^(Pet|Service|Date|Time|Please|The selected)/i.test(x)).join(' | '));return r;}
(async()=>{
 w.VettiAI.clearHistory();let ctx=makeCtx();
 let r=await ask('Hi Vetti, gusto ko sana ipa-groom yung pusa ko.',ctx);assert.equal(r.action,'openBooking');assert.match(r.text,/Service: Cat Grooming/);assert.match(r.text,/Pet: not selected/);
 r=await ask('Si Luna sana.',ctx);assert.match(r.text,/Pet: Luna/);assert.match(r.text,/Service: Cat Grooming/);
 r=await ask('Bukas sana ng hapon.',ctx);assert.match(r.text,/Pet: Luna/);assert.match(r.text,/Service: Cat Grooming/);assert.match(r.text,/Date: \d{4}-\d{2}-\d{2}/);assert.match(r.text,/afternoon preference/);
 r=await ask('Actually, next week na lang.',ctx);assert.match(r.text,/Pet: Luna/);assert.match(r.text,/Service: Cat Grooming/);assert.match(r.text,/Date: not selected/);assert.match(r.text,/specific date next week/i);
 r=await ask('Ano na ulit yung details ng booking ko?',ctx);assert.match(r.text,/Pet: Luna/);assert.match(r.text,/Service: Cat Grooming/);assert.match(r.text,/Date: not selected/);
 // Choose explicit date, check no auto booking
 const day=new Date();day.setDate(day.getDate()+5);const iso=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
 r=await ask(iso,ctx);assert.match(r.text,/Pet: Luna/);assert.match(r.text,/Service: Cat Grooming/);assert.ok(r.text.includes('Date: '+iso));
 w.VettiAI.clearHistory();ctx=makeCtx('Dog');
 r=await ask('Gusto ko ipa-groom yung pusa ko.',ctx);assert.match(r.text,/Service: Cat Grooming/);
 r=await ask('Si Luna sana.',ctx);assert.match(r.text,/Service: not selected/);assert.match(r.text,/Pet: Luna/);assert.match(r.text,/do not match/i);
 w.VettiAI.clearHistory();
 ctx=makeCtx();r=await ask('Please book dog grooming for my cat.',ctx);assert.match(r.text,/Service: not selected/);
 w.VettiAI.clearHistory();r=await ask('Please book Luna for cat grooming.',ctx);assert.match(r.text,/Service: Cat Grooming/);
 assert.ok(!calls.some(c=>c.pet_id||c.petId||c.patient_records||c.conversation));
 console.log('PASS: Cat/Taglish booking, correction, proposal review, typed dates, pet-service mismatch, privacy');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
