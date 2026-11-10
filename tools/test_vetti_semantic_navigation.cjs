'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let destination='documents'; const calls=[];
const window={VHS_SEMANTIC_VETTI:true,location:{pathname:'/user/index.html'},setTimeout,clearTimeout,fetch:async(url,opts)=>{
 calls.push(url);
 if(url==='/api/auth/csrf')return {ok:true,json:async()=>({data:{csrf_token:'fake'}})};
 if(url==='/api/ai/semantic-vetti')return {ok:true,json:async()=>({success:true,data:{mode:'semantic',kind:'portal_navigation',destination,state:'idle',text:'Open the page when ready.'}})};
 return {ok:false,json:async()=>({success:false})};
}};window.window=window;
for(const f of ['public/shared/appointment-contract.js','public/user/vetti-state.js','public/user/vetti-ai.js'])vm.runInNewContext(fs.readFileSync(f,'utf8'),{window,Date,Promise,setTimeout,clearTimeout});
const ctx={pets:[],hasPets:false,services:[],appointments:{upcoming:[],past:[]},suggestionsWithPet:[],suggestionsNoPet:[]};
(async()=>{
 let answer=await window.VettiAI.ask('Show my documents',ctx,{timeoutMs:4000});
 assert.equal(answer.id,'documents');assert.ok(answer.suggestions.includes('Open My Documents'));assert.ok(calls.includes('/api/ai/semantic-vetti'));
 destination='profile';answer=await window.VettiAI.ask('Open my profile',ctx,{timeoutMs:4000});
 assert.equal(answer.id,'account_profile');assert.ok(answer.suggestions.includes('Open My Profile'));
 destination='other_user_records';answer=await window.VettiAI.ask('Hello',ctx,{timeoutMs:4000});
 assert.equal(answer.id,'semantic_unavailable');assert.ok(!answer.action);
 console.log('PASS: semantic navigation reaches Laravel and permits only the existing user-controlled portal buttons.');
})().catch(e=>{console.error(e);process.exitCode=1});
