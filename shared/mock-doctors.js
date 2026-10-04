/* ============================================================
   SHARED MOCK DOCTORS — canonical Doctor/staff records
   One source for Admin Accounts, Admin Doctors, and the Doctor
   Portal so the same Doctor record is used everywhere.

   Final role rule: User | Doctor | Admin. Admin creates Doctors
   only — no Clerk, no Clinic Owner, no generic Staff, and only
   ONE Admin account exists (never creatable here).

   Account status (active|inactive) and availability
   (on_duty|on_break|on_leave) are SEPARATE concepts:
   inactive = login disabled; availability = working status.

   TODO(BACKEND): Replace Doctor persistence with Doctor/User API
   calls (GET/POST/PUT /doctors or /users?role=doctor). This demo
   layer is deleted when the API lands.
   ============================================================ */
(function (global) {
  'use strict';

  // Seed normalized from the Doctor Portal's existing identity
  // (VETERINARIAN vet-001 / "Dr. Santos") so the current portal
  // keeps its identity — nothing replaced, only adopted.
  // TODO(BACKEND): seeded from the staff/users table instead.
  var DOCTORS = [
    {
      doctorId: 1,
      userId: 'vet-001',
      firstName: 'Ana',
      middleName: '',
      lastName: 'Santos',
      name: 'Dr. Santos',
      email: 'ana.santos@vhs.example.com',
      phone: '0917-400-1122',
      role: 'Doctor',
      specialization: 'General Practice',
      accountStatus: 'active',
      availabilityStatus: 'on_duty',
      createdAt: '2026-01-05'
    }
  ];

  // ── DEMO PERSISTENCE LAYER (frontend-only, one canonical source) ────────
  // Same architectural rule as SharedMockUsers: seeds immutable, edits become
  // overrides, creates append. localStorage lives ONLY inside this module.
  var STORE_KEY = 'vhs_mock_doctors_v1';
  var DEMO = (function () {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  })();
  DEMO.overrides = DEMO.overrides || {};
  DEMO.added = DEMO.added || [];

  function _save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DEMO)); } catch (e) { /* storage unavailable */ }
  }

  function _all() {
    return DOCTORS.map(function (d) {
      var o = DEMO.overrides[d.doctorId];
      return o ? Object.assign({}, d, o) : Object.assign({}, d);
    }).concat(DEMO.added.map(function (d) { return Object.assign({}, d); }));
  }

  function _nextId() {
    var max = 0;
    _all().forEach(function (d) { var n = parseInt(d.doctorId, 10); if (!isNaN(n) && n > max) max = n; });
    return max + 1;
  }

  var AVAILABILITY = ['on_duty', 'on_break', 'on_leave'];
  var AVAILABILITY_LABELS = { on_duty: 'On Duty', on_break: 'On Break', on_leave: 'On Leave' };

  function normalizeAvailability(value) {
    var v = String(value || '').toLowerCase().trim();
    if (AVAILABILITY.indexOf(v) !== -1) return v;
    // Accept the Doctor Portal's legacy select labels.
    var legacy = { 'on-duty': 'on_duty', 'on duty': 'on_duty', 'on-dutty': 'on_duty', 'on break': 'on_break', 'on leave': 'on_leave' };
    return legacy[v] || 'on_duty';
  }

  global.SharedMockDoctors = {
    AVAILABILITY: AVAILABILITY,
    AVAILABILITY_LABELS: AVAILABILITY_LABELS,

    doctors: function () { return _all(); },
    byId: function (id) {
      return _all().find(function (d) { return String(d.doctorId) === String(id); }) || null;
    },
    byUserId: function (uid) {
      return _all().find(function (d) { return String(d.userId) === String(uid); }) || null;
    },
    // The portal's signed-in veterinarian (single-doctor prototype).
    // TODO(BACKEND): resolved from the authenticated session instead.
      currentDoctor: function () {
        return this.byUserId('vet-001') || _all()[0] || null;
      },
      // ── IDENTITY BOUNDARY (mock) ───────────────────────────────────────
      // The signed-in veterinarian, resolved from the roster rather than
      // declared inside a portal. `id` is the roster's userId ('vet-001'), so
      // audit rows and document authorship come from ONE source.
      // This is a DEMO resolver, not authentication: there is no session and
      // no login. Replacing it with an authenticated staff session is a change
      // to this function alone.
      // TODO(BACKEND): GET /me (staff session) supplies actorId/actorName.
      identityMode: 'mock',
      currentStaff: function () {
        var d = this.currentDoctor();
        if (!d) return { id: null, name: '', role: 'Veterinarian', clinicalTitle: 'Veterinarian' };
        // `role` is the ACCOUNT role from the roster (User | Doctor | Admin) —
        // the thing auth will eventually assert. `clinicalTitle` is the
        // professional title that appears on a SIGNED CLINICAL RECORD, which
        // is a different concept and must stay 'Veterinarian' so generated
        // consultation documents are byte-identical to before this boundary
        // existed. Both are mock values and both are replaced together when
        // an authenticated staff session lands.
        return { id: d.userId, name: d.name, role: d.role, clinicalTitle: 'Veterinarian' };
      },
    activeDoctors: function () {
      return _all().filter(function (d) { return d.accountStatus !== 'inactive'; });
    },
    availabilityLabel: function (value) {
      return AVAILABILITY_LABELS[normalizeAvailability(value)] || 'On Duty';
    },

    // ── WRITE-THROUGH ────────────────────────────────────────────────────
    // TODO(BACKEND): POST /doctors — role forced to Doctor server-side.
    addDoctor: function (fields) {
      var f = fields || {};
      if (!f.firstName || !f.lastName || !f.email) return { ok: false, error: 'invalid' };
      if (_all().some(function (d) { return String(d.email).toLowerCase() === String(f.email).toLowerCase(); })) {
        return { ok: false, error: 'duplicate_email' };
      }
      var doctor = {
        doctorId: _nextId(),
        userId: 'doc-' + Date.now().toString(36),
        firstName: f.firstName,
        middleName: f.middleName || '',
        lastName: f.lastName,
        name: (f.firstName + ' ' + f.lastName).trim(),
        email: f.email,
        phone: f.phone || '',
        role: 'Doctor',
        specialization: f.specialization || '',
        accountStatus: 'active',
        availabilityStatus: 'on_duty',
        createdAt: new Date().toISOString().split('T')[0]
      };
      DEMO.added.push(doctor);
      _save();
      return { ok: true, doctor: Object.assign({}, doctor) };
    },
    // TODO(BACKEND): PUT /doctors/:id
    updateDoctor: function (id, fields) {
      var added = DEMO.added.find(function (d) { return String(d.doctorId) === String(id); });
      if (added) {
        Object.assign(added, fields || {});
        if (fields && (fields.firstName || fields.lastName)) {
          added.name = (added.firstName + ' ' + added.lastName).trim();
        }
      } else {
        var base = DOCTORS.find(function (d) { return String(d.doctorId) === String(id); });
        if (!base) return { ok: false, error: 'not_found' };
        DEMO.overrides[base.doctorId] = Object.assign({}, DEMO.overrides[base.doctorId] || {}, fields || {});
        if (fields && (fields.firstName || fields.lastName)) {
          var eff = Object.assign({}, base, DEMO.overrides[base.doctorId]);
          DEMO.overrides[base.doctorId].name = (eff.firstName + ' ' + eff.lastName).trim();
        }
      }
      _save();
      return { ok: true, doctor: this.byId(id) };
    },
    // Account status ONLY — availability lives in setAvailability.
    // TODO(BACKEND): PATCH /doctors/:id/status (+ audit event).
    setAccountStatus: function (id, status) {
      var s = status === 'inactive' ? 'inactive' : 'active';
      return this.updateDoctor(id, { accountStatus: s });
    },
    // TODO(BACKEND): PATCH /doctors/:id/availability (+ audit event).
    setAvailability: function (id, value) {
      return this.updateDoctor(id, { availabilityStatus: normalizeAvailability(value) });
    }
  };
})(window);
