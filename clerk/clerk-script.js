/* ============================================
   VHS CLERK DASHBOARD — Clerk-specific script
   Shared logic lives in shared/dashboard-shared.js
   Clerk permissions:
     [x] Approve / reject appointments
     [x] Book appointments for clients
     [x] View clients & pets
     [x] Edit clients & pets
     [ ] Cannot delete/remove accounts
     [ ] Cannot create staff accounts
   showToast / confirmAction / showUnderWork
   are provided by shared/vhs-ui.js
============================================ */

// ─── APPOINTMENTS TABLE (clerk-specific render) ───────────────────────────────

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

// ─── CLERK BOOKING MODAL ──────────────────────────────────────────────────────

function addNewAppointment() { openClerkBookModal(); }

// Clicking a calendar day opens booking modal with that date
window.onCalendarDayClick = function(dateStr) {
  openClerkBookModal(dateStr);
};

function openClerkBookModal(prefilledDate) {
  var modal = document.getElementById('clerkBookModal');
  if (!modal) return;
  modal.classList.add('show');
  document.body.classList.add('modal-open');
  document.getElementById('clerkBookForm')?.reset();

  var dateInput = document.getElementById('clerkBookDate');
  if (dateInput) {
    dateInput.min = new Date().toISOString().split('T')[0];
    if (prefilledDate) {
      dateInput.value = prefilledDate;
      refreshClerkTimeSlots();
    }
  }

  var clientSelect = document.getElementById('clerkClientSelect');
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

  var petSelect = document.getElementById('clerkPetSelect');
  if (petSelect) petSelect.innerHTML = '<option value="">Select client first</option>';

  refreshClerkTimeSlots();
}

function closeClerkBookModal() {
  document.getElementById('clerkBookModal')?.classList.remove('show');
  document.body.classList.remove('modal-open');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('clerkBookModal')?.classList.contains('show')) {
    closeClerkBookModal();
  }
});

document.addEventListener('change', function(e) {
  if (e.target.id === 'clerkClientSelect') {
    var userId = e.target.value;
    var petSelect = document.getElementById('clerkPetSelect');
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
  if (e.target.id === 'clerkBookDate') {
    refreshClerkTimeSlots();
  }
});

function refreshClerkTimeSlots() {
  var dateInput  = document.getElementById('clerkBookDate');
  var timeSelect = document.getElementById('clerkBookTime');
  if (!timeSelect) return;
  if (!dateInput || !dateInput.value) {
    timeSelect.innerHTML = '<option value="">Select date first</option>';
    return;
  }
  timeSelect.innerHTML = '<option value="">Loading slots...</option>';
  fetch('../php_files/get_booked_slots.php?date=' + dateInput.value)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var booked = data.booked_slots || [];
      timeSelect.innerHTML = '<option value="">Select time</option>' + VHS_TIME_SLOTS.map(function(slot) {
        var isBooked = booked.indexOf(slot) !== -1;
        return '<option value="' + slot + '"' + (isBooked ? ' disabled' : '') + '>' +
          slot + (isBooked ? ' (Unavailable)' : '') + '</option>';
      }).join('');
    })
    .catch(function() {
      timeSelect.innerHTML = '<option value="">Select time</option>' + VHS_TIME_SLOTS.map(function(slot) {
        return '<option value="' + slot + '">' + slot + '</option>';
      }).join('');
    });
}

function submitClerkBooking(e) {
  e.preventDefault();
  var userId  = document.getElementById('clerkClientSelect').value;
  var petId   = document.getElementById('clerkPetSelect').value;
  var service = document.getElementById('clerkBookService').value;
  var date    = document.getElementById('clerkBookDate').value;
  var time    = document.getElementById('clerkBookTime').value;
  var notes   = document.getElementById('clerkBookNotes').value.trim();

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
        closeClerkBookModal();
        loadAppointments();
      } else {
        showToast('Booking failed: ' + (data.message || 'Unknown error'), 'error');
      }
    })
    .catch(function() { showToast('Network error.', 'error'); });
}

// ─── CLERK-ONLY CLIENT ACTIONS ────────────────────────────────────────────────

function viewClientDetails(id) { showUnderWork('Client registration details'); }
function viewClient(id)        { showUnderWork('Client profile view'); }
function editClient(id)        { showUnderWork('Edit client'); }
function addNewOwner()         { window.location.href = 'clients.html'; }

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initDashboardShared();
});
