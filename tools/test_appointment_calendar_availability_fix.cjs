"use strict";
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let checks = 0;
function check(v,msg){assert.ok(v,msg); checks++;}
function element(name) {
  const classes = new Set();
  return { tag:name, className:'', textContent:'', innerHTML:'', children:[], style:{},
    classList:{ add(...cls){cls.forEach(s=>classes.add(s));},remove(...cls){cls.forEach(s=>classes.delete(s));}, contains(s){return classes.has(s);}},
    appendChild(item){this.children.push(item);return item;},
    addEventListener(){}, getAttribute(){return null;} };
}
(async () => {
  const grid=element('div'); const month=element('button'); const style=element('style');
  const dom = {
    head:{appendChild(){}}, getElementById(id){return id==='calendarGrid'?grid:id==='calendarMonth'?month:null;},
    createElement:element, querySelector(){return null;}, querySelectorAll(){return [];}, addEventListener(){}
  };
  const appointments=[{
    appointmentId:73,referenceNo:'VHS-TEST-073',userId:1,petId:2,service:'consultation',
    appointmentDate:'2026-10-27',appointmentTime:'09:00',status:'confirmed',
    owner:{name:'Synthetic Owner'},pet:{name:'Synthetic Pet',species:'Dog'}
  }];
  const shared={getAll:()=>appointments};
  const win={SharedMockAppointments:shared,SharedMockUsers:{serviceLabel:s=>s},VHSReads:{hydrateAppointments:async()=>({ok:true})}};
  const ctx={window:win,document:dom,Date,Promise,CustomEvent:function(){},showToast(){},
    renderAllAppointmentsTable(){},getVHSTimeSlots:()=>['9:00 AM','10:00 AM'], VHS_TIME_SLOTS:['9:00 AM','10:00 AM']};
  win.window=win;
  vm.createContext(ctx);
  vm.runInContext(read('public/shared/appointment-contract.js'),ctx);
  vm.runInContext(read('public/shared/dashboard-shared.js'),ctx);
  vm.runInContext("CalendarState.currentYear=2026; CalendarState.currentMonth=9; CalendarState.currentDay=27; CalendarState.currentView='day';",ctx);
  await vm.runInContext('loadAppointments()',ctx);
  check(vm.runInContext("CalendarState.appointments[0].time",ctx)==='9:00 AM','API time must be projected into 12-hour calendar slot');
  check(vm.runInContext("CalendarState.appointments[0].referenceNo",ctx)==='VHS-TEST-073','calendar must retain reference');
  check(grid.children.some(c=>c.children && c.children.some(k=>k.children && k.children.some(z=>z.className==='day-apt status-confirmed'))),'Day view should contain appointment');
  vm.runInContext("setCalendarView('week')",ctx);
  check(grid.children.some(c=>c.children && c.children.some(k=>k.className==='week-apt status-confirmed')),'Week view should contain appointment');
  // Test actual User scheduling adapter, with a populated service and backend
  // outage response; it must not invent locally calculated slots.
  const usr=read('public/user/user-script.js');
  const start=usr.indexOf('function _smartSchedulingSlots(dateStr, options) {');
  const stop=usr.indexOf('// OFFLINE FALLBACK ONLY',start);
  check(start>=0&&stop>start,'User booking availability adapter found');
  const svc={serviceId:4,value:'consultation',label:'Consultation'};
  const booking={window:{SharedMockUsers:{serviceById:()=>svc},VHSReads:{availability:async()=>({ok:false})}}, document:{getElementById:()=>null}, Promise};
  vm.createContext(booking);
  vm.runInContext(usr.slice(start,stop),booking);
  let slots=await vm.runInContext("_smartSchedulingSlots('2026-10-28',{serviceId:4})",booking);
  check(slots.length===0,'When API fails no slot may be offered');
  booking.window.VHSReads.availability=async()=>({ok:true,data:{display_slots:['10:00 AM']}});
  slots=await vm.runInContext("_smartSchedulingSlots('2026-10-28',{serviceId:4})",booking);
  check(slots.length===1&&slots[0]==='10:00 AM','Available verified slot shown');
  booking.window.VHSReads.availability=async()=>{throw Error('offline')};
  slots=await vm.runInContext("_smartSchedulingSlots('2026-10-28',{serviceId:4})",booking);
  check(slots.length===0,'Rejected API promise still offers no slot');
  // Admin reschedule and booking must be subject to the same rule.
  const admin=read('public/admin/admin-portal.js');
  check(admin.includes("render([]); // No speculative local slots"),'Admin reschedule failure is fail-closed');
  check(admin.includes("reason: 'availability_unavailable'"),'Admin booking failure is fail-closed');
  console.log('PASS: calendar and appointment availability ('+checks+' checks)');
})().catch(e=>{console.error(e);process.exitCode=1;});
