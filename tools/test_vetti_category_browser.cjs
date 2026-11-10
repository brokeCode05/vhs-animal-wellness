'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const w={};w.window=w;
vm.runInNewContext(fs.readFileSync(path.join(root,'public/user/vetti-state.js'),'utf8'),{window:w,Date,setTimeout,clearTimeout},{filename:'vetti-state.js'});
const groups=[{name:'Pet Care',services:[],names:['Dog Grooming','Cat Grooming','Boarding'],priceText:'varies'},{name:'Diagnostics',services:[],names:['Blood Test','Urinalysis'],priceText:'varies'}];
const ctx={pets:[],hasPets:false,activePet:null,services:[],serviceGroups:groups,appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[]};
for(const [q,hit] of [['What services are under Pet Care?','Cat Grooming'],['Ano mga serbisyo under Pet Care?','Boarding'],['What about Diagnostics?','Blood Test']]){
 const r=w.VettiState.resolve(q,ctx);
 assert.match(r.text,new RegExp(hit));assert.equal(r.action,'');assert.equal(r.id,'services_filtered');
}
const never=['Book my pet under Pet Care','Show my pet records','Diagnose my pet'];
for(const q of never){let r=w.VettiState.resolve(q,ctx);assert.notEqual(r.id,'services_filtered',q);}
console.log('PASS: 6 browser category and private/clinical separation tests');
