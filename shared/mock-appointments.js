/* ============================================================
   SHARED MOCK APPOINTMENTS — canonical contract shape
   One dataset consumed by User, Clerk, and Doctor so the three
   portals render the SAME records during frontend testing.

   TODO(BACKEND): Replace with get_appointments.php (which must
   return reference_no) — the mappers in appointment-contract.js
   already consume this shape either way.

   Scenario: today's clinic day is 2026-09-26 (a SATURDAY → weekend
   hours 10:00–18:00, hourly slots only). Every record below obeys the
   frozen contracts: real services (shared/mock-users.js), selectable
   slots (shared/vhs-ui.js getVHSTimeSlots), canonical visit contexts,
   valid owners/pets/statuses.
   The trace appointment is apt301 (Luna, checked_in) — it must
   appear with identical identifiers in all three portals.
   ============================================================ */
(function (global) {
  'use strict';

  var MOCK_APPOINTMENTS = [
    // ── Maria Santos (userId 1) — the User Portal demo identity ──────────
    {
      appointmentId: 'apt301', referenceNo: 'VHS-20260926-A1B2C3',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Consultation',
      appointmentDate: '2026-09-26', appointmentTime: '10:00',
      visitContext: 'Showing mild symptoms',
      customVisitContext: 'Owner reports reduced appetite and repeated vomiting since yesterday.',
      notes: '', status: 'checked_in', checkedInAt: '2026-09-26T09:42:00',
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Luna', species: 'Cat', breed: 'Persian' }
    },
    {
      appointmentId: 'apt302', referenceNo: 'VHS-20260926-D4E5F6',
      userId: 1, petId: 2, assignedVetId: 2,
      service: 'Dog Grooming',
      appointmentDate: '2026-09-15', appointmentTime: '14:00',
      visitContext: 'Scheduled procedure',
      customVisitContext: '',
      notes: 'Full groom package.', status: 'completed',
      consultationStartedAt: '2026-09-15T14:02:00',
      consultationCompletedAt: '2026-09-15T14:40:00',
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Buddy', species: 'Dog', breed: 'Golden Retriever' }
    },
    {
      appointmentId: 'apt303', referenceNo: 'VHS-20260926-G7H8I9',
      userId: 3, petId: 5, assignedVetId: 2,
      service: 'Consultation',
      appointmentDate: '2026-09-26', appointmentTime: '11:00',
      visitContext: 'Routine check-up',
      customVisitContext: '',
      notes: 'No current concerns reported.', status: 'confirmed', checkedInAt: null,
      owner: { name: 'Jamie Cruz', phone: '0919-555-6677' },
      pet: { name: 'Milo', species: 'Dog', breed: 'Aspin' }
    },
    {
      appointmentId: 'apt304', referenceNo: 'VHS-20260926-J4K5L6',
      userId: 2, petId: 4, assignedVetId: 3,
      service: 'Consultation',
      appointmentDate: '2026-09-26', appointmentTime: '12:00',
      visitContext: 'Showing mild symptoms',
      customVisitContext: 'Owner reports difficulty breathing since early morning.',
      notes: '', status: 'checked_in', checkedInAt: '2026-09-26T11:42:00',
      owner: { name: 'Sam Reyes', phone: '0918-222-3344' },
      pet: { name: 'Max', species: 'Dog', breed: 'Labrador retriever' }
    },
    // Past record so User "history" and Clerk completed filters have data.
    {
      appointmentId: 'apt305', referenceNo: 'VHS-20260912-M7N8O9',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Vaccination',
      appointmentDate: '2026-09-12', appointmentTime: '11:00',
      visitContext: 'Scheduled procedure',
      customVisitContext: '',
      notes: 'Annual rabies booster.', status: 'completed',
      consultationStartedAt: '2026-09-12T11:02:00',
      consultationCompletedAt: '2026-09-12T11:25:00',
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Mochi', species: 'Cat', breed: 'Siamese' }
    },
    // Future record so Maria's upcoming list shows a confirmed future visit.
    {
      appointmentId: 'apt306', referenceNo: 'VHS-20261010-P3Q4R5',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Vaccination',
      appointmentDate: '2026-10-10', appointmentTime: '15:00',
      visitContext: 'Scheduled procedure',
      customVisitContext: '',
      notes: '', status: 'confirmed', checkedInAt: null,
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Luna', species: 'Cat', breed: 'Persian' }
    }
  ];

  // Portal-only extras must NOT collide with shared appointment IDs.
  // (User keeps its own historical fixtures locally; Doctor keeps EMR
  // history and consultation records keyed by petId/appointmentId.)

  var CHECKIN_OVERRIDES_KEY = 'vhs_mock_checkin_overrides_v1';
  var OVERRIDES = (function () {
    try { return JSON.parse(sessionStorage.getItem(CHECKIN_OVERRIDES_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  })();

  function _saveOverrides() {
    try { sessionStorage.setItem(CHECKIN_OVERRIDES_KEY, JSON.stringify(OVERRIDES)); } catch (e) { /* storage unavailable */ }
  }

  function effective(base) {
    var o = OVERRIDES[base.appointmentId];
    return o ? Object.assign({}, base, o) : base;
  }

  global.SharedMockAppointments = {
    today: '2026-09-26',
    all: function () { return MOCK_APPOINTMENTS.map(function (a) { return effective(a); }); },
    byId: function (id) {
      var base = MOCK_APPOINTMENTS.find(function (a) { return String(a.appointmentId) === String(id); });
      return base ? effective(base) : null;
    },
    byReference: function (ref) {
      var base = MOCK_APPOINTMENTS.find(function (a) { return a.referenceNo === ref; });
      return base ? effective(base) : null;
    },
    todays: function () { return this.all().filter(function (a) { return a.appointmentDate === '2026-09-26'; }); },

    // ── CHECK-IN STATE (frontend-only, shared by all portals) ────────────────
    // Status overrides live in sessionStorage so a check-in survives page
    // navigation/refresh within the tab while staying frontend-only. The base
    // records are never mutated; all readers see the effective state.
    // TODO(BACKEND): Replace with GET by referenceNo; status + checkedInAt
    // come from the database. Check-in is a server-side transition
    // (update_appointment_status.php + write checked_in_at); delete this
    // override layer entirely when the API owns state.
    lookup: function (value) {
      var v = String(value || '').trim();
      if (!v) return null;
      return this.byReference(v) || this.byId(v);
    },
    checkIn: function (id) {
      return this.setStatus(id, 'checked_in');
    },
    // Guarded transition for any mock-supported status change (check-in now;
    // cancellations while the backend is offline). Invalid transitions are
    // rejected, never invented.
    // TODO(BACKEND): Replace with the transition endpoints (e.g.
    // update_appointment_status.php) once the API owns state.
    setStatus: function (id, nextStatus) {
      var base = MOCK_APPOINTMENTS.find(function (a) { return String(a.appointmentId) === String(id); });
      if (!base) return { ok: false, error: 'not_found' };
      var eff = effective(base);
      var s = (window.AppointmentContract ? window.AppointmentContract.normalizeStatus(eff.status) : eff.status);
      var next = (window.AppointmentContract ? window.AppointmentContract.normalizeStatus(nextStatus) : nextStatus);
      var allowed = {
        'confirmed>checked_in': true,
        'confirmed>canceled': true,
        'pending>canceled': true,
        'pending>confirmed': true,
        'rescheduled>canceled': true,
        'rescheduled>confirmed': true
      };
      if (s === next && next === 'checked_in') return { ok: false, error: 'already' };
      if (!allowed[s + '>' + next]) return { ok: false, error: 'invalid_status' };
      OVERRIDES[base.appointmentId] = { status: next };
      if (next === 'checked_in') OVERRIDES[base.appointmentId].checkedInAt = new Date().toISOString();
      _saveOverrides();
      return { ok: true, appointment: effective(base) };
    }
  };
})(window);
