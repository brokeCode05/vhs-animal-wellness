/* ============================================================
   CLINICAL MOCK BOUNDARY — Doctor EMR + consultation drafts

   WHY THIS EXISTS
   The Doctor portal used to own its clinical data directly: a
   hardcoded per-pet EMR object and an in-memory `Map` of
   consultation drafts. That put clinical persistence inside a
   UI file, lost every SOAP entry on reload, and made an API
   cutover a rewrite of doctor.js.

   This module is the seam the Doctor portal now calls. It is a
   REPLACEABLE MOCK of a future clinical service — deliberately
   thin, and deliberately not a clinical schema.

   ARCHITECTURE
     doctor.js → SharedMockClinical → (localStorage now / API later)

   localStorage lives ONLY inside this module, exactly as it does
   for SharedMockAppointments / SharedMockUsers / SharedMockDoctors.

   KEY IDS
     petId         — shared catalog id (shared/mock-users.js)
     appointmentId — shared appointment id (shared/appointment-contract.js)
     Drafts are keyed by appointmentId, NOT petId: one pet can have
     several visits and each visit owns its own record.

   DRAFT vs FINALIZED
     A draft is mutable working state for ONE appointment. It is
     discarded on completion by the caller, not promoted here.
     Promotion to a durable clinical record is a backend concept
     and is deliberately NOT modelled here.

   NO AI. This module stores what a clinician typed. It does not
   generate, infer, summarise or diagnose anything.

   TODO(BACKEND): replace with the clinical service. See
   docs/VHS_CLINICAL_CONTRACT.md. No endpoint URLs are committed
   here — the shapes below are proposals, not decisions.
   ============================================================ */
