/* Fictional fixtures only. No API, AI service, persistence, or handoff. */
(() => {
  'use strict';
  const patients = [
    { id: 'sample-luna', name: 'Luna', owner: 'Alex Santos', species: 'Cat', breed: 'Domestic shorthair', age: '3 years', time: '9:00 AM', service: 'Consultation', severity: 'Urgent', reason: 'Owner reports reduced appetite and repeated vomiting since yesterday.', history: [
      { date: '2026-06-12', title: 'Veterinary note', note: 'Routine examination recorded; owner reported normal appetite and activity.' },
      { date: '2026-03-10', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
    ] },
    { id: 'sample-max', name: 'Max', owner: 'Sam Reyes', species: 'Dog', breed: 'Labrador retriever', age: '5 years', time: '9:30 AM', service: 'Emergency assessment', severity: 'Emergency', reason: 'Owner reports difficulty breathing. Requires immediate veterinarian review.', history: [
      { date: '2026-07-21', title: 'Veterinary note', note: 'Follow-up examination recorded; no new concerns reported at that visit.' },
      { date: '2026-02-05', title: 'Vaccination', note: 'Rabies vaccination recorded.' }
    ] },
    { id: 'sample-milo', name: 'Milo', owner: 'Jamie Cruz', species: 'Dog', breed: 'Aspin', age: '2 years', time: '10:00 AM', service: 'Wellness examination', severity: 'Routine', reason: 'Scheduled wellness visit; owner reports no current concerns.', history: [] }
  ];
  const queue = document.getElementById('patient-queue');
  const record = document.getElementById('patient-record');
  const form = document.getElementById('consultation-form');
  const fields = ['subjective', 'weight', 'temperature', 'heartRate', 'exam', 'assessment', 'plan'];
  const drafts = new Map();
  let selectedPatient = null;
  let medicineSequence = 0;
  const views = {
    patients: ['Patient Workspace', 'Select a patient to review their appointment and clinical history.'],
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
    document.getElementById('doctor-sidebar').classList.remove('open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
    if (moveFocus) {
      document.getElementById('view-title').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  function navigate(view) {
    if (window.location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
    showView(view);
  }
  const emptyMedicine = () => ({ medicine: '', dosage: '', frequency: '' });
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
    document.getElementById('draft-state').textContent = 'Unsaved local draft';
    document.getElementById('save-status').textContent = '';
  }
  function addMedicine(values = emptyMedicine()) {
    const row = element('fieldset', '', 'medicine-row');
    row.append(element('legend', 'Medicine instructions'));
    const sequence = ++medicineSequence;
    for (const [key, label] of [['medicine', 'Medicine name'], ['dosage', 'Dosage'], ['frequency', 'Frequency']]) {
      const group = element('div');
      const caption = element('label', label, 'form-label');
      const input = element('input', '', 'form-input');
      input.type = 'text';
      input.id = `medicine-${sequence}-${key}`;
      input.dataset.field = key;
      input.value = values[key];
      input.maxLength = 200;
      caption.htmlFor = input.id;
      group.append(caption, input);
      row.append(group);
    }
    const remove = element('button', 'Remove', 'btn-secondary');
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
  // Text is assigned through textContent so future record strings are not HTML.
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
    document.getElementById('ai-summary').textContent = patient.reason;
    document.getElementById('context-name').textContent = patient.name;
    document.getElementById('context-appointment').textContent = `${patient.species} · ${patient.breed} · 24 Sep 2026, ${patient.time} · ${patient.service}`;
    document.getElementById('draft-state').textContent = draft.saved ? 'Saved locally' : 'Unsaved local draft';
    document.getElementById('save-status').textContent = '';
    queue.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.patientId === patient.id)));
    const name = element('h3', patient.name);
    const details = element('dl', '', 'pet-details');
    for (const [label, value] of [['Species', patient.species], ['Breed', patient.breed], ['Age', patient.age], ['Owner', patient.owner]]) {
      const pair = element('div');
      pair.append(element('dt', label), element('dd', value));
      details.append(pair);
    }
    record.replaceChildren(name, element('p', `${patient.time} · ${patient.service}`), details, element('p', patient.reason, 'visit-reason'), element('h3', 'Clinical history'));
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
  patients.forEach(patient => {
    const button = element('button', '', `patient-card ${patient.severity.toLowerCase()}`);
    button.type = 'button';
    button.dataset.patientId = patient.id;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-controls', 'patient-record');
    const heading = element('span', '', 'card-row');
    heading.append(element('strong', patient.name), element('span', patient.time));
    button.append(heading, element('span', `${patient.species} · ${patient.service}`, 'card-detail'), element('span', `AI triage: ${patient.severity}`, `severity ${patient.severity.toLowerCase()}`));
    button.addEventListener('click', () => selectPatient(patient));
    queue.append(button);
  });
  form.addEventListener('input', event => {
    if (event.target.id === 'reviewed') {
      captureDraft();
      draftFor(selectedPatient).saved = false;
      document.getElementById('draft-state').textContent = 'Unsaved local draft';
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
      return inputs.some(input => input.value.trim()) && inputs.some(input => !input.value.trim());
    });
    if (partial) {
      history.replaceState(null, '', '#orders');
      showView('orders', false);
      status.textContent = 'Complete the medicine name, dosage, and frequency, or remove the incomplete row.';
      Array.from(partial.querySelectorAll('input')).find(input => !input.value.trim()).focus();
      return;
    }
    if (!document.getElementById('reviewed').checked) {
      status.textContent = 'Review the consultation draft and check the acknowledgement before saving.';
      document.getElementById('reviewed').focus();
      return;
    }
    draftFor(selectedPatient).saved = true;
    document.getElementById('draft-state').textContent = 'Saved locally';
    status.textContent = `${selectedPatient.name}’s draft saved in this page only. Nothing sent.`;
  });
  document.getElementById('availability').addEventListener('change', event => {
    const paused = event.target.value !== 'On-Duty';
    const status = document.getElementById('availability-status');
    status.textContent = paused ? 'New assignments paused · local only' : 'Accepting new assignments · local only';
    status.classList.toggle('assignments-paused', paused);
  });
  const menu = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('doctor-sidebar');
  menu.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
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
