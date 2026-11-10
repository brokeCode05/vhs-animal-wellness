const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/shared/arrival-checkin.js','utf8');
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function screen({multiple=false,failCheckIn=false,lostRequest=false,sms=true}={}){
 const nodes={},calls=[];let verified=false,pending=false,checked=false,csrfRecovered=false;
 function node(id){return nodes[id]??=( {id,hidden:['arrivalContactForm','arrivalCodeForm','arrivalChoices','arrivalResult','arrivalRetry'].includes(id),value:'',checked:id==='arrivalEmail',disabled:false,textContent:'',handlers:{},children:[],addEventListener(n,f){this.handlers[n]=f;},focus(){},appendChild(n){this.children.push(n);},replaceChildren(){this.children=[];}});}
 ['arrivalStatus','arrivalContactForm','arrivalCodeForm','arrivalChoices','arrivalResult','arrivalEmail','arrivalSms','arrivalContactLabel','arrivalContact','arrivalCode','arrivalSend','arrivalVerify','arrivalResend','arrivalChange','arrivalRetry','channelNote'].forEach(node);
 const visit={id:11,referenceNo:'FICTIONAL-11',petName:'<img onerror=bad>',service:'Consultation',time:'11:00',status:'confirmed'};
 const fetch=async(url,init={})=>{
  const body=init.body?JSON.parse(init.body):undefined;calls.push({url,body});
  const ok=data=>({ok:true,status:200,json:async()=>({success:true,data})});
  if(url==='/api/auth/csrf'){csrfRecovered=true;return ok({csrf_token:'renewed'});}
  if(url.endsWith('/options'))return ok({channels:{email:true,sms},verified,pending:pending?{request_id:'a'.repeat(32),channel:'email'}:null,resend_seconds:0});
  if(url.endsWith('/request-code')){pending=true;if(lostRequest){lostRequest=false;throw Error('Connection interrupted');}return ok({request_id:'a'.repeat(32),resend_seconds:0});}
  if(url.endsWith('/verify-code')){verified=true;return ok({verified:true});}
  if(url.endsWith('/appointments'))return ok({appointments:multiple?[visit,{...visit,id:12,petName:'Other fictional pet'}]:[visit]});
  if(url.endsWith('/check-in/11')||url.endsWith('/check-in/12')){
   if(!csrfRecovered)return {ok:false,status:419,json:async()=>({message:'CSRF expired'})};
   if(failCheckIn){failCheckIn=false;checked=true;throw Error('Response interrupted');}
   checked=true;return ok({appointment:{...visit,status:'checked_in'}});
  }
  throw Error('Unexpected test URL '+url);
 };
 vm.runInNewContext(source,{document:{getElementById:node,querySelector:()=>({content:'initial'}),createElement:()=>({textContent:'',addEventListener(n,f){this.click=f;}})},fetch,setInterval:()=>1,clearInterval(){},console});
 await settle();return {nodes,calls,submit:async id=>{await node(id).handlers.submit({preventDefault(){}});await settle();},click:async id=>{await node(id).handlers.click();await settle();},get checked(){return checked;}};
}
(async()=>{
 let h=await screen();h.nodes.arrivalContact.value='fictional@example.test';await h.submit('arrivalContactForm');assert.equal(h.nodes.arrivalCodeForm.hidden,false);h.nodes.arrivalCode.value='001234';await h.submit('arrivalCodeForm');assert.equal(h.nodes.arrivalResult.hidden,false);assert.match(h.nodes.arrivalResult.textContent,/You are checked in/);assert.ok(h.calls.some(c=>c.url==='/api/auth/csrf'));assert.equal(h.calls.filter(c=>c.url.endsWith('/request-code')).length,1);
 h=await screen({multiple:true});h.nodes.arrivalContact.value='fictional@example.test';await h.submit('arrivalContactForm');await h.submit('arrivalCodeForm');assert.equal(h.nodes.arrivalChoices.children.length,2);assert.equal(h.checked,false,'Multiple visits require an explicit selection');assert.equal(h.nodes.arrivalChoices.children[0].textContent.includes('<img onerror=bad>'),true,'Source text stays textContent');await h.nodes.arrivalChoices.children[1].click();await settle();assert.ok(h.calls.some(c=>c.url.endsWith('/check-in/12')));
 h=await screen({failCheckIn:true});h.nodes.arrivalContact.value='fictional@example.test';await h.submit('arrivalContactForm');await h.submit('arrivalCodeForm');assert.equal(h.nodes.arrivalResult.hidden,true,'A lost response must not claim success');assert.equal(h.nodes.arrivalRetry.hidden,false);await h.click('arrivalRetry');assert.equal(h.nodes.arrivalResult.hidden,false);
 h=await screen({lostRequest:true});h.nodes.arrivalContact.value='fictional@example.test';await h.submit('arrivalContactForm');assert.equal(h.nodes.arrivalRetry.hidden,false);await h.click('arrivalRetry');assert.equal(h.nodes.arrivalCodeForm.hidden,false);assert.equal(h.calls.filter(c=>c.url.endsWith('/request-code')).length,1,'Recover the pending code without another message');
 h=await screen({sms:false});assert.equal(h.nodes.arrivalSms.disabled,true);assert.match(h.nodes.channelNote.textContent,/SMS is currently unavailable/);
 h=await screen();h.nodes.arrivalEmail.checked=false;h.nodes.arrivalSms.checked=true;h.nodes.arrivalContact.value='09170000001';await h.submit('arrivalContactForm');assert.equal(h.calls.find(c=>c.url.endsWith('/request-code')).body.channel,'sms');
 console.log('PASS: email/SMS choices, automatic single visit, explicit multiple selection, CSRF refresh, lost-request recovery, interrupted check-in retry, unavailable SMS and safe text rendering.');
})().catch(e=>{console.error(e);process.exitCode=1;});
