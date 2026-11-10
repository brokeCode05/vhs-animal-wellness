'use strict';
// Frontend routing test: provider calls are mocked; no live Gemini or browser.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const calls = [];
let failure = false;
let bookingReply = false;
let petResponse = null;
const win = {
  VHS_SEMANTIC_VETTI: true, location: {pathname:'/user/'}, setTimeout, clearTimeout,
  VettiState: {isState: () => true, resolve: () => ({id:'legacy', state:'idle', text:'legacy response', suggestions:[]})},
  fetch: async (url, options) => {
    if (url === '/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'test'}})};
    calls.push({url, body:JSON.parse(options.body)});
    if (failure) throw new Error('offline');
    const data = petResponse || (bookingReply
      ? {mode:'semantic',kind:'booking_proposal',booking_created:false,requires_confirmation:true,pet_id:7,preferred_date:'2026-11-03',service_hint:'vaccination',service_value:'vaccination',time_preference:'afternoon',text:'Synthetic proposal for review.'}
      : {mode:'semantic',kind:'information',state:'idle',text:'Gemini response'});
    return {ok:true,json:async()=>({success:true,data})};
  }
};
win.window = win;
new Function('window', fs.readFileSync('public/user/vetti-ai.js','utf8'))(win);
(async () => {
  const phrases = ['Translate that to English', 'Ano na ulit yung booking details?', 'May grooming ba kayo?', 'How much is it?', 'Paano ko ito ililipat sa ibang araw?', 'I want to book Luna tomorrow'];
  for (const message of phrases) {
    const result = await win.VettiAI.ask(message, {});
    assert.strictEqual(result.text, 'Gemini response');
    assert.strictEqual(calls.at(-1).url, '/api/ai/semantic-vetti');
    assert.strictEqual(calls.at(-1).body.message, message);
  }
  failure = true;
  const failed = await win.VettiAI.ask('What services do you offer?', {});
  assert.strictEqual(failed.id,'semantic_unavailable');
  assert.match(failed.text, /could not process/i);
  assert.strictEqual(calls.length, phrases.length + 1);
  failure = false; bookingReply = true;
  const ctx = {pets:[{id:7,name:'Luna'}], services:[{serviceId:22,value:'vaccination',label:'Vaccination',active:true}]};
  const proposal = await win.VettiAI.ask('Book Luna for vaccination', ctx);
  assert.strictEqual(proposal.action, 'openBooking');
  assert.strictEqual(proposal.bookingContext.petId, '7');
  assert.strictEqual(proposal.bookingContext.serviceId, 'vaccination');
  failure = true;
  const outage = await win.VettiAI.ask('And what about another time?', ctx);
  assert.strictEqual(outage.id, 'semantic_unavailable');
  assert.ok(!outage.action);
  let availabilityCall;
  win.VHSReads = {availability: async params => { availabilityCall=params; return {ok:true,data:{date:params.date,service:{serviceId:22},slots:['09:00','13:00','16:00']}}; }};
  const slots = await win.VettiAI.ask('Check available slots', ctx);
  assert.strictEqual(availabilityCall.date, '2026-11-03');
  assert.match(slots.text, /1:00 PM, 4:00 PM/);
  assert.doesNotMatch(slots.text, /09:00/);
  assert.match(slots.text, /No appointment has been made/);
  failure = false; bookingReply = false;
  petResponse = {mode:'semantic',kind:'pets_list',state:'idle',text:'Here are your pets.',pet_ids:[7]};
  const petResult = await win.VettiAI.ask('Ipakita ang mga alaga ko', ctx);
  assert.strictEqual(petResult.petCards.length, 1);
  assert.strictEqual(petResult.petCards[0].name, 'Luna');
  petResponse.pet_ids = [999];
  const unauthorized = await win.VettiAI.ask('Show my pets', ctx);
  assert.strictEqual(unauthorized.id, 'semantic_unavailable');
  assert.ok(!unauthorized.petCards);
  petResponse.pet_ids = []; petResponse.text = 'No registered pets were found.';
  const empty = await win.VettiAI.ask('Show my pets', ctx);
  assert.strictEqual(empty.text, 'No registered pets were found.');
  assert.ok(!empty.petCards);
  petResponse = {mode:'semantic',kind:'booking_alternatives',reason:'time_unavailable',state:'reminder',text:'That time is unavailable; another time may work.',proposal_pending:true};
  const alternate = await win.VettiAI.ask('How about another time?', ctx);
  assert.strictEqual(alternate.availabilityNotice,'time_unavailable');
  assert.strictEqual(alternate.serverPending,true);
  assert.ok(!alternate.action);
  petResponse.reason='no_slots';
  const none = await win.VettiAI.ask('Any other times?', ctx);
  assert.strictEqual(none.availabilityNotice,'no_slots');
  assert.ok(!none.action);
  petResponse.reason='unexpected';
  assert.strictEqual((await win.VettiAI.ask('Any time?',ctx)).id,'semantic_unavailable');
  // A malformed response must not echo the backend's anonymized pet markers.
  petResponse = {mode:'semantic',kind:'information',state:'idle',text:'PET_SELECTED may be exposed.'};
  const aliasInfo = await win.VettiAI.ask('Where is the clinic?', ctx);
  assert.strictEqual(aliasInfo.id, 'semantic_unavailable');
  assert.ok(!aliasInfo.action);
  petResponse = {mode:'semantic',kind:'booking_proposal',booking_created:false,requires_confirmation:true,
    pet_id:7,preferred_date:'2026-11-03',service_hint:'vaccination',service_value:'vaccination',
    time_preference:'afternoon',text:'PET_1 requested a booking.'};
  const aliasBooking = await win.VettiAI.ask('Book my pet',ctx);
  assert.strictEqual(aliasBooking.id, 'semantic_unavailable');
  assert.ok(!aliasBooking.action);
  // Routing matrix: mixed-language follow-ups must reach Gemini's semantic
  // endpoint verbatim rather than being classified by local keyword responses.
  petResponse = {mode:'semantic',kind:'information',state:'idle',text:'Synthetic verified reply.'};
  const matrix = [
    'How much is cat grooming?', 'Magkano po ang cat grooming?', 'Can I book my pet?',
    'Bukas po', '3 PM na lang', 'Actually, 4 PM', 'Si Luna po',
    'What about vaccination?', 'Paano kung next week?', 'Can you repeat that?',
    'How about a different date?', 'Hindi, iba pong pet',
    'I would like to change the time', 'Show my pets please',
    'What if there are no slots?', 'No, do not confirm yet',
    'May appointment ba bukas?', 'Could you explain in Taglish?'
  ];
  const firstIndex = calls.length;
  const routed = await Promise.all(matrix.map(message => win.VettiAI.ask(message,ctx)));
  routed.forEach((reply, i) => {
    assert.strictEqual(reply.text,'Synthetic verified reply.');
    assert.strictEqual(reply.action,undefined);
    assert.strictEqual(calls[firstIndex+i].url,'/api/ai/semantic-vetti');
    assert.strictEqual(calls[firstIndex+i].body.message,matrix[i]);
    assert.deepStrictEqual(Object.keys(calls[firstIndex+i].body).sort(),['conversation_id','message']);
  });
  assert.strictEqual(new Set(calls.slice(firstIndex).map(c=>c.body.conversation_id)).size,1);
  // Recovery is retryable after one modeled transport failure.
  failure = true;
  assert.strictEqual((await win.VettiAI.ask('Bukas po',ctx)).id,'semantic_unavailable');
  failure = false;
  assert.strictEqual((await win.VettiAI.ask('Bukas po',ctx)).text,'Synthetic verified reply.');
  console.log('PASS: semantic routing, simulated outage/recovery, owner scope, unavailable slots, alias rejection, and 18 mixed-language concurrent frontend calls.');
})().catch(error => { console.error(error); process.exitCode=1; });


