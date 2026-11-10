// Contract tests using the real scripts in a Node VM, not a browser or live server.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const settle=()=>new Promise(r=>setImmediate(r));
async function qr({items=[{id:1,referenceNo:'FICTIONAL-1',pet_name:'Fictional Pet'}],fail=false,status=200,search='?clinic-checkin=1'}={}) {
 const calls=[],events={},body={innerHTML:''},classes=new Set(),storage=new Map();let failures=fail?1:0;
 const w={VHSAuth:{me:async()=>({id:1,role:'User'}),send:async(path)=>{
  calls.push(path);if(path==='check-in/appointments')return {ok:status===200,status,message:'Expired reception QR',data:{appointments:items}};
  if(failures-- >0)throw Error('interrupted response');return {ok:true,data:{appointment:items[0]}};
 }},loadUserAppointments(){}};
 const document={readyState:'complete',getElementById:id=>id==='checkinBody'?body:id==='checkinOverlay'?{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}:null,addEventListener:(n,f)=>events[n]=f};
 vm.runInNewContext(read('public/user/checkin-script.js'),{window:w,document,location:{search,pathname:'/user/'},URLSearchParams,history:{replaceState(){}},sessionStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 await settle();await settle();
 return {calls,body,classes,click:async(kind,id)=>{events.click({target:{closest:q=>q===kind?{getAttribute:()=>id}:null}});await settle();await settle();}};
}
async function auth() {
 const docEvents={},winEvents={},attrs=new Map(),store=new Map(),nodes={};let identity={id:1,role:'User'},offline=false,logoutFail=false,requests=0;const redirects=[];
 const element=()=>({style:{},appendChild(){},setAttribute(){},remove(){}});
 const doc={hidden:false,head:{appendChild(){}},body:{appendChild:e=>{if(e.id)nodes[e.id]=e;}},documentElement:{setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)},querySelector:()=>null,createElement:element,getElementById:id=>nodes[id]||null,addEventListener:(n,f)=>docEvents[n]=f};
 const storage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)||null,removeItem:k=>store.delete(k)};
 const w={location:{pathname:'/user/',search:'',replace:x=>redirects.push(x)},sessionStorage:storage,localStorage:{setItem(){}},addEventListener:(n,f)=>winEvents[n]=f};
 const fetch=async url=>{
  if(url==='/api/auth/csrf')return{ok:true,status:200,json:async()=>({data:{csrf_token:'fictional'}})};
  if(url==='/api/auth/me'){requests++;if(offline)throw Error('offline');return{ok:true,status:200,json:async()=>({success:true,data:{user:identity}})};}
  return{ok:!logoutFail,status:logoutFail?503:200,json:async()=>({success:!logoutFail,message:'Test transport'})};
 };
 vm.runInNewContext(read('public/shared/session-auth.js'),{window:w,document:doc,fetch,sessionStorage:storage});await settle();await settle();
 assert.equal(w.VHSAuth.currentUser().id,1);assert.equal(attrs.has('data-vhs-session-checking'),false);
 offline=true;await winEvents.focus();assert.equal(redirects.length,0,'network failure must preserve the page');assert.ok(nodes.vhsSessionRetry);
 offline=false;await winEvents.focus();assert.equal(attrs.has('data-vhs-session-checking'),false,'retry recovers from a rejected inflight promise');
 logoutFail=true;await assert.rejects(w.VHSAuth.logout());assert.equal(w.VHSAuth.currentUser().id,1,'failed logout must not claim the session ended');
 identity={id:2,role:'Doctor'};await winEvents.focus();assert.equal(redirects.at(-1),'/doctor/');assert.ok(requests>=4);
}
async function contactDraft() {
 const source=read('public/web-page/script.js'),start=source.indexOf('// ===== CONTACT FORM ====='),end=source.indexOf('// ===== REGISTRATION FORM VALIDATION =====',start);
 let handler,failed=false;const button={disabled:false},status={textContent:''};
 const inputs={contactDraftStatus:status,contactName:{value:'Fictional Tester'},contactEmail:{value:'fictional@example.test'},contactPhone:{value:'09170000000'},contactMessage:{value:'Fictional question & a second line\nNo actual message is sent.'},contactSubject:{selectedIndex:0,options:[{text:'Services Information'}]}};
 const form={addEventListener:(n,f)=>handler=f,reportValidity:()=>true,querySelector:()=>button};inputs.contactForm=form;
 const window={location:{href:''}};
 const fetch=async()=>({ok:!failed,json:async()=>({success:true,data:{settings:{clinicInfo:{email:'fictional-clinic@example.test'}}}})});
 vm.runInNewContext(source.slice(start,end),{window,document:{getElementById:id=>inputs[id]},fetch,encodeURIComponent});
 await handler({preventDefault(){}});assert.ok(window.location.href.startsWith('mailto:fictional-clinic@example.test?'));assert.match(decodeURIComponent(window.location.href),/Fictional question & a second line/);assert.match(status.textContent,/has not sent your message/);assert.ok(inputs.contactMessage.value);assert.equal(button.disabled,false);
 window.location.href='';failed=true;await handler({preventDefault(){}});assert.equal(window.location.href,'');assert.match(status.textContent,/could not be verified/);assert.ok(inputs.contactMessage.value);
}
(async()=>{
 await contactDraft();
 let h=await qr();assert.equal(h.calls.length,2);assert.match(h.body.innerHTML,/You are checked in/);
 h=await qr({fail:true});assert.doesNotMatch(h.body.innerHTML,/You are checked in/);await h.click('[data-ci-retry]');assert.match(h.body.innerHTML,/You are checked in/);assert.equal(h.calls.filter(x=>x==='check-in/1').length,2);
 h=await qr({items:[{id:1,pet_name:'<img onerror=bad>'},{id:2,pet_name:'Fictional Other Pet'}]});assert.equal(h.calls.length,1);assert.ok(!h.body.innerHTML.includes('<img'));await h.click('[data-ci-checkin]',2);assert.equal(h.calls.at(-1),'check-in/2');
 h=await qr({status:422});assert.equal(h.calls.length,1);assert.doesNotMatch(h.body.innerHTML,/You are checked in/);
 h=await qr({search:''});assert.equal(h.calls.length,0);
 await auth();console.log('PASS: QR auto-check-in, interruption retry, multiple choice, output escaping, expired QR; account change and offline/logout recovery (real scripts, mocked transport).');
})().catch(e=>{console.error(e);process.exitCode=1;});
