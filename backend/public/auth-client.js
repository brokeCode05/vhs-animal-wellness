(() => {
'use strict';
let csrf=document.querySelector('meta[name="csrf-token"]').content;
const el=id=>document.getElementById(id);
function message(text,error=false){el('message').textContent=text;el('message').classList.toggle('error',error);}
async function request(path,data){
 const response=await fetch('/api/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-TOKEN':csrf},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();
 if(!response.ok || !result.success) throw new Error(result.message+'\n'+Object.values(result.errors||{}).flat().join('\n'));
 return result;
}
async function refreshCsrf(){csrf=(await request('auth/csrf')).data.csrf_token;}
function values(form){return Object.fromEntries(new FormData(form));}
function verification(identifier,channel,context){const f=el('verify');f.elements.identifier.value=identifier;f.elements.channel.value=channel;f.elements.context.value=context;f.elements.code.value='';el('verify-card').scrollIntoView({behavior:'smooth',block:'center'});}
async function current(){try{const r=await request('auth/me');el('identity').textContent=r.data.user.name+' • '+r.data.user.role+' • '+r.data.user.email;el('account').hidden=false;}catch{el('account').hidden=true;}}
function form(id,action){const f=el(id);f.addEventListener('submit',async e=>{e.preventDefault();const buttons=[...f.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await action(values(f));}catch(error){message(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}});}
function button(id,action){el(id).addEventListener('click',async()=>{el(id).disabled=true;try{await action();}catch(error){message(error.message,true);}finally{el(id).disabled=false;}});}
el('register').elements.verification_method.addEventListener('change',e=>{el('signup-sms').hidden=e.target.value!=='sms';el('register').elements.otp_code.required=e.target.value==='sms';});
button('send-signup-sms',async()=>{const phone=el('register').elements.phone.value;message((await request('auth/resend-otp',{identifier:phone,channel:'sms',context:'registration'})).message);});
form('register',async data=>{data.terms_accepted=data.terms_accepted==='1';if(data.verification_method!=='sms')delete data.otp_code;const r=await request('auth/register',data);message(r.message);el('login').elements.email.value=data.email;if(r.data.requires_verification)verification(data.email,'email','registration');el('register').elements.password.value='';el('register').elements.password_confirmation.value='';});
form('login',async data=>{if(!data.channel)delete data.channel;const r=await request('auth/login',data);message(r.message);if(r.data.otp_required)verification(r.data.identifier,r.data.channel,'login');else{await refreshCsrf();await current();}el('login').elements.password.value='';});
form('verify',async data=>{const r=await request('auth/verify-otp',data);message(r.message);el('verify').elements.code.value='';await refreshCsrf();await current();});
button('resend',async()=>{const data=values(el('verify'));delete data.code;message((await request('auth/resend-otp',data)).message);});
form('reset-request',async data=>{message((await request('auth/password-reset',data)).message);el('reset-confirm').elements.email.value=data.email;});
form('reset-confirm',async data=>{message((await request('auth/password-reset/confirm',data)).message);el('reset-confirm').reset();await refreshCsrf();await current();});
button('logout',async()=>{message((await request('auth/logout',{})).message);await refreshCsrf();await current();});
current();
})();
