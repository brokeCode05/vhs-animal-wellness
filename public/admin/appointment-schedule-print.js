/* REQ006 — Print a fresh Laravel-backed Admin daily appointment schedule. */
(function(window,document){
  'use strict';
  function dateKey(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function h(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fullDate(v){var p=v.split('-');return new Date(+p[0],+p[1]-1,+p[2],12).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});}
  function time(v){var s=String(v||'').slice(0,5);var m=/^(\d{1,2}):(\d{2})/.exec(s);if(!m)return s;var hr=+m[1];return (hr%12||12)+':'+m[2]+' '+(hr>=12?'PM':'AM');}
  function rowData(a){
    // appointments() converts source rows to canonical AppointmentContract records.
    return {date:a.appointmentDate||a.date||'',time:a.appointmentTime||a.time||'',reference:a.referenceNo||a.reference_no||'',
      owner:a.owner&&a.owner.name||a.owner_name||'',pet:a.pet&&a.pet.name||a.pet_name||'',
      service:a.serviceLabelAtBooking||a.service||'',doctor:a.assignedVetName||a.vet_name||'',status:a.status||''};
  }
  function makeHtml(date,rows){
    var settings=window.VHSClinicSettings&&window.VHSClinicSettings.get ? window.VHSClinicSettings.get():null;
    var clinic=settings&&settings.clinicInfo||{};
    var counts={};rows.forEach(function(r){var k=r.status||'unknown';counts[k]=(counts[k]||0)+1;});
    var summary=Object.keys(counts).map(function(k){return '<span>'+h(k.replace(/_/g,' '))+': <b>'+counts[k]+'</b></span>';}).join(' ');
    var body=rows.map(function(r,i){return '<tr><td>'+ (i+1)+'</td><td>'+h(time(r.time))+'</td><td>'+h(r.reference)+'</td><td>'+h(r.owner)+'</td><td>'+h(r.pet)+'</td><td>'+h(r.service)+'</td><td>'+h(r.doctor||'Unassigned')+'</td><td>'+h((r.status||'').replace(/_/g,' '))+'</td></tr>';}).join('');
    if(!body)body='<tr><td colspan="8" class="empty">No appointments are scheduled for this date.</td></tr>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>VHS Daily Schedule — '+h(date)+'</title><style>'+
      '@page{size:A4 landscape;margin:12mm}body{font:11px Arial,sans-serif;color:#243044}h1{font-size:21px;margin:0 0 6px}h2{font-size:16px;margin:0}.head{display:flex;justify-content:space-between;border-bottom:2px solid #4e3e74;padding:12px 0}.sub{margin:12px 0}.summary span{display:inline-block;border:1px solid #ddd;border-radius:5px;margin:5px 6px 12px 0;padding:5px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3f1f8}.empty{text-align:center;padding:24px}.print-button{padding:7px 18px;margin-bottom:12px}@media print{.print-button{display:none}}' +
      '</style></head><body><button class="print-button" onclick="window.print()">Print Schedule</button><div class="head"><div><h1>'+h(clinic.name||'VHS Animal Wellness Center')+'</h1><h2>Daily Appointment Schedule</h2></div><div>'+h(clinic.address||'')+'<br>'+h(clinic.phone||'')+'<br>'+h(clinic.email||'')+'</div></div>'+ 
      '<p class="sub"><b>'+h(fullDate(date))+'</b> &nbsp; · &nbsp; Generated '+h(new Date().toLocaleString('en-PH'))+' &nbsp; · &nbsp; Total: '+rows.length+'</p><div class="summary">'+summary+'</div><table><thead><tr><th>#</th><th>Time</th><th>Reference</th><th>Owner</th><th>Pet</th><th>Service</th><th>Doctor</th><th>Status</th></tr></thead><tbody>'+body+'</tbody></table></body></html>';
  }
  async function printDay(){
    var input=document.getElementById('filterDate');var date=input&&input.value||dateKey();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    // Open synchronously before the awaited fetch to avoid browser popup blockers.
    var popup=window.open('','_blank','width=1180,height=850');
    if(!popup){if(window.showToast)showToast('Allow pop-ups to print the daily schedule.','warning');return;}
    popup.document.write('<!doctype html><title>Loading schedule</title><p>Fetching the current clinic schedule…</p>');
    try{
      if(!window.VHSReads||typeof window.VHSReads.appointments!=='function')throw new Error('Appointment API is unavailable.');
      var response=await window.VHSReads.appointments();
      if(!response.ok)throw new Error(response.message||'Could not load appointments.');
      var rows=(response.data.appointments||[]).map(rowData).filter(function(a){return a.date===date;});
      rows.sort(function(a,b){return a.time.localeCompare(b.time)||a.reference.localeCompare(b.reference);});
      popup.document.open();popup.document.write(makeHtml(date,rows));popup.document.close();
      popup.focus();
      // Manual Print button remains available if browser suppresses auto-print.
      window.setTimeout(function(){try{if(!popup.closed)popup.print();}catch(_){}},400);
    }catch(error){
      popup.document.open();popup.document.write('<!doctype html><title>Schedule unavailable</title><p>Could not retrieve the live appointment schedule. Please close this tab and try again.</p>');popup.document.close();
      if(window.showToast)showToast(error.message||'Could not load schedule.','error');
    }
  }
  function init(){var b=document.getElementById('printDailyScheduleBtn');if(b)b.addEventListener('click',printDay);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.printDailyAppointmentSchedule=printDay;
})(window,document);
