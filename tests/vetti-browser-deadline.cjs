'use strict';
const assert = require('assert');
const fs = require('fs');
const warnings=[];
const win={
  VHS_SEMANTIC_VETTI:true, location:{pathname:'/user/'}, AbortController,
  setTimeout:(fn,ms)=>setTimeout(fn,ms===45000?10:ms), clearTimeout,
  console:{warn:(...args)=>warnings.push(args.join(' '))},
  VettiState:{isState:()=>true,resolve:()=>({id:'legacy',state:'idle',text:'legacy',suggestions:[]})},
  fetch:async(url,options)=>{
    if(url==='/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'synthetic'}})};
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('private transport detail'))));
  }
};
win.window=win;
new Function('window',fs.readFileSync('public/user/vetti-ai.js','utf8'))(win);
(async()=>{
  const result=await win.VettiAI.ask('synthetic sensitive message',{});
  assert.equal(result.id,'semantic_unavailable');
  assert.match(warnings.join('\n'),/browser_deadline/);
  assert.doesNotMatch(warnings.join('\n'),/synthetic|private transport/);
  const csrfWarnings=[]; let csrfFetches=0;
  const waiting={
    VHS_SEMANTIC_VETTI:true,location:{pathname:'/user/'},
    setTimeout:(fn,ms)=>setTimeout(fn,ms===45000?10:ms),clearTimeout,
    console:{warn:(...args)=>csrfWarnings.push(args.join(' '))},
    VettiState:win.VettiState,
    fetch:async(url)=>{
      csrfFetches++;
      if (csrfFetches===1) return new Promise(()=>{});
      if (url==='/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'synthetic'}})};
      return {ok:true,json:async()=>({success:true,data:{mode:'semantic',kind:'information',state:'idle',text:'Recovered'}})};
    }
  };
  waiting.window=waiting;
  new Function('window',fs.readFileSync('public/user/vetti-ai.js','utf8'))(waiting);
  const csrfResult=await waiting.VettiAI.ask('synthetic request',{});
  assert.equal(csrfResult.id,'semantic_unavailable');
  assert.equal(csrfFetches,1);
  assert.match(csrfWarnings.join('\n'),/browser_deadline/);
  const retry=await waiting.VettiAI.ask('retry',{});
  assert.equal(retry.text,'Recovered');
  assert.equal(csrfFetches,3);
  console.log('PASS: browser and CSRF deadlines give an honest error and logs only a bounded category.');
})().catch(e=>{console.error(e);process.exitCode=1});
