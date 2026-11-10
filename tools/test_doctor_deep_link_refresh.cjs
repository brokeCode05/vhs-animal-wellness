// Boot the real async queue function with delayed reads; no server or patient writes.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','public/doctor/doctor.js'),'utf8');
const start=source.indexOf('  async function _bootQueueFromServer() {'),end=source.indexOf('  _bootQueueFromServer();',start);
assert.ok(start>=0&&end>start);
async function run(view,rows) {
 let selected=null,visible='locked',ready;const loading=new Promise(r=>ready=r);const patients=[];
 const document={getElementById:()=>({textContent:''}),querySelector:()=>({textContent:''})};
 const context={document,patients,DOCTOR_TEST_DATE:null,currentView:view,selectedPatient:null,VETERINARIAN:{},_doctorRecord:null,availability:{value:''},
  window:{SharedMockAppointments:{todays:()=>rows},VHSReads:{hydrateDoctors:async()=>({ok:true}),hydrateAppointments:async()=>{await loading;return {ok:true,data:{appointments:rows}};}},VHSAuth:{me:async()=>({name:'Fictional Doctor'})},SharedMockDoctors:{currentDoctor:()=>null,currentStaff:()=>({name:'Fictional Doctor'})}},
  _currentDoctor:()=>null,mapAppointment:x=>x,renderQueue(){},renderHeader(){},renderQueueMeta(){},renderContext(){},selectPatient:p=>{selected=p;context.selectedPatient=p;},showView:v=>{visible=selected?v:'locked';}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);const flight=context._bootQueueFromServer();assert.equal(selected,null);ready();await flight;
 return {visible,selected};
}
(async()=>{for(const view of ['notes','orders']) {let r=await run(view,[{id:1,status:'in_consultation'}]);assert.equal(r.visible,view);assert.equal(r.selected.id,1);r=await run(view,[]);assert.equal(r.visible,'locked');assert.equal(r.selected,null);}console.log('PASS: direct notes/orders views unlock after delayed real queue selection; an empty queue remains locked.');})().catch(e=>{console.error(e);process.exitCode=1;});
