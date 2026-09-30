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

   DEMO DATA: while the demo seed below ships, an EMPTY store is
   seeded with ONE finalized Consultation Summary (existing seed
   appointment apt305 — Mochi, Maria Santos, VHS-20260912-M7N8O9)
   so My Documents / Admin Documents are demonstrable before any
   live completion. See _seedDemoData() for scope and removal notes.

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

  // ── DEMO DATA (frontend-only; marked in comments only, never in the UI) ──
  // The documents store has NO seed history by design: documents come into
  // existence only when the Doctor completes a consultation (doctor.js
  // completion handler → finalizeFromConsultation). Completed appointments
  // that predate the Phase 5 documents feature carry no consultation data
  // and therefore show no documents — that is expected, not a regression.
  //
  // For the advisor demo we inject ONE finalized Consultation Summary for
  // the existing seed appointment apt305 (2026-09-12 Vaccination, Mochi /
  // Maria Santos, ref VHS-20260912-M7N8O9) with real structured content
  // (vitals, assessment, plan). No SOAP narrative (subjective/objective) is
  // stored — those stay Doctor-only, exactly like live completions. No
  // prescription/lab documents because the demo record has none ordered.
  // IDs/references reuse apt305's own; nothing new is invented.
  // TODO(BACKEND): delete with this file when the Documents API lands —
  // documents are then created server-side inside the completion
  // transaction and no retroactive seeding exists there either.
  var DEMO_SEED_DOC = {
    type: 'consultation_summary',
    appointmentId: 'apt305',
    referenceNo: 'VHS-20260912-M7N8O9',
    userId: '1', // Maria Santos — matches the apt305 seed in mock-appointments.js
    petId: '1', // apt305's pet reference (historical snapshot; pet seeds now list Mochi as petId 3)
    petName: 'Mochi',
    ownerName: 'Maria Santos',
    service: 'Vaccination',
    veterinarian: { name: 'Dr. Santos', role: 'Veterinarian' },
    issuedAt: '2026-09-12T11:25:00',
    data: {
      date: '12 Sep 2026', // doctor.js dateDisplay format for 2026-09-12
      time: '11:00',
      startedAt: '2026-09-12T11:02:00',
      completedAt: '2026-09-12T11:25:00',
      durationMinutes: 23,
      weight: '3.8',
      temperature: '38.7',
      heartRate: '168',
      assessment: 'Alert and active Siamese cat. Vaccination site healthy, no adverse reaction observed. Body condition and vitals within normal range.',
      plan: 'Annual rabies booster administered. Monitor the injection site for swelling for 3 days. Next vaccination due September 2027.'
    }
  };

  // Injects the demo document ONLY into an empty store, so a presenter never
  // sees duplicates and every live-completed document is kept as-is. Two
  // guards work together because add() has no store-level dedupe: this
  // empty-store guard, and finalizeFromConsultation refusing re-finalization
  // while the demo seed occupies an appointment (normally the Doctor portal's
  // completion guard is the only double-finalization protection).
  // Removal: delete DEMO_SEED_DOC, _seedDemoData, the bootstrap call and the
  // demo-guard clause in finalizeFromConsultation.
  function _seedDemoData() {
    var demoInStore = _read().filter(function (d) { return d.demoSeeded === true; });
    if (demoInStore.length) {
      // Store already carries the demo record (e.g. right after a
      // clearDemoData wipe on a page that is already loaded) — keep it;
      // live-completed documents are never removed here.
      return;
    }
    var seeded = SharedDocuments.add(DEMO_SEED_DOC);
    if (seeded) {
      // add() stamps issuedAt with "now"; the demo record keeps its
      // historical issue date (the consultation completion moment), and
      // demoSeeded marks it for the re-finalization guard above.
      seeded.issuedAt = DEMO_SEED_DOC.issuedAt;
      seeded.demoSeeded = true;
      _write([seeded]);
    }
  }

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
      // Demo guard: while the demo seed occupies an appointment, a second
      // finalization for it would duplicate the seeded document (add() has
      // no store-level dedupe). Normal appointments are untouched.
      if (_read().some(function (d) { return d.demoSeeded && String(d.appointmentId) === String(appointmentRecord.appointmentId); })) return [];
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

    // Wipes all documents. While the demo seed ships, an empty store is
    // re-seeded with the demo Consultation Summary on the next page load.
    clearDemoData: function () { _write([]); }
  };

  // First read after a fresh browser profile injects the demo record
  // (empty store only — see _seedDemoData).
  if (_read().length === 0) _seedDemoData();

  global.SharedDocuments = SharedDocuments;
})(window);
