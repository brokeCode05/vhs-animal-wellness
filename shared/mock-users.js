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
  // TODO(BACKEND): serve from a vet_services table (serviceId → FK).
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

  global.SharedMockUsers = {
    users: function () { return USERS.map(function (u) { return Object.assign({}, u); }); },
    byId: function (id) { var u = byId(USERS, 'userId', id); return u ? Object.assign({}, u) : null; },
    currentUserId: CURRENT_USER_ID,
    currentUser: function () { return Object.assign({}, byId(USERS, 'userId', CURRENT_USER_ID)); },

    pets: function () { return PETS.map(function (p) { return Object.assign({}, p); }); },
    petById: function (id) { var p = byId(PETS, 'petId', id); return p ? Object.assign({}, p) : null; },
    petsOfOwner: function (userId) {
      return PETS.filter(function (p) { return String(p.ownerId) === String(userId); })
        .map(function (p) { return Object.assign({}, p); });
    },

    services: function () { return SERVICES.map(function (s) { return Object.assign({}, s); }); },
    serviceById: function (id) { return byId(SERVICES, 'serviceId', id) ? Object.assign({}, byId(SERVICES, 'serviceId', id)) : null; },
    serviceByValue: function (value) {
      var v = String(value || '').trim().toLowerCase();
      var hit = SERVICES.find(function (s) { return s.value === v || s.label.toLowerCase() === v; });
      return hit ? Object.assign({}, hit) : null;
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
