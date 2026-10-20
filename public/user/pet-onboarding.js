/* ============================================================
   VHSPETONBOARDING — first-pet onboarding + pet form rules
   ============================================================
   Everything needed to go from "signed up, no pets yet" to a pet
   in the shared store, in one place.

   1. ZERO-PET DETECTION — petsForCurrentUser() is the single read
      every pet-dependent feature uses, so "this owner has no pets"
      is never re-derived.
   2. FIRST-PET ONBOARDING — the card shown on first glance of the
      portal after signup, plus a SOFT gate (guide, never lock out)
      on pet-dependent actions.
   3. PET FORM RULES — one limits table + one validator for the
      Add/Edit Pet form, replacing the old toast-only checks and the
      permissive type="number" inputs.

   PRODUCT RULE: signup creates the OWNER ACCOUNT ONLY. A pet is a
   separate record created here, after first login. No document,
   appointment, vaccine or history is ever invented for a new pet —
   it starts on honest empty states.

   BACKEND PARITY: PET_LIMITS + PET_RULES below are the contract to
   mirror in Laravel. TODO(BACKEND): the age/weight maxima below are
   the ones the existing form already advertised — replace with real
   ranges, enforce ownership server-side, and persist via POST /pets.

   v1.0.0
   ============================================================ */
