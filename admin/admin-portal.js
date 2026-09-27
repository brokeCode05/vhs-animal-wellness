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
  // Operational ordering: today first (chronological by time), then future
  // (nearest date, time within date), then past (most recent date first).
  // Never Reference-ID order — front desk reads the schedule top-down.
  var _nowD = new Date();
  var todayKey = _nowD.getFullYear() + '-' + String(_nowD.getMonth() + 1).padStart(2, '0') + '-' + String(_nowD.getDate()).padStart(2, '0');
  function _bucket(dateStr) {
    if (!dateStr) return 2;
    if (dateStr === todayKey) return 0;
    return dateStr > todayKey ? 1 : 2; // string compare works for YYYY-MM-DD
  }
  var sorted = all.slice().sort(function (x, y) {
    var bx = _bucket(x.date), by = _bucket(y.date);
    if (bx !== by) return bx - by;
    if (x.date !== y.date) {
      // future: ascending (nearest first); past: descending (most recent first)
      return bx === 1 ? (x.date < y.date ? -1 : 1) : (x.date > y.date ? -1 : 1);
    }
    var tx = (contract && contract.timeToHHMM ? contract.timeToHHMM(x.time) : x.time) || '';
    var ty = (contract && contract.timeToHHMM ? contract.timeToHHMM(y.time) : y.time) || '';
    return tx < ty ? -1 : tx > ty ? 1 : 0;
  });
  var rows = sorted.map(function(raw) {
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
    var fillClients = function (users) {
      clientSelect.innerHTML = users.length
        ? '<option value="">Select client</option>' + users.map(function(u) {
            return '<option value="' + u.id + '">' + u.name + ' (' + u.email + ')</option>';
          }).join('')
        : '<option value="">No clients found</option>';
    };
    fetch('../php_files/get_users.php')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var users = Array.isArray(data) ? data : (data.users || []);
        if (users.length) { fillClients(users.map(function (u) { return { id: u.id, name: u.fullName || u.name, email: u.email }; })); return; }
        // No backend data: fall back to the shared mock clients.
        fillClients(window.SharedMockUsers
          ? window.SharedMockUsers.users().map(function (u) { return { id: u.userId, name: u.name, email: u.email }; })
          : []);
      })
      .catch(function() {
        // Static hosting (GitHub Pages demo): use the shared mock clients.
        // TODO(BACKEND): get_users.php is the only source when deployed.
        fillClients(window.SharedMockUsers
          ? window.SharedMockUsers.users().map(function (u) { return { id: u.userId, name: u.name, email: u.email }; })
          : []);
      });
  }

  var petSelect = document.getElementById('clerkPetSelect');
  if (petSelect) petSelect.innerHTML = '<option value="">Select client first</option>';
}

