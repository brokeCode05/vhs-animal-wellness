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

   v2.0.0
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
  // Sex matches the full Add Pet form and the seeded pets exactly, so a pet
  // created here and one created there are the same shape.
  // TODO(BACKEND): this enum is mirrored in Laravel; extend it there first.
  var GENDERS = ['Male', 'Female'];
  var MICROCHIP_PATTERN = /^[A-Za-z0-9-]*$/;

  function escapeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── THE INTRO ACTIONS ────────────────────────────────────────────────
  // §15: the intro itself is 2-3 short conversation messages (rendered by
  // VettiUI). This is only the action row that follows them.
  function introActionsMarkup() {
    return ''
      + '<div class="vetti-intro" data-vetti-intro="1">'
      + '  <p class="vetti-intro-note">'
      + '    Everything here is a working demo on this device. Nothing is sent to the '
      + '    clinic until the portal is connected.'
      + '  </p>'
      + '  <div class="vetti-intro-actions">'
      + '    <button type="button" class="btn-primary" data-vetti-action="start-intro">'
      + '      Let&rsquo;s get started'
      + '    </button>'
      + '    <button type="button" class="btn-link" data-vetti-action="skip-intro">'
      + '      Skip intro \u2014 I already know this'
      + '    </button>'
      + '  </div>'
      + '</div>';
  }

  // ── THE COMPACT PET FORM ──────────────────────────────────────────────
  // §18. Six fields, nothing more:
  //   Required — name, species, breed, sex, approximate age
  //   Optional — weight
  //
  // Deliberately NOT collected here (completed later on My Pets):
  // color, microchip, allergies, chronic conditions, medical notes, photo,
  // vaccination history.
  //
  // TODO(BACKEND): the spec allows "Birthdate OR Approximate Age", but the
  // pet record has no birthdate field at all (pets store `age` in whole
  // years). Until the backend model gains one, approximate age is the only
  // honest option here. Add `birthdate` to addPet and a matching entry in
  // PET_LIMITS, then surface both.
  //
  // One form serves BOTH zero-pet onboarding and "add another pet". Field
  // ids are identical in both cases, so the ONE validator below applies to
  // both and can never drift between them.
  function petFormMarkup(opts) {
    var L = limits();
    var hasPets = !!(opts && opts.hasPets);
    var heading = hasPets ? 'Add another pet' : 'Add your first pet';
    var lead = hasPets
      ? 'Sure. I only need the basics for now.'
      : 'I only need the basics for now.';
    // The manual route stays available, but only as a secondary link for an
    // owner who already has pets — Vetti is the assisted route.
    var fallbackLink = hasPets
      ? ' Prefer the full form? <button type="button" class="vetti-inline-link"'
        + ' data-vetti-action="open-my-pets">Open My Pets</button>.'
      : '';
    var required = ' <span class="vetti-required">Required</span>';
    var optional = ' <span class="vetti-optional">Optional</span>';
    return ''
      + '<form class="vetti-petform" id="vettiPetForm" data-vetti-form="1" novalidate>'
      + '  <h3 class="vetti-petform-heading">' + escapeText(heading) + '</h3>'
      + '  <p class="vetti-petform-lead">' + escapeText(lead) + '</p>'
      + '  <div class="vetti-field">'
      + '    <label for="vettiPetName">Pet name' + required + '</label>'
      + '    <input id="vettiPetName" name="vetti_pet_name" type="text" maxlength="' + L.name + '"'
      + '           autocomplete="off" placeholder="e.g. Bruno" aria-describedby="vettiErr-vettiPetName">'
      + '    <p class="vetti-field-error" id="vettiErr-vettiPetName" role="alert" hidden></p>'
      + '  </div>'
      + '  <div class="vetti-field-row">'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetSpecies">Species' + required + '</label>'
      + '      <select id="vettiPetSpecies" name="vetti_pet_species" aria-describedby="vettiErr-vettiPetSpecies">'
      + '        <option value="">Choose\u2026</option>'
      + SPECIES.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('')
      + '      </select>'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetSpecies" role="alert" hidden></p>'
      + '    </div>'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetBreed">Breed' + required + '</label>'
      + '      <input id="vettiPetBreed" name="vetti_pet_breed" type="text" maxlength="' + L.breedCustom + '"'
      + '             autocomplete="off" placeholder="e.g. Aspin" aria-describedby="vettiErr-vettiPetBreed">'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetBreed" role="alert" hidden></p>'
      + '    </div>'
      + '  </div>'
      + '  <div class="vetti-field-row">'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetSex">Sex' + required + '</label>'
      + '      <select id="vettiPetSex" name="vetti_pet_gender" aria-describedby="vettiErr-vettiPetSex">'
      + '        <option value="">Choose\u2026</option>'
      +        GENDERS.map(function (g) { return '<option value="' + g + '">' + g + '</option>'; }).join('')
      + '      </select>'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetSex" role="alert" hidden></p>'
      + '    </div>'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetAge">Age in years' + required + '</label>'
      + '      <input id="vettiPetAge" name="vetti_pet_age" type="text" inputmode="numeric" maxlength="'
      + L.age.digits + '" autocomplete="off" spellcheck="false" placeholder="e.g. 3"'
      + '             aria-describedby="vettiErr-vettiPetAge">'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetAge" role="alert" hidden></p>'
      + '    </div>'
      + '  </div>'
      + '  <div class="vetti-field">'
      + '    <label for="vettiPetWeight">Weight in kg' + optional + '</label>'
      + '    <input id="vettiPetWeight" name="vetti_pet_weight" type="text" inputmode="decimal" maxlength="'
      + (L.weightKg.digits + 1 + L.weightKg.decimals) + '" autocomplete="off" spellcheck="false"'
      + '           placeholder="e.g. 4.5" aria-describedby="vettiErr-vettiPetWeight">'
      + '    <p class="vetti-field-error" id="vettiErr-vettiPetWeight" role="alert" hidden></p>'
      + '  </div>'
      + '  <div class="vetti-petform-actions">'
      + '    <button type="submit" class="btn-primary">Add pet</button>'
      + '    <button type="button" class="btn-link" data-vetti-action="cancel-pet-form">Not now</button>'
      + '  </div>'
      + '  <p class="vetti-petform-footnote">'
      + '    Saved on this device only in this demo.' + fallbackLink
      + '  </p>'
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
    // §18 lists breed as required.
    if (!v) return 'Enter your pet\u2019s breed.';
    if (v.length > limits().breedCustom) {
      return 'Breed must be ' + limits().breedCustom + ' characters or fewer.';
    }
    if (!MICROCHIP_PATTERN.test(v.replace(/\s+/g, '-'))) {
      return 'Use letters, numbers and hyphens only.';
    }
    return '';
  }

  function ruleSex() {
    var v = trimmed('vettiPetSex');
    if (!v) return 'Choose a sex.';
    if (GENDERS.indexOf(v) === -1) return 'Choose a sex from the list.';
    return '';
  }

  function ruleAge() {
    var v = trimmed('vettiPetAge');
    // §18 lists approximate age as required.
    if (!v) return 'Enter your pet\u2019s age in years.';
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
    ['vettiPetSex', ruleSex],
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
      gender: trimmed('vettiPetSex'),
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
    introActionsMarkup: introActionsMarkup,
    petFormMarkup: petFormMarkup,
    validatePetForm: validatePetForm,
    clearErrors: clearErrors,
    installGuards: installGuards,
    submitPetForm: submitPetForm,
    escapeText: escapeText,
    SPECIES: SPECIES,
    GENDERS: GENDERS
  };
})(window);