'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let saved;
const window = { SharedMockUsers: { replaceWithServer(users, pets) { saved = {users, pets}; } } };
const document = {dispatchEvent() {}};
const fetch = async url => url.endsWith('/users')
  ? {ok:true,status:200,json:async()=>({data:{users:[{id:1},{id:2}]}})}
  : url.includes('/1/pets')
    ? {ok:true,status:200,json:async()=>({data:{pets:[{id:5}]}})}
    : {ok:false,status:500,json:async()=>({})};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/shared/api-reads.js'),'utf8'),{window,document,fetch,CustomEvent:function(){}});
window.VHSReads.hydrateClients().then(result=>{
  assert.equal(result.ok,false);
  assert.match(result.message,/incomplete/i);
  assert.equal(saved.users.length,2);
  assert.equal(saved.pets.length,1);
  console.log('PASS: partial pet loading is reported instead of silently succeeding');
}).catch(error=>{console.error(error);process.exitCode=1;});
