/* ============================================
   VHS ADMIN DASHBOARD — Admin-specific script
   Shared logic lives in shared/dashboard-shared.js
   showToast / confirmAction / showUnderWork
   are provided by shared/vhs-ui.js
============================================ */

// ─── ADMIN-ONLY BADGE HELPER ──────────────────────────────────────────────────

function updateBadge(selector, delta) {
  var badge = document.querySelector(selector);
  if (!badge) return;
  var n = Math.max(0, (parseInt(badge.textContent) || 0) + delta);
  badge.textContent = n;
  badge.style.display = n === 0 ? 'none' : '';
}

// ─── ACCOUNT ACTIONS ─────────────────────────────────────────────────────────

function activateClient(id) {
  confirmAction('Activate this client account?',
    function() { showToast('Account activated.', 'success'); },
    { title: 'Activate Account', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', accent: 'success' }
  );
}

function deactivateClient(id) {
  confirmAction('Deactivate this client account?',
    function() { showToast('Account deactivated.', 'warning'); },
    { title: 'Deactivate Account', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', danger: true }
  );
}

function viewClient(id)    { showUnderWork('Client profile view'); }
function editClient(id)    { showUnderWork('Edit client'); }
function viewStaff(id)     { showUnderWork('Staff profile view'); }
function editStaff(id)     { showUnderWork('Edit staff'); }

function deactivateStaff(id) {
  confirmAction('Deactivate this staff account?',
    function() { showToast('Staff account deactivated.', 'warning'); },
    { title: 'Deactivate Staff', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', danger: true }
  );
}

// ─── CREATE STAFF MODAL ───────────────────────────────────────────────────────

function openCreateStaffModal() {
  document.getElementById('createStaffModal')?.classList.add('show');
}

function closeCreateStaffModal() {
  document.getElementById('createStaffModal')?.classList.remove('show');
  document.getElementById('createStaffForm')?.reset();
}

function submitStaffAccount(e) {
  e.preventDefault();
  var fd = new FormData(e.target);
  if (fd.get('staffPassword') !== fd.get('staffConfirmPassword')) {
    showToast('Passwords do not match!', 'error');
    return;
  }
  fetch('../php_files/create_staff.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lastName:   fd.get('staffLastName'),
      firstName:  fd.get('staffFirstName'),
      middleName: fd.get('staffMiddleName'),
      email:      fd.get('staffEmail'),
      phone:      fd.get('staffPhone'),
      role:       fd.get('staffRole'),
      password:   fd.get('staffPassword')
    })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.status === 'success') {
        showToast('Staff account created successfully!', 'success');
        closeCreateStaffModal();
        setTimeout(function() { window.location.reload(); }, 800);
      } else {
        showToast('Error: ' + (data.message || 'Failed to create account'), 'error');
      }
    })
    .catch(function() { showToast('Server error.', 'error'); });
}

// ─── APPOINTMENTS TABLE (admin-specific render with pending actions) ──────────

function renderAllAppointmentsTable(all) {
  var tbody = document.getElementById('allAppointmentsTable');
  if (!tbody) return;
  if (!all.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No appointments yet.</td></tr>';
    return;
  }
  tbody.innerHTML = all.map(function(a) {
    var actions = '';
    if (a.status === 'pending') {
      actions =
        '<button class="btn-small btn-success" onclick="approveAppointment(' + a.id + ')">Approve</button> ' +
        '<button class="btn-small btn-danger"  onclick="rejectAppointment(' + a.id + ')">Reject</button>';
    } else if (a.status === 'scheduled') {
      actions =
        '<button class="btn-small btn-success" onclick="markComplete(' + a.id + ')">Complete</button> ' +
        '<button class="btn-small btn-danger"  onclick="cancelAppointment(' + a.id + ')">Cancel</button>';
    } else {
      actions = '<button class="btn-small" onclick="viewAppointment(' + a.id + ')">View</button>';
    }
    return '<tr data-id="' + a.id + '" data-status="' + a.status + '">' +
      '<td>#A' + String(a.id).padStart(3, '0') + '</td>' +
      '<td>' + formatDateTime(a.date, a.time) + '</td>' +
      '<td>' + (a.owner_name || '—') + '</td>' +
      '<td>' + (a.pet_name   || '—') + '</td>' +
      '<td>' + (a.service    || '—') + '</td>' +
      '<td><span class="status-badge info">Registered</span></td>' +
      '<td>' + statusBadge(a.status) + '</td>' +
      '<td class="action-cell">' + actions + '</td>' +
      '</tr>';
  }).join('');
}

