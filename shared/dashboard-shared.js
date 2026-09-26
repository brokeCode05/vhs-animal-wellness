/* ============================================

   VHS DASHBOARD SHARED — Common logic for

   Admin and Clerk dashboards.

   Loaded AFTER vhs-ui.js, BEFORE role script.

   VHS_TIME_SLOTS is defined in vhs-ui.js.

   ============================================ */



const _PAW_SVG = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><ellipse cx="22" cy="18" rx="8" ry="10"/><ellipse cx="42" cy="18" rx="8" ry="10"/><ellipse cx="10" cy="34" rx="7" ry="9"/><ellipse cx="54" cy="34" rx="7" ry="9"/><path d="M32 36c-10 0-18 7-18 14s4 10 10 10c4 0 6-2 8-6 2 4 4 6 8 6 6 0 10-5 10-10s-8-14-18-14z"/></svg>';

const _PAW_TRAIL = '<div class="loader-paws"><div class="loader-paw">' + _PAW_SVG + '</div><div class="loader-paw">' + _PAW_SVG + '</div><div class="loader-paw">' + _PAW_SVG + '</div><div class="loader-paw">' + _PAW_SVG + '</div></div>';



// ─── MOBILE SIDEBAR ───────────────────────────────────────────────────────────



let _overlay = null;



function getSidebarOverlay() {

  if (!_overlay) {

    _overlay = document.createElement('div');

    _overlay.className = 'sidebar-overlay';

    document.body.appendChild(_overlay);

    _overlay.addEventListener('click', closeMobileSidebar);

  }

  return _overlay;

}



function openMobileSidebar() {

  document.querySelector('.sidebar')?.classList.add('open');

  getSidebarOverlay().classList.add('show');

  document.querySelector('.hamburger-menu')?.classList.add('active');

}



function closeMobileSidebar() {

  document.querySelector('.sidebar')?.classList.remove('open');

  getSidebarOverlay().classList.remove('show');

  document.querySelector('.hamburger-menu')?.classList.remove('active');

}



function toggleSidebar() {

  document.querySelector('.sidebar')?.classList.contains('open')

    ? closeMobileSidebar() : openMobileSidebar();

}



// ─── LOGOUT ───────────────────────────────────────────────────────────────────



function initLogout() {

  document.getElementById('logoutBtn')?.addEventListener('click', function(e) {

    e.preventDefault();

    confirmAction('Are you sure you want to logout?', function() {

      sessionStorage.clear();

      var loader = document.createElement('div');

      loader.className = 'page-loader';

      loader.innerHTML = '<div class="loader-content">' + _PAW_TRAIL + '<div class="loader-text">Logging out</div><div class="loader-subtext">VHS</div></div>';

      document.body.appendChild(loader);

      setTimeout(function() { window.location.href = '../web-page/index.html'; }, 1000);

    }, {

      title: 'Logout',

      icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'

    });

  });

}



// ─── ROW REMOVAL ─────────────────────────────────────────────────────────────



function removeRow(id) {

  var row = document.querySelector('tr[data-id="' + id + '"]');

  if (row) {

    row.style.transition = 'opacity 0.3s';

    row.style.opacity = '0';

    setTimeout(function() { row.remove(); }, 300);

  }

}



// ─── APPOINTMENT DATA LOADING ─────────────────────────────────────────────────



// ─── TODAY'S SCHEDULE (clerk dashboard) ───────────────────────────────────
// Compact same-day list for #todayScheduleTable. Columns mirror the dashboard
// markup (Time/Owner/Pet/Service/Type/Status); reference_no is surfaced as the
// Type cell until the backend serves a real visit type.
// TODO(BACKEND): get_appointments.php must include reference_no so this shows
// the same identifiers the User and Doctor portals display.
function renderTodaysScheduleTable(all) {

  var tbody = document.getElementById('todayScheduleTable');

  if (!tbody) return;

  if (!all.length) {

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">No appointments today.</td></tr>';

    return;

  }

  var contract = window.AppointmentContract;

  var rows = all.map(function(raw) {

    var a = contract ? contract.toLegacyDisplay(contract.fromLegacy(raw)) : raw;

    // Check-In targets confirmed appointments arriving today.

    var checkInBtn = a.status === 'confirmed'

      ? '<button class="btn-small btn-success" onclick="openCheckInModal(\'' + a.reference_no + '\')">Check In</button> '

      : '';

    return '<tr data-id="' + a.id + '" data-status="' + a.status + '">' +

      '<td>' + formatDateTime(a.date, a.time) + '</td>' +

      '<td>' + (a.owner_name || '—') + '</td>' +

      '<td>' + (a.pet_name   || '—') + '</td>' +

      '<td>' + (a.service    || '—') + '</td>' +

      '<td><span class="status-badge info">' + (a.reference_no || '#A' + String(a.id).slice(-3).padStart(3, '0')) + '</span></td>' +

      '<td>' + statusBadge(a.status) + '</td>' +

      '<td class="action-cell">' + (checkInBtn || '<span style="color:#9ca3af;">—</span>') + '</td>' +

      '</tr>';

  });

  tbody.innerHTML = rows.join('');

}



