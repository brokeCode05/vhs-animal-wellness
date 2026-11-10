'use strict';
(function(){
 const msg=document.getElementById('message'), req=document.getElementById('request'), confirm=document.getElementById('confirm');
 async function post(path,body){
  const tokenResponse=await fetch('/api/auth/csrf',{credentials:'same-origin',headers:{Accept:'application/json'}});
  if(!tokenResponse.ok) throw Error('Could not start a secure session. Please try again.');
  const token=(await tokenResponse.json()).data.csrf_token;
  const response=await fetch('/api/auth/'+path,{method:'POST',credentials:'same-origin',headers:{Accept:'application/json','Content-Type':'application/json','X-CSRF-TOKEN':token},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.success) throw Error([data.message||'Request failed. Please try again.',...Object.values(data.errors||{}).flat()].join('\n'));
  return data;
 }
 function handle(form,fn){form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;msg.textContent='Please wait…';try{await fn(Object.fromEntries(new FormData(form)));}catch(err){msg.textContent=err.message||'Could not connect. Please try again.';}finally{b.disabled=false;}});}
 handle(req,async data=>{const r=await post('password-reset',data);msg.textContent=r.message;confirm.elements.email.value=data.email;confirm.elements.code.focus();});
 handle(confirm,async data=>{if(data.password!==data.password_confirmation)throw Error('Passwords do not match.');const r=await post('password-reset/confirm',data);msg.textContent=r.message;confirm.reset();});
})();
