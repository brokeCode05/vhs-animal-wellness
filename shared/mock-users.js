/* ============================================================
   SHARED MOCK USERS / PETS / SERVICES — stable identity data
   One source for User, Clerk, and Doctor so owner/pet/service
   relationships are identical across portals. Domains stay
   separate and link through IDs:
     user (userId) → pets (petId → ownerId)
     appointment (userId, petId) → user + pet
   Ownership is NEVER inferred from names.

   TODO(BACKEND): Replace with get_users.php / get_pets.php and a
   services table. The helpers below keep the same call sites.
   ============================================================ */
(function (global) {
  'use strict';

  var USERS = [
    {
      userId: 1,
      name: 'Maria Santos',
      firstName: 'Maria',
      lastName: 'Santos',
      phone: '0917-123-4567',
      email: 'maria.santos@example.com',
      role: 'Pet Owner'
    },
    {
      userId: 2,
      name: 'Sam Reyes',
      firstName: 'Sam',
      lastName: 'Reyes',
      phone: '0918-222-3344',
      email: 'sam.reyes@example.com',
      role: 'Pet Owner'
    },
    {
      userId: 3,
      name: 'Jamie Cruz',
      firstName: 'Jamie',
      lastName: 'Cruz',
      phone: '0919-555-6677',
      email: 'jamie.cruz@example.com',
      role: 'Pet Owner'
    }
  ];

  // Demo identity for the User Portal (the logged-in pet owner).
  // TODO(BACKEND): comes from the authenticated session instead.
  var CURRENT_USER_ID = 1;

  // ── CANONICAL PET PROFILE CONTRACT ───────────────────────────────────
  // Base pet record exactly matches the Add/Edit Pet form fields
  // (user/index.html #petForm) — no field the form doesn't collect.
  // These 5 entries are the minimal mock seed; full clinical detail lives
  // in the portal-only EMR fixtures (user _petEmrFixtures, doctor
  // DOCTOR_EMR), keyed by petId, NEVER duplicated into this base record.
  // TODO(BACKEND): pets table via get_pets.php; shape below is the row.
  var PETS = [
    {
      petId: 1, ownerId: 1, name: 'Luna', species: 'Cat', speciesCustom: '', breed: 'Persian',
      breedCustom: '', gender: 'Female', age: 3, weightKg: 4.2, color: 'White with grey patches',
      reproductiveStatus: 'Spayed', microchipId: 'PH-001-2023-LUNA',
      allergies: 'None known yet', chronicConditions: 'None known yet', notes: 'Indoor cat. Slight sensitivity to certain flea treatments.'
    },
    {
      petId: 2, ownerId: 1, name: 'Buddy', species: 'Dog', speciesCustom: '', breed: 'Golden Retriever',
      breedCustom: '', gender: 'Male', age: 5, weightKg: 31.5, color: 'Golden blonde',
      reproductiveStatus: 'Neutered', microchipId: 'PH-002-2021-BUDD',
      allergies: 'None known yet', chronicConditions: 'Mild hip dysplasia', notes: 'Requires joint supplements. Avoid strenuous exercise.'
    },
    {
      petId: 3, ownerId: 1, name: 'Mochi', species: 'Cat', speciesCustom: '', breed: 'Siamese',
      breedCustom: '', gender: 'Male', age: 2, weightKg: 3.8, color: 'Seal point (cream body, dark face/ears/tail)',
      reproductiveStatus: 'Neutered', microchipId: '',
      allergies: 'Sensitive to poultry-based diets', chronicConditions: 'None known yet', notes: ''
    },
    { petId: 4, ownerId: 2, name: 'Max', species: 'Dog', speciesCustom: '', breed: 'Labrador retriever', breedCustom: '', gender: 'Male', age: 5, weightKg: 29, color: 'Black', reproductiveStatus: 'Intact', microchipId: '', allergies: '', chronicConditions: '', notes: '' },
    { petId: 5, ownerId: 3, name: 'Milo', species: 'Dog', speciesCustom: '', breed: 'Aspin', breedCustom: '', gender: 'Male', age: 2, weightKg: 18, color: 'Brown', reproductiveStatus: 'Neutered', microchipId: '', allergies: '', chronicConditions: '', notes: '' }
  ];
  // Field reference (frozen contract — extend only with approval):
  //   petId, ownerId (→ users.userId), name,
  //   species (Dog|Cat|Bird|Rabbit|Other), speciesCustom (when Other),
  //   breed (select), breedCustom (Other species/breed),
  //   gender (Male|Female), age (years, integer), weightKg (0.1 step),
  //   color (Color / Markings), reproductiveStatus (Intact|Spayed|Neutered|Not Sure),
  //   microchipId, allergies, chronicConditions, notes (medical notes).
  //   (pet_photo is a form-only upload asset, not profile data.)

  // ── CANONICAL SERVICE CATALOG ──────────────────────────────────────────
  // One source of truth for every portal and future Vetty responses.
  // Labels + prices mirror the public website's Services page exactly
  // (user/index.html `service-card-user` entries) — do not invent services.
  // `value` is the stored value on appointments (snake_case, stable for the
  // backend FK); `label` is what every portal displays. Stored service on
  // records may be the label too; serviceLabel() resolves both.
  // `active:false` (set via Admin) removes a service from NEW bookings only;
  // historical appointments keep their stored value/label and stay readable.
  // TODO(BACKEND): serve from a vet_services table (serviceId → FK);
  // status changes become PATCH /api/services/:id/status.
  var SERVICES = [
    // Preventive & Wellness
    { serviceId: 1,  value: 'consultation',                        label: 'Consultation',                       group: 'Preventive & Wellness', price: '₱300.00 – ₱2,000.00' },
    { serviceId: 2,  value: 'vaccination',                         label: 'Vaccination',                        group: 'Preventive & Wellness', price: 'Contact us for pricing' },
    { serviceId: 3,  value: 'deworming',                           label: 'Deworming',                          group: 'Preventive & Wellness', price: '₱300.00 – ₱1,000.00' },
    { serviceId: 4,  value: 'feline_executive_preventive_care',    label: 'Feline Executive Preventive Care',   group: 'Preventive & Wellness', price: '₱3,999.00 – ₱6,999.00' },
    { serviceId: 5,  value: 'health_certificate',                  label: 'Health Certificate',                 group: 'Preventive & Wellness', price: '₱200.00 – ₱600.00' },
    { serviceId: 6,  value: 'microchipping',                       label: 'Microchipping',                      group: 'Preventive & Wellness', price: '₱900.00' },
    // Diagnostics
    { serviceId: 7,  value: 'blood_test',                          label: 'Blood Test',                         group: 'Diagnostics',           price: '₱900.00 – ₱3,000.00' },
    { serviceId: 8,  value: 'fecalysis',                           label: 'Fecalysis',                          group: 'Diagnostics',           price: '₱350.00' },
    { serviceId: 9,  value: 'microscopy',                          label: 'Microscopy',                         group: 'Diagnostics',           price: '₱500.00' },
    { serviceId: 10, value: 'urinalysis',                          label: 'Urinalysis',                         group: 'Diagnostics',           price: '₱500.00 – ₱850.00' },
    // Surgery & Procedures
    { serviceId: 11, value: 'spay',                                label: 'Spay',                               group: 'Surgery & Procedures',  price: '₱650.00 – ₱6,000.00' },
    { serviceId: 12, value: 'castration',                          label: 'Castration',                         group: 'Surgery & Procedures',  price: '₱500.00 – ₱5,000.00' },
    { serviceId: 13, value: 'caesarean_section',                   label: 'Caesarean Section (CS)',             group: 'Surgery & Procedures',  price: '₱10,000.00 – ₱35,000.00' },
    { serviceId: 14, value: 'cystotomy',                           label: 'Cystotomy',                          group: 'Surgery & Procedures',  price: '₱4,000.00 – ₱7,000.00' },
    { serviceId: 15, value: 'cherry_eye_correction',               label: 'Cherry Eye Correction',              group: 'Surgery & Procedures',  price: '₱5,000.00 – ₱35,000.00' },
    { serviceId: 16, value: 'wound_repair',                        label: 'Wound Repair',                       group: 'Surgery & Procedures',  price: '₱1,500.00 – ₱3,000.00' },
    { serviceId: 17, value: 'dental_prophylaxis_kapon',            label: 'Dental Prophylaxis + Kapon',         group: 'Surgery & Procedures',  price: '₱2,500.00 – ₱7,500.00' },
    { serviceId: 18, value: 'u_catheterization',                   label: 'U Catheterization',                  group: 'Surgery & Procedures',  price: '₱3,500.00' },
    { serviceId: 19, value: 'euthanasia',                          label: 'Euthanasia',                         group: 'Surgery & Procedures',  price: '₱1,000.00 – ₱3,000.00' },
    { serviceId: 20, value: 'whelping_assistance',                 label: 'Whelping Assistance',                group: 'Surgery & Procedures',  price: '₱3,500.00 – ₱4,000.00' },
    // Pet Care
    { serviceId: 21, value: 'dog_grooming',                        label: 'Dog Grooming',                       group: 'Pet Care',              price: '₱100.00 – ₱1,200.00' },
    { serviceId: 22, value: 'cat_grooming',                        label: 'Cat Grooming',                       group: 'Pet Care',              price: '₱100.00 – ₱800.00' },
    { serviceId: 23, value: 'boarding',                            label: 'Boarding',                           group: 'Pet Care',              price: '₱680.00 – ₱1,380.00' },
    { serviceId: 24, value: 'confinement',                         label: 'Confinement',                        group: 'Pet Care',              price: '₱950.00 – ₱2,000.00' },
    // Specialized Care
    { serviceId: 25, value: 'chemotherapy',                        label: 'Chemotherapy',                       group: 'Specialized Care',      price: '₱1.00' },
    { serviceId: 26, value: 'home_service',                        label: 'Home Service',                       group: 'Specialized Care',      price: '₱1.00 – ₱500.00' }
  ];

  function byId(list, key, id) {
    return list.find(function (x) { return String(x[key]) === String(id); }) || null;
  }

  // ── DEMO PERSISTENCE LAYER (frontend-only, one canonical source) ──────────
  // Edits/creates made in Admin (and any future portal surface) persist in
  // localStorage so User/Clerk-Admin reads stay consistent after reload.
  // Seeds are never mutated: overrides apply on read, additions append.
  // TODO(BACKEND): Replace User/Pet profile persistence with User API calls
  // (GET/POST/PUT /users, /pets). This layer is deleted when the API lands.
  var STORE_KEY = 'vhs_mock_users_pets_v1';
  var SVC_STORE_KEY = 'vhs_mock_services_v1';
  var SVC_DEMO = (function () {
    try { return JSON.parse(localStorage.getItem(SVC_STORE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  })();
  SVC_DEMO.overrides = SVC_DEMO.overrides || {};   // serviceId → partial fields
  SVC_DEMO.added = SVC_DEMO.added || [];           // Admin-created services

  function _saveServices() {
    try { localStorage.setItem(SVC_STORE_KEY, JSON.stringify(SVC_DEMO)); } catch (e) { /* storage unavailable */ }
  }

  // Effective catalog: seeds with overrides applied, then Admin additions.
  // Canonical serviceIds/keys are never regenerated — seeds keep theirs.
  function _effectiveServices() {
    return SERVICES.map(function (s) {
      var o = SVC_DEMO.overrides[s.serviceId];
      return o ? Object.assign({}, s, o) : Object.assign({}, s);
    }).concat(SVC_DEMO.added.map(function (s) { return Object.assign({}, s); }));
  }
  var DEMO = (function () {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  })();
  DEMO.userOverrides = DEMO.userOverrides || {};
  DEMO.userAdded = DEMO.userAdded || [];
  DEMO.petOverrides = DEMO.petOverrides || {};
  DEMO.petAdded = DEMO.petAdded || [];

  function _save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DEMO)); } catch (e) { /* storage unavailable */ }
  }

  function _allUsers() {
    return USERS.map(function (u) {
      var o = DEMO.userOverrides[u.userId];
      return o ? Object.assign({}, u, o) : Object.assign({}, u);
    }).concat(DEMO.userAdded.map(function (u) { return Object.assign({}, u); }));
  }

  function _allPets() {
    return PETS.map(function (p) {
      var o = DEMO.petOverrides[p.petId];
      return o ? Object.assign({}, p, o) : Object.assign({}, p);
    }).concat(DEMO.petAdded.map(function (p) { return Object.assign({}, p); }));
  }

  function _nextId(list, key) {
    var max = 0;
    list.forEach(function (x) { var n = parseInt(x[key], 10); if (!isNaN(n) && n > max) max = n; });
    return max + 1;
  }

  global.SharedMockUsers = {
    users: function () { return _allUsers(); },
    byId: function (id) { return byId(_allUsers(), 'userId', id); },
    currentUserId: CURRENT_USER_ID,
    currentUser: function () { return Object.assign({}, byId(_allUsers(), 'userId', CURRENT_USER_ID)); },

    pets: function () { return _allPets(); },
    petById: function (id) { return byId(_allPets(), 'petId', id); },
    petsOfOwner: function (userId) {
      return _allPets().filter(function (p) { return String(p.ownerId) === String(userId); });
    },

    // ── WRITE-THROUGH (Admin-assisted / demo edits) ──────────────────────
    // TODO(BACKEND): PUT /users/:id
    updateUser: function (id, fields) {
      var added = DEMO.userAdded.find(function (u) { return String(u.userId) === String(id); });
      if (added) {
        Object.assign(added, fields || {});
      } else {
        var base = byId(USERS, 'userId', id);
        if (!base) return { ok: false, error: 'not_found' };
        DEMO.userOverrides[base.userId] = Object.assign({}, DEMO.userOverrides[base.userId] || {}, fields || {});
      }
      _save();
      return { ok: true, user: this.byId(id) };
    },
    // TODO(BACKEND): POST /users — canonical role stays "User".
    addUser: function (fields) {
      var f = fields || {};
      if (!f.firstName || !f.lastName || !f.email) return { ok: false, error: 'invalid' };
      if (_allUsers().some(function (u) { return String(u.email).toLowerCase() === String(f.email).toLowerCase(); })) {
        return { ok: false, error: 'duplicate_email' };
      }
      var user = {
        userId: _nextId(_allUsers(), 'userId'),
        firstName: f.firstName,
        lastName: f.lastName,
        middleName: f.middleName || '',
        name: (f.firstName + ' ' + f.lastName).trim(),
        phone: f.phone || '',
        email: f.email,
        address: f.address || '',
        birthdate: f.birthdate || '',
        role: 'User',
        status: 'active'
      };
      DEMO.userAdded.push(user);
      _save();
      return { ok: true, user: Object.assign({}, user) };
    },
    // TODO(BACKEND): PATCH /users/:id/status (server-side audit event too)
    setUserStatus: function (id, status) {
      var s = status === 'inactive' ? 'inactive' : 'active';
      return this.updateUser(id, { status: s });
    },
    // TODO(BACKEND): PUT /pets/:id
    updatePet: function (id, fields) {
      var added = DEMO.petAdded.find(function (p) { return String(p.petId) === String(id); });
      if (added) {
        Object.assign(added, fields || {});
      } else {
        var base = byId(PETS, 'petId', id);
        if (!base) return { ok: false, error: 'not_found' };
        DEMO.petOverrides[base.petId] = Object.assign({}, DEMO.petOverrides[base.petId] || {}, fields || {});
      }
      _save();
      return { ok: true, pet: this.petById(id) };
    },
    // TODO(BACKEND): POST /pets — ownership is ownerId (never name-matched).
    addPet: function (fields) {
      var f = fields || {};
      if (!f.name || !f.ownerId) return { ok: false, error: 'invalid' };
      if (!_allUsers().some(function (u) { return String(u.userId) === String(f.ownerId); })) {
        return { ok: false, error: 'owner_not_found' };
      }
      var pet = {
        petId: _nextId(_allPets(), 'petId'),
        ownerId: f.ownerId,
        name: f.name,
        species: f.species || '',
        speciesCustom: f.speciesCustom || '',
        breed: f.breed || '',
        breedCustom: f.breedCustom || '',
        gender: f.gender || '',
        age: f.age || 0,
        weightKg: f.weightKg || 0,
        color: f.color || '',
        reproductiveStatus: f.reproductiveStatus || '',
        microchipId: f.microchipId || '',
        allergies: f.allergies || '',
        chronicConditions: f.chronicConditions || '',
        notes: f.notes || ''
      };
      DEMO.petAdded.push(pet);
      _save();
      return { ok: true, pet: Object.assign({}, pet) };
    },

    services: function () { return _effectiveServices(); },
    // Active services only — the list every NEW booking offers.
    activeServices: function () {
      return _effectiveServices().filter(function (s) { return s.active !== false; });
    },
    serviceById: function (id) {
      var hit = _effectiveServices().find(function (s) { return String(s.serviceId) === String(id); });
      return hit ? Object.assign({}, hit) : null;
    },
    serviceByValue: function (value) {
      var v = String(value || '').trim().toLowerCase();
      var hit = _effectiveServices().find(function (s) { return s.value === v || s.label.toLowerCase() === v; });
      return hit ? Object.assign({}, hit) : null;
    },
    // True when the service value/label is referenced by any appointment.
    // TODO(BACKEND): enforced server-side with FK/integrity checks.
    serviceInUse: function (valueOrLabel) {
      if (!window.SharedMockAppointments || !window.SharedMockAppointments.getAll) return false;
      var target = String(valueOrLabel || '').toLowerCase();
      return window.SharedMockAppointments.getAll().some(function (a) {
        var stored = String(a.service || a.serviceValue || '').toLowerCase();
        return stored === target;
      });
    },
    // ── SERVICE CRUD (Admin Services page; all via this module only) ────
    // TODO(BACKEND): POST /api/services (name/price/category uniqueness,
    // validation, and audit history live server-side).
    addService: function (fields) {
      var f = fields || {};
      if (!f.label) return { ok: false, error: 'invalid' };
      var exists = _effectiveServices().some(function (s) {
        return s.label.toLowerCase() === String(f.label).toLowerCase() ||
               String(s.value) === String(f.value || '').toLowerCase();
      });
      if (exists) return { ok: false, error: 'duplicate' };
      var svc = {
        serviceId: _nextId(_effectiveServices(), 'serviceId'),
        value: f.value || String(f.label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
        label: f.label,
        group: f.group || 'Other',
        price: f.price || 'Contact us for pricing',
        active: f.active !== false
      };
      SVC_DEMO.added.push(svc);
      _saveServices();
      return { ok: true, service: Object.assign({}, svc) };
    },
    // TODO(BACKEND): PATCH /api/services/:id (label/price/category edits).
    updateService: function (id, fields) {
      var added = SVC_DEMO.added.find(function (s) { return String(s.serviceId) === String(id); });
      if (added) {
        Object.assign(added, fields || {});
      } else {
        var base = SERVICES.find(function (s) { return String(s.serviceId) === String(id); });
        if (!base) return { ok: false, error: 'not_found' };
        SVC_DEMO.overrides[base.serviceId] = Object.assign({}, SVC_DEMO.overrides[base.serviceId] || {}, fields || {});
      }
      _saveServices();
      var hit = this.serviceById(id);
      return hit ? { ok: true, service: hit } : { ok: false, error: 'not_found' };
    },
    // TODO(BACKEND): PATCH /api/services/:id/status — inactive services
    // disappear from new booking only; history keeps its stored value.
    setServiceStatus: function (id, active) {
      return this.updateService(id, { active: active !== false });
    },
    // Hard delete only for Admin-created, appointment-unused services.
    // Canonical seed services are never deletable (referential safety).
    deleteService: function (id) {
      var idx = SVC_DEMO.added.findIndex(function (s) { return String(s.serviceId) === String(id); });
      if (idx === -1) return { ok: false, error: 'not_deletable' };
      if (this.serviceInUse(SVC_DEMO.added[idx].value) || this.serviceInUse(SVC_DEMO.added[idx].label)) {
        return { ok: false, error: 'in_use' };
      }
      SVC_DEMO.added.splice(idx, 1);
      _saveServices();
      return { ok: true };
    },
    _resetServices: function () {
      try { localStorage.removeItem(SVC_STORE_KEY); } catch (e) { /* ignore */ }
    },
    // Deletable = Admin-created AND not referenced by any appointment.
    canDeleteService: function (id) {
      var added = SVC_DEMO.added.some(function (s) { return String(s.serviceId) === String(id); });
      if (!added) return false;
      var svc = this.serviceById(id);
      return svc ? !(this.serviceInUse(svc.value) || this.serviceInUse(svc.label)) : false;
    },
    // Resolve ANY stored form (value, label, or legacy variant) to the
    // canonical label every portal displays.
    serviceLabel: function (value) {
      if (!value) return '';
      var v = String(value).trim();
      var hit = SERVICES.find(function (s) { return s.label === v || s.value === v.toLowerCase(); });
      if (hit) return hit.label;
      // Accept known legacy variants and map to the canonical label.
      var alias = {
        'general consultation': 'Consultation',
        'general consult': 'Consultation',
        'consultation — limping': 'Consultation',
        'consultation — skin irritation': 'Consultation',
        'annual check-up': 'Consultation',
        'wellness examination': 'Consultation',
        'emergency assessment': 'Consultation',
        'vaccination — rabies': 'Vaccination',
        'vaccination — fvrcp booster': 'Vaccination',
        'rabies vaccination': 'Vaccination',
        'vaccination': 'Vaccination',
        'blood test — cbc': 'Blood Test',
        'blood test': 'Blood Test',
        'dental prophylaxis': 'Dental Prophylaxis + Kapon',
        'dental prophylaxis + kapon': 'Dental Prophylaxis + Kapon',
        'grooming + nail trim': 'Dog Grooming',
        'spay & neuter': 'Spay',
        'boarding & confinement': 'Boarding',
        'dog & cat grooming': 'Dog Grooming',
        'pet microchipping': 'Microchipping'
      };
      var k = v.toLowerCase();
      return alias[k] || v;
    },
    // Canonical stored value for new records (what the backend FK expects).
    serviceValue: function (value) {
      var hit = this.serviceByValue(value) || SERVICES.find(function (s) { return s.label === value; });
      return hit ? hit.value : String(value || '');
    }
  };
})(window);