function loadAppointments() {

  // Backend data first; the shared canonical mock dataset keeps Clerk (and
  // the calendar) populated for frontend-only testing until the API is live.
  // TODO(BACKEND): Remove the mock fallback once get_appointments.php is wired.
  function useSharedMock(reason) {
    if (reason) console.warn('loadAppointments fallback to shared mock:', reason);
    var source = (window.SharedMockAppointments && window.SharedMockAppointments.all()) || [];
    var all = source.map(function(a) {
      return window.AppointmentContract ? window.AppointmentContract.toLegacyDisplay(window.AppointmentContract.fromLegacy(a)) : a;
    });
    var mockToday = (window.SharedMockAppointments && window.SharedMockAppointments.today) || new Date().toISOString().split('T')[0];
    renderTodaysScheduleTable(all.filter(function(a) { return a.date === mockToday; }));
    renderAllAppointmentsTable(all);
    CalendarState.appointments = all.map(function(a) {
      return { id: a.id, date: a.date, owner: a.owner_name, pet: a.pet_name, service: a.service, status: a.status, type: a.status };
    });
    generateCalendar();
  }

  fetch('../php_files/get_appointments.php')

    .then(function(r) { return r.json(); })

    .then(function(data) {

      if (data.status !== 'success') {

        showToast('Failed to load appointments.', 'error');

        useSharedMock('status ' + data.status);

        return;

      }

      var all = data.appointments;

      renderTodaysScheduleTable(all.filter(function(a) { return a.date === new Date().toISOString().split('T')[0]; }));

      renderAllAppointmentsTable(all);

      CalendarState.appointments = all.map(function(a) {

      return {

        id:      a.id,

        date:    a.date,

        owner:   a.owner_name,

        pet:     a.pet_name,

        service: a.service,

        status:  a.status,

        type:    a.status

      };

    });

      generateCalendar();

    })

    .catch(function(err) { useSharedMock(err.message); });

}



function formatDateTime(date, time) {

  if (!date) return '—';

  var parts = date.split('-');

  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

  var dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!time) return dateStr;

  var timeStr = time;

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) {

    var tp = time.split(':');

    var h = parseInt(tp[0], 10), m = parseInt(tp[1], 10);

    var ampm = h >= 12 ? 'PM' : 'AM';

    timeStr = (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ampm;

  }

  return dateStr + '<br><small>' + timeStr + '</small>';

}



function capitalize(str) {

  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

}



function statusBadge(status) {

  // Accepts legacy and canonical values; renders the canonical lifecycle.
  var canonical = window.AppointmentContract ? window.AppointmentContract.normalizeStatus(status) : String(status || '').toLowerCase();
  var map = { pending: 'pending', confirmed: 'scheduled', checked_in: 'confirmed', in_consultation: 'in-consultation', completed: 'completed', canceled: 'cancelled', no_show: 'cancelled', rescheduled: 'pending' };

  var cls = map[canonical] || 'info';

  var label = { checked_in: 'Checked In', in_consultation: 'In Consultation', no_show: 'No Show', rescheduled: 'Rescheduled' }[canonical] || capitalize(canonical);

  return '<span class="status-badge ' + cls + '">' + label + '</span>';

}



function applyAllAppointmentsFilter() {

  var statusVal = (document.getElementById('filterStatus')?.value || 'all').toLowerCase();

  var dateVal   = document.getElementById('filterDate')?.value || '';

  var searchVal = (document.getElementById('searchAppointments')?.value || '').toLowerCase();

  document.querySelectorAll('#allAppointmentsTable tr[data-id]').forEach(function(row) {

    var rowStatus = (row.getAttribute('data-status') || '').toLowerCase();

    var rowText   = row.textContent.toLowerCase();

    var statusOk  = statusVal === 'all' || rowStatus === statusVal;

    var dateOk    = !dateVal || row.textContent.includes(

      new Date(dateVal).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    );

    var searchOk  = !searchVal || rowText.includes(searchVal);

    row.style.display = (statusOk && dateOk && searchOk) ? '' : 'none';

  });

}



function filterAppointments() {

  applyAllAppointmentsFilter();

}



// ─── SHARED APPOINTMENT STATUS UPDATE ────────────────────────────────────────

// Note: admin version accepts an optional onSuccess callback; clerk version does not.

// Both are handled here — onSuccess is simply ignored if not provided.



function _updateAppointmentStatus(id, newStatus, successMsg, onSuccess) {

  fetch('../php_files/update_appointment_status.php', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ id: id, status: newStatus })

  })

    .then(function(r) { return r.json(); })

    .then(function(data) {

      if (data.status === 'success') {

        showToast(successMsg, newStatus === 'canceled' ? 'warning' : 'success');

        if (onSuccess) onSuccess();

        loadAppointments();

      } else {

        showToast('Error: ' + (data.message || 'Update failed'), 'error');

      }

    })

    .catch(function() { showToast('Network error.', 'error'); });

}



// ─── SHARED APPOINTMENT ACTIONS ───────────────────────────────────────────────



function approveAppointment(id) {

  confirmAction('Approve this appointment?', function() {

    _updateAppointmentStatus(id, 'scheduled', 'Appointment approved!', function() {

      // updateBadge is admin-only; safe to call — it's a no-op if element missing

      if (typeof updateBadge === 'function') {

        updateBadge('.nav-item[href="appointments.html"] .badge-count', -1);

      }

    });

  }, {

    title: 'Approve Appointment',

    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',

    accent: 'success'

  });

}



function rejectAppointment(id) {

  showPrompt('Reason for rejection (optional):', '', function(reason) {

    if (reason === null) return;

    _updateAppointmentStatus(id, 'canceled', 'Appointment rejected.', function() {

      if (typeof updateBadge === 'function') {

        updateBadge('.nav-item[href="appointments.html"] .badge-count', -1);

      }

    });

  }, {

    title: 'Reject Appointment',

    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',

    accent: 'error',

    placeholder: 'Enter reason (optional)...'

  });

}



function markComplete(id) {

  confirmAction('Mark this appointment as completed?', function() {

    _updateAppointmentStatus(id, 'completed', 'Marked as completed!');

  }, {

    title: 'Mark Complete',

    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',

    accent: 'success'

  });

}



function cancelAppointment(id) {

  confirmAction('Cancel this appointment?', function() {

    _updateAppointmentStatus(id, 'canceled', 'Appointment cancelled.');

  }, {

    title: 'Cancel Appointment',

    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',

    danger: true

  });

}



