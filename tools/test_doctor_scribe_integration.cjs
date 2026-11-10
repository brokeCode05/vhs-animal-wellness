'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const adapter = fs.readFileSync(path.join(root,'public/doctor/doctor-scribe.js'),'utf8');
const doctor = fs.readFileSync(path.join(root,'public/doctor/doctor.js'),'utf8');
const html = fs.readFileSync(path.join(root,'public/doctor/index.html'),'utf8');
let calls = 0;
const sandbox = {
  Promise,
  Date,
  setTimeout,
  clearTimeout,
  window: {
    VHS_DOCTOR_SCRIBE_GEMINI: false,
    setTimeout, clearTimeout,
    VHSAuth: { send: async (endpoint, input) => {
      calls++;
      assert.equal(endpoint, 'ai/doctor-scribe');
      assert.equal(input.appointment_id, 5);
      assert.deepEqual(Object.keys(input).sort(), ['appointment_id','draft_language','mode','transcript']);
      assert.equal(input.draft_language, 'english');
      return {ok: true, data: {soap: {
        subjective: 'Owner reports coughing.',
        objective: {findings:'Not provided.', weightKg:null,temperatureC:null,heartRateBpm:null},
        assessment:'Not provided.', plan:'Not provided.'
      }, warnings:['AI draft: review source'], sourceSections:{subjective:'Owner reports coughing.',objective:'Not provided.',assessment:'Not provided.',plan:'Not provided.'},summaryApplied:true,summaryMethod:'semantic',summaryProvider:'gemini',summaryCheckProvider:'groq' }};
    } }
  }
};
vm.createContext(sandbox);
vm.runInContext(adapter, sandbox);
(async()=>{
  const s = sandbox.window.DoctorScribe;
  assert.match(html, /window\.VHS_DOCTOR_SCRIBE_GEMINI\s*=\s*(?:true|false)/);
  assert.ok(doctor.includes('scribe.transcript.value !== originalTranscript'));
  const input = {transcript:'Owner reports coughing.', appointmentId:5, patient:{name:'private-pet'}};
  const local = await s.createSoapDraft(input);
  assert.equal(local.meta.engine, 'local-deterministic');
  assert.match(local.warnings.join(' '), /language choice requires AI drafting/i);
  const localSource = await s.createSoapDraft({...input, draftLanguage:'source'});
  assert.doesNotMatch(localSource.warnings.join(' '), /language choice requires AI drafting/i);
  assert.equal(calls, 0);
  sandbox.window.VHS_DOCTOR_SCRIBE_GEMINI = true;
  const remote = await s.createSoapDraft(input);
  assert.equal(calls, 1);
  assert.equal(remote.ok, true);
  assert.equal(remote.apply.subjective,'Owner reports coughing.');
  assert.equal(remote.sourceSections.subjective,'Owner reports coughing.');
  assert.equal(remote.summaryApplied,true);
  assert.equal(remote.summaryMethod,'semantic');
  assert.equal(remote.summaryProvider,'gemini');
  assert.equal(remote.summaryCheckProvider,'groq');
  const longSubjective='History detail. '.repeat(95).trim();
  const longResult=s.normalizeBackendResponse({soap:{subjective:longSubjective,objective:{findings:'Not provided.',weightKg:null,temperatureC:null,heartRateBpm:null},assessment:'Not provided.',plan:'Not provided.'}});
  assert.equal(longResult.ok,true);assert.equal(longResult.apply.subjective,longSubjective);
  const tooLong=s.normalizeBackendResponse({soap:{subjective:'x'.repeat(2001),objective:{findings:'Not provided.',weightKg:null,temperatureC:null,heartRateBpm:null},assessment:'Not provided.',plan:'Not provided.'}});
  assert.equal(tooLong.ok,false);assert.equal(tooLong.error.code,'field_too_long');
  const groq=s.normalizeBackendResponse({soap:{subjective:'Owner reports coughing.',objective:{findings:'Not provided.',weightKg:null,temperatureC:null,heartRateBpm:null},assessment:'Not provided.',plan:'Not provided.'},providerMeta:{engine:'groq'}});
  assert.equal(groq.providerMeta.engine,'groq');
  assert.ok(doctor.includes("result.providerMeta.engine === 'groq' ? 'Groq backup'"));
  assert.equal(remote.apply.weight,'');
  sandbox.window.VHSAuth.send = async ()=>({ok:false,status:422,raw:{code:'privacy_contact_detected'}});
  const blocked=await s.createSoapDraft(input);
  assert.equal(blocked.meta.engine,'local-deterministic');
  assert.match(blocked.warnings.join(' '),/not sent for external drafting/i);
  sandbox.window.VHSAuth.send = async ()=>{calls++; return {ok:false, status:503, message:'AI unavailable'};};
  const backup = await s.createSoapDraft(input);
  assert.equal(backup.ok,true);
  assert.equal(backup.meta.engine,'local-deterministic');
  assert.ok(backup.warnings.join(' ').includes('SOAP drafting unavailable'));
  console.log('PASS: Doctor Scribe opt-in, review mapping, privacy payload, and deterministic fallback (11 assertions)');
})().catch(e=>{console.error(e); process.exitCode=1;});
