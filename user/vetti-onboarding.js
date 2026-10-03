/* ============================================================
   VETTIONBOARDING — first meeting, zero-pet path, first-pet form
   ============================================================

   1. FIRST-TIME INTRO — shown once. Offers Skip, and can be replayed
      on demand. The long introduction is never repeated on login.
   2. ZERO-PET PATH — an owner with no pets gets a guided, in-
      conversation route to their first pet. Never a lockout.
   3. COMPACT FIRST-PET FORM — a short inline form rendered INSIDE the
      conversation, not a separate page. Field limits are reused from
      VHSPetOnboarding.PET_LIMITS so both pet forms agree.

   PRODUCT RULE: signup creates the OWNER ACCOUNT ONLY. Adding a pet
   here creates exactly one pet record. No appointment, document,
   vaccine or history is ever invented for it.

   HONESTY RULE: the pet is written to the shared frontend store only.
   Nothing is sent to a server, and the UI says so.

   v1.0.0
   ============================================================ */
(function (global) {
  'use strict';

  // ── REUSE: the one pet-form limits table ───────────────────────────────
  // pet-onboarding.js owns PET_LIMITS (mirrored later in Laravel). The
  // compact form reads the SAME table so a name accepted here is a name
  // accepted by the full Add Pet form, and vice versa.
  function limits() {
    return (window.VHSPetOnboarding && window.VHSPetOnboarding.PET_LIMITS)
      || { name: 50, breedCustom: 60, age: { digits: 2, max: 50 }, weightKg: { digits: 3, decimals: 2, max: 200 } };
  }

  var SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];
  var MICROCHIP_PATTERN = /^[A-Za-z0-9-]*$/;

  function escapeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── THE INTRO ─────────────────────────────────────────────────────────
  // Returns the markup for the first-meeting block. Kept as markup (not
  // state text) because it carries Skip + Replay controls.
  function introMarkup(firstName) {
    return ''
      + '<div class="vetti-intro" data-vetti-intro="1">'
      + '  <h2 class="vetti-intro-title">Nice to meet you, ' + escapeText(firstName) + '.</h2>'
      + '  <p class="vetti-intro-body">'
      + '    I&rsquo;m Vetti, the VHS pet-care assistant. Ask me to add a pet, show you '
      + '    the pets on your account, or point you to appointments, documents and services.'
      + '  </p>'
      + '  <p class="vetti-intro-note">'
      + '    Everything here is a working demo on this device. Nothing is sent to the '
      + '    clinic until the portal is connected.'
      + '  </p>'
      + '  <div class="vetti-intro-actions">'
      + '    <button type="button" class="btn-secondary vetti-intro-skip" data-vetti-action="skip-intro">'
      + '      Skip intro'
      + '    </button>'
      + '    <button type="button" class="btn-link vetti-intro-replay" data-vetti-action="replay-intro">'
      + '      Replay intro'
      + '    </button>'
      + '  </div>'
      + '</div>';
  }

  // ── THE COMPACT FIRST-PET FORM ────────────────────────────────────────
  // Five fields only: enough to create a real pet record now, with the
  // rest honestly marked as fillable later on My Pets.
  function petFormMarkup() {
    var L = limits();
    return ''
      + '<form class="vetti-petform" id="vettiPetForm" novalidate>'
      + '  <p class="vetti-petform-lead">Just the basics for now \u2014 you can add the rest on My Pets.</p>'
      + '  <div class="vetti-field">'
      + '    <label for="vettiPetName">Pet name</label>'
      + '    <input id="vettiPetName" name="vetti_pet_name" type="text" maxlength="' + L.name + '"'
      + '           autocomplete="off" placeholder="e.g. Bruno">'
      + '    <p class="vetti-field-error" id="vettiErr-vettiPetName" role="alert" hidden></p>'
      + '  </div>'
      + '  <div class="vetti-field-row">'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetSpecies">Species</label>'
      + '      <select id="vettiPetSpecies" name="vetti_pet_species">'
      + '        <option value="">Choose\u2026</option>'
      + SPECIES.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('')
      + '      </select>'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetSpecies" role="alert" hidden></p>'
      + '    </div>'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetBreed">Breed <span class="vetti-optional">(optional)</span></label>'
      + '      <input id="vettiPetBreed" name="vetti_pet_breed" type="text" maxlength="' + L.breedCustom + '"'
      + '             autocomplete="off" placeholder="e.g. Aspin">'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetBreed" role="alert" hidden></p>'
      + '    </div>'
      + '  </div>'
      + '  <div class="vetti-field-row">'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetAge">Age in years <span class="vetti-optional">(optional)</span></label>'
      + '      <input id="vettiPetAge" name="vetti_pet_age" type="text" inputmode="numeric" maxlength="'
      + L.age.digits + '" autocomplete="off" spellcheck="false" placeholder="e.g. 3">'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetAge" role="alert" hidden></p>'
      + '    </div>'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetWeight">Weight in kg <span class="vetti-optional">(optional)</span></label>'
      + '      <input id="vettiPetWeight" name="vetti_pet_weight" type="text" inputmode="decimal" maxlength="'
      + (L.weightKg.digits + 1 + L.weightKg.decimals) + '" autocomplete="off" spellcheck="false" placeholder="e.g. 4.5">'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetWeight" role="alert" hidden></p>'
      + '    </div>'
      + '  </div>'
      + '  <div class="vetti-petform-actions">'
      + '    <button type="submit" class="btn-primary">Add pet</button>'
      + '    <button type="button" class="btn-link" data-vetti-action="cancel-pet-form">Not now</button>'
      + '  </div>'
      + '  <p class="vetti-petform-footnote">Saved on this device only in this demo.</p>'
      + '</form>';
  }

  // ── VALIDATION (same rules, compact field set) ────────────────────────
  function val(id) {
    var node = document.getElementById(id);
    return node ? String(node.value) : '';
  }
  function trimmed(id) {
    return val(id).replace(/^\s+|\s+$/g, '');
  }

  function setError(id, message) {
    var node = document.getElementById('vettiErr-' + id);
    var control = document.getElementById(id);
    if (node) {
      node.textContent = message || '';
      node.hidden = !message;
    }
    if (control) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
  }

  function ruleName() {
    var v = trimmed('vettiPetName');
    if (!v) return 'Enter your pet\u2019s name.';
    if (v.length > limits().name) {
      return 'Pet name must be ' + limits().name + ' characters or fewer.';
    }
    return '';
  }

  function ruleSpecies() {
    var v = val('vettiPetSpecies');
    if (!v) return 'Choose a species.';
    if (SPECIES.indexOf(v) === -1) return 'Choose a species from the list.';
    return '';
  }

  function ruleBreed() {
    var v = trimmed('vettiPetBreed');
    if (v && !MICROCHIP_PATTERN.test(v.replace(/\s+/g, '-'))) {
      return 'Use letters, numbers and hyphens only.';
    }
    return '';
  }

  function ruleAge() {
    var v = trimmed('vettiPetAge');
    if (!v) return '';
    if (!/^[0-9]{1,2}$/.test(v)) {
      return 'Enter age in whole years (0\u2013' + limits().age.max + ').';
    }
    if (parseInt(v, 10) > limits().age.max) {
      return 'Enter an age between 0 and ' + limits().age.max + ' years.';
    }
    return '';
  }

  function ruleWeight() {
    var L = limits().weightKg;
    var v = trimmed('vettiPetWeight');
    if (!v) return '';
    var re = new RegExp('^[0-9]{1,' + L.digits + '}(\\.[0-9]{1,' + L.decimals + '})?$');
    if (!re.test(v)) return 'Enter weight as a number, up to ' + L.decimals + ' decimal places.';
    if (parseFloat(v) > L.max) return 'Enter a weight between 0 and ' + L.max + ' kg.';
    return '';
  }

  var RULES = [
    ['vettiPetName', ruleName],
    ['vettiPetSpecies', ruleSpecies],
    ['vettiPetBreed', ruleBreed],
    ['vettiPetAge', ruleAge],
    ['vettiPetWeight', ruleWeight]
  ];

  // Returns true when the form is clean; otherwise focuses the first bad
  // field so the user is not hunting for it.
  function validatePetForm() {
    var firstBad = null;
    RULES.forEach(function (entry) {
      var message = entry[1]();
      setError(entry[0], message);
      if (message && !firstBad) firstBad = entry[0];
    });
    if (!firstBad) return true;
    var node = document.getElementById(firstBad);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof node.focus === 'function') node.focus();
    }
    return false;
  }

  function clearErrors() {
    RULES.forEach(function (entry) { setError(entry[0], ''); });
  }

  // Numeric inputs are text + inputmode, so e/E/+/- and scientific
  // notation are impossible before validation even runs.
  function installGuards(form) {
    if (!form) return;
    var age = document.getElementById('vettiPetAge');
    if (age) {
      age.addEventListener('beforeinput', blockBad(new RegExp('^[0-9]{0,' + limits().age.digits + '}$'), 'vettiPetAge'));
    }
    var weight = document.getElementById('vettiPetWeight');
    if (weight) {
      var L = limits().weightKg;
      weight.addEventListener('beforeinput', blockBad(
        new RegExp('^[0-9]{0,' + L.digits + '}(\\.[0-9]{0,' + L.decimals + '})?$'), 'vettiPetWeight'));
    }
    // Re-check a field only once it already has an error, so the form
    // does not nag while the user is still typing.
    RULES.forEach(function (entry) {
      var control = document.getElementById(entry[0]);
      if (!control) return;
      control.addEventListener('input', function () {
        var node = document.getElementById('vettiErr-' + entry[0]);
        if (node && !node.hidden) setError(entry[0], entry[1]());
      });
    });
  }

  function blockBad(pattern, id) {
    return function (e) {
      if (!e.inputType || e.inputType.indexOf('insert') !== 0) return;
      if (e.data === null || e.data === undefined) return;
      var control = e.target;
      var start = control.selectionStart === null ? control.value.length : control.selectionStart;
      var end = control.selectionEnd === null ? control.value.length : control.selectionEnd;
      var next = control.value.slice(0, start) + e.data + control.value.slice(end);
      if (!pattern.test(next)) {
        e.preventDefault();
        setError(id, '');
      }
    };
  }

  // ── SAVE ──────────────────────────────────────────────────────────────
  // Writes through the shared store, exactly like the full Add Pet form.
  // Creates ONE pet. Nothing else is fabricated.
  // TODO(BACKEND): replace with POST /pets; ownership is the authenticated
  // owner id server-side, never a name match.
  function submitPetForm() {
    if (!validatePetForm()) return { ok: false, error: 'validation' };

    // NOTE: do not name this `ownerId` — a local var of that name would be
    // hoisted over the ownerId() function below and shadow it.
    var currentOwner = ownerId();
    if (!currentOwner || !window.SharedMockUsers) {
      return { ok: false, error: 'no_session' };
    }

    var species = trimmed('vettiPetSpecies');
    var breed = trimmed('vettiPetBreed');
    var result = window.SharedMockUsers.addPet({
      ownerId: currentOwner,
      name: trimmed('vettiPetName'),
      species: species,
      breed: breed,
      age: parseInt(trimmed('vettiPetAge'), 10) || 0,
      weightKg: parseFloat(trimmed('vettiPetWeight')) || 0
    });

    if (!result || !result.ok) {
      return { ok: false, error: (result && result.error) || 'invalid' };
    }
    return { ok: true, pet: result.pet };
  }

  function ownerId() {
    if (typeof _currentOwnerId === 'function') {
      var viaPortal = _currentOwnerId();
      if (viaPortal) return viaPortal;
    }
    if (window.SharedMockUsers) return window.SharedMockUsers.currentUserId;
    return null;
  }

  global.VettiOnboarding = {
    introMarkup: introMarkup,
    petFormMarkup: petFormMarkup,
    validatePetForm: validatePetForm,
    clearErrors: clearErrors,
    installGuards: installGuards,
    submitPetForm: submitPetForm,
    escapeText: escapeText,
    SPECIES: SPECIES
  };
})(window);