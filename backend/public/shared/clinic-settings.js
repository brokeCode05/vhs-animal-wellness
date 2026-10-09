/* ============================================================
   VHS CLINIC SETTINGS — backend-authoritative compatibility layer
   Keeps the existing frontend API while reading/writing Laravel.
   ============================================================ */
(function (global) {
  'use strict';

  var DEFAULTS = {
    hours: {
      weekday: { firstAppointment: '09:00', lastAppointment: '17:00' },
      weekend: { firstAppointment: '10:00', lastAppointment: '18:00' }
    },
    slotIntervalMinutes: 60,
    cancellationCutoffMinutes: 120,
    rescheduleCutoffMinutes: 120,
    noShowGraceMinutes: 15,
    clinicInfo: {
      name: 'VHS Animal Wellness Center',
      address: '834 Aurora Boulevard cor Driod Street, Kaunlaran, Cubao, Quezon City, Philippines, 1111',
      phone: '0917 108 4174',
      email: 'vhs.animalwellness@gmail.com',
      website: 'www.vhsclinic.com'
    }
  };

  var cache = null;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+.?[\\\]^{|}-]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function deepMerge(base, patch) {
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base || {});
    if (!patch || typeof patch !== 'object') return out;
    Object.keys(patch).forEach(function (k) {
      var pv = patch[k];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) && base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = deepMerge(base[k], pv);
      else if (pv !== undefined && pv !== null) out[k] = pv;
    });
    return out;
  }
  function request(method, url, body) {
    var xhr = new XMLHttpRequest();
    try {
      xhr.open(method, url, false);
      xhr.setRequestHeader('Accept', 'application/json');
      if (body !== undefined) {
        xhr.setRequestHeader('Content-Type', 'application/json');
        var xsrf = cookie('XSRF-TOKEN'); if (xsrf) xhr.setRequestHeader('X-XSRF-TOKEN', xsrf);
      }
      xhr.send(body === undefined ? null : JSON.stringify(body));
      var data = null; try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (e) {}
      return { ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: data, error: data && data.message ? data.message : ('HTTP ' + xhr.status) };
    } catch (e) { return { ok: false, status: 0, error: e.message || 'Network error' }; }
  }
  function load(force) {
    if (cache && !force) return clone(cache);
    var r = request('GET', '/api/clinic-settings');
    if (r.ok && r.data && r.data.data && r.data.data.settings) cache = deepMerge(DEFAULTS, r.data.data.settings);
    else if (!cache) cache = clone(DEFAULTS);
    return clone(cache);
  }
  function minutes(hhmm) {
    var m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  }
  function h12(mins) {
    var h24 = Math.floor(mins / 60), mm = mins % 60, ampm = h24 >= 12 ? 'PM' : 'AM', h = h24 % 12 || 12;
    return h + ':' + String(mm).padStart(2, '0') + ' ' + ampm;
  }
  function isWeekend(day) { return day === 0 || day === 6; }

  global.VHSClinicSettings = {
    DEFAULTS: clone(DEFAULTS),
    get: function () { return load(false); },
    refresh: function () { return load(true); },
    update: function (patch) {
      var r = request('PATCH', '/api/clinic-settings', patch || {});
      if (!r.ok) return { ok: false, error: r.error || 'Could not save clinic settings.' };
      cache = deepMerge(DEFAULTS, r.data && r.data.data ? r.data.data.settings : patch || {});
      return { ok: true, settings: clone(cache) };
    },
    reset: function () {
      var r = request('PATCH', '/api/clinic-settings', clone(DEFAULTS));
      if (!r.ok) return { ok: false, error: r.error || 'Could not reset clinic settings.' };
      cache = deepMerge(DEFAULTS, r.data && r.data.data ? r.data.data.settings : DEFAULTS);
      return { ok: true, settings: clone(cache) };
    },
    hoursFor: function (dateOrDay) {
      var day = typeof dateOrDay === 'number' ? dateOrDay : new Date(String(dateOrDay) + 'T12:00:00').getDay();
      var s = this.get(), h = isWeekend(day) ? s.hours.weekend : s.hours.weekday;
      return { firstAppointment: h.firstAppointment, lastAppointment: h.lastAppointment };
    },
    slotsFor: function (dateStr) {
      if (!dateStr) return [];
      var d = new Date(String(dateStr) + 'T12:00:00'); if (isNaN(d)) return [];
      var s = this.get(), h = isWeekend(d.getDay()) ? s.hours.weekend : s.hours.weekday;
      var first = minutes(h.firstAppointment), last = minutes(h.lastAppointment), step = parseInt(s.slotIntervalMinutes, 10) || 60;
      if (first === null || last === null || last < first) return [];
      var out = []; for (var t = first; t <= last; t += step) out.push(h12(t)); return out;
    },
    isWithinCutoff: function (dateStr, timeHHMM, kind) {
      var cutoff = this.cutoffMinutes(kind), apptMin = minutes(timeHHMM); if (!dateStr || apptMin === null) return false;
      var p = String(dateStr).split('-');
      var when = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10), Math.floor(apptMin/60), apptMin%60);
      return ((when.getTime() - Date.now()) / 60000) <= cutoff;
    },
    cutoffMinutes: function (kind) { var s = this.get(); return kind === 'cancel' ? s.cancellationCutoffMinutes : s.rescheduleCutoffMinutes; },
    minutesUntilAppointment: function (dateStr, timeHHMM) {
      var apptMin = minutes(timeHHMM); if (!dateStr || apptMin === null) return null;
      var p = String(dateStr).split('-'); var when = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10), Math.floor(apptMin/60), apptMin%60);
      if (isNaN(when.getTime())) return null; return Math.round((when.getTime() - Date.now()) / 60000);
    },
    isRescheduleBlocked: function (dateStr, timeHHMM) { var remaining = this.minutesUntilAppointment(dateStr, timeHHMM); return remaining === null ? false : remaining <= this.cutoffMinutes('reschedule'); },
    cutoffLabel: function (kind) { var m = this.cutoffMinutes(kind); return m && m % 60 === 0 ? (m/60) + (m === 60 ? ' hour' : ' hours') : m + ' minutes'; },
    clinicInfo: function () { return clone(this.get().clinicInfo); }
  };

  // Warm the cache once so existing synchronous consumers retain their behavior.
  load(true);
})(window);
