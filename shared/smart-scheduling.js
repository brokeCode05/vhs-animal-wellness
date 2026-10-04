/* ============================================================
   SMART SCHEDULING — shared scheduling engine (frontend foundation)

   ONE scheduling source of truth for the User booking form, Vetti
   (through VettiData) and Admin. It answers "is this slot bookable?"
   and "what slots are bookable?" from data the project already owns:

     clinic hours / slot interval  →  VHSClinicSettings
     service duration + resources  →  SharedMockUsers service catalog
     existing bookings             →  SharedMockAppointments (effective)
     Doctor capacity               →  SharedMockDoctors.activeDoctors()

   It is DETERMINISTIC and it NEVER INVENTS A SLOT: every returned slot
   comes from the clinic's own configured hours, and a slot is returned
   only when the capacity check passes.

   Resource model (deliberately simple, and deliberately NOT one
   appointment per time slot):
     · a Doctor-required service draws from the active Doctor pool —
       capacity is activeDoctors.length, which is 1 today;
     · a service that does not require a Doctor draws from its own
       configured capacityPerSlot;
     · a slot can therefore hold a consultation AND grooming work at the
       same time, and is rejected only when the relevant resource is full.

   Adding a second active Doctor raises doctor capacity with no change
   here — that is the whole point of reading capacity from the pool
   instead of hardcoding "1".

   Boundaries, on purpose:
     · this module VALIDATES and RECOMMENDS. It never books, never
       reschedules, never mutates an appointment, and never invents IDs
       or reference numbers;
     · it never touches a database and calls no API;
     · it holds no ML, no prediction and no doctor auto-assignment.
       Historical consultation length is an operational signal only;
       the configured durationMinutes is authoritative.

   TODO(BACKEND): this whole module is replaced by a Laravel scheduling
   service (GET /api/scheduling/slots, POST /api/scheduling/validate).
   The backend then owns the hours, the Doctor roster, capacity,
   concurrency and the 2-hour cut-off. Until it exists these results
   are a frontend demo, not a real booking guarantee.
   ============================================================ */
