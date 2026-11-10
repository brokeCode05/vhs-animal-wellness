'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const calls=[];
const w={location:{pathname:'/user/index.html'}, setTimeout,clearTimeout,console,fetch:async(url,opt)=>{
 if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fixture'}})};
 if(url==='/api/ai/booking-intent') {calls.push({url,payload:JSON.parse(opt.body)});return {ok:true,json:async()=>({success:true,data:{booking_created:false,requires_confirmation:true,source:'rule',service_hint:'none',time_preference:'none',service_ambiguous:false}})};}
 if(url==='/api/ai/vetti') {
 const payload=JSON.parse(opt.body);calls.push({url,payload});
 // The authenticated backend owns prices and service answers, even in the
 // compatibility route. These explicit fictional replies are fixture data.
 const text=/grooming.*pusa/i.test(payload.message)?'Cat Grooming: PHP 100 to 800.':/grooming.*aso/i.test(payload.message)?'Dog Grooming: PHP 100 to 1200.':'Safe public clinic information.';
 return {ok:true,json:async()=>({success:true,data:{text,state:'idle',source:'rule',intent:'general'}})};
}
 throw Error('unexpected network request: '+url);
}};w.window=w;
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),{window:w,Date,Promise,setTimeout,clearTimeout,console},{filename:f});
// Exercise offline dialogue explicitly; active server contracts have separate tests.
// Keep the legacy authenticated wrapper: this suite covers its compatibility behavior.
const pets=[{petId:11,name:'Luna',species:'Dog'},{petId:12,name:'Bornok',species:'Cat'}];
const services=[{serviceId:22,value:'vaccination',label:'Vaccination',active:true},{serviceId:23,value:'cat_grooming',label:'Cat Grooming',price:'₱100 – ₱800',active:true},{serviceId:24,value:'dog_grooming',label:'Dog Grooming',price:'₱100 – ₱1200',active:true}];
const ctx={pets,services,activePet:null,hasPets:true,appointments:{upcoming:[],past:[]},serviceGroups:[],suggestionsWithPet:[],suggestionsNoPet:[],responseLanguage:'taglish'};
const ask=async(q)=>{let a=await w.VettiAI.ask(q,ctx);w.VettiAI.recordTurn('user',q);w.VettiAI.recordTurn('vetti',a.text||'');return a;};
(async()=>{
 let r=await ask('gusto kong i book si luna');assert.equal(r.action,'openBooking');assert.equal(String(r.bookingContext.petId),'11');assert.ok(!r.bookingContext.serviceId);
 r=await ask('para sa vaccine');assert.equal(r.action,'openBooking');assert.equal(String(r.bookingContext.petId),'11');assert.equal(r.bookingContext.serviceId,'vaccination');assert.match(r.text,/No appointment has been made/);assert.match(r.text,/veterinarian must confirm/i);
 r=await ask('bukas ng hapon');assert.equal(r.action,'openBooking');assert.equal(String(r.bookingContext.petId),'11');assert.equal(r.bookingContext.serviceId,'vaccination');assert.match(r.text,/afternoon preference/);assert.match(r.text,/Date: \d{4}-\d{2}-\d{2}/);
 r=await ask('what about tomorrow?');assert.equal(r.action,'openBooking');assert.equal(String(r.bookingContext.petId),'11');assert.equal(r.bookingContext.serviceId,'vaccination');
 // A different topic resets the pending booking; no accidental resume.
 r=await ask('where is the clinic?');assert.notEqual(r.action,'openBooking');
 r=await ask('para sa vaccine');assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('Can you explain what happens during a consultation?');assert.match(r.text,/clinic information/i);assert.notEqual(r.action,'openBooking');
 r=await ask('What should I bring?');assert.match(r.text,/records|clinic information/i);assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('Tell me about vaccination, my dog has pain');assert.notEqual(r.id,'service_information');assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('I work late on weekdays; can I arrange a clinic visit another way?');assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('book an appointment for Luna');assert.equal(r.action,'openBooking');
 r=await ask('Never mind, I am only asking for information.');assert.equal(r.id,'action_opt_out');assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('Magkano ang grooming para sa pusa?');assert.match(r.text,/Cat Grooming.*800/);assert.notEqual(r.action,'openBooking');
 r=await ask('Magkano ang grooming para sa aso?');assert.match(r.text,/Dog Grooming.*1200/);
 w.VettiAI.clearHistory();
 // The remaining cases verify the retained offline language and policy replies.
 w.VettiAI.resetProvider();
 r=await ask('Kumusta ka Vetti?');assert.equal(r.id,'tagalog_greeting');assert.match(r.text,/Kumusta/);
 r=await ask('Anong oras kayo bukas?');assert.equal(r.id,'clinic_info');assert.match(r.text,/Hindi ko makumpirma/);
 r=await ask('Gusto ko ipa-groom si Bornok bukas ng hapon');assert.equal(r.action,'openBooking');
 r=await ask('Ay wag na pala');assert.equal(r.id,'action_opt_out');assert.notEqual(r.action,'openBooking');assert.match(r.text,/Walang appointment/);
 r=await ask('bukas');assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('Ano ang mangyayari sa checkup?');assert.equal(r.id,'consultation_information');assert.match(r.text,/beterinaryo/i);
 r=await ask('Ano ang dadalhin ko?');assert.equal(r.id,'visit_preparation');assert.match(r.text,/Dalhin/);
 w.VettiAI.clearHistory();
 r=await ask('Kailan ang susunod kong appointment?');assert.notEqual(r.action,'openBooking');
 r=await ask('Paano ko ito ililipat sa ibang araw?');assert.equal(r.id,'appointment_change_help');assert.match(r.text,/Reschedule/);assert.notEqual(r.action,'openBooking');
 r=await ask('Paano ko kakanselahin ang appointment ko?');assert.equal(r.id,'appointment_change_help');assert.match(r.text,/Cancel/);assert.notEqual(r.action,'openBooking');
 w.VettiAI.clearHistory();
 r=await ask('Pwede ba akong mag walk in?');assert.equal(r.id,'walk_in_policy');assert.match(r.text,/Hindi ko makumpirma/);assert.equal(r.action,'');
 r=await ask('May bayad ba kapag kinansela ang appointment?');assert.equal(r.id,'appointment_change_help');assert.match(r.text,/Hindi ko makumpirma/);assert.equal(r.action,'');
 r=await ask('Bukas ba ang clinic tuwing Linggo?');assert.equal(r.id,'clinic_info');assert.match(r.text,/Hindi ko makumpirma/);assert.equal(r.action,'');
 r=await ask('Pwede ba akong mag walk in? Nahihirapan huminga ang aso');assert.equal(r.id,'urgent_safety');
 r=await ask('Do you accept GCash?');assert.equal(r.id,'payment_policy');assert.match(r.text,/cannot verify/i);assert.equal(r.action,'');
 r=await ask('What if I am late for my appointment?');assert.equal(r.id,'late_visit_guidance');assert.match(r.text,/arrive late/i);assert.equal(r.action,'');
 r=await ask('Mahuhuli ako sa appointment ko');assert.equal(r.id,'late_visit_guidance');assert.match(r.text,/tawagan/i);assert.equal(r.action,'');
 w.VettiAI.clearHistory();
 r=await ask('Bukas ba ang clinic tuwing Linggo?');assert.match(r.text,/Hindi ko makumpirma/);
 r=await ask('Translate that to English');assert.equal(r.id,'clinic_translation');assert.match(r.text,/cannot verify.*Sundays/i);assert.equal(r.action,'');
 r=await ask('Translate that to Tagalog');assert.equal(r.id,'clinic_translation');assert.match(r.text,/Linggo/);
 w.VettiAI.clearHistory();
 r=await ask('Translate that to English');assert.equal(r.id,'translation_unavailable');assert.equal(r.action,'');
 w.VettiAI.clearHistory();
 r=await ask('gusto kong i book si luna');assert.equal(r.action,'openBooking');
 r=await ask('para sa vaccine at cat grooming');assert.notEqual(r.action,'openBooking');assert.match(r.text,/more than one/i);
 w.VettiAI.clearHistory();
 // Offline mode leaves a loosely phrased medical service for selection in the form.
 r=await ask('pwede ko bang i pa vaccine si luna?');assert.equal(r.action,'openBooking');assert.equal(String(r.bookingContext.petId),'11');assert.ok(!r.bookingContext.serviceId);
 w.VettiAI.clearHistory();
 r=await ask('gusto kong i book si luna');assert.equal(r.action,'openBooking');
 r=await ask('cancel');assert.notEqual(r.action,'openBooking');
 r=await ask('para sa vaccine');assert.notEqual(r.action,'openBooking');
 for(const c of calls) {
   assert.equal(Object.hasOwn(c.payload,'pets'),false);assert.equal(Object.hasOwn(c.payload,'conversation'),false);
 }
 console.log('PASS: 11 integrated dialogue flows, booking confirmation boundary and no private provider history');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