// ─── APPOINTMENT DETAILS PANEL (shared, canonical data only) ──────────────────
// One detail view for every entry point (table View button, calendar item,
// check-in follow-up). Resolves by appointmentId through the shared mock
// layer when present, otherwise through the last loaded table rows.
// TODO(BACKEND): Replace the resolver with GET appointment by id/referenceNo.
function _findCanonicalAppointment(idOrRef) {
  var shared = window.SharedMockAppointments;
  if (shared) {
    var hit = shared.byId(idOrRef) || shared.byReference(idOrRef);
    if (hit) return hit;
  }
  var raw = (CalendarState.appointments || []).find(function(a) { return String(a.id) === String(idOrRef); });
  return raw || null;
}function openAppointmentDetails(idOrRef) {

  var modal = document.getElementById('appointmentDetailsModal');

  // Pages without the details markup (Admin) keep their previous placeholder.

  if (!modal) { if (typeof showUnderWork === 'function') showUnderWork('Appointment detail view'); return; }
  var raw = _findCanonicalAppointment(idOrRef);
  var body = document.getElementById('appointmentDetailsBody');
  if (!raw) {
    if (body) body.innerHTML = '<p style="text-align:center;color:#6b7280;padding:1rem 0;">Appointment not found.</p>';
    document.getElementById('appointmentDetailsActions').style.display = 'none';
    modal.classList.add('show');
    document.body.classList.add('modal-open');
    return;
  }
  var a = window.AppointmentContract
    ? window.AppointmentContract.toLegacyDisplay(window.AppointmentContract.fromLegacy(raw))
    : raw;
  var checkedIn = '';
  if (a.checked_in_at) {
    var d = new Date(a.checked_in_at);
    checkedIn = isNaN(d)
      ? String(a.checked_in_at)
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  var rows = [
    ['Reference ID', a.reference_no || '—'],
    ['Owner', a.owner_name || '—'],
    ['Pet', (a.pet_name || '—') + (a.pet_type ? ' (' + a.pet_type + (a.pet_breed ? ' / ' + a.pet_breed : '') + ')' : '')],
    ['Service', a.service || '—'],
    ['Date', _fmtDetailsDate(a.date)],
    ['Time', _fmtDetailsTime(a.time)],
    ['Visit context', a.visit_reason || '—'],
    ['Notes / symptoms', a.notes || '—'],
    ['Status', statusBadge(a.status)]
  ];
  if (checkedIn) rows.push(['Checked in', checkedIn]);
  if (body) {
    body.innerHTML = '<div style="border:1px solid #e5e7eb;border-radius:0.75rem;overflow:hidden;">' +
      rows.map(function(r) {
        return '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.5rem 0.75rem;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">' +
          '<span style="color:#6b7280;flex-shrink:0;">' + r[0] + '</span>' +
          '<span style="text-align:right;font-weight:500;color:#111827;">' + r[1] + '</span>' +
          '</div>';
      }).join('') + '</div>';
  }
  renderAppointmentDetailsActions(a);
  modal.classList.add('show');
  document.body.classList.add('modal-open');
}

function _fmtDetailsDate(dateStr) {
  if (!dateStr) return '—';
  var p = String(dateStr).split('-');
  if (p.length !== 3) return String(dateStr);
  var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  return isNaN(d) ? String(dateStr) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function _fmtDetailsTime(timeStr) {
  var t = String(timeStr || '');
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
    var tp = t.split(':');
    var h = parseInt(tp[0], 10), m = parseInt(tp[1], 10);
    return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  return t || '—';
}

// Status-based action row inside the details panel. Clerk cannot complete a
// consultation — completion belongs to the Doctor workflow.
function renderAppointmentDetailsActions(a) {
  var wrap = document.getElementById('appointmentDetailsActions');
  if (!wrap) return;
  var btns = ['<button type="button" class="btn-secondary" onclick="closeAppointmentDetails()">Close</button>'];
  if (a.status === 'confirmed') {
    btns.unshift('<button type="button" class="btn-primary" onclick="closeAppointmentDetails(); openCheckInModal(\'' + (a.reference_no || a.id) + '\')">Check In Patient</button>');
    if (typeof cancelAppointment === 'function') {
      btns.splice(1, 0, '<button type="button" class="btn-small btn-danger" style="padding:0.55rem 1rem;font-size:0.9rem;" onclick="closeAppointmentDetails(); cancelAppointment(\'' + a.id + '\')">Cancel</button>');
    }
  }
  wrap.style.display = 'flex';
  wrap.innerHTML = btns.join(' ');
}

function closeAppointmentDetails() {
  document.getElementById('appointmentDetailsModal')?.classList.remove('show');
  if (!document.querySelector('.modal-overlay.show')) document.body.classList.remove('modal-open');
}

function viewAppointment(id)  { openAppointmentDetails(id); }

function reschedule(id)       { showUnderWork('Reschedule appointment'); }



// ─── SHARED PET & OWNER ACTIONS ───────────────────────────────────────────────



function viewOwnerProfile(id) {

  var modal = document.getElementById('ownerProfileModal');

  if (!modal) return;



  ['ownerName','ownerEmail','ownerPhone','ownerDob','ownerAddress','ownerRegDate','ownerVisits']

    .forEach(function(elId) {

      var el = document.getElementById(elId);

      if (el) el.textContent = 'Loading...';

    });



  var petsBody = document.getElementById('ownerPetsTable');

  if (petsBody) petsBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Loading...</td></tr>';

  var apptBody = document.getElementById('ownerAppointmentsTable');

  if (apptBody) apptBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">No appointments yet.</td></tr>';



  modal.classList.add('show');



  fetch('../php_files/get_user_profile.php?id=' + id)

    .then(function(r) { return r.json(); })

    .then(function(u) {

      function set(elId, val) {

        var el = document.getElementById(elId);

        if (el) el.textContent = val || '—';

      }

      set('ownerName',    u.fullName);

      set('ownerEmail',   u.email);

      set('ownerPhone',   u.phone);

      set('ownerDob',     u.bday);

      set('ownerAddress', u.address);

      set('ownerRegDate', u.created_at

        ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

        : '—');

      set('ownerVisits', '—');



      if (petsBody) {

        petsBody.innerHTML = u.pets && u.pets.length

          ? u.pets.map(function(p) {

              return '<tr><td>' + p.name + '</td><td>' + p.type + '</td><td>' + p.breed +

                     '</td><td>' + p.age + '</td><td>—</td>' +

                     '<td><button class="btn-small" onclick="viewPetProfile(' + p.id + ')">View</button></td></tr>';

            }).join('')

          : '<tr><td colspan="6" style="text-align:center;color:#888;">No pets registered.</td></tr>';

      }

    })

    .catch(function() {

      showToast('Failed to load owner profile.', 'error');

      modal.classList.remove('show');

    });

}



function closeOwnerProfile() { document.getElementById('ownerProfileModal')?.classList.remove('show'); }

function editOwner(id)       { showUnderWork('Edit owner'); }

function viewPetProfile(id) {

  var modal = document.getElementById('petProfileModal');

  if (!modal) return;



  // Reset fields to loading

  ['petName','petType','petBreed','petAge','petSex','petOwner','petMedicalHistory']

    .forEach(function(elId) {

      var el = document.getElementById(elId);

      if (el) el.textContent = 'Loading...';

    });



  modal.classList.add('show');



  fetch('../php_files/get_pets.php')

    .then(function(r) { return r.json(); })

    .then(function(pets) {

      var pet = Array.isArray(pets) ? pets.find(function(p) { return p.id === id; }) : null;

      if (!pet) {

        showToast('Pet not found.', 'error');

        modal.classList.remove('show');

        return;

      }

      function set(elId, val) {

        var el = document.getElementById(elId);

        if (el) el.textContent = val || '—';

      }

      set('petName', pet.name);

      set('petType', pet.type);

      set('petBreed', pet.breed);

      set('petAge', pet.age ? pet.age + ' years' : '—');

      set('petSex', pet.gender || '—');

      set('petOwner', pet.ownerName || '—');

      set('petMedicalHistory', pet.notes || 'No medical notes on file.');

    })

    .catch(function() {

      showToast('Failed to load pet profile.', 'error');

      modal.classList.remove('show');

    });

}

function closePetProfile()   { document.getElementById('petProfileModal')?.classList.remove('show'); }

function editPet(id)         { showUnderWork('Edit pet'); }

function addNewPet()         { showUnderWork('Pet registration form — will be connected to the user portal pet registration'); }



// ─── SEARCH & FILTER ─────────────────────────────────────────────────────────



function setupSearch(excludeIds) {

  excludeIds = excludeIds || [];

  document.querySelectorAll('input[type="search"]').forEach(function(input) {

    if (excludeIds.indexOf(input.id) !== -1) return;

    input.addEventListener('input', function(e) {

      var term = e.target.value.toLowerCase();

      e.target.closest('section')?.querySelectorAll('.compact-table tbody tr').forEach(function(row) {

        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';

      });

    });

  });

}



function setupFilters(excludeIds) {

  excludeIds = excludeIds || [];

  document.querySelectorAll('select[id^="filter"]').forEach(function(select) {

    if (excludeIds.indexOf(select.id) !== -1) return;

    select.addEventListener('change', function(e) {

      var val = e.target.value.toLowerCase();

      e.target.closest('section')?.querySelectorAll('.compact-table tbody tr').forEach(function(row) {

        row.style.display = (val === 'all' || row.textContent.toLowerCase().includes(val)) ? '' : 'none';

      });

    });

  });

}



function setupTabs() {

  document.querySelectorAll('.tab-btn').forEach(function(btn) {

    btn.addEventListener('click', function() {

      var tab = btn.getAttribute('data-tab');

      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });

      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });

      btn.classList.add('active');

      document.getElementById(tab + '-tab')?.classList.add('active');

    });

  });

}



