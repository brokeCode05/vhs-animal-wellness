/**
 * VHS Read Adapter — read-only Laravel API access for boot-time portal loads.
 *
 * Counterpart to shared/api-writes.js (VHSWrites). Every function here is a
 * GET: it never mutates server state. Portals call the hydrate*() helpers to
 * replace the demo stores (SharedMockAppointments / SharedMockUsers /
 * SharedMockDoctors) with the SAME canonical records that VHSWrites operates
 * on, so rendered rows always carry real Laravel numeric IDs.
 *
 * Failure contract: hydrate helpers NEVER fall back to demo data. A failed
 * request hydrates the store with an empty list and reports { ok:false } so
 * the portal can render an honest empty state + error message instead of
 * silently showing mock records that do not exist in the database.
 *
 * Same-origin, session-cookie authenticated (auth/session-auth.js).
 */
window.VHSReads = (function () {
  'use strict';

  var API_BASE = '../api/';
  var Contract = window.AppointmentContract || null;

  function messageOf(fallback) {
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < args.length; i++) {
      if (args[i] && typeof args[i].message === 'string' && args[i].message.trim()) {
        return args[i].message;
      }
    }
    return fallback;
  }

  /** GET api/<path>; resolves { ok, status, data, message }. */
  function get(path) {
    return fetch(API_BASE + path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return null; })
          .then(function (body) {
            if (res.status === 401 || res.status === 419) {
              return { ok: false, status: res.status, data: null, unauthorized: true,
                message: 'Your session has expired. Please sign in again.' };
            }
            if (res.status === 403) {
              return { ok: false, status: 403, data: null,
                message: (body && body.message) || 'You do not have access to these records.' };
            }
            if (!res.ok) {
              return { ok: false, status: res.status, data: null,
                message: (body && body.message) || 'Could not load records from the clinic server.' };
            }
            return { ok: true, status: res.status, data: (body && body.data) || {}, message: (body && body.message) || '' };
          });
      })
      .catch(function () {
        return { ok: false, status: 0, data: null, offline: true,
          message: 'Could not reach the clinic server. Check your connection and try again.' };
      });
  }

  /** Presenter row -> canonical appointment record (same as VHSWrites). */
  function toCanonical(row) {
    if (!row) return null;
    var rec = Contract ? Contract.fromLegacy(row) : Object.assign({}, row);
    if (rec && !rec.referenceNo && row.reference_no) rec.referenceNo = row.reference_no;
    return rec;
  }

  // ── Raw endpoints ────────────────────────────────────────────────────────

  /** GET /api/appointments — role-scoped server-side (Admin=all, Doctor=assigned, User=own). */
  function appointments() {
    return get('appointments').then(function (r) {
      if (!r.ok) return r;
      var rows = (r.data && r.data.appointments) || [];
      var list = rows.map(toCanonical).filter(Boolean);
      return { ok: true, status: r.status, message: r.message, data: { appointments: list, raw: rows } };
    });
  }

  /** GET /api/users — Admin only. */
  function users() {
    return get('users').then(function (r) {
      if (!r.ok) return r;
      return { ok: true, status: r.status, message: r.message, data: { users: (r.data && r.data.users) || [] } };
    });
  }

  /** GET /api/users/{user}/pets — Admin (any owner) / User (own). */
  function petsOfUser(userId) {
    if (!userId) {
      return Promise.resolve({ ok: false, status: 0, data: null, message: 'No client selected.' });
    }
    return get('users/' + encodeURIComponent(userId) + '/pets').then(function (r) {
      if (!r.ok) return r;
      return { ok: true, status: r.status, message: r.message, data: { pets: (r.data && r.data.pets) || [] } };
    });
  }

  /** GET /api/users/me/pets — signed-in owner's pets. */
  function myPets() {
    return get('users/me/pets').then(function (r) {
      if (!r.ok) return r;
      return { ok: true, status: r.status, message: r.message, data: { pets: (r.data && r.data.pets) || [] } };
    });
  }

  /** GET /api/doctors — directory (+ inactive records for Admin). */
  function doctors() {
    return get('doctors').then(function (r) {
      if (!r.ok) return r;
      return { ok: true, status: r.status, message: r.message, data: { doctors: (r.data && r.data.doctors) || [] } };
    });
  }

  /** GET /api/consultations?history_for_appointment_id= — Doctor-only EMR continuity. */
  function appointmentHistory(appointmentId) {
    if (!appointmentId) {
      return Promise.resolve({ ok: false, status: 0, data: null, message: 'No appointment selected.' });
    }
    return get('consultations?history_for_appointment_id=' + encodeURIComponent(appointmentId)).then(function (r) {
      if (!r.ok) return r;
      return { ok: true, status: r.status, message: r.message,
        data: { history: (r.data && r.data.history) || [] } };
    });
  }

  /** GET /api/consultations?appointment_id= — the Doctor's consultation
   *  session for ONE appointment (null when none exists yet). */
  function consultationForAppointment(appointmentId) {
    if (!appointmentId) {
      return Promise.resolve({ ok: false, status: 0, data: null, message: 'No appointment selected.' });
    }
    return get('consultations?appointment_id=' + encodeURIComponent(appointmentId)).then(function (r) {
      if (!r.ok) return r;
      var list = (r.data && r.data.consultations) || [];
      return { ok: true, status: r.status, message: r.message,
        data: { consultation: list.length ? list[0] : null } };
    });
  }

  // ── Store hydration (the boot-time read path) ────────────────────────────

  /**
   * Fetch appointments and replace SharedMockAppointments with server truth.
   * On failure hydrates an EMPTY list (never demo seeds) so no mock ID can
   * reach a write action; caller receives { ok:false, message }.
   * Single-flight: concurrent boot callers (Admin boot + loadAppointments)
   * share ONE request instead of racing duplicate GETs.
   */
  var _appointmentsFlight = null;
  function hydrateAppointments(opts) {
    var store = window.SharedMockAppointments;
    if (_appointmentsFlight) return _appointmentsFlight;
    _appointmentsFlight = appointments().then(function (r) {
      if (!store) return r;
      if (!r.ok) {
        store.replaceWithServer([]); // honest empty state, no mock fallback
        return r;
      }
      store.replaceWithServer(r.data.appointments, opts || {});
      if (document.dispatchEvent) {
        try {
          document.dispatchEvent(new CustomEvent('vhs:appointments-loaded', { detail: { count: r.data.appointments.length } }));
        } catch (e) { /* CustomEvent unsupported */ }
      }
      return r;
    }).finally(function () { _appointmentsFlight = null; });
    return _appointmentsFlight;
  }

  /** Fetch all clients + their pets; replace SharedMockUsers with server truth. */
  var _clientsFlight = null;
  function hydrateClients() {
    var store = window.SharedMockUsers;
    if (_clientsFlight) return _clientsFlight;
    _clientsFlight = users().then(function (uRes) {
      if (!uRes.ok) {
        if (store) store.replaceWithServer([], []);
        return uRes;
      }
      var userList = uRes.data.users;
      return Promise.all(userList.map(function (u) {
        var ownerId = (u && (u.userId || u.id));
        return petsOfUser(ownerId).then(function (pRes) {
          return { ownerId: ownerId, pets: pRes.ok ? pRes.data.pets : [] };
        });
      })).then(function (petBatches) {
        var allPets = [];
        petBatches.forEach(function (b) { allPets = allPets.concat(b.pets); });
        if (store) store.replaceWithServer(userList, allPets);
        if (document.dispatchEvent) {
          try {
            document.dispatchEvent(new CustomEvent('vhs:clients-loaded', { detail: { users: userList.length, pets: allPets.length } }));
          } catch (e) { /* CustomEvent unsupported */ }
        }
        return { ok: true, status: uRes.status, message: uRes.message,
          data: { users: userList, pets: allPets } };
      });
    }).finally(function () { _clientsFlight = null; });
    return _clientsFlight;
  }

  /** Fetch one owner's pets (e.g. the signed-in User) and hydrate the store.
   *  opts.ownerId re-points the store identity boundary at the real owner. */
  function hydrateMyPets(owner, opts) {
    var store = window.SharedMockUsers;
    return myPets().then(function (r) {
      if (!store) return r;
      if (!r.ok) {
        store.replaceWithServer(owner ? [owner] : [], [], opts || {});
        return r;
      }
      store.replaceWithServer(owner ? [owner] : [], r.data.pets, opts || {});
      return r;
    });
  }

  /** Fetch the doctor directory; replace SharedMockDoctors with server truth. */
  function hydrateDoctors() {
    var store = window.SharedMockDoctors;
    return doctors().then(function (r) {
      if (!store) return r;
      if (!r.ok) {
        store.replaceWithServer([]);
        return r;
      }
      store.replaceWithServer(r.data.doctors);
      if (document.dispatchEvent) {
        try {
          document.dispatchEvent(new CustomEvent('vhs:doctors-loaded', { detail: { count: r.data.doctors.length } }));
        } catch (e) { /* CustomEvent unsupported */ }
      }
      return r;
    });
  }

  return {
    get: get,
    appointments: appointments,
    users: users,
    petsOfUser: petsOfUser,
    myPets: myPets,
    doctors: doctors,
    appointmentHistory: appointmentHistory,
    consultationForAppointment: consultationForAppointment,
    hydrateAppointments: hydrateAppointments,
    hydrateClients: hydrateClients,
    hydrateMyPets: hydrateMyPets,
    hydrateDoctors: hydrateDoctors,
    messageOf: messageOf,
  };
})();
