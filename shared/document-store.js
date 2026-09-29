/* ============================================================
   DOCUMENT STORE — shared frontend-demo document layer (Phase 5)

   Holds FINALIZED, client-facing documents only:
     Consultation Summary, Prescription, Lab Request, Lab Result,
     Receipt. Internal SOAP narrative notes are NOT stored here and
     never leave the Doctor portal.

   Documents are generated when the Doctor finalizes a consultation
   (complete). Admin Documents lists them; a User sees only documents
   belonging to their own appointments/pets — no cross-user leakage.

   Persistence: browser localStorage inside THIS module only.
   Portal files never touch localStorage for documents.

   TODO(BACKEND): Replace document demo persistence with document
   API/storage (GET /documents?user_id= / ?pet_id= / ?appointment_id=,
   server-side PDF generation). The backend is authoritative.
   ============================================================ */
(function (global) {
  'use strict';

  var STORE_KEY = 'vhs_documents_v1';
  var MAX_DOCS = 500; // demo safety valve

  var DOC_TYPES = ['consultation_summary', 'prescription', 'lab_request', 'lab_result', 'receipt'];
  var TYPE_LABELS = {
    consultation_summary: 'Consultation Summary',
    prescription: 'Prescription',
    lab_request: 'Lab Request',
    lab_result: 'Lab Result',
    receipt: 'Receipt'
  };

  function _read() {
    try {
      var raw = global.localStorage.getItem(STORE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function _write(list) {
    try { global.localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  }
  function _nextId(list) {
    var max = 0;
    list.forEach(function (d) {
      var m = /^doc-(\d+)$/.exec(String(d.docId || ''));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'doc-' + String(max + 1).padStart(4, '0');
  }
  function _clean(v) { return v === undefined || v === null ? '' : String(v); }

  var SharedDocuments = {
    typeLabel: function (type) { return TYPE_LABELS[type] || type; },

    getAll: function () { return _read().slice(); }, // newest first

    forUser: function (userId) {
      return _read().filter(function (d) { return String(d.userId) === String(userId); });
    },

    forPet: function (petId) {
      return _read().filter(function (d) { return String(d.petId) === String(petId); });
    },

    forAppointment: function (appointmentId) {
      return _read().filter(function (d) { return String(d.appointmentId) === String(appointmentId); });
    },

    byId: function (docId) {
      return _read().find(function (d) { return String(d.docId) === String(docId); }) || null;
    },

    // Internal write path (module use). External callers go through
    // finalizeFromConsultation() so client-facing scoping stays consistent.
    add: function (doc) {
      if (!doc || DOC_TYPES.indexOf(doc.type) === -1 || !doc.appointmentId) return null;
      var list = _read();
      var entry = {
        docId: _nextId(list),
        type: doc.type,
        status: 'finalized',
        appointmentId: _clean(doc.appointmentId),
        referenceNo: _clean(doc.referenceNo),
        userId: _clean(doc.userId),
        petId: _clean(doc.petId),
        petName: _clean(doc.petName),
        ownerName: _clean(doc.ownerName),
        service: _clean(doc.service),
        veterinarian: doc.veterinarian ? { name: _clean(doc.veterinarian.name), role: _clean(doc.veterinarian.role) } : null,
        issuedAt: new Date().toISOString(),
        data: doc.data && typeof doc.data === 'object' ? doc.data : {}
      };
      list.unshift(entry);
      if (list.length > MAX_DOCS) list.length = MAX_DOCS;
      _write(list);
      return entry;
    },

    // Derives client-facing documents from a finalized consultation object
    // (Doctor portal's buildConsultation output) plus the canonical
    // appointment record for ownership scoping.
    // TODO(BACKEND): the consultation endpoint performs this fan-out
    // server-side inside the completion transaction.
    finalizeFromConsultation: function (consultation, appointmentRecord) {
      if (!consultation || !appointmentRecord) return [];
      var created = [];
      var base = {
        appointmentId: appointmentRecord.appointmentId,
        referenceNo: appointmentRecord.referenceNo,
        userId: appointmentRecord.userId,
        petId: appointmentRecord.petId,
        petName: (appointmentRecord.pet && appointmentRecord.pet.name) || consultation.patient.name,
        ownerName: (appointmentRecord.owner && appointmentRecord.owner.name) || consultation.patient.owner,
        service: (appointmentRecord.service) || consultation.appointment.service,
        veterinarian: consultation.veterinarian
      };
      // Consultation Summary — client-facing: vitals, assessment, plan.
      // Raw subjective/objective SOAP narrative stays Doctor-only.
      created.push(this.add(Object.assign({}, base, {
        type: 'consultation_summary',
        data: {
          date: consultation.appointment.dateDisplay || consultation.appointment.date,
          time: consultation.appointment.time,
          startedAt: consultation.startedAt,
          completedAt: consultation.completedAt,
          durationMinutes: consultation.duration,
          weight: consultation.soap.weight,
          temperature: consultation.soap.temperature,
          heartRate: consultation.soap.heartRate,
          assessment: consultation.soap.assessment,
          plan: consultation.soap.plan
        }
      })));
      // Prescription — only when medicines were ordered.
      if (consultation.prescriptions && consultation.prescriptions.length) {
        created.push(this.add(Object.assign({}, base, { type: 'prescription', data: { medicines: consultation.prescriptions } })));
      }
      // Lab Request — only when tests were requested.
      if (consultation.labRequests && consultation.labRequests.length) {
        created.push(this.add(Object.assign({}, base, { type: 'lab_request', data: { tests: consultation.labRequests } })));
      }
      return created;
    },

    clearDemoData: function () { _write([]); }
  };

  global.SharedDocuments = SharedDocuments;
})(window);