function setupModals() {

  document.querySelectorAll('.modal-overlay').forEach(function(modal) {

    var startedInsideContent = false;

    modal.addEventListener('mousedown', function(e) {

      var content = modal.querySelector('.modal-content');

      startedInsideContent = content ? content.contains(e.target) : false;

    });

    modal.addEventListener('click', function(e) {

      if (e.target === modal && !startedInsideContent) modal.classList.remove('show');

      startedInsideContent = false;

    });

  });

  document.querySelectorAll('.modal-close').forEach(function(btn) {

    btn.addEventListener('click', function() {

      btn.closest('.modal-overlay')?.classList.remove('show');

    });

  });

}



function autoLabelTables() {

  document.querySelectorAll('.compact-table').forEach(function(table) {

    var headers = [...table.querySelectorAll('thead th')].map(function(th) { return th.textContent.trim(); });

    table.querySelectorAll('tbody tr').forEach(function(row) {

      [...row.querySelectorAll('td')].forEach(function(td, i) {

        if (!td.getAttribute('data-label') && headers[i]) td.setAttribute('data-label', headers[i]);

      });

    });

  });

}



// ─── CALENDAR ─────────────────────────────────────────────────────────────────



var CalendarState = {

  currentMonth: new Date().getMonth(),

  currentYear:  new Date().getFullYear(),

  currentView:  'month',

  appointments: []

};



