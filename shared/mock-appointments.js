/* ============================================================
   SHARED MOCK APPOINTMENTS — canonical contract shape
   One dataset consumed by User, Admin, and Doctor so the three
   portals render the SAME records during frontend testing.

   TODO(BACKEND): Replace with get_appointments.php (which must
   return reference_no) — the mappers in appointment-contract.js
   already consume this shape either way.

  Scenario: the demo dataset is anchored to the LOCAL current clinic day,
  not a frozen calendar date. Seeds are expressed as relative offsets from
  local "today" so the cross-portal trace (apt301) always lands in the live
  operational views (User upcoming, Admin Today's Schedule, Doctor queue)
  on the real date the demo is run, while historical and future fixtures keep
  their intended roles.

  Fixture roles (offsets from local today, in days):
    apt301  today     0  — the live cross-portal trace (Luna, checked_in).
    apt302  past      -11 — completed visit, so history has data.
    apt303  today     0  — another confirmed today patient (different owner).
    apt304  today     0  — another checked_in today patient (different owner).
    apt305  past      -14 — past Maria visit for history depth.
    apt900  past      -7  — demo consultation for the documents demo only.
    apt306  future    +12 — Maria's future confirmed visit (upcoming list).

  Timestamps follow the appointment date where they exist: checkedInAt,
  consultationStartedAt, and consultationCompletedAt stay aligned with the
  seed's appointmentDate after the offset is applied, never drifting into the
  future or invalid chronology. The DOCTOR_TEST_DATE seam is unchanged.

  DEMO DATA: apt900 is a dedicated, deterministic demo fixture
   (not part of the clinic-day storyline). It exists only so the
   Phase 5 documents demo (shared/document-store.js demo seed) is
   reproducible: a COMPLETED consultation with a stable
   appointment/reference/user/pet linkage. Marked here in comments
   only — the UI must never label it. Removal: delete the apt900
   record and the matching DEMO_SEED_DOC in document-store.js.
   ============================================================ */
