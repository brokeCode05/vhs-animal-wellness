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
      appointment_id: 'apt301', pet_id: 1,
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
      appointment_id: 'apt302', pet_id: 2,
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
      appointment_id: 'apt303', pet_id: 3,
      pet_name: 'Milo', pet_type: 'Dog', pet_breed: 'Aspin', pet_age: '2 years',
      owner_name: 'Jamie Cruz',
      service: 'Wellness examination', appointment_date: '2026-09-24', appointment_time: '10:00 AM',
      visit_reason: 'Scheduled wellness visit; owner reports no current concerns.',
      ai_triage: 'Routine',
      ai_summary: 'Young adult dog presenting for routine wellness examination; no reported concerns. Review vaccination schedule and weight trend.',
      visits: []
    }
  ];

  // Data-mapping boundary between the booking-flow appointment shape and the
  // doctor UI. If the User Portal appointment form changes, adapt here — not
  // in the rendering code below.
  // TODO(BACKEND): Map the JSON fields of the appointments endpoint response.
  function mapAppointment(appt) {
    return {
      id: appt.appointment_id,
      name: appt.pet_name,
      species: appt.pet_type,
      breed: appt.pet_breed,
      age: appt.pet_age,
      owner: appt.owner_name,
      time: appt.appointment_time,
      date: appt.appointment_date,
      dateDisplay: new Date(`${appt.appointment_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      service: appt.service,
      reason: appt.visit_reason,
      severity: appt.ai_triage || 'Routine',
      aiSummary: appt.ai_summary || '',
      history: appt.visits || []
    };
  }
  const patients = mockSchedule.map(mapAppointment);

  const queue = document.getElementById('patient-queue');
  const record = document.getElementById('patient-record');
  const form = document.getElementById('consultation-form');
  const fields = ['subjective', 'weight', 'temperature', 'heartRate', 'exam', 'assessment', 'plan'];
  const drafts = new Map();
  let selectedPatient = null;
  let medicineSequence = 0;
  const views = {
    patients: ['Today’s Patients', 'Select a patient to review their appointment and clinical history.'],
    notes: ['Consultation Notes', 'Document the active patient’s consultation using SOAP.'],
    orders: ['Prescriptions & Labs', 'Prepare medication instructions and internal test requests.']
  };
  function showView(view, moveFocus = true) {
    if (!Object.hasOwn(views, view)) view = 'patients';
    captureDraft();
    document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== view; });
    form.hidden = view === 'patients';
    document.getElementById('patient-context').hidden = view === 'patients';
    document.getElementById('view-title').textContent = views[view][0];
    document.getElementById('view-description').textContent = views[view][1];
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
    if (!drafts.has(patient.id)) drafts.set(patient.id, { fields: {}, medicines: [emptyMedicine()], labs: [], reviewed: false, saved: false });
    return drafts.get(patient.id);
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
    document.getElementById('ai-summary').textContent = patient.aiSummary;
    document.getElementById('context-name').textContent = patient.name;
    document.getElementById('context-appointment').textContent = `${patient.species} · ${patient.breed} · ${patient.dateDisplay}, ${patient.time} · ${patient.service}`;
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
    if (moveFocus) {
      document.getElementById('record-heading').focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('record-heading').scrollIntoView({ block: 'start' });
    }
  }
  // Clinic-list rows modeled on the Clerk appointments table: one compact
  // row per appointment, scannable columns, selected row in the VHS active
  // treatment (accent tint + left marker). Rows are focusable and respond
  // to Enter/Space like the buttons they replace.
  patients.forEach(patient => {
    const row = element('tr', '', `queue-row ${patient.severity.toLowerCase()}`);
    row.tabIndex = 0;
    row.dataset.patientId = patient.id;
    row.setAttribute('aria-pressed', 'false');
    row.setAttribute('aria-label', `${patient.time}, ${patient.name}, owner ${patient.owner}, ${patient.service}, triage ${patient.severity}. Select to open record.`);
    const badgeCell = element('td');
    badgeCell.append(element('span', patient.severity, `severity ${patient.severity.toLowerCase()}`));
    row.append(
      element('td', patient.time, 'q-time'),
      element('td', patient.name, 'q-name'),
      element('td', patient.owner, 'q-owner'),
      element('td', patient.service, 'q-service'),
      badgeCell
    );
    const activate = () => selectPatient(patient);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    queue.append(row);
  });
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
  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  selectPatient(patients[0], false);
  showView(window.location.hash.slice(1), false);
})();