// ─── ADMIN BOOKING MODAL ──────────────────────────────────────────────────────

function addNewAppointment() { openAdminBookModal(); }

// Clicking a calendar day or time cell opens booking modal with that date (and optionally time)
window.onCalendarDayClick = function(dateStr, timeSlot) {
  openAdminBookModal(dateStr, timeSlot);
};

function openAdminBookModal(prefilledDate, prefilledTime) {
  var modal = document.getElementById('adminBookModal');
  if (!modal) return;
  modal.classList.add('show');
  document.body.classList.add('modal-open');
  document.getElementById('adminBookForm')?.reset();

  var dateInput = document.getElementById('adminBookDate');
  if (dateInput) {
    dateInput.min = new Date().toISOString().split('T')[0];
    if (prefilledDate) {
      dateInput.value = prefilledDate;
      refreshAdminTimeSlots(prefilledTime);
    }
  }

  var clientSelect = document.getElementById('adminClientSelect');
  if (clientSelect) {
    clientSelect.innerHTML = '<option value="">Loading clients...</option>';
    fetch('../php_files/get_users.php')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var users = Array.isArray(data) ? data : (data.users || []);
        clientSelect.innerHTML = users.length
          ? '<option value="">Select client</option>' + users.map(function(u) {
              return '<option value="' + u.id + '">' + u.fullName + ' (' + u.email + ')</option>';
            }).join('')
          : '<option value="">No clients found</option>';
      })
      .catch(function() { clientSelect.innerHTML = '<option value="">Failed to load clients</option>'; });
  }

  var petSelect = document.getElementById('adminPetSelect');
  if (petSelect) petSelect.innerHTML = '<option value="">Select client first</option>';
}

function closeAdminBookModal() {
  document.getElementById('adminBookModal')?.classList.remove('show');
  document.body.classList.remove('modal-open');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('adminBookModal')?.classList.contains('show')) {
    closeAdminBookModal();
  }
});

document.addEventListener('change', function(e) {
  if (e.target.id === 'adminClientSelect') {
    var userId = e.target.value;
    var petSelect = document.getElementById('adminPetSelect');
    if (!petSelect) return;
    if (!userId) { petSelect.innerHTML = '<option value="">Select client first</option>'; return; }
    petSelect.innerHTML = '<option value="">Loading pets...</option>';
    fetch('../php_files/get_pets.php?user_id=' + userId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var pets = Array.isArray(data) ? data : (data.pets || []);
        petSelect.innerHTML = pets.length
          ? '<option value="">Choose a pet</option>' + pets.map(function(p) {
              return '<option value="' + p.id + '">' + p.name + ' (' + p.type + ')</option>';
            }).join('')
          : '<option value="">No pets registered</option>';
      })
      .catch(function() { petSelect.innerHTML = '<option value="">Failed to load pets</option>'; });
  }
  if (e.target.id === 'adminBookDate') {
    refreshAdminTimeSlots();
  }
});

