/* ============================================
   VHS ADMIN PORTAL — canonical operations script
   Shared logic lives in shared/dashboard-shared.js
   Admin portal permissions (Admin is canonical; the legacy Clerk copy in /clerk/ is no longer maintained):
     [x] Approve / reject appointments
     [x] Book appointments for clients
     [x] View clients & pets
     [x] Edit clients & pets
     [ ] Cannot delete/remove accounts
     [ ] Cannot create staff accounts
   showToast / confirmAction / showUnderWork
   are provided by shared/vhs-ui.js
============================================ */

// ─── APPOINTMENTS TABLE ───────────────────────────────
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
    // Status-based front-desk actions in one compact kebab menu (advisor
    // revision: repetitive visible buttons compressed into ⋮). Admin NEVER
    // completes a consultation — checked_in → in_consultation → completed
    // belongs to the Doctor. Status-ineligible actions are omitted.
    // TODO(BACKEND): completed rows gain "View Clinical Document" once the
    // consultation document endpoint exists.
    var items = [{ label: 'View Details', action: 'viewAppointment', arg: a.id }];
    if (a.status === 'pending') {
      items.push({ label: 'Approve', action: 'approveAppointment', arg: a.id, cls: 'success' });
      items.push({ label: 'Reject', action: 'rejectAppointment', arg: a.id, cls: 'danger' });
    }
    if (a.status === 'confirmed') {
      items.push({ label: 'Check In', action: 'openCheckInModal', arg: a.reference_no, cls: 'success' });
      // Reschedule honors the SAME shared cut-off as the User portal.
      var _toHHMM = window.AppointmentContract ? window.AppointmentContract.timeToHHMM : function (v) { return v; };
      var _reschedBlocked = window.VHSClinicSettings && window.VHSClinicSettings.isRescheduleBlocked
        ? window.VHSClinicSettings.isRescheduleBlocked(a.date, _toHHMM(a.time))
        : false;
      if (!_reschedBlocked) items.push({ label: 'Reschedule', action: 'openAdminReschedule', arg: a.id });
      items.push({ label: 'Cancel', action: 'cancelAppointment', arg: a.id, cls: 'danger' });
    }
    var actions = kebabHtml('apt-' + a.id, items);
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

// ─── ADMIN BOOKING MODAL ──────────────────────────────────────────────────────

function addNewAppointment() { openAdminBookModal(); }