function generateCalendar() {

  var currentMonth = CalendarState.currentMonth;

  var currentYear  = CalendarState.currentYear;

  var appointments = CalendarState.appointments;



  var grid = document.getElementById('calendarGrid');

  if (!grid) return;

  grid.innerHTML = '';

  grid.classList.remove('week-view', 'day-view');



  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) {

    var h = document.createElement('div');

    h.className = 'calendar-day-header';

    h.textContent = d;

    grid.appendChild(h);

  });



  var firstDay    = new Date(currentYear, currentMonth, 1).getDay();

  var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  var prevLastDay = new Date(currentYear, currentMonth, 0).getDate();

  var today       = new Date();



  for (var i = firstDay - 1; i >= 0; i--) {

    grid.appendChild(makeDayCell(prevLastDay - i, true, currentMonth - 1, currentYear, false));

  }

  for (var d = 1; d <= daysInMonth; d++) {

    var isToday = d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

    grid.appendChild(makeDayCell(d, false, currentMonth, currentYear, isToday));

  }

  var total = grid.children.length - 7;

  for (var d2 = 1; d2 <= 42 - total; d2++) {

    grid.appendChild(makeDayCell(d2, true, currentMonth + 1, currentYear, false));

  }

}



function makeDayCell(day, isOther, month, year, isToday) {

  var el = document.createElement('div');

  el.className = 'calendar-day' + (isOther ? ' other-month' : '') + (isToday ? ' today' : '');

  var num = document.createElement('span');

  num.textContent = day;

  el.appendChild(num);

  if (!isOther) {

    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');



    // Click day cell → open booking modal with this date pre-filled

    el.style.cursor = 'pointer';

    el.addEventListener('click', function(e) {

      // Don't fire if clicking an appointment item inside

      if (e.target.closest('.appointment-item')) return;

      if (typeof window.onCalendarDayClick === 'function') {

        window.onCalendarDayClick(dateStr);

      }

    });



    CalendarState.appointments.filter(function(a) { return a.date === dateStr; }).forEach(function(apt) {

      var item = document.createElement('div');

      item.className = 'appointment-item status-' + (apt.status || 'pending');

      item.innerHTML =

        '<span class="appointment-dot"></span>' +

        '<span class="appointment-badge"><strong>' + apt.owner + '</strong> · ' + apt.pet +

        '<em>' + apt.service + '</em></span>';

      item.onclick = function() {

        // Appointment items open the portal's detail view; the info toast is

        // reserved for short success/error feedback only.

        if (typeof window.onCalendarAppointmentClick === 'function') {

          window.onCalendarAppointmentClick(apt);

        } else {

          showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info');

        }

      };

      el.appendChild(item);

    });

  }

  return el;

}



function updateCalendarDisplay() {

  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var el = document.getElementById('calendarMonth');

  var view = CalendarState.currentView;



  if (view === 'week') {

    var weekStart = getWeekStart(new Date(CalendarState.currentYear, CalendarState.currentMonth, CalendarState.currentDay || new Date().getDate()));

    var weekEnd = new Date(weekStart);

    weekEnd.setDate(weekEnd.getDate() + 6);

    if (el) el.textContent = months[weekStart.getMonth()] + ' ' + weekStart.getDate() + ' – ' + (weekEnd.getMonth() !== weekStart.getMonth() ? months[weekEnd.getMonth()] + ' ' : '') + weekEnd.getDate() + ', ' + weekEnd.getFullYear();

    generateWeekView();

  } else if (view === 'day') {

    var d = CalendarState.currentDay || new Date().getDate();

    var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    var dayDate = new Date(CalendarState.currentYear, CalendarState.currentMonth, d);

    if (el) el.textContent = dayNames[dayDate.getDay()] + ', ' + months[CalendarState.currentMonth] + ' ' + d + ', ' + CalendarState.currentYear;

    generateDayView(d);

  } else {

    if (el) el.textContent = months[CalendarState.currentMonth] + ' ' + CalendarState.currentYear;

    generateCalendar();

  }

}



function getWeekStart(date) {

  var d = new Date(date);

  var day = d.getDay();

  d.setDate(d.getDate() - day);

  d.setHours(0,0,0,0);

  return d;

}



// ─── WEEK VIEW ───────────────────────────────────────────────────────────────

