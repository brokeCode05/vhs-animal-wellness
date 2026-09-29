/* ============================================================
   AUDIT LOG PAGE — read-only renderer (Admin, Phase 4)

   Renders window.AuditLog entries into the Admin Audit Log table.
   Read-only: no create/update/delete controls. Lightweight filters
   (actor type, action category, date) are view-side only.

   TODO(BACKEND): Replace frontend audit persistence with
   server-generated audit records. When the API exists this page
   reads GET /audit-log (paginated, newest first) instead of the
   shared frontend store.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return esc(iso || '—');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // Human-readable action labels (one row per real recorded action).
  var ACTION_LABELS = {
    appointment_created: 'Booked Appointment',
    appointment_rescheduled: 'Rescheduled Appointment',
    appointment_canceled: 'Cancelled Appointment',
    appointment_rejected: 'Rejected Appointment',
    appointment_approved: 'Approved Appointment',
    patient_checked_in: 'Patient Check-In',
    consultation_started: 'Started Consultation',
    consultation_completed: 'Completed Consultation',
    doctor_availability_changed: 'Availability Changed',
    doctor_activated: 'Doctor Account Activated',
    doctor_deactivated: 'Doctor Account Deactivated',
    doctor_created: 'Doctor Account Created',
    doctor_updated: 'Doctor Profile Updated',
    user_created: 'User Account Created',
    user_activated: 'User Account Activated',
    user_deactivated: 'User Account Deactivated',
    user_updated: 'User Profile Updated',
    pet_registered: 'Pet Registered',
    pet_updated: 'Pet Profile Updated',
    service_created: 'Service Created',
    service_updated: 'Service Updated',
    service_activated: 'Service Activated',
    service_deactivated: 'Service Deactivated',
    service_deleted: 'Service Deleted',
    clinic_settings_updated: 'Clinic Settings Updated'
  };

  var CATEGORIES = {
    appointments: ['appointment_created', 'appointment_rescheduled', 'appointment_canceled',
      'appointment_rejected', 'appointment_approved', 'patient_checked_in'],
    consultations: ['consultation_started', 'consultation_completed'],
    doctors: ['doctor_availability_changed', 'doctor_activated', 'doctor_deactivated',
      'doctor_created', 'doctor_updated'],
    users_pets: ['user_created', 'user_activated', 'user_deactivated', 'user_updated',
      'pet_registered', 'pet_updated'],
    services: ['service_created', 'service_updated', 'service_activated', 'service_deactivated',
      'service_deleted'],
    clinic: ['clinic_settings_updated']
  };
  var CATEGORY_LABELS = {
    appointments: 'Appointments',
    consultations: 'Consultations',
    doctors: 'Doctors',
    users_pets: 'Users & Pets',
    services: 'Services',
    clinic: 'Clinic Settings'
  };

  function categoryOf(action) {
    for (var key in CATEGORIES) {
      if (CATEGORIES[key].indexOf(action) !== -1) return key;
    }
    return 'other';
  }

  var state = { actor: 'all', category: 'all', date: '' };

  function rows() {
    var all = window.AuditLog ? window.AuditLog.getAll() : []; // newest first
    return all.filter(function (e) {
      if (state.actor !== 'all' && e.actorType !== state.actor) return false;
      if (state.category !== 'all') {
        if (state.category === 'other') { if (categoryOf(e.action) !== 'other') return false; }
        else if (categoryOf(e.action) !== state.category) return false;
      }
      if (state.date) {
        var d = new Date(e.timestamp);
        if (isNaN(d) || d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') !== state.date) return false;
      }
      return true;
    });
  }

  function render() {
    var tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    var list = rows();
    var count = document.getElementById('auditCount');
    if (count) count.textContent = list.length + (list.length === 1 ? ' entry' : ' entries');

    if (!list.length) {
      var any = window.AuditLog ? window.AuditLog.getAll().length : 0;
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:2.25rem 1rem;">' +
        (any
          ? 'No audit entries match the current filters.'
          : 'No activity recorded yet. Actions performed in the portals will appear here.') +
        '</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (e) {
      var record = e.referenceNo
        ? esc(e.referenceNo)
        : (e.entityType === 'appointment' ? '—' : esc(e.entityType === 'clinic_settings' ? 'Clinic settings' : (e.entityType || '') + ' #' + (e.entityId || '—')));
      return '<tr>' +
        '<td style="white-space:nowrap;">' + fmtDateTime(e.timestamp) + '</td>' +
        '<td style="white-space:nowrap;">' + esc(e.actorName || e.actorType || '—') +
        (e.actorType ? ' <span class="status-badge info" style="margin-left:0.35rem;">' + esc(e.actorType) + '</span>' : '') + '</td>' +
        '<td>' + esc(ACTION_LABELS[e.action] || e.action) + '</td>' +
        '<td style="white-space:nowrap;">' + record + '</td>' +
        '<td>' + esc(e.description || '') + '</td>' +
        '</tr>';
    }).join('');
  }

  function init() {
    var actorSel = document.getElementById('auditFilterActor');
    var catSel = document.getElementById('auditFilterCategory');
    var dateIn = document.getElementById('auditFilterDate');
    var clearBtn = document.getElementById('auditFilterClear');
    if (actorSel) actorSel.addEventListener('change', function () { state.actor = this.value; render(); });
    if (catSel) catSel.addEventListener('change', function () { state.category = this.value; render(); });
    if (dateIn) dateIn.addEventListener('change', function () { state.date = this.value; render(); });
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state = { actor: 'all', category: 'all', date: '' };
      if (actorSel) actorSel.value = 'all';
      if (catSel) catSel.value = 'all';
      if (dateIn) dateIn.value = '';
      render();
    });
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
