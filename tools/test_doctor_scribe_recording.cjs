'use strict';
// Executes the production recording handlers with a simulated microphone and HTTP service.
// Fictional bytes only; no microphone, credentials, provider, or database access.
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/doctor/doctor.js'),'utf8');
const block=source.slice(source.indexOf("  const groqRecord="),source.indexOf("  const punctuationButton="));
function setup(){
 const nodes={}, timers=[], tracks=[], windowEvents={}, intervals=[]; let download, now=0;
 const node=()=>({hidden:false,disabled:false,textContent:'',handlers:{},addEventListener(k,f){this.handlers[k]=f;},insertAdjacentElement(_,n){download=n;},click(){this.clicked=true;return this.handlers.click?.();}});
 class Recorder{
  static isTypeSupported(){return true;}
  constructor(_,o){this.mimeType=o.mimeType;this.state='inactive';Recorder.last=this;}
  start(slice){this.state='recording';this.slice=slice;}
  emit(size){this.ondataavailable({data:new Blob([new Uint8Array(size)])});}
  stop(){this.state='inactive';this.onstop();}
 }
 const track={stop(){this.stopped=true;},addEventListener(k,f){tracks.push(f);}};
 const c={Blob,FormData,AbortController,URL,console,MediaRecorder:Recorder,performance:{now:()=>now},formatRecTime:s=>{s=Math.floor(s);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');},
 setInterval(f,ms){const item={f,ms,cleared:false};intervals.push(item);return item;},clearInterval(item){item.cleared=true;},
 document:{getElementById(id){return nodes[id]??=node();},createElement:node},
 window:{MediaRecorder:Recorder,confirm:()=>true,addEventListener(k,f){windowEvents[k]=f;}},
 navigator:{mediaDevices:{async getUserMedia(){return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}},
 setTimeout(f,ms){const t={f,ms};timers.push(t);return t;},clearTimeout(t){t.cleared=true;},
 selectedPatient:{appointmentId:17},scribeAccess:()=>({editable:true}),rec:{state:'ready'},REC:{RECORDING:'recording',REQUESTING:'requesting'},
 scribe:{transcript:{value:''}},appendDictation(t){c.scribe.transcript.value+=(c.scribe.transcript.value?' ':'')+t;},revealScribeTranscript(){},
 fetch:async(url,opts)=>url.includes('audio-limits')?{ok:true,json:async()=>({data:{max_audio_bytes:10*1024*1024}})}:url.includes('csrf')?{ok:true,json:async()=>({data:{csrf_token:'fictional'}})}:{ok:true,json:async()=>({data:{transcript:'Owner reports fictional dog coughing. Plan: recheck.'}})}
 };
 vm.createContext(c);vm.runInContext(block+'\nglobalThis.inspect=()=>({audioTake,recorder,audioSending});',c);
 return {c,nodes,timers,tracks,windowEvents,Recorder,intervals,advance(ms){now+=ms;intervals.filter(i=>!i.cleared).forEach(i=>i.f());},get download(){return download;},click:id=>nodes[id].handlers.click()};
}
(async()=>{
 let passed=0;async function test(name,f){await f();console.log('PASS '+name);passed++;}
 await test('elapsed timer tracks time, stops and resets',async()=>{
  const h=setup();await h.click('groq-record');const timer=h.nodes['groq-timer'];
  assert.equal(timer.hidden,false);assert.equal(timer.textContent,'00:00');
  h.advance(125000);assert.equal(timer.textContent,'02:05');h.Recorder.last.emit(20);await h.click('groq-stop');
  h.advance(3000);assert.equal(timer.textContent,'02:05');assert.equal(h.intervals[0].cleared,true);
  await h.click('groq-discard');assert.equal(timer.hidden,true);assert.equal(timer.textContent,'00:00');
 });
 await test('five-minute simulated recording -> upload -> transcript review',async()=>{
  const h=setup();await h.click('groq-record');const r=h.Recorder.last;
  for(let second=0;second<300;second++)r.emit(4000);
  assert.equal(r.state,'recording');assert.equal(r.slice,1000);assert.ok(h.timers.every(t=>t.cleared));
  await h.click('groq-stop');assert.equal(h.c.inspect().audioTake.blob.size,1200000);
  await h.click('groq-send');assert.match(h.c.scribe.transcript.value,/fictional dog/);assert.equal(h.c.inspect().audioTake.blob.size,1200000);assert.equal(h.c.inspect().audioTake.transcribed,true);
  assert.equal(h.nodes['groq-send'].hidden,true);assert.equal(h.download.hidden,false);const text=h.c.scribe.transcript.value;await h.click('groq-send');assert.equal(h.c.scribe.transcript.value,text);
  h.c.window.confirm=()=>false;await h.click('groq-discard');assert.ok(h.c.inspect().audioTake);h.c.window.confirm=()=>true;await h.click('groq-discard');assert.equal(h.c.inspect().audioTake,null);
 });
 for(const mode of ['error','disconnect']) await test(mode+' retains captured bytes',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(1234);
  if(mode==='error')h.Recorder.last.onerror();else h.tracks[0]();
  assert.equal(h.c.inspect().audioTake.blob.size,1234);assert.equal(h.download.hidden,false);
  assert.match(h.nodes['groq-record-status'].textContent,/incomplete/);
 });
 await test('two MiB server limit bounds the recording',async()=>{
  const h=setup(), previous=h.c.fetch;h.c.fetch=async(url,opts)=>url.includes('audio-limits')?{ok:true,json:async()=>({data:{max_audio_bytes:2*1024*1024}})}:previous(url,opts);
  await h.click('groq-record');assert.match(h.nodes['groq-record-status'].textContent,/2 MiB/);
  h.Recorder.last.emit(Math.floor(2*1024*1024*.85));assert.equal(h.c.inspect().recorder,null);
  assert.equal(h.c.inspect().audioTake.blob.size,Math.floor(2*1024*1024*.85));
 });
 await test('too small a reported limit blocks recording',async()=>{
  const h=setup();h.c.fetch=async()=>({ok:true,json:async()=>({data:{max_audio_bytes:0}})});
  await h.click('groq-record');assert.equal(h.c.inspect().recorder,null);assert.match(h.nodes['groq-record-status'].textContent,/too small/);
 });
 await test('unavailable limit check uses conservative fallback',async()=>{
  const h=setup(), previous=h.c.fetch;h.c.fetch=async(url,opts)=>{if(url.includes('audio-limits')) throw Error('offline');return previous(url,opts);};
  await h.click('groq-record');assert.match(h.nodes['groq-record-status'].textContent,/1 MiB fallback limit/);
  h.Recorder.last.emit(Math.floor(1024*1024*.85));assert.equal(h.c.inspect().recorder,null);
 });
 await test('size threshold stops and retains complete delivered chunks',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(9*1024*1024);
  assert.equal(h.c.inspect().recorder,null);assert.equal(h.c.inspect().audioTake.blob.size,9*1024*1024);
 });
 await test('oversized final chunk retained for download, upload blocked',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(11*1024*1024);
  assert.equal(h.nodes['groq-send'].disabled,true);await h.click('groq-send');
  assert.equal(h.c.inspect().audioTake.blob.size,11*1024*1024);assert.equal(h.download.hidden,false);
 });
 for(const status of [413,422,429,503,'network','empty'])await test(status+' failure retains audio; retry inserts once',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(300);await h.click('groq-stop');
  const success=h.c.fetch;h.c.fetch=async(url,opts)=>{if(url.includes('csrf'))return success(url,opts);if(status==='network')throw Error('offline');return {ok:status==='empty',status,json:async()=>({data:{transcript:''}})};};
  await h.click('groq-send');assert.equal(h.c.inspect().audioTake.blob.size,300);assert.equal(h.c.scribe.transcript.value,'');
  h.c.fetch=success;await h.click('groq-send');assert.equal(h.c.inspect().audioTake.blob.size,300);assert.equal(h.c.inspect().audioTake.transcribed,true);
 });
 await test('long transcription is retained when the server advertises working draft capacity',async()=>{
  const h=setup(), original=h.c.fetch;const long='fictional '.repeat(1000);
  h.c.fetch=async(url,opts)=>url.includes('audio-limits')?{ok:true,json:async()=>({data:{max_audio_bytes:10*1024*1024,transcript_max_chars:30000,draft_max_chars:8000}})}:url.includes('csrf')?original(url,opts):{ok:true,json:async()=>({data:{transcript:long}})};
  await h.click('groq-record');h.Recorder.last.emit(100);await h.click('groq-stop');await h.click('groq-send');
  assert.ok(h.c.scribe.transcript.value.length>8000);assert.equal(h.c.scribe.transcript.value,long);assert.equal(h.c.inspect().audioTake.transcribed,true);
 });
 await test('over-limit transcription is retained and inserted later without another upload',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(100);await h.click('groq-stop');h.c.scribe.transcript.value='x'.repeat(3499);
  let uploads=0;const original=h.c.fetch;h.c.fetch=async(url,opts)=>{if(url.includes('doctor-scribe-audio')&&!url.includes('audio-limits'))uploads++;return original(url,opts);};
  await h.click('groq-send');assert.ok(h.c.inspect().audioTake);assert.equal(h.c.scribe.transcript.value.length,3499);
  assert.match(h.nodes['groq-pending-text'].value,/fictional dog/);assert.equal(h.nodes['groq-pending-transcript'].hidden,false);assert.equal(h.nodes['groq-send'].hidden,true);assert.equal(uploads,1);
  await h.click('groq-send');assert.equal(uploads,1);
  h.c.scribe.transcript.value='short note';await h.click('groq-insert-transcript');
  assert.equal(h.c.scribe.transcript.value,'short note Owner reports fictional dog coughing. Plan: recheck.');assert.equal(h.c.inspect().audioTake.transcribed,true);assert.equal(h.nodes['groq-pending-transcript'].hidden,true);assert.equal(h.nodes['groq-pending-text'].value,'');
  await h.click('groq-insert-transcript');assert.equal(uploads,1);assert.equal(h.c.scribe.transcript.value,'short note Owner reports fictional dog coughing. Plan: recheck.');
 });
 await test('a patient change during upload retains the result without inserting it into another record',async()=>{
  const h=setup();const patient=h.c.selectedPatient;await h.click('groq-record');h.Recorder.last.emit(100);await h.click('groq-stop');
  const original=h.c.fetch;let finishUpload;h.c.fetch=async(url,opts)=>url.includes('csrf')?original(url,opts):new Promise(resolve=>{finishUpload=()=>resolve({ok:true,json:async()=>({data:{transcript:'fictional returned text'}})});});
  const sending=h.click('groq-send');await new Promise(resolve=>setImmediate(resolve));h.c.selectedPatient={appointmentId:18};finishUpload();await sending;
  assert.equal(h.c.scribe.transcript.value,'');assert.equal(h.c.inspect().audioTake.pendingTranscript,'fictional returned text');assert.equal(h.nodes['groq-pending-transcript'].hidden,true);
  h.c.selectedPatient=patient;await h.click('groq-insert-transcript');assert.equal(h.c.scribe.transcript.value,'fictional returned text');
 });
 await test('a refreshed patient object for the same appointment can recover pending text',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(100);await h.click('groq-stop');h.c.scribe.transcript.value='x'.repeat(3499);
  await h.click('groq-send');assert.ok(h.c.inspect().audioTake.pendingTranscript);
  h.c.selectedPatient={appointmentId:'17'};h.c.scribe.transcript.value='';await h.click('groq-insert-transcript');
  assert.match(h.c.scribe.transcript.value,/fictional dog/);assert.equal(h.c.inspect().audioTake.transcribed,true);
 });
 await test('changed patient cannot receive transcript; unload warns; discard requires confirmation',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(100);await h.click('groq-stop');h.c.selectedPatient={appointmentId:18};
  await h.click('groq-send');assert.ok(h.c.inspect().audioTake);assert.equal(h.c.scribe.transcript.value,'');
  let warned=false;h.windowEvents.beforeunload({preventDefault(){warned=true;}});assert.ok(warned);
  h.c.window.confirm=()=>false;await h.click('groq-discard');assert.ok(h.c.inspect().audioTake);
  h.c.window.confirm=()=>true;await h.click('groq-discard');assert.equal(h.c.inspect().audioTake,null);
 });

 await test('upload timeout aborts request and retains recording',async()=>{
  const h=setup();await h.click('groq-record');h.Recorder.last.emit(100);await h.click('groq-stop');
  const success=h.c.fetch;h.c.fetch=async(url,opts)=>url.includes('csrf')?success(url,opts):new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('timeout'))));
  const sending=h.click('groq-send');await new Promise(resolve=>setImmediate(resolve));
  h.timers.find(t=>t.ms===120000).f();await sending;
  assert.equal(h.c.inspect().audioTake.blob.size,100);assert.equal(h.c.inspect().audioSending,false);
 });
 console.log('PASS '+passed+' simulated recording workflow tests');
})().catch(e=>{console.error(e);process.exitCode=1;});
