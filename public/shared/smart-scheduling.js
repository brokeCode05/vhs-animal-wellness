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
       Historical consultation length is an operational signal only.

   durationMinutes is NOT a scheduling input here.
   The values currently sitting in the service catalog are placeholders,
   NOT confirmed clinic facts, so they are carried as display/placeholder
   metadata only. No conflict decision in this file reads them: occupancy is
   counted per CONFIGURED SLOT, never by duration overlap. Blocking a slot
   because of an unverified duration would be inventing a clinic rule.
   The backend owns real service durations; until then, capacity is counted
   per slot only.

   TODO(BACKEND): this whole module is replaced by a Laravel scheduling
   service (GET /api/scheduling/slots, POST /api/scheduling/validate).
   The backend then owns the hours, the Doctor roster, capacity,
   concurrency and the 2-hour cut-off. Until it exists these results
   are a frontend demo, not a real booking guarantee.
   ============================================================ */
(function (global) {
  'use strict';

  // ── INPUT SOURCES (read-only, always through the canonical module) ──
  var REASON_TEXT = {
    clinic_closed: 'The clinic is closed on that date.',
    invalid_date: 'That date is not valid.',
    invalid_time: 'That time is not a valid appointment time.',
    doctor_unavailable: 'No veterinarian is available to take that visit.',
    doctor_conflict: 'The veterinarian is already booked at that time.',
    resource_capacity_reached: 'That time is already fully booked for this service.',
    slot_taken: 'That slot is already booked.',
    service_inactive: 'That service is no longer available to book.',
    unknown_service: 'That service is not recognised.',
    settings_unavailable: 'Clinic schedule settings are unavailable.',
    invalid_service: 'That service could not be resolved.'
  };

  function _settings() { return global.VHSClinicSettings; }
  function _appointments() { return global.SharedMockAppointments; }
  function _users() { return global.SharedMockUsers; }
  function _contract() { return global.AppointmentContract; }
  function _doctors() { return global.SharedMockDoctors; }

  // Canonical "HH:MM" for a 12h or 24h time string.
  // The contract remains the preferred normaliser, but its output is
  // SHAPE-CHECKED: a malformed value must return null (→ 'invalid_time')
  // rather than pass through and be reported as an unknown slot on an open
  // day (→ a misleading 'clinic_closed').
  function _hhmm(value) {
    var c = _contract();
    if (c && c.timeToHHMM) {
      var via = c.timeToHHMM(value);
      var vm = String(via == null ? '' : via).trim().match(/^(\d{1,2}):(\d{2})$/);
      if (vm) return String(parseInt(vm[1], 10)).padStart(2, '0') + ':' + vm[2];
    }
    var m = String(value == null ? '' : value).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
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
      // Placeholder only — see the header. Consumers must not block a slot
      // on this until the backend supplies a configured duration.
      durationMinutes: isNaN(duration) || duration <= 0 ? 60 : duration,
      durationIsAuthoritative: false,
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
      var usedCount, limit, resource;
      if (svc.requiresDoctor) {
        usedCount = at.doctor;
        limit = doctorCapacity;
        resource = 'doctor';
      } else {
        usedCount = at.byService[String(svc.serviceId)] || 0;
        limit = svc.capacityPerSlot;
        resource = 'service:' + svc.serviceId;
      }
      var available = usedCount < limit;
      // WHY a slot is unavailable, as structured data. The UI maps these to
      // friendly copy; the engine never returns prose.
      var conflict = null;
      if (!available) {
        conflict = (resource === 'doctor' && limit === 0)
          ? { code: 'doctor_unavailable', resource: resource, used: usedCount, capacity: limit }
          : {
              code: (resource === 'doctor') ? 'doctor_conflict' : 'resource_capacity_reached',
              resource: resource,
              used: usedCount,
              capacity: limit
            };
      }
      return {
        time: label,
        timeHHMM: key,
        available: available,
        used: usedCount,
        capacity: limit,
        resource: resource,
        conflict: conflict
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

  function _mins(hhmm) {
    var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }

  // ── ALTERNATIVES ─────────────────────────────────────────────────────
  // Valid replacements for an unavailable request, built ONLY from the
  // clinic's own configured slots (VHSClinicSettings.slotsFor) that pass
  // the same capacity check. Nothing here is invented, extended or
  // interpolated.
  //
  // Ranking is deterministic and explainable, in this order:
  //   1. the REQUESTED date first — keeping the visit on the day asked for;
  //   2. within a day, the valid slot CLOSEST to the requested time;
  //      an exact tie breaks to the earlier time, so ordering is stable;
  //   3. only when the requested day yields nothing do we move to the next
  //      day, earliest first, and fill the remainder with the earliest valid
  //      options.
  // With no requested time, a day is simply listed in configured order.
  function _alternatives(options, limit, searchDays) {
    var o = options || {};
    var want = Math.min(limit || 3, 10);
    var span = searchDays || 7;
    var svc = getServiceScheduling(o.serviceId);
    if (!svc || !svc.active) return [];

    var anchor = _mins(_hhmm(o.time));
    var start = o.date || _todayStr();
    var found = [];

    for (var day = 0; day < span && found.length < want; day++) {
      var dateStr = _addDays(start, day);
      var r = _evaluate({
        serviceId: o.serviceId,
        date: dateStr,
        doctorId: o.doctorId,
        excludeAppointmentId: o.excludeAppointmentId
      });
      if (!r.ok) continue;

      var open = r.slots.filter(function (s) { return s.available; });
      if (anchor !== null) {
        open = open.slice().sort(function (a, b) {
          var da = Math.abs(_mins(a.timeHHMM) - anchor);
          var db = Math.abs(_mins(b.timeHHMM) - anchor);
          return da !== db ? da - db : _mins(a.timeHHMM) - _mins(b.timeHHMM);
        });
      }
      for (var i = 0; i < open.length && found.length < want; i++) {
        found.push({
          date: dateStr,
          time: open[i].time,
          timeHHMM: open[i].timeHHMM,
          rank: day === 0 ? 'same_day' : 'later_day',
          sameDay: day === 0
        });
      }
    }
    return found;
  }

  // ── PUBLIC API ───────────────────────────────────────────────────────
  global.SmartScheduling = {

    // Metadata for one service, or null.
    getServiceScheduling: getServiceScheduling,

    // Plain-English phrase for a reason code. Lives here so User, Admin and
    // Vetti explain a conflict IDENTICALLY instead of each keeping its own
    // copy of the wording. Portals may still add their own tone around it.
    describeReason: function (code) {
      return REASON_TEXT[code] || 'That time is not available.';
    },

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

    // { ok, available, reason, detail } — 'clinic_closed' means the day has
    // no configured slots at all; a full slot explains WHICH resource is
    // exhausted (doctor_unavailable / doctor_conflict /
    // resource_capacity_reached). Alternatives ride along on a failure.
    isSlotAvailable: function (options) {
      var o = options || {};
      var r = _evaluate(o);
      if (!r.ok) {
        return { ok: false, available: false, reason: r.reason, detail: null, alternatives: _alternatives(o, 3) };
      }
      var want = _hhmm(o.time);
      if (!want) return { ok: false, available: false, reason: 'invalid_time', detail: null, alternatives: _alternatives(o, 3) };
      var hit = r.slots.find(function (s) { return s.timeHHMM === want; });
      if (!hit) return { ok: false, available: false, reason: 'clinic_closed', detail: null, alternatives: _alternatives(o, 3) };
      if (!hit.available) {
        return {
          ok: false,
          available: false,
          reason: hit.conflict.code,
          detail: hit.conflict,
          slot: _slot(hit.time),
          capacity: hit.capacity,
          used: hit.used,
          alternatives: _alternatives(o, 3)
        };
      }
      return { ok: true, available: true, reason: null, detail: null, slot: _slot(hit.time), capacity: hit.capacity, used: hit.used, alternatives: [] };
    },

    // Full booking-request validation. Returns the normalized request on
    // success so a caller can pass it straight to the portal's own
    // booking flow. It does NOT create the appointment. A rejection carries
    // the structured reason, the conflict detail and ready-to-offer
    // alternatives so no caller has to assemble them by hand.
    // TODO(BACKEND): POST /api/scheduling/validate — server re-checks
    // capacity and the cut-off at commit time.
    validateAppointmentRequest: function (options) {
      var o = options || {};
      var r = _evaluate(o);
      if (!r.ok) {
        return { ok: false, reason: r.reason, detail: null, request: null, alternatives: _alternatives(o, 3) };
      }
      var check = this.isSlotAvailable(o);
      if (!check.ok) {
        return { ok: false, reason: check.reason, detail: check.detail || null, request: null, alternatives: check.alternatives || _alternatives(o, 3) };
      }
      return {
        ok: true,
        reason: null,
        detail: null,
        alternatives: [],
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

    // Next bookable slots, DETERMINISTICALLY ranked (see _alternatives).
    // TODO(BACKEND): GET /api/scheduling/alternatives
    getAlternativeSlots: function (options) {
      var o = options || {};
      var limit = parseInt(o.limit, 10) > 0 ? parseInt(o.limit, 10) : 3;
      return { ok: true, reason: null, slots: _alternatives(o, limit, parseInt(o.searchDays, 10) > 0 ? parseInt(o.searchDays, 10) : 7) };
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
