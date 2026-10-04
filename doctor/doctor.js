/* Doctor Portal workflow. UI renders from mapAppointment() output only. */

// ─── SHARED PRESCRIPTION CONSTANTS ─────────────────────────────────────────
// These live in script scope, not inside either IIFE, because BOTH of them
// need them: the workflow IIFE builds the structured dosage/frequency
// controls, and the validation IIFE reads those controls back to decide what
// is incomplete. Keeping one definition means the controls on screen and the
// rules that judge them can never disagree about the allowed vocabulary.
//
// Dosage and Frequency used to be single free-text boxes, which made the two
// most common prescribing slips easy to type: an amount with no unit, or a
// frequency with no interval. Both are now structured. The lists below are a
// CONVENIENCE, never a constraint — "Other / Custom" is always offered so any
// legitimate veterinary instruction can still be entered verbatim.
const DOSAGE_UNITS = ['tablet', 'capsule', 'mL', 'mg', 'mg/kg', 'drop', 'scoop'];
const FREQUENCY_PATTERNS = [
  ['every_hours', 'Every [__] hours'],
  ['times_per_day', '[__] times per day'],
  ['every_days', 'Every [__] days'],
  ['once_daily', 'Once daily'],
  ['as_needed', 'As needed'],
  ['custom', 'Other / Custom'],
];
// Patterns that need a number beside them; the rest stand alone.
const INTERVAL_PATTERNS = new Set(['every_hours', 'times_per_day', 'every_days']);
// Sentinel values for the two selects' "nothing chosen yet" option.
const CHOOSE_UNIT = 'unit';
const CHOOSE_PATTERN = 'pattern';
// Caps for the free-text parts of a prescription. maxlength covers typing and
// paste; the gate re-checks them because maxlength never constrains a value
// that was assigned programmatically.
const MEDICINE_LIMITS = { medicine: 100, frequency: 50, instructions: 500 };