// Clicking a calendar day or time cell opens booking modal with that date (and optionally time)
window.onCalendarDayClick = function(dateStr, timeSlot) {
  openAdminBookModal(dateStr, timeSlot);
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

  var petSelect = document.getElementById('adminPetSelect');
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

function closeAdminBookModal() {
  document.getElementById('adminBookModal')?.classList.remove('show');
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
  _auditAdmin({ action: 'patient_checked_in', entityType: 'appointment', entityId: result.appointment.appointmentId, referenceNo: result.appointment.referenceNo, description: 'Admin checked in ' + (result.appointment.pet ? result.appointment.pet.name : 'patient') + ' — ' + result.appointment.referenceNo, metadata: { owner: result.appointment.owner ? result.appointment.owner.name : '', pet: result.appointment.pet ? result.appointment.pet.name : '' } });
  // Refresh whichever appointment views exist on this page so the same
  // shared record shows Checked In immediately.
  if (document.getElementById('allAppointmentsTable')) loadAppointments();
  if (document.getElementById('todayScheduleTable') && window.SharedMockAppointments) {
    var contract = window.AppointmentContract;
    var _nowD = new Date();
    var realToday = _nowD.getFullYear() + '-' + String(_nowD.getMonth() + 1).padStart(2, '0') + '-' + String(_nowD.getDate()).padStart(2, '0');
    renderTodaysScheduleTable(shared.getAll().map(function(a) {
      return contract ? contract.toLegacyDisplay(contract.fromLegacy(a)) : a;
    }).filter(function(a) { return a.date === realToday; }));
  }
}

// ─── ADMIN RESCHEDULE (same store path as the User flow) ─────────────────
// Updates appointmentDate/appointmentTime on the SAME record through
// SharedMockAppointments.reschedule() — never a duplicate appointment.
// TODO(BACKEND): PATCH /appointments/:id { appointment_date, appointment_time }.
function openAdminReschedule(idOrRef) {
  var shared = window.SharedMockAppointments;
  var rec = shared ? (shared.byId(idOrRef) || shared.byReference(idOrRef)) : null;
  if (!rec) { showToast('Appointment not found.', 'error'); return; }
  var s = window.AppointmentContract ? window.AppointmentContract.normalizeStatus(rec.status) : rec.status;
  if (s !== 'confirmed' && s !== 'pending') {
    showToast('Only confirmed appointments can be rescheduled.', 'warning');
    return;
  }
  // SAME shared reschedule cut-off as the User portal (Clinic Settings).
  // UI hiding is not enough: a direct modal invocation must still be refused.
  // TODO(BACKEND): enforce the cut-off server-side on PATCH /appointments/:id.
  if (window.VHSClinicSettings && window.VHSClinicSettings.isRescheduleBlocked) {
    var _toHHMM = window.AppointmentContract ? window.AppointmentContract.timeToHHMM : function (v) { return v; };
    if (window.VHSClinicSettings.isRescheduleBlocked(rec.appointmentDate, _toHHMM(rec.appointmentTime))) {
      showToast('Rescheduling is no longer available within ' + window.VHSClinicSettings.cutoffLabel('reschedule') + ' of the appointment.', 'warning');
      return;
    }
  }
  document.getElementById('adminRescheduleApptId').value = rec.appointmentId;
  document.getElementById('adminRescheduleInfo').textContent =
    (rec.referenceNo || '') + ' · ' + (rec.owner ? rec.owner.name : '') + ' · ' + (rec.pet ? rec.pet.name : '') +
    ' · currently ' + rec.appointmentDate + ' ' + (window.AppointmentContract ? window.AppointmentContract.timeTo12h(rec.appointmentTime) : rec.appointmentTime);
  document.getElementById('adminRescheduleDate').value = '';
  _populateAdminRescheduleSlots();
  var modal = document.getElementById('adminRescheduleModal');
  if (modal) modal.classList.add('show');
}
function closeAdminReschedule() {
  var modal = document.getElementById('adminRescheduleModal');
  if (modal) modal.classList.remove('show');
}
function _populateAdminRescheduleSlots() {
  var timeSel = document.getElementById('adminRescheduleTime');
  var dateInput = document.getElementById('adminRescheduleDate');
  if (!timeSel || !dateInput) return;
  var dateVal = dateInput.value;
  if (!dateVal) { timeSel.innerHTML = '<option value="">Select a date first</option>'; return; }
  var slots = (typeof getVHSTimeSlots === 'function') ? getVHSTimeSlots(dateVal) : [];
  // Same shared scheduling engine as the User booking form and Vetti, so the
  // front desk can never offer a slot the owner portal refuses (or hide one
  // it allows). excludeAppointmentId keeps this appointment from blocking
  // its OWN current slot.
  // TODO(BACKEND): slot availability comes from the API availability check.
  var apptId = document.getElementById('adminRescheduleApptId') ? document.getElementById('adminRescheduleApptId').value : null;
  var sched = window.SmartScheduling;
  var users = window.SharedMockUsers;
  var appt = (apptId && window.SharedMockAppointments) ? window.SharedMockAppointments.byId(apptId) : null;
  var svc = (appt && users && users.serviceByValue) ? users.serviceByValue(appt.service) : null;
  if (sched && typeof sched.getAvailableSlots === 'function' && svc) {
    var result = sched.getAvailableSlots({
      serviceId: svc.serviceId,
      date: dateVal,
      excludeAppointmentId: apptId || null
    });
    slots = result.ok ? result.slots.map(function (s) { return s.time; }) : [];
  } else {
    // Engine or service unavailable: fall back to the clinic's own hours
    // rather than guessing at availability.
    var fallback = window.SharedMockAppointments ? window.SharedMockAppointments.takenSlots(dateVal, apptId) : [];
    var toHHMM = window.AppointmentContract ? window.AppointmentContract.timeToHHMM : function (v) { return v; };
    var takenSet = fallback.map(function (t) { return String(toHHMM(t)); });
    slots = slots.filter(function (slot) {
      var parts = String(slot).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!parts) return true;
      var h = parseInt(parts[1], 10);
      if (parts[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (parts[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return takenSet.indexOf(h + ':' + parts[2]) === -1;
    });
  }
  timeSel.innerHTML = slots.length
    ? '<option value="">Select time</option>' + slots.map(function(s){ return '<option value="' + s + '">' + s + '</option>'; }).join('')
    : '<option value="">No available slots that day</option>';
}
function submitAdminReschedule(e) {
  e.preventDefault();
  var id = document.getElementById('adminRescheduleApptId').value;
  var newDate = document.getElementById('adminRescheduleDate').value;
  var newTime = document.getElementById('adminRescheduleTime').value;
  if (!newDate || !newTime) { showToast('Select a new date and time.', 'warning'); return; }
  var shared = window.SharedMockAppointments;
  var _before = shared ? shared.byId(id) : null;
  if (!_before) { showToast('Appointment not found.', 'error'); return; }
  // Submit-handler guard: even if the modal was opened before the cut-off or
  // invoked directly, a reschedule inside the shared cut-off window is
  // rejected — no store update, no duplicate, no audit event.
  if (window.VHSClinicSettings && window.VHSClinicSettings.isRescheduleBlocked) {
    var _toHHMM = window.AppointmentContract ? window.AppointmentContract.timeToHHMM : function (v) { return v; };
    if (window.VHSClinicSettings.isRescheduleBlocked(_before.appointmentDate, _toHHMM(_before.appointmentTime))) {
      showToast('Rescheduling is no longer available within ' + window.VHSClinicSettings.cutoffLabel('reschedule') + ' of the appointment.', 'warning');
      return;
    }
  }
  var oldDate = _before ? _before.appointmentDate : '';
  var oldTime = _before ? _before.appointmentTime : '';
  var result = shared ? shared.reschedule(id, newDate, newTime) : { ok: false, error: 'not_found' };
  if (!result.ok) {
    // Same shared wording the User portal uses, so the front desk and the
    // owner are told the same thing about the same conflict.
    var _taken = result.error === 'slot_taken' || result.error === 'doctor_conflict' ||
                 result.error === 'resource_capacity_reached';
    showToast(_taken
      ? 'That slot is already booked.'
      : (window.SmartScheduling && window.SmartScheduling.describeReason
          ? window.SmartScheduling.describeReason(result.error)
          : 'Could not reschedule.'), 'error');
    return;
  }
  closeAdminReschedule();
  showToast('Rescheduled to ' + newDate + ' ' + (window.AppointmentContract ? window.AppointmentContract.timeTo12h(result.appointment.appointmentTime) : result.appointment.appointmentTime) + ' (same Reference ' + result.appointment.referenceNo + ').', 'success');
  _auditAdmin({ action: 'appointment_rescheduled', entityType: 'appointment', entityId: result.appointment.appointmentId, referenceNo: result.appointment.referenceNo, description: 'Admin rescheduled ' + result.appointment.referenceNo + ' from ' + oldDate + ' ' + oldTime + ' to ' + newDate + ' ' + newTime, metadata: { previousDate: oldDate, previousTime: oldTime, appointmentDate: newDate, appointmentTime: newTime } });
  if (document.getElementById('allAppointmentsTable')) loadAppointments();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && document.getElementById('adminBookModal')?.classList.contains('show')) {
    closeAdminBookModal();
  }
  if (e.key === 'Escape' && document.getElementById('checkInModal')?.classList.contains('show')) {
    closeCheckInModal();
  }
  if (e.key === 'Escape' && document.getElementById('appointmentDetailsModal')?.classList.contains('show')) {
    closeAppointmentDetails();
  }
});

document.addEventListener('change', function(e) {
  if (e.target.id === 'adminClientSelect') {
    var userId = e.target.value;
    var petSelect = document.getElementById('adminPetSelect');
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
  if (e.target.id === 'adminBookDate') {
    refreshAdminTimeSlots();
  }
  if (e.target.id === 'adminBookService') {
    // Availability is per SERVICE (doctor capacity and capacityPerSlot differ
    // per service), so changing the service must recompute the slot list. The
    // date handler alone left the dropdown showing whatever was rendered for
    // the previous service — e.g. all clinic hours when the date was picked
    // before the service — which let Admin offer a slot the engine refuses and
    // the User portal hides. The previously chosen time is deliberately NOT
    // preserved: it may not be bookable under the new service.
    refreshAdminTimeSlots();
  }
  if (e.target.id === 'adminRescheduleDate') {
    _populateAdminRescheduleSlots();
  }
});

// ── SCHEDULING ADAPTER (Admin booking) ──────────────────────────────
// Availability ALWAYS comes from SmartScheduling — the same engine the User
// booking form, the reschedule modal and Vetti read, so the front desk can
// never be offered a slot the owner portal refuses, or vice versa.
//
// The PHP endpoint below is a LEGACY FALLBACK ONLY. It is reached just when
// the engine cannot answer at all (engine script missing, or the selected
// service cannot be resolved against the catalog) — never for an ordinary UI
// state such as "no service chosen yet". It applies the old universal
// "anything at this wall-clock time is booked" rule, so it does NOT understand
// doctor capacity or per-service capacity — its answer must never be treated
// as authoritative, which is why the final save re-validates through the
// engine and never trusts this answer on its own.
// TODO(BACKEND): delete _legacyBookedSlotsFromPhp once
// GET /api/scheduling/slots exists; the engine then answers everywhere.
function _legacyBookedSlotsFromPhp(dateStr) {
  if (!dateStr) return Promise.resolve(null);
  return fetch('../php_files/get_booked_slots.php?date=' + dateStr)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      return (data && data.booked_slots) ? data.booked_slots : null;
    })
    .catch(function () { return null; });   // endpoint absent -> unfiltered hours
}

// Resolve the booking service the same way every portal does, and ask the
// engine. Returns { ok, slots:['9:00 AM', ...], reason, service } or null when
// the engine cannot answer and the caller must fall back.
function _adminSchedulingSlots(dateStr) {
  var sched = window.SmartScheduling;
  var users = window.SharedMockUsers;
  if (!sched || typeof sched.getAvailableSlots !== 'function') return null;
  if (!users || typeof users.serviceByValue !== 'function') return null;
  var value = document.getElementById('adminBookService');
  var svc = (value && value.value) ? users.serviceByValue(value.value) : null;
  if (!svc) return null;
  var result = sched.getAvailableSlots({ serviceId: svc.serviceId, date: dateStr });
  return {
    ok: result.ok === true,
    reason: result.reason || null,
    service: svc,
    slots: result.slots.map(function (s) { return s.time; })
  };
}

function _renderAdminSlotOptions(timeSelect, slots, prefilledTime) {
  timeSelect.innerHTML = slots.length
    ? '<option value="">Select time</option>' + slots.map(function (slot) {
        return '<option value="' + slot + '">' + slot + '</option>';
      }).join('')
    : '<option value="">No available slots that day</option>';
  if (prefilledTime) timeSelect.value = prefilledTime;
  // #adminBookTime is wrapped in a custom dropdown, whose closed-state label
  // is a SEPARATE copy of the selection. Without this the trigger can keep
  // advertising a time that the freshly rendered list no longer contains.
  if (typeof timeSelect._cdRefresh === 'function') timeSelect._cdRefresh();
}

function refreshAdminTimeSlots(prefilledTime) {
  var dateInput  = document.getElementById('adminBookDate');
  var timeSelect = document.getElementById('adminBookTime');
  if (!timeSelect) return;
  if (!dateInput || !dateInput.value) {
    timeSelect.innerHTML = '<option value="">Select date first</option>';
    return;
  }

  // No service picked yet: there is nothing to check capacity against, so list
  // the clinic's own hours — exactly what the User form does. This is a normal
  // UI state, not an engine failure, so it must NOT reach for the legacy
  // endpoint below.
  var svcValue = document.getElementById('adminBookService')
    ? document.getElementById('adminBookService').value : '';
  if (!svcValue) {
    _renderAdminSlotOptions(timeSelect, getVHSTimeSlots(dateInput.value), prefilledTime);
    return;
  }

  // 1. Authoritative: the shared scheduling engine.
  var viaEngine = _adminSchedulingSlots(dateInput.value);
  if (viaEngine) {
    if (!viaEngine.ok) {
      timeSelect.innerHTML = '<option value="">' +
        (window.SmartScheduling.describeReason
          ? window.SmartScheduling.describeReason(viaEngine.reason)
          : 'No available slots that day') + '</option>';
      return;
    }
    _renderAdminSlotOptions(timeSelect, viaEngine.slots, prefilledTime);
    return;
  }

  // 2. LEGACY FALLBACK ONLY — see the adapter note above.
  var slots = getVHSTimeSlots(dateInput.value);
  timeSelect.innerHTML = '<option value="">Loading slots...</option>';
  _legacyBookedSlotsFromPhp(dateInput.value).then(function (booked) {
    if (!booked) {
      _renderAdminSlotOptions(timeSelect, slots, prefilledTime);
      return;
    }
    timeSelect.innerHTML = '<option value="">Select time</option>' + slots.map(function (slot) {
      var isBooked = booked.indexOf(slot) !== -1;
      return '<option value="' + slot + '"' + (isBooked ? ' disabled' : '') + '>' +
        slot + (isBooked ? ' (Unavailable)' : '') + '</option>';
    }).join('');
    if (prefilledTime) timeSelect.value = prefilledTime;
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
  // service now carries the canonical catalog VALUE (FK-ready).
  var svc = window.SharedMockUsers ? window.SharedMockUsers.serviceByValue(service) : null;

  if (!userId)  { showToast('Please select a client.', 'warning'); return; }
  if (!petId)   { showToast('Please select a pet.', 'warning'); return; }
  if (!service) { showToast('Please select a service.', 'warning'); return; }
  if (!date)    { showToast('Please select a date.', 'warning'); return; }
  if (!time)    { showToast('Please select a time.', 'warning'); return; }

  if (!window.SharedMockAppointments) { showToast('Shared appointment store unavailable.', 'error'); return; }

  // FINAL-SAVE REVALIDATION. The time dropdown above is only a UI convenience:
  // the modal can sit open while the owner portal (or another front-desk tab)
  // books the same slot, so availability is re-checked against the SAME
  // SmartScheduling engine — and therefore the same doctor/per-service
  // capacity rules — the User booking form, the reschedule modal and Vetti use,
  // immediately before the write. A refusal writes NO record and emits NO audit
  // event, exactly like submitAdminReschedule.
  var _sched = window.SmartScheduling;
  if (_sched && typeof _sched.validateAppointmentRequest === 'function' && svc) {
    var _check = _sched.validateAppointmentRequest({ serviceId: svc.serviceId, date: date, time: time });
    if (!_check.ok) {
      // Same mapping the reschedule handler uses, so the front desk and the
      // owner are told the same thing about the same conflict.
      var _conflict = _check.reason === 'slot_taken' || _check.reason === 'doctor_conflict' ||
                      _check.reason === 'resource_capacity_reached';
      showToast(_conflict
        ? 'That slot is already booked.'
        : (_sched.describeReason ? _sched.describeReason(_check.reason) : 'Could not save the booking. Please try again.'), 'error');
      return;
    }
  } else {
    // Engine or service unresolvable: degrade to the legacy exact-time store
    // check. We never silently allow an unverified slot.
    var _toHHMM = window.AppointmentContract ? window.AppointmentContract.timeToHHMM : function (v) { return v; };
    var _takenNow = window.SharedMockAppointments.takenSlots(date) || [];
    if (_takenNow.indexOf(_toHHMM(time)) !== -1) { showToast('That slot is already booked.', 'error'); return; }
  }

  // Identity is minted by the SHARED contract helper (AppointmentContract.
  // generateIdentity) — the exact call the User portal makes, so the two can
  // never drift apart and records never collide.
  // TODO(BACKEND): POST book-appointment.php replaces this write-through and
  // returns the DB-assigned reference_no / appointment_id.
  var _identity = window.AppointmentContract.generateIdentity(window.SharedMockAppointments.getAll() || [], date);
  var aptId = _identity.appointmentId;
  var refNo = _identity.referenceNo;

  // Identity is resolved strictly by ID: owner by userId, pet by petId.
  var owner = window.SharedMockUsers
    ? window.SharedMockUsers.users().find(function (u) { return String(u.userId) === String(userId); })
    : null;
  var pet = window.SharedMockUsers ? window.SharedMockUsers.petById(petId) : null;

  // One canonical record written through the SAME store the User, Doctor,
  // and Doctor portals read.
  var canonical = window.AppointmentContract.fromLegacy({
    appointmentId: aptId,
    referenceNo: refNo,
    userId: userId,
    petId: petId,
    // Canonical service keys: serviceId is the machine identifier the backend
    // will key on; service carries the catalog VALUE, never the display label.
    // svc.value keeps that true even if a legacy caller passed a label.
    serviceId: svc ? svc.serviceId : null,
    service: svc ? svc.value : service,
    appointmentDate: date,
    appointmentTime: time,
    notes: notes,
    status: 'confirmed',
    owner: { name: owner ? owner.name : '', phone: owner ? (owner.phone || '') : '' },
    pet: { name: pet ? pet.name : '', species: pet ? (pet.species || '') : '', breed: pet ? (pet.breed || '') : '' }
  });

  var stored = window.SharedMockAppointments.add(canonical);
  if (!stored.ok || !stored.appointment) {
    showToast(stored.error === 'duplicate' ? 'This booking already exists.' : 'Could not save the booking. Please try again.', 'error');
    return;
  }
  closeAdminBookModal();
  showToast('Appointment booked (Reference ' + stored.appointment.referenceNo + '). Demo state \u2014 not saved to a database.', 'success');
  _auditAdmin({ action: 'appointment_created', entityType: 'appointment', entityId: stored.appointment.appointmentId, referenceNo: stored.appointment.referenceNo, description: 'Admin booked appointment ' + stored.appointment.referenceNo + ' for ' + (stored.appointment.owner ? stored.appointment.owner.name : 'client'), metadata: { appointmentDate: stored.appointment.appointmentDate, appointmentTime: stored.appointment.appointmentTime, service: stored.appointment.service } });
  loadAppointments();
}

// ─── ADMIN STATUS ACTIONS (frontend-demo honest mode) ───────────────────────────────
// Approve / reject / cancel write to the SAME shared mock state the User and
// Doctor portals read. No database persistence is claimed.
// TODO(BACKEND): Route through update_appointment_status.php (ENUM must be
// expanded first — see doctor/AUDIT-cross-portal-appointments.md).
function _adminSharedStatus(id, nextStatus, successMsg) {
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
  var _action = nextStatus === 'confirmed' ? 'appointment_approved'
    : (nextStatus === 'canceled' && /reject/i.test(successMsg || '')) ? 'appointment_rejected'
    : 'appointment_canceled';
  var _appt = result.appointment || {};
  _auditAdmin({ action: _action, entityType: 'appointment', entityId: _appt.appointmentId || id, referenceNo: _appt.referenceNo || '', description: 'Admin ' + (_action === 'appointment_approved' ? 'approved' : _action === 'appointment_rejected' ? 'rejected' : 'cancelled') + ' appointment ' + (_appt.referenceNo || id), metadata: { status: nextStatus } });
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
    _adminSharedStatus(id, 'confirmed', 'Appointment approved');
  }, {
    title: 'Approve Appointment',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    accent: 'success'
  });
}

function rejectAppointment(id) {
  confirmAction('Reject this appointment?', function() {
    _adminSharedStatus(id, 'canceled', 'Appointment rejected');
  }, {
    title: 'Reject Appointment',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    danger: true
  });
}

function cancelAppointment(id) {
  confirmAction('Cancel this appointment?', function() {
    _adminSharedStatus(id, 'canceled', 'Appointment cancelled');
  }, {
    title: 'Cancel Appointment',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    danger: true
  });
}

// ─── CLIENT SHORTCUTS ────────────────────────────────────────────────

function viewClientDetails(id) { showUnderWork('Client registration details'); }
function viewClient(id)        { showUnderWork('Client profile view'); }
function editClient(id)        { showUnderWork('Edit client'); }
function addNewOwner()         { window.location.href = 'clients-pets.html'; }

// ─── PHASE 4: SHARED AUDIT TRAIL (frontend demo) ────────────────────────
// Every successful write in this file is mirrored into the shared audit
// store (shared/audit-store.js) at the exact spot the action succeeds.
// Entries are prototype records only.
// TODO(BACKEND): Replace frontend audit persistence with server-generated
// audit records — the API writes audit_log inside the same DB transaction
// as the action; the frontend is never the audit authority.
function _auditAdmin(event) {
  if (!window.AuditLog) return;
  event.actor = window.AuditLog.adminActor();
  window.AuditLog.add(event);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  initDashboardShared();
  initAllCustomDropdowns();
  startNavbarDatetime();
});

