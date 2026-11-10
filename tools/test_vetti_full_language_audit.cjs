'use strict';
// Uses fictional clinic facts, no requests, no external provider.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const dir=path.resolve(__dirname,'..');
const load=x=>fs.readFileSync(path.join(dir,x),'utf8');
const fake={location:{pathname:'/user/index.html'},fetch(){throw Error('No network calls in NLU QA')},setTimeout,clearTimeout};fake.window=fake;
const sandbox={window:fake,Date,Promise,setTimeout,clearTimeout};
for(const p of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(load(p),sandbox,{filename:p});
const patient={petId:8,name:'TestPet',species:'Dog'}, ctx={pets:[patient],activePet:patient,hasPets:true,firstName:'Test',services:[],serviceGroups:[],appointments:{upcoming:[],past:[]}, clinicInfo:{name:'Fictional Clinic',address:'Fictional Test Street',phone:'0000 000 0000',email:'info@example.invalid'},suggestionsNoPet:[],suggestionsWithPet:[]};
const doc={readyState:'loading',addEventListener(){},createElement(){return {}}},store={getItem(){return null},setItem(){}};
const pwin={sessionStorage:store};vm.runInNewContext(load('public/web-page/public-vetti.js'),{window:pwin,document:doc,sessionStorage:store},{filename:'public-vetti.js'});
let assertions=0;
const check=(test,reason)=>{assert.ok(test,reason);assertions++};
const positives=["clinic info","clinics info","clinic information","clinics information","clinic's info","clinic’s info","tell me about your clinic","Give me the clinic details","details about the clinic","information about your clinic","Impormasyon ng clinic","Pahingi ng info ng clinic","vhs clinic info","vet clinic info","clinic phone number","How can I contact the clinic?"];
for(const q of positives){const out=fake.VettiState.resolve(q,ctx);check(out.id==='clinic_info',`USER ${q}: ${out.id}`);check(out.action==='',`USER action ${q}`);check(out.text.includes('Fictional Test Street'),`USER facts ${q}`)}
for(const q of ['Book a clinic visit tomorrow','Show my pets','Show my appointments',"My dog's medical records",'I want TestPet documents','Change my profile','Cancel my appointment','My pet collapsed, clinic info']){
 const out=fake.VettiState.resolve(q,ctx);check(out.id!=='clinic_info',`USER false positive: ${q}`);
}
for(const q of positives.slice(0,14)){const reply=pwin.VettiPublic.answer(q);check(/Contact page/i.test(reply),`PUBLIC offline ${q}: ${reply}`);check(!/Fictional Test Street/.test(reply),`PUBLIC offline unverified: ${q}`)}
for(const q of ['my pet booking','my dog collapsed','my cat is vomiting']){let answer=pwin.VettiPublic.answer(q); check(/login|sign up|veterinar|urgent|emergency/i.test(answer),`PUBLIC guard: ${q}`)}
for(const q of ['exhibition','this is good','white paper','think again']) {const ans=pwin.VettiPublic.answer(q);check(!/Happy to help!/.test(ans),`PUBLIC substring greeting: ${q}`)}
const webSource=load('public/web-page/public-vetti.js');check(!/0917 108 4174|vhs\.animalwellness@gmail\.com|834 Aurora Boulevard/.test(webSource),'No cached contact details in fallback code');
check(/}, 50000\);/.test(webSource),'Public AI timeout has margin for 40-second provider');
check(/}, 50000\);/.test(load('public/user/vetti-ai.js')),'User AI fallback timeout has margin for 40-second provider');
console.log(`PASS: user + public Vetti comprehensive NLU/offline/privacy (${assertions} checks, no network)`);
