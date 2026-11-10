const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const nodes={};function node(id,value=''){return nodes[id]={id,value,hidden:true,textContent:'',events:{},closest(){return null;},setAttribute(){},removeAttribute(){},scrollIntoView(){},focus(){},dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e);},addEventListener(type,fn){(this.events[type]??=[]).push(fn);}};}
const document={getElementById:id=>nodes[id]||null,querySelector(){return null;},addEventListener(){}};
const saved=[];const w={document,console};w.window=w;
const context={window:w,document,console,Promise,Event:class {constructor(type){this.type=type;}}};
vm.runInNewContext(fs.readFileSync(path.join(root,'public/user/pet-onboarding.js'),'utf8'),context);
w.VettiData={getPetLimits:()=>w.VHSPetOnboarding.PET_LIMITS,getOwnerId:()=>123,createPet:async fields=>{saved.push(fields);return {ok:true,pet:fields};}};
vm.runInNewContext(fs.readFileSync(path.join(root,'public/user/vetti-onboarding.js'),'utf8'),context);
for(const [id,v] of Object.entries({vettiPetName:'Fictional Hamster',vettiPetSpecies:'Other',vettiPetSpeciesCustom:'Hamster',vettiPetBreed:'Unknown',vettiPetBreedCustom:'Unknown',vettiPetSex:'Female',vettiPetAge:'2',vettiPetAgeUnit:'months',vettiPetWeight:'.75'})){node(id,v);node('vettiErr-'+id);}
for(const [id,v] of Object.entries({pet_name:'Fictional Rabbit',species:'Rabbit',species_custom:'',breed:'Unknown',breed_custom:'',gender:'Female',age:'2',age_unit:'months',weight_kg:'.75'}))node(id,v);
(async()=>{
 const form=w.VettiOnboarding.petFormMarkup({hasPets:true});assert.ok(form.includes('value="months"'));assert.ok(form.includes('inputmode="decimal"'));
 for(const weight of ['.05','.3','.5','.75','0.85','1.2','2.65','200']){
  nodes.vettiPetWeight.value=nodes.weight_kg.value=weight;
  assert.equal(w.VettiOnboarding.validatePetForm(),true,weight);assert.equal(w.VHSPetOnboarding.validatePetForm(),true,weight);
  const result=await w.VettiOnboarding.submitPetForm();assert.equal(result.ok,true);const savedPet=saved.at(-1);assert.equal(savedPet.weightKg,Number(weight));assert.equal(savedPet.ageMonths,2);assert.equal(savedPet.age,null);assert.equal(savedPet.speciesCustom,'Hamster');
 }
 const savedCount=saved.length;
 for(const weight of ['.','-1','1e2','0.123','201','1..2','abc']){
  nodes.vettiPetWeight.value=nodes.weight_kg.value=weight;
  assert.equal(w.VettiOnboarding.submitPetForm().error,'validation',weight);assert.equal(w.VHSPetOnboarding.validatePetForm(),false,weight);
 }
 assert.equal(saved.length,savedCount,'Invalid weights must not cause a write');
 nodes.vettiPetWeight.value='.35';nodes.vettiPetAge.value='4';nodes.vettiPetAgeUnit.value='years';await w.VettiOnboarding.submitPetForm();assert.equal(saved.at(-1).age,4);assert.equal(saved.at(-1).ageMonths,null);
 nodes.vettiPetAge.value='51';assert.equal(w.VettiOnboarding.validatePetForm(),false);nodes.vettiPetAgeUnit.value='months';assert.equal(w.VettiOnboarding.validatePetForm(),true);
 w.VettiOnboarding.installGuards({});nodes.vettiPetAgeUnit.value='years';nodes.vettiPetAgeUnit.events.change[0]();assert.match(nodes['vettiErr-vettiPetAge'].textContent,/50 years/);nodes.vettiPetAgeUnit.value='months';nodes.vettiPetAgeUnit.events.change[0]();assert.equal(nodes['vettiErr-vettiPetAge'].textContent,'');

 const writesBefore=saved.length;w._breedMap={Cat:['Unknown','Persian','Other'],Dog:['Unknown','Aspin','Other']};
 w.VettiOnboarding.applyPetDraft({name:'Daboh',breed:'Persian',gender:'Male',age:8,ageUnit:'months',weightKg:2});
 assert.equal(saved.length,writesBefore,'Prefill cannot save a pet');assert.equal(nodes.vettiPetName.value,'Daboh');assert.equal(nodes.vettiPetSpecies.value,'Cat');assert.equal(nodes.vettiPetBreed.value,'Persian');assert.equal(nodes.vettiPetSex.value,'Male');assert.equal(nodes.vettiPetAge.value,'8');assert.equal(nodes.vettiPetAgeUnit.value,'months');assert.equal(nodes.vettiPetWeight.value,'2');
 w.VettiOnboarding.applyPetDraft({name:'Quill',species:'Hamster',breed:'Syrian',gender:'Female',age:3,ageUnit:'months',weightKg:.25});
 assert.equal(nodes.vettiPetSpecies.value,'Other');assert.equal(nodes.vettiPetSpeciesCustom.value,'Hamster');assert.equal(nodes.vettiPetBreedCustom.value,'Syrian');assert.equal(nodes.vettiPetWeight.value,'0.25');
 await w.VettiOnboarding.submitPetForm();assert.equal(saved.at(-1).name,'Quill');assert.equal(saved.at(-1).ageMonths,3);assert.equal(saved.at(-1).weightKg,.25);
 w.VettiOnboarding.applyPetDraft({species:'Other',speciesCustom:'Hamster'}, {replace:false});assert.equal(nodes.vettiPetSpeciesCustom.value,'Hamster');
 const retainedName=nodes.vettiPetName.value;const retainedAge=nodes.vettiPetAge.value;
 w.VettiOnboarding.applyPetDraft({weightKg:.45},{replace:false});assert.equal(nodes.vettiPetName.value,retainedName);assert.equal(nodes.vettiPetAge.value,retainedAge);assert.equal(nodes.vettiPetWeight.value,'0.45');
 w.VettiOnboarding.applyPetDraft({name:'Fresh'});assert.equal(nodes.vettiPetWeight.value,'');assert.equal(nodes.vettiPetAge.value,'');assert.equal(nodes.vettiPetSpecies.value,'');assert.equal(saved.length,writesBefore+1);
 console.log('PASS: decimal weights, months/years, small-mammal fields, invalid-input no-write age-unit feedback and safe prompt prefill');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
