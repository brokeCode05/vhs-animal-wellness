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
    login: 'Logged In',
    logout: 'Logged Out',
    user_login: 'Logged In',
    user_logout: 'Logged Out',
    appointment_created: 'Booked Appointment',
    appointment_rescheduled: 'Rescheduled Appointment',
    appointment_canceled: 'Cancelled Appointment',
    appointment_rejected: 'Rejected Appointment',
    appointment_approved: 'Approved Appointment',
    patient_checked_in: 'Patient Check-In',
    consultation_started: 'Started Consultation',
    consultation_saved: 'Saved Consultation',
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
    account_verified: 'Account Verified',
    password_changed: 'Password Changed',
    password_reset: 'Password Reset',
    pet_registered: 'Pet Registered',
    pet_updated: 'Pet Profile Updated',
    pet_deleted: 'Pet Deleted',
    service_created: 'Service Created',
    service_updated: 'Service Updated',
    service_activated: 'Service Activated',
    service_deactivated: 'Service Deactivated',
    service_deleted: 'Service Deleted',
    clinic_settings_updated: 'Clinic Settings Updated',
    announcement_created: 'Announcement Created',
    announcement_updated: 'Announcement Updated',
    announcement_deleted: 'Announcement Deleted',
    document_viewed: 'Document Viewed',
    appointment_no_show: 'Marked No Show',
    appointment_updated: 'Appointment Updated'
  };

  var CATEGORIES = {
    authentication: ['login', 'logout', 'user_login', 'user_logout',
      'account_verified', 'password_changed', 'password_reset'],
    appointments: ['appointment_created', 'appointment_rescheduled', 'appointment_canceled',
      'appointment_rejected', 'appointment_approved', 'patient_checked_in',
      'appointment_no_show', 'appointment_updated'],
    consultations: ['consultation_started', 'consultation_saved', 'consultation_completed',
      'document_viewed'],
    doctors: ['doctor_availability_changed', 'doctor_activated', 'doctor_deactivated',
      'doctor_created', 'doctor_updated'],
    users_pets: ['user_created', 'user_activated', 'user_deactivated', 'user_updated',
      'pet_registered', 'pet_updated', 'pet_deleted'],
    services: ['service_created', 'service_updated', 'service_activated', 'service_deactivated',
      'service_deleted'],
    clinic: ['clinic_settings_updated', 'announcement_created', 'announcement_updated', 'announcement_deleted']
  };
  var CATEGORY_LABELS = {
    authentication: 'Authentication',
    appointments: 'Appointments',
    consultations: 'Consultations',
    doctors: 'Doctors',
    users_pets: 'Users & Pets',
    services: 'Services',
    clinic: 'Clinic & Announcements'
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
        : (e.entityType === 'appointment'
            ? '—'
            : esc(
                e.entityType === 'clinic_settings'
                  ? 'Clinic settings'
                  : (e.entityType === 'announcement'
                      ? 'Announcement #' + (e.entityId || '—')
                      : (e.entityType === 'document'
                          ? 'Document #' + (e.entityId || '—')
                          : (e.entityType || '') + ' #' + (e.entityId || '—')))
              ));
      // Actor: name as primary text, small muted role label beneath (no badge, no dot).
      var actorCell = '<span style="display:block;font-weight:600;">' + esc(e.actorName || '—') + '</span>' +
        (e.actorType ? '<span style="display:block;font-size:0.75rem;color:#6b7280;">' + esc(e.actorType) + '</span>' : '');
      return '<tr>' +
        '<td style="white-space:nowrap;" data-label="Date &amp; Time">' + fmtDateTime(e.timestamp) + '</td>' +
        '<td data-label="Actor">' + actorCell + '</td>' +
        '<td data-label="Action">' + esc(ACTION_LABELS[e.action] || e.action) + '</td>' +
        '<td style="white-space:nowrap;" data-label="Record / Reference">' + record + '</td>' +
        '<td data-label="Details">' + esc(e.description || '') + '</td>' +
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


  // ------------------------------------------------------------
  // REQ035 request-level access log.
  // This is separate from semantic audit entries so every backend
  // read/write action can be retained without obscuring domain events.
  // ------------------------------------------------------------
  var accessState = { actor: 'all', method: 'all', date: '' };
  var accessCache = [];

  function loadAccessLogs() {
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', '/api/access-logs', false);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      var payload = null;
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) {}

      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        payload &&
        payload.data &&
        Array.isArray(payload.data.accessLogs)
      ) {
        accessCache = payload.data.accessLogs.slice();
      }
    } catch (e) {
      accessCache = [];
    }

    return accessCache;
  }

  function filteredAccessRows() {
    return loadAccessLogs().filter(function (e) {
      if (accessState.actor !== 'all' && e.actorType !== accessState.actor) return false;
      if (accessState.method !== 'all' && e.method !== accessState.method) return false;

      if (accessState.date) {
        var d = new Date(e.createdAt);
        if (isNaN(d)) return false;
        var key = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
        if (key !== accessState.date) return false;
      }

      return true;
    });
  }

  function accessResult(status) {
    status = Number(status || 0);
    if (status >= 200 && status < 300) return 'Success (' + status + ')';
    if (status >= 400 && status < 500) return 'Denied / Invalid (' + status + ')';
    if (status >= 500) return 'Server Error (' + status + ')';
    return String(status || '—');
  }

  function renderAccessLogs() {
    var tbody = document.getElementById('accessTableBody');
    if (!tbody) return;

    var list = filteredAccessRows();
    var count = document.getElementById('accessCount');
    if (count) count.textContent = list.length + (list.length === 1 ? ' request' : ' requests');

    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:2.25rem 1rem;">' +
        'No access entries match the current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (e) {
      var actorCell =
        '<span style="display:block;font-weight:600;">' + esc(e.actorName || '—') + '</span>' +
        (e.actorType
          ? '<span style="display:block;font-size:0.75rem;color:#6b7280;">' + esc(e.actorType) + '</span>'
          : '');

      return '<tr>' +
        '<td style="white-space:nowrap;" data-label="Date & Time">' + fmtDateTime(e.createdAt) + '</td>' +
        '<td data-label="Actor">' + actorCell + '</td>' +
        '<td data-label="Method"><strong>' + esc(e.method || '—') + '</strong></td>' +
        '<td data-label="Endpoint"><code>' + esc(e.path || '—') + '</code></td>' +
        '<td data-label="Result">' + esc(accessResult(e.statusCode)) + '</td>' +
        '</tr>';
    }).join('');
  }

  function setAuditView(view) {
    var semantic = document.getElementById('semanticAuditSection');
    var access = document.getElementById('accessAuditSection');
    var semanticBtn = document.getElementById('showSemanticAudit');
    var accessBtn = document.getElementById('showAccessAudit');

    if (!semantic || !access) return;

    var accessMode = view === 'access';
    semantic.style.display = accessMode ? 'none' : '';
    access.style.display = accessMode ? '' : 'none';

    if (semanticBtn) semanticBtn.setAttribute('aria-pressed', accessMode ? 'false' : 'true');
    if (accessBtn) accessBtn.setAttribute('aria-pressed', accessMode ? 'true' : 'false');

    if (accessMode) renderAccessLogs();
  }

  function initAccessLog() {
    var semanticBtn = document.getElementById('showSemanticAudit');
    var accessBtn = document.getElementById('showAccessAudit');
    var actorSel = document.getElementById('accessFilterActor');
    var methodSel = document.getElementById('accessFilterMethod');
    var dateIn = document.getElementById('accessFilterDate');
    var clearBtn = document.getElementById('accessFilterClear');

    if (semanticBtn) semanticBtn.addEventListener('click', function () { setAuditView('semantic'); });
    if (accessBtn) accessBtn.addEventListener('click', function () { setAuditView('access'); });

    if (actorSel) actorSel.addEventListener('change', function () {
      accessState.actor = this.value;
      renderAccessLogs();
    });

    if (methodSel) methodSel.addEventListener('change', function () {
      accessState.method = this.value;
      renderAccessLogs();
    });

    if (dateIn) dateIn.addEventListener('change', function () {
      accessState.date = this.value;
      renderAccessLogs();
    });

    if (clearBtn) clearBtn.addEventListener('click', function () {
      accessState = { actor: 'all', method: 'all', date: '' };
      if (actorSel) actorSel.value = 'all';
      if (methodSel) methodSel.value = 'all';
      if (dateIn) dateIn.value = '';
      renderAccessLogs();
    });

    setAuditView('semantic');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      initAccessLog();
    });
  } else {
    init();
    initAccessLog();
  }
})();
