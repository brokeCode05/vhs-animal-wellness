/* ============================================================
   VHS CLINIC SETTINGS — canonical operating configuration
   One shared source for booking slots, operating hours, policy
   cutoffs, no-show grace, and public clinic contact info.
   Consumers: user booking (slots + cutoffs), Admin Clinic
   Settings page, dashboard slot pickers via getVHSTimeSlots.

   Storage stays INSIDE this module (portal files never touch
   localStorage). Seeds are never mutated — overrides merge on
   read, exactly like the other shared stores.
   TODO(BACKEND): Replace with GET /api/clinic-settings and
   PATCH /api/clinic-settings. The backend will own validation,
   authorization, and concurrency-sensitive scheduling; the
   no-show grace period becomes server-enforced processing
   with audit history.
   ============================================================ */
(function (global) {
  'use strict';

  var DEFAULTS = {
    // "Last appointment" = the LATEST selectable START (inclusive),
    // not a closing timestamp: weekday 17:00 → 5:00 PM starts exist.
    hours: {
      weekday: { firstAppointment: '09:00', lastAppointment: '17:00' }, // Mon–Fri
      weekend: { firstAppointment: '10:00', lastAppointment: '18:00' }  // Sat–Sun
    },
    slotIntervalMinutes: 60,
    cancellationCutoffMinutes: 120,  // 2 hours before appointment
    rescheduleCutoffMinutes: 120,    // 2 hours before appointment
    noShowGraceMinutes: 15,
    clinicInfo: {
      name: 'VHS Animal Wellness Center',
      address: '834 Aurora Boulevard cor Driod Street, Kaunlaran, Cubao, Quezon City, Philippines, 1111',
      phone: '0917 108 4174',
      email: 'vhs.animalwellness@gmail.com',
      website: 'www.vhsclinic.com'
    }
  };

  var STORE_KEY = 'vhs_mock_clinic_settings_v1';

  function _clone(v) { return JSON.parse(JSON.stringify(v)); }

  function _deepMerge(base, patch) {
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    Object.keys(patch).forEach(function (k) {
      var pv = patch[k];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = _deepMerge(base[k], pv);
      } else if (pv !== undefined && pv !== null) {
        out[k] = pv;
      }
    });
    return out;
  }

  function _load() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) { return {}; }
  }

  function _save(settings) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }

  function _minutes(hhmm) {
    var m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
  }

  function _h12(mins) {
    var h24 = Math.floor(mins / 60);
    var mm = mins % 60;
    var ampm = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12 || 12;
    return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ampm;
  }

  function _isWeekend(day) { return day === 0 || day === 6; }

  global.VHSClinicSettings = {
    DEFAULTS: _clone(DEFAULTS),

    // Effective settings = defaults + persisted overrides (never mutates).
    get: function () {
      return _deepMerge(DEFAULTS, _load());
    },

    // TODO(BACKEND): PATCH /api/clinic-settings — server validates ranges.
    update: function (patch) {
      var next = _deepMerge(this.get(), patch || {});
      // Minimal sanity clamps so a bad edit cannot break slot generation.
      next.slotIntervalMinutes = Math.max(15, Math.min(240, parseInt(next.slotIntervalMinutes, 10) || 60));
      next.cancellationCutoffMinutes = Math.max(0, parseInt(next.cancellationCutoffMinutes, 10) || 0);
      next.rescheduleCutoffMinutes = Math.max(0, parseInt(next.rescheduleCutoffMinutes, 10) || 0);
      next.noShowGraceMinutes = Math.max(0, parseInt(next.noShowGraceMinutes, 10) || 0);
      ['weekday', 'weekend'].forEach(function (k) {
        var h = next.hours[k];
        if (_minutes(h.firstAppointment) === null) h.firstAppointment = DEFAULTS.hours[k].firstAppointment;
        if (_minutes(h.lastAppointment) === null) h.lastAppointment = DEFAULTS.hours[k].lastAppointment;
      });
      _save(next);
      return { ok: true, settings: _clone(next) };
    },

    // Restore factory defaults (clears the demo persistence layer).
    reset: function () {
      try { global.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      return { ok: true, settings: _clone(DEFAULTS) };
    },

    // Hours for a date string (YYYY-MM-DD) or a day index (0=Sun..6=Sat).
    hoursFor: function (dateOrDay) {
      var day = typeof dateOrDay === 'number'
        ? dateOrDay
        : new Date(String(dateOrDay) + 'T12:00:00').getDay();
      var s = this.get();
      var h = _isWeekend(day) ? s.hours.weekend : s.hours.weekday;
      return { firstAppointment: h.firstAppointment, lastAppointment: h.lastAppointment };
    },

    // Selectable appointment STARTS for a date: first..last INCLUSIVE,
    // stepped by slotIntervalMinutes, as 12h labels ("9:00 AM").
    slotsFor: function (dateStr) {
      if (!dateStr) return [];
      var d = new Date(String(dateStr) + 'T12:00:00');
      if (isNaN(d)) return [];
      var s = this.get();
      var h = _isWeekend(d.getDay()) ? s.hours.weekend : s.hours.weekday;
      var first = _minutes(h.firstAppointment);
      var last = _minutes(h.lastAppointment);
      if (first === null || last === null || last < first) return [];
      var step = s.slotIntervalMinutes;
      var slots = [];
      for (var t = first; t <= last; t += step) slots.push(_h12(t));
      return slots;
    },

    // True when the appointment is at (or past) the configured cutoff —
    // used by the User portal's reschedule/cancel eligibility.
    // TODO(BACKEND): server enforces the cutoff on PATCH /appointments/:id.
    isWithinCutoff: function (dateStr, timeHHMM, kind) {
      var s = this.get();
      var cutoff = (kind === 'cancel')
        ? s.cancellationCutoffMinutes
        : s.rescheduleCutoffMinutes;
      var apptMin = _minutes(timeHHMM);
      if (!dateStr || apptMin === null) return false;
      var p = String(dateStr).split('-');
      var apptDate = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10),
        Math.floor(apptMin / 60), apptMin % 60);
      var diffHours = (apptDate.getTime() - Date.now()) / 3600000;
      return diffHours <= (cutoff / 60);
    },

    cutoffMinutes: function (kind) {
      var s = this.get();
      return (kind === 'cancel') ? s.cancellationCutoffMinutes : s.rescheduleCutoffMinutes;
    },

    // Minutes until the appointment starts; NEGATIVE once it has started.
    // Single shared clock for the User and Admin reschedule/cancel gating so
    // both portals obey the exact same boundary rule.
    // TODO(BACKEND): compute server-side so device clocks cannot skew the cut-off.
    minutesUntilAppointment: function (dateStr, timeHHMM) {
      var apptMin = _minutes(timeHHMM);
      if (!dateStr || apptMin === null) return null;
      var p = String(dateStr).split('-');
      var apptDate = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10),
        Math.floor(apptMin / 60), apptMin % 60);
      if (isNaN(apptDate.getTime())) return null;
      return Math.round((apptDate.getTime() - Date.now()) / 60000);
    },

    // Policy seam for Admin + User rescheduling: blocked when the remaining
    // time is <= the configured reschedule cut-off (exactly 120 min counts as
    // blocked), and for anything already past. Unknown dates stay allowed.
    isRescheduleBlocked: function (dateStr, timeHHMM) {
      var remaining = this.minutesUntilAppointment(dateStr, timeHHMM);
      if (remaining === null) return false;
      return remaining <= this.cutoffMinutes('reschedule');
    },

    // Friendly label: "2 hours" / "90 minutes" for UI copy.
    cutoffLabel: function (kind) {
      var m = this.cutoffMinutes(kind);
      if (m && m % 60 === 0) return (m / 60) + (m === 60 ? ' hour' : ' hours');
      return m + ' minutes';
    },

    clinicInfo: function () {
      return _clone(this.get().clinicInfo);
    }
  };
})(window);
