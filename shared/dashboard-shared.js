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

function loadAppointments() {
  fetch('../php_files/get_appointments.php')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.status !== 'success') {
        showToast('Failed to load appointments.', 'error');
        return;
      }
      var all = data.appointments;
      renderAllAppointmentsTable(all);
      CalendarState.appointments = all.map(function(a) {
        return {
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
    .catch(function(err) { console.error('loadAppointments error:', err); });
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
  var map = { pending: 'warning', scheduled: 'info', completed: 'completed', canceled: 'rejected' };
  var cls = map[status] || 'info';
  return '<span class="status-badge ' + cls + '">' + capitalize(status) + '</span>';
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

function viewAppointment(id)  { showUnderWork('Appointment detail view'); }
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
        showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info');
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
  var slots = typeof VHS_TIME_SLOTS !== 'undefined' ? VHS_TIME_SLOTS : ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'];

  // Header row: empty corner + 7 day columns
  var corner = document.createElement('div');
  corner.className = 'week-corner';
  grid.appendChild(corner);

  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
    var h = document.createElement('div');
    h.className = 'week-day-header';
    var isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    if (isToday) h.classList.add('today');
    h.innerHTML = '<span class="week-day-name">' + dayNames[i] + '</span><span class="week-day-num">' + d.getDate() + '</span>';
    grid.appendChild(h);
  }

  // Time rows
  slots.forEach(function(slot) {
    var timeLabel = document.createElement('div');
    timeLabel.className = 'week-time-label';
    timeLabel.textContent = slot;
    grid.appendChild(timeLabel);

    for (var j = 0; j < 7; j++) {
      var cell = document.createElement('div');
      cell.className = 'week-cell';
      var dateStr = days[j].getFullYear() + '-' + String(days[j].getMonth() + 1).padStart(2, '0') + '-' + String(days[j].getDate()).padStart(2, '0');
      var slotApts = CalendarState.appointments.filter(function(a) { return a.date === dateStr && a.time === slot; });
      slotApts.forEach(function(apt) {
        var item = document.createElement('div');
        item.className = 'week-apt status-' + (apt.status || 'pending');
        item.innerHTML = '<strong>' + apt.owner + '</strong><span>' + apt.pet + '</span>';
        item.onclick = function() { showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info'); };
        cell.appendChild(item);
      });
      cell.style.cursor = 'pointer';
      (function(ds) {
        cell.addEventListener('click', function(e) {
          if (e.target.closest('.week-apt')) return;
          if (typeof window.onCalendarDayClick === 'function') window.onCalendarDayClick(ds);
        });
      })(dateStr);
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
  var slots = typeof VHS_TIME_SLOTS !== 'undefined' ? VHS_TIME_SLOTS : ['8:00 AM','9:00 AM','10:00 AM','11:00 AM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'];
  var dateStr = CalendarState.currentYear + '-' + String(CalendarState.currentMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  var isToday = day === today.getDate() && CalendarState.currentMonth === today.getMonth() && CalendarState.currentYear === today.getFullYear();

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
    (function(ds) {
      cell.addEventListener('click', function(e) {
        if (e.target.closest('.day-apt')) return;
        if (typeof window.onCalendarDayClick === 'function') window.onCalendarDayClick(ds);
      });
    })(dateStr);
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

  if (document.getElementById('allAppointmentsTable')) {
    loadAppointments();
    ['filterStatus', 'filterDate'].forEach(function(id) {
      document.getElementById(id)?.addEventListener('change', applyAllAppointmentsFilter);
    });
    document.getElementById('searchAppointments')?.addEventListener('input', applyAllAppointmentsFilter);
  }
}
