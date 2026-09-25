/* Doctor Portal workflow. UI renders from mapAppointment() output only. */
(() => {
  'use strict';

  // Central mock schedule, shaped like the User Portal booking flow
  // (user_id/pet_id/service/appointment_date/appointment_time/visit_reason —
  // see php_files/book-appointment.php). Keeping one fixture list here keeps
  // mock data out of the UI code.
  // TODO(BACKEND): Replace with the get_appointments.php response
  // (filtered by staff_id and today's date) once the endpoint exists.
  const mockSchedule = [
    {
      appointment_id: 'apt301', pet_id: 1, status: 'checked_in', reference_no: 'VHS-20260924-A1B2C3',
      pet_name: 'Luna', pet_type: 'Cat', pet_breed: 'Persian', pet_age: '3 years',
      owner_name: 'Maria Santos',
      service: 'General Consultation', appointment_date: '2026-09-24', appointment_time: '9:00 AM',
      visit_reason: 'Owner reports reduced appetite and repeated vomiting since yesterday.',
      ai_triage: 'Urgent',
      ai_summary: 'Vomiting and reduced appetite over 24 hours in a young adult cat. Same-day assessment recommended; check hydration and consider dietary history.',
      visits: [
        { date: '2026-06-12', title: 'Veterinary note', note: 'Routine examination recorded; owner reported normal appetite and activity.' },
        { date: '2026-03-10', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    {
      appointment_id: 'apt302', pet_id: 2, status: 'checked_in', reference_no: 'VHS-20260924-D4E5F6',
      pet_name: 'Max', pet_type: 'Dog', pet_breed: 'Labrador retriever', pet_age: '5 years',
      owner_name: 'Sam Reyes',
      service: 'Emergency assessment', appointment_date: '2026-09-24', appointment_time: '9:30 AM',
      visit_reason: 'Owner reports difficulty breathing since early morning.',
      ai_triage: 'Emergency',
      ai_summary: 'Acute breathing difficulty in a middle-aged dog. Immediate veterinarian evaluation required; prepare for possible oxygen support and thoracic imaging.',
      visits: [
        { date: '2026-07-21', title: 'Veterinary note', note: 'Follow-up examination recorded; no new concerns reported at that visit.' },
        { date: '2026-02-05', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
      ]
    },
    {
      appointment_id: 'apt303', pet_id: 3, status: 'confirmed', reference_no: 'VHS-20260924-G7H8I9',
      pet_name: 'Milo', pet_type: 'Dog', pet_breed: 'Aspin', pet_age: '2 years',
      owner_name: 'Jamie Cruz',
      service: 'Wellness examination', appointment_date: '2026-09-24', appointment_time: '10:00 AM',
      visit_reason: 'Scheduled wellness visit; owner reports no current concerns.',
      ai_triage: 'Routine',
      ai_summary: 'Young adult dog presenting for routine wellness examination; no reported concerns. Review vaccination schedule and weight trend.',
      visits: []
    }
  ];

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
      time: a.appointmentTime,
      date: a.appointmentDate,
      dateDisplay: new Date(`${a.appointmentDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      service: a.service,
      reason: a.visitContext,
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
  function statusFor(patient) {
    const draft = draftFor(patient);
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
  const emptyMedicine = () => ({ medicine: '', dosage: '', frequency: '', duration: '', instructions: '' });
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
    draft.medicines = Array.from(document.querySelectorAll('.medicine-row'), row => {
      const values = {};
      row.querySelectorAll('input').forEach(input => { values[input.dataset.field] = input.value; });
      return values;
    });
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
  function addMedicine(values = emptyMedicine()) {
    const row = element('fieldset', '', 'medicine-row');
    const sequence = ++medicineSequence;
    const fieldSpec = [
      ['medicine', 'Medicine', 'e.g. Amoxicillin 250mg'],
      ['dosage', 'Dosage', 'e.g. 1 tablet'],
      ['frequency', 'Frequency', 'e.g. every 12 hours'],
      ['duration', 'Duration', 'e.g. 7 days']
    ];
    for (const [key, label, placeholder] of fieldSpec) {
      const group = element('div');
      const caption = element('label', label, 'form-label');
      const input = element('input', '', 'form-input');
      input.type = 'text';
      input.id = `medicine-${sequence}-${key}`;
      input.dataset.field = key;
      input.value = values[key] || '';
      input.maxLength = 200;
      input.placeholder = placeholder;
      caption.htmlFor = input.id;
      group.append(caption, input);
      row.append(group);
    }
    const instructionGroup = element('div', '', 'medicine-instructions');
    const instructionLabel = element('label', 'Instructions for the owner', 'form-label');
    const instructionInput = element('input', '', 'form-input');
    instructionInput.type = 'text';
    instructionInput.id = `medicine-${sequence}-instructions`;
    instructionInput.dataset.field = 'instructions';
    instructionInput.value = values.instructions || '';
    instructionInput.maxLength = 200;
    instructionInput.placeholder = 'e.g. give with food';
    instructionLabel.htmlFor = instructionInput.id;
    instructionGroup.append(instructionLabel, instructionInput);
    row.append(instructionGroup);
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
    document.getElementById('complete-consultation').disabled = statusFor(patient) !== 'in_consultation';
    document.getElementById('ai-summary').textContent = patient.aiSummary;
    document.getElementById('context-name').textContent = patient.name;
    document.getElementById('context-appointment').textContent = `${patient.species} · ${patient.breed} · ${patient.dateDisplay}, ${patient.time} · ${patient.service}`;
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
    record.replaceChildren(name, element('p', `${patient.dateDisplay} · ${patient.time} · ${patient.service}`), details, element('p', patient.reason, 'visit-reason'), element('h3', 'Clinical history'));
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
      cont.addEventListener('click', () => navigate('notes'));
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
    captureDraft();
    draft.status = 'in_consultation';
    draft.startedAt = new Date().toISOString();
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
  document.getElementById('queue-meta').textContent = `${patients[0].dateDisplay} · ${patients.length} appointments`;
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
    const partial = Array.from(document.querySelectorAll('.medicine-row')).find(row => {
      const inputs = Array.from(row.querySelectorAll('input'));
      const core = inputs.filter(input => input.dataset.field !== 'instructions');
      return core.some(input => input.value.trim()) && core.some(input => !input.value.trim());
    });
    if (partial) {
      history.replaceState(null, '', '#orders');
      showView('orders', false);
      status.textContent = 'Complete the medicine, dosage, frequency, and duration, or remove the incomplete row.';
      Array.from(partial.querySelectorAll('input')).find(input => !input.value.trim()).focus();
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
    captureDraft();
    const incomplete = draft.medicines.find(m => {
      const core = [m.medicine, m.dosage, m.frequency, m.duration];
      return core.some(v => v.trim()) && core.some(v => !v.trim());
    });
    if (incomplete) {
      history.replaceState(null, '', '#orders');
      showView('orders', false);
      status.textContent = 'Complete the medicine, dosage, frequency, and duration, or remove the incomplete row.';
      return;
    }
    draft.status = 'completed';
    draft.completedAt = new Date().toISOString();
    draft.durationMinutes = durationBetween(draft.startedAt, draft.completedAt);
    draft.saved = true;
    draft.updatedAt = draft.completedAt;
    renderQueue();
    renderHeader(currentView);
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
      prescriptions: draft.medicines.filter(m => m.medicine.trim()).map(m => ({ medicine: m.medicine.trim(), dosage: m.dosage.trim(), frequency: m.frequency.trim(), duration: m.duration.trim(), instructions: m.instructions.trim() })),
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
    [['Date & time', `${c.appointment.dateDisplay}, ${c.appointment.time}`], ['Service', c.appointment.service], ['Reason for visit', c.appointment.reason], ['Consultation', consultationLine]].forEach(([label, value]) => {
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
  document.getElementById('availability').addEventListener('change', event => {
    const paused = event.target.value !== 'On-Duty';
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
  selectPatient(patients[0], false);
  showView(window.location.hash.slice(1), false);
})();
