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

  // ── ADDED-SESSION LAYER (frontend-only, shared by all portals) ──────────
  // Appointments created in the demo (User booking write-through) persist in
  // localStorage so Clerk sees them after refresh/navigation in the same
  // browser. Minimal by design: one key, no sync events, no caching.
  // TODO(BACKEND): Replace AppointmentStore persistence with appointment API
  // calls — POST /appointments on add(), GET /appointments on all(); this
  // layer and the OVERRIDES layer below are deleted together.
  var ADDED_KEY = 'vhs_mock_appointments_added_v1';
  var ADDED = (function () {
    try { return JSON.parse(localStorage.getItem(ADDED_KEY) || '[]') || []; }
    catch (e) { return []; }
  })();

  function _saveAdded() {
    try { localStorage.setItem(ADDED_KEY, JSON.stringify(ADDED)); } catch (e) { /* storage unavailable */ }
  }

  // Real current local date (YYYY-MM-DD) from the browser clock — NOT the
  // UTC ISO slice, which lags a calendar day for UTC+8 evenings.
  function _localToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _allBase() {
    return MOCK_APPOINTMENTS.concat(ADDED);
  }

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
    // ── TEST-DATE FIXTURE ──────────────────────────────────────────────
    // Frozen clinic day used by the Sep 26 fixtures and the cross-portal
    // trace (apt301). It is for development/testing ONLY — never the live
    // queue filter. Pass it explicitly (todays(this.today)) to exercise
    // the fixture day; todays() with no argument uses the REAL date.
    today: '2026-09-26',
    // Effective list = seed records (with status overrides) + appointments
    // added this session layer (already canonical). Every portal reads THIS.
    all: function () { return _allBase().map(function (a) { return effective(a); }); },
    byId: function (id) {
      var base = _allBase().find(function (a) { return String(a.appointmentId) === String(id); });
      return base ? effective(base) : null;
    },
    byReference: function (ref) {
      var base = _allBase().find(function (a) { return a.referenceNo === ref; });
      return base ? effective(base) : null;
    },
    // Day list defaults to the REAL current local date. An explicit date
    // argument (the test fixture, or any date) overrides it — intentionally,
    // never silently.
    // TODO(BACKEND): GET /appointments?date=<yyyy-mm-dd> replaces this filter.
    todays: function (date) {
      var target = date || _localToday();
      return this.all().filter(function (a) { return a.appointmentDate === target; });
    },

    // ── WRITE-THROUGH (frontend-only, shared by all portals) ───────────
    // User booking (and any future creator) appends a canonical record.
    // Returns the stored appointment carrying the assigned IDs.
    // TODO(BACKEND): POST /appointments returns { appointmentId,
    // referenceNo, status: 'confirmed' } from the database instead.
    add: function (appt) {
      var c = (window.AppointmentContract ? window.AppointmentContract.fromLegacy(appt) : appt);
      if (!c || !c.appointmentId || !c.referenceNo) {
        return { ok: false, error: 'invalid', appointment: null };
      }
      if (_allBase().some(function (a) {
        return String(a.appointmentId) === String(c.appointmentId) || a.referenceNo === c.referenceNo;
      })) {
        return { ok: false, error: 'duplicate', appointment: null };
      }
      ADDED.push(c);
      _saveAdded();
      return { ok: true, appointment: this.byId(c.appointmentId) };
    },
    // Generic field update (timestamps, context) — status goes through
    // updateStatus() so transition guards stay in one place.
    // TODO(BACKEND): PATCH /appointments/:id on the API.
    update: function (id, fields) {
      var base = ADDED.find(function (a) { return String(a.appointmentId) === String(id); });
      if (!base) return { ok: false, error: 'not_found' };
      Object.assign(base, fields || {});
      _saveAdded();
      return { ok: true, appointment: this.byId(id) };
    },

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
    // Contract-named aliases — new code should use these; the older names
    // stay until each call site migrates.
    getAll: function () { return this.all(); },
    getById: function (id) { return this.byId(id); },
    getByReference: function (ref) { return this.byReference(ref); },
    updateStatus: function (id, nextStatus) { return this.setStatus(id, nextStatus); },
    // Guarded transition for any mock-supported status change (check-in now;
    // cancellations while the backend is offline). Invalid transitions are
    // rejected, never invented.
    // TODO(BACKEND): Replace with the transition endpoints (e.g.
    // update_appointment_status.php) once the API owns state.
    setStatus: function (id, nextStatus) {
      var base = _allBase().find(function (a) { return String(a.appointmentId) === String(id); });
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
      if (ADDED.some(function (a) { return String(a.appointmentId) === String(id); })) {
        // Added-session record: update the persisted copy itself.
        base.status = next;
        if (next === 'checked_in') base.checkedInAt = new Date().toISOString();
        _saveAdded();
      } else {
        OVERRIDES[base.appointmentId] = { status: next };
        if (next === 'checked_in') OVERRIDES[base.appointmentId].checkedInAt = new Date().toISOString();
        _saveOverrides();
      }
      return { ok: true, appointment: this.byId(id) };
    }
  };
})(window);
