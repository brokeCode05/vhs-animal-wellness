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
// Rows are normalized into the shared canonical appointment contract before
// rendering, so check-in and future flows can rely on stable field names.
// TODO(BACKEND): get_appointments.php does not return reference_no yet;
// add it server-side rather than synthesizing it here.
function renderAllAppointmentsTable(all) {
  var tbody = document.getElementById('allAppointmentsTable');
  if (!tbody) return;
  if (!all.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#888;">No appointments yet.</td></tr>';
    return;
  }
  var contract = window.AppointmentContract;
  var rows = all.map(function(raw) {
    var a = contract ? contract.toLegacyDisplay(contract.fromLegacy(raw)) : raw;
    // Status-based clerk actions. Clerk NEVER completes a consultation —
    // checked_in → in_consultation → completed belongs to the Doctor.
    var actions = '';
    if (a.status === 'pending') {
      actions =
        '<button class="btn-small btn-success" onclick="approveAppointment(\'' + a.id + '\')">Approve</button> ' +
        '<button class="btn-small" onclick="viewAppointment(\'' + a.id + '\')">View</button> ' +
        '<button class="btn-small btn-danger"  onclick="rejectAppointment(\'' + a.id + '\')">Reject</button>';
    } else if (a.status === 'confirmed') {
      actions =
        '<button class="btn-small" onclick="viewAppointment(\'' + a.id + '\')">View</button> ' +
        '<button class="btn-small btn-success" onclick="openCheckInModal(\'' + a.reference_no + '\')">Check In</button> ' +
        '<button class="btn-small btn-danger"  onclick="cancelAppointment(\'' + a.id + '\')">Cancel</button>';
    } else {
      // checked_in / in_consultation / completed / canceled: view only.
      // TODO(BACKEND): completed rows gain "View Clinical Document" once the
      // consultation document endpoint exists.
      actions = '<button class="btn-small" onclick="viewAppointment(\'' + a.id + '\')">View</button>';
    }
    return '<tr data-id="' + a.id + '" data-status="' + a.status + '">' +
      '<td>' + (a.reference_no || '—') + '</td>' +
      '<td>' + formatDateTime(a.date, a.time) + '</td>' +
      '<td>' + (a.owner_name || '—') + '</td>' +
      '<td>' + (a.pet_name   || '—') + '</td>' +
      '<td>' + (a.service    || '—') + '</td>' +
      '<td><span class="status-badge info">Registered</span></td>' +
      '<td>' + statusBadge(a.status) + '</td>' +
      '<td class="action-cell">' + actions + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = rows.join('');
}

// ─── CLERK BOOKING MODAL ──────────────────────────────────────────────────────

function addNewAppointment() { openClerkBookModal(); }

// Clicking a calendar day or time cell opens booking modal with that date (and optionally time)
window.onCalendarDayClick = function(dateStr, timeSlot) {
  openClerkBookModal(dateStr, timeSlot);
};

// Calendar appointment items open the SAME details panel as the table's
// View button (shared panel in dashboard-shared.js). Mock ids resolve by
// appointmentId; API rows by reference_no.
window.onCalendarAppointmentClick = function(apt) {
  if (apt && apt.referenceNo) { openAppointmentDetails(apt.referenceNo); return; }
  if (apt && apt.id) { openAppointmentDetails(apt.id); return; }
  showToast(apt.owner + ' · ' + apt.pet + ' · ' + apt.service + ' [' + apt.status + ']', 'info');
};

// QR support is structured but NOT implemented: a QR payload is just the
// appointment's referenceNo, so any future scanner (USB HID or webcam)
// only needs to fill the check-in input and call lookupCheckIn().
// TODO(QR): wire scanner devices to onQrScan; no phone-to-PC transfer.
window.onQrScan = function(qrPayload) {
  var input = document.getElementById('checkInRefInput');
  if (!input) return;
  openCheckInModal(String(qrPayload || '').trim());
};

function openClerkBookModal(prefilledDate, prefilledTime) {
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
      refreshClerkTimeSlots(prefilledTime);
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
}

function closeClerkBookModal() {
  document.getElementById('clerkBookModal')?.classList.remove('show');
  document.body.classList.remove('modal-open');
}

// ─── CHECK-IN (frontend mock over the shared canonical state) ────────────────
// Lookup resolves a Reference ID / QR value (the QR payload IS the reference
// number — no camera scanning is implemented). Check-in flips the SAME
// SharedMockAppointments record the User and Doctor portals read.
// TODO(BACKEND): lookup → GET appointment by referenceNo; checkInAppointment
// → server-side status transition (checked_in) that persists checkedInAt.
function openCheckInModal(prefillRef) {
  var modal = document.getElementById('checkInModal');
  if (!modal) return;
  modal.classList.add('show');
  document.body.classList.add('modal-open');
  var input = document.getElementById('checkInRefInput');
  var errEl = document.getElementById('checkInError');
  var resEl = document.getElementById('checkInResult');
  var actEl = document.getElementById('checkInActions');
  if (errEl) errEl.textContent = '';
  if (resEl) resEl.innerHTML = '';
  if (actEl) actEl.style.display = 'none';
  if (input) {
    input.value = prefillRef || '';
    if (prefillRef) { lookupCheckIn(); } else { input.focus(); }
  }
}

function closeCheckInModal() {
  document.getElementById('checkInModal')?.classList.remove('show');
  document.body.classList.remove('modal-open');
}

function _escapeCheckInHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function lookupCheckIn() {
  var input = document.getElementById('checkInRefInput');
  var errEl = document.getElementById('checkInError');
  var resEl = document.getElementById('checkInResult');
  var actEl = document.getElementById('checkInActions');
  if (!input || !errEl || !resEl || !actEl) return;
  errEl.textContent = '';
  resEl.innerHTML = '';
  actEl.style.display = 'none';
  var value = (input.value || '').trim();
  if (!value) { errEl.textContent = 'Enter a Reference ID or QR value.'; return; }
  var shared = window.SharedMockAppointments;
  var appt = shared ? shared.lookup(value) : null;
  if (!appt) { errEl.textContent = 'No appointment found for "' + value + '".'; return; }
  var a = window.AppointmentContract.toLegacyDisplay(window.AppointmentContract.fromLegacy(appt));
  var rows = [
    ['Reference ID', a.reference_no || '—'],
    ['Owner', a.owner_name || '—'],
    ['Pet', (a.pet_name || '—') + (a.pet_type ? ' (' + a.pet_type + (a.pet_breed ? ' / ' + a.pet_breed : '') + ')' : '')],
    ['Service', a.service || '—'],
    ['Date & Time', formatDateTime(a.date, a.time)],
    ['Visit context', a.visit_reason || '—'],
    ['Notes', a.notes || '—'],
    ['Status', statusBadge(a.status)]
  ];
  resEl.innerHTML = '<div style="border:1px solid #e5e7eb;border-radius:0.75rem;overflow:hidden;">' +
    rows.map(function(r) {
      return '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.5rem 0.75rem;border-bottom:1px solid #f3f4f6;font-size:0.9rem;">' +
        '<span style="color:#6b7280;flex-shrink:0;">' + r[0] + '</span>' +
        '<span style="text-align:right;font-weight:500;color:#111827;">' + r[1] + '</span>' +
        '</div>';
    }).join('') + '</div>';
  if (a.status === 'confirmed') {
    actEl.style.display = 'flex';
  } else if (a.status === 'checked_in') {
    var ciText = '';
    if (a.checked_in_at) {
      var ciDate = new Date(a.checked_in_at);
      if (!isNaN(ciDate)) {
        ciText = ' at ' + ciDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
                 ', ' + ciDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
    }
    errEl.textContent = 'Already checked in' + ciText + '.';
  } else {
    errEl.textContent = 'Check-in is not available for this appointment status (' + statusBadge(a.status) + ').';
  }
}

function checkInAppointment() {
  var input = document.getElementById('checkInRefInput');
  var errEl = document.getElementById('checkInError');
  var actEl = document.getElementById('checkInActions');
  var shared = window.SharedMockAppointments;
  var appt = shared ? shared.lookup((input.value || '').trim()) : null;
  if (!appt) { errEl.textContent = 'Appointment no longer available.'; return; }
  var result = shared.checkIn(appt.appointmentId);
  if (!result.ok) {
    errEl.textContent = result.error === 'already'
      ? 'Already checked in.'
      : result.error === 'invalid_status'
        ? 'Check-in is only allowed for confirmed appointments.'
        : 'Check-in failed.';
    return;
  }
  closeCheckInModal();
  showToast('Patient checked in. Reference ' + result.appointment.referenceNo + '.', 'success');
  // Refresh whichever appointment views exist on this page so the same
  // shared record shows Checked In immediately.
  if (document.getElementById('allAppointmentsTable')) loadAppointments();
  if (document.getElementById('todayScheduleTable') && window.SharedMockAppointments) {
    var contract = window.AppointmentContract;
    renderTodaysScheduleTable(shared.all().map(function(a) {
      return contract ? contract.toLegacyDisplay(contract.fromLegacy(a)) : a;
    }).filter(function(a) { return a.date === (shared.today || new Date().toISOString().split('T')[0]); }));
  }
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('clerkBookModal')?.classList.contains('show')) {
    closeClerkBookModal();
  }
  if (e.key === 'Escape' && document.getElementById('checkInModal')?.classList.contains('show')) {
    closeCheckInModal();
  }
  if (e.key === 'Escape' && document.getElementById('appointmentDetailsModal')?.classList.contains('show')) {
    closeAppointmentDetails();
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

function refreshClerkTimeSlots(prefilledTime) {
  var dateInput  = document.getElementById('clerkBookDate');
  var timeSelect = document.getElementById('clerkBookTime');
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

function submitClerkBooking(e) {
  e.preventDefault();
  // TODO(BACKEND): POST book-appointment.php and use the returned
  // reference_no. The endpoint requires a live PHP/MySQL host, so the demo
  // keeps this button clearly unavailable instead of faking persistence.
  showToast('Booking requires the backend (PHP/MySQL host). Not available in the frontend demo.', 'warning');
  return;
  /* eslint-disable no-unreachable */
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

// ─── CLERK ACTIONS (frontend-demo honest mode) ───────────────────────────────
// Approve / reject / cancel write to the SAME shared mock state the User and
// Doctor portals read. No database persistence is claimed.
// TODO(BACKEND): Route through update_appointment_status.php (ENUM must be
// expanded first — see doctor/AUDIT-cross-portal-appointments.md).
function _clerkSharedStatus(id, nextStatus, successMsg) {
  var shared = window.SharedMockAppointments;
  if (!shared) { showToast('Shared mock state unavailable.', 'error'); return; }
  var result = shared.setStatus(id, nextStatus);
  if (!result.ok) {
    showToast(result.error === 'invalid_status'
      ? 'That status change is not allowed for this appointment.'
      : 'Appointment not found.', 'error');
    return;
  }
  showToast(successMsg + ' (demo state — not saved to a database)', 'success');
  if (document.getElementById('allAppointmentsTable')) loadAppointments();
  var tbody = document.getElementById('todayScheduleTable');
  if (tbody && window.SharedMockAppointments) {
    var contract = window.AppointmentContract;
    renderTodaysScheduleTable(shared.all().map(function(a) {
      return contract ? contract.toLegacyDisplay(contract.fromLegacy(a)) : a;
    }).filter(function(a) { return a.date === (shared.today || new Date().toISOString().split('T')[0]); }));
  }
}

function approveAppointment(id) {
  confirmAction('Approve this appointment?', function() {
    _clerkSharedStatus(id, 'confirmed', 'Appointment approved');
  }, {
    title: 'Approve Appointment',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    accent: 'success'
  });
}

function rejectAppointment(id) {
  confirmAction('Reject this appointment?', function() {
    _clerkSharedStatus(id, 'canceled', 'Appointment rejected');
  }, {
    title: 'Reject Appointment',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    danger: true
  });
}

function cancelAppointment(id) {
  confirmAction('Cancel this appointment?', function() {
    _clerkSharedStatus(id, 'canceled', 'Appointment cancelled');
  }, {
    title: 'Cancel Appointment',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    danger: true
  });
}

// ─── CLERK-ONLY CLIENT ACTIONS ────────────────────────────────────────────────

function viewClientDetails(id) { showUnderWork('Client registration details'); }
function viewClient(id)        { showUnderWork('Client profile view'); }
function editClient(id)        { showUnderWork('Edit client'); }
function addNewOwner()         { window.location.href = 'clients.html'; }

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initDashboardShared();
  initAllCustomDropdowns();
  startNavbarDatetime();
});
