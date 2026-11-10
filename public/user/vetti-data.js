/* ============================================================
   VETTIDATA — the one place Vetti reads clinic data from

   Vetti UI used to reach straight into SharedMockUsers,
   SharedMockAppointments, AppointmentContract and the portal's own
   session helpers. This module is that boundary: above this line Vetti
   only knows "pets", "appointments", "services", "documents", "clinic".
   Below it, nothing about WHERE a record came from is allowed to leak.

   EVERY read goes through the shared stores, which the portal hydrates
   from server truth at boot and after every write (GET /api/users/me/pets,
   GET /api/appointments, the shared active-service catalog): Vetti,
   My Pets and My Appointments all read the SAME records, so the screens
   can never disagree. Nothing is copied, cached or duplicated here.

   The ONE write (createPet) goes through the authenticated pets endpoint
   (POST /api/pets) and re-hydrates from the server's response, so a pet
   Vetti shows is always a persisted record — never a local save.

   FAILURE RULE: a missing store yields [] / null, never a throw and
   never an invented record, so Vetti can honestly say "I don't have
   that" instead of failing silently or pretending.

   Only ONE write is exposed (createPet), because the in-conversation
   pet form is the one place Vetti legitimately creates a record today.
   Every other mutation stays in the portal's own screens.

   v5.1.0
   ============================================================ */
