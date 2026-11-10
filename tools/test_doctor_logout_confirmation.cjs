'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'public/doctor/doctor.js'), 'utf8');
const start = source.indexOf("  document.getElementById('logoutBtn')?.addEventListener");
const end = source.indexOf('  // Navbar clock', start);
assert.ok(start >= 0 && end > start, 'Doctor logout handler is present');

async function check(allowed) {
  let handler, calls = 0, prompts = 0, prevented = false;
  const button = { addEventListener: (_name, fn) => { handler = fn; } };
  const context = {
    recorder:null,audioTake:null,audioRequestPending:false,audioSending:false,
    workingStore:{flushAll:async()=>true},scribeRetryCache:{clearAll(){}},
    workingStatus:{},workingRetry:{},groqStatus:{},
    document: { getElementById: () => button, createElement: () => ({ style: {} }), body: { appendChild() {} } },
    window: { VHSAuth: { logout: async () => { calls++; } }, location: {} },
    confirmAction: async () => { prompts++; return allowed; },
    setTimeout() {},
  };
  vm.runInNewContext(source.slice(start, end), context);
  await handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(prompts, 1);
  assert.equal(calls, allowed ? 1 : 0);
}

(async () => { await check(false); await check(true); console.log('PASS: Doctor logout asks first; cancel preserves the session and confirmation logs out.'); })()
  .catch(error => { console.error(error); process.exitCode = 1; });
