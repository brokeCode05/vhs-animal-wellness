'use strict';
// Static guardrail tests for the actual Laravel/JS semantic integration;
// not a replacement for PHPUnit or a live browser.
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const service=get('app/Services/AI/SemanticVettiService.php');
const controller=get('app/Http/Controllers/AI/SemanticVettiController.php');
const routes=get('routes/web.php');
const js=get('public/user/vetti-ai.js');
const index=get('public/user/index.html');
const config=get('config/ai.php');
let checks=0;
for(const s of ["config('ai.paid_data_approved'", "config('ai.semantic_privacy_cleared'", "config('ai.semantic_vetti_enabled'"]){assert.ok(service.includes(s));checks++;}
for(const s of ["'booking_created' => false","'requires_confirmation' => true", "'booking_proposal'", "'conversation_id'", "'vetti_semantic_pending_'", "ownsPet"]){assert.ok(service.includes(s));checks++;}
assert.ok(!service.includes('Appointment::create'));checks++;
assert.ok(routes.includes("'ai/semantic-vetti'"));checks++;
assert.ok(routes.includes("'throttle:10,1'"));checks++;
assert.ok(controller.includes("'max:450'"));checks++;
assert.ok(config.includes("'semantic_vetti_enabled'"));checks++;
assert.match(index,/window\.VHS_SEMANTIC_VETTI\s*=\s*(?:true|false)/);checks++;
assert.ok(index.includes('Google Gemini or Groq'));
assert.ok(index.includes('after automatic filtering'));
assert.ok(js.includes('fallback_only:true'));checks++;
assert.ok(js.includes("global.VHS_SEMANTIC_VETTI !== true"));checks++;
assert.ok(js.includes('context.serviceId = serviceMatches[0].value'));
assert.ok(js.includes('serviceMatches.length !== 1'));checks++;
assert.ok(js.includes("action:'openBooking'"));checks++;
console.log(`PASS: semantic Laravel/JS static guardrails (${checks} assertions)`);