(function (global) {
  'use strict';

  // ── PET FIELD LIMITS (mirror these in Laravel) ────────────────────────
  var PET_LIMITS = {
    name: 50,
    speciesCustom: 50,
    breedCustom: 60,
    color: 50,
    microchipId: 30,
    allergies: 200,
    chronicConditions: 200,
    notes: 500,
    age: { digits: 2, max: 50 },            // whole years
    weightKg: { digits: 3, decimals: 2, max: 200 }
  };

  var MICROCHIP_PATTERN = /^[A-Za-z0-9-]*$/;
  // Rejects control characters (newlines, tabs) in free-text pet fields.
  var TEXT_PATTERN = (function () {
    try { return new RegExp('^[^\\p{C}]*$', 'u'); }
    catch (e) { return /^[^\x00-\x1F\x7F]*$/; }
  })();

  // ── Owner-scoped pet read ─────────────────────────────────────────────
  // Resolved through the portal's own identity helper so a real session
  // wins over the frontend-demo identity.
  function ownerId() {
    if (typeof _currentOwnerId === 'function') return _currentOwnerId();
    if (window.SharedMockUsers) return window.SharedMockUsers.currentUserId;
    return null;
  }

  function petsForCurrentUser() {
    if (!window.SharedMockUsers) return [];
    var id = ownerId();
    return window.SharedMockUsers.petsOfOwner(id);
  }

  function needsPet() {
    return petsForCurrentUser().length === 0;
  }

  // ── SOFT GATE ─────────────────────────────────────────────────────────
  var GATE_MESSAGE =
    'Add your first pet to continue with appointments and pet-specific features.';

  function mountPoint() {
    return document.getElementById('firstPetGate');
  }

  // Reveal the onboarding card and put focus on its call to action. This is
  // guidance during a normal onboarding state, never an error state, so it
  // uses a toast + focus rather than red error styling.
  function reveal() {
    var host = mountPoint();
    if (host) {
      host.hidden = false;
      host.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    var cta = document.getElementById('firstPetCta');
    if (cta && typeof cta.focus === 'function') cta.focus();
    if (typeof showToast === 'function') showToast(GATE_MESSAGE, 'warning');
  }

  // Returns true when the action was blocked (i.e. should NOT proceed).
  function requirePet() {
    if (!needsPet()) return false;
    reveal();
    return true;
  }

  // Vetty-ready: the assistant (and any future feature) can ask "does this
  // owner have a pet?" before answering. No LLM/API call lives here.
  function recommendAddPet() {
    if (!needsPet()) return '';
    return 'You have not added a pet yet. Add your first pet and I can help you '
      + 'book appointments, keep track of records and answer care questions.';
  }

  // ── ONBOARDING CARD ───────────────────────────────────────────────────
  var PERKS = [
    'Book appointments for your pet',
    'Keep medical history in one place',
    'Track vaccinations with a digital passport'
  ];

  function renderCard() {
    var host = mountPoint();
    if (!host) return;

    if (!needsPet()) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }

    var firstName = (typeof _getSessionUser === 'function' && _getSessionUser().firstName) || 'there';

    host.hidden = false;
    host.innerHTML =
      '<div class="first-pet-card">'
      + '<div class="first-pet-card-body">'
      + '<h2>Welcome, ' + escapeText(firstName) + ' — add your first pet</h2>'
      + '<p>Your account is ready. Pets are added separately from your account, '
      + 'so you can keep each one\u2019s records, appointments and vaccines organised.</p>'
      + '<ul class="first-pet-perks">'
      + PERKS.map(function (p) { return '<li>' + escapeText(p) + '</li>'; }).join('')
      + '</ul>'
      + '</div>'
      + '<button type="button" class="btn-primary first-pet-cta" id="firstPetCta">'
      + 'Add Your First Pet'
      + '</button>'
      + '</div>';

    var cta = document.getElementById('firstPetCta');
    if (cta) cta.addEventListener('click', function () { openAddPetModal(); });
  }

  function escapeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Re-read the store and show/hide the card. Called after a pet is saved so
  // the portal updates without a page reload.
  function refresh() {
    renderCard();
  }

  // ══════════════════════════════════════════════════════════════════
  // PET FORM RULES
  // ══════════════════════════════════════════════════════════════════
  // Every rule takes a field key, reads the live form value and returns ''
  // when acceptable, otherwise the message to show under that field.

  function val(id) {
    var node = document.getElementById(id);
    return node ? String(node.value) : '';
  }

  function trimmed(id) {
    return val(id).replace(/^\s+|\s+$/g, '');
  }

  function check(id) {
    return document.getElementById(id);
  }

  function isOtherSpecies() {
    return val('species') === 'Other';
  }

  function isOtherBreed() {
    return val('breed') === 'Other';
  }

  function petRuleName() {
    var v = trimmed('pet_name');
    if (!v) return 'Pet name is required.';
    if (v.length > PET_LIMITS.name) return 'Pet name must be ' + PET_LIMITS.name + ' characters or fewer.';
    if (!TEXT_PATTERN.test(v)) return 'Remove any special control characters from the pet name.';
    return '';
  }

  function petRuleSpecies() {
    var v = val('species');
    if (!v) return 'Species is required.';
    // Controlled list only — "Human" is not a species this clinic treats.
    if (['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'].indexOf(v) === -1) {
      return 'Choose a species from the list.';
    }
    return '';
  }

  function petRuleSpeciesCustom() {
    var v = trimmed('species_custom');
    if (!isOtherSpecies()) return '';
    if (!v) return 'Enter the species.';
    if (v.length > PET_LIMITS.speciesCustom) {
      return 'Species must be ' + PET_LIMITS.speciesCustom + ' characters or fewer.';
    }
    return '';
  }

  function petRuleBreedCustom() {
    var v = trimmed('breed_custom');
    if (!isOtherSpecies() && !isOtherBreed()) return '';
    if (!isOtherBreed()) return '';    // Other species: breed stays optional
    if (!v) return 'Enter the breed.';
    if (v.length > PET_LIMITS.breedCustom) {
      return 'Breed must be ' + PET_LIMITS.breedCustom + ' characters or fewer.';
    }
    return '';
  }

  function petRuleGender() {
    var v = val('gender');
    if (!v) return '';
    if (['Male', 'Female'].indexOf(v) === -1) return 'Choose male or female.';
    return '';
  }

  function petRuleAge() {
    var v = trimmed('age');
    if (!v) return '';
    if (!/^[0-9]{1,2}$/.test(v)) return 'Enter age in whole years (0\u2013' + PET_LIMITS.age.max + ').';
    var n = parseInt(v, 10);
    if (n > PET_LIMITS.age.max) return 'Enter an age between 0 and ' + PET_LIMITS.age.max + ' years.';
    // TODO(BACKEND): replace with the clinic's real age range.
    return '';
  }

  function petRuleWeight() {
    var v = trimmed('weight_kg');
    if (!v) return '';
    var re = new RegExp('^[0-9]{1,' + PET_LIMITS.weightKg.digits +
      '}(\\.[0-9]{1,' + PET_LIMITS.weightKg.decimals + '})?$');
    if (!re.test(v)) return 'Enter weight as a number, up to ' + PET_LIMITS.weightKg.decimals + ' decimal places.';
    if (parseFloat(v) > PET_LIMITS.weightKg.max) {
      return 'Enter a weight between 0 and ' + PET_LIMITS.weightKg.max + ' kg.';
    }
    // TODO(BACKEND): replace with real species/age-aware weight ranges.
    return '';
  }

  function petRuleColor() {
    var v = trimmed('color');
    if (!v) return '';
    if (v.length > PET_LIMITS.color) return 'Color must be ' + PET_LIMITS.color + ' characters or fewer.';
    return '';
  }

  function petRuleRepro() {
    var v = val('reproductive_status');
    if (!v) return '';
    if (['Intact', 'Spayed', 'Neutered', 'Not Sure'].indexOf(v) === -1) {
      return 'Choose a reproductive status from the list.';
    }
    return '';
  }

  function petRuleMicrochip() {
    var v = trimmed('microchip_id');
    if (!v) return '';
    if (v.length > PET_LIMITS.microchipId) {
      return 'Microchip ID must be ' + PET_LIMITS.microchipId + ' characters or fewer.';
    }
    if (!MICROCHIP_PATTERN.test(v)) return 'Use letters, numbers and hyphens only.';
    return '';
  }

  function optionalMax(id, key, label) {
    var v = trimmed(id);
    if (!v) return '';
    if (v.length > key) return label + ' must be ' + key + ' characters or fewer.';
    return '';
  }

  function petRuleAllergies() {
    return optionalMax('allergies', PET_LIMITS.allergies, 'Allergies');
  }

  function petRuleChronic() {
    return optionalMax('chronic_conditions', PET_LIMITS.chronicConditions, 'Chronic conditions');
  }

  function petRuleNotes() {
    return optionalMax('medical_notes', PET_LIMITS.notes, 'Notes');
  }

  var PET_RULES = [
    ['pet_name', petRuleName],
    ['species', petRuleSpecies],
    ['species_custom', petRuleSpeciesCustom],
    // Breed itself is an optional controlled select, so it needs no rule;
    // only its "Other" free-text counterpart does.
    ['breed_custom', petRuleBreedCustom],
    ['gender', petRuleGender],
    ['age', petRuleAge],
    ['weight_kg', petRuleWeight],
    ['color', petRuleColor],
    ['reproductive_status', petRuleRepro],
    ['microchip_id', petRuleMicrochip],
    ['allergies', petRuleAllergies],
    ['chronic_conditions', petRuleChronic],
    ['medical_notes', petRuleNotes]
  ];

  function errorNode(id) {
    var control = check(id);
    if (!control) return null;
    // Keyed by FIELD id, not by group: the pet form puts a select and its
    // "Other" text input in the same .form-group, and each needs its own
    // message slot.
    var existing = document.getElementById('petErr-' + id);
    if (existing) return existing;

    var group = control.closest('.form-group');
    if (!group) return null;
    var node = document.createElement('p');
    node.className = 'pet-field-error';
    node.id = 'petErr-' + id;
    node.setAttribute('role', 'alert');
    node.hidden = true;
    group.appendChild(node);
    return node;
  }

  function showFieldError(id, message) {
    var node = errorNode(id);
    var control = check(id);
    if (node) {
      node.textContent = message;
      node.hidden = !message;
    }
    if (control) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
  }

  function petFieldIssue(entry) {
    return entry[1]();
  }

  // The ONE gate submitPet() calls. Returns false (and focuses the first bad
  // field) when anything is still wrong.
  function validatePetForm() {
    var firstBad = null;
    PET_RULES.forEach(function (entry) {
      var message = petFieldIssue(entry);
      showFieldError(entry[0], message);
      if (message && !firstBad) firstBad = entry[0];
    });
    if (!firstBad) return true;
    var node = check(firstBad);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof node.focus === 'function') node.focus();
    }
    return false;
  }

  function clearPetErrors() {
    PET_RULES.forEach(function (entry) { showFieldError(entry[0], ''); });
  }

  // ── Strict entry filters ──────────────────────────────────────────────
  // Reject malformed keystrokes at the keyboard. field.value is never
  // rewritten afterwards, so what the user typed is what stays on screen.
  function installGuard(control, test, message) {
    if (!control) return;
    control.addEventListener('beforeinput', function (e) {
      if (!e.inputType || e.inputType.indexOf('insert') !== 0) return;
      var data = e.data;
      if (data === null || data === undefined) return;
      var start = control.selectionStart === null ? control.value.length : control.selectionStart;
      var end = control.selectionEnd === null ? control.value.length : control.selectionEnd;
      var next = control.value.slice(0, start) + data + control.value.slice(end);
      if (!test(next)) {
        e.preventDefault();
        showFieldError(control.id, message);
      }
    });
    control.addEventListener('paste', function (e) {
      var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if (!text || test(text)) return;
      e.preventDefault();
      showFieldError(control.id, message);
    });
  }

  function digitsOnly(maxDigits) {
    return function (v) { return new RegExp('^[0-9]{0,' + maxDigits + '}$').test(v); };
  }

  function decimalOnly() {
    return function (v) {
      return new RegExp('^[0-9]{0,' + PET_LIMITS.weightKg.digits +
        '}(\\.[0-9]{0,' + PET_LIMITS.weightKg.decimals + '})?$').test(v);
    };
  }

  function installPetGuards() {
    var age = check('age');
    if (age) {
      installGuard(age, digitsOnly(PET_LIMITS.age.digits),
        'Enter age in whole years (0\u2013' + PET_LIMITS.age.max + ').');
    }
    var weight = check('weight_kg');
    if (weight) {
      installGuard(weight, decimalOnly(),
        'Enter weight as a number, up to ' + PET_LIMITS.weightKg.decimals + ' decimal places.');
    }
    var chip = check('microchip_id');
    if (chip) {
      installGuard(chip, function (v) { return MICROCHIP_PATTERN.test(v); },
        'Use letters, numbers and hyphens only.');
    }

    // Clear an error as soon as it is fixed.
    PET_RULES.forEach(function (entry) {
      var control = check(entry[0]);
      if (!control) return;
      control.addEventListener('input', function () {
        var node = errorNode(entry[0]);
        if (node && !node.hidden) showFieldError(entry[0], petFieldIssue(entry));
      });
    });

    var species = check('species');
    if (species) {
      species.addEventListener('change', function () {
        if (typeof onSpeciesChange === 'function') onSpeciesChange();
        clearPetErrors();
      });
    }
    var breed = check('breed');
    if (breed) breed.addEventListener('change', function () { clearPetErrors(); });
  }

  // Keep every maxlength attribute in step with PET_LIMITS so the field never
  // accepts more characters than the validator will then accept.
  function syncMaxlengths() {
    var byId = {
      pet_name: PET_LIMITS.name,
      species_custom: PET_LIMITS.speciesCustom,
      breed_custom: PET_LIMITS.breedCustom,
      color: PET_LIMITS.color,
      microchip_id: PET_LIMITS.microchipId,
      allergies: PET_LIMITS.allergies,
      chronic_conditions: PET_LIMITS.chronicConditions,
      medical_notes: PET_LIMITS.notes
    };
    Object.keys(byId).forEach(function (id) {
      var node = check(id);
      if (node) node.setAttribute('maxlength', String(byId[id]));
    });
  }

  // Numeric fields are text + inputmode so e/E/+/- and scientific notation
  // are impossible; the guards above are the second line of defence.
  function tightenNumericInputs() {
    var age = check('age');
    if (age) {
      age.type = 'text';
      age.setAttribute('inputmode', 'numeric');
      age.setAttribute('autocomplete', 'off');
      age.setAttribute('spellcheck', 'false');
      age.setAttribute('maxlength', String(PET_LIMITS.age.digits));
      age.setAttribute('placeholder', 'e.g. 3');
    }
    var weight = check('weight_kg');
    if (weight) {
      weight.type = 'text';
      weight.setAttribute('inputmode', 'decimal');
      weight.setAttribute('autocomplete', 'off');
      weight.setAttribute('spellcheck', 'false');
      weight.setAttribute('maxlength', String(PET_LIMITS.weightKg.digits + 1 + PET_LIMITS.weightKg.decimals));
      weight.setAttribute('placeholder', 'e.g. 4.5');
    }
  }

  function initPetForm() {
    // All validation is owned by this module, so the browser's own bubble UI
    // would only duplicate it (and would fire before submitPet ever runs).
    var form = check('petForm');
    if (form) form.setAttribute('novalidate', 'novalidate');

    syncMaxlengths();
    tightenNumericInputs();
    installPetGuards();
    if (form) form.addEventListener('reset', clearPetErrors);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initPetForm();
    renderCard();
  });

  global.VHSPetOnboarding = {
    PET_LIMITS: PET_LIMITS,
    GATE_MESSAGE: GATE_MESSAGE,
    petsForCurrentUser: petsForCurrentUser,
    needsPet: needsPet,
    requirePet: requirePet,
    recommendAddPet: recommendAddPet,
    refresh: refresh,
    validatePetForm: validatePetForm,
    clearPetErrors: clearPetErrors
  };
})(window);