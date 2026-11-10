'use strict';
// Static invariants complement, not replace, browser tests.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const read=s=>fs.readFileSync(path.join(__dirname,'..',s),'utf8');
const ui=read('public/doctor/doctor.js'); const adapter=read('public/doctor/doctor-scribe.js');
const controller=read('app/Http/Controllers/AI/DoctorScribeController.php');const routes=read('routes/web.php');const index=read('public/doctor/index.html');
const conditions=[
 ['review-before-apply proposal',/showScribeReview\(target, result\)/.test(ui)],
 ['patient identity before apply',/selectedPatient !== pending\.patient/.test(ui)],
 ['transcript freshness before apply',/scribe\.transcript\.value !== pending\.transcript/.test(ui)],
 ['patient identity on async response',/selectedPatient !== target/.test(ui)],
 ['transcript freshness on async response',/scribe\.transcript\.value !== originalTranscript/.test(ui)],
 ['explicit overwrite confirmation',/confirmAction\(\{\s*title:\s*'Apply this draft/.test(ui)],
 ['discard pending proposal without applying',/function discardPendingDraft\(\)[\s\S]*?hideScribeReview\(\)/.test(ui)],
 ['requires doctor editable consultation',/if \(!scribeAccess\(\)\.editable\)/.test(ui)],
 ['save remains separate from apply',/Nothing is saved to the clinic record until you click Save Draft/.test(ui)],
 ['clinical provider gates remain on backend',/config\('ai\.clinical_enabled'\)/.test(controller)&&/config\('ai\.clinical_clearance'\)/.test(controller)&&/config\('ai\.paid_data_approved'\)/.test(controller)],
 ['doctor-assignment gate intact',/assigned_vet_id/.test(controller)&&/doctorProfile/.test(controller)],
 ['active consultation required',/in_consultation/.test(controller)],
 ['scribe route authenticated and doctor-only',/ai\/doctor-scribe/.test(routes)&&/role:Doctor/.test(routes)],
 ['browser AI switch is explicit',/window\.VHS_DOCTOR_SCRIBE_GEMINI\s*=\s*(?:true|false)/.test(index)],
 ['transcript payload only includes ID and text',/appointment_id:\s*Number\(appointmentId\),\s*transcript:\s*transcript/.test(adapter)],
 ['backend failure invokes local fallback',/localDraft\('SOAP drafting unavailable or not authorized/.test(adapter)]
];
for(const [name,ok] of conditions){ assert.ok(ok,'Workflow contract missing: '+name);console.log('PASS',name);}
console.log(`PASS: ${conditions.length} non-executing Doctor Scribe workflow source invariants`);
