'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const get = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stateJS = get('public/user/vetti-state.js');
const aiJS = get('public/user/vetti-ai.js');
const portalJS = get('public/user/user-script.js');
const contractJS = get('public/shared/appointment-contract.js');

const catalog = [
  { serviceId: 21, value: 'dog_grooming', label: 'Dog Grooming', active: true },
  { serviceId: 22, value: 'cat_grooming', label: 'Cat Grooming', active: true },
  { serviceId: 2, value: 'vaccination', label: 'Vaccination', active: true }
];
const pet = { petId: 7, name: 'Bornok', species: 'Cat' };
const ctx = {
  pets: [pet], activePet: pet, hasPets: true, firstName: 'Owner', services: catalog,
  suggestionsWithPet: [], suggestionsNoPet: [], responseLanguage: 'en'
};
const day = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);

function harness(response, opts={}) {
  const requests=[];
  const window={
    location: { pathname: '/user/index.html' },
    setTimeout, clearTimeout,
    fetch: async(url, options) => {
      requests.push({url, options});
      if(url === '/api/auth/csrf') return {ok:true, json:async()=>({data:{csrf_token:'unit-test'}})};
      if(opts.fail) throw new Error('offline');
      return {ok:true, json:async()=>({success:true, data:response})};
    }
  };
  window.window=window;
  const env={window, setTimeout, clearTimeout, Promise, Date};
  vm.runInNewContext(contractJS,env);
  vm.runInNewContext(stateJS,env);
  vm.runInNewContext(aiJS,env);
  return {ask:(q)=>window.VettiAI.ask({message:q},ctx,{timeoutMs:1500}),requests};
}
const response=(hint='none', time='none', ambiguous=false)=>({
  service_hint:hint, service_ambiguous:ambiguous, time_preference:time,
  source:'rule', requires_confirmation:true, booking_created:false
});

// Extract functions without loading the DOM-heavy full portal JS.
function section(start, stop) {
  const begin=portalJS.indexOf(start);
  const end=portalJS.indexOf(stop,begin);
  if(begin<0 || end<0) throw new Error(`Missing portal section ${start}`);
  return portalJS.slice(begin,end);
}
function select(values=['']) {
  let options=values.map(v=>({value:v}));
  let value='';
  return {
    get value(){return value;}, set value(v){value=String(v);},
    get options(){return options;},
    get innerHTML(){return ''}, set innerHTML(html){
      options=[...String(html).matchAll(/<option value="([^"]*)">/g)].map(x=>({value:x[1]}));
      value=options.length?options[0].value:'';
    }
  };
}

(async()=>{
  const first=harness(response('grooming','none'));
  const a=await first.ask('Book Bornok for grooming tomorrow at 3:00 PM');
  assert.equal(a.action,'openBooking');
  assert.equal(a.bookingContext.petId,'7');
  assert.equal(a.bookingContext.serviceId,'cat_grooming');
  assert.equal(a.bookingContext.preferredDate,day(tomorrow));
  assert.equal(a.bookingContext.preferredTime,'3:00 PM');
  assert.equal(first.requests[1].url,'/api/ai/booking-intent');
  assert.deepEqual(Object.keys(JSON.parse(first.requests[1].options.body)),['message']);

  const washing=harness(response('grooming','none'));
  const b=await washing.ask('Book Bornok to get washed tomorrow');
  assert.equal(b.bookingContext.petId,'7');
  assert.equal(b.bookingContext.serviceId,'cat_grooming');
  assert.equal(b.bookingContext.preferredDate,day(tomorrow));

  const conflict=harness(response('none','none',true));
  const c=await conflict.ask('Book grooming and vaccination tomorrow');
  assert.notEqual(c.action,'openBooking');
  assert.ok(!c.bookingContext || !c.bookingContext.serviceId);
  assert.match(c.text,/multiple requested services|more than one service/i);

  const outage=harness(response(),{fail:true});
  const d=await outage.ask('Book grooming and vaccination tomorrow');
  assert.notEqual(d.action,'openBooking');
  assert.ok(!d.bookingContext || !d.bookingContext.serviceId);

  // UI prefill: actual dropdown expects canonical service VALUE, not 22.
  const petSelect=select(['','7']);
  const svcSelect=select(['','dog_grooming','cat_grooming','vaccination']);
  const dateInput={value:'',min:day(new Date()),max:day(new Date(Date.now()+30*86400000))};
  const timeSelect=select(['']);
  const refs={pet_id:petSelect,service_id:svcSelect,appointment_date:dateInput,time_slot:timeSelect};
  const browser={SharedMockUsers:{
    serviceByValue:(v)=>catalog.find(s=>s.value===v)||null,
    serviceById:(id)=>catalog.find(s=>String(s.serviceId)===String(id))||null
  }};
  const sandbox={
    document:{getElementById:(id)=>refs[id]||null},window:browser,
    Date,Promise, String,
    _filterPastSlots:(slots)=>slots,
    _smartSchedulingSlots:async()=>['10:00 AM','3:00 PM'],
    _bookSlotsToken:0,_pendingHandoffTime:'3:00 PM'
  };
  vm.createContext(sandbox);
  const refresh=section('function _refreshBookSlots() {', '\n\n\n/*');
  vm.runInContext('var _bookSlotsToken=0; var _pendingHandoffTime="3:00 PM";\n'+
    section('function _hasSelectOption(', '// ─── WIZARD NAVIGATION')+refresh,sandbox);
  vm.runInContext('_prefillBookingFields({pet:{petId:7}, bookingContext:'+JSON.stringify(a.bookingContext)+'}, '+JSON.stringify(a.bookingContext)+');',sandbox);
  assert.equal(petSelect.value,'7');
  assert.equal(svcSelect.value,'cat_grooming');
  assert.equal(dateInput.value,day(tomorrow));
  // Availability is async and must offer the exact requested 3PM.
  vm.runInContext('_refreshBookSlots()',sandbox);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(timeSelect.value,'3:00 PM');
  assert.equal(vm.runInContext('_pendingHandoffTime',sandbox),null);

  // For ambiguous/unselected service, preserve exact preferred time until
  // the user manually chooses the service and its real slots are fetched.
  svcSelect.value='';
  timeSelect.value='';
  vm.runInContext('_pendingHandoffTime="3:00 PM"; _refreshBookSlots()',sandbox);
  assert.equal(vm.runInContext('_pendingHandoffTime',sandbox),'3:00 PM');
  assert.equal(timeSelect.options[0].value,'');
  svcSelect.value='cat_grooming';
  vm.runInContext('_refreshBookSlots()',sandbox);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(timeSelect.value,'3:00 PM');

  // Requested time must remain unselected when the API did NOT offer it.
  timeSelect.value='';
  sandbox._smartSchedulingSlots=async()=>['10:00 AM'];
  vm.runInContext('_pendingHandoffTime="3:00 PM"; _refreshBookSlots()',sandbox);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(timeSelect.value,'');
  assert.equal(vm.runInContext('_pendingHandoffTime',sandbox),null);

  console.log('PASS: Phase 4 browser corrective — cat grooming selection, canonical service values, pet/date/exact time, ambiguous service veto, offline fallback, real-slot-only preselection and async service selection.');
})().catch(e=>{console.error(e);process.exitCode=1});