(function (global) {
  'use strict';

  // ── Sources, resolved lazily ──────────────────────────────────────
  // Read inside the functions, never at load time, so this module is
  // order-independent: it works wherever it is included, and it keeps
  // working if a store is added or removed later.

  function users() { return global.SharedMockUsers || null; }
  function appts() { return global.SharedMockAppointments || null; }
  function contract() { return global.AppointmentContract || null; }
  function petViews() { return global.VHSPetOnboarding || null; }
  function documents() { return global.SharedDocuments || null; }
  function clinic() { return global.VHSClinicSettings || null; }

  // Portal helpers are used when present so Vetti formats a value the
  // same way My Appointments formats it. The fallbacks keep Vetti
  // readable if it is ever loaded without the portal page.
  function portal(name) {
    return typeof global[name] === 'function' ? global[name] : null;
  }

  function arr(value) { return Array.isArray(value) ? value : []; }

  // ── IDENTITY ──────────────────────────────────────────────────────

  function getOwnerId() {
    var viaPortal = portal('_currentOwnerId');
    if (viaPortal) {
      var id = viaPortal();
      if (id) return id;
    }
    var u = users();
    return u ? (u.currentUserId || null) : null;
  }

  function getCurrentUser() {
    var session = portal('_getSessionUser');
    if (session) {
      var s = session();
      if (s && Object.keys(s).length) return s;
    }
    var u = users();
    return u && typeof u.currentUser === 'function' ? (u.currentUser() || null) : null;
  }

  function getFirstName() {
    var u = getCurrentUser() || {};
    return u.firstName || (u.name ? String(u.name).split(' ')[0] : '') || '';
  }

  // ── PETS ──────────────────────────────────────────────────────────

  function getPets() {
    var views = petViews();
    if (views && typeof views.petsForCurrentUser === 'function') {
      return arr(views.petsForCurrentUser());
    }
    var u = users();
    var id = getOwnerId();
    if (u && id && typeof u.petsOfOwner === 'function') return arr(u.petsOfOwner(id));
    return [];
  }

  function getPetById(id) {
    var list = getPets();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].petId) === String(id)) return list[i];
    }
    return null;
  }

  // The active pet is a CONVERSATION choice, not a stored record, so the
  // authoritative id stays with Vetti UI's single setter and is passed in
  // here. Keeping it out of here is deliberate: two holders of
  // "who are we talking about" is exactly the bug this layer prevents.
  // With no id supplied, this resolves to the first pet.
  function getActivePet(activePetId) {
    var list = getPets();
    if (!list.length) return null;
    if (activePetId === undefined || activePetId === null) return list[0];
    return getPetById(activePetId) || list[0];
  }

  function getPetLimits() {
    var v = petViews();
    return (v && v.PET_LIMITS) || {
      name: 50, breedCustom: 60,
      age: { digits: 2, max: 50 },
      weightKg: { digits: 3, decimals: 2, max: 200 }
    };
  }

  // The single write Vetti makes. Creates ONE pet through the
  // AUTHENTICATED pets endpoint (POST /api/pets) — ownership is resolved
  // server-side from the session, never sent by the caller and never
  // matched by name — then re-hydrates the shared store from server truth
  // so every later pet read reflects the persisted record. No appointment,
  // document or history is fabricated for it.
  // Returns a Promise<{ ok, pet?, error?, message? }>:
  //   no write adapter → { ok:false, error:'unavailable' } (never a local save)
  //   no session       → { ok:false, error:'no_session' }
  function createPet(fields) {
    var writes = global.VHSWrites;
    var ownerId = getOwnerId();
    if (!ownerId) return Promise.resolve({ ok: false, error: 'no_session' });
    if (!writes || typeof writes.createPet !== 'function') {
      return Promise.resolve({ ok: false, error: 'unavailable' });
    }
    var f = Object.assign({}, fields || {});
    // No owner id is ever sent: PetsController@store scopes the new pet to
    // the authenticated session's user.
    return writes.createPet(f).then(function (res) {
      if (!res || !res.ok) {
        var msg = (res && res.message) || '';
        if (!msg && res && res.errors) {
          var keys = Object.keys(res.errors);
          if (keys.length) msg = res.errors[keys[0]][0] || '';
        }
        return { ok: false, error: 'failed', message: msg };
      }
      var pet = res.pet || (res.data && res.data.pet) || null;
      var reads = global.VHSReads;
      if (pet && reads && typeof reads.hydrateMyPets === 'function') {
        // Await the re-hydration: the caller renders the pet list right
        // after this resolves, and it must show server truth — not a
        // half-updated store.
        return reads.hydrateMyPets(getCurrentUser(), { ownerId: ownerId })
          .then(function () { return { ok: true, pet: pet }; });
      }
      return pet ? { ok: true, pet: pet } : { ok: false, error: 'invalid' };
    }).catch(function () {
      return { ok: false, error: 'network', message: 'Network error. Please try again.' };
    });
  }

  // ── SERVICES ──────────────────────────────────────────────────────

  function getServices() {
    var u = users();
    if (!u) return [];
    if (typeof u.activeServices === 'function') return arr(u.activeServices());
    if (typeof u.services === 'function') return arr(u.services());
    return [];
  }

  function getServiceById(id) {
    var list = getServices();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].serviceId) === String(id)) return list[i];
    }
    return null;
  }

  // Resolves any stored form of a service (value, label or a legacy
  // variant) to the one canonical label every portal screen displays.
  function getServiceLabel(value) {
    var u = users();
    if (u && typeof u.serviceLabel === 'function') return u.serviceLabel(value) || '';
    return String(value || '');
  }

  // ── APPOINTMENTS ──────────────────────────────────────────────────

  function normalizeStatus(status) {
    var c = contract();
    return c && typeof c.normalizeStatus === 'function'
      ? c.normalizeStatus(status)
      : String(status || 'pending');
  }

  // Keep the same time-aware buckets as My Appointments. A patient checked in
  // today is still in clinic flow, not a FUTURE booking; old unfinished visits
  // move to history without falsely changing their database status.
  var BOOKED_STATUS = { pending: 1, confirmed: 1, rescheduled: 1 };
  var IN_CLINIC_STATUS = { checked_in: 1, in_consultation: 1 };

  function isFutureDateTime(date, time, now) {
    var d = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    var normalizedTime = contract() && contract().timeToHHMM
      ? contract().timeToHHMM(time) : String(time || '');
    var t = String(normalizedTime || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!d || !t) return false;
    var scheduled = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]),
      Number(t[1]), Number(t[2]));
    return !isNaN(scheduled.getTime()) && scheduled.getTime() > now.getTime();
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function fmtDate(value) {
    var f = portal('_fmtApptDateShort');
    return f ? f(value) : String(value || '—');
  }

  function fmtTime(value) {
    var f = portal('_fmtApptTimeShort');
    return f ? f(value) : String(value || '');
  }

  // One appointment in the shape Vetti renders and acts on. Display
  // strings only — no store row rides along, so nothing invisible is
  // carried into the conversation.
  function shape(record) {
    return {
      pet: (record.pet && record.pet.name) || '—',
      service: getServiceLabel(record.service) || record.service || '—',
      date: fmtDate(record.appointmentDate),
      time: fmtTime(record.appointmentTime),
      status: normalizeStatus(record.status),
      // Already in the shared store; carried so a handoff can target the
      // right visit and so the owner can quote the clinic's reference.
      referenceNo: record.referenceNo || '',
      appointmentId: record.appointmentId
    };
  }

  // The owner's appointments from the shared store, which the portal
  // hydrates from the authenticated endpoint (GET /api/appointments) at
  // boot and after every booking — so this is server truth for the
  // current owner, filtered locally.
  //
  // SAFETY: an unresolvable owner id returns NOTHING. The shared store
  // holds more than one owner's appointments, so falling back to the
  // unfiltered list here would show this owner somebody else's visits.
  // Failing closed costs a blank answer in a broken session; failing open
  // would leak another owner's records.
  function getAppointments() {
    var me = getOwnerId();
    if (!me) return [];
    var a = appts();
    var all = (a && typeof a.all === 'function') ? arr(a.all()) : [];
    return all.filter(function (x) { return String(x.userId) === String(me); });
  }

  function sortBuckets() {
    var today = todayStr();
    var now = new Date();
    var buckets = { upcoming: [], past: [] };
    getAppointments().forEach(function (record) {
      var status = normalizeStatus(record.status);
      var date = String(record.appointmentDate || '');
      var isUpcoming = IN_CLINIC_STATUS[status]
        ? date === today
        : (!!BOOKED_STATUS[status] && isFutureDateTime(date, record.appointmentTime, now));
      var entry = shape(record);
      // Sorted on the raw date/time, before the display strings are
      // built, so ordering never depends on a formatted string.
      entry.sort = date + ' ' + String(record.appointmentTime || '');
      if (isUpcoming) buckets.upcoming.push(entry);
      else buckets.past.push(entry);
    });
    buckets.upcoming.sort(function (a, b) { return a.sort.localeCompare(b.sort); });
    buckets.past.sort(function (a, b) { return b.sort.localeCompare(a.sort); });
    return {
      upcoming: buckets.upcoming.map(stripSort),
      past: buckets.past.map(stripSort)
    };
  }

  function stripSort(entry) {
    var copy = Object.assign({}, entry);
    delete copy.sort;
    return copy;
  }

  function getUpcomingAppointments() { return sortBuckets().upcoming; }
  function getPastAppointments() { return sortBuckets().past; }

  // The two buckets in one pass — the shape Vetti's snapshot, list and
  // context builder all read.
  function getAppointmentsByBucket() { return sortBuckets(); }

  function getAppointmentById(id) {
    if (!id) return null;
    var hit = getAppointments().filter(function (x) {
      return String(x.appointmentId) === String(id);
    })[0];
    return hit ? shape(hit) : null;
  }

  function getAppointmentByReference(referenceNo) {
    if (!referenceNo) return null;
    var hit = getAppointments().filter(function (x) {
      return String(x.referenceNo) === String(referenceNo);
    })[0];
    return hit ? shape(hit) : null;
  }

  // ── DOCUMENTS ─────────────────────────────────────────────────────

  function getPetDocuments(petId) {
    var d = documents();
    if (!d) return [];
    if (petId && typeof d.forPet === 'function') return arr(d.forPet(petId));
    if (typeof d.getAll === 'function') return arr(d.getAll());
    return [];
  }

  // ── CLINIC ────────────────────────────────────────────────────────

  function getClinicInfo() {
    var c = clinic();
    if (!c) return null;
    if (typeof c.clinicInfo === 'function') return c.clinicInfo() || null;
    if (typeof c.get === 'function') {
      var settings = c.get();
      return (settings && settings.clinicInfo) || null;
    }
    return null;
  }

  // ── SMART AVAILABILITY (adapter boundary) ─────────────────────────
  // Vetti never decides availability itself: the SAME backend endpoint the
  // booking wizard uses — GET /api/availability (doctor capacity, non-doctor
  // capacity, on-duty doctor pool, same-day past-slot filtering, backend
  // slot conflicts) — answers here first. The shared engine is kept ONLY as
  // the offline fallback (it reads the same mirrored server data), never as
  // a second authority. Returns a Promise of { ok, slots, reason } where
  // slots are 12h display labels.
  function getAvailableSlots(options) {
    var o = options || {};
    var reads = global.VHSReads;
    if (reads && typeof reads.availability === 'function' && o.date) {
      return reads.availability({
        date: o.date,
        serviceId: o.serviceId,
        doctorId: o.doctorId,
        excludeId: o.excludeAppointmentId
      }).then(function (r) {
        if (r && r.ok && r.data) {
          return { ok: true, slots: arr(r.data.display_slots), reason: null };
        }
        return engineSlots(o, r && r.message);
      }, function () {
        return engineSlots(o, 'availability_unreachable');
      });
    }
    return Promise.resolve(engineSlots(o, 'no_date'));
  }

  // OFFLINE FALLBACK ONLY — the pre-existing shared-engine path, used just
  // when the availability API cannot answer (never as a second authority).
  function engineSlots(o, apiMessage) {
    var sched = window.SmartScheduling;
    if (!sched || typeof sched.getAvailableSlots !== 'function') {
      return { ok: false, slots: [], reason: apiMessage || 'scheduling_unavailable' };
    }
    var result = sched.getAvailableSlots({
      serviceId: o.serviceId,
      date: o.date,
      doctorId: o.doctorId,
      excludeAppointmentId: o.excludeAppointmentId
    });
    var slots = (result.slots || []).map(function (s) {
      return (s && s.time !== undefined) ? s.time : s;
    });
    return { ok: result.ok === true, slots: slots, reason: result.reason || null };
  }

  // Scheduling metadata for one service (duration, requiresDoctor,
  // capacityPerSlot, active). Read-only pass-through to the engine.
  function getServiceScheduling(serviceId) {
    var sched = window.SmartScheduling;
    if (!sched || typeof sched.getServiceScheduling !== 'function') return null;
    return sched.getServiceScheduling(serviceId);
  }

  // ── QA / DEMO ONLY ────────────────────────────────────────────────
  // Not reachable from any product path — no module in the workspace
  // calls it. It lives beside the store it repairs so Vetti UI never
  // holds a mock store key, and it is removed with the other QA helpers
  // once there is a real backend and real authentication.
  // TODO(BACKEND): delete this with the rest of the QA surface.
  function qaPruneOwnerPets() {
    var target = String(getOwnerId() || '');
    if (!target) return false;
    try {
      var KEY = 'vhs_mock_users_pets_v1';
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      raw.petAdded = raw.petAdded || [];
      raw.petOverrides = raw.petOverrides || {};
      // Remember this owner's pets before pruning so their overrides go too.
      var mine = getPets().map(function (p) { return String(p.petId); });
      raw.petAdded = raw.petAdded.filter(function (p) {
        return String(p.ownerId) !== target;
      });
      mine.forEach(function (id) { delete raw.petOverrides[id]; });
      localStorage.setItem(KEY, JSON.stringify(raw));
      return true;
    } catch (e) {
      return false;                    // storage unavailable; nothing pruned
    }
  }

  global.VettiData = {
    // identity
    getCurrentUser: getCurrentUser,
    getOwnerId: getOwnerId,
    getFirstName: getFirstName,
    // pets
    getPets: getPets,
    getPetById: getPetById,
    getActivePet: getActivePet,
    getPetLimits: getPetLimits,
    createPet: createPet,
    // services
    getServices: getServices,
    getServiceById: getServiceById,
    getServiceLabel: getServiceLabel,
    // appointments
    getAppointments: getAppointments,
    getAppointmentsByBucket: getAppointmentsByBucket,
    getUpcomingAppointments: getUpcomingAppointments,
    getPastAppointments: getPastAppointments,
    getAppointmentById: getAppointmentById,
    getAppointmentByReference: getAppointmentByReference,
    normalizeStatus: normalizeStatus,
    // other reads
    getPetDocuments: getPetDocuments,
    getClinicInfo: getClinicInfo,
    // smart scheduling (shared engine, never decided by Vetti)
    getAvailableSlots: getAvailableSlots,
    getServiceScheduling: getServiceScheduling,
    // QA/demo only — never called by product code
    qaPruneOwnerPets: qaPruneOwnerPets
  };
})(window);