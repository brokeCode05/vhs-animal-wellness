/* ============================================================
   SHARED MOCK APPOINTMENTS — canonical contract shape
   One dataset consumed by User, Clerk, and Doctor so the three
   portals render the SAME records during frontend testing.

   TODO(BACKEND): Replace with get_appointments.php (which must
   return reference_no) — the mappers in appointment-contract.js
   already consume this shape either way.

   Scenario: today's clinic day is 2026-09-26.
   The trace appointment is apt301 (Luna, checked_in) — it must
   appear with identical identifiers in all three portals.
   ============================================================ */
(function (global) {
  'use strict';

  var MOCK_APPOINTMENTS = [
    {
      appointmentId: 'apt301', referenceNo: 'VHS-20260926-A1B2C3',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'General Consultation',
      appointmentDate: '2026-09-26', appointmentTime: '09:00',
      visitContext: 'Owner reports reduced appetite and repeated vomiting since yesterday.',
      notes: '', status: 'checked_in', checkedInAt: '2026-09-26T08:42:00',
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Luna', species: 'Cat', breed: 'Persian' }
    },
    {
      appointmentId: 'apt302', referenceNo: 'VHS-20260926-D4E5F6',
      userId: 2, petId: 2, assignedVetId: 2,
      service: 'Emergency assessment',
      appointmentDate: '2026-09-26', appointmentTime: '09:30',
      visitContext: 'Owner reports difficulty breathing since early morning.',
      notes: '', status: 'checked_in', checkedInAt: '2026-09-26T08:55:00',
      owner: { name: 'Sam Reyes', phone: '0918-222-3344' },
      pet: { name: 'Max', species: 'Dog', breed: 'Labrador retriever' }
    },
    {
      appointmentId: 'apt303', referenceNo: 'VHS-20260926-G7H8I9',
      userId: 3, petId: 3, assignedVetId: 2,
      service: 'Wellness examination',
      appointmentDate: '2026-09-26', appointmentTime: '10:00',
      visitContext: 'Scheduled wellness visit; owner reports no current concerns.',
      notes: '', status: 'confirmed', checkedInAt: null,
      owner: { name: 'Jamie Cruz', phone: '0919-555-6677' },
      pet: { name: 'Milo', species: 'Dog', breed: 'Aspin' }
    },
    {
      appointmentId: 'apt304', referenceNo: 'VHS-20260926-J4K5L6',
      userId: 2, petId: 4, assignedVetId: 3,
      service: 'Grooming',
      appointmentDate: '2026-09-26', appointmentTime: '15:30',
      visitContext: 'Full groom package.',
      notes: '', status: 'confirmed', checkedInAt: null,
      owner: { name: 'Sam Reyes', phone: '0918-222-3344' },
      pet: { name: 'Buddy', species: 'Dog', breed: 'Golden Retriever' }
    },
    // Past record so User "history" and Clerk completed filters have data.
    {
      appointmentId: 'apt305', referenceNo: 'VHS-20260912-M7N8O9',
      userId: 1, petId: 1, assignedVetId: 2,
      service: 'Vaccination — Rabies',
      appointmentDate: '2026-09-12', appointmentTime: '11:00',
      visitContext: 'Annual rabies booster.',
      notes: '', status: 'completed',
      consultationStartedAt: '2026-09-12T11:02:00',
      consultationCompletedAt: '2026-09-12T11:25:00',
      owner: { name: 'Maria Santos', phone: '0917-123-4567' },
      pet: { name: 'Luna', species: 'Cat', breed: 'Persian' }
    }
  ];

  // Portal-only extras must NOT collide with shared appointment IDs.
  // (User keeps its own historical fixtures locally; Doctor keeps EMR
  // history and consultation records keyed by petId/appointmentId.)

  global.SharedMockAppointments = {
    today: '2026-09-26',
    all: function () { return MOCK_APPOINTMENTS.slice(); },
    byId: function (id) { return MOCK_APPOINTMENTS.find(function (a) { return String(a.appointmentId) === String(id); }) || null; },
    byReference: function (ref) { return MOCK_APPOINTMENTS.find(function (a) { return a.referenceNo === ref; }) || null; },
    todays: function () { return MOCK_APPOINTMENTS.filter(function (a) { return a.appointmentDate === '2026-09-26'; }); }
  };
})(window);