function refreshAdminTimeSlots(prefilledTime) {
  var dateInput  = document.getElementById('adminBookDate');
  var timeSelect = document.getElementById('adminBookTime');
  if (!timeSelect) return;
  if (!dateInput || !dateInput.value) {
    timeSelect.innerHTML = '<option value="">Select date first</option>';
    return;
  }
  var slots = getVHSTimeSlots(dateInput.value);
  timeSelect.innerHTML = '<option value="">Loading slots...</option>';
  fetch('../php_files/get_booked_slots.php?date=' + dateInput.value)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var booked = data.booked_slots || [];
      timeSelect.innerHTML = '<option value="">Select time</option>' + slots.map(function(slot) {
        var isBooked = booked.indexOf(slot) !== -1;
        return '<option value="' + slot + '"' + (isBooked ? ' disabled' : '') + '>' +
          slot + (isBooked ? ' (Unavailable)' : '') + '</option>';
      }).join('');
      if (prefilledTime) {
        timeSelect.value = prefilledTime;
      }
    })
    .catch(function() {
      timeSelect.innerHTML = '<option value="">Select time</option>' + slots.map(function(slot) {
        return '<option value="' + slot + '">' + slot + '</option>';
      }).join('');
      if (prefilledTime) {
        timeSelect.value = prefilledTime;
      }
    });
}

function submitAdminBooking(e) {
  e.preventDefault();
  var userId  = document.getElementById('adminClientSelect').value;
  var petId   = document.getElementById('adminPetSelect').value;
  var service = document.getElementById('adminBookService').value;
  var date    = document.getElementById('adminBookDate').value;
  var time    = document.getElementById('adminBookTime').value;
  var notes   = document.getElementById('adminBookNotes').value.trim();

  if (!userId)  { showToast('Please select a client.', 'warning'); return; }
  if (!petId)   { showToast('Please select a pet.', 'warning'); return; }
  if (!service) { showToast('Please select a service.', 'warning'); return; }
  if (!date)    { showToast('Please select a date.', 'warning'); return; }
  if (!time)    { showToast('Please select a time.', 'warning'); return; }

  fetch('../php_files/book-appointment.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: parseInt(userId), pet_id: parseInt(petId), service: service, appointment_date: date, appointment_time: time, notes: notes })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.status === 'success') {
        showToast('Appointment booked successfully!', 'success');
        closeAdminBookModal();
        loadAppointments();
      } else {
        showToast('Booking failed: ' + (data.message || 'Unknown error'), 'error');
      }
    })
    .catch(function() { showToast('Network error.', 'error'); });
}

// ─── ADMIN-ONLY OWNER/PET STUBS ───────────────────────────────────────────────

function addNewOwner()      { showUnderWork('Add new owner'); }
function viewHistory(id)    { showUnderWork('Pet history'); }
function uploadDocument()   { showUnderWork('Document upload'); }
function editAppointment(id){ showUnderWork('Edit appointment'); }

// ─── WEBSITE CONTENT ACTIONS ─────────────────────────────────────────────────

function addAnnouncement()      { showUnderWork('Add announcement'); }
function editAnnouncement(id)   { showUnderWork('Edit announcement'); }
function deleteAnnouncement(id) {
  confirmAction('Delete this announcement permanently?',
    function() { showToast('Announcement deleted.', 'success'); },
    { title: 'Delete Announcement', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>', danger: true }
  );
}
function addNewService()  { showUnderWork('Add new service'); }
function editService(id)  { showUnderWork('Edit service'); }
function toggleService(id) {
  confirmAction('Toggle this service status?',
    function() { showToast('Service status updated.', 'success'); },
    { title: 'Toggle Service', icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>' }
  );
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  // Shared init (sidebar, logout, search, filters, tabs, modals, calendar, appointments)
  initDashboardShared();
  initAllCustomDropdowns();

  // Website forms (admin-only)
  ['clinicInfoForm','operatingHoursForm','aboutUsForm','socialMediaForm'].forEach(function(id) {
    document.getElementById(id)?.addEventListener('submit', function(e) {
      e.preventDefault();
      showToast('Changes saved!', 'success');
    });
  });
});
