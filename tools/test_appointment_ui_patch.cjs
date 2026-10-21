const fs=require('fs'),vm=require('vm'),assert=require('assert');
const dir=__dirname+'/../public/user/';
const now=new Date();
const dateAt=(shift)=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+shift);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const fakeToday=dateAt(0),pastDate=dateAt(-1),futureDate=dateAt(1);
const context={window:{},localStorage:{getItem(){return null},setItem(){},removeItem(){}},sessionStorage:{getItem(){return null},setItem(){},removeItem(){}},Date,console};
context.window=context;
context._currentOwnerId=()=>1;
context.AppointmentContract={normalizeStatus:(s)=>s,timeToHHMM:(s)=>s};
context.SharedMockAppointments={all:()=>[
 {appointmentId:17,userId:1,appointmentDate:fakeToday,appointmentTime:'10:00',status:'checked_in',pet:{name:'John'},service:'Spay',referenceNo:'A'},
 {appointmentId:18,userId:1,appointmentDate:futureDate,appointmentTime:'11:00',status:'confirmed',pet:{name:'John'},service:'Spay',referenceNo:'B'},
 {appointmentId:19,userId:1,appointmentDate:pastDate,appointmentTime:'09:00',status:'checked_in',pet:{name:'John'},service:'Spay',referenceNo:'C'},
 {appointmentId:20,userId:2,appointmentDate:futureDate,appointmentTime:'11:00',status:'confirmed',pet:{name:'Other'},service:'Consultation',referenceNo:'D'},
 {appointmentId:21,userId:1,appointmentDate:futureDate,appointmentTime:'11:00',status:'no_show',pet:{name:'John'},service:'Spay',referenceNo:'E'}
]};
vm.createContext(context);
vm.runInContext(fs.readFileSync(dir+'vetti-data.js','utf8'),context);
vm.runInContext(fs.readFileSync(dir+'vetti-state.js','utf8'),context);
const buckets=context.VettiData.getAppointmentsByBucket();
assert.deepEqual(Array.from(buckets.upcoming.map(x=>x.appointmentId)),[17,18]);
assert.deepEqual(Array.from(buckets.past.map(x=>x.appointmentId)).sort(),[19,21]);
const ans=context.VettiState.resolve('When is my next appointment?',{hasPets:true,appointments:buckets,firstName:'Owner',suggestionsWithPet:[],suggestionsNoPet:[]});
assert(ans.appointment && ans.appointment.appointmentId===18,'Next visit should be FUTURE confirmed, not checked-in');
assert(ans.text.includes('Your next visit'), 'Next booked visit correctly described');
const noFuture={upcoming:[buckets.upcoming[0]],past:buckets.past};
const ans2=context.VettiState.resolve('When is my next appointment?',{hasPets:true,appointments:noFuture,firstName:'Owner',suggestionsWithPet:[],suggestionsNoPet:[]});
assert(!ans2.appointment && ans2.text.includes('checked in and awaiting clinic service'));

// Extract simple event handler and execute with an actual numeric ID.
const source=fs.readFileSync(dir+'user-script.js','utf8');
const a=source.indexOf('function viewAppt(id) {');const b=source.indexOf('\n\n\nfunction rescheduleAppt(',a);
assert(a>=0&&b>a);
let modalId='';let html='';
const box={innerHTML:''};
const env={mockAppointmentsData:[{id:17,reference_no:'VHS-17',pet_name:'John',pet_type:'Dog',pet_breed:'',service:'Spay',date:fakeToday,time:'10:00',status:'checked_in'}],
 document:{getElementById(k){return k==='apptDetails'?box:null}},_fmtApptDateShort:x=>x,_fmtApptTimeShort:x=>x,_apptStatusBadge:x=>x,escapeHtml:x=>String(x),openModal:id=>modalId=id};
vm.createContext(env);
vm.runInContext(source.slice(a,b),env);
env.viewAppt('17');
assert.equal(modalId,'viewApptModal');assert(box.innerHTML.includes('John'));
console.log('PASS: checked-in status not auto-completed/no-show; future next; current/past bucket; unauthorized owner filtered; numeric IDs open View Details');
