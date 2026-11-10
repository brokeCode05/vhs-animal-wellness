const assert=require('node:assert/strict'),fs=require('node:fs');
// Exercise the production form functions with existing controls: no HTML
// rebuilding, hidden duplicate, lost manual edit, or extra submit listener.
const source=fs.readFileSync('public/user/vetti-ui.js','utf8');
const start=source.indexOf('  function openPetForm(opts) {'),end=source.indexOf('  function closePetForm(',start);
assert.ok(start>0 && end>start);
const controls={name:'Birdie',breed:'Persian',age:'3',ageUnit:'months',weight:'.75',manualNote:'retained'};
const earlier={children:[]},latest={children:[],appendChild(row){if(row.parentNode)row.parentNode.children.splice(row.parentNode.children.indexOf(row),1);this.children.push(row);row.parentNode=this;}};
const row={parentNode:earlier,submitListeners:1};earlier.children.push(row);
let reveals=0,applies=0,creates=0;
const form={closest:s=>s==='.vetti-row'?row:null,scrollIntoView:opts=>{assert.equal(opts.block,'start');reveals++;}};
const ui={petFormOpen:true};
const api=new Function('ui','Onboarding','el','turnNode','window','scrollToBottom','dom','pets','setPresence','renderBlock',source.slice(start,end)+';return {openPetForm,revealPetForm};')(
 ui,{applyPetDraft(draft,opts){assert.equal(opts.replace,false);Object.assign(controls,draft);applies++;}},id=>id==='vettiPetForm'?form:null,()=>latest,{},()=>{}, {},()=>[],()=>{},()=>{creates++;});
api.openPetForm({draft:{weight:'.85'},replace:false,review:false});
assert.equal(row.parentNode,earlier);assert.equal(reveals,0);
api.openPetForm({draft:{age:'4'},replace:false,review:true});
assert.equal(row.parentNode,latest);assert.equal(latest.children.length,1);assert.equal(earlier.children.length,0);assert.equal(controls.name,'Birdie');assert.equal(controls.breed,'Persian');assert.equal(controls.weight,'.85');assert.equal(controls.age,'4');assert.equal(controls.manualNote,'retained');
api.openPetForm({replace:false,review:true});
assert.equal(latest.children.length,1);assert.equal(row.submitListeners,1);assert.equal(creates,0);assert.equal(applies,2);assert.equal(reveals,2);assert.equal(ui.petFormOpen,true);
console.log('PASS: ready/paused review moves the same form to latest reply, preserves manual fields and listeners, and creates no pet or duplicate form.');
