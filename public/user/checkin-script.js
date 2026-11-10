/* Reception QR check-in. All eligibility and writes are decided by Laravel. */
(function () {
  'use strict';
  var busy = false, pendingId = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function body() { return document.getElementById('checkinBody'); }
  function message(text, retry) {
    body().innerHTML = '<p role="status">' + esc(text) + '</p><div class="ci-actions">' +
      (retry ? '<button type="button" class="btn-primary" data-ci-retry>Retry</button>' : '') + '<button type="button" class="btn-secondary" data-ci-close>Close</button></div>';
  }
  function success(a) {
    body().innerHTML = '<div class="ci-state ci-state-success"><h3>You are checked in</h3><p>Reference ' + esc(a.referenceNo) + ' · ' + esc(a.pet_name || (a.pet && a.pet.name)) + '</p><p>Please wait for reception to call you.</p></div><div class="ci-actions"><button type="button" class="btn-primary" data-ci-close>Done</button></div>';
    if (typeof window.loadUserAppointments === 'function') window.loadUserAppointments();
  }
  async function checkIn(id) {
    if (busy) return;
    busy = true; pendingId = id;
    message('Saving your check-in…');
    try {
      var result = await window.VHSAuth.send('check-in/' + encodeURIComponent(id), {});
      if (!result.ok) { message(result.message || 'Check-in could not be confirmed. Retry or ask reception.', true); return; }
      pendingId = null; success(result.data.appointment);
    } catch (e) { message('The connection was interrupted. Retry to check the server result, or ask reception.', true); }
    finally { busy = false; }
  }
  async function load() {
    if (busy) return;
    message('Checking your appointments…');
    try {
      var result = await window.VHSAuth.send('check-in/appointments');
      if (!result.ok) { message(result.message || 'Check-in is unavailable. Please ask reception.', result.status >= 500); return; }
      var appointments = result.data.appointments || [];
      if (!appointments.length) { message('No eligible confirmed appointment was found. Check-in opens two hours before your visit on the appointment date. If you already checked in, reception can confirm your arrival.'); return; }
      if (appointments.length === 1) { await checkIn(appointments[0].id); return; }
      body().innerHTML = '<p>Select the appointment you are arriving for:</p><div class="ci-appt-list">' + appointments.map(function(a) {
        return '<button type="button" class="ci-appt-option" data-ci-checkin="' + esc(a.id) + '"><b>' + esc(a.pet_name || (a.pet && a.pet.name)) + '</b> · ' + esc(a.service_label || a.serviceLabel || '') + ' · ' + esc(a.appointmentTime || a.time) + ' · ' + esc(a.referenceNo) + '</button>';
      }).join('') + '</div><button type="button" class="btn-secondary" data-ci-close>Close</button>';
    } catch (e) { message('The connection was interrupted. Retry or ask reception.', true); }
  }
  async function init() {
    if (!document.getElementById('checkinOverlay') || !new URLSearchParams(location.search).has('clinic-checkin')) return;
    try { sessionStorage.setItem('vhs_pending_checkin', '1'); } catch (e) {}
    var user = window.VHSAuth && await window.VHSAuth.me();
    if (!user || user.role !== 'User') return;
    try { sessionStorage.removeItem('vhs_pending_checkin'); } catch (e) {}
    history.replaceState(null, '', location.pathname);
    document.getElementById('checkinOverlay').classList.add('show');
    document.addEventListener('click', function(e) {
      if (e.target.closest('[data-ci-close]')) { document.getElementById('checkinOverlay').classList.remove('show'); return; }
      var choice = e.target.closest('[data-ci-checkin]');
      if (choice) checkIn(choice.getAttribute('data-ci-checkin'));
      if (e.target.closest('[data-ci-retry]')) { if (pendingId) checkIn(pendingId); else load(); }
    });
    await load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