(function (global) {
  'use strict';

  // ── INPUT SOURCES (read-only, always through the canonical module) ──
  function _settings() { return global.VHSClinicSettings; }
  function _appointments() { return global.SharedMockAppointments; }
  function _users() { return global.SharedMockUsers; }
  function _contract() { return global.AppointmentContract; }
  function _doctors() { return global.SharedMockDoctors; }

  // Canonical "HH:MM" for a 12h or 24h time string.
  function _hhmm(value) {
    var c = _contract();
    if (c && c.timeToHHMM) {
      var viaContract = c.timeToHHMM(value);
      if (viaContract) return String(viaContract);
    }
    var m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];
  }

  // Statuses that DO NOT hold a slot. This mirrors the rule the shared
  // appointment store already used for takenSlots(): canonical
  // normalization first, then terminal states drop out.
  function _holdsSlot(status) {
    var c = _contract();
    var s = (c && c.normalizeStatus)
      ? c.normalizeStatus(status)
      : String(status || '').toLowerCase();
    return s !== 'canceled' && s !== 'completed' && s !== 'no_show';
  }

  // Scheduling metadata for one service, or null when the service is
  // unknown. Reads the canonical catalog — there is no second catalog.
  function getServiceScheduling(serviceId) {
    var u = _users();
    if (!u || typeof u.serviceById !== 'function') return null;
    var svc = u.serviceById(serviceId);
    if (!svc) return null;
    var duration = parseInt(svc.durationMinutes, 10);
    return {
      serviceId: svc.serviceId,
      value: svc.value,
      label: svc.label,
      durationMinutes: isNaN(duration) || duration <= 0 ? 60 : duration,
      requiresDoctor: svc.requiresDoctor !== false,
      capacityPerSlot: parseInt(svc.capacityPerSlot, 10) > 0 ? parseInt(svc.capacityPerSlot, 10) : 1,
      active: svc.active !== false
    };
  }

  // Scheduling metadata for an EXISTING appointment's stored service
  // (records may hold the value or the label). Unknown or retired
  // services fail CLOSED as doctor-required, so an unrecognised booking
  // still occupies a Doctor rather than silently freeing a slot.
  function _schedulingForAppointment(appt) {
    var u = _users();
    if (!u || typeof u.serviceByValue !== 'function') return null;
    var svc = u.serviceByValue(appt && appt.service);
    return svc ? getServiceScheduling(svc.serviceId) : null;
  }

  // Capacity of the Doctor pool. Today that is one active Doctor; more
  // active Doctors means more simultaneous doctor-required appointments,
  // with no change to this file.
  function getDoctorCapacity() {
    var d = _doctors();
    if (!d || typeof d.activeDoctors !== 'function') return 0;
    return d.activeDoctors().length;
  }

  // What is already booked on a date, bucketed per time slot.
  //   doctor    : doctor-required appointments (the Doctor pool)
  //   byService : non-doctor appointments, keyed by serviceId
  // excludeAppointmentId lets a reschedule ignore the appointment's OWN
  // currently held slot — it must not block itself.
  function _occupancy(dateStr, excludeAppointmentId) {
    var bySlot = {};
    var store = _appointments();
    if (!store || typeof store.all !== 'function') return bySlot;

    store.all().forEach(function (a) {
      if (!a || a.appointmentDate !== dateStr) return;
      if (excludeAppointmentId && String(a.appointmentId) === String(excludeAppointmentId)) return;
      if (!_holdsSlot(a.status)) return;
      var key = _hhmm(a.appointmentTime);
      if (!key) return;
      if (!bySlot[key]) bySlot[key] = { doctor: 0, byService: {} };
      var svc = _schedulingForAppointment(a);
      if (svc && svc.requiresDoctor === false) {
        var sid = String(svc.serviceId);
        bySlot[key].byService[sid] = (bySlot[key].byService[sid] || 0) + 1;
      } else {
        bySlot[key].doctor += 1;
      }
    });
    return bySlot;
  }
  // ── CORE EVALUATION ──────────────────────────────────────────────────
  // One pass that both the public entry points share, so getAvailableSlots,
  // isSlotAvailable and validateAppointmentRequest can never disagree.
  // options: { serviceId, date, doctorId?, excludeAppointmentId? }
  function _evaluate(options) {
    var o = options || {};
    var svc = getServiceScheduling(o.serviceId);
    if (!svc) return { ok: false, reason: 'unknown_service', service: null, slots: [], doctorCapacity: 0 };
    if (!svc.active) return { ok: false, reason: 'service_inactive', service: svc, slots: [], doctorCapacity: 0 };
    if (!o.date) return { ok: false, reason: 'invalid_date', service: svc, slots: [], doctorCapacity: 0 };

    var settings = _settings();
    if (!settings || typeof settings.slotsFor !== 'function') {
      return { ok: false, reason: 'settings_unavailable', service: svc, slots: [], doctorCapacity: 0 };
    }

    // The clinic's own hours are the ONLY source of candidate slots.
    // SmartScheduling never widens them and never adds one of its own.
    var labels = settings.slotsFor(o.date) || [];
    if (!labels.length) {
      return { ok: false, reason: 'clinic_closed', service: svc, slots: [], doctorCapacity: 0 };
    }

    var used = _occupancy(o.date, o.excludeAppointmentId);
    var doctorCapacity = getDoctorCapacity();

    var slots = labels.map(function (label) {
      var key = _hhmm(label);
      var at = used[key] || { doctor: 0, byService: {} };
      var usedCount, limit;
      if (svc.requiresDoctor) {
        usedCount = at.doctor;
        limit = doctorCapacity;
      } else {
        usedCount = at.byService[String(svc.serviceId)] || 0;
        limit = svc.capacityPerSlot;
      }
      return {
        time: label,
        timeHHMM: key,
        available: usedCount < limit,
        used: usedCount,
        capacity: limit
      };
    });

    return {
      ok: true,
      reason: null,
      service: svc,
      slots: slots,
      doctorCapacity: doctorCapacity
    };
  }

  function _slot(time) {
    return { time: time, timeHHMM: _hhmm(time) };
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────
  global.SmartScheduling = {

    // Metadata for one service, or null.
    getServiceScheduling: getServiceScheduling,

    // How many doctor-required appointments can run at once right now.
    getDoctorCapacity: getDoctorCapacity,

    // { ok: true, slots: [{ time, timeHHMM, used, capacity }], reason: null }
    // `slots` contains ONLY bookable slots. A failure returns
    // { ok: false, slots: [], reason } — never a partially guessed list.
    // TODO(BACKEND): GET /api/scheduling/slots?service_id&date
    getAvailableSlots: function (options) {
      var r = _evaluate(options);
      if (!r.ok) return { ok: false, slots: [], reason: r.reason };
      return {
        ok: true,
        reason: null,
        slots: r.slots.filter(function (s) { return s.available; })
      };
    },

    // { ok, available, reason } — 'slot_taken' vs 'clinic_closed' are
    // distinguished so callers can tell a full slot from a closed day.
    isSlotAvailable: function (options) {
      var o = options || {};
      var r = _evaluate(o);
      if (!r.ok) return { ok: false, available: false, reason: r.reason };
      var want = _hhmm(o.time);
      if (!want) return { ok: false, available: false, reason: 'invalid_time' };
      var hit = r.slots.find(function (s) { return s.timeHHMM === want; });
      if (!hit) return { ok: false, available: false, reason: 'clinic_closed' };
      if (!hit.available) {
        return { ok: false, available: false, reason: 'slot_taken', slot: _slot(hit.time), capacity: hit.capacity, used: hit.used };
      }
      return { ok: true, available: true, reason: null, slot: _slot(hit.time), capacity: hit.capacity, used: hit.used };
    },

    // Full booking-request validation. Returns the normalized request on
    // success so a caller can pass it straight to the portal's own
    // booking flow. It does NOT create the appointment.
    // TODO(BACKEND): POST /api/scheduling/validate — server re-checks
    // capacity and the cut-off at commit time.
    validateAppointmentRequest: function (options) {
      var o = options || {};
      var r = _evaluate(o);
      if (!r.ok) return { ok: false, reason: r.reason, request: null };
      var check = this.isSlotAvailable(o);
      if (!check.ok) return { ok: false, reason: check.reason, request: null };
      return {
        ok: true,
        reason: null,
        request: {
          serviceId: r.service.serviceId,
          date: o.date,
          time: check.slot.time,
          timeHHMM: check.slot.timeHHMM,
          doctorId: o.doctorId || null,
          excludeAppointmentId: o.excludeAppointmentId || null
        }
      };
    },

    // Next bookable slots, starting at the requested date and scanning
    // forward `searchDays` (default 7) until `limit` (default 3) are found.
    // Used to offer alternatives instead of a dead "no slots" message.
    // TODO(BACKEND): GET /api/scheduling/alternatives
    getAlternativeSlots: function (options) {
      var o = options || {};
      var limit = parseInt(o.limit, 10) > 0 ? parseInt(o.limit, 10) : 3;
      var searchDays = parseInt(o.searchDays, 10) > 0 ? parseInt(o.searchDays, 10) : 7;
      var found = [];
      var firstReason = null;
      var start = o.date || _todayStr();

      for (var i = 0; i < searchDays && found.length < limit; i++) {
        var day = _addDays(start, i);
        var r = _evaluate({
          serviceId: o.serviceId,
          date: day,
          doctorId: o.doctorId,
          excludeAppointmentId: o.excludeAppointmentId
        });
        if (!r.ok) { if (!firstReason) firstReason = r.reason; continue; }
        r.slots.forEach(function (s) {
          if (s.available && found.length < limit) {
            found.push({ date: day, time: s.time, timeHHMM: s.timeHHMM });
          }
        });
      }
      return { ok: true, reason: null, slots: found };
    }
  };

  function _todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _addDays(dateStr, n) {
    var parts = String(dateStr).split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
})(window);