// ─── UNIFIED ADMIN PORTAL (Phase 1) ─────────────────────────────────────────
// Operational pages reuse the front-desk implementation above (AppointmentStore,
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
          <td class="action-cell">
            ${kebabHtml('doctor-' + d.doctorId, [
              { label: 'Edit', action: 'openEditDoctor', arg: d.doctorId },
              inactive
                ? { label: 'Activate', action: 'toggleDoctorAccount', arg: d.doctorId, cls: 'success' }
                : { label: 'Deactivate', action: 'toggleDoctorAccount', arg: d.doctorId, cls: 'danger' }
            ])}
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
  _auditAdmin({ action: 'doctor_created', entityType: 'doctor', entityId: result.doctor.doctorId, description: 'Admin created doctor account for ' + result.doctor.name });
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
  var _doc = window.SharedMockDoctors.byId(id);
  _auditAdmin({ action: 'doctor_updated', entityType: 'doctor', entityId: id, description: 'Admin updated doctor profile — ' + (_doc ? _doc.name : id) });
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
      _auditAdmin({ action: next === 'inactive' ? 'doctor_deactivated' : 'doctor_activated', entityType: 'doctor', entityId: id, description: 'Admin ' + (next === 'inactive' ? 'deactivated' : 'activated') + ' doctor account — ' + d.name });
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
  const _prevAvail = d ? d.availabilityStatus : '';
  window.SharedMockDoctors.setAvailability(id, value);
  if (window.showToast) {
    showToast(
      `${d ? d.name : "Doctor"} → ${_availLabel(value)} (demo state — shared with the Doctor Portal)`,
      "success",
    );
  }
  _auditAdmin({ action: 'doctor_availability_changed', entityType: 'doctor', entityId: id, description: 'Admin set ' + (d ? d.name : 'Doctor') + ' availability to ' + _availLabel(value), metadata: { previous: _availLabel(_prevAvail), new: _availLabel(value) } });
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
// ─── PHASE 2A POLISH: CLIENTS & PETS FULL MANAGEMENT ─────────────────────
// Complete User/Pet management on the canonical shared store:
//   • Tables (Pet Owners / All Pets) with compact, non-overflowing actions
//   • Semantic action buttons: View=neutral, Edit=accent, Activate=success,
//     Deactivate=danger (portal.css .btn-view/.btn-edit/.btn-success/.btn-danger)
//   • Owner Profile modal: full canonical fields + pets + Account Access
//   • Pet Profile modal: full frozen pet contract + vaccination section
//   • Register Pet: Admin-assisted creation via SharedMockUsers.addPet()
//     (ownership linked strictly by ownerId — never by name matching)
// All reads/writes go through window.SharedMockUsers. No portal-level
// localStorage. TODO(BACKEND): each call site maps 1:1 to REST endpoints —
//   table loads → GET /users, /pets; saves → PUT /users/:id, PUT /pets/:id;
//   create → POST /users, POST /pets; status → PATCH /users/:id/status;
//   Account Access (reset/unlock) → future auth-service endpoints; the
//   frontend never displays, sets, or stores credentials.
(function () {
  'use strict';

  if (!document.getElementById('clientsTable') && !document.getElementById('petsTable')) return;

  var SMU = function () { return window.SharedMockUsers || null; };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function txt(v) { return (v == null || String(v).trim() === '') ? '' : String(v); }
  function dash(v) { var t = txt(v); return t || '\u2014'; }

  // ── Table renders (compact semantic actions; wrap cleanly, no overflow) ──
  function ownerActions(u) {
    var inactive = u.status === 'inactive';
    // Compact kebab menu (advisor revision) — same actions, same handlers.
    return kebabHtml('user-' + u.userId, [
      { label: 'View Profile', action: 'viewOwnerProfile', arg: u.userId },
      { label: 'Edit', action: 'openEditUser', arg: u.userId },
      inactive
        ? { label: 'Activate', action: 'toggleUserStatus', arg: u.userId, cls: 'success' }
        : { label: 'Deactivate', action: 'toggleUserStatus', arg: u.userId, cls: 'danger' }
    ]);
  }

  function renderClientsTable() {
    var tbody = document.getElementById('clientsTable');
    if (!tbody || !SMU()) return;
    if (tbody.dataset.backendLoaded === '1') return;
    var owners = SMU().users();
    var pets = SMU().pets();
    if (!owners.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">No clients yet.</td></tr>';
      return;
    }
    tbody.innerHTML = owners.map(function (u, i) {
      var petCount = pets.filter(function (p) { return String(p.ownerId) === String(u.userId); }).length;
      return '<tr data-id="' + u.userId + '">' +
        '<td>#C' + String(i + 1).padStart(3, '0') + '</td>' +
        '<td>' + esc(u.name) + '</td>' +
        '<td>' + esc(u.email) + '</td>' +
        '<td>' + esc(dash(u.phone)) + '</td>' +
        '<td>' + esc(dash(u.address)) + '</td>' +
        '<td>' + petCount + '</td>' +
        '<td class="action-cell">' + ownerActions(u) + '</td>' +
        '</tr>';
    }).join('');
  }

  function petTypeLabel(p) {
    if (p.species === 'Other') return p.speciesCustom ? p.speciesCustom : 'Other';
    return p.species || '\u2014';
  }

  // Last completed/attended visit per pet, derived from the canonical
  // appointment store (TODO(BACKEND): GET /appointments?pet_id=...&last=1).
  function lastVisitLabel(petId) {
    var store = window.SharedMockAppointments;
    if (!store || !store.getAll) return '\u2014';
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var past = store.getAll().filter(function (a) {
      var d = a.appointmentDate || a.appointment_date || '';
      return String(a.petId) === String(petId) &&
        ['canceled', 'no_show'].indexOf(String(a.status)) === -1 &&
        d <= todayStr;
    });
    if (!past.length) return '\u2014';
    var last = past.map(function (a) { return String(a.appointmentDate || a.appointment_date || ''); }).sort().pop();
    return _fmtDateD(last);
  }

  function renderPetsTable() {
    var tbody = document.getElementById('petsTable');
    if (!tbody || !SMU()) return;
    if (tbody.dataset.backendLoaded === '1') return;
    var pets = SMU().pets();
    var users = SMU().users();
    if (!pets.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">No pets yet.</td></tr>';
      return;
    }
    tbody.innerHTML = pets.map(function (p, i) {
      var owner = users.find(function (u) { return String(u.userId) === String(p.ownerId); });
      return '<tr data-id="' + p.petId + '">' +
        '<td>#P' + String(i + 1).padStart(3, '0') + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + esc(petTypeLabel(p)) + '</td>' +
        '<td>' + esc(dash(p.breed === 'Other' ? (p.breedCustom || 'Other') : p.breed)) + '</td>' +
        '<td>' + (p.age ? p.age + ' yr' : '\u2014') + '</td>' +
        '<td>' + esc(dash(p.gender)) + '</td>' +
        '<td>' + esc(owner ? owner.name : '\u2014') + '</td>' +
        '<td>' + esc(lastVisitLabel(p.petId)) + '</td>' +
        '<td class="action-cell">' +
          kebabHtml('pet-' + p.petId, [
            { label: 'View Profile', action: 'viewPetProfile', arg: p.petId },
            { label: 'Edit', action: 'openEditPet', arg: p.petId }
          ]) +
        '</td>' +
        '</tr>';
    }).join('');
  }

  // ── Owner Profile modal: full canonical fields + pets + Account Access ──
  window.viewOwnerProfile = function (id) {
    var u = SMU() ? SMU().byId(id) : null;
    if (!u) { showToast('User not found.', 'error'); return; }
    var pets = SMU().petsOfOwner(id);
    var middle = txt(u.middleName);
    var initials = middle ? middle.split(/\s+/).map(function (w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ') : '';
    var fullName = [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ');
    var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.textContent = val || '\u2014'; };
    set('ownerName', fullName || u.name);
    set('ownerMiddle', initials);
    set('ownerEmail', u.email);
    set('ownerPhone', u.phone);
    set('ownerDob', u.birthdate ? _fmtDateD(u.birthdate) : '');
    set('ownerAddress', u.address);
    var st = document.getElementById('ownerStatus');
    if (st) st.innerHTML = '<span class="status-badge ' + (u.status === 'inactive' ? 'cancelled' : 'completed') + '">' + (u.status === 'inactive' ? 'Inactive' : 'Active') + '</span>';
    var cnt = document.getElementById('ownerPetCount');
    if (cnt) cnt.textContent = pets.length ? '(' + pets.length + ') ' + pets.map(function (p) { return p.name; }).join(', ') : '';
    var tbody = document.getElementById('ownerPetsTable');
    if (tbody) {
      tbody.innerHTML = pets.length ? pets.map(function (p) {
        return '<tr><td>' + esc(p.name) + '</td><td>' + esc(petTypeLabel(p)) + '</td><td>' + esc(dash(p.breed)) + '</td><td>' + (p.age ? p.age + ' yr' : '\u2014') + '</td><td>\u2014</td></tr>';
      }).join('') : '<tr><td colspan="5" style="text-align:center;color:#888;">No pets registered.</td></tr>';
    }
    var section = document.getElementById('ownerAccessSection');
    if (section) section.dataset.userId = String(u.userId);
    var modal = document.getElementById('ownerProfileModal');
    if (modal) modal.classList.add('show');
  };
  window.closeOwnerProfile = function () { var m = document.getElementById('ownerProfileModal'); if (m) m.classList.remove('show'); };

  // Account Access: honest backend-pending placeholders. No passwords are
  // displayed, set, read, or stored anywhere on the frontend.
  // TODO(BACKEND): POST /auth/password-reset { email } and
  // POST /auth/users/:id/unlock — issued and enforced by the auth service.
  window.accountAccessAction = function (kind) {
    var section = document.getElementById('ownerAccessSection');
    var uid = section ? section.dataset.userId : '';
    var u = uid ? (SMU() ? SMU().byId(uid) : null) : null;
    if (kind === 'reset') {
      showToast('Password reset will be sent through the authentication backend once connected.', 'info');
    } else if (kind === 'unlock') {
      showToast('Account unlocking will be enforced by the authentication backend once connected.', 'info');
    }
  };

  // ── Pet Profile modal: full frozen pet contract ─────────────────────────
  window.viewPetProfile = function (id) {
    var p = SMU() ? SMU().petById(id) : null;
    if (!p) { showToast('Pet not found.', 'error'); return; }
    var owner = SMU().byId(p.ownerId);
    var set = function (elId, val) { var el = document.getElementById(elId); if (el) el.textContent = val || '\u2014'; };
    set('petName', p.name);
    set('petOwner', owner ? owner.name : '');
    set('petSpecies', petTypeLabel(p));
    set('petBreed', p.breed === 'Other' ? (p.breedCustom || 'Other') : p.breed);
    set('petGender', p.gender);
    set('petAge', p.age ? p.age + ' years' : '');
    set('petWeight', p.weightKg ? p.weightKg + ' kg' : '');
    set('petRepro', p.reproductiveStatus);
    set('petColor', p.color);
    set('petMicrochip', p.microchipId);
    set('petAllergies', p.allergies);
    set('petChronic', p.chronicConditions);
    set('petNotes', p.notes);
    var tbody = document.getElementById('petVaccinationTable');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">No vaccination records in the demo dataset.</td></tr>';
    var modal = document.getElementById('petProfileModal');
    if (modal) modal.classList.add('show');
  };
  window.closePetProfile = function () { var m = document.getElementById('petProfileModal'); if (m) m.classList.remove('show'); };

  // ── Edit User ────────────────────────────────────────────────────────────
  window.openEditUser = function (id) {
    var u = SMU() ? SMU().byId(id) : null;
    if (!u) { showToast('User not found.', 'error'); return; }
    document.getElementById('editUserId').value = u.userId;
    document.getElementById('editUserFirstName').value = txt(u.firstName);
    document.getElementById('editUserMiddleName').value = txt(u.middleName);
    document.getElementById('editUserLastName').value = txt(u.lastName);
    document.getElementById('editUserPhone').value = txt(u.phone);
    document.getElementById('editUserEmail').value = txt(u.email);
    document.getElementById('editUserAddress').value = txt(u.address);
    document.getElementById('editUserBirthdate').value = txt(u.birthdate);
    document.getElementById('editUserStatus').value = u.status === 'inactive' ? 'inactive' : 'active';
    document.getElementById('editUserModal').classList.add('show');
  };
  window.closeEditUser = function () { document.getElementById('editUserModal').classList.remove('show'); };
  window.openEditUserFromProfile = function () {
    var section = document.getElementById('ownerAccessSection');
    var uid = section ? section.dataset.userId : '';
    if (!uid) return;
    window.closeOwnerProfile();
    window.openEditUser(uid);
  };
  window.submitEditUser = function (e) {
    e.preventDefault();
    var id = document.getElementById('editUserId').value;
    var firstName = document.getElementById('editUserFirstName').value.trim();
    var lastName = document.getElementById('editUserLastName').value.trim();
    var result = SMU().updateUser(id, {
      firstName: firstName,
      middleName: document.getElementById('editUserMiddleName').value.trim(),
      lastName: lastName,
      // Keep the single display name in sync for every portal that reads it.
      name: (firstName + ' ' + lastName).trim(),
      phone: document.getElementById('editUserPhone').value.trim(),
      email: document.getElementById('editUserEmail').value.trim(),
      address: document.getElementById('editUserAddress').value.trim(),
      birthdate: document.getElementById('editUserBirthdate').value,
      status: document.getElementById('editUserStatus').value
    });
    if (!result.ok) {
      showToast(result.error === 'duplicate_email' ? 'That email is already in use by another account.' : 'Could not save changes.', 'error');
      return;
    }
    closeEditUser();
    renderClientsTable();
    showToast('User profile updated.', 'success');
    var _u = SMU().byId(id);
    _auditAdmin({ action: 'user_updated', entityType: 'user', entityId: id, description: 'Admin updated profile — ' + (_u ? _u.name : id) });
  };

  // ── Create User (assisted; role stays canonical "User") ──────────────────
  window.openCreateUserModal = function () {
    document.getElementById('createUserForm').reset();
    document.getElementById('createUserModal').classList.add('show');
  };
  window.closeCreateUser = function () { document.getElementById('createUserModal').classList.remove('show'); };
  window.submitCreateUser = function (e) {
    e.preventDefault();
    var result = SMU().addUser({
      firstName: document.getElementById('newUserFirstName').value.trim(),
      middleName: document.getElementById('newUserMiddleName').value.trim(),
      lastName: document.getElementById('newUserLastName').value.trim(),
      phone: document.getElementById('newUserPhone').value.trim(),
      email: document.getElementById('newUserEmail').value.trim(),
      address: document.getElementById('newUserAddress').value.trim(),
      birthdate: document.getElementById('newUserBirthdate').value
    });
    if (!result.ok) {
      showToast(result.error === 'duplicate_email' ? 'A user with that email already exists.' : 'Please complete the required fields.', 'error');
      return;
    }
    closeCreateUser();
    renderClientsTable();
    showToast('User account created for ' + result.user.name + '.', 'success');
    _auditAdmin({ action: 'user_created', entityType: 'user', entityId: result.user.userId, description: 'Admin created account for ' + result.user.name });
  };

  // ── Account status (Active / Inactive only — no fake auth states) ────────
  window.toggleUserStatus = function (id) {
    var u = SMU().byId(id);
    if (!u) return;
    var next = u.status === 'inactive' ? 'active' : 'inactive';
    confirmAction(
      (next === 'inactive' ? 'Deactivate' : 'Activate') + ' the account for ' + u.name + '?',
      function () {
        SMU().setUserStatus(id, next);
        renderClientsTable();
        showToast('Account ' + next + '.', 'success');
        _auditAdmin({ action: next === 'inactive' ? 'user_deactivated' : 'user_activated', entityType: 'user', entityId: id, description: 'Admin ' + (next === 'inactive' ? 'deactivated' : 'activated') + ' account — ' + u.name });
      },
      { title: (next === 'inactive' ? 'Deactivate' : 'Activate') + ' User Account', danger: next === 'inactive' }
    );
  };

  // ── Edit Pet ─────────────────────────────────────────────────────────────
  window.openEditPet = function (id) {
    var p = SMU() ? SMU().petById(id) : null;
    if (!p) { showToast('Pet not found.', 'error'); return; }
    var owner = SMU().byId(p.ownerId);
    document.getElementById('editPetId').value = p.petId;
    document.getElementById('editPetName').value = txt(p.name);
    document.getElementById('editPetOwnerName').value = owner ? owner.name : '\u2014';
    var speciesSel = document.getElementById('editPetSpecies');
    var known = ['Dog', 'Cat', 'Bird', 'Rabbit'];
    if (p.species === 'Other' || (p.species && known.indexOf(p.species) === -1)) {
      speciesSel.value = 'Other';
      document.getElementById('editPetSpeciesCustom').style.display = '';
      document.getElementById('editPetSpeciesCustom').value = p.species === 'Other' ? txt(p.speciesCustom) : p.species;
    } else {
      speciesSel.value = txt(p.species);
      document.getElementById('editPetSpeciesCustom').style.display = 'none';
      document.getElementById('editPetSpeciesCustom').value = '';
    }
    document.getElementById('editPetBreed').value = txt(p.breed);
    document.getElementById('editPetGender').value = txt(p.gender);
    document.getElementById('editPetAge').value = p.age || '';
    document.getElementById('editPetWeightKg').value = p.weightKg || '';
    document.getElementById('editPetRepro').value = txt(p.reproductiveStatus);
    document.getElementById('editPetColor').value = txt(p.color);
    document.getElementById('editPetMicrochip').value = txt(p.microchipId);
    document.getElementById('editPetAllergies').value = txt(p.allergies);
    document.getElementById('editPetChronic').value = txt(p.chronicConditions);
    document.getElementById('editPetNotes').value = txt(p.notes);
    document.getElementById('editPetModal').classList.add('show');
  };
  window.closeEditPet = function () { document.getElementById('editPetModal').classList.remove('show'); };
  window.submitEditPet = function (e) {
    e.preventDefault();
    var id = document.getElementById('editPetId').value;
    var speciesVal = document.getElementById('editPetSpecies').value;
    var fields = {
      name: document.getElementById('editPetName').value.trim(),
      species: speciesVal,
      speciesCustom: speciesVal === 'Other' ? document.getElementById('editPetSpeciesCustom').value.trim() : '',
      breed: document.getElementById('editPetBreed').value.trim(),
      gender: document.getElementById('editPetGender').value,
      age: parseInt(document.getElementById('editPetAge').value, 10) || 0,
      weightKg: parseFloat(document.getElementById('editPetWeightKg').value) || 0,
      reproductiveStatus: document.getElementById('editPetRepro').value,
      color: document.getElementById('editPetColor').value.trim(),
      microchipId: document.getElementById('editPetMicrochip').value.trim(),
      allergies: document.getElementById('editPetAllergies').value.trim(),
      chronicConditions: document.getElementById('editPetChronic').value.trim(),
      notes: document.getElementById('editPetNotes').value.trim()
    };
    var result = SMU().updatePet(id, fields);
    if (!result.ok) { showToast('Could not save changes.', 'error'); return; }
    closeEditPet();
    renderPetsTable();
    showToast('Pet profile updated.', 'success');
    var _p = SMU().petById(id);
    _auditAdmin({ action: 'pet_updated', entityType: 'pet', entityId: id, description: 'Admin updated pet profile — ' + (_p ? _p.name : id) });
  };

  // ── Register Pet (Admin-assisted, canonical contract, ownerId-linked) ────
  window.addNewPet = function () {
    var sel = document.getElementById('regPetOwner');
    sel.innerHTML = '<option value="">Select owner</option>' + SMU().users().map(function (u) {
      return '<option value="' + u.userId + '">' + esc(u.name + ' \u2014 ' + u.email) + '</option>';
    }).join('');
    document.getElementById('registerPetForm').reset();
    document.getElementById('regPetSpeciesCustom').style.display = 'none';
    document.getElementById('registerPetModal').classList.add('show');
  };
  window.closeRegisterPet = function () { document.getElementById('registerPetModal').classList.remove('show'); };
  window.submitRegisterPet = function (e) {
    e.preventDefault();
    var speciesVal = document.getElementById('regPetSpecies').value;
    var result = SMU().addPet({
      ownerId: document.getElementById('regPetOwner').value,
      name: document.getElementById('regPetName').value.trim(),
      species: speciesVal,
      speciesCustom: speciesVal === 'Other' ? document.getElementById('regPetSpeciesCustom').value.trim() : '',
      breed: document.getElementById('regPetBreed').value.trim(),
      gender: document.getElementById('regPetGender').value,
      age: parseInt(document.getElementById('regPetAge').value, 10) || 0,
      weightKg: parseFloat(document.getElementById('regPetWeightKg').value) || 0,
      reproductiveStatus: document.getElementById('regPetRepro').value,
      color: document.getElementById('regPetColor').value.trim(),
      microchipId: document.getElementById('regPetMicrochip').value.trim(),
      allergies: document.getElementById('regPetAllergies').value.trim(),
      chronicConditions: document.getElementById('regPetChronic').value.trim(),
      notes: document.getElementById('regPetNotes').value.trim()
    });
    if (!result.ok) {
      showToast(result.error === 'owner_not_found' ? 'Selected owner no longer exists.' : 'Please choose an owner and provide a pet name.', 'error');
      return;
    }
    closeRegisterPet();
    renderPetsTable();
    renderClientsTable();
    showToast('Pet registered for ' + (SMU().byId(result.pet.ownerId) || {}).name + '.', 'success');
    _auditAdmin({ action: 'pet_registered', entityType: 'pet', entityId: result.pet.petId, description: 'Admin registered pet ' + result.pet.name + ' for ' + ((SMU().byId(result.pet.ownerId) || {}).name || 'owner') });
  };

  // Live type filter (All Pets tab).
  function setupPetTypeFilter() {
    var sel = document.getElementById('filterPetType');
    if (!sel) return;
    sel.addEventListener('change', function () {
      var v = sel.value;
      var tbody = document.getElementById('petsTable');
      if (!tbody) return;
      tbody.querySelectorAll('tr[data-id]').forEach(function (tr) {
        if (v === 'all') { tr.style.display = ''; return; }
        var p = SMU() ? SMU().petById(tr.dataset.id) : null;
        var match = p && ((v === 'other' && (p.species === 'Other' || ['dog', 'cat', 'bird', 'rabbit'].indexOf(String(p.species).toLowerCase()) === -1)) || String(p.species).toLowerCase() === v);
        tr.style.display = match ? '' : 'none';
      });
    });
  }

  function init() {
    renderClientsTable();
    renderPetsTable();
    setupPetTypeFilter();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
// ─── PHASE 3: SERVICES MANAGEMENT + CLINIC SETTINGS ──────────────────────
// Both pages read/write ONLY the shared layers — no portal-side storage:
//   Services       → SharedMockUsers service CRUD (persistence lives in
//                    shared/mock-users.js, storage inside the module)
//   Clinic config  → VHSClinicSettings (defaults + overrides inside
//                    shared/clinic-settings.js)
// TODO(BACKEND): Services → GET/POST/PATCH /api/services(:id)(/status);
// Clinic Settings → GET /api/clinic-settings + PATCH /api/clinic-settings.
// The backend will own validation, authorization, historical consistency,
// and concurrency-sensitive scheduling.
(function () {
  'use strict';

  function escS(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ══ SERVICES MANAGEMENT PAGE ════════════════════════════════════════════
  var _svcSearch = '';
  var _svcCategory = 'all';
  var _svcStatus = 'all';

  function _serviceCategoryOptions() {
    var sel = document.getElementById('filterServiceCategory');
    if (!sel || !window.SharedMockUsers) return;
    var cats = {};
    window.SharedMockUsers.services().forEach(function (s) { cats[s.group] = true; });
    var current = sel.value || 'all';
    sel.innerHTML = '<option value="all">All Categories</option>' + Object.keys(cats).sort().map(function (c) {
      return '<option value="' + escS(c) + '">' + escS(c) + '</option>';
    }).join('');
    if ([].some.call(sel.options, function (o) { return o.value === current; })) sel.value = current;
  }

  function _serviceBadge(active) {
    return active !== false
      ? '<span class="status-badge completed">Active</span>'
      : '<span class="status-badge cancelled">Inactive</span>';
  }

  function renderServicesTable() {
    var tbody = document.getElementById('servicesTable');
    if (!tbody || !window.SharedMockUsers) return;
    var all = window.SharedMockUsers.services();
    _serviceCategoryOptions();
    var list = all.filter(function (s) {
      if (_svcCategory !== 'all' && s.group !== _svcCategory) return false;
      var inactive = s.active === false;
      if (_svcStatus === 'active' && inactive) return false;
      if (_svcStatus === 'inactive' && !inactive) return false;
      if (_svcSearch && (s.label + ' ' + s.group).toLowerCase().indexOf(_svcSearch) === -1) return false;
      return true;
    });
    tbody.innerHTML = list.length ? list.map(function (s) {
      var inactive = s.active === false;
      var inUse = window.SharedMockUsers.serviceInUse(s.value) || window.SharedMockUsers.serviceInUse(s.label);
      return '<tr data-id="' + s.serviceId + '">' +
        '<td>#S' + String(s.serviceId).padStart(3, '0') + '</td>' +
        '<td><strong>' + escS(s.label) + '</strong><br /><span style="font-size:0.75rem;color:#6b7280;">' + escS(s.value) + '</span></td>' +
        '<td>' + escS(s.group) + '</td>' +
        '<td>' + escS(s.price || '\u2014') + '</td>' +
        '<td>' + _serviceBadge(s.active) + '</td>' +
        '<td class="action-cell">' +
          kebabHtml('service-' + s.serviceId, [
            { label: 'Edit', action: 'openEditService', arg: s.serviceId },
            inactive
              ? { label: 'Activate', action: 'toggleServiceStatus', arg: s.serviceId, cls: 'success' }
              : { label: 'Deactivate', action: 'toggleServiceStatus', arg: s.serviceId, cls: 'danger' }
          ].concat(window.SharedMockUsers.canDeleteService && window.SharedMockUsers.canDeleteService(s.serviceId)
            ? [{ label: 'Delete', action: 'deleteUnusedService', arg: s.serviceId, cls: 'danger' }]
            : [])) +
        '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="6" style="text-align:center;color:#888;">No services match the current filters.</td></tr>';
  }

  window.openCreateServiceModal = function () {
    document.getElementById('serviceForm').reset();
    document.getElementById('serviceIdField').value = '';
    document.getElementById('serviceModalTitle').textContent = 'Add Service';
    document.getElementById('svcActive').value = 'active';
    // Custom-category field only shows when "Other" is selected.
    document.getElementById('svcGroupCustomWrap').style.display = 'none';
    document.getElementById('svcGroupCustom').value = '';
    document.getElementById('serviceModal').classList.add('show');
  };
  window.closeServiceModal = function () {
    document.getElementById('serviceModal').classList.remove('show');
  };
  window.openEditService = function (id) {
    var s = window.SharedMockUsers.serviceById(id);
    if (!s) { showToast('Service not found.', 'error'); return; }
    document.getElementById('serviceForm').reset();
    document.getElementById('serviceIdField').value = s.serviceId;
    document.getElementById('serviceModalTitle').textContent = 'Edit Service';
    document.getElementById('svcLabel').value = s.label;
    var grp = document.getElementById('svcGroup');
    var known = [].some.call(grp.options, function (o) { return o.value === s.group; });
    var customWrap = document.getElementById('svcGroupCustomWrap');
    var customInput = document.getElementById('svcGroupCustom');
    if (known) {
      grp.value = s.group;
      customWrap.style.display = 'none';
      customInput.value = '';
    } else {
      // Previously-saved custom category: show "Other" plus its original text.
      grp.value = 'Other';
      customWrap.style.display = '';
      customInput.value = s.group;
    }
    document.getElementById('svcPrice').value = s.price || '';
    document.getElementById('svcActive').value = s.active === false ? 'inactive' : 'active';
    document.getElementById('serviceModal').classList.add('show');
  };
  window.submitService = function (e) {
    e.preventDefault();
    var id = document.getElementById('serviceIdField').value;
    var grp = document.getElementById('svcGroup').value;
    // "Other" resolves to the typed custom category (falls back to Other
    // itself when left blank, so no empty group is ever stored).
    var customWrap = document.getElementById('svcGroupCustomWrap');
    if (grp === 'Other' && customWrap.style.display !== 'none') {
      grp = document.getElementById('svcGroupCustom').value.trim() || 'Other';
    }
    var fields = {
      label: document.getElementById('svcLabel').value.trim(),
      group: grp,
      price: document.getElementById('svcPrice').value.trim(),
      active: document.getElementById('svcActive').value !== 'inactive'
    };
    if (!fields.label) { showToast('Service name is required.', 'warning'); return; }
    var result = id
      ? window.SharedMockUsers.updateService(id, fields)
      : window.SharedMockUsers.addService(fields);
    if (!result.ok) {
      showToast(result.error === 'duplicate'
        ? 'A service with that name or key already exists.'
        : 'Could not save the service.', 'error');
      return;
    }
    closeServiceModal();
    renderServicesTable();
    showToast(id ? 'Service updated. Existing appointments keep their stored service.' : 'Service added to the catalog.', 'success');
    _auditAdmin({ action: id ? 'service_updated' : 'service_created', entityType: 'service', entityId: result.service.serviceId, description: 'Admin ' + (id ? 'updated service' : 'created service') + ' — ' + result.service.label, metadata: { price: result.service.price || '', active: result.service.active !== false } });
  };
  window.toggleServiceStatus = function (id) {
    var s = window.SharedMockUsers.serviceById(id);
    if (!s) return;
    var next = s.active === false;
    confirmAction(
      (next ? 'Activate' : 'Deactivate') + ' "' + s.label + '"?' + (next ? '' : ' It will no longer be offered for new bookings; existing appointments are unaffected.'),
      function () {
        window.SharedMockUsers.setServiceStatus(id, next);
        renderServicesTable();
        showToast('Service ' + (next ? 'activated' : 'deactivated') + '.', 'success');
        _auditAdmin({ action: next ? 'service_activated' : 'service_deactivated', entityType: 'service', entityId: id, description: 'Admin ' + (next ? 'activated' : 'deactivated') + ' service — ' + s.label });
      },
      { title: (next ? 'Activate' : 'Deactivate') + ' Service', danger: !next }
    );
  };
  window.deleteUnusedService = function (id) {
    var s = window.SharedMockUsers.serviceById(id);
    if (!s) return;
    confirmAction('Delete "' + s.label + '" permanently? This is only possible for unused, newly created services.', function () {
      var r = window.SharedMockUsers.deleteService(id);
      if (!r.ok) {
        showToast(r.error === 'in_use' ? 'Service is referenced by appointments — archive it instead.' : 'Service cannot be deleted.', 'error');
        renderServicesTable();
        return;
      }
      renderServicesTable();
      showToast('Service deleted.', 'success');
      _auditAdmin({ action: 'service_deleted', entityType: 'service', entityId: id, description: 'Admin deleted service — ' + s.label });
    }, { title: 'Delete Service', danger: true });
  };

  // ── SERVICES MANAGEMENT PAGE ════════════════════════════════════════════
  // Category "Other" reveals a custom-category input; selecting any
  // predefined category hides it again (no stale custom text lingers).
  document.getElementById('svcGroup')?.addEventListener('change', function () {
    var wrap = document.getElementById('svcGroupCustomWrap');
    if (!wrap) return;
    var isOther = this.value === 'Other';
    wrap.style.display = isOther ? '' : 'none';
    if (!isOther) document.getElementById('svcGroupCustom').value = '';
  });

  function initServicesPage() {
    if (!document.getElementById('servicesTable')) return;
    renderServicesTable();
    document.getElementById('searchServices')?.addEventListener('input', function (e) {
      _svcSearch = e.target.value.trim().toLowerCase();
      renderServicesTable();
    });
    document.getElementById('filterServiceCategory')?.addEventListener('change', function (e) {
      _svcCategory = e.target.value;
      renderServicesTable();
    });
    document.getElementById('filterServiceStatus')?.addEventListener('change', function (e) {
      _svcStatus = e.target.value;
      renderServicesTable();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initServicesPage);
  } else {
    initServicesPage();
  }

  // ══ CLINIC SETTINGS PAGE ════════════════════════════════════════════════
  function _setField(id, val) { var el = document.getElementById(id); if (el) el.value = val; }

  function populateClinicSettings() {
    if (!document.getElementById('clinicSettingsForm') || !window.VHSClinicSettings) return;
    var s = window.VHSClinicSettings.get();
    _setField('csWeekdayFirst', s.hours.weekday.firstAppointment);
    _setField('csWeekdayLast', s.hours.weekday.lastAppointment);
    _setField('csWeekendFirst', s.hours.weekend.firstAppointment);
    _setField('csWeekendLast', s.hours.weekend.lastAppointment);
    _setField('csSlotInterval', String(s.slotIntervalMinutes));
    _setField('csCancelCutoff', s.cancellationCutoffMinutes);
    _setField('csReschedCutoff', s.rescheduleCutoffMinutes);
    _setField('csNoShowGrace', s.noShowGraceMinutes);
    _setField('csClinicName', s.clinicInfo.name);
    _setField('csPhone', s.clinicInfo.phone);
    _setField('csEmail', s.clinicInfo.email);
    _setField('csWebsite', s.clinicInfo.website);
    _setField('csAddress', s.clinicInfo.address);
  }

  window.submitClinicSettings = function (e) {
    e.preventDefault();
    if (!window.VHSClinicSettings) return;
    var result = window.VHSClinicSettings.update({
      hours: {
        weekday: {
          firstAppointment: document.getElementById('csWeekdayFirst').value || undefined,
          lastAppointment: document.getElementById('csWeekdayLast').value || undefined
        },
        weekend: {
          firstAppointment: document.getElementById('csWeekendFirst').value || undefined,
          lastAppointment: document.getElementById('csWeekendLast').value || undefined
        }
      },
      slotIntervalMinutes: parseInt(document.getElementById('csSlotInterval').value, 10),
      cancellationCutoffMinutes: parseInt(document.getElementById('csCancelCutoff').value, 10),
      rescheduleCutoffMinutes: parseInt(document.getElementById('csReschedCutoff').value, 10),
      noShowGraceMinutes: parseInt(document.getElementById('csNoShowGrace').value, 10),
      clinicInfo: {
        name: document.getElementById('csClinicName').value.trim(),
        phone: document.getElementById('csPhone').value.trim(),
        email: document.getElementById('csEmail').value.trim(),
        website: document.getElementById('csWebsite').value.trim(),
        address: document.getElementById('csAddress').value.trim()
      }
    });
    if (result.ok) {
      showToast('Clinic settings saved. Booking flows pick these up on their next load.', 'success');
      populateClinicSettings();
      _auditAdmin({ action: 'clinic_settings_updated', entityType: 'clinic_settings', entityId: 'clinic', description: 'Admin updated clinic settings' });
    } else {
      showToast('Could not save settings.', 'error');
    }
  };

  window.resetClinicSettingsForm = function () {
    populateClinicSettings();
    showToast('Unsaved changes discarded.', 'info');
  };

  window.restoreClinicDefaults = function () {
    confirmAction('Restore ALL clinic settings to the VHS defaults? Saved customizations will be cleared.', function () {
      window.VHSClinicSettings.reset();
      populateClinicSettings();
      showToast('Clinic settings restored to defaults.', 'success');
      _auditAdmin({ action: 'clinic_settings_updated', entityType: 'clinic_settings', entityId: 'clinic', description: 'Admin restored clinic settings to defaults' });
    }, { title: 'Restore Defaults', danger: true });
  };

  function initClinicSettingsPage() {
    if (!document.getElementById('clinicSettingsForm')) return;
    populateClinicSettings();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClinicSettingsPage);
  } else {
    initClinicSettingsPage();
  }
})();

// ─── KEBAB ACTION MENUS (Advisor Revision Sprint 1) ─────────────────────────
// Replaces repetitive visible row buttons with one compact ⋮ trigger.
// Existing handlers (viewAppointment, openCheckInModal, openAdminReschedule,
// cancelAppointment, viewOwnerProfile, openEditUser, toggleUserStatus,
// viewPetProfile, openEditPet, addNewPet) are reused unchanged.
// Status-ineligible actions are omitted, not just disabled.
// TODO(BACKEND): permissions for each action are enforced by the API.
function kebabHtml(id, items) {
  var body = items.map(function (item) {
    return '<button type="button" class="kebab-item ' + (item.cls || '') + '" data-kebab-arg="' + _escKebabAttr(String(item.arg)) + '" data-kebab-action="' + item.action + '" role="menuitem">' + item.label + '</button>';
  }).join('');
  return '<div class="kebab-wrap">' +
    '<button type="button" class="kebab-btn" data-kebab-id="' + id + '" aria-haspopup="true" aria-expanded="false" aria-label="Row actions" title="Row actions">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>' +
    '</button>' +
    '<div class="kebab-menu" role="menu" aria-label="Row actions">' + body + '</div>' +
    '</div>';
}

function _escKebabAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

(function () {
  var OPEN_CLASS = 'open';

  function closeMenu(wrap) {
    wrap.classList.remove('kebab-open');
    var menu = wrap.querySelector('.kebab-menu');
    var btn = wrap.querySelector('.kebab-btn');
    if (menu) menu.classList.remove(OPEN_CLASS);
    if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
  }

  function closeAll(except) {
    document.querySelectorAll('.kebab-wrap.kebab-open').forEach(function (w) {
      if (w !== except) closeMenu(w);
    });
  }

  function runItem(btn) {
    var wrap = btn.closest('.kebab-wrap');
    var action = btn.getAttribute('data-kebab-action');
    var arg = btn.getAttribute('data-kebab-arg');
    if (wrap) closeMenu(wrap);
    var fn = window[action];
    if (typeof fn === 'function') fn(arg);
  }

  document.addEventListener('click', function (e) {
    var item = e.target.closest('.kebab-item');
    if (item) { e.preventDefault(); runItem(item); return; }
    var btn = e.target.closest('.kebab-btn');
    if (btn) {
      e.preventDefault();
      var wrap = btn.closest('.kebab-wrap');
      var isOpen = wrap.classList.contains('kebab-open');
      closeAll(wrap);
      if (!isOpen) {
        wrap.classList.add('kebab-open');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        var menu = wrap.querySelector('.kebab-menu');
        if (menu) {
          // Flip above the row when the menu would overflow the viewport bottom.
          var rect = wrap.getBoundingClientRect();          menu.classList.toggle('kebab-flip', rect.bottom + 240 > window.innerHeight && rect.top > 260);
          // Align to the wrap's left edge when right-alignment would clip the
          // menu off-screen (responsive card tables put the leftmost action
          // cell near the viewport's left edge). Computed from the wrap rect
          // and menu width — both class-independent — so the toggle can't
          // feed back on its own result across re-opens.
          menu.classList.toggle('kebab-edge-left', rect.right - menu.offsetWidth < 8);

        }
      }
      return;
    }
    closeAll(null);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll(null);
  });
})();
