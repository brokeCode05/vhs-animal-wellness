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

  var PETS = [
    { petId: 1, ownerId: 1, name: 'Luna',   species: 'Cat', breed: 'Persian' },
    { petId: 2, ownerId: 1, name: 'Buddy',  species: 'Dog', breed: 'Golden Retriever' },
    { petId: 3, ownerId: 1, name: 'Mochi',  species: 'Cat', breed: 'Siamese' },
    { petId: 4, ownerId: 2, name: 'Max',    species: 'Dog', breed: 'Labrador retriever' },
    { petId: 5, ownerId: 3, name: 'Milo',   species: 'Dog', breed: 'Aspin' }
  ];

  // One canonical service catalog. The value is the label used everywhere
  // (booking forms, tables, queue) so no variants like "Consultation" vs
  // "General Consultation" can appear.
  // TODO(BACKEND): serve from a vet_services table; ids become FKs.
  var SERVICES = [
    { serviceId: 1,  label: 'General Consultation',               group: 'Preventive & Wellness' },
    { serviceId: 2,  label: 'Vaccination — Rabies',               group: 'Preventive & Wellness' },
    { serviceId: 3,  label: 'Vaccination — FVRCP Booster',        group: 'Preventive & Wellness' },
    { serviceId: 4,  label: 'Deworming',                          group: 'Preventive & Wellness' },
    { serviceId: 5,  label: 'Feline Executive Preventive Care',   group: 'Preventive & Wellness' },
    { serviceId: 6,  label: 'Health Certificate',                 group: 'Preventive & Wellness' },
    { serviceId: 7,  label: 'Microchipping',                      group: 'Preventive & Wellness' },
    { serviceId: 8,  label: 'Blood Test — CBC',                   group: 'Diagnostics' },
    { serviceId: 9,  label: 'Fecalysis',                          group: 'Diagnostics' },
    { serviceId: 10, label: 'Microscopy',                         group: 'Diagnostics' },
    { serviceId: 11, label: 'Urinalysis',                         group: 'Diagnostics' },
    { serviceId: 12, label: 'Dental Prophylaxis',                 group: 'Surgery & Procedures' },
    { serviceId: 13, label: 'Dog Grooming',                       group: 'Pet Care' },
    { serviceId: 14, label: 'Cat Grooming',                       group: 'Pet Care' },
    { serviceId: 15, label: 'Boarding',                           group: 'Pet Care' },
    { serviceId: 16, label: 'Emergency assessment',               group: 'Specialized Care' },
    { serviceId: 17, label: 'Wellness examination',               group: 'Specialized Care' }
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
    serviceLabel: function (value) {
      if (!value) return '';
      var v = String(value).trim();
      var hit = SERVICES.find(function (s) { return s.label === v; });
      if (hit) return hit.label;
      // Accept known legacy variants and map to the canonical label.
      var alias = {
        'consultation': 'General Consultation',
        'general consult': 'General Consultation',
        'dog grooming': 'Dog Grooming',
        'cat grooming': 'Cat Grooming',
        'rabies vaccination': 'Vaccination — Rabies',
        'vaccination': 'Vaccination — Rabies'
      };
      var k = v.toLowerCase();
      return alias[k] || v;
    }
  };
})(window);
