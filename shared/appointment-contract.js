/* ============================================================
   APPOINTMENT CONTRACT — shared frontend model + mappers
   One canonical shape for User / Clerk / Doctor so the upcoming
   Clerk Check-In workflow can rely on stable field names.

   Domains stay separate: appointment ↔ pet/EMR ↔ consultation,
   linked by IDs. This file must stay framework-free.
   Exposes: window.AppointmentContract
     .normalizeStatus(legacyStatus) -> canonical status
     .fromLegacy(source)            -> canonical appointment|null
     .toLegacyDisplay(appt)         -> snake_case row for renderers
   ============================================================ */
(function (global) {
  'use strict';

  // Canonical frontend lifecycle. Legacy values map in normalizeStatus.
  var STATUSES = ['pending', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'canceled', 'no_show', 'rescheduled'];

  function normalizeStatus(value) {
    var s = String(value || '').toLowerCase().trim();
    if (!s) return 'pending';
    if (s === 'approved' || s === 'scheduled' || s === 'confirmed') return 'confirmed';
    if (s === 'cancelled') return 'canceled';
    if (s === 'in-consultation' || s === 'in consultation') return 'in_consultation';
    if (s === 'checked-in' || s === 'checked in') return 'checked_in';
    if (STATUSES.indexOf(s) !== -1) return s;
    return 'pending';
  }

  function firstDefined() {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    }
    return null;
  }

  function timeToHHMM(value) {
    var t = String(value || '').trim();
    var m24 = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m24) return (m24[1].length === 1 ? '0' + m24[1] : m24[1]) + ':' + m24[2];
    var m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (m12) {
      var hours = parseInt(m12[1], 10) % 12;
      if (/pm/i.test(m12[3])) hours += 12;
      return (hours < 10 ? '0' + hours : String(hours)) + ':' + m12[2];
    }
    return t || null;
  }

  // Map any current source (backend row, user mock, doctor fixture) into the
  // canonical appointment. Missing fields stay null — never invented.
  // TODO(BACKEND): Replace mapper sources with the API response fields.
  function fromLegacy(src) {
    if (!src) return null;
    var pet = src.pet || {};
    var owner = src.owner || {};
    var appointment = {
      appointmentId: firstDefined(src.appointmentId, src.appointment_id, src.id),
      referenceNo: firstDefined(src.referenceNo, src.reference_no),
      userId: firstDefined(src.userId, src.user_id, (src.pet && src.pet.ownerId), (src.pet && src.pet.owner_id)) || null,
      petId: firstDefined(src.petId, src.pet_id) || null,
      assignedVetId: firstDefined(src.assignedVetId, src.assigned_vet_id, src.staffId, src.staff_id),
      service: firstDefined(src.service, src.vet_service) || '',
      appointmentDate: firstDefined(src.appointmentDate, src.appointment_date, src.date) || null,
      appointmentTime: timeToHHMM(firstDefined(src.appointmentTime, src.appointment_time, src.time)),
      visitContext: firstDefined(src.visitContext, src.visit_reason, src.visitReason) || '',
      notes: firstDefined(src.notes, src.note) || '',
      status: normalizeStatus(firstDefined(src.status)),
      checkedInAt: firstDefined(src.checkedInAt, src.checked_in_at),
      consultationStartedAt: firstDefined(src.consultationStartedAt, src.startedAt, src.started_at),
      consultationCompletedAt: firstDefined(src.consultationCompletedAt, src.completedAt, src.completed_at),
      owner: {
        name: firstDefined(owner.name, src.owner_name, src.ownerName) || '',
        phone: firstDefined(owner.phone, src.owner_phone, src.ownerPhone) || ''
      },
      pet: {
        name: firstDefined(pet.name, src.pet_name, src.petName) || '',
        species: firstDefined(pet.species, pet.type, src.pet_type, src.species) || '',
        breed: firstDefined(pet.breed, src.pet_breed, src.breed) || ''
      }
    };
    return appointment;
  }

  // Snake_case projection for existing renderers (Clerk table, User cards)
  // so they can adopt the contract without changing their templates.
  function toLegacyDisplay(appt) {
    if (!appt) return {};
    return {
      id: appt.appointmentId,
      reference_no: appt.referenceNo,
      user_id: appt.userId,
      pet_id: appt.petId,
      staff_id: appt.assignedVetId,
      service: appt.service,
      date: appt.appointmentDate,
      time: appt.appointmentTime,
      notes: appt.notes,
      status: appt.status,
      // Lifecycle timestamps ride along so renderers can show them without
      // touching the canonical model.
      checked_in_at: appt.checkedInAt,
      consultation_started_at: appt.consultationStartedAt,
      consultation_completed_at: appt.consultationCompletedAt,
      owner_name: appt.owner.name,
      owner_phone: appt.owner.phone,
      pet_name: appt.pet.name,
      pet_type: appt.pet.species,
      pet_breed: appt.pet.breed,
      visit_reason: appt.visitContext
    };
  }

  global.AppointmentContract = {
    STATUSES: STATUSES,
    normalizeStatus: normalizeStatus,
    fromLegacy: fromLegacy,
    toLegacyDisplay: toLegacyDisplay,
    timeToHHMM: timeToHHMM,
    // Canonical 24h HH:MM -> display 12h with AM/PM (e.g. 15:30 -> 3:30 PM).
    // Input that is already 12h passes through unchanged.
    timeTo12h: function (value) {
      var t = String(value || '').trim();
      var m = t.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return t || '';
      var h = parseInt(m[1], 10);
      var suffix = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + m[2] + ' ' + suffix;
    }
  };
})(window);