function generateWeekView() {

  var grid = document.getElementById('calendarGrid');

  if (!grid) return;

  grid.innerHTML = '';

  grid.classList.add('week-view');

  grid.classList.remove('day-view');



  var weekStart = getWeekStart(new Date(CalendarState.currentYear, CalendarState.currentMonth, CalendarState.currentDay || new Date().getDate()));

  var today = new Date();

  var dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];



  // Build array of 7 date objects and their per-day slots

  var days = [];

  var daySlots = [];

  for (var i = 0; i < 7; i++) {

    var d = new Date(weekStart);

    d.setDate(d.getDate() + i);

    days.push(d);

    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

    daySlots.push(typeof getVHSTimeSlots === 'function' ? getVHSTimeSlots(ds) : VHS_TIME_SLOTS);

  }



  // Union of all time slots across the week (to ensure consistent rows)

  var allSlots = [

    { label: '8:00 AM', hour: 8 },

    { label: '9:00 AM', hour: 9 },

    { label: '10:00 AM', hour: 10 },

    { label: '11:00 AM', hour: 11 },

    { label: '12:00 PM', hour: 12 },

    { label: '1:00 PM', hour: 13 },

    { label: '2:00 PM', hour: 14 },

    { label: '3:00 PM', hour: 15 },

    { label: '4:00 PM', hour: 16 },

    { label: '5:00 PM', hour: 17 },

    { label: '6:00 PM', hour: 18 },

  ];

  // Filter to only hours that at least one day in this week is open

  var activeHours = [];

  allSlots.forEach(function(s) {

    for (var j = 0; j < 7; j++) {

      if (daySlots[j].indexOf(s.label) !== -1) { activeHours.push(s); break; }

    }

  });



  // Header row: empty corner + 7 day columns

  var corner = document.createElement('div');

  corner.className = 'week-corner';

  grid.appendChild(corner);



  for (var i = 0; i < 7; i++) {

    var h = document.createElement('div');

    h.className = 'week-day-header';

    var isToday = days[i].getDate() === today.getDate() && days[i].getMonth() === today.getMonth() && days[i].getFullYear() === today.getFullYear();

    if (isToday) h.classList.add('today');

    h.innerHTML = '<span class="week-day-name">' + dayNames[i] + '</span><span class="week-day-num">' + days[i].getDate() + '</span>';

    grid.appendChild(h);

  }



  // Time rows — only show hours where at least one day is open

  activeHours.forEach(function(slot) {

    var timeLabel = document.createElement('div');

    timeLabel.className = 'week-time-label';

    timeLabel.textContent = slot.label;

    grid.appendChild(timeLabel);



    for (var j = 0; j < 7; j++) {

      var cell = document.createElement('div');

      var isOpen = daySlots[j].indexOf(slot.label) !== -1;

      cell.className = 'week-cell' + (isOpen ? '' : ' week-cell--closed');

      var dateStr = days[j].getFullYear() + '-' + String(days[j].getMonth() + 1).padStart(2, '0') + '-' + String(days[j].getDate()).padStart(2, '0');



      if (isOpen) {

        var slotApts = CalendarState.appointments.filter(function(a) { return a.date === dateStr && a.time === slot.label; });

        slotApts.forEach(function(apt) {

          var item = document.createElement('div');

          item.className = 'week-apt status-' + (apt.status || 'pending');

          item.innerHTML = '<strong>' + apt.owner + '</strong><span>' + apt.pet + '</span>';

          item.onclick = function() { showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info'); };

          cell.appendChild(item);

        });

        cell.style.cursor = 'pointer';

        (function(ds, sl) {

          cell.addEventListener('click', function(e) {

            if (e.target.closest('.week-apt')) return;

            if (typeof window.onCalendarDayClick === 'function') window.onCalendarDayClick(ds, sl);

          });

        })(dateStr, slot.label);

      }

      grid.appendChild(cell);

    }

  });

}



// ─── DAY VIEW ────────────────────────────────────────────────────────────────

