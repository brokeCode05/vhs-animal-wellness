'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const calls=[];
const win={
  VHS_SEMANTIC_VETTI:true,location:{pathname:'/user/'},setTimeout,clearTimeout,
  VettiState:{isState:()=>true,resolve:()=>({id:'legacy',state:'idle',text:'unused',suggestions:[]})},
  fetch:async(url,opts)=>{
    if(url==='/api/auth/csrf') return {ok:true,json:async()=>({data:{csrf_token:'test'}})};
    calls.push(JSON.parse(opts.body));
    return {ok:true,json:async()=>({success:true,data:{mode:'semantic',kind:'information',state:'idle',text:'Ready'}})};
  }
};
win.window=win;
new Function('window',fs.readFileSync('public/user/vetti-ai.js','utf8'))(win);
(async()=>{
  await win.VettiAI.ask('Book my pet', {activePet:{petId:8,name:'Fictional',species:'Cat'}});
  assert.equal(calls[0].active_pet_id,8);
  assert.ok(!JSON.stringify(calls[0]).includes('Fictional'));
  await win.VettiAI.ask('Hello', {activePet:{petId:'invalid',name:'Fictional'}});
  assert.ok(!Object.hasOwn(calls[1],'active_pet_id'));
  console.log('PASS: selected pet ID sent to Laravel without name; invalid ID omitted.');
})().catch(e=>{console.error(e);process.exitCode=1});
