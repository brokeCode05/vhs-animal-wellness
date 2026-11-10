'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},Date,Promise,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('public/doctor/doctor-scribe.js','utf8'),context);
const fields={subjective:{value:'old'},exam:{value:'old'},assessment:{value:'old'},plan:{value:'old'},weight:{value:'7'},temperature:{value:'38.5'},heartRate:{value:'120'}};
const form={elements:{namedItem:name=>fields[name]}};
context.window.DoctorScribe.applyReviewedDraft(form,{subjective:'new',exam:'new',assessment:'new',plan:'new',weight:'999'},{weight:'9',temperature:'',heartRate:''});
assert.equal(fields.weight.value,'9');assert.equal(fields.temperature.value,'');assert.equal(fields.heartRate.value,'');assert.equal(fields.subjective.value,'new');
console.log('PASS reviewed weight retained, old temperature and heart rate cleared, model value ignored');