(function (global) {
  'use strict';

  var EMR_KEY = 'vhs_mock_clinical_emr_v1';
  var DRAFT_KEY = 'vhs_mock_consultation_drafts_v1';
  var MAX_DRAFTS = 500; // demo safety valve, matching the other stores

  // ── storage (encapsulated; nothing outside this module touches these) ──
  function _read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) || fallback) : fallback;
    } catch (e) { return fallback; }
  }
  function _write(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { /* storage unavailable */ }
  }

  // ── EMR fixture (demo clinical history, keyed by shared petId) ─────────
  // Owned here now, not in doctor.js. PetIds are the shared catalog's:
  // 1 Luna, 2 Buddy, 3 Mochi, 4 Max, 5 Milo. Ownership is never inferred
  // from names — it lives in the shared pet records.
  var EMR_SEED = {
    1: {
      pet_age: '3 years',
      ai_triage: 'Urgent',
      ai_summary: 'Vomiting and reduced appetite over 24 hours in a young adult cat. Same-day assessment recommended; check hydration and consider dietary history.',
      visits: [
        { date: '2026-06-12', title: 'Veterinary note', note: 'Routine examination recorded; owner reported normal appetite and activity.' },
        { date: '2026-03-10', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    2: {
      pet_age: '5 years',
      ai_triage: 'Emergency',
      ai_summary: 'Acute breathing difficulty in a middle-aged dog. Immediate veterinarian evaluation required; prepare for possible oxygen support and thoracic imaging.',
      visits: [
        { date: '2026-07-21', title: 'Veterinary note', note: 'Follow-up examination recorded; no new concerns reported at that visit.' },
        { date: '2026-02-05', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    3: {
      pet_age: '2 years',
      ai_triage: 'Routine',
      ai_summary: 'Young adult dog presenting for routine wellness examination; no reported concerns. Review vaccination schedule and weight trend.',
      visits: []
    },
    4: {
      pet_age: '5 years',
      ai_triage: 'Emergency',
      ai_summary: 'Acute breathing difficulty in a middle-aged dog. Immediate veterinarian evaluation required; prepare for possible oxygen support and thoracic imaging.',
      visits: [
        { date: '2026-07-21', title: 'Veterinary note', note: 'Follow-up examination recorded; no new concerns reported at that visit.' },
        { date: '2026-02-05', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    5: {
      pet_age: '2 years',
      ai_triage: 'Routine',
      ai_summary: 'Young adult dog presenting for routine wellness examination; no reported concerns. Review vaccination schedule and weight trend.',
      visits: []
    }
  };

  function _emrOverrides() { return _read(EMR_KEY, {}); }

  function getEmr(petId) {
    var key = String(petId);
    var over = _emrOverrides()[key];
    var seed = EMR_SEED[key] || null;
    var base = seed || { pet_age: '', ai_triage: 'Routine', ai_summary: '', visits: [] };
    var merged = Object.assign({}, base, over || {});
    // visits is an array — never let an override replace it with a scalar.
    merged.visits = Array.isArray(merged.visits) ? merged.visits.slice() : [];
    return merged;
  }

  function saveEmr(petId, patch) {
    var all = _emrOverrides();
    var key = String(petId);
    all[key] = Object.assign({}, all[key] || {}, patch || {});
    _write(EMR_KEY, all);
    return getEmr(petId);
  }

  // Clinical history for one pet. Always an array; never null, never invented.
  function getClinicalHistory(petId) {
    return getEmr(petId).visits;
  }

  // ── consultation drafts (mutable working state, keyed by appointmentId) ─
  function emptyMedicine() {
    return {
      medicine: '', dosageValue: '', dosageUnit: '', dosageCustom: '',
      frequencyPattern: '', frequencyEvery: '', frequencyCustom: '',
      duration: '', instructions: ''
    };
  }

  function _newDraft() {
    var now = new Date().toISOString();
    return {
      fields: {}, medicines: [emptyMedicine()], labs: [], reviewed: false,
      saved: false, startedAt: null, completedAt: null, durationMinutes: null,
      createdAt: now, updatedAt: now
    };
    // NOTE: no `status` field. Appointment status is canonical and lives in
    // SharedMockAppointments; a draft must never carry a competing copy.
  }

  function _drafts() {
    var list = _read(DRAFT_KEY, {});
    return (list && typeof list === 'object' && !Array.isArray(list)) ? list : {};
  }

  // Returns a COPY, so a caller mutating what it got back cannot silently
  // change stored state without going through saveConsultationDraft().
  function getConsultationDraft(appointmentId) {
    var found = _drafts()[String(appointmentId)];
    if (!found) return null;
    return JSON.parse(JSON.stringify(found));
  }

  // Returns the stored draft, or a fresh one (the caller never has to null-check).
  function ensureConsultationDraft(appointmentId) {
    var existing = getConsultationDraft(appointmentId);
    if (existing) return existing;
    var fresh = _newDraft();
    saveConsultationDraft(appointmentId, {});
    return fresh;
  }

  function saveConsultationDraft(appointmentId, patch) {
    var all = _drafts();
    var key = String(appointmentId);
    var current = all[key] || _newDraft();
    var next = Object.assign({}, current, patch || {}, { updatedAt: new Date().toISOString() });
    // Arrays must stay arrays across a round-trip through storage.
    if (!Array.isArray(next.medicines)) next.medicines = [emptyMedicine()];
    if (!Array.isArray(next.labs)) next.labs = [];
    if (!next.fields || typeof next.fields !== 'object') next.fields = {};
    all[key] = next;
    _write(DRAFT_KEY, all);
    return JSON.parse(JSON.stringify(next));
  }

  // Called when a consultation is completed — the working state is no longer
  // meaningful once the visit is closed.
  function clearConsultationDraft(appointmentId) {
    var all = _drafts();
    delete all[String(appointmentId)];
    _write(DRAFT_KEY, all);
  }

  global.SharedMockClinical = {
    identityMode: 'mock',

    getEmr: getEmr,
    saveEmr: saveEmr,
    getClinicalHistory: getClinicalHistory,

    getConsultationDraft: getConsultationDraft,
    ensureConsultationDraft: ensureConsultationDraft,
    saveConsultationDraft: saveConsultationDraft,
    clearConsultationDraft: clearConsultationDraft,

    emptyMedicine: emptyMedicine
  };
})(window);