(() => {
  'use strict';

  // ─── DATA DOMAINS (kept separate on purpose) ──────────────────────────────
  // 1. Shared appointment records: window.SharedMockAppointments (loaded via
  //    shared/mock-appointments.js) — the SAME canonical dataset the User and
  //    Clerk portals render, normalized through appointment-contract.js.
  // 2. Pet/EMR + consultation drafts: window.SharedMockClinical (loaded via
  //    shared/mock-clinical.js), keyed by petId and appointmentId. Clinical
  //    data is NOT part of the appointment record and is not owned by this UI.
  // TODO(BACKEND): Replace the shared mock sources with the appointments and
  // clinical endpoints once they exist. See docs/VHS_CLINICAL_CONTRACT.md.
  // Pet/EMR seed moved to SharedMockClinical.getEmr(petId). Clinical history is
  // not part of the appointment record.

  // Portal-only extras must NOT collide with shared appointment IDs.
  // (User keeps its own historical fixtures locally; Doctor keeps EMR
  // history and consultation records keyed by petId/appointmentId.)
  // Today's Patients uses the REAL current local date — the store's frozen
  // `today` fixture ('2026-09-26') is test-only and is never consulted here.
  // Pass SharedMockAppointments.today explicitly to exercise the fixture day.
  // TODO(BACKEND): get_appointments.php?date=<today> returns this list.
  const DOCTOR_TEST_DATE = null; // set '2026-09-26' ONLY to demo the fixture day
  const mockSchedule = (window.SharedMockAppointments
    ? window.SharedMockAppointments.todays(DOCTOR_TEST_DATE)
    : []
  ).map(function (appt) {
    var emr = (window.SharedMockClinical && window.SharedMockClinical.getEmr)
      ? window.SharedMockClinical.getEmr(appt.petId)
      : { pet_age: '', ai_triage: 'Routine', ai_summary: '', visits: [] };
    return Object.assign({}, appt, emr);
  });

  // Data-mapping boundary: fixtures/endpoint rows are normalized through the
  // shared canonical appointment contract first, then projected into the
  // doctor view model. Pet/EMR data rides separately from the appointment.
  // TODO(BACKEND): Feed mockSchedule rows from get_appointments.php
  // (referenceNo included) — this mapper then changes least.
  function mapAppointment(appt) {
    const a = window.AppointmentContract.fromLegacy(appt);
    return {
      // Canonical appointment reference.
      appointmentId: a.appointmentId,
      referenceNo: a.referenceNo,
      petId: a.petId,
      assignedVetId: a.assignedVetId,
      status: a.status,
      checkedInAt: a.checkedInAt,
      // Doctor view model (unchanged shape for the accepted UI).
      id: a.appointmentId,
      name: a.pet.name,
      species: a.pet.species,
      breed: a.pet.breed,
      age: appt.pet_age || '',
      owner: a.owner.name,
      // Display uses 12-hour AM/PM; the stored canonical value stays HH:MM.
      time: (window.AppointmentContract && window.AppointmentContract.timeTo12h)
        ? window.AppointmentContract.timeTo12h(a.appointmentTime)
        : a.appointmentTime,
      date: a.appointmentDate,
      dateDisplay: new Date(`${a.appointmentDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      // Display label — the stored canonical VALUE never leaks into the UI.
      service: svcLabel(a.service),
      // Effective visit context: canonical option + custom text when present.
      reason: (a.customVisitContext
        ? (a.visitContext ? a.visitContext + ': ' + a.customVisitContext : a.customVisitContext)
        : a.visitContext) || '',
      severity: appt.ai_triage || 'Routine',
      checkedIn: a.status === 'checked_in' || !!appt.checked_in,
      // Pre-consultation summary, built by the adapter from THIS appointment
      // only — pet, booked service and the concerns recorded at booking. The
      // pet's `ai_summary` triage fixture is deliberately NOT reused here: it
      // describes the same symptoms for every visit of that pet, so a patient
      // booked for a blood test with no notes would be shown symptoms nobody
      // reported. Read off `window` directly (not the SCRIBE const below,
      // which is in its temporal dead zone while mapAppointment runs at init).
      aiSummary: (window.DoctorScribe && window.DoctorScribe.buildPreConsultationSummary)
        ? window.DoctorScribe.buildPreConsultationSummary({
          petName: a.pet.name,
          species: a.pet.species,
          serviceLabel: svcLabel(a.service),
          reason: (a.customVisitContext
            ? (a.visitContext ? a.visitContext + ': ' + a.customVisitContext : a.customVisitContext)
            : a.visitContext) || '',
          notes: a.notes || ''
        })
        : '',
      // Pet/EMR domain — clinical history is not part of the appointment.
      history: appt.visits || []
    };
  }
  // TODO(BACKEND): Keep this consultation record keyed by appointmentId;
  // persist transitions server-side instead of local status flags.
  function consultationRecord(patient) { return draftFor(patient); }
  const patients = mockSchedule.map(mapAppointment);

  const queue = document.getElementById('patient-queue');
  const record = document.getElementById('patient-record');
  const form = document.getElementById('consultation-form');
  const fields = ['subjective', 'weight', 'temperature', 'heartRate', 'exam', 'assessment', 'plan'];
  const drafts = new Map();
  let selectedPatient = null;
  let medicineSequence = 0;
  // TODO(BACKEND): Veterinarian identity comes from the authenticated session.
  // Identity comes from the shared roster, not from a literal in this file —
  // mock-doctors.js seeded this exact doctor FROM the old constant, so nothing
  // about the demo changes; there is now one source instead of two.
  // MOCK identity: there is no login. TODO(BACKEND): an authenticated staff
  // session replaces SharedMockDoctors.currentStaff(); only that changes.
  const VETERINARIAN = (window.SharedMockDoctors && window.SharedMockDoctors.currentStaff)
    ? window.SharedMockDoctors.currentStaff()
    : { id: 'vet-001', name: 'Dr. Santos', role: 'Veterinarian', clinicalTitle: 'Veterinarian' };
  // Display-side service label resolution: records may store the canonical
  // catalog VALUE (wound_repair); the queue/record UI always shows the
  // shared catalog LABEL (Wound Repair). Idempotent for label-stored rows.
  // Hoisted function on purpose: mapAppointment runs ABOVE this point at
  // module init, so a const/arrow here would be a TDZ reference error.
  function svcLabel(s) {
    return (window.SharedMockUsers && window.SharedMockUsers.serviceLabel)
      ? (window.SharedMockUsers.serviceLabel(s) || s)
      : (s || '');
  }
  const views = {
    patients: ['Today’s Patients', 'Select a patient to review their appointment and clinical history.'],
    notes: ['Consultation Notes', 'Document the active patient’s consultation using SOAP.'],
    orders: ['Prescriptions & Labs', 'Prepare medication instructions and internal test requests.']
  };
  let currentView = 'patients';
  // Consultation lifecycle: upcoming → checked_in → in_consultation → completed.
  // TODO(BACKEND): Status changes are local-only; the consultation API owns
  // the real lifecycle and timestamps once connected.
  const STATUS_LABELS = { upcoming: 'Upcoming', 'checked_in': 'Checked In', 'in_consultation': 'In Consultation', completed: 'Completed' };
  // One canonical status source: the shared AppointmentStore record. Draft
  // state and the checkedIn fixture are only fallbacks when the store record
  // is unavailable, so Admin/Front-desk transitions (check-in, and any future
  // cross-portal change) are always reflected here.
  // TODO(BACKEND): GET /appointments/:id returns the live status instead.
  function statusFor(patient) {
    // ONE lifecycle source: the shared AppointmentStore. The consultation draft
    // used to carry its own `status` copy that could disagree with the store
    // (and was lost on reload, stranding the Complete button). Clinical drafts
    // now hold notes and timestamps only — never a competing status.
    if (window.SharedMockAppointments && patient.appointmentId) {
      const rec = window.SharedMockAppointments.byId(patient.appointmentId);
      if (rec) {
        const s = window.AppointmentContract
          ? window.AppointmentContract.normalizeStatus(rec.status)
          : rec.status;
        if (s === 'checked_in' || s === 'in_consultation' || s === 'completed' || s === 'canceled') return s;
      }
    }
    return patient.checkedIn ? 'checked_in' : 'upcoming';
  }
  // Time-based greeting for the patients view; other views keep their titles.
  function greeting() {
    const hour = new Date().getHours();
    return `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${VETERINARIAN.name}`;
  }
  // Practical doctor-facing header line: schedule size plus the next patient
  // already waiting in the lobby.
  function greetingSubtitle() {
    const scheduled = patients.length;
    const waiting = patients.find(p => statusFor(p) === 'checked_in');
    if (waiting) return `You have ${scheduled} patients scheduled today. ${waiting.name} is checked in and waiting at ${waiting.time}.`;
    return `You have ${scheduled} patients scheduled today.`;
  }
  function renderHeader(view, locked = false) {
    const title = document.getElementById('view-title');
    const subtitle = document.getElementById('view-description');
    if (view === 'patients') {
      title.textContent = greeting();
      subtitle.textContent = greetingSubtitle();
    } else if (locked) {
      title.textContent = views[view][0];
      subtitle.textContent = 'Start the consultation first to access clinical notes.';
    } else {
      title.textContent = views[view][0];
      subtitle.textContent = views[view][1];
    }
  }
  function showView(view, moveFocus = true) {
    if (!Object.hasOwn(views, view)) view = 'patients';
    const status = selectedPatient ? statusFor(selectedPatient) : 'upcoming';
    const clinicalLocked = view !== 'patients' && status !== 'in_consultation' && status !== 'completed';
    const effectiveView = clinicalLocked ? 'locked' : view;
    captureDraft();
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== effectiveView; });
    form.hidden = effectiveView !== view || view === 'patients';
    document.getElementById('patient-context').hidden = view === 'patients';
    const notice = document.getElementById('locked-notice');
    notice.hidden = effectiveView !== 'locked';
    if (clinicalLocked) {
      const startBtn = document.getElementById('locked-start');
      startBtn.hidden = status !== 'checked_in';
      startBtn.focus({ preventScroll: true });
    }
    renderHeader(view, clinicalLocked);
    currentView = view;
    document.title = `${views[view][0]} - VHS Doctor`;
    document.querySelectorAll('.sidebar-nav [data-view]').forEach(link => {
      const active = link.dataset.view === view;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    closeMobileSidebar();
    if (moveFocus) {
      document.getElementById('view-title').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  function navigate(view) {
    if (window.location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
    showView(view);
  }
  // ─── PRESCRIPTION COMPOSITION ─────────────────────────────────────────────
  // The draft stores the individual PARTS, not the composed sentence, so a
  // draft restored into the structured controls round-trips exactly instead of
  // being re-parsed out of "1 tablet". Composition happens once, at
  // finalization, and produces the same flat strings the document store and
  // the printed prescription have always consumed.
  const emptyMedicine = () => ({
    medicine: '', dosageValue: '', dosageUnit: '', dosageCustom: '',
    frequencyPattern: '', frequencyEvery: '', frequencyCustom: '',
    duration: '', instructions: '',
  });

  function dosageText(m) {
    const amount = String(m.dosageValue || '').trim();
    const unit = String(m.dosageUnit || '').trim();
    if (!amount && !unit) return '';
    const unitLabel = unit === CHOOSE_UNIT ? '' : unit === 'custom' ? String(m.dosageCustom || '').trim() : unit;
    return [amount, unitLabel].filter(Boolean).join(' ');
  }

  function frequencyText(m) {
    const pattern = String(m.frequencyPattern || '').trim();
    if (!pattern) return '';
    if (pattern === 'custom') return String(m.frequencyCustom || '').trim();
    const every = String(m.frequencyEvery || '').trim();
    if (pattern === 'once_daily') return 'once daily';
    if (pattern === 'as_needed') return 'as needed';
    if (!every) return '';
    if (pattern === 'every_hours') return `every ${every} hours`;
    if (pattern === 'times_per_day') return `${every} times per day`;
    if (pattern === 'every_days') return `every ${every} days`;
    return '';
  }

  function draftFor(patient) {
    // Hot working copy. It is HYDRATED from SharedMockClinical the first time a
    // patient is opened, so a reload restores the consultation instead of
    // losing it — the previous in-memory Map silently discarded all of it.
    // Mutations are pushed back through persistDraft() at the edit checkpoints
    // (captureDraft / markChanged / start / end / save), never straight to
    // storage: this file must not own clinical persistence.
    const key = String(patient && patient.id != null ? patient.id : '');
    if (!drafts.has(key)) {
      const restored = (window.SharedMockClinical && window.SharedMockClinical.ensureConsultationDraft)
        ? window.SharedMockClinical.ensureConsultationDraft(key)
        : { fields: {}, medicines: [emptyMedicine()], labs: [], reviewed: false, saved: false, startedAt: null, completedAt: null, durationMinutes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      drafts.set(key, restored);
    }
    return drafts.get(key);
  }
  // Single write-through for clinical working state. No localStorage here.
  function persistDraft(patient, draft) {
    if (!window.SharedMockClinical || !window.SharedMockClinical.saveConsultationDraft) return draft;
    const key = String(patient && patient.id != null ? patient.id : '');
    return window.SharedMockClinical.saveConsultationDraft(key, draft || {});
  }
  // Elapsed minutes between two timestamps, for the consultation record.
  function durationBetween(startIso, endIso) {
    return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
  }
  function formatElapsed(startIso, now = new Date()) {
    const totalSeconds = Math.max(0, Math.floor((now - new Date(startIso)) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  function captureDraft() {
    if (!selectedPatient) return;
    const draft = draftFor(selectedPatient);
    fields.forEach(name => { draft.fields[name] = form.elements.namedItem(name).value; });
    draft.medicines = Array.from(document.querySelectorAll('.medicine-row'), readMedicineRow);
    draft.labs = Array.from(form.querySelectorAll('[name="labs"]:checked'), input => input.value);
    draft.reviewed = document.getElementById('reviewed').checked;
    // AI Scribe keeps its transcript on the SAME draft record as the SOAP
    // fields — one record, one storage owner (SharedMockClinical). Capturing it
    // here is what makes a reload restore the notes the draft came from. No
    // localStorage here and no new storage key anywhere.
    if (scribe.transcript) writeScribeState(draft, { transcript: scribe.transcript.value });
    draft.updatedAt = new Date().toISOString();
    persistDraft(selectedPatient, draft);
  }
  function markChanged() {
    const draft = draftFor(selectedPatient);
    draft.saved = false;
    persistDraft(selectedPatient, draft);
    // Any clinical edit invalidates the prior review acknowledgement.
    document.getElementById('reviewed').checked = false;
    captureDraft();
    document.getElementById('draft-state').textContent = 'Unsaved draft';
    document.getElementById('save-status').textContent = '';
  }
  // ─── AI SCRIBE (mock) ──────────────────────────────────────────────────────
  // The Doctor UI owns NO soap-generation rules and parses NO medical text. It
  // hands the transcript to the adapter and writes back the `apply` map the
  // adapter returns, keyed by the existing control names. What a draft may
  // contain, and which control each fact belongs in, lives in
  // doctor-scribe.js — so replacing the mock generator with the
  // transcription/AI endpoint later changes one file instead of this workflow.
  // TODO(BACKEND): the adapter body becomes the SOAP draft request. Route,
  // payload and auth are CONTRACT NEEDED / TBD — see
  // docs/VHS_CLINICAL_CONTRACT.md §8. Do not invent them here.
  const SCRIBE = window.DoctorScribe || null;
  // Default line under the controls. Every other message is temporary.
  const SCRIBE_HINT = 'Assistive draft only — review and edit every field. Nothing is saved or finalized until you do.';
  // Phase 1 reads .txt only, entirely in the browser. Nothing is uploaded.
  const TRANSCRIPT_FILE_MAX_BYTES = 64 * 1024;
  const scribe = {
    panel: document.getElementById('scribe-section'),
    status: document.getElementById('scribe-status'),
    note: document.getElementById('scribe-note'),
    lock: document.getElementById('scribe-lock'),
    disclaimer: document.getElementById('scribe-disclaimer'),
    record: document.getElementById('scribe-record'),
    paste: document.getElementById('scribe-paste-toggle'),
    upload: document.getElementById('scribe-upload'),
    file: document.getElementById('scribe-file'),
    generate: document.getElementById('scribe-generate'),
    wrap: document.getElementById('scribe-transcript-wrap'),
    transcript: document.getElementById('scribe-transcript')
  };
  const SOAP_LABELS = { subjective: 'Subjective', objective: 'Objective findings', assessment: 'Assessment', plan: 'Plan' };
  const VITAL_LABELS = { weight: 'Weight (kg)', temperature: 'Temperature (°C)', heartRate: 'Heart rate (bpm)' };

  // ── CONFIRMATION ──────────────────────────────────────────────────────────
  // One modal serves every destructive step in the consultation: regenerating
  // over existing notes, replacing a transcript, and completing. It resolves to
  // a boolean, so each caller reads as "ask, then act" instead of hiding the
  // branch inside the action itself. Fails closed: without the dialog, a
  // destructive step is never taken.
  const confirmUi = {
    overlay: document.getElementById('confirm-overlay'),
    title: document.getElementById('confirm-title'),
    message: document.getElementById('confirm-message'),
    cancel: document.getElementById('confirm-cancel'),
    accept: document.getElementById('confirm-accept'),
    close: document.getElementById('confirm-close'),
    resolver: null,
    lastFocus: null
  };
  function confirmAction(options) {
    const cfg = options || {};
    if (!confirmUi.overlay || confirmUi.resolver) return Promise.resolve(false);
    return new Promise(resolve => {
      confirmUi.resolver = resolve;
      confirmUi.lastFocus = document.activeElement;
      confirmUi.title.textContent = cfg.title || 'Please confirm';
      confirmUi.message.textContent = cfg.message || '';
      confirmUi.accept.textContent = cfg.acceptLabel || 'Confirm';
      confirmUi.overlay.classList.add('show');
      confirmUi.cancel.focus({ preventScroll: true }); // safe choice first
    });
  }
  function settleConfirm(value) {
    if (!confirmUi.resolver) return;
    const resolve = confirmUi.resolver;
    confirmUi.resolver = null;
    confirmUi.overlay.classList.remove('show');
    const back = confirmUi.lastFocus;
    if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
    resolve(value);
  }
  if (confirmUi.overlay) {
    confirmUi.cancel.addEventListener('click', () => settleConfirm(false));
    confirmUi.accept.addEventListener('click', () => settleConfirm(true));
    confirmUi.close.addEventListener('click', () => settleConfirm(false));
    // Clicking the backdrop or pressing Escape both mean "no".
    confirmUi.overlay.addEventListener('click', event => { if (event.target === confirmUi.overlay) settleConfirm(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && confirmUi.resolver) settleConfirm(false); });
  }

  // Unknown keys are preserved so the draft record can grow without a migration.
  function writeScribeState(draft, patch) {
    const base = (draft.scribe && typeof draft.scribe === 'object') ? draft.scribe : {};
    draft.scribe = Object.assign({}, base, patch);
    return draft.scribe;
  }
  function scribeState(draft) {
    const s = (draft && draft.scribe && typeof draft.scribe === 'object') ? draft.scribe : {};
    return {
      transcript: typeof s.transcript === 'string' ? s.transcript : '',
      generatedAt: s.generatedAt || null,
      // Snapshot of what the generator last wrote (keyed by control name), so
      // the indicator can compare it against the live controls.
      soap: (s.soap && typeof s.soap === 'object') ? s.soap : null,
      transcriptAtGenerate: typeof s.transcriptAtGenerate === 'string' ? s.transcriptAtGenerate : null
    };
  }
  // Lifecycle gate. statusFor() is the canonical source (the shared appointment
  // store), so AI Scribe can never disagree with the consultation itself:
  //   confirmed / checked_in -> locked   (no transcript, no generation)
  //   in_consultation       -> enabled
  //   completed             -> read-only (the draft stays visible, nothing edits)
  function scribeAccess() {
    const status = selectedPatient ? statusFor(selectedPatient) : 'upcoming';
    if (status === 'in_consultation') return { status, locked: false, readOnly: false, editable: true };
    if (status === 'completed') return { status, locked: false, readOnly: true, editable: false };
    return { status, locked: true, readOnly: true, editable: false };
  }
  // DERIVED, never stored as a flag: has the Doctor changed anything the
  // generator wrote, or the transcript it came from? Comparing the live controls
  // against the snapshot means this can never drift out of step with the form.
  function scribeSoapEdited() {
    if (!SCRIBE || !selectedPatient) return false;
    const snapshot = scribeState(draftFor(selectedPatient)).soap;
    if (!snapshot) return false;
    return Object.keys(snapshot).some(name => {
      const field = form.elements.namedItem(name);
      return field && (field.value || '') !== String(snapshot[name] || '');
    });
  }
  function scribeTranscriptChanged() {
    if (!selectedPatient) return false;
    const state = scribeState(draftFor(selectedPatient));
    if (!state.generatedAt) return false;
    return state.transcript !== state.transcriptAtGenerate;
  }
  function setScribeNote(text) {
    if (scribe.note) scribe.note.textContent = text;
  }
  function revealScribeTranscript(focus) {
    if (!scribe.wrap) return;
    scribe.wrap.hidden = false;
    if (scribe.paste) scribe.paste.setAttribute('aria-expanded', 'true');
    if (focus) scribe.transcript.focus();
  }
  // Would a regeneration destroy something? Any non-empty control the generator
  // writes counts — generated or typed by hand.
  function scribeHasContent() {
    if (!SCRIBE) return false;
    return SCRIBE.APPLY_TARGETS.some(name => {
      const field = form.elements.namedItem(name);
      return field && String(field.value || '').trim() !== '';
    });
  }
  // One place decides the indicator: Ready / Transcript ready / Draft generated /
  // Saved draft / Unsaved changes — every label comes from the adapter, so the
  // pill and the underlying state can never disagree.
  function syncScribePanel() {
    if (!scribe.panel || !SCRIBE) return;
    const access = scribeAccess();
    const draft = selectedPatient ? draftFor(selectedPatient) : null;
    const state = scribeState(draft);
    const info = SCRIBE.getScribeStatus({
      // Phase 1 captures no audio, so nothing can set this yet. The seat exists
      // for the future transcription integration.
      recording: false,
      transcript: state.transcript,
      generatedAt: state.generatedAt,
      saved: !!(draft && draft.saved === true && state.generatedAt),
      // Drift from the generated draft counts as unsaved ONLY while the draft
      // itself is unsaved — otherwise saving the draft would still read
      // "Unsaved changes" forever.
      unsavedChanges: !!draft && draft.saved !== true && (scribeSoapEdited() || scribeTranscriptChanged())
    });
    scribe.status.textContent = info.label;
    scribe.status.dataset.state = info.state;
    scribe.record.disabled = !access.editable;
    scribe.paste.disabled = !access.editable;
    scribe.upload.disabled = !access.editable;
    scribe.generate.disabled = !access.editable;
    scribe.transcript.readOnly = !access.editable;
    scribe.panel.classList.toggle('is-locked', access.locked);
    const lockText = access.locked
      ? 'AI Scribe unlocks once the consultation is in progress.'
      : (access.readOnly ? 'This consultation is completed — AI Scribe is read-only.' : '');
    if (scribe.lock) {
      scribe.lock.textContent = lockText;
      scribe.lock.hidden = !lockText;
    }
  }
  // Regenerating rewrites every field the generator owns, so it is never silent:
  // an explicit confirmation stands between the Doctor and losing notes.
  async function requestScribeGenerate() {
    if (!scribeAccess().editable) { setScribeNote('AI Scribe is read-only for this consultation.'); return; }
    if (scribeHasContent()) {
      const confirmed = await confirmAction({
        title: 'Regenerate SOAP draft?',
        message: 'This will replace the current SOAP fields. Any unsaved manual edits will be lost.',
        acceptLabel: 'Regenerate'
      });
      if (!confirmed) { syncScribePanel(); return; }
    }
    runScribeGenerate();
  }
  function runScribeGenerate() {
    if (!scribeAccess().editable) { setScribeNote('AI Scribe is read-only for this consultation.'); return; }
    const target = selectedPatient;
    const input = {
      transcript: scribe.transcript.value,
      appointmentId: target ? target.appointmentId : '',
      petId: target ? target.petId : '',
      // Pass-through identity only: the generator never derives clinical content
      // from it.
      patient: target ? { appointmentId: target.appointmentId, petId: target.petId, name: target.name, species: target.species } : null
    };
    // Validation belongs to the adapter, so the wording the Doctor reads and the
    // rule the generator applies can never drift apart.
    const check = SCRIBE.validateScribeInput(input);
    if (!check.ok) {
      setScribeNote(check.message);
      revealScribeTranscript(true);
      return;
    }
    setScribeNote('Building the SOAP draft…');
    // Promise-returning seam: the mock resolves immediately, the future
    // transcription/AI endpoint is the same call. Nothing leaves this device.
    SCRIBE.createSoapDraft(input).then(result => {
      if (!result.ok || !result.apply) {
        setScribeNote(result.error && result.error.message ? result.error.message : 'The SOAP draft could not be generated. Enter the SOAP note manually.');
        return;
      }
      if (selectedPatient !== target) return; // the Doctor switched patients mid-run
      applyScribeDraft(target, result);
    });
  }
  function applyScribeDraft(patient, result) {
    // Writes the EXISTING controls by name. No second SOAP form exists, and no
    // prescription, lab or lifecycle control is touched. Vitals the transcript
    // never stated are written blank, so a regenerated draft is a clean draft
    // rather than a mix of old and new.
    SCRIBE.APPLY_TARGETS.forEach(name => {
      const field = form.elements.namedItem(name);
      if (field) field.value = result.apply[name] == null ? '' : String(result.apply[name]);
    });
    writeScribeState(draftFor(patient), {
      transcript: scribe.transcript.value,
      transcriptAtGenerate: scribe.transcript.value,
      generatedAt: result.meta.generatedAt,
      engine: result.meta.engine,
      soap: Object.assign({}, result.apply),
      patient: result.meta.patient
    });
    // The character counters attached by the validation layer only re-read a
    // field on an input event, so a programmatic fill would leave them showing
    // the PREVIOUS length. Re-dispatch on the SOAP textareas only (the vitals
    // have no counter and their strict entry filters need no nudge).
    SCRIBE.SOAP_FIELDS.forEach(name => {
      const field = form.elements.namedItem(name);
      if (field) field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Generated text is working state, never a saved one, and never a review:
    // markChanged() unsets the saved flag AND the acknowledgement checkbox,
    // exactly as it does for a hand-typed SOAP entry.
    markChanged();
    setScribeNote(scribeSummary(result));
    syncScribePanel();
  }
  function scribeSummary(result) {
    const parts = ['SOAP draft filled into the fields below — review, edit and save it like any other entry.'];
    if (result.missing && result.missing.length) {
      parts.push('No ' + result.missing.map(name => SOAP_LABELS[name] || name).join(' or ') + ' content was in the transcript, so "' + SCRIBE.NOT_PROVIDED + '" was used.');
    }
    if (result.absentVitals && result.absentVitals.length) {
      parts.push('No ' + result.absentVitals.map(name => VITAL_LABELS[name] || name).join(' or ') + ' was stated in the transcript, so the field was left blank.');
    }
    if (result.unclassified && result.unclassified.length) {
      parts.push(result.unclassified.length + ' line(s) could not be placed and were not added — check them in the transcript.');
    }
    if (result.dropped && Object.keys(result.dropped).length) {
      parts.push('Some lines were left out to fit the field limits.');
    }
    return parts.join(' ');
  }

  // ── TRANSCRIPT SOURCES ────────────────────────────────────────────────────
  // Typed/pasted text, a local .txt file, and — later — recorded audio. All
  // three end up in the same textarea, so the generator has one input.
  function setTranscriptText(text) {
    revealScribeTranscript(false);
    scribe.transcript.value = String(text == null ? '' : text);
    scribe.transcript.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Anything that would discard transcript content asks first. Not shown for an
  // empty box — there is nothing to lose.
  function replaceTranscript(label, apply) {
    if (!scribe.transcript.value.trim()) { apply(); return; }
    confirmAction({
      title: 'Replace current transcript?',
      message: 'Your existing transcript text' + (label ? ' (' + label + ')' : '') + ' will be replaced.',
      acceptLabel: 'Replace'
    }).then(confirmed => { if (confirmed) apply(); });
  }
  function readTranscriptFile(file) {
    if (!file) return;
    const name = file.name || 'this file';
    // Extension is the check the Doctor can see; the MIME type is a courtesy.
    // Neither decides anything beyond "plain text file".
    if (!/\.txt$/i.test(name) && file.type !== 'text/plain') {
      setScribeNote('Upload a plain .txt transcript — "' + name + '" is not supported.');
      return;
    }
    if (file.size > TRANSCRIPT_FILE_MAX_BYTES) {
      setScribeNote('"' + name + '" is larger than 64 KB. Split the transcript into a smaller .txt file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (text.length > SCRIBE.MAX_TRANSCRIPT_CHARS) {
        setScribeNote('"' + name + '" holds more than ' + SCRIBE.MAX_TRANSCRIPT_CHARS + ' characters. Split it into a smaller file.');
        return;
      }
      replaceTranscript(name, () => setTranscriptText(text));
    };
    reader.onerror = () => setScribeNote('"' + name + '" could not be read. Try again with a plain .txt file.');
    reader.readAsText(file);
  }

  if (scribe.panel && SCRIBE) {
    // Start Recording is an INTEGRATION SEAT, not a recorder. Phase 1 ships no
    // microphone capture and no speech-to-text, so the button says exactly that
    // and opens the working path instead of implying audio is being taken.
    scribe.record.addEventListener('click', () => {
      setScribeNote(SCRIBE.recording.message);
      revealScribeTranscript(true);
    });
    scribe.paste.addEventListener('click', () => {
      const open = scribe.wrap.hidden;
      scribe.wrap.hidden = !open;
      scribe.paste.setAttribute('aria-expanded', String(open));
      if (open) scribe.transcript.focus();
    });
    // Pasting over real notes must not silently discard them.
    scribe.transcript.addEventListener('paste', event => {
      if (!scribe.transcript.value.trim()) return; // nothing to replace
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text') || '';
      replaceTranscript('pasted text', () => {
        const field = scribe.transcript;
        field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    if (scribe.upload && scribe.file) {
      scribe.upload.addEventListener('click', () => scribe.file.click());
      scribe.file.addEventListener('change', () => {
        const file = scribe.file.files && scribe.file.files[0];
        scribe.file.value = ''; // let the same file be picked again
        readTranscriptFile(file);
      });
    }
    scribe.generate.addEventListener('click', requestScribeGenerate);
    // Transcript edits are handled by the ONE form-level input listener below
    // (the textarea lives inside the consultation form, like every other
    // field), so there is no second edit path to keep in step.
    setScribeNote(SCRIBE_HINT);
  }
  // Reads a row's controls back into the flat PART record the draft stores.
  // data-part is the single source of truth for every structured control, so
  // adding a control never means touching the capture code again.
  function readMedicineRow(row) {
    const values = emptyMedicine();
    row.querySelectorAll('[data-part]').forEach(control => { values[control.dataset.part] = control.value; });
    row.querySelectorAll('[data-field]').forEach(control => { values[control.dataset.field] = control.value; });
    return values;
  }

  function addMedicine(values = emptyMedicine()) {
    const row = element('fieldset', '', 'medicine-row');
    const sequence = ++medicineSequence;
    const idFor = key => `medicine-${sequence}-${key}`;
    const text = (className, id, placeholder, maxLength) => {
      const input = element('input', '', `form-input ${className}`.trim());
      input.type = 'text';
      input.id = id;
      input.maxLength = maxLength;
      input.placeholder = placeholder;
      input.autocomplete = 'off';
      return input;
    };
    const option = (value, label) => new Option(label, value);

    // ── Medicine ───────────────────────────────────────────────────────────
    const medicineGroup = element('div');
    const medicineLabel = element('label', 'Medicine', 'form-label');
    const medicineInput = text('', idFor('medicine'), 'e.g. Amoxicillin 250mg', MEDICINE_LIMITS.medicine);
    medicineInput.dataset.field = 'medicine';
    medicineInput.value = values.medicine || '';
    medicineLabel.htmlFor = medicineInput.id;
    medicineGroup.append(medicineLabel, medicineInput);

    // ── Dosage: amount + unit (custom unit as the escape hatch) ────────────
    const dosageGroup = element('div', '', 'medicine-dosage');
    const dosageLabel = element('label', 'Dosage', 'form-label');
    const dosageControls = element('div', '', 'medicine-controls');
    const dosageValue = text('medicine-amount', idFor('dosage'), '1', 10);
    dosageValue.dataset.part = 'dosageValue';
    dosageValue.value = values.dosageValue || '';
    dosageValue.inputMode = 'decimal';
    dosageValue.setAttribute('aria-label', 'Dosage amount');
    const dosageUnit = element('select', '', 'form-input medicine-select');
    dosageUnit.id = idFor('dosageUnit');
    dosageUnit.dataset.part = 'dosageUnit';
    dosageUnit.append(option(CHOOSE_UNIT, 'Unit…'));
    DOSAGE_UNITS.forEach(unit => dosageUnit.append(option(unit, unit)));
    dosageUnit.append(option('custom', 'Other / Custom'));
    dosageUnit.value = values.dosageUnit || CHOOSE_UNIT;
    const dosageCustom = text('medicine-custom', idFor('dosageCustom'), 'custom unit', 20);
    dosageCustom.dataset.part = 'dosageCustom';
    dosageCustom.value = values.dosageCustom || '';
    dosageCustom.setAttribute('aria-label', 'Custom dosage unit');
    dosageCustom.hidden = dosageUnit.value !== 'custom';
    dosageControls.append(dosageValue, dosageUnit, dosageCustom);
    dosageLabel.htmlFor = dosageValue.id;
    dosageGroup.append(dosageLabel, dosageControls);

    // ── Frequency: pattern + optional interval / custom text ───────────────
    const frequencyGroup = element('div', '', 'medicine-frequency');
    const frequencyLabel = element('label', 'Frequency', 'form-label');
    const frequencyControls = element('div', '', 'medicine-controls');
    const frequencyPattern = element('select', '', 'form-input medicine-select');
    frequencyPattern.id = idFor('frequency');
    frequencyPattern.dataset.part = 'frequencyPattern';
    frequencyPattern.append(option(CHOOSE_PATTERN, 'Choose…'));
    FREQUENCY_PATTERNS.forEach(([value, label]) => frequencyPattern.append(option(value, label)));
    frequencyPattern.value = values.frequencyPattern || CHOOSE_PATTERN;
    const frequencyEvery = text('medicine-amount', idFor('frequencyEvery'), '8', 3);
    frequencyEvery.dataset.part = 'frequencyEvery';
    frequencyEvery.value = values.frequencyEvery || '';
    frequencyEvery.inputMode = 'numeric';
    frequencyEvery.setAttribute('aria-label', 'Frequency interval');
    frequencyEvery.hidden = !INTERVAL_PATTERNS.has(frequencyPattern.value);
    const frequencyCustom = text('medicine-custom', idFor('frequencyCustom'), 'e.g. twice weekly, with food', MEDICINE_LIMITS.frequency);
    frequencyCustom.dataset.part = 'frequencyCustom';
    frequencyCustom.value = values.frequencyCustom || '';
    frequencyCustom.setAttribute('aria-label', 'Custom frequency');
    frequencyCustom.hidden = frequencyPattern.value !== 'custom';
    frequencyControls.append(frequencyPattern, frequencyEvery, frequencyCustom);
    frequencyLabel.htmlFor = frequencyPattern.id;
    frequencyGroup.append(frequencyLabel, frequencyControls);

    // ── Duration: whole days ────────────────────────────────────────────────
    const durationGroup = element('div', '', 'medicine-duration');
    const durationLabel = element('label', 'Duration', 'form-label');
    const durationControls = element('div', '', 'medicine-controls');
    const durationInput = text('medicine-amount', idFor('duration'), '7', 3);
    durationInput.dataset.field = 'duration';
    durationInput.value = values.duration || '';
    durationInput.inputMode = 'numeric';
    durationControls.append(durationInput, element('span', 'days', 'medicine-suffix'));
    durationLabel.htmlFor = durationInput.id;
    durationGroup.append(durationLabel, durationControls);

    // ── Owner instructions: free text, unchanged in spirit ──────────────────
    const instructionGroup = element('div', '', 'medicine-instructions');
    const instructionLabel = element('label', 'Instructions for the owner', 'form-label');
    const instructionInput = element('textarea', '', 'form-input');
    instructionInput.id = idFor('instructions');
    instructionInput.dataset.field = 'instructions';
    instructionInput.value = values.instructions || '';
    instructionInput.maxLength = MEDICINE_LIMITS.instructions;
    instructionInput.rows = 2;
    instructionInput.placeholder = 'e.g. give with food';
    instructionLabel.htmlFor = instructionInput.id;
    instructionGroup.append(instructionLabel, instructionInput);

    // Dependent controls appear only once their option is chosen, so a custom
    // unit or a custom schedule can never be typed without the option that
    // gives it meaning.
    const syncDependent = () => {
      dosageCustom.hidden = dosageUnit.value !== 'custom';
      if (dosageUnit.value !== 'custom') dosageCustom.value = '';
      frequencyEvery.hidden = !INTERVAL_PATTERNS.has(frequencyPattern.value);
      if (!INTERVAL_PATTERNS.has(frequencyPattern.value)) frequencyEvery.value = '';
      frequencyCustom.hidden = frequencyPattern.value !== 'custom';
      if (frequencyPattern.value !== 'custom') frequencyCustom.value = '';
    };
    dosageUnit.addEventListener('change', syncDependent);
    frequencyPattern.addEventListener('change', syncDependent);

    row.append(medicineGroup, dosageGroup, frequencyGroup, durationGroup, instructionGroup);
    const remove = element('button', 'Remove', 'btn-secondary btn-small');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'Remove these medicine instructions');
    remove.addEventListener('click', () => {
      row.remove();
      markChanged();
      document.getElementById('add-medicine').focus();
    });
    row.append(remove);
    document.getElementById('medicine-list').append(row);
    return row;
  }
  // Text is assigned through textContent so record strings are never HTML.
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function selectPatient(patient, moveFocus = true) {
    captureDraft();
    selectedPatient = patient;
    const draft = draftFor(patient);
    fields.forEach(name => { form.elements.namedItem(name).value = draft.fields[name] || ''; });
    document.getElementById('medicine-list').replaceChildren();
    draft.medicines.forEach(addMedicine);
    form.querySelectorAll('[name="labs"]').forEach(input => { input.checked = draft.labs.includes(input.value); });
    document.getElementById('reviewed').checked = draft.reviewed;
    const _completeBtn = document.getElementById('complete-consultation');
    _completeBtn.disabled = statusFor(patient) !== 'in_consultation';
    // Completed patients keep the finished state visible on the primary button.
    if (statusFor(patient) === 'completed') {
      _completeBtn.textContent = 'Consultation Completed';
      _completeBtn.classList.add('btn-completed');
    } else {
      _completeBtn.textContent = 'Complete Consultation';
      _completeBtn.classList.remove('btn-completed');
    }
    document.getElementById('ai-summary').textContent = patient.aiSummary;
    // AI Scribe restores from the same draft record: the transcript, the last
    // generated snapshot, and a lifecycle-appropriate enabled/read-only state.
    // The confirmation dialog is stateless and always settles itself, so
    // switching patients never leaves one open.
    if (scribe.transcript) {
      const scribeDraftState = scribeState(draft);
      scribe.transcript.value = scribeDraftState.transcript;
      // Notes are only shown when there are notes to show — no clutter.
      scribe.wrap.hidden = !scribeDraftState.transcript;
      if (scribe.paste) scribe.paste.setAttribute('aria-expanded', String(!scribe.wrap.hidden));
    }
    syncScribePanel();
    document.getElementById('context-name').textContent = patient.name;
    document.getElementById('context-appointment').textContent = `${patient.species} · ${patient.breed} · ${patient.dateDisplay}, ${patient.time} · ${svcLabel(patient.service)}`;
    const timerLine = document.getElementById('context-timer');
    if (statusFor(patient) === 'in_consultation' && draft.startedAt) {
      const startClock = new Date(draft.startedAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
      timerLine.hidden = false;
      timerLine.replaceChildren(
        element('span', STATUS_LABELS.in_consultation, `appt-status in_consultation`),
        element('span', ` · Started ${startClock} · `),
        element('span', formatElapsed(draft.startedAt), 'timer-value')
      );
      timerLine.querySelector('.timer-value').dataset.elapsedFor = patient.id;
    } else {
      timerLine.hidden = true;
      timerLine.replaceChildren();
    }
    document.getElementById('draft-state').textContent = draft.saved ? 'Saved on this device' : 'Unsaved draft';
    document.getElementById('save-status').textContent = '';
    queue.querySelectorAll('.queue-row').forEach(row => row.setAttribute('aria-pressed', String(row.dataset.patientId === patient.id)));
    const name = element('h3', patient.name);
    const details = element('dl', '', 'pet-details');
    for (const [label, value] of [['Species', patient.species], ['Breed', patient.breed], ['Age', patient.age], ['Owner', patient.owner]]) {
      const pair = element('div');
      pair.append(element('dt', label), element('dd', value));
      details.append(pair);
    }
    const refLine = patient.referenceNo ? ` · Ref ${patient.referenceNo}` : '';
    record.replaceChildren(name, element('p', `${patient.dateDisplay} · ${patient.time} · ${svcLabel(patient.service)}${refLine}`), details, element('p', patient.reason, 'visit-reason'), element('h3', 'Clinical history'));
    if (patient.history.length) {
      const history = element('ol', '', 'history');
      history.tabIndex = 0;
      history.setAttribute('aria-label', `${patient.name} clinical history`);
      patient.history.forEach(entry => {
        const item = element('li');
        const date = element('time', new Date(`${entry.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
        date.dateTime = entry.date;
        item.append(date, element('strong', entry.title), element('p', entry.note));
        history.append(item);
      });
      record.append(history);
    } else {
      record.append(element('p', 'No previous vaccinations or veterinary notes recorded.', 'helper'));
    }
    document.getElementById('selection-status').textContent = `${patient.name} is the active patient.`;
    renderRecordActions(patient);
    if (moveFocus) {
      document.getElementById('record-heading').focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('record-heading').scrollIntoView({ block: 'start' });
    }
  }
  // One status-driven action beside the EMR; the EMR itself stays read-only.
  function renderRecordActions(patient) {
    const wrap = document.getElementById('record-actions');
    wrap.replaceChildren();
    const status = statusFor(patient);
    if (status === 'checked_in') {
      const start = element('button', 'Start Consultation', 'btn-primary');
      start.type = 'button';
      start.addEventListener('click', () => startConsultation(patient));
      wrap.append(start);
    } else if (status === 'in_consultation') {
      const cont = element('button', 'Continue Consultation', 'btn-primary');
      cont.type = 'button';
      cont.addEventListener('click', () => {
        // Drafts are session memory; the shared record outlives a reload. If
        // the store already reads in_consultation but this draft has no
        // status, adopt the lifecycle here — otherwise Continue opens the form
        // and Complete is permanently blocked with "start first", with no
        // Start button left to press.
        const draft = draftFor(patient);
        // The status now comes from the shared store, so there is nothing to
        // adopt here: if the store says in_consultation, statusFor() agrees and
        // Complete is reachable. The draft only needs its start timestamp.
        if (!draft.startedAt) {
          const store = window.SharedMockAppointments;
          const rec = store && patient.appointmentId ? store.byId(patient.appointmentId) : null;
          draft.startedAt = (rec && rec.consultationStartedAt) || new Date().toISOString();
          persistDraft(patient, draft);
        }
        renderRecordActions(patient);
        navigate('notes');
      });
      wrap.append(cont);
    } else if (status === 'completed') {
      const view = element('button', 'View Clinical Document', 'btn-secondary');
      view.type = 'button';
      view.addEventListener('click', () => openPreview(patient));
      wrap.append(view);
    }
  }
  // Clinic-list rows modeled on the Clerk appointments table: one compact
  // row per appointment for scanning and selection; the single contextual
  // consultation action lives beside the selected patient's EMR.
  function renderQueueRow(patient) {
    const row = element('tr', '', `queue-row ${patient.severity.toLowerCase()}`);
    row.tabIndex = 0;
    row.dataset.patientId = patient.id;
    const status = statusFor(patient);
    row.setAttribute('aria-pressed', String(selectedPatient && selectedPatient.id === patient.id));
    row.setAttribute('aria-label', `${patient.time}, ${patient.name}, owner ${patient.owner}, ${patient.service}, triage ${patient.severity}, ${STATUS_LABELS[status]}. Select to open record.`);
    const badgeCell = element('td');
    badgeCell.append(element('span', patient.severity, `severity ${patient.severity.toLowerCase()}`));
    const statusCell = element('td');
    statusCell.append(element('span', STATUS_LABELS[status], `appt-status ${status}`));
    row.append(
      element('td', patient.time, 'q-time'),
      element('td', patient.name, 'q-name'),
      element('td', patient.owner, 'q-owner'),
      element('td', patient.service, 'q-service'),
      badgeCell,
      statusCell
    );
    const activate = () => selectPatient(patient);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    return row;
  }
  function renderQueue() {
    if (!patients.length) {
      queue.replaceChildren();
      const empty = element('tr');
      const cell = element('td', 'No patients scheduled for today.', 'queue-empty');
      cell.colSpan = 6;
      empty.append(cell);
      queue.append(empty);
      return;
    }
    queue.replaceChildren(...patients.map(renderQueueRow));
  }
  renderQueue();
  // Start is an explicit action, never a side effect of selecting a patient.
  // Only checked-in patients may start; upcoming patients cannot.
  // TODO(BACKEND): Validate the status transition server-side and record
  // startedAt through the consultation API.
  function startConsultation(patient) {
    const draft = draftFor(patient);
    if (statusFor(patient) !== 'checked_in') return;
    if (statusFor(patient) === 'in_consultation' || statusFor(patient) === 'completed') return;
    // Same record, same lifecycle: the shared store stamps
    // consultationStartedAt and sets in_consultation for every portal.
    // TODO(BACKEND): PATCH /appointments/:id/status { in_consultation }.
    const store = window.SharedMockAppointments;
    const result = store && patient.appointmentId ? store.setStatus(patient.appointmentId, 'in_consultation') : { ok: false };
    if (store && patient.appointmentId && !result.ok) return; // guard rejected the transition
    if (window.AuditLog) window.AuditLog.add({ actor: { actorType: 'Doctor', actorId: VETERINARIAN.id, actorName: VETERINARIAN.name }, action: 'consultation_started', entityType: 'appointment', entityId: patient.appointmentId, referenceNo: patient.referenceNo || '', description: VETERINARIAN.name + ' started consultation for ' + patient.name });
    captureDraft();
    draft.startedAt = (result && result.appointment && result.appointment.consultationStartedAt) || new Date().toISOString();
    draft.completedAt = null;
    draft.durationMinutes = null;
    draft.updatedAt = draft.startedAt;
    persistDraft(patient, draft);
    renderQueue();
    selectPatient(patient);
    document.getElementById('save-status').textContent = `Consultation started for ${patient.name}. Timer is running.`;
    navigate('notes');
  }
  // One tick updates every visible elapsed readout; state is derived from
  // startedAt, so navigation never pauses or restarts the timer.
  function tickTimers() {
    const now = new Date();
    patients.forEach(patient => {
      const draft = draftFor(patient);
      if (statusFor(patient) !== 'in_consultation' || !draft.startedAt) return;
      const elapsed = formatElapsed(draft.startedAt, now);
      document.querySelectorAll(`[data-elapsed-for="${patient.id}"]`).forEach(node => { node.textContent = elapsed; });
    });
  }
  setInterval(tickTimers, 1000);
  // Header/meta date: same REAL local date the queue filters on (not the
  // first patient's date, and no crash when today's list is empty).
  {
    const todayDisplay = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const countLine = patients.length === 1 ? '1 appointment' : `${patients.length} appointments`;
    document.getElementById('queue-meta').textContent = `${todayDisplay} · ${countLine}`;
  }
  form.addEventListener('input', event => {
    if (event.target.id === 'reviewed') {
      captureDraft();
      { const d = draftFor(selectedPatient); d.saved = false; persistDraft(selectedPatient, d); }
      document.getElementById('draft-state').textContent = 'Unsaved draft';
      document.getElementById('save-status').textContent = '';
    } else {
      // Every other input — a SOAP field, a vital, a prescription row or the
      // Scribe transcript — is a draft edit: the saved flag and the review
      // acknowledgement both drop, and the Scribe indicator catches up so an
      // edited generated draft reads "Unsaved changes".
      markChanged();
      syncScribePanel();
    }
  });
  document.getElementById('add-medicine').addEventListener('click', () => {
    const row = addMedicine();
    markChanged();
    row.querySelector('input').focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    // Invalid vitals/duration/limits block the save, not just the visual.
    if (window.doctorValidateClinical && !window.doctorValidateClinical()) {
      // A blocked save still has to say WHICH control is wrong. The gate has
      // already marked it and moved focus there; this only chooses the wording,
      // preferring the specific prescription message over the generic one.
      const rx = window.doctorFirstPrescriptionIssue && window.doctorFirstPrescriptionIssue();
      document.getElementById('save-status').textContent = rx
        ? rx.message
        : 'Fix the highlighted clinical fields before saving.';
      return;
    }
    captureDraft();
    const status = document.getElementById('save-status');
    // Hidden fields still belong to this draft. Reveal their view before focusing
    // a validation error so browser validation never targets an invisible input.
    const invalid = Array.from(form.elements).find(input => input.willValidate && !input.validity.valid);
    if (invalid) {
      const view = invalid.closest('[data-panel]').dataset.panel;
      history.replaceState(null, '', `#${view}`);
      showView(view, false);
      invalid.reportValidity();
      return;
    }
    const partial = window.doctorFirstPrescriptionIssue && window.doctorFirstPrescriptionIssue();
    if (partial) {
      history.replaceState(null, '', '#orders');
      showView('orders', false);
      status.textContent = partial.message;
      if (partial.field) partial.field.focus();
      return;
    }
    if (!document.getElementById('reviewed').checked) {
      status.textContent = 'Review the consultation draft and check the acknowledgement before saving.';
      document.getElementById('reviewed').focus();
      return;
    }
    { const d = draftFor(selectedPatient); d.saved = true; persistDraft(selectedPatient, d); }
    document.getElementById('draft-state').textContent = 'Saved on this device';
    syncScribePanel(); // the Scribe pill moves to "Saved draft"
    // TODO(BACKEND): Persist the consultation through the consultation endpoint
    // and enable front-desk handoff once the API exists.
    status.textContent = 'Draft saved on this device.';
  });
  // Complete ends the lifecycle: stop the timer, record end time + duration.
  // TODO(BACKEND): Finalize through the consultation API; the backend then
  // releases the record to Clerk/Admin and the owner's account.
  document.getElementById('complete-consultation').addEventListener('click', async () => {
    const draft = draftFor(selectedPatient);
    const status = document.getElementById('save-status');
    // TODO(BACKEND): Validate the completion transition server-side.
    if (statusFor(selectedPatient) === 'completed') { status.textContent = 'This consultation is already completed.'; return; }
    if (statusFor(selectedPatient) !== 'in_consultation') { status.textContent = 'Start the consultation before completing it.'; return; }
    // Nothing invalid may reach a finalized record.
    if (window.doctorValidateClinical && !window.doctorValidateClinical()) {
      const rx = window.doctorFirstPrescriptionIssue && window.doctorFirstPrescriptionIssue();
      status.textContent = rx ? rx.message : 'Fix the highlighted clinical fields before completing the consultation.';
      return;
    }
    captureDraft();
    const incomplete = window.doctorFirstPrescriptionIssue && window.doctorFirstPrescriptionIssue();
    if (incomplete) {
      history.replaceState(null, '', '#orders');
      showView('orders', false);
      status.textContent = incomplete.message;
      if (incomplete.field) incomplete.field.focus();
      return;
    }
    // Every existing guard above has passed; ONLY now is the Doctor asked,
    // because completion is irreversible and locks the record. Cancelling
    // leaves the consultation exactly as it was — still in consultation, still
    // editable, nothing stamped.
    const confirmed = await confirmAction({
      title: 'Complete consultation?',
      message: 'Once completed, this consultation will become read-only. Make sure the SOAP notes, prescriptions, and lab requests have been reviewed.',
      acceptLabel: 'Complete Consultation'
    });
    if (!confirmed) { status.textContent = 'Completion cancelled. The consultation is unchanged.'; return; }
    // The Doctor can edit while the dialog was open, so the guards are re-run
    // rather than trusted: the record must still be finalizable at the moment
    // it actually completes.
    if (statusFor(selectedPatient) !== 'in_consultation') { status.textContent = 'Start the consultation before completing it.'; return; }
    if (window.doctorValidateClinical && !window.doctorValidateClinical()) {
      const rx = window.doctorFirstPrescriptionIssue && window.doctorFirstPrescriptionIssue();
      status.textContent = rx ? rx.message : 'Fix the highlighted clinical fields before completing the consultation.';
      return;
    }
    // Same canonical record: the shared store stamps
    // consultationCompletedAt and sets completed for every portal. The local
    // duration/timer logic is preserved untouched.
    // TODO(BACKEND): PATCH /appointments/:id/status { completed }.
    const store = window.SharedMockAppointments;
    if (store && selectedPatient.appointmentId) store.setStatus(selectedPatient.appointmentId, 'completed');
    if (window.AuditLog) window.AuditLog.add({ actor: { actorType: 'Doctor', actorId: VETERINARIAN.id, actorName: VETERINARIAN.name }, action: 'consultation_completed', entityType: 'appointment', entityId: selectedPatient.appointmentId, referenceNo: selectedPatient.referenceNo || '', description: VETERINARIAN.name + ' completed consultation for ' + selectedPatient.name });
    draft.completedAt = new Date().toISOString();
    draft.durationMinutes = durationBetween(draft.startedAt, draft.completedAt);
    draft.saved = true;
    draft.updatedAt = draft.completedAt;
    persistDraft(selectedPatient, draft);
    // Phase 5: finalization creates the client-facing documents
    // (summary, prescription, lab request). Internal SOAP narrative
    // stays Doctor-only and is never stored in the shared layer.
    // TODO(BACKEND): the consultation API performs this fan-out in the
    // completion transaction instead of the frontend.
    if (window.SharedDocuments && selectedPatient.appointmentId) {
      const _rec = window.SharedMockAppointments ? window.SharedMockAppointments.byId(selectedPatient.appointmentId) : null;
      if (_rec) window.SharedDocuments.finalizeFromConsultation(buildConsultation(selectedPatient), _rec);
    }
    // Immediate terminal state: the primary button becomes a non-interactive
    // confirmation (no second completion attempt); View Clinical Document
    // remains available in the record actions.
    // TODO(BACKEND): Restore document delivery action when backend
    // document/release workflow exists.
    const _completeBtn = document.getElementById('complete-consultation');
    _completeBtn.textContent = 'Consultation Completed';
    _completeBtn.disabled = true;
    _completeBtn.classList.add('btn-completed');
    renderQueue();
    renderHeader(currentView);
    renderRecordActions(selectedPatient);
    syncScribePanel(); // completion is Doctor-controlled; the Scribe goes read-only
    const timerLine = document.getElementById('context-timer');
    timerLine.hidden = true;
    timerLine.replaceChildren();
    document.getElementById('draft-state').textContent = 'Saved on this device';
    status.textContent = `Consultation completed for ${selectedPatient.name}. Duration: ${draft.durationMinutes} min. Sending to the front desk requires backend integration.`;
  });
  // Structured consultation object built from the appointment record plus the
  // captured draft — the same shape a consultation endpoint would receive.
  // TODO(BACKEND): POST/PUT this object to the consultation API when the
  // veterinarian finalizes a record; the backend then exposes it to
  // Clerk/Admin and the pet owner's account.
  function buildConsultation(patient) {
    const draft = captureAndReturnDraft(patient);
    const soapEntries = (value) => value && value.trim() ? value.trim() : '';
    // Structured consultation record — the shape the backend consultation
    // endpoint will receive. TODO(BACKEND): POST/PUT this object; the API
    // owns appointmentId/patientId/veterinarianId joins and persistence.
    return {
      appointmentId: patient.id,
      patientId: patient.id,
      veterinarianId: VETERINARIAN.id,
      patient: { name: patient.name, species: patient.species, breed: patient.breed, age: patient.age, owner: patient.owner },
      appointment: { date: patient.date, dateDisplay: patient.dateDisplay, time: patient.time, service: patient.service, reason: patient.reason },
      status: statusFor(patient),
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      duration: draft.durationMinutes,
      soap: {
        subjective: soapEntries(draft.fields.subjective),
        weight: soapEntries(draft.fields.weight), temperature: soapEntries(draft.fields.temperature), heartRate: soapEntries(draft.fields.heartRate),
        objective: soapEntries(draft.fields.exam),
        assessment: soapEntries(draft.fields.assessment),
        plan: soapEntries(draft.fields.plan)
      },
      // The structured controls are flattened here, once, into the flat strings the
      // document store and the printed prescription have always consumed —
      // dosageText/frequencyText turn the parts back into "1 tablet" and
      // "every 8 hours", so nothing downstream needed to change.
      prescriptions: draft.medicines.filter(m => m.medicine.trim()).map(m => ({
        medicine: m.medicine.trim(),
        dosage: dosageText(m),
        frequency: frequencyText(m),
        duration: String(m.duration || '').trim(),
        instructions: String(m.instructions || '').trim(),
      })),
      labRequests: draft.labs.map(name => ({ test: name, notes: '' })),
      veterinarian: { name: VETERINARIAN.name, role: VETERINARIAN.clinicalTitle || VETERINARIAN.role },
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt
    };
  }
  function captureAndReturnDraft(patient) {
    captureDraft();
    return draftFor(patient);
  }
  // Print-style clinical record, mirroring the User Portal's print document
  // system (letterhead, bordered info grid, zebra table, signature block).
  // TODO(BACKEND): The consultation object feeds server-side PDF generation;
  // keep this renderer a pure function of the data model.
  function renderConsultationDocument(c) {
    const body = document.getElementById('document-preview-body');
    body.replaceChildren();
    const letterhead = element('div', '', 'print-letterhead');
    const lhRow = element('div', '', 'print-letterhead-row');
    const logo = element('img');
    logo.src = '../web-page/image/vhs-assets/vhs-logo.png';
    logo.alt = 'VHS logo';
    logo.className = 'print-logo';
    const clinicName = element('p', 'VHS Animal Wellness Center', 'print-clinic-name');
    lhRow.append(logo, clinicName);
    const clinicDetails = element('div');
    ['834 Aurora Boulevard cor Driod Street, Kaunlaran, Cubao, Quezon City', '0917 108 4174 · vhs.animalwellness@gmail.com'].forEach(line => clinicDetails.append(element('p', line, 'print-clinic-detail')));
    letterhead.append(lhRow, clinicDetails);

    const title = element('h3', 'Clinical Consultation Record', 'print-doc-title');
    const meta = element('div', '', 'print-meta-row');
    meta.append(
      element('span', `Reference: ${c.appointmentId}`),
      element('span', `Generated: ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`)
    );

    const patientSection = element('section', '', 'print-section');
    patientSection.append(element('h4', 'Patient Information', 'print-section-title'));
    const patientGrid = element('div', '', 'print-info-grid');
    [['Name', c.patient.name], ['Species', c.patient.species], ['Breed', c.patient.breed], ['Age', c.patient.age], ['Owner', c.patient.owner]].forEach(([label, value]) => {
      const item = element('div', '', 'print-info-item');
      item.append(element('span', label, 'print-info-label'), element('span', value || '—', 'print-info-value'));
      patientGrid.append(item);
    });
    patientSection.append(patientGrid);

    const apptSection = element('section', '', 'print-section');
    apptSection.append(element('h4', 'Appointment Information', 'print-section-title'));
    const apptGrid = element('div', '', 'print-info-grid');
    const timeFmt = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
    const consultationLine = c.status === 'completed' && c.completedAt
      ? `Started ${timeFmt(c.startedAt)} · Completed ${timeFmt(c.completedAt)} · Duration ${c.duration ?? '—'} min`
      : c.startedAt
        ? `Ongoing · started ${timeFmt(c.startedAt)}`
        : 'Not started';
    [['Date & time', `${c.appointment.dateDisplay}, ${c.appointment.time}`], ['Service', svcLabel(c.appointment.service)], ['Reason for visit', c.appointment.reason], ['Consultation', consultationLine]].forEach(([label, value]) => {
      const item = element('div', '', 'print-info-item');
      item.append(element('span', label, 'print-info-label'), element('span', value || '—', 'print-info-value'));
      apptGrid.append(item);
    });
    apptSection.append(apptGrid);

    const soapSection = element('section', '', 'print-section');
    soapSection.append(element('h4', 'SOAP Notes', 'print-section-title'));
    const objectiveParts = [c.soap.weight && `Weight: ${c.soap.weight} kg`, c.soap.temperature && `Temperature: ${c.soap.temperature} °C`, c.soap.heartRate && `Heart rate: ${c.soap.heartRate} bpm`].filter(Boolean);
    [['Subjective', c.soap.subjective], ['Objective', objectiveParts, c.soap.objective], ['Assessment', c.soap.assessment], ['Plan', c.soap.plan]].forEach(([label, parts, note]) => {
      const block = element('div', '', 'print-soap-block');
      block.append(element('span', label, 'print-soap-label'));
      if (Array.isArray(parts) && parts.length) {
        const vitals = element('p', parts.join(' · '), 'print-soap-text');
        block.append(vitals);
      }
      const text = Array.isArray(parts) ? note : parts;
      block.append(element('p', text || 'Not recorded.', 'print-soap-text'));
      soapSection.append(block);
    });

    const rxSection = element('section', '', 'print-section');
    rxSection.append(element('h4', 'Prescriptions', 'print-section-title'));
    if (c.prescriptions.length) {
      const table = element('table', '', 'print-table');
      const head = element('thead');
      const headRow = element('tr');
      ['Medicine', 'Dosage', 'Frequency', 'Duration', 'Instructions'].forEach(label => headRow.append(element('th', label)));
      head.append(headRow);
      const tbody = element('tbody');
      c.prescriptions.forEach(rx => {
        const row = element('tr');
        [rx.medicine, rx.dosage, rx.frequency, rx.duration, rx.instructions].forEach(value => row.append(element('td', value || '—')));
        tbody.append(row);
      });
      table.append(head, tbody);
      rxSection.append(table);
    } else {
      rxSection.append(element('p', 'No prescriptions recorded.', 'print-empty'));
    }

    const labSection = element('section', '', 'print-section');
    labSection.append(element('h4', 'Lab Requests', 'print-section-title'));
    if (c.labRequests.length) {
      c.labRequests.forEach(lab => {
        const item = element('div', '', 'print-lab-item');
        item.append(element('span', lab.test, 'print-soap-label'), element('span', lab.notes || '', 'print-soap-text'));
        labSection.append(item);
      });
    } else {
      labSection.append(element('p', 'No lab requests recorded.', 'print-empty'));
    }

    const footer = element('div', '', 'print-footer');
    const vetBlock = element('div', '', 'print-sig-block');
    vetBlock.append(element('div', '', 'print-sig-line'), element('p', c.veterinarian.name, 'print-sig-label'), element('p', 'Attending Veterinarian', 'print-sig-sub'));
    const ownerBlock = element('div', '', 'print-sig-block');
    ownerBlock.append(element('div', '', 'print-sig-line'), element('p', c.patient.owner, 'print-sig-label'), element('p', 'Pet Owner', 'print-sig-sub'));
    footer.append(vetBlock, ownerBlock);

    const notice = element('p', 'This document is a preview of the consultation record. Confidential — for clinic and pet owner use only.', 'print-notice');

    body.append(letterhead, title, meta, patientSection, apptSection, soapSection, rxSection, labSection, footer, notice);
  }
  function openPreview(patient = selectedPatient) {
    if (!patient) return;
    // Preview must never render invalid clinical data.
    if (window.doctorValidateClinical && !window.doctorValidateClinical()) {
      const rx = window.doctorFirstPrescriptionIssue && window.doctorFirstPrescriptionIssue();
      document.getElementById('save-status').textContent = rx
        ? rx.message
        : 'Fix the highlighted clinical fields before previewing the document.';
      return;
    }
    const consultation = buildConsultation(patient);
    renderConsultationDocument(consultation);
    document.getElementById('document-preview-overlay').classList.add('show');
    document.getElementById('preview-close').focus();
  }
  function closePreview() {
    document.getElementById('document-preview-overlay').classList.remove('show');
    document.getElementById('preview-document').focus();
  }
  document.getElementById('locked-start').addEventListener('click', () => {
    if (selectedPatient) startConsultation(selectedPatient);
  });
  document.getElementById('preview-document').addEventListener('click', () => openPreview(selectedPatient));
  document.getElementById('preview-close').addEventListener('click', closePreview);
  document.getElementById('preview-done').addEventListener('click', closePreview);
  document.getElementById('preview-print').addEventListener('click', () => window.print());
  document.getElementById('document-preview-overlay').addEventListener('click', event => {
    if (event.target === event.currentTarget) closePreview();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('document-preview-overlay').classList.contains('show')) closePreview();
  });
  // ─── SHARED DOCTOR PROFILE / AVAILABILITY (Phase 2B) ────────────────────
  // One shared Doctor store (shared/mock-doctors.js) is the single source of
  // the signed-in doctor's identity + availability: Admin Accounts (account
  // administration), Admin Doctors (availability) and this portal all read
  // and write the same record. TODO(BACKEND): the availability select below
  // becomes PATCH /doctors/:id/availability; identity comes from the
  // authenticated session instead of doctor(1).
  function _currentDoctor() {
    return window.SharedMockDoctors ? window.SharedMockDoctors.currentDoctor() : null;
  }
  const _doctorRecord = _currentDoctor();
  if (_doctorRecord) {
    const greeting = document.getElementById('view-title');
    if (greeting && _doctorRecord.name) {
      greeting.textContent = 'Good morning, ' + _doctorRecord.name.replace(/^Dr\.?\s*/i, 'Dr. ');
    }
    const sidebarName = document.querySelector('.sidebar-user-name');
    if (sidebarName && _doctorRecord.name) sidebarName.textContent = _doctorRecord.name;
    const sidebarRole = document.querySelector('.sidebar-user-role');
    if (sidebarRole && _doctorRecord.role) {
      sidebarRole.textContent = _doctorRecord.role === 'Doctor' ? 'Veterinarian' : _doctorRecord.role;
    }
  }
  // Availability select writes through the shared store, so Admin → Doctor
  // and Doctor → Admin stay in sync via the same record.
  document.getElementById('availability').addEventListener('change', event => {
    const value = event.target.value;
    if (window.SharedMockDoctors && _doctorRecord) {
      const MAP = { 'On-Duty': 'on_duty', 'On Break': 'on_break', 'On Leave': 'on_leave' };
      const _prevAvail = _doctorRecord.availabilityStatus;
      window.SharedMockDoctors.setAvailability(_doctorRecord.doctorId, MAP[value] || 'on_duty');
      if (window.AuditLog) {
        const _next = MAP[value] || 'on_duty';
        const _lab = { on_duty: 'On Duty', on_break: 'On Break', on_leave: 'On Leave' };
        window.AuditLog.add({ actor: { actorType: 'Doctor', actorId: VETERINARIAN.id, actorName: VETERINARIAN.name }, action: 'doctor_availability_changed', entityType: 'doctor', entityId: _doctorRecord.doctorId, description: VETERINARIAN.name + ' set own availability to ' + (_lab[_next] || _next), metadata: { previous: _lab[_prevAvail] || _prevAvail || '', new: _lab[_next] || _next } });
      }
    }
    const paused = value !== 'On-Duty';
    const status = document.getElementById('availability-status');
    status.textContent = paused ? 'New assignments paused' : 'Accepting new assignments';
    status.classList.toggle('assignments-paused', paused);
  });
  // Mobile drawer behaves like the other portals: slide-in panel, dimmed
  // overlay, animated hamburger, and close on overlay click or Escape.
  const menu = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('doctor-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  function openMobileSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    menu.classList.add('active');
    menu.setAttribute('aria-expanded', 'true');
  }
  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    menu.classList.remove('active');
    menu.setAttribute('aria-expanded', 'false');
  }
  menu.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeMobileSidebar();
    else openMobileSidebar();
  });
  overlay.addEventListener('click', closeMobileSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) {
      closeMobileSidebar();
      menu.focus();
    }
  });
  document.querySelectorAll('[data-view]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    navigate(link.dataset.view);
  }));
  window.addEventListener('hashchange', () => showView(window.location.hash.slice(1)));
  window.addEventListener('popstate', () => showView(window.location.hash.slice(1)));
  // The validation gate reveals the panel that owns an invalid field so focus
  // never lands on a hidden input (no history entry: the gate replaceStates).
  document.addEventListener('doctor:reveal-panel', event => showView(event.detail, false));
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('view-title').focus();
  });
  // Navbar clock in the shared Clerk/Admin format: "Fri, Sep 25, 2026 | 9:14:32 PM".
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function longDateTime() {
    const now = new Date();
    const date = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    return date;
  }
  function clockTime(now) {
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds} ${suffix}`;
  }
  function updateClock() {
    const now = new Date();
    document.getElementById('current-date').textContent = longDateTime(now);
    document.getElementById('current-time').textContent = clockTime(now);
  }
  updateClock();
  setInterval(updateClock, 1000);
  // Restore availability from the shared record (Admin-set values survive
  // reload/navigation — Admin → Doctor direction of the shared state).
  if (window.SharedMockDoctors) {
    const _fresh = window.SharedMockDoctors.currentDoctor();
    const REV = { on_duty: 'On-Duty', on_break: 'On Break', on_leave: 'On Leave' };
    const availSel = document.getElementById('availability');
    if (availSel && _fresh) {
      availSel.value = REV[_fresh.availabilityStatus] || 'On-Duty';
      const paused = availSel.value !== 'On-Duty';
      const statusEl = document.getElementById('availability-status');
      statusEl.textContent = paused ? 'New assignments paused' : 'Accepting new assignments';
      statusEl.classList.toggle('assignments-paused', paused);
    }
  }
  if (patients.length) selectPatient(patients[0], false); // empty day → no selection
  showView(window.location.hash.slice(1), false);
})();

// ─── FORM VALIDATION & LIMITS ────────────────────────────────────────────────
// Single source of truth for every input constraint on the consultation form.
// Frontend UX only — the consultation endpoint re-validates everything.
// TODO(BACKEND): mirror these limits server-side.
//
// THREE SEPARATE CONCERNS, never mixed:
//   1. SYNTAX   — "is this well-formed?" (digits only, one decimal point,
//                 heart rate integer). A format error is always a bug.
//   2. SANITY   — provisional, non-clinical typo guardrails. These are NOT
//                 veterinary reference ranges and are never shown as clinical
//                 thresholds; they only catch keystroke/unit mistakes (5000 kg,
//                 90 °C). A value inside them is not thereby "normal".
//   3. LIMITS   — character/number caps on free text and prescription fields.
(function () {
  'use strict';

  // (3) Character limits. Applied as hard maxlength + live counter; the gate
  // re-checks them because maxlength does not constrain programmatic values.
  var TEXT_LIMITS = { subjective: 1000, exam: 1000, assessment: 800, plan: 1000 };

  // (1a) ENTRY GRAMMAR — which characters may reach the field at all.
  //
  // type="number" cannot be relied on: browsers accept "1e5", "-2", "+3" and
  // trailing decimals, and they silently discard characters that the active
  // locale's decimal separator cannot express. The vitals are therefore
  // type="text" with an inputmode hint, and this grammar — not the browser —
  // decides what may be typed, pasted or dropped.
  //
  // intDigits/fracDigits are ENTRY limits, not clinical ranges: they stop a
  // pasted 40-digit number from filling the box. Whether the resulting value
  // is plausible is VITAL_SANITY's job, below.
  var VITAL_GRAMMAR = {
    weight:       { intDigits: 5, fracDigits: 2 }, // e.g. 123.45 kg
    temperature:  { intDigits: 2, fracDigits: 1 }, // e.g. 38.6 °C
    'heart-rate': { intDigits: 3, fracDigits: 0 }  // e.g. 180 bpm — no decimal
  };

  // (1b) Syntax rules — shape only. No clinical values live here.
  var VITAL_SYNTAX = {
    weight:       { integer: false, label: 'Weight' },
    temperature:  { integer: false, label: 'Temperature' },
    'heart-rate': { integer: true,  label: 'Heart rate' }
  };

  // (2) Provisional sanity ranges (typo guardrails, NOT clinical references).
  // TODO(BACKEND): replace with authoritative species/breed reference ranges
  // served by the consultation API; do not widen these in the frontend.
  var VITAL_SANITY = {
    weight:       { min: 0.1, max: 200 },
    temperature:  { min: 30,   max: 45 },
    'heart-rate': { min: 20,   max: 300 }
  };

  // Prescription duration: whole days, 1–365.
  var DURATION_RANGE = { min: 1, max: 365 };

  function ensureMessage(field) {
    var errId = 'err-' + field.id;
    var msg = document.getElementById(errId);
    if (!msg) {
      msg = document.createElement('p');
      msg.id = errId;
      msg.className = 'vhs-field-error';
      msg.style.display = 'none';
      // A structured row shares ONE flex line between several controls, so a
      // message inserted straight after a single control would become another
      // flex sibling and squeeze the inputs into a narrow column. Anchor it
      // below the whole control line instead.
      var host = field.closest ? (field.closest('.medicine-controls') || field) : field;
      host.insertAdjacentElement('afterend', msg);
    }
    return msg;
  }
  function showErr(field, msgEl, text) {
    field.setAttribute('aria-invalid', 'true');
    msgEl.textContent = text;
    msgEl.style.display = 'block';
  }
  function clearErr(field, msgEl) {
    field.removeAttribute('aria-invalid');
    msgEl.style.display = 'none';
  }
  // (1) Syntax check only: well-formed positive decimal / integer.
  // Shares acceptsNumeric() with the entry filter so what can be typed and
  // what counts as valid can never drift apart.
  function validateVitalSyntax(field) {
    var rule = VITAL_SYNTAX[field.id];
    var msg = ensureMessage(field);
    // Deliberately NOT trimmed: whitespace is not part of the grammar, and
    // trimming here would let " 4.3" through as a valid entry.
    var raw = field.value || '';
    if (!raw) { clearErr(field, msg); return true; } // optional fields stay optional
    // Trailing "." is rejected here even though the entry filter tolerates it
    // mid-typing: "4." is a legitimate keystroke on the way to "4.3", but it
    // is not a value the gate may let through.
    if (!acceptsNumeric(raw, VITAL_GRAMMAR[field.id]) || raw.endsWith('.')) {
      showErr(field, msg, rule.label + (rule.integer
        ? ' must be a whole number (digits only).'
        : ' must be a number (digits with at most one decimal point).'));
      return false;
    }
    clearErr(field, msg);
    return true;
  }

  // Pure predicate: is `next` a value this field accepts? Used by the entry
  // filter and by the syntax gate, so the two always agree.
  function acceptsNumeric(next, rule) {
    if (next === '') return true;
    if (rule.fracDigits === 0) return new RegExp('^\\d{0,' + rule.intDigits + '}$').test(next);
    var m = /^(\d*)(?:\.(\d*))?$/.exec(next);
    if (!m) return false; // letters (e/E), signs (+/-), whitespace, second dot
    if ((m[1] || '').length > rule.intDigits) return false;
    if ((m[2] || '').length > rule.fracDigits) return false;
    if (next.indexOf('.') !== -1 && !m[1]) return false; // a bare "." / ".5" is never a value
    return true;
  }

  // Refuse the keystroke; never repair the value afterwards. Deleting the
  // rejected characters from "1e5" would leave "15" — a DIFFERENT number from
  // the one that was typed, recorded as if the vet had entered it. So nothing
  // here writes to field.value: a character the grammar rejects simply never
  // enters the box, and the caller decides how to report what is still wrong.
  //
  // onBad is invoked on every input so the caller can re-check values that
  // arrived without beforeinput (programmatic assignment, draft restore).
  function installStrictNumeric(field, rule, onBad) {
    field.inputMode = rule.fracDigits ? 'decimal' : 'numeric';
    field.addEventListener('beforeinput', function (e) {
      if (e.isComposing) return;                       // IME composition: let it finish
      if (String(e.inputType).indexOf('insert') !== 0) return; // deletions are always allowed
      var incoming = e.data == null ? '' : e.data;
      var next = field.value.slice(0, field.selectionStart) + incoming + field.value.slice(field.selectionEnd);
      if (!acceptsNumeric(next, rule)) e.preventDefault();
    });
    field.addEventListener('input', function () { if (onBad) onBad(field); });
    field.addEventListener('blur', function () { if (onBad) onBad(field); });
  }

  // The numeric parts of a prescription row obey the same entry rules as the
  // vitals: an amount may carry one decimal point, an interval and a duration
  // are whole numbers. "3 days" and "1e2 days" never reach the record.
  var PRESCRIPTION_GRAMMAR = {
    dosageValue:    { intDigits: 3, fracDigits: 2 }, // e.g. 1, 2.5
    frequencyEvery: { intDigits: 3, fracDigits: 0 }, // e.g. 8
    duration:       { intDigits: 3, fracDigits: 0 }  // whole days
  };

  // Rows are built dynamically and restored from drafts, so filters are
  // attached to whichever rows exist now and to any added later. Marking the
  // field keeps this idempotent when the observer re-scans.
  function installRowNumerics(row) {
    Object.keys(PRESCRIPTION_GRAMMAR).forEach(function (part) {
      var field = row.querySelector('[data-part="' + part + '"]') || row.querySelector('[data-field="' + part + '"]');
      if (field && !field.dataset.numericInstalled) {
        field.dataset.numericInstalled = '1';
        // No onBad callback: the row-level prescription check already owns
        // this field's messaging, and duplicating it would fight with that.
        installStrictNumeric(field, PRESCRIPTION_GRAMMAR[part], null);
      }
    });
  }

  // (2) Sanity check only — provisional typo guardrail, never a clinical claim.
  function validateVitalSanity(field) {
    var rule = VITAL_SANITY[field.id];
    if (!rule) return true;
    var msg = ensureMessage(field);
    var raw = field.value || '';
    if (!raw) return true;
    var num = Number(raw);
    if (!isFinite(num) || num < rule.min || num > rule.max) {
      showErr(field, msg, VITAL_SYNTAX[field.id].label + ' looks out of range — enter ' +
        rule.min + ' to ' + rule.max + '.');
      return false;
    }
    clearErr(field, msg);
    return true;
  }

  function validateNumber(field) {
    return validateVitalSyntax(field) && validateVitalSanity(field);
  }

  // Prescription duration: whole days within range (min/max attributes alone
  // never block because the form is novalidate).
  function validateDuration(input) {
    var msg = ensureMessage(input);
    var raw = (input.value || '').trim();
    if (!raw) { clearErr(input, msg); return true; } // completeness handled elsewhere
    if (!/^\d{1,3}$/.test(raw)) {
      showErr(input, msg, 'Enter a valid duration between ' + DURATION_RANGE.min + ' and ' + DURATION_RANGE.max + ' days.');
      return false;
    }
    var num = Number(raw);
    if (num < DURATION_RANGE.min || num > DURATION_RANGE.max) {
      showErr(input, msg, 'Enter a valid duration between ' + DURATION_RANGE.min + ' and ' + DURATION_RANGE.max + ' days.');
      return false;
    }
    clearErr(input, msg);
    return true;
  }

  // ── PRESCRIPTION ROW VALIDATION ──────────────────────────────────────────
  // Completion used to emit one generic "complete the medicine, dosage,
  // frequency, and duration" line and focus whichever box happened to be
  // empty, which never told the vet what was actually wrong. Every part now
  // carries its own message and the offending control is marked, so the first
  // invalid field is also the one that receives focus.
  //
  // An entirely empty row is NOT an error — rows start blank and the vet may
  // leave them unused. A row is only incomplete once any part is filled in.
  var DURATION_MESSAGE = 'Enter a valid duration between ' + DURATION_RANGE.min + ' and ' + DURATION_RANGE.max + ' days.';

  // The two dropdowns open on a placeholder option ("Unit…" / "Choose…"), stored
  // as CHOOSE_UNIT / CHOOSE_PATTERN. Those placeholders are NOT vet input: read
  // as data they made a completely untouched row look filled, which then demanded
  // a medicine name and blocked Save draft / Complete consultation on every
  // consultation that prescribed nothing. Strip them here — exactly as
  // dosageText() and frequencyText() already do when they compose the final
  // sentence. Everything downstream (medicineRowFilled, the dosage and frequency
  // checks) then sees the row the vet actually filled in.
  var PLACEHOLDER_VALUES = { dosageUnit: CHOOSE_UNIT, frequencyPattern: CHOOSE_PATTERN };

  function partValue(row, part) {
    var el = row.querySelector('[data-part="' + part + '"]');
    if (!el) return '';
    var value = String(el.value || '').trim();
    return value === PLACEHOLDER_VALUES[part] ? '' : value;
  }
  function fieldValue(row, field) {
    var el = row.querySelector('[data-field="' + field + '"]');
    return el ? String(el.value || '').trim() : '';
  }
  function medicineRowFilled(m) {
    return !!(m.medicine || m.dosageValue || m.dosageUnit || m.dosageCustom ||
      m.frequencyPattern || m.frequencyEvery || m.frequencyCustom || m.duration);
  }

  // Returns the first problem in document order as { message, field }, or null
  // when the row is empty or entirely well-formed.
  function prescriptionRowIssue(row) {
    var m = {
      medicine: fieldValue(row, 'medicine'),
      dosageValue: partValue(row, 'dosageValue'),
      dosageUnit: partValue(row, 'dosageUnit'),
      dosageCustom: partValue(row, 'dosageCustom'),
      frequencyPattern: partValue(row, 'frequencyPattern'),
      frequencyEvery: partValue(row, 'frequencyEvery'),
      frequencyCustom: partValue(row, 'frequencyCustom'),
      duration: fieldValue(row, 'duration'),
    };
    if (!medicineRowFilled(m)) return null; // untouched row

    var control = part => row.querySelector('[data-part="' + part + '"]');
    var hasDosage = !!(m.dosageValue || m.dosageUnit || m.dosageCustom);
    var hasFrequency = !!(m.frequencyPattern || m.frequencyEvery || m.frequencyCustom);

    if (!m.medicine) return { message: 'Enter the medicine name.', field: row.querySelector('[data-field="medicine"]') };
    if (!m.dosageValue) return { message: 'Enter a dosage amount.', field: control('dosageValue') };
    if (!m.dosageUnit) return { message: 'Choose or enter a dosage unit.', field: control('dosageUnit') };
    if (m.dosageUnit === 'custom' && !m.dosageCustom) {
      return { message: 'Enter the custom dosage unit.', field: control('dosageCustom') };
    }
    if (!hasFrequency) return { message: 'Enter a frequency.', field: control('frequencyPattern') };
    if (INTERVAL_PATTERNS.has(m.frequencyPattern) && !m.frequencyEvery) {
      return { message: 'Enter how many.', field: control('frequencyEvery') };
    }
    if (m.frequencyPattern === 'custom' && !m.frequencyCustom) {
      return { message: 'Enter the dosing frequency.', field: control('frequencyCustom') };
    }
    if (!m.duration) return { message: 'Enter how many days the medicine is for.', field: row.querySelector('[data-field="duration"]') };

    // Everything is filled — now shape and range.
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(m.dosageValue)) {
      return { message: 'Enter the dosage amount as a number, for example 1 or 2.5.', field: control('dosageValue') };
    }
    if (!/^\d{1,3}$/.test(m.duration) || Number(m.duration) < DURATION_RANGE.min || Number(m.duration) > DURATION_RANGE.max) {
      return { message: DURATION_MESSAGE, field: row.querySelector('[data-field="duration"]') };
    }
    if (INTERVAL_PATTERNS.has(m.frequencyPattern)) {
      if (!/^\d{1,3}$/.test(m.frequencyEvery) || Number(m.frequencyEvery) < 1) {
        return { message: 'Enter a whole number greater than 0.', field: control('frequencyEvery') };
      }
    }
    if (fieldValue(row, 'medicine').length > MEDICINE_LIMITS.medicine) {
      return { message: 'Medicine is limited to ' + MEDICINE_LIMITS.medicine + ' characters.', field: row.querySelector('[data-field="medicine"]') };
    }
    if (fieldValue(row, 'instructions').length > MEDICINE_LIMITS.instructions) {
      return { message: 'Owner instructions are limited to ' + MEDICINE_LIMITS.instructions + ' characters.', field: row.querySelector('[data-field="instructions"]') };
    }
    return null;
  }

  // Marks every offending part so the whole row shows what needs attention,
  // while still returning the FIRST one so focus lands somewhere sensible.
  function clearPrescriptionErrors(row) {
    Array.prototype.forEach.call(row.querySelectorAll('[data-part],[data-field]'), function (el) {
      clearErr(el, ensureMessage(el));
    });
  }
  function markPrescriptionError(row, issue) {
    if (issue && issue.field) showErr(issue.field, ensureMessage(issue.field), issue.message);
  }

  // Exposed because the Save / Preview / Complete handlers live in the portal
  // IIFE and must reach the same verdict the gate uses.
  window.doctorFirstPrescriptionIssue = function () {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.medicine-row'));
    rows.forEach(clearPrescriptionErrors);
    var first = null;
    rows.forEach(function (row) {
      var issue = prescriptionRowIssue(row);
      if (issue && !first) first = issue;
      markPrescriptionError(row, issue);
    });
    return first;
  };

  // SOAP text limits — maxlength covers typing/paste; this covers values that
  // were set programmatically (draft restore) and bypassed maxlength.
  function validateTextLimit(field) {
    var limit = TEXT_LIMITS[field.id];
    if (!limit) return true;
    var msg = ensureMessage(field);
    if ((field.value || '').length > limit) {
      showErr(field, msg, 'This field is limited to ' + limit + ' characters.');
      return false;
    }
    clearErr(field, msg);
    return true;
  }

  // Reveal the panel that owns the field so focus never lands on a hidden input.
  function revealField(field) {
    var panel = field.closest ? field.closest('[data-panel]') : null;
    var name = panel ? panel.getAttribute('data-panel') : null;
    if (name) {
      history.replaceState(null, '', '#' + name);
      document.dispatchEvent(new CustomEvent('doctor:reveal-panel', { detail: name }));
    }
  }

  // THE GATE. Save draft, Preview and Complete all call this first: an invalid
  // value blocks the action, reveals the field and moves focus to it.
  window.doctorValidateClinical = function () {
    var firstBad = null;
    var fail = function (ok, field) {
      if (!ok && !firstBad) firstBad = field;
      return ok;
    };
    Object.keys(VITAL_SYNTAX).forEach(function (id) {
      var field = document.getElementById(id);
      if (field) fail(validateNumber(field), field);
    });
    Object.keys(TEXT_LIMITS).forEach(function (id) {
      var field = document.getElementById(id);
      if (field) fail(validateTextLimit(field), field);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.medicine-row'), function (row) {
      var dur = row.querySelector('[data-field="duration"]');
      if (dur) fail(validateDuration(dur), dur);
    });
    // Prescription completeness/range, with field-level messages and focus on
    // the first offending control.
    var rx = window.doctorFirstPrescriptionIssue();
    if (rx && !firstBad) firstBad = rx.field;
    if (!firstBad) return true;
    revealField(firstBad);
    try { firstBad.focus(); } catch (e) {}
    return false;
  };

  var form = document.getElementById('consultation-form');
  if (!form) return;

  // Clear a prescription error as soon as the vet fixes the control, rather
  // than making them press Save again to discover it. Rows that are not
  // currently showing an error are skipped, so ordinary typing costs nothing.
  ['input', 'change'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      var row = e.target.closest ? e.target.closest('.medicine-row') : null;
      if (!row || !row.querySelector('[aria-invalid="true"]')) return;
      window.doctorFirstPrescriptionIssue();
    });
  });

  // Character counters + hard maxlength on the SOAP textareas.
  Object.keys(TEXT_LIMITS).forEach(function (id) {
    var field = document.getElementById(id);
    if (!field) return;
    field.maxLength = TEXT_LIMITS[id];
    var counter = document.createElement('span');
    counter.className = 'vhs-char-counter';
    counter.setAttribute('aria-live', 'polite');
    var update = function () { counter.textContent = field.value.length + '/' + TEXT_LIMITS[id]; };
    field.insertAdjacentElement('afterend', counter);
    field.addEventListener('input', update);
    update();
  });

  // Vitals: refuse characters the grammar rejects, validate near the field, and
  // let the gate (doctorValidateClinical) block the three actions.
  Object.keys(VITAL_SYNTAX).forEach(function (id) {
    var field = document.getElementById(id);
    if (!field) return;
    var rule = VITAL_GRAMMAR[id];
    installStrictNumeric(field, rule, function () {
      // Re-check only when the field is already flagged or holds something the
      // grammar rejects; otherwise ordinary typing does no validation work.
      if (!acceptsNumeric(field.value, rule) || field.getAttribute('aria-invalid')) validateNumber(field);
    });
  });

  // Prescription numeric parts, for rows present now and any added later.
  Array.prototype.forEach.call(document.querySelectorAll('.medicine-row'), installRowNumerics);
  var medicineList = document.getElementById('medicine-list');
  if (medicineList) {
    new MutationObserver(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.medicine-row'), installRowNumerics);
    }).observe(medicineList, { childList: true });
  }

  // Prescription rows are built by the portal script (addMedicine), which sets
  // their maxlength and the strict numeric entry filters at construction time
  // — so no MutationObserver pass is needed to keep late-created or
  // draft-restored rows compliant. What remains here is the validation that
  // runs when the gate fires: duration shape/range plus the row-level
  // completeness rules in doctorFirstPrescriptionIssue().
})();
