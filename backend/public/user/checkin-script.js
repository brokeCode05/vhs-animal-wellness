/* ============================================================
   VHS USER — Clinic QR self check-in prototype (Advisor
   Revision Sprint 1). Runs on user/index.html only.

   Flow: reception displays the clinic check-in QR (Admin
   Dashboard → Display Check-in QR) → user opens this entry
   point → the page resolves the logged-in user's own
   appointments, keeps today's CONFIRMED ones, and walks the
   user through check-in. Never touches other users' records.

   // TODO(BACKEND): the clinic QR must encode a server-issued
   short-lived/rotating check-in token. The server must then
   validate: authenticated user, token validity/expiration,
   anti-replay (one-time scan), appointment ownership, date/time
   eligibility, and the allowed status transition (confirmed →
   checked_in). A permanent static frontend QR is NOT secure.
   ============================================================ */
(function () {
  'use strict';

  var CHECKIN_URL_TOKEN = 'clinic-checkin';
  var _busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function fmtTime(t) {
    var hhmm = window.AppointmentContract && window.AppointmentContract.timeTo12h
      ? window.AppointmentContract.timeTo12h(t)
      : t;
    if (typeof hhmm === 'string' && /^\d{2}:\d{2}$/.test(hhmm)) {
      var h = parseInt(hhmm.slice(0, 2), 10), m = hhmm.slice(3);
      var ap = h >= 12 ? 'PM' : 'AM';
      return ((h % 12) || 12) + ':' + m + ' ' + ap;
    }
    return hhmm || '—';
  }

  function fmtDate(d) {
    var p = String(d || '').split('-');
    if (p.length !== 3) return d || '—';
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function apptLabel(a) {
    // Display-boundary label resolution: canonical keys stay canonical.
    var svc = a.service;
    if (window.SharedMockUsers && window.SharedMockUsers.serviceLabel) svc = window.SharedMockUsers.serviceLabel(svc);
    return svc || '—';
  }

  // Eligibility: OWN appointment + TODAY + status confirmed (store's guarded
  // transition confirmed → checked_in is the only path; the store itself
  // rejects checked_in / in_consultation / completed / canceled re-entry).
  function eligibleAppointments() {
    var shared = window.SharedMockAppointments;
    var uid = window._currentUserIdSafe ? window._currentUserIdSafe() : '';
    if (!shared || !shared.getAll || !uid) return [];
    var contract = window.AppointmentContract;
    return shared.getAll().filter(function (rec) {
      if (!rec) return false;
      var ownerId = rec.userId || (rec.owner && rec.owner.userId) || (rec.owner && rec.owner.id);
      if (!ownerId || String(ownerId) !== String(uid)) return false;
      var st = contract && contract.normalizeStatus ? contract.normalizeStatus(rec.status) : rec.status;
      if (st !== 'confirmed') return false; // confirmed only — checked_in / in_consultation / completed / canceled never re-enter
      return String(rec.appointmentDate || '') === todayKey();
    }).map(function (rec) {
      var a = contract ? contract.toLegacyDisplay(contract.fromLegacy(rec)) : rec;
      a._canonicalId = rec.appointmentId;
      a._canonicalStatus = rec.status;
      return a;
    });
  }

  function body() { return document.getElementById('checkinBody'); }
  function openOverlay() { var o = document.getElementById('checkinOverlay'); if (o) o.classList.add('show'); }
  function closeOverlay() { var o = document.getElementById('checkinOverlay'); if (o) o.classList.remove('show'); }

  function renderIntro() {
    var el = body();
    if (!el) return;
    var eligible = eligibleAppointments();
    var u = window._getSessionUser ? window._getSessionUser() : null;
    var name = u ? (u.name || u.first_name || 'Pet Owner') : 'Pet Owner';
    if (!eligible.length) {
      el.innerHTML =
        '<div class="ci-state ci-state-warn">' +
        '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<h3>No appointment to check in</h3>' +
        '<p>You have no confirmed appointment scheduled for today. Check-in opens on the day of your visit.</p>' +
        '<p class="ci-hint">Already inside the clinic? Reception can check you in — just show your Reference Number.</p>' +
        '</div>' +
        '<div class="ci-actions"><button type="button" class="btn-secondary" data-ci-close>Close</button></div>';
      return;
    }
    if (eligible.length === 1) {
      var a = eligible[0];
      el.innerHTML =
        '<div class="ci-appt-summary">' +
        '<div class="ci-appt-pet">' + (a.pet_name || '—') + ' <span>· ' + (a.pet_type || '') + (a.pet_breed ? ' / ' + a.pet_breed : '') + '</span></div>' +
        '<div class="ci-appt-grid">' +
        '<div><span>Reference No.</span><b>' + esc(a.reference_no || a.id || '—') + '</b></div>' +
        '<div><span>Service</span><b>' + esc(apptLabel(a)) + '</b></div>' +
        '<div><span>Date</span><b>' + esc(fmtDate(a.date)) + '</b></div>' +
        '<div><span>Time</span><b>' + esc(fmtTime(a.time)) + '</b></div>' +
        '</div></div>' +
        '<div class="ci-actions">' +
        '<button type="button" class="btn-secondary" data-ci-close>Cancel</button>' +
        '<button type="button" class="btn-primary" data-ci-checkin="' + esc(a._canonicalId) + '">Confirm Check-in</button>' +
        '</div>' +
        '<p class="ci-hint">Check-in notifies the front desk that you have arrived. Please wait at the waiting area.</p>';
      return;
    }
    // Multiple eligible appointments: let the user pick — never guess.
    el.innerHTML =
      '<p class="ci-multi-note">You have ' + eligible.length + ' confirmed appointments today. Select the one you are checking in for:</p>' +
      '<div class="ci-appt-list">' +
      eligible.map(function (a) {
        return '<button type="button" class="ci-appt-option" data-ci-checkin="' + esc(a._canonicalId) + '">' +
          '<span class="ci-appt-opt-pet">' + esc(a.pet_name || '—') + '</span>' +
          '<span>' + esc(fmtTime(a.time)) + ' · ' + esc(apptLabel(a)) + '</span>' +
          '<span class="ci-appt-opt-ref">' + esc(a.reference_no || '') + '</span>' +
          '</button>';
      }).join('') +
      '</div>' +
      '<div class="ci-actions"><button type="button" class="btn-secondary" data-ci-close>Cancel</button></div>';
  }

  function renderSuccess(appt) {
    var el = body();
    if (!el) return;
    var time = appt ? appt.appointmentTime : ''; // fmtTime() does the 12-h conversion
    var when = (appt && appt.appointmentDate ? fmtDate(appt.appointmentDate) : 'today') + (time ? ' · ' + fmtTime(time) : '');
    el.innerHTML =
      '<div class="ci-state ci-state-success">' +
      '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>' +
      '<h3>You are checked in</h3>' +
      '<p>Reference <b>' + esc(appt.referenceNo || '') + '</b> · ' + esc(appt.pet ? appt.pet.name : '') + ' · ' + esc(when) + '</p>' +
      '<p class="ci-hint">Please wait at the waiting area — the front desk will call you when the veterinarian is ready.</p>' +
      '</div>' +
      '<div class="ci-actions"><button type="button" class="btn-primary" data-ci-close>Done</button></div>';
  }

  function performCheckIn(appointmentId) {
    if (_busy) return;
    _busy = true;
    var shared = window.SharedMockAppointments;
    var sharedUsers = window.SharedMockUsers;
    var uid = window._currentUserIdSafe ? window._currentUserIdSafe() : '';
    try {
      var rec = shared ? (shared.byId(appointmentId) || shared.byReference(appointmentId)) : null;
      // Re-validate at submit time: ownership, today, confirmed. Direct state
      // manipulation (e.g. via console) never bypasses these checks.
      var ownerId = rec && (rec.userId || (rec.owner && rec.owner.userId) || (rec.owner && rec.owner.id));
      if (!rec || !uid || String(ownerId) !== String(uid) || rec.appointmentDate !== todayKey()) {
        window.showToast('This appointment is not eligible for check-in.', 'error');
        return;
      }
      var st = window.AppointmentContract && window.AppointmentContract.normalizeStatus
        ? window.AppointmentContract.normalizeStatus(rec.status) : rec.status;
      if (st !== 'confirmed') {
        window.showToast('Only confirmed appointments can be checked in.', 'warning');
        return;
      }
      var result = shared.setStatus(appointmentId, 'checked_in'); // guarded: confirmed → checked_in only
      if (!result || !result.ok) {
        window.showToast('Check-in failed — appointment status changed. Please see reception.', 'error');
        return;
      }
      // Audit trail: same store the Admin fallback uses.
      if (window.AuditLog && sharedUsers) {
        var u = window._getSessionUser ? window._getSessionUser() : null;
        window.AuditLog.add({
          actor: { actorType: 'User', actorId: uid, actorName: (u && (u.name || u.first_name)) || 'Pet Owner' },
          action: 'patient_checked_in',
          entityType: 'appointment',
          entityId: result.appointment.appointmentId,
          referenceNo: result.appointment.referenceNo,
          description: 'Owner self checked in ' + (result.appointment.pet ? result.appointment.pet.name : 'pet') + ' — ' + result.appointment.referenceNo,
          metadata: { method: 'clinic_qr_self_checkin', owner: result.appointment.owner ? result.appointment.owner.name : '', pet: result.appointment.pet ? result.appointment.pet.name : '' }
        });
      }
      renderSuccess(result.appointment);
      if (typeof window.loadUserAppointments === 'function') window.loadUserAppointments();
    } finally {
      _busy = false;
    }
  }

  function init() {
    if (!document.getElementById('checkinOverlay')) return;
    // TODO(BACKEND): authenticated session replaces the local mock session;
    // the clinic QR token is verified server-side before this screen opens.
    var sessionReady = window._getSessionUser && window._getSessionUser();
    if (!sessionReady) return;

    var isCheckinRoute = location.hash.indexOf(CHECKIN_URL_TOKEN) !== -1 ||
      location.search.indexOf(CHECKIN_URL_TOKEN) !== -1;
    if (!isCheckinRoute) return;

    history.replaceState(null, '', location.pathname);
    openOverlay();
    renderIntro();

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-ci-close]')) { e.preventDefault(); closeOverlay(); return; }
      var btn = e.target.closest('[data-ci-checkin]');
      if (btn) { e.preventDefault(); performCheckIn(btn.getAttribute('data-ci-checkin')); return; }
      if (e.target.id === 'checkinOverlay') closeOverlay();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
