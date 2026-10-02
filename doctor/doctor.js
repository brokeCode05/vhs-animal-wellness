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
  // 2. Pet/EMR data: DOCTOR_EMR below, keyed by petId (clinical history is
  //    not part of the appointment record).
  // 3. Consultation records: drafts Map keyed by appointmentId (see below).
  // TODO(BACKEND): Replace the shared mock source with get_appointments.php
  // (filtered by staff_id and today's date) once the endpoint exists.
  function DOCTOR_EMR_DEFAULT(petName) {
    return {
      pet_age: '',
      ai_triage: 'Routine',
      ai_summary: '',
      visits: []
    };
  }
  // Doctor EMR is keyed by the SHARED petIds (shared/mock-users.js):
  // 1 Luna, 2 Buddy, 3 Mochi, 4 Max, 5 Milo. Ownership lives in the shared
  // pet records, never inferred from names.
  const DOCTOR_EMR = {
    1: { // Luna — Cat, Persian (owner: Maria Santos, userId 1)
      pet_age: '3 years',
      ai_triage: 'Urgent',
      ai_summary: 'Vomiting and reduced appetite over 24 hours in a young adult cat. Same-day assessment recommended; check hydration and consider dietary history.',
      visits: [
        { date: '2026-06-12', title: 'Veterinary note', note: 'Routine examination recorded; owner reported normal appetite and activity.' },
        { date: '2026-03-10', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    2: { // Buddy — Dog, Golden Retriever (owner: Maria Santos, userId 1)
      pet_age: '5 years',
      ai_triage: 'Emergency',
      ai_summary: 'Acute breathing difficulty in a middle-aged dog. Immediate veterinarian evaluation required; prepare for possible oxygen support and thoracic imaging.',
      visits: [
        { date: '2026-07-21', title: 'Veterinary note', note: 'Follow-up examination recorded; no new concerns reported at that visit.' },
        { date: '2026-02-05', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    3: { // Mochi — Cat, Siamese (owner: Maria Santos, userId 1)
      pet_age: '2 years',
      ai_triage: 'Routine',
      ai_summary: 'Young adult dog presenting for routine wellness examination; no reported concerns. Review vaccination schedule and weight trend.',
      visits: []
    },
    4: { // Max — Dog, Labrador retriever (owner: Sam Reyes, userId 2)
      pet_age: '5 years',
      ai_triage: 'Emergency',
      ai_summary: 'Acute breathing difficulty in a middle-aged dog. Immediate veterinarian evaluation required; prepare for possible oxygen support and thoracic imaging.',
      visits: [
        { date: '2026-07-21', title: 'Veterinary note', note: 'Follow-up examination recorded; no new concerns reported at that visit.' },
        { date: '2026-02-05', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    5: { // Milo — Dog, Aspin (owner: Jamie Cruz, userId 3)
      pet_age: '2 years',
      ai_triage: 'Routine',
      ai_summary: 'Young adult dog presenting for routine wellness examination; no reported concerns. Review vaccination schedule and weight trend.',
      visits: []
    }
  };

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
    var emr = DOCTOR_EMR[appt.petId] || DOCTOR_EMR_DEFAULT(appt.pet ? appt.pet.name : '');
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
      aiSummary: appt.ai_summary || '',
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
  const VETERINARIAN = { id: 'vet-001', name: 'Dr. Santos', role: 'Veterinarian' };
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
    const draft = draftFor(patient);
    if (window.SharedMockAppointments && patient.appointmentId) {
      const rec = window.SharedMockAppointments.byId(patient.appointmentId);
      if (rec) {
        const s = window.AppointmentContract
          ? window.AppointmentContract.normalizeStatus(rec.status)
          : rec.status;
        if (s === 'checked_in' || s === 'in_consultation' || s === 'completed' || s === 'canceled') return s;
        return draft.status || 'upcoming';
      }
    }
    if (draft.status) return draft.status;
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
    if (!drafts.has(patient.id)) drafts.set(patient.id, { fields: {}, medicines: [emptyMedicine()], labs: [], reviewed: false, saved: false, status: '', startedAt: null, completedAt: null, durationMinutes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return drafts.get(patient.id);
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
    draft.updatedAt = new Date().toISOString();
  }
  function markChanged() {
    const draft = draftFor(selectedPatient);
    draft.saved = false;
    // Any clinical edit invalidates the prior review acknowledgement.
    document.getElementById('reviewed').checked = false;
    captureDraft();
    document.getElementById('draft-state').textContent = 'Unsaved draft';
    document.getElementById('save-status').textContent = '';
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
    document.getElementById('context-name').textContent = patient.name;
    document.getElementById('context-appointment').textContent = `${patient.species} · ${patient.breed} · ${patient.dateDisplay}, ${patient.time} · ${svcLabel(patient.service)}`;
    const timerLine = document.getElementById('context-timer');
    if (draft.status === 'in_consultation' && draft.startedAt) {
      const startClock = new Date(draft.startedAt).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
      timerLine.hidden = false;
      timerLine.replaceChildren(
        element('span', STATUS_LABELS[draft.status], `appt-status in_consultation`),
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
        if (draft.status !== 'in_consultation' && draft.status !== 'completed') {
          const store = window.SharedMockAppointments;
          const rec = store && patient.appointmentId ? store.byId(patient.appointmentId) : null;
          draft.status = 'in_consultation';
          draft.startedAt = (rec && rec.consultationStartedAt) || draft.startedAt || new Date().toISOString();
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
    if (draft.status === 'in_consultation' || draft.status === 'completed') return;
    // Same record, same lifecycle: the shared store stamps
    // consultationStartedAt and sets in_consultation for every portal.
    // TODO(BACKEND): PATCH /appointments/:id/status { in_consultation }.
    const store = window.SharedMockAppointments;
    const result = store && patient.appointmentId ? store.setStatus(patient.appointmentId, 'in_consultation') : { ok: false };
    if (store && patient.appointmentId && !result.ok) return; // guard rejected the transition
    if (window.AuditLog) window.AuditLog.add({ actor: { actorType: 'Doctor', actorId: VETERINARIAN.id, actorName: VETERINARIAN.name }, action: 'consultation_started', entityType: 'appointment', entityId: patient.appointmentId, referenceNo: patient.referenceNo || '', description: VETERINARIAN.name + ' started consultation for ' + patient.name });
    captureDraft();
    draft.status = 'in_consultation';
    draft.startedAt = (result && result.appointment && result.appointment.consultationStartedAt) || new Date().toISOString();
    draft.completedAt = null;
    draft.durationMinutes = null;
    draft.updatedAt = draft.startedAt;
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
      if (draft.status !== 'in_consultation' || !draft.startedAt) return;
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
      draftFor(selectedPatient).saved = false;
      document.getElementById('draft-state').textContent = 'Unsaved draft';
      document.getElementById('save-status').textContent = '';
    } else markChanged();
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
    draftFor(selectedPatient).saved = true;
    document.getElementById('draft-state').textContent = 'Saved on this device';
    // TODO(BACKEND): Persist the consultation through the consultation endpoint
    // and enable front-desk handoff once the API exists.
    status.textContent = 'Draft saved on this device.';
  });
  // Complete ends the lifecycle: stop the timer, record end time + duration.
  // TODO(BACKEND): Finalize through the consultation API; the backend then
  // releases the record to Clerk/Admin and the owner's account.
  document.getElementById('complete-consultation').addEventListener('click', () => {
    const draft = draftFor(selectedPatient);
    const status = document.getElementById('save-status');
    // TODO(BACKEND): Validate the completion transition server-side.
    if (draft.status === 'completed') { status.textContent = 'This consultation is already completed.'; return; }
    if (draft.status !== 'in_consultation' || statusFor(selectedPatient) !== 'in_consultation') { status.textContent = 'Start the consultation before completing it.'; return; }
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
    // Same canonical record: the shared store stamps
    // consultationCompletedAt and sets completed for every portal. The local
    // duration/timer logic is preserved untouched.
    // TODO(BACKEND): PATCH /appointments/:id/status { completed }.
    const store = window.SharedMockAppointments;
    if (store && selectedPatient.appointmentId) store.setStatus(selectedPatient.appointmentId, 'completed');
    if (window.AuditLog) window.AuditLog.add({ actor: { actorType: 'Doctor', actorId: VETERINARIAN.id, actorName: VETERINARIAN.name }, action: 'consultation_completed', entityType: 'appointment', entityId: selectedPatient.appointmentId, referenceNo: selectedPatient.referenceNo || '', description: VETERINARIAN.name + ' completed consultation for ' + selectedPatient.name });
    draft.status = 'completed';
    draft.completedAt = new Date().toISOString();
    draft.durationMinutes = durationBetween(draft.startedAt, draft.completedAt);
    draft.saved = true;
    draft.updatedAt = draft.completedAt;
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
      status: draft.status || statusFor(patient),
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
      veterinarian: { name: VETERINARIAN.name, role: VETERINARIAN.role },
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

  function partValue(row, part) {
    var el = row.querySelector('[data-part="' + part + '"]');
    return el ? String(el.value || '').trim() : '';
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