// Shared mock pets for the booking-modal client→pet cascade (frontend demo).
// TODO(BACKEND): get_pets.php?user_id=... replaces this entirely.
function _sharedPetsForClient(userId) {
  if (!window.SharedMockUsers) return [];
  return window.SharedMockUsers.petsOfOwner(userId).map(function (p) {
    return { id: p.petId, name: p.name, species: p.species };
  });
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
    renderTodaysScheduleTable(shared.getAll().map(function(a) {
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
    var fillPets = function (pets) {
      petSelect.innerHTML = pets.length
        ? '<option value="">Choose a pet</option>' + pets.map(function(p) {
            return '<option value="' + p.id + '">' + p.name + ' (' + p.species + ')</option>';
          }).join('')
        : '<option value="">No pets registered</option>';
    };
    fetch('../php_files/get_pets.php?user_id=' + userId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var pets = Array.isArray(data) ? data : (data.pets || []);
        if (pets.length) { fillPets(pets.map(function (p) { return { id: p.id, name: p.name, species: p.type || p.species }; })); return; }
        fillPets(_sharedPetsForClient(userId));
      })
      .catch(function() {
        // TODO(BACKEND): get_pets.php?user_id=... is the only source when deployed.
        fillPets(_sharedPetsForClient(userId));
      });
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
  // service now carries the canonical catalog VALUE (FK-ready).
  var svc = window.SharedMockUsers ? window.SharedMockUsers.serviceByValue(service) : null;

  if (!userId)  { showToast('Please select a client.', 'warning'); return; }
  if (!petId)   { showToast('Please select a pet.', 'warning'); return; }
  if (!service) { showToast('Please select a service.', 'warning'); return; }
  if (!date)    { showToast('Please select a date.', 'warning'); return; }
  if (!time)    { showToast('Please select a time.', 'warning'); return; }

  fetch('../php_files/book-appointment.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: parseInt(userId), pet_id: parseInt(petId), service: service, service_id: svc ? svc.serviceId : null, appointment_date: date, appointment_time: time, notes: notes })
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
    renderTodaysScheduleTable(shared.getAll().map(function(a) {
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

// ─── UNIFIED ADMIN PORTAL (Phase 1) ─────────────────────────────────────────
// Operational pages reuse the Clerk implementation above (AppointmentStore,
// contract, check-in, details, walk-in booking). Administration pages are
// placeholder-only until Phase 2 — no fake data, no fake actions.
document.addEventListener('click', function (e) {
  var demo = e.target.closest('[data-demo]');
  if (!demo) return;
  e.preventDefault();
  showToast('Frontend integration pending — this page has no functionality yet.', 'info');
});

// ─── PHASE 1 CLEANUP ────────────────────────────────────────────────────────

// Sidebar active state: derive from the CURRENT page URL so a copied stale
// "active" class can never highlight the wrong item (e.g. Documents active
// on /admin/doctors.html). The hardcoded class stays for no-JS fallback;
// this pass re-applies the correct state after load.
(function () {
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var items = document.querySelectorAll('.sidebar-nav .nav-item');
  var matched = null;
  items.forEach(function (item) {
    item.classList.remove('active');
    var href = (item.getAttribute('href') || '').split('/').pop().toLowerCase();
    if (!matched && href === page && !item.classList.contains('nav-item-logout')) matched = item;
  });
  if (matched) matched.classList.add('active');
})();

// Dashboard stat cards: demo-mode counts from the SAME canonical shared
// sources the rest of the portal reads — never invented values.
// TODO(BACKEND): each count becomes one API call (GET /appointments,
// GET /users, GET /pets) once the backend owns this data.
(function () {
  function setStat(labelText, value) {
    document.querySelectorAll('.stat-card').forEach(function (card) {
      var label = card.querySelector('.stat-label');
      if (label && label.textContent.trim() === labelText) {
        var val = card.querySelector('.stat-value');
        if (val) val.textContent = value;
      }
    });
  }
  function computeCounts() {
    var store = window.SharedMockAppointments;
    var users = window.SharedMockUsers;
    var contract = window.AppointmentContract;
    if (store && contract) {
      var confirmed = store.getAll().filter(function (a) {
        return contract.normalizeStatus(a.status) === 'confirmed';
      }).length;
      setStat('Confirmed Appointments', String(confirmed));
    }
    if (users) {
      setStat('Total Clients', String(users.users().length));
      setStat('Total Pets', String(users.pets().length));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', computeCounts);
  } else {
    computeCounts();
  }
})();

// Clients & Pets demo fallback: populate the owner/pet tables from the
// shared users/pets sources when the PHP endpoints are unreachable (static
// hosting). No separate duplicate dataset — profile modals read the same
// records by id.
// TODO(BACKEND): get_users.php / get_pets.php replace these loaders.
(function () {
  function loadSharedClients() {
    var tbody = document.getElementById('clientsTable');
    if (!tbody || !window.SharedMockUsers) return;
    // Skip if the backend fetch already populated rows.
    if (tbody.dataset.backendLoaded === '1') return;
    var owners = window.SharedMockUsers.users();
    var pets = window.SharedMockUsers.pets();
    tbody.innerHTML = owners.map(function (u, i) {
      var petCount = pets.filter(function (p) { return String(p.ownerId) === String(u.userId); }).length;
      return '<tr data-id="' + u.userId + '">' +
        '<td>#C' + String(i + 1).padStart(3, '0') + '</td>' +
        '<td>' + u.name + '</td>' +
        '<td>' + u.email + '</td>' +
        '<td>' + (u.phone || '\u2014') + '</td>' +
        '<td>\u2014</td>' +
        '<td>' + petCount + '</td>' +
        '<td>\u2014</td>' +
        '<td><button class="btn-small" onclick="viewOwnerProfile(' + u.userId + ')">View Profile</button></td>' +
        '</tr>';
    }).join('');
  }

  function loadSharedPets() {
    var tbody = document.getElementById('petsTable');
    if (!tbody || !window.SharedMockUsers) return;
    if (tbody.dataset.backendLoaded === '1') return;
    var pets = window.SharedMockUsers.pets();
    var users = window.SharedMockUsers.users();
    tbody.innerHTML = pets.map(function (p, i) {
      var owner = users.find(function (u) { return String(u.userId) === String(p.ownerId); });
      return '<tr data-id="' + p.petId + '">' +
        '<td>#P' + String(i + 1).padStart(3, '0') + '</td>' +
        '<td>' + p.name + '</td>' +
        '<td>' + p.species + '</td>' +
        '<td>' + (p.breed || '\u2014') + '</td>' +
        '<td>' + (p.age || '\u2014') + '</td>' +
        '<td>' + (p.gender || '\u2014') + '</td>' +
        '<td>' + (owner ? owner.name : '\u2014') + '</td>' +
        '<td>\u2014</td>' +
        '<td><button class="btn-small" onclick="viewPetProfile(' + p.petId + ')">View Profile</button></td>' +
        '</tr>';
    }).join('');
  }

  // Profile modals with the same ids the shared renderers expect; populated
  // from the shared sources so the demo shows real data instead of dashes.
  window.viewOwnerProfile = window.viewOwnerProfile || function (id) {};
  window.viewPetProfile = window.viewPetProfile || function (id) {};
  var _origOwner = window.viewOwnerProfile;
  var _origPet = window.viewPetProfile;

  window.viewOwnerProfile = function (id) {
    var u = window.SharedMockUsers ? window.SharedMockUsers.byId(id) : null;
    if (u) {
      var pets = window.SharedMockUsers.petsOfOwner(id);
      var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.textContent = val || '\u2014'; };
      set('ownerName', u.name);
      set('ownerEmail', u.email);
      set('ownerPhone', u.phone);
      var tbody = document.getElementById('ownerPetsTable');
      if (tbody) {
        tbody.innerHTML = pets.length ? pets.map(function (p) {
          return '<tr><td>' + p.name + '</td><td>' + p.species + '</td><td>' + (p.breed || '\u2014') + '</td><td>' + (p.age || '\u2014') + '</td><td>\u2014</td></tr>';
        }).join('') : '<tr><td colspan="5" style="text-align:center;color:#888;">No pets registered.</td></tr>';
      }
      var modal = document.getElementById('ownerProfileModal');
      if (modal) modal.classList.add('show');
      return;
    }
    _origOwner(id); // backend path when the id is not in the shared demo set
  };

  window.viewPetProfile = function (id) {
    var p = window.SharedMockUsers ? window.SharedMockUsers.petById(id) : null;
    if (p) {
      var owner = window.SharedMockUsers.byId(p.ownerId);
      var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.textContent = val || '\u2014'; };
      set('petName', p.name);
      set('petType', p.species);
      set('petBreed', p.breed);
      set('petAge', p.age);
      set('petSex', p.gender);
      set('petOwner', owner ? owner.name : '\u2014');
      var tbody = document.getElementById('petVaccinationTable');
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">No vaccination records in the demo dataset.</td></tr>';
      var modal = document.getElementById('petProfileModal');
      if (modal) modal.classList.add('show');
      return;
    }
    _origPet(id);
  };

  function closeProfile(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('show');
  }
  window.closeOwnerProfile = window.closeOwnerProfile || function () { closeProfile('ownerProfileModal'); };
  window.closePetProfile = window.closePetProfile || function () { closeProfile('petProfileModal'); };

  // Populate after DOM ready; skip if a backend loader marked the tables.
  function initClientsPets() {
    if (!document.getElementById('clientsTable')) return;
    loadSharedClients();
    loadSharedPets();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClientsPets);
  } else {
    initClientsPets();
  }
})();

// ─── PHASE 2B: DOCTOR ACCOUNTS + OPERATIONAL DIRECTORY ───────────────────
// One shared Doctor store (shared/mock-doctors.js) powers three surfaces:
//   Accounts  → account administration (create / edit / active-inactive)
//   Doctors   → operational availability (On Duty / On Break / On Leave)
//   Doctor Portal → reads/writes the same availability record
// TODO(BACKEND): Replace Doctor persistence with Doctor/User API calls
// (GET /doctors, POST /doctors, PUT /doctors/:id, PATCH account-status and
// availability endpoints). localStorage lives only inside the shared store.
// Account credentials are backend-provisioned — never stored here.

function _escD(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function _fmtDateD(str) {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d)
    ? str
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function _acctBadge(status) {
  const inactive = status === "inactive";
  return `<span class="status-badge ${inactive ? "cancelled" : "completed"}">${inactive ? "Inactive" : "Active"}</span>`;
}

// ── Accounts page: Doctor Account Administration table ───────────────────
let _doctorSearch = "";

function _renderDoctorAccounts() {
  const tbody = document.getElementById("doctorAccountsTable");
  if (!tbody || !window.SharedMockDoctors) return;
  const filter = document.getElementById("filterDoctorStatus");
  const f = filter ? filter.value : "all";
  const docs = window.SharedMockDoctors.doctors().filter((d) => {
    if (f !== "all" && d.accountStatus !== f) return false;
    if (_doctorSearch) {
      const hay = (d.name + " " + d.email).toLowerCase();
      if (!hay.includes(_doctorSearch)) return false;
    }
    return true;
  });
  tbody.innerHTML = docs.length
    ? docs
        .map((d) => {
          const inactive = d.accountStatus === "inactive";
          return `
        <tr data-id="${d.doctorId}">
          <td>#D${String(d.doctorId).padStart(3, "0")}</td>
          <td>${_escD(d.name)}</td>
          <td>${_escD(d.email)}</td>
          <td>${_escD(d.phone || "—")}</td>
          <td>${_escD(d.specialization || "—")}</td>
          <td>${_fmtDateD(d.createdAt)}</td>
          <td>${_acctBadge(d.accountStatus)}</td>
          <td class="action-cell" style="white-space:nowrap;">
            <button class="btn-small" onclick="openEditDoctor(${d.doctorId})">Edit</button>
            <button class="btn-small ${inactive ? "btn-success" : "btn-danger"}" onclick="toggleDoctorAccount(${d.doctorId})">${inactive ? "Activate" : "Deactivate"}</button>
          </td>
        </tr>`;
        })
        .join("")
    : '<tr><td colspan="8" style="text-align:center;color:#888;">No doctor accounts found.</td></tr>';
}

// ── Create Doctor (role is fixed to Doctor — no role selector exists) ────
function openCreateDoctorModal() {
  document.getElementById("createDoctorForm").reset();
  document.getElementById("createDoctorModal").classList.add("show");
}
function closeCreateDoctor() {
  document.getElementById("createDoctorModal").classList.remove("show");
}
function submitCreateDoctor(e) {
  e.preventDefault();
  const result = window.SharedMockDoctors.addDoctor({
    firstName: document.getElementById("newDoctorFirstName").value.trim(),
    middleName: document.getElementById("newDoctorMiddleName").value.trim(),
    lastName: document.getElementById("newDoctorLastName").value.trim(),
    email: document.getElementById("newDoctorEmail").value.trim(),
    phone: document.getElementById("newDoctorPhone").value.trim(),
    specialization: document.getElementById("newDoctorSpecialization").value.trim(),
  });
  if (!result.ok) {
    showToast(
      result.error === "duplicate_email"
        ? "A doctor with that email already exists."
        : "Please complete the required fields.",
      "error",
    );
    return;
  }
  closeCreateDoctor();
  _renderDoctorAccounts();
  showToast(
    `Doctor account created for ${result.doctor.name}. Credentials are provisioned by the backend (backend-pending demo state).`,
    "success",
  );
}

// ── Edit Doctor (account fields only; no passwords) ──────────────────────
function openEditDoctor(id) {
  const d = window.SharedMockDoctors.byId(id);
  if (!d) return;
  document.getElementById("editDoctorId").value = d.doctorId;
  document.getElementById("editDoctorFirstName").value = d.firstName || "";
  document.getElementById("editDoctorMiddleName").value = d.middleName || "";
  document.getElementById("editDoctorLastName").value = d.lastName || "";
  document.getElementById("editDoctorPhone").value = d.phone || "";
  document.getElementById("editDoctorEmail").value = d.email || "";
  document.getElementById("editDoctorSpecialization").value = d.specialization || "";
  document.getElementById("editDoctorStatus").value =
    d.accountStatus === "inactive" ? "inactive" : "active";
  document.getElementById("editDoctorModal").classList.add("show");
}
function closeEditDoctor() {
  document.getElementById("editDoctorModal").classList.remove("show");
}
function submitEditDoctor(e) {
  e.preventDefault();
  const id = document.getElementById("editDoctorId").value;
  const result = window.SharedMockDoctors.updateDoctor(id, {
    firstName: document.getElementById("editDoctorFirstName").value.trim(),
    middleName: document.getElementById("editDoctorMiddleName").value.trim(),
    lastName: document.getElementById("editDoctorLastName").value.trim(),
    email: document.getElementById("editDoctorEmail").value.trim(),
    phone: document.getElementById("editDoctorPhone").value.trim(),
    specialization: document.getElementById("editDoctorSpecialization").value.trim(),
    accountStatus: document.getElementById("editDoctorStatus").value,
  });
  if (!result.ok) {
    showToast("Could not save changes.", "error");
    return;
  }
  closeEditDoctor();
  _renderDoctorAccounts();
  showToast("Doctor account updated. (demo state — not saved to a database)", "success");
}

// ── Activate / Deactivate (account status only — availability is a separate
// concept managed on the Doctors page). Inactive Doctors are never deleted;
// they remain listed for historical records. ──────────────────────────────
function toggleDoctorAccount(id) {
  const d = window.SharedMockDoctors.byId(id);
  if (!d) return;
  const next = d.accountStatus === "inactive" ? "active" : "inactive";
  confirmAction(
    `${next === "inactive" ? "Deactivate" : "Activate"} the account for ${d.name}?`,
    () => {
      window.SharedMockDoctors.setAccountStatus(id, next);
      _renderDoctorAccounts();
      showToast(`Doctor account ${next}. (demo state — not saved to a database)`, "success");
    },
    {
      title: `${next === "inactive" ? "Deactivate" : "Activate"} Doctor Account`,
      danger: next === "inactive",
    },
  );
}

// ── Doctors page: operational directory + availability control ───────────
const DOCTOR_AVAILABILITY_OPTIONS = [
  { value: "on_duty", label: "On Duty" },
  { value: "on_break", label: "On Break" },
  { value: "on_leave", label: "On Leave" },
];

function _availBadgeClass(v) {
  return v === "on_duty" ? "completed" : v === "on_break" ? "rescheduled" : "cancelled";
}
function _availLabel(v) {
  const o = DOCTOR_AVAILABILITY_OPTIONS.find((x) => x.value === v);
  return o ? o.label : v;
}

function _renderDoctorDirectory() {
  const tbody = document.getElementById("doctorDirectoryTable");
  if (!tbody || !window.SharedMockDoctors) return;
  const docs = window.SharedMockDoctors.doctors();
  tbody.innerHTML = docs.length
    ? docs
        .map((d) => {
          const opts = DOCTOR_AVAILABILITY_OPTIONS.map(
            (o) =>
              `<option value="${o.value}" ${d.availabilityStatus === o.value ? "selected" : ""}>${o.label}</option>`,
          ).join("");
          return `
        <tr data-id="${d.doctorId}">
          <td>#D${String(d.doctorId).padStart(3, "0")}</td>
          <td>
            <strong>${_escD(d.name)}</strong><br />
            <span style="font-size:0.75rem;color:#6b7280;">${_escD(d.specialization || "General Practice")}</span>
          </td>
          <td>
            ${_escD(d.email)}<br />
            <span style="font-size:0.75rem;color:#6b7280;">${_escD(d.phone || "—")}</span>
          </td>
          <td>${_acctBadge(d.accountStatus)}</td>
          <td>
            <select class="form-select" style="width:auto;min-width:120px;" onchange="onDoctorAvailabilityChange(${d.doctorId}, this.value)" ${d.accountStatus === "inactive" ? "disabled title=\"Account inactive\"" : ""}>
              ${opts}
            </select>
          </td>
          <td class="action-cell" style="white-space:nowrap;">
            <button class="btn-small" onclick="openViewDoctor(${d.doctorId})">View</button>
          </td>
        </tr>`;
        })
        .join("")
    : '<tr><td colspan="6" style="text-align:center;color:#888;">No doctors found.</td></tr>';
}

// Availability change from the directory (Admin side of the shared record).
function onDoctorAvailabilityChange(id, value) {
  const d = window.SharedMockDoctors.byId(id);
  window.SharedMockDoctors.setAvailability(id, value);
  if (window.showToast) {
    showToast(
      `${d ? d.name : "Doctor"} → ${_availLabel(value)} (demo state — shared with the Doctor Portal)`,
      "success",
    );
  }
}

// Lightweight profile view (no editing here — account edits live in Accounts).
function openViewDoctor(id) {
  const d = window.SharedMockDoctors.byId(id);
  if (!d) return;
  const body = document.getElementById("viewDoctorBody");
  if (body) {
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;font-size:0.9rem;">
        <strong>Name</strong><span>${_escD(d.name)}</span>
        <strong>Email</strong><span>${_escD(d.email)}</span>
        <strong>Phone</strong><span>${_escD(d.phone || "—")}</span>
        <strong>Specialization</strong><span>${_escD(d.specialization || "—")}</span>
        <strong>Account</strong><span>${_acctBadge(d.accountStatus)}</span>
        <strong>Availability</strong><span>${_escD(_availLabel(d.availabilityStatus))}</span>
        <strong>Created</strong><span>${_fmtDateD(d.createdAt)}</span>
      </div>
      <p style="font-size:0.8rem;color:#6b7280;margin:0.9rem 0 0;">
        Account details (name, email, contact, status) are edited in
        <a href="accounts.html">Accounts</a> to avoid duplicate controls.
      </p>`;
  }
  const m = document.getElementById("viewDoctorModal");
  if (m) m.classList.add("show");
}
function closeViewDoctor() {
  const m = document.getElementById("viewDoctorModal");
  if (m) m.classList.remove("show");
}

// Init wiring for both pages (ids decide what runs).
document.addEventListener("DOMContentLoaded", () => {
  if (!window.SharedMockDoctors) return;
  if (document.getElementById("doctorAccountsTable")) {
    _renderDoctorAccounts();
    document.getElementById("filterDoctorStatus")?.addEventListener("change", _renderDoctorAccounts);
    document.getElementById("searchDoctors")?.addEventListener("input", (e) => {
      _doctorSearch = e.target.value.trim().toLowerCase();
      _renderDoctorAccounts();
    });
  }
  if (document.getElementById("doctorDirectoryTable")) _renderDoctorDirectory();
});