(function (global) {
  'use strict';

  // Local YYYY-MM-DD without the UTC ISO rollover that breaks evenings in
  // positive-offset timezones. This is the ONLY helper for relative fixture
  // dates; every seed below expresses its intended role as an offset from it.
  function _localToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _todayOffset(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Canonical demo identity that must survive the fixture-day shift. The
  // reference is the product's opaque appointment identifier; its embedded
  // date segment is NOT relied on as the appointment date by any portal (they
  // read appointmentDate directly), so it is preserved exactly.
  var DEMO_TRACE_REF = 'VHS-20260926-A1B2C3';

  var MOCK_APPOINTMENTS = [
    // ── Maria Santos (userId 1) — the User Portal demo identity ──────────
    {
      appointmentId: 'apt301', referenceNo: DEMO_TRACE_REF,
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Consultation',
      appointmentDate: _todayOffset(0), appointmentTime: '10:00',
      visitContext: 'Showing mild symptoms',
      customVisitContext: 'Owner reports reduced appetite and repeated vomiting since yesterday.',
      notes: '', status: 'checked_in', checkedInAt: (_localToday() + 'T09:42:00'),
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Luna', species: 'Cat', breed: 'Persian' }
    },
    {
      appointmentId: 'apt302', referenceNo: 'VHS-20260926-D4E5F6',
      userId: 1, petId: 2, assignedVetId: 2,
      service: 'Dog Grooming',
      appointmentDate: _todayOffset(-11), appointmentTime: '14:00',
      visitContext: 'Scheduled procedure',
      customVisitContext: '',
      notes: 'Full groom package.', status: 'completed',
      consultationStartedAt: (_todayOffset(-11) + 'T14:02:00'),
      consultationCompletedAt: (_todayOffset(-11) + 'T14:40:00'),
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Buddy', species: 'Dog', breed: 'Golden Retriever' }
    },
    {
      appointmentId: 'apt303', referenceNo: 'VHS-20260926-G7H8I9',
      userId: 3, petId: 5, assignedVetId: 2,
      service: 'Consultation',
      appointmentDate: _todayOffset(0), appointmentTime: '11:00',
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
      appointmentDate: _todayOffset(0), appointmentTime: '12:00',
      visitContext: 'Showing mild symptoms',
      customVisitContext: 'Owner reports difficulty breathing since early morning.',
      notes: '', status: 'checked_in', checkedInAt: (_localToday() + 'T11:42:00'),
      owner: { name: 'Sam Reyes', phone: '0918-222-3344' },
      pet: { name: 'Max', species: 'Dog', breed: 'Labrador retriever' }
    },
    // Past record so User "history" and Admin completed filters have data.
    {
      appointmentId: 'apt305', referenceNo: 'VHS-20260912-M7N8O9',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Vaccination',
      appointmentDate: _todayOffset(-14), appointmentTime: '11:00',
      visitContext: 'Scheduled procedure',
      customVisitContext: '',
      notes: 'Annual rabies booster.', status: 'completed',
      consultationStartedAt: (_todayOffset(-14) + 'T11:02:00'),
      consultationCompletedAt: (_todayOffset(-14) + 'T11:25:00'),
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Mochi', species: 'Cat', breed: 'Siamese' }
    },
    // ── DEMO DATA (frontend fixture; marked in comments only) ────────────
    // Dedicated demo consultation for the documents demo. Identity is fully
    // self-consistent by construction: Maria Santos (userId 1), her canonical
    // pet Buddy (petId 2, Golden Retriever — matches mock-users.js), Dr.
    // Santos as veterinarian (assignedVetId uses the same numeric-vet
    // convention as the other seeds), reference VHS-DEMO-APT900 that cannot
    // collide with real-looking references. Past date keeps it out of
    // today's queue and out of slot availability (completed slots are never
    // offered). Status/timestamps mirror what setStatus() would stamp.
    {
      appointmentId: 'apt900', referenceNo: 'VHS-DEMO-APT900',
      userId: 1, petId: 2, assignedVetId: 2,
      service: 'Consultation',
      appointmentDate: _todayOffset(-7), appointmentTime: '10:00',
      visitContext: 'Routine check-up',
      customVisitContext: '',
      notes: '', status: 'completed',
      consultationStartedAt: (_todayOffset(-7) + 'T10:02:00'),
      consultationCompletedAt: (_todayOffset(-7) + 'T10:27:00'),
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Buddy', species: 'Dog', breed: 'Golden Retriever' }
    },
    // Future record so Maria's upcoming list shows a confirmed future visit.
    {
      appointmentId: 'apt306', referenceNo: 'VHS-20261010-P3Q4R5',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Vaccination',
      appointmentDate: _todayOffset(12), appointmentTime: '15:00',
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
  // localStorage so Admin/User portals see them after refresh/navigation in the same
  // browser. Minimal by design: one key, no sync events, no caching.
  // TODO(BACKEND): Replace AppointmentStore persistence with appointment API
  // calls — POST /appointments on add(), GET /appointments on all(); this
  // layer and the OVERRIDES layer below are deleted together.
  var ADDED_KEY = 'vhs_mock_appointments_added_v1';
  var ADDED = _readAdded();

  // ── WRITE-THROUGH THAT CANNOT CLOBBER ANOTHER PORTAL ───────────────────
  // These layers live in localStorage precisely so every portal tab sees
  // them, but each page also keeps its OWN copy loaded at start-up. Writing
  // that copy back wholesale is last-writer-wins: an ordinary, unrelated write
  // from a stale tab (a check-in, an edit, any add) silently REVERTS whatever
  // another portal changed after this page loaded — including a completed
  // consultation, which then falls back to checked_in and offers Start
  // Consultation again on a record the audit log says is finished.
  //
  // Every write therefore re-reads the stored layer and merges ONLY this
  // page's own change into it, so concurrent tabs accumulate instead of
  // overwriting each other.
  function _readAdded() {
    try { var v = JSON.parse(localStorage.getItem(ADDED_KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }

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

  // Same medium as the ADDED layer above: localStorage, so a reschedule or
  // status change made in User is visible in Admin/Doctor tabs on this origin
  // (sessionStorage is per-tab, which silently split the portals apart).
  var CHECKIN_OVERRIDES_KEY = 'vhs_mock_checkin_overrides_v1';
  var OVERRIDES = _readOverrides();

  function _readOverrides() {
    try { var v = JSON.parse(localStorage.getItem(CHECKIN_OVERRIDES_KEY) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    catch (e) { return {}; }
  }

  function _saveOverrides() {
    try { localStorage.setItem(CHECKIN_OVERRIDES_KEY, JSON.stringify(OVERRIDES)); } catch (e) { /* storage unavailable */ }
  }

  // Another portal tab just wrote one of the layers. Re-read it so THIS page
  // stops answering from a stale copy: from here on, byId()/all() reflect the
  // other portal's change without a reload. (The storage event only fires in
  // the other tabs, never in the writer — so a page never fights itself.)
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (event) {
      if (!event) return;
      if (event.key === ADDED_KEY) ADDED = _readAdded();
      else if (event.key === CHECKIN_OVERRIDES_KEY) OVERRIDES = _readOverrides();
      else return;
    });
  }

  function effective(base) {
    var o = OVERRIDES[base.appointmentId];
    return o ? Object.assign({}, base, o) : base;
  }

  // ── RESCHEDULE AVAILABILITY GUARD ───────────────────────────────────
  // SmartScheduling is the ONE availability authority. It understands
  // requiresDoctor, Doctor capacity and per-service capacityPerSlot, so a
  // Doctor-required visit and a grooming visit may share a wall-clock time.
  //
  // Dependency direction is deliberately lazy: the store asks for the engine
  // AT CALL TIME and only if it loaded, so neither module requires the other
  // at parse time and script order stays irrelevant. An appointment whose
  // service cannot be resolved FAILS CLOSED — an unknown booking must not
  // quietly consume a Doctor slot.
  //
  // Only when the engine is absent (a portal that never loads it) does this
  // fall back to the old universal one-appointment-per-time rule, so that
  // page keeps working exactly as it did.
  function _slotGuard(appt, newDate, canonicalTime, excludeId) {
    var sched = window.SmartScheduling;
    var users = window.SharedMockUsers;
    if (sched && typeof sched.validateAppointmentRequest === 'function') {
      if (!users || typeof users.serviceByValue !== 'function') return { ok: false, error: 'invalid_service' };
      var svc = users.serviceByValue(appt.service);
      if (!svc) return { ok: false, error: 'invalid_service' };
      var result = sched.validateAppointmentRequest({
        serviceId: svc.serviceId,
        date: newDate,
        time: canonicalTime,
        excludeAppointmentId: excludeId
      });
      if (result.ok) return { ok: true, source: 'smart-scheduling' };
      // 'slot_taken' is the code the existing User/Admin toasts already
      // render; the engine's other reasons pass through so a closed-day or
      // retired-service request is not mislabelled as "already booked".
      return {
        ok: false,
        error: result.reason || 'slot_taken',
        source: 'smart-scheduling'
      };
    }
    var store = window.SharedMockAppointments;
    var available = store && typeof store.isSlotAvailable === 'function'
      ? store.isSlotAvailable(newDate, canonicalTime, excludeId)
      : true;
    return available
      ? { ok: true, source: 'legacy' }
      : { ok: false, error: 'slot_taken', source: 'legacy' };
  }

  global.SharedMockAppointments = {
    // ── TEST-DATE FIXTURE ──────────────────────────────────────────────
    // DO NOT rely on this for today's operational views. The seed dataset no
    // longer carries a fixed calendar date — it is expressed as offsets from
    // the browser's local date, so today's queue is defined by todays() with
    // no argument, not by this value. Keep this only to replay a known
    // historical clinic day during offline debugging (use
    // todays(SharedMockAppointments.today) to exercise it).
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
      // Merge into the CURRENT stored layer, never into this page's copy.
      var fresh = _readAdded();
      var clash = MOCK_APPOINTMENTS.concat(fresh).some(function (a) {
        return String(a.appointmentId) === String(c.appointmentId) || a.referenceNo === c.referenceNo;
      });
      if (clash) {
        return { ok: false, error: 'duplicate', appointment: null };
      }
      fresh.push(c);
      ADDED = fresh;
      _saveAdded();
      return { ok: true, appointment: this.byId(c.appointmentId) };
    },
    // Generic field update (timestamps, context). Seeds are updated through
    // the OVERRIDES layer so the frozen fixtures stay intact on disk; added
    // records are updated in place. Status is NOT set here — go through
    // updateStatus()/setStatus() so transition guards stay in one place.
    // TODO(BACKEND): PATCH /appointments/:id on the API.
    update: function (id, fields) {
      var f = fields || {};
      delete f.status; // status changes only via setStatus()/updateStatus()
      // Read-modify-write against the stored layer so a stale page never
      // writes back a whole copy that would undo another portal's work.
      var fresh = _readAdded();
      var base = fresh.find(function (a) { return String(a.appointmentId) === String(id); });
      if (base) {
        Object.assign(base, f);
        ADDED = fresh;
        _saveAdded();
        return { ok: true, appointment: this.byId(id) };
      }
      var seeded = _allBase().find(function (a) { return String(a.appointmentId) === String(id); });
      if (!seeded) return { ok: false, error: 'not_found' };
      var freshOverrides = _readOverrides();
      freshOverrides[seeded.appointmentId] = Object.assign({}, freshOverrides[seeded.appointmentId] || {}, f);
      OVERRIDES = freshOverrides;
      _saveOverrides();
      return { ok: true, appointment: this.byId(id) };
    },

    // ── RESCHEDULE (frontend-only, shared by all portals) ─────────────
    // Updates appointmentDate/appointmentTime on the SAME record — the
    // appointmentId and referenceNo never change, so every portal keeps
    // pointing at one appointment. The record normally returns to
    // 'confirmed'; "rescheduled" is never a permanent active state.
    // TODO(BACKEND): PATCH /appointments/:id { appointment_date,
    // appointment_time } — server validates the 2-hour cutoff, slot
    // concurrency, and writes the reschedule history for audit.
    reschedule: function (id, newDate, newTime) {
      var base = _allBase().find(function (a) { return String(a.appointmentId) === String(id); });
      if (!base) return { ok: false, error: 'not_found' };
      var eff = effective(base);
      var s = (window.AppointmentContract ? window.AppointmentContract.normalizeStatus(eff.status) : eff.status);
      if (s !== 'confirmed' && s !== 'pending') return { ok: false, error: 'invalid_status' };
      var canonicalTime = (window.AppointmentContract ? window.AppointmentContract.timeToHHMM(newTime) : newTime);
      if (!newDate || !canonicalTime) return { ok: false, error: 'invalid' };
      // Availability is decided by SmartScheduling — the SAME engine that
      // built the dropdown, so what the owner was offered and what the
      // submit accepts cannot disagree. The previous check here treated ANY
      // appointment at the same wall-clock time as a universal conflict, so a
      // slot SmartScheduling correctly offered (a Doctor-required service
      // sharing time with grooming) was rejected on submit.
      // excludeAppointmentId keeps this appointment from blocking itself.
      var guard = _slotGuard(eff, newDate, canonicalTime, id);
      if (!guard.ok) return { ok: false, error: guard.error };
      var result = this.update(id, {
        appointmentDate: newDate,
        appointmentTime: canonicalTime,
        status: 'confirmed',
        rescheduledFrom: { date: eff.appointmentDate, time: eff.appointmentTime, at: new Date().toISOString() }
      });
      return result;
    },

    // ── SLOT AVAILABILITY (frontend-demo mode) ────────────────────────
    // Derived from the EFFECTIVE store records — never a portal-local booked
    // array that could drift from the canonical state.
    // Superseded for RESCHEDULE validation by SmartScheduling, which knows
    // about Doctor capacity and per-service capacity. Kept for the simple
    // "is this exact wall-clock time occupied at all" question.
    // TODO(BACKEND): GET /appointments/slots?date=... replaces this check.
    takenSlots: function (dateStr, excludeAppointmentId) {
      return this.all()
        .filter(function (a) {
          if (a.appointmentDate !== dateStr) return false;
          var s = (window.AppointmentContract ? window.AppointmentContract.normalizeStatus(a.status) : a.status);
          if (s === 'canceled' || s === 'completed' || s === 'no_show') return false;
          if (excludeAppointmentId && String(a.appointmentId) === String(excludeAppointmentId)) return false;
          return true;
        })
        .map(function (a) { return a.appointmentTime; });
    },
    isSlotAvailable: function (dateStr, timeHHMM, excludeAppointmentId) {
      return this.takenSlots(dateStr, excludeAppointmentId).indexOf(timeHHMM) === -1;
    },

    // ── CHECK-IN STATE (frontend-only, shared by all portals) ────────────────
    // Status overrides live in localStorage so a check-in survives page
    // navigation/refresh and is shared by every portal tab on this origin,
    // while staying frontend-only. The base records are never mutated; all
    // readers see the effective state.
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
    // Guarded transition for ANY lifecycle change (check-in, consultation
    // start/complete, cancellations). One table, one place — every portal
    // writes through this, so no portal can invent its own lifecycle.
    // Normal lifecycle: confirmed → checked_in → in_consultation → completed.
    // TODO(BACKEND): Replace with the transition endpoints (e.g.
    // update_appointment_status.php) once the API owns state; Laravel then
    // owns transition validation and timestamps.
    setStatus: function (id, nextStatus) {
      // Guard against a stale page: re-sync the persisted layers BEFORE
      // deciding, so the transition is validated against the live status
      // (a completed appointment cannot be restarted from an old snapshot).
      ADDED = _readAdded();
      OVERRIDES = _readOverrides();
      var base = _allBase().find(function (a) { return String(a.appointmentId) === String(id); });
      if (!base) return { ok: false, error: 'not_found' };
      var eff = effective(base);
      var s = (window.AppointmentContract ? window.AppointmentContract.normalizeStatus(eff.status) : eff.status);
      var next = (window.AppointmentContract ? window.AppointmentContract.normalizeStatus(nextStatus) : nextStatus);
      var allowed = {
        'confirmed>checked_in': true,
        'checked_in>in_consultation': true,
        'in_consultation>completed': true,
        'confirmed>canceled': true,
        'pending>canceled': true,
        'pending>confirmed': true,
        'rescheduled>canceled': true,
        'rescheduled>confirmed': true
      };
      if (s === next && next === 'checked_in') return { ok: false, error: 'already' };
      if (!allowed[s + '>' + next]) return { ok: false, error: 'invalid_status' };
      var stamp = new Date().toISOString();
      // Canonical lifecycle timestamps — one name per event, no portal-local
      // copies. Consultation start/complete ride with the status change.
      var patch = { status: next };
      if (next === 'checked_in') patch.checkedInAt = stamp;
      if (next === 'in_consultation') patch.consultationStartedAt = stamp;
      if (next === 'completed') patch.consultationCompletedAt = stamp;
      // Write through the CURRENT stored layer. The decision above is taken
      // against the live record, and the write touches only this appointment:
      // a tab that has been open since before another portal finished a
      // consultation can no longer drag that record back to checked_in.
      var freshAdded = _readAdded();
      var target = freshAdded.find(function (a) { return String(a.appointmentId) === String(id); });
      if (target) {
        Object.assign(target, patch);
        ADDED = freshAdded;
        _saveAdded();
      } else {
        var freshOverrides = _readOverrides();
        freshOverrides[base.appointmentId] = Object.assign({}, freshOverrides[base.appointmentId] || {}, patch);
        OVERRIDES = freshOverrides;
        _saveOverrides();
      }
      return { ok: true, appointment: this.byId(id) };
    }
  };
})(window);
