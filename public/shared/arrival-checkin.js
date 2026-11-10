/* Reception-only OTP proof. No portal login, appointment creation or AI requests. */
(function(){
 'use strict';
 var get=function(id){return document.getElementById(id);};
 var contactForm=get('arrivalContactForm'),codeForm=get('arrivalCodeForm'),choices=get('arrivalChoices'),result=get('arrivalResult');
 var busy=false,requestId=null,pendingId=null,retryAction=null,csrf=document.querySelector('meta[name="csrf-token"]').content,channels={},countdown=null;
 function status(text){get('arrivalStatus').textContent=text;}
 function retry(action){retryAction=action;get('arrivalRetry').hidden=!action;}
 function lock(value){busy=value;get('arrivalSend').disabled=value || (!channels.email && !channels.sms);get('arrivalVerify').disabled=value;}
 async function request(path,body,retried){
   var response=await fetch('/api/arrival/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-TOKEN':csrf},body:body===undefined?undefined:JSON.stringify(body)});
   if(response.status===419 && !retried){var fresh=await fetch('/api/auth/csrf',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});var token=await fresh.json();csrf=token.data.csrf_token;return request(path,body,true);}
   var data=await response.json().catch(function(){return null;});
   if(!response.ok || !data || data.success!==true){var message=data && data.message || 'Check-in could not be verified. Retry or ask reception.';if(data && data.errors){var key=Object.keys(data.errors)[0];if(key)message=data.errors[key][0];}var error=new Error(message);error.status=response.status;throw error;}
   return data.data;
 }
 function contactMode(){var sms=get('arrivalSms').checked;get('arrivalContactLabel').textContent=sms?'Registered mobile number':'Registered email address';var input=get('arrivalContact');input.type=sms?'tel':'email';input.autocomplete=sms?'tel':'email';input.placeholder=sms?'09xxxxxxxxx':'you@example.com';}
 function startCountdown(seconds){clearInterval(countdown);var left=Math.max(0,Number(seconds)||0);function tick(){get('arrivalResend').disabled=left>0;get('arrivalResend').textContent=left>0?'New code in '+left+'s':'Send a new code';left--;}tick();countdown=setInterval(function(){tick();if(left<0)clearInterval(countdown);},1000);}
 function showCode(seconds){contactForm.hidden=true;codeForm.hidden=false;choices.hidden=true;get('arrivalCode').value='';startCountdown(seconds);get('arrivalCode').focus();}
 function complete(a){clearInterval(countdown);contactForm.hidden=true;codeForm.hidden=true;choices.hidden=true;result.hidden=false;result.textContent='You are checked in. '+a.petName+' · Reference '+a.referenceNo+'. Please wait for reception to call you.';result.className='success';status('Check-in confirmed');retry(null);pendingId=null;}
 async function checkIn(id){
   if(busy)return;lock(true);pendingId=id;retry(null);status('Saving your check-in…');
   try{var data=await request('check-in/'+encodeURIComponent(id),{});complete(data.appointment);}
   catch(e){status(e.message);retry(function(){checkIn(id);});}
   finally{lock(false);}
 }
 async function loadVisits(){
   retry(null);status('Checking your appointments…');
   try{var data=await request('appointments');if(data.last_checkin){complete(data.last_checkin);return;}
     var list=data.appointments||[];codeForm.hidden=true;contactForm.hidden=true;
     if(!list.length){status('No eligible confirmed appointment was found. Check-in opens two hours before today’s visit. If you already checked in, ask reception to confirm.');return;}
     if(list.length===1){await checkIn(list[0].id);return;}
     status('Choose the appointment you are arriving for.');choices.replaceChildren();choices.hidden=false;
     list.forEach(function(a){var button=document.createElement('button');button.type='button';button.className='choice';button.textContent=a.petName+' · '+a.service+' · '+a.time+' · '+a.referenceNo;button.addEventListener('click',function(){checkIn(a.id);});choices.appendChild(button);});
   }catch(e){status(e.message);retry(loadVisits);}
 }
 async function init(){
   retry(null);
   try{var data=await request('options');channels=data.channels||{};get('arrivalEmail').disabled=!channels.email;get('arrivalSms').disabled=!channels.sms;
     if(data.verified){await loadVisits();return;}
     if(data.pending){requestId=data.pending.request_id;showCode(data.resend_seconds);status('Enter the code sent to your '+(data.pending.channel==='sms'?'mobile number':'email')+'.');return;}
     contactForm.hidden=false;codeForm.hidden=true;result.hidden=true;
     if(!channels.email && channels.sms){get('arrivalEmail').checked=false;get('arrivalSms').checked=true;}
     if(channels.email && !channels.sms){get('arrivalEmail').checked=true;get('arrivalSms').checked=false;}
     contactMode();get('channelNote').textContent=!channels.sms?'SMS is currently unavailable. Please choose email.':(!channels.email?'Email is currently unavailable. Please choose SMS.':'');
     status(channels.email||channels.sms?'Choose where to receive your code.':'Code delivery is unavailable. Please ask reception for manual check-in.');lock(false);
   }catch(e){status(e.message);if(e.status>=500 || !e.status)retry(init);}
 }
 async function sendCode(resend){
   if(busy)return;lock(true);retry(null);status('Requesting your code…');
   try{var data=await request(resend?'resend-code':'request-code',resend?{}:{channel:get('arrivalSms').checked?'sms':'email',identifier:get('arrivalContact').value.trim()});requestId=data.request_id;showCode(data.resend_seconds);status('If this matches a verified client contact, a code has been sent. Enter it below.');}
   catch(e){status(e.message);if(!e.status)retry(init);}
   finally{lock(false);}
 }
 contactForm.addEventListener('submit',function(e){e.preventDefault();sendCode(false);});
 codeForm.addEventListener('submit',async function(e){e.preventDefault();if(busy)return;lock(true);retry(null);status('Verifying your code…');
   var verified=false;
   try{await request('verify-code',{request_id:requestId,code:get('arrivalCode').value.trim()});verified=true;}
   catch(e){status(e.message);if(!e.status){retry(init);}}
   finally{lock(false);}
   if(verified)await loadVisits();
 });
 get('arrivalResend').addEventListener('click',function(){sendCode(true);});
 get('arrivalChange').addEventListener('click',function(){if(busy)return;codeForm.hidden=true;contactForm.hidden=false;retry(null);status('Choose a contact to receive a new code.');get('arrivalContact').focus();});
 get('arrivalRetry').addEventListener('click',function(){if(retryAction && !busy)retryAction();});
 get('arrivalEmail').addEventListener('change',contactMode);get('arrivalSms').addEventListener('change',contactMode);
 init();
})();