function generateDayView(day) {

  var grid = document.getElementById('calendarGrid');

  if (!grid) return;

  grid.innerHTML = '';

  grid.classList.add('day-view');

  grid.classList.remove('week-view');



  var today = new Date();

  var dateStr = CalendarState.currentYear + '-' + String(CalendarState.currentMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');

  var isToday = day === today.getDate() && CalendarState.currentMonth === today.getMonth() && CalendarState.currentYear === today.getFullYear();



  // Use day-specific slots from the operating hours

  var slots = typeof getVHSTimeSlots === 'function' ? getVHSTimeSlots(dateStr) : VHS_TIME_SLOTS;



  // Header

  var header = document.createElement('div');

  header.className = 'day-header' + (isToday ? ' today' : '');

  header.innerHTML = '<span class="day-header-label">Time</span><span class="day-header-label">Appointments</span>';

  grid.appendChild(header);



  // Time rows

  slots.forEach(function(slot) {

    var row = document.createElement('div');

    row.className = 'day-row';



    var timeLabel = document.createElement('div');

    timeLabel.className = 'day-time-label';

    timeLabel.textContent = slot;

    row.appendChild(timeLabel);



    var cell = document.createElement('div');

    cell.className = 'day-cell';

    var slotApts = CalendarState.appointments.filter(function(a) { return a.date === dateStr && a.time === slot; });

    slotApts.forEach(function(apt) {

      var item = document.createElement('div');

      item.className = 'day-apt status-' + (apt.status || 'pending');

      item.innerHTML = '<strong>' + apt.owner + '</strong> · ' + apt.pet + ' — <em>' + apt.service + '</em>';

      item.onclick = function() { showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info'); };

      cell.appendChild(item);

    });

    cell.style.cursor = 'pointer';

    (function(ds, sl) {

      cell.addEventListener('click', function(e) {

        if (e.target.closest('.day-apt')) return;

        if (typeof window.onCalendarDayClick === 'function') window.onCalendarDayClick(ds, sl);

      });

    })(dateStr, slot);

    row.appendChild(cell);

    grid.appendChild(row);

  });

}



function previousMonth() {

  var view = CalendarState.currentView;

  if (view === 'week') {

    var ws = getWeekStart(new Date(CalendarState.currentYear, CalendarState.currentMonth, CalendarState.currentDay || 1));

    ws.setDate(ws.getDate() - 7);

    CalendarState.currentMonth = ws.getMonth();

    CalendarState.currentYear = ws.getFullYear();

    CalendarState.currentDay = ws.getDate();

  } else if (view === 'day') {

    var dd = (CalendarState.currentDay || 1) - 1;

    if (dd < 1) {

      CalendarState.currentMonth--;

      if (CalendarState.currentMonth < 0) { CalendarState.currentMonth = 11; CalendarState.currentYear--; }

      dd = new Date(CalendarState.currentYear, CalendarState.currentMonth + 1, 0).getDate();

    }

    CalendarState.currentDay = dd;

  } else {

    if (--CalendarState.currentMonth < 0) { CalendarState.currentMonth = 11; CalendarState.currentYear--; }

  }

  updateCalendarDisplay();

}

function nextMonth() {

  var view = CalendarState.currentView;

  if (view === 'week') {

    var ws = getWeekStart(new Date(CalendarState.currentYear, CalendarState.currentMonth, CalendarState.currentDay || 1));

    ws.setDate(ws.getDate() + 7);

    CalendarState.currentMonth = ws.getMonth();

    CalendarState.currentYear = ws.getFullYear();

    CalendarState.currentDay = ws.getDate();

  } else if (view === 'day') {

    var dd = (CalendarState.currentDay || 1) + 1;

    var maxDay = new Date(CalendarState.currentYear, CalendarState.currentMonth + 1, 0).getDate();

    if (dd > maxDay) {

      CalendarState.currentMonth++;

      if (CalendarState.currentMonth > 11) { CalendarState.currentMonth = 0; CalendarState.currentYear++; }

      dd = 1;

    }

    CalendarState.currentDay = dd;

  } else {

    if (++CalendarState.currentMonth > 11) { CalendarState.currentMonth = 0; CalendarState.currentYear++; }

  }

  updateCalendarDisplay();

}

function goToToday() {

  var t = new Date();

  CalendarState.currentMonth = t.getMonth();

  CalendarState.currentYear  = t.getFullYear();

  CalendarState.currentDay = t.getDate();

  updateCalendarDisplay();

  showToast('Showing today', 'info');

}

function setCalendarView(view) {

  CalendarState.currentView = view;

  CalendarState.currentDay = CalendarState.currentDay || new Date().getDate();

  document.querySelectorAll('.calendar-view-toggle .btn-small').forEach(function(btn) {

    btn.classList.toggle('active', btn.getAttribute('data-view') === view);

  });

  updateCalendarDisplay();

}



// ─── SHARED INIT (called by each role script's DOMContentLoaded) ──────────────



function initDashboardShared() {

  initLogout();

  setupSearch(['searchAppointments']);

  setupFilters(['filterStatus', 'filterDate', 'filterType', 'statusFilter']);

  setupTabs();

  setupModals();

  autoLabelTables();



  document.getElementById('hamburgerMenu')?.addEventListener('click', toggleSidebar);

  document.querySelectorAll('.sidebar .nav-item').forEach(function(item) {

    item.addEventListener('click', function() {

      if (window.innerWidth <= 768) closeMobileSidebar();

    });

  });

  window.addEventListener('resize', function() {

    if (window.innerWidth > 768) closeMobileSidebar();

  });



  if (document.getElementById('calendarGrid')) updateCalendarDisplay();



  // Clerk dashboard “Today's Schedule”: feed from the shared canonical mock
  // dataset so the same test records appear across User/Clerk/Doctor.
  // TODO(BACKEND): Once get_appointments.php is live, renderTodaysScheduleTable
  // is called from loadAppointments() with real same-day rows instead.
  // Portal hook: calendar appointment items open the shared details panel
  // (clerk-script.js defines this; guarded so Admin keeps the info toast).
  if (typeof window.onCalendarAppointmentClick !== 'function') {
    window.onCalendarAppointmentClick = function(apt) {
      if (apt && apt.id) { openAppointmentDetails(apt.id); return; }
      showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info');
    };
  }

  if (document.getElementById('todayScheduleTable') && window.SharedMockAppointments) {

    var sharedToday = window.SharedMockAppointments.today || new Date().toISOString().split('T')[0];

    renderTodaysScheduleTable(window.SharedMockAppointments.all().map(function(a) {

      return window.AppointmentContract ? window.AppointmentContract.toLegacyDisplay(window.AppointmentContract.fromLegacy(a)) : a;

    }).filter(function(a) { return a.date === sharedToday; }));

  }



  if (document.getElementById('allAppointmentsTable')) {

    loadAppointments();

    ['filterStatus', 'filterDate'].forEach(function(id) {

      document.getElementById(id)?.addEventListener('change', applyAllAppointmentsFilter);

    });

    document.getElementById('searchAppointments')?.addEventListener('input', applyAllAppointmentsFilter);

  }

}



// ─── CUSTOM SEARCHABLE DROPDOWN ───────────────────────────────────────────────

var _cdAllPanels = [];  // global registry of all custom dropdowns

// Render the SHARED service catalog (shared/mock-users.js) into a booking
// select, grouped by category. Keeps Clerk/Admin booking in sync with the
// User portal — one canonical list, no per-portal variants.
// TODO(BACKEND): replace the source with a vet_services fetch; option values
// stay the canonical service values (FK-ready).
function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function _renderSharedServiceOptions(selectId) {
  var select = document.getElementById(selectId);
  if (!select || !window.SharedMockUsers) return;
  var services = window.SharedMockUsers.services();
  if (!services.length) return;
  var groups = {};
  services.forEach(function (s) {
    (groups[s.group] = groups[s.group] || []).push(s);
  });
  select.innerHTML = '<option value="">Choose a service</option>' +
    Object.keys(groups).map(function (g) {
      return '<optgroup label="' + _esc(g) + '">' + groups[g].map(function (s) {
        return '<option value="' + _esc(s.value) + '">' + _esc(s.label) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  var wrap = select.closest('.form-group');
  var trigger = wrap ? wrap.querySelector('.cd-trigger') : null;
  if (trigger) trigger.classList.remove('cd-active');
}

function initCustomDropdown(selectId, opts) {
  opts = opts || {};
  var select = document.getElementById(selectId);
  if (!select) return;
  var placeholder = opts.placeholder || select.options[0]?.text || 'Select...';
  var searchPlaceholder = opts.searchPlaceholder || 'Search...';
  var emptyText = opts.emptyText || 'No options found';

  // Build trigger button
  var trigger = document.createElement('div');
  trigger.className = 'cd-trigger';
  trigger.tabIndex = 0;
  trigger.innerHTML = '<span class="cd-trigger-text">' + placeholder + '</span><svg class="cd-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
  select.parentNode.insertBefore(trigger, select.nextSibling);
  select.style.display = 'none';

  // Build dropdown panel
  var panel = document.createElement('div');
  panel.className = 'cd-panel';
  panel.innerHTML = '<div class="cd-search-wrap"><input type="text" class="cd-search" placeholder="' + searchPlaceholder + '" /></div><div class="cd-options"></div>';
  trigger.parentNode.insertBefore(panel, trigger.nextSibling);

  var searchInput = panel.querySelector('.cd-search');
  var optionsWrap = panel.querySelector('.cd-options');
  var isOpen = false;

  // Render options grouped by optgroup
  function renderOptions(filter) {
    optionsWrap.innerHTML = '';
    var filterLower = (filter || '').toLowerCase();
    var groups = [];
    var currentGroup = { label: '', options: [] };

    Array.from(select.options).forEach(function(opt) {
      if (opt.parentElement.tagName === 'OPTGROUP') {
        if (opt.parentElement !== (currentGroup._optgroup || null)) {
          if (currentGroup.options.length) groups.push(currentGroup);
          currentGroup = { label: opt.parentElement.label, options: [], _optgroup: opt.parentElement };
        }
      } else {
        if (currentGroup.options.length || currentGroup.label) {
          groups.push(currentGroup);
          currentGroup = { label: '', options: [] };
        }
      }
      if (opt.value && opt.text.toLowerCase().indexOf(filterLower) !== -1) {
        currentGroup.options.push(opt);
      }
    });
    if (currentGroup.options.length || (!currentGroup.label && groups.length === 0)) {
      groups.push(currentGroup);
    }

    groups.forEach(function(grp) {
      if (grp.options.length === 0) return;
      if (grp.label) {
        var gh = document.createElement('div');
        gh.className = 'cd-group-label';
        gh.textContent = grp.label;
        optionsWrap.appendChild(gh);
      }
      grp.options.forEach(function(opt) {
        var item = document.createElement('div');
        item.className = 'cd-option';
        item.textContent = opt.text;
        item.dataset.value = opt.value;
        if (opt.value === select.value) item.classList.add('selected');
        item.addEventListener('click', function() {
          select.value = opt.value;
          trigger.querySelector('.cd-trigger-text').textContent = opt.text;
          closePanel();
          select.dispatchEvent(new Event('change'));
        });
        optionsWrap.appendChild(item);
      });
    });

    if (optionsWrap.children.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cd-option cd-empty';
      empty.textContent = emptyText;
      optionsWrap.appendChild(empty);
    }
  }

  function syncDisplay() {
    var selOpt = select.options[select.selectedIndex];
    if (selOpt && selOpt.value) {
      trigger.querySelector('.cd-trigger-text').textContent = selOpt.text;
    } else {
      trigger.querySelector('.cd-trigger-text').textContent = placeholder;
    }
  }

  function openPanel() {
    // Close all other open panels first
    _cdAllPanels.forEach(function(other) {
      if (other.panel !== panel && other.isOpen()) other.close();
    });
    isOpen = true;
    panel.classList.add('open');
    trigger.classList.add('active');
    renderOptions('');
    searchInput.value = '';
    setTimeout(function() { searchInput.focus(); }, 50);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    trigger.classList.remove('active');
  }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    isOpen ? closePanel() : openPanel();
  });

  trigger.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen ? closePanel() : openPanel(); }
    if (e.key === 'Escape') closePanel();
  });

  searchInput.addEventListener('input', function() {
    renderOptions(searchInput.value);
  });

  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closePanel(); trigger.focus(); }
  });

  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!trigger.contains(e.target) && !panel.contains(e.target)) closePanel();
  });

  // Register in global registry
  _cdAllPanels.push({ panel: panel, isOpen: function() { return isOpen; }, close: closePanel });

  // Sync initial display
  syncDisplay();

  // Watch for dynamic option changes (e.g. client loads pets, date loads time slots)
  var observer = new MutationObserver(function() { syncDisplay(); });
  observer.observe(select, { childList: true });

  // Expose refresh for dynamic selects
  select._cdRefresh = syncDisplay;
}

