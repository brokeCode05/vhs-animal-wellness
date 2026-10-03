/* ============================================================
   VETTIONBOARDING — first meeting, zero-pet path, first-pet form
   ============================================================

   1. THE FIRST-TIME WELCOME — the short copy shown once, over the
      workspace. Rendered as a welcome layer by VettiUI, never as a run
      of chat bubbles, and never repeated on later logins.
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

   v3.1.0
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

  // ── ONE PET MODEL, SHARED WITH My Pets ─────────────────────────────────
  // The species list, breed list, gender values and field limits all come
  // from the SAME sources the full Add Pet form uses, so a pet created in
  // Vetti and one created on My Pets are the same shape. Vetti does NOT
  // define a parallel pet model.
  var SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'];
  var GENDERS = ['Male', 'Female'];

  // Only reached if _breedMap is somehow missing. Still guarantees an
  // "Unknown" option, because the owner must never be forced to guess.
  var FALLBACK_BREEDS = ['Unknown', 'Other'];

  // _breedMap is the canonical species->breed map owned by the portal
  // (user-script.js). Reading it — rather than copying it — is what keeps
  // the two forms from drifting apart.
  function breedsFor(species) {
    var map = global._breedMap;
    var list = (map && map[species] && map[species].length)
      ? map[species].slice()
      : FALLBACK_BREEDS.slice();
    // §W: an "Unknown" option must ALWAYS be offered for every species.
    var hasUnknown = list.some(function (b) { return /^unknown/i.test(String(b)); });
    if (!hasUnknown) list.unshift('Unknown');
    return list;
  }

  function breedOptionsMarkup(species) {
    return breedsFor(species).map(function (b) {
      return '<option value="' + escapeText(b) + '">' + escapeText(b) + '</option>';
    }).join('');
  }
  // NOTE: the full Add Pet form applies MICROCHIP_PATTERN to free-text
  // microchip ids only. Breed and species here are controlled selects, so
  // they are never pattern-checked — their free-text "Other" counterparts
  // get a length check instead, matching PET_RULES.

  function escapeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── THE GUIDED WELCOME ────────────────────────────────────────────────
  // §15: Vetti's first meeting is a welcome LAYER over the workspace
  // (vetti-ui.js renders it), not a burst of chat bubbles. These are the
  // four steps and the lead line it shows. Short on purpose — five lines
  // of useful orientation, not a lecture, and never repeated on later
  // logins.
  function welcomeSteps() {
    return [
      {
        title: 'Your pet care, in one place',
        body: 'I help you add pets, keep their details current, and find what you '
            + 'need without digging through menus.'
      },
      {
        title: 'Ask with one tap',
        body: 'The suggestions under this message cover what people ask most. '
            + 'Tap one and I will take it from there.'
      },
      {
        title: 'Start with a pet',
        body: 'Most things begin with a pet on file. If you do not have one yet, '
            + 'I will help you add it right here.'
      },
      {
        title: 'Visits and services, simply',
        body: 'I can show your pets, your appointments and what the clinic offers '
            + 'as a short list you can scan.'
      },
      {
        title: 'Or just ask',
        body: 'Type your own question at any time. The suggestions are a '
            + 'shortcut, not a limit.'
      }
    ];
  }

  function welcomeLead() {
    return 'I can help with your pets, your appointments, what the clinic offers, '
        + 'and simple care guidance.';
  }

  // The honest disclaimer that used to sit under the intro buttons. Kept
  // short, because a first-run screen should not lead with a warning.
  function welcomeNote() {
    return 'This is a working demo on this device. Nothing is sent to the clinic yet.';
  }

  // ── THE COMPACT PET FORM ──────────────────────────────────────────────
  // §18. Six fields, nothing more://   Required — name, species, breed, sex, approximate age
  //   Optional — weight
  //
  // Deliberately NOT collected here (completed later on My Pets):
  // color, microchip, allergies, chronic conditions, medical notes, photo,
  // vaccination history.
  //
  // Species and breed are the SAME controlled lists the full Add Pet form
  // uses (see breedsFor / _breedMap), including the "Other" -> free-text
  // path. Breed is required, so an "Unknown" option is always present.
  //
  // TODO(BACKEND): the spec allows "Birthdate OR Approximate Age", but the
  // pet record has no birthdate field at all (pets store `age` in whole
  // years). Until the backend model gains one, approximate age is the only
  // honest option. Add `birthdate` to addPet and a matching PET_LIMITS
  // entry, then surface both.
  //
  // One form serves BOTH zero-pet onboarding and "add another pet".
  function petFormMarkup(opts) {
    var L = limits();
    var hasPets = !!(opts && opts.hasPets);
    var heading = hasPets ? 'Add another pet' : 'Add your first pet';
    var fallbackLink = hasPets
      ? ' Prefer the full form? <button type="button" class="vetti-inline-link"'
        + ' data-vetti-action="open-my-pets">Open My Pets</button>.'
      : '';
    var required = ' <span class="vetti-required">Required</span>';
    var optional = ' <span class="vetti-optional">Optional</span>';
    return ''
      + '<form class="vetti-petform" id="vettiPetForm" data-vetti-form="1" novalidate>'
      + '  <h3 class="vetti-petform-heading">' + escapeText(heading) + '</h3>'
      + '  <p class="vetti-petform-lead">I only need the basics for now.</p>'
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
      +        SPECIES.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('')
      + '      </select>'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetSpecies" role="alert" hidden></p>'
      + '    </div>'
      + '    <div class="vetti-field">'
      + '      <label for="vettiPetBreed">Breed' + required + '</label>'
      + '      <select id="vettiPetBreed" name="vetti_pet_breed" aria-describedby="vettiErr-vettiPetBreed">'
      + '        <option value="">Choose\u2026</option>'
      +      breedOptionsMarkup('') + ''
      + '      </select>'
      + '      <p class="vetti-field-error" id="vettiErr-vettiPetBreed" role="alert" hidden></p>'
      + '    </div>'
      + '  </div>'
      + '  <div class="vetti-field vetti-field-custom" id="vettiWrapSpeciesCustom" hidden>'
      + '    <label for="vettiPetSpeciesCustom">Species details'
      + '      <span class="vetti-required">Required</span></label>'
      + '    <input id="vettiPetSpeciesCustom" name="vetti_pet_species_custom" type="text"'
      + '           maxlength="' + L.speciesCustom + '" autocomplete="off"'
      + '           placeholder="e.g. Reptile" aria-describedby="vettiErr-vettiPetSpeciesCustom">'
      + '    <p class="vetti-field-error" id="vettiErr-vettiPetSpeciesCustom" role="alert" hidden></p>'
      + '  </div>'
      + '  <div class="vetti-field vetti-field-custom" id="vettiWrapBreedCustom" hidden>'
      + '    <label for="vettiPetBreedCustom">Breed details'
      + '      <span class="vetti-required">Required</span></label>'
      + '    <input id="vettiPetBreedCustom" name="vetti_pet_breed_custom" type="text"'
      + '           maxlength="' + L.breedCustom + '" autocomplete="off"'
      + '           placeholder="e.g. Mixed" aria-describedby="vettiErr-vettiPetBreedCustom">'
      + '    <p class="vetti-field-error" id="vettiErr-vettiPetBreedCustom" role="alert" hidden></p>'
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

  // ── CASCADING SPECIES -> BREED, same behaviour as My Pets ───────────
  // Mirrors onSpeciesChange()/onBreedChange() on the full form: "Other"
  // species reveals a free-text species field and turns breed into free
  // text; "Other" breed reveals a free-text breed field.
  function wireCustomFields(form) {
    if (!form) return;
    var species = document.getElementById('vettiPetSpecies');
    var breed = document.getElementById('vettiPetBreed');
    var speciesCustom = document.getElementById('vettiPetSpeciesCustom');
    var breedCustom = document.getElementById('vettiPetBreedCustom');
    var wrapSpecies = document.getElementById('vettiWrapSpeciesCustom');
    var wrapBreed = document.getElementById('vettiWrapBreedCustom');

    function populateBreeds(value) {
      if (!breed) return;
      breed.innerHTML = '<option value="">Choose\u2026</option>'
        + breedOptionsMarkup(value);
    }

    function sync() {
      var speciesValue = species ? species.value : '';
      var breedValue = breed ? breed.value : '';
      var otherSpecies = speciesValue === 'Other';
      var otherBreed = breedValue === 'Other';

      if (wrapSpecies) wrapSpecies.hidden = !otherSpecies;
      if (speciesCustom) {
        speciesCustom.required = otherSpecies;
        if (!otherSpecies) speciesCustom.value = '';
      }

      if (breed) breed.hidden = otherSpecies;
      // With an "Other" species there is no breed list, so breed becomes
      // a required free-text field instead.
      var needsBreedCustom = otherSpecies || otherBreed;
      if (wrapBreed) wrapBreed.hidden = !needsBreedCustom;
      if (breedCustom) {
        breedCustom.required = needsBreedCustom;
        if (!needsBreedCustom) breedCustom.value = '';
      }
    }

    if (species) {
      species.addEventListener('change', function () {
        populateBreeds(species.value);
        sync();
      });
    }
    if (breed) breed.addEventListener('change', sync);
    populateBreeds(species ? species.value : '');
    sync();
  }

  // The breed actually stored: the selected option, or the free text when
  // the owner picked "Other" (or an "Other" species).
  function resolvedBreed() {
    var speciesValue = trimmed('vettiPetSpecies');
    var breedValue = trimmed('vettiPetBreed');
    if (speciesValue === 'Other') return trimmed('vettiPetBreedCustom');
    if (breedValue === 'Other') return trimmed('vettiPetBreedCustom');
    return breedValue;
  }

  function resolvedSpeciesCustom() {
    return trimmed('vettiPetSpecies') === 'Other' ? trimmed('vettiPetSpeciesCustom') : '';
  }

  function resolvedBreedCustom() {
    var speciesValue = trimmed('vettiPetSpecies');
    var breedValue = trimmed('vettiPetBreed');
    if (speciesValue === 'Other') return trimmed('vettiPetBreedCustom');
    return breedValue === 'Other' ? trimmed('vettiPetBreedCustom') : '';
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

  function ruleSpeciesCustom() {
    if (trimmed('vettiPetSpecies') !== 'Other') return '';
    var v = trimmed('vettiPetSpeciesCustom');
    if (!v) return 'Enter the species.';
    if (v.length > limits().speciesCustom) {
      return 'Species must be ' + limits().speciesCustom + ' characters or fewer.';
    }
    return '';
  }

  function ruleBreed() {
    // A controlled select option needs no pattern check — only the
    // "Other" free-text counterpart does, matching PET_RULES.
    var v = resolvedBreed();
    if (!v) {
      return trimmed('vettiPetSpecies') === 'Other'
        ? 'Enter the breed.'
        : 'Choose a breed.';
    }
    if (v.length > limits().breedCustom) {
      return 'Breed must be ' + limits().breedCustom + ' characters or fewer.';
    }
    return '';
  }

  function ruleBreedCustom() {
    if (trimmed('vettiPetSpecies') !== 'Other' && trimmed('vettiPetBreed') !== 'Other') return '';
    return ruleBreed();
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
    ['vettiPetSpeciesCustom', ruleSpeciesCustom],
    ['vettiPetBreed', ruleBreed],
    ['vettiPetBreedCustom', ruleBreedCustom],
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
    var result = window.SharedMockUsers.addPet({
      ownerId: currentOwner,
      name: trimmed('vettiPetName'),
      species: species,
      speciesCustom: resolvedSpeciesCustom(),
      breed: resolvedBreed(),
      breedCustom: resolvedBreedCustom(),
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
    welcomeSteps: welcomeSteps,
    welcomeLead: welcomeLead,
    welcomeNote: welcomeNote,
    petFormMarkup: petFormMarkup,
    validatePetForm: validatePetForm,
    clearErrors: clearErrors,
    installGuards: installGuards,
    submitPetForm: submitPetForm,
    escapeText: escapeText,
    wireCustomFields: wireCustomFields,
    breedsFor: breedsFor,
    resolvedBreed: resolvedBreed,
    SPECIES: SPECIES,
    GENDERS: GENDERS
  };
})(window);