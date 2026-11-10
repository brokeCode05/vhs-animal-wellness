// Real render functions; synthetic strings only. No browser execution or database writes.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const payload='<img src=x onerror="fictional()">&\'text';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function table(source) {
 const start=source.indexOf('function renderAllAppointmentsTable('),end=source.indexOf('// ─── ADMIN BOOKING MODAL',start);
 const target={innerHTML:''};
 const box={document:{getElementById:()=>target},window:{},Date,formatDateTime:()=> 'Fictional date',statusBadge:()=>'<span>Confirmed</span>',kebabHtml:()=>'',_escD:esc};
 vm.runInNewContext(source.slice(start,end),box);
 box.renderAllAppointmentsTable([{id:1,status:'confirmed',date:'2026-11-10',time:'10:00',owner_name:payload,pet_name:payload,service:payload,vet_name:payload,reference_no:'FICTIONAL-1'}]);
 return target.innerHTML;
}
const baselinePath=path.join(__dirname,'..','storage/app/private/audit-repair-before-20261110/public/admin/admin-portal.js');
if(fs.existsSync(baselinePath)) assert.ok(table(fs.readFileSync(baselinePath,'utf8')).includes(payload),'Baseline reproduction confirms raw markup enters the rendered appointment HTML');
const html=table(read('public/admin/admin-portal.js'));
assert.ok(!html.includes('<img'));assert.ok(html.includes(esc(payload)));assert.ok(html.includes('<span>Confirmed</span>'));
const shared=read('public/shared/dashboard-shared.js');
for(const fragment of ["_esc(apt.owner)","_esc(apt.pet)","_esc(r[1])","_esc(a.owner_name || '—')","_esc(a.pet_name || '—')"])assert.ok(shared.includes(fragment),fragment);
const user=read('public/user/user-script.js');assert.ok(user.includes("escapeHtml(d.petName || '')"));
const ui=read('public/shared/vhs-ui.js');const box={};vm.runInNewContext(ui.slice(0,ui.indexOf('/*')),box);assert.equal(box.vhsEscapeText(payload),esc(payload));
assert.ok(ui.includes('${vhsEscapeText(message)}'));assert.ok(ui.includes('${vhsEscapeText(footer.inputDefault'));
console.log('PASS: baseline markup-injection reproduction and repaired appointment text, calendar/details, document cards, toast/modal text and prompt attribute escaping.');