// ─── NAVBAR DATETIME UPDATER ──────────────────────────────────────────────
function startNavbarDatetime() {
  var el = document.getElementById("navbarDatetime");
  if (!el) return;

  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function update() {
    var now = new Date();
    var dateStr = days[now.getDay()] + ", " + months[now.getMonth()] + " " + now.getDate() + ", " + now.getFullYear();
    var h = now.getHours();
    var m = now.getMinutes();
    var s = now.getSeconds();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    var timeStr = h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s + " " + ampm;
    el.innerHTML = '<span class="dt-date">' + dateStr + '</span><span class="dt-sep">|</span><span class="dt-time">' + timeStr + '</span>';
  }

  update();
  setInterval(update, 1000);
}

function initAllCustomDropdowns() {
  initCustomDropdown('adminBookService', { searchPlaceholder: 'Search services...', emptyText: 'No services found' });
  initCustomDropdown('adminClientSelect', { placeholder: 'Select client', searchPlaceholder: 'Search clients...', emptyText: 'No clients found' });
  initCustomDropdown('adminPetSelect', { placeholder: 'Select client first', searchPlaceholder: 'Search pets...', emptyText: 'No pets found' });
  initCustomDropdown('adminBookTime', { placeholder: 'Select time', searchPlaceholder: 'Search time...', emptyText: 'No slots available' });

  initCustomDropdown('clerkBookService', { searchPlaceholder: 'Search services...', emptyText: 'No services found' });
  _renderSharedServiceOptions('clerkBookService');
  _renderSharedServiceOptions('adminBookService');
  initCustomDropdown('clerkClientSelect', { placeholder: 'Select client', searchPlaceholder: 'Search clients...', emptyText: 'No clients found' });
  initCustomDropdown('clerkPetSelect', { placeholder: 'Select client first', searchPlaceholder: 'Search pets...', emptyText: 'No pets found' });
  initCustomDropdown('clerkBookTime', { placeholder: 'Select time', searchPlaceholder: 'Search time...', emptyText: 'No slots available' });
}
