/* ============================================================
   VHSSIGNUP — Multi-step owner-account signup wizard
   ============================================================
   Owns the whole #signupForm body: progress indicator, four
   steps (Account → Your Details → Review → Verify), per-field
   strict validation, and the ONE submit gate.

   WHY OWNER-ONLY: signup creates the OWNER ACCOUNT. Pet records
   are a separate entity created in the User portal after first
   login (see user/pet-onboarding.js), so this file deliberately
   collects no pet field of any kind.

   MODULARITY: markup, limits, rules and the submit gate all live
   here. web-page/script.js keeps only the existing OTP send /
   verification-method / PHP POST behaviour and calls
   VHSSignup.validateAll() as its single validation gate.

   BACKEND PARITY: LIMITS + FIELDS below are the whole contract —
   mirror this one table in Laravel (max:length / regex rules)
   rather than re-deriving limits per field.
   TODO(BACKEND): server-side revalidation of every field below,
   unique-email enforcement, real server-issued OTP, password
   hashing + policy enforcement. The frontend checks are UX only.

   RENDER TIMING: renders synchronously at script execution because
   web-page/script.js queries #signupForm's fields while it loads
   (phone sync, OTP send/resend, verification-method toggle). Field
   ids and `name` attributes are the existing signup contract, so
   `new FormData(signupForm)` still posts the identical payload to
   web-page/index.php.

   v1.0.0
   ============================================================ */
(function (global) {
  'use strict';

  // ── CENTRALISED LIMITS (mirror these in Laravel) ──────────────────────
  var LIMITS = {
    firstName: 50,
    lastName: 50,
    middleName: 50,
    email: 254,
    passwordMin: 8,
    passwordMax: 72,          // bcrypt (PASSWORD_BCRYPT) truncates past 72 bytes
    address: 250,
    phoneLocalDigits: 10,
    otpDigits: 6
  };

  // Philippine mobile convention already used by the public site:
  // the field shows a local 9XXXXXXXXX under a fixed "PH +63" prefix
  // and the submitted phone2 is the normalised +63XXXXXXXXXX.
  var PH = {
    displayPrefix: 'PH +63',
    storePrefix: '+63',
    localPattern: /^9[0-9]{9}$/
  };

  var EMAIL_PATTERN =
    /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

  // Names: letters (any script), combining marks, spaces, hyphen, apostrophe
  // and period (initials and suffixes like "Jr." are common PH names).
  var NAME_PATTERN = (function () {
    try {
      return new RegExp("^[\\p{L}\\p{M}'\\u2019.\\- ]*$", 'u');
    } catch (e) {
      return /^[A-Za-z'.’\- ]*$/;
    }
  })();
  var NAME_MESSAGE = 'Use letters only — spaces, hyphens, apostrophes and periods are fine.';

  var OTP_PATTERN = new RegExp('^[0-9]{' + LIMITS.otpDigits + '}$');
  var DIGITS_ONLY = /^[0-9]*$/;
  var NO_SPACES = /^\S*$/;
  var PASSWORD_SPECIAL = /[!@#$%^&*(),.?":{}|<>]/;

  // ── STEP MAP ──────────────────────────────────────────────────────────
  var STEPS = [
    { id: 'account',  label: 'Account',     note: 'Sign-in details' },
    { id: 'personal', label: 'Your Details', note: 'Who you are' },
    { id: 'review',   label: 'Review',      note: 'Check your details' },
    { id: 'verify',   label: 'Verify',      note: 'Confirm your account' }
  ];

  // ── FIELDS: the single source for markup, limits and messages ────────
  // key        → used by rules + error ids
  // id / name  → existing signup contract (unchanged)
  var FIELDS = {
    email: {
      id: 'signupEmail', name: 'email3', label: 'Email Address', required: true,
      type: 'email', max: LIMITS.email, placeholder: 'example@gmail.com',
      autocomplete: 'email', step: 0
    },
    password: {
      id: 'signupPassword', name: 'password2', label: 'Password', required: true,
      type: 'password', max: LIMITS.passwordMax, placeholder: 'Create a password',
      autocomplete: 'new-password', step: 0,
      hint: 'Minimum 8 characters, with at least 1 number and 1 special character.'
    },
    confirmPassword: {
      id: 'signupConfirmPassword', name: 'confirmPassword', label: 'Confirm Password', required: true,
      type: 'password', max: LIMITS.passwordMax, placeholder: 'Re-enter your password',
      autocomplete: 'new-password', step: 0
    },
    lastName: {
      id: 'signupLastName', name: 'lastName2', label: 'Last Name', required: true,
      type: 'text', max: LIMITS.lastName, placeholder: 'Dela Cruz',
      autocomplete: 'family-name', step: 1
    },
    firstName: {
      id: 'signupFirstName', name: 'firstName2', label: 'First Name', required: true,
      type: 'text', max: LIMITS.firstName, placeholder: 'Juan',
      autocomplete: 'given-name', step: 1
    },
    middleName: {
      id: 'signupMiddleName', name: 'middleName2', label: 'Middle Name', required: false,
      type: 'text', max: LIMITS.middleName, placeholder: 'Santos (optional)',
      autocomplete: 'additional-name', step: 1
    },
    phone: {
      id: 'signupPhoneLocal', name: '', label: 'Phone Number', required: true,
      type: 'tel', max: LIMITS.phoneLocalDigits, placeholder: '9123456789',
      inputmode: 'numeric', autocomplete: 'tel-national', step: 1,
      hint: 'Format: +63 9XXXXXXXXX'
    },
    address: {
      id: 'signupAddress', name: 'address', label: 'Address', required: true,
      type: 'textarea', max: LIMITS.address, placeholder: 'Street, Barangay, City, Province',
      rows: 2, autocomplete: 'street-address', step: 1
    },
    dob: {
      id: 'signupDob', name: 'dob', label: 'Date of Birth', required: true,
      type: 'date', autocomplete: 'bday', step: 1
    }
  };

  // Fields validated per step, in DOM order. The Review step validates the
  // terms checkbox; the Verify step validates the OTP only when SMS is chosen.
  var STEP_FIELDS = [
    ['email', 'password', 'confirmPassword'],
    ['lastName', 'firstName', 'middleName', 'phone', 'address', 'dob'],
    [],
    []
  ];

  var form = null;
  var mount = null;
  var step = 0;

  // ── Small helpers ─────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  function field(key) { return FIELDS[key]; }

  function input(key) {
    var f = field(key);
    return f ? el(f.id) : null;
  }

  function rawValue(key) {
    var node = input(key);
    return node ? String(node.value) : '';
  }

  // Surrounding whitespace is accidental — trim it before validating so a
  // stray space never fails an otherwise valid entry.
  function cleanValue(key) {
    var f = field(key);
    if (!f) return '';
    if (f.type === 'password') return rawValue(key);   // never touch a password
    return rawValue(key).replace(/^\s+|\s+$/g, '');
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── RULES: one predicate per field type ─────────────────────────────────
  // Every rule takes the FIELD KEY (never the value) and returns '' when the
  // value is acceptable, otherwise the message to show.
  function ruleName(key) {
    var f = field(key);
    if (!f) return '';
    var v = cleanValue(key);
    if (f.required && !v) return f.label + ' is required.';
    if (!v) return '';
    if (v.length > f.max) return f.label + ' must be ' + f.max + ' characters or fewer.';
    if (!NAME_PATTERN.test(v)) return NAME_MESSAGE;
    // A purely numeric name is a typo guardrail, not a real-world case.
    if (!/[^\d\s]/.test(v)) return 'Enter a name, not a number.';
    return '';
  }

  function ruleEmail(key) {
    var v = cleanValue(key);
    if (!v) return 'Email address is required.';
    if (v.length > LIMITS.email) return 'Email address must be ' + LIMITS.email + ' characters or fewer.';
    if (!NO_SPACES.test(v)) return 'Email address cannot contain spaces.';
    if (!EMAIL_PATTERN.test(v)) return 'Enter a valid email address, e.g. name@example.com.';
    // TODO(BACKEND): reject addresses already registered (unique email).
    return '';
  }

  function rulePassword(key) {
    var v = rawValue(key);
    if (!v) return 'Password is required.';
    if (v.length < LIMITS.passwordMin) return 'Password must be at least ' + LIMITS.passwordMin + ' characters long.';
    if (v.length > LIMITS.passwordMax) return 'Password must be ' + LIMITS.passwordMax + ' characters or fewer.';
    if (!/\d/.test(v)) return 'Password must include at least 1 number.';
    if (!PASSWORD_SPECIAL.test(v)) return 'Password must include at least 1 special character.';
    return '';
  }

  function ruleConfirmPassword(key) {
    var v = rawValue(key);
    if (!v) return 'Please confirm your password.';
    if (v !== rawValue('password')) return 'Passwords do not match.';
    return '';
  }

  function rulePhone(key) {
    var v = rawValue(key);
    if (!v) return 'Phone number is required.';
    if (!DIGITS_ONLY.test(v)) return 'Phone number accepts digits only.';
    if (v.length !== LIMITS.phoneLocalDigits) return 'Enter all ' + LIMITS.phoneLocalDigits + ' digits (9XXXXXXXXX).';
    if (!PH.localPattern.test(v)) return 'Enter a valid PH mobile number starting with 9.';
    return '';
  }

  function ruleAddress(key) {
    var v = cleanValue(key);
    if (!v) return 'Address is required.';
    if (v.length > LIMITS.address) return 'Address must be ' + LIMITS.address + ' characters or fewer.';
    return '';
  }

  function ruleDob(key) {
    var v = cleanValue(key);
    if (!v) return 'Date of birth is required.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Enter a valid date.';
    var parts = v.split('-').map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (d.getFullYear() !== parts[0] || d.getMonth() !== parts[1] - 1 || d.getDate() !== parts[2]) {
      return 'Enter a valid date.';
    }
    if (v > todayIso()) return 'Date of birth cannot be in the future.';
    if (parts[0] < 1900) return 'Enter a valid date of birth.';
    return '';
  }

  var RULES = {
    email: ruleEmail,
    password: rulePassword,
    confirmPassword: ruleConfirmPassword,
    phone: rulePhone,
    address: ruleAddress,
    dob: ruleDob
  };

  // Any field without its own rule falls back to the shared name rule.
  function ruleFor(key) {
    return RULES[key] || ruleName;
  }

  // Single entry point every caller uses, so a rule can never be invoked
  // with the wrong argument.
  function fieldIssue(key) {
    return ruleFor(key)(key);
  }

  // ── Error message plumbing ────────────────────────────────────────────
  function errorNode(key) {
    return el('swErr-' + key);
  }

  function showFieldError(key, message) {
    var node = errorNode(key);
    var control = input(key);
    if (node) {
      node.textContent = message;
      node.hidden = !message;
    }
    if (control) {
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
  }

  function clearFieldError(key) {
    showFieldError(key, '');
  }

  function validateField(key, silent) {
    var message = fieldIssue(key);
    if (!silent) showFieldError(key, message);
    return !message;
  }

  // Focus the first field of a step that is still invalid, so the user is
  // told exactly where to look instead of only seeing a red border.
  function focusFirstInvalid(keys) {
    for (var i = 0; i < keys.length; i++) {
      if (!validateField(keys[i], true)) {
        showFieldError(keys[i], fieldIssue(keys[i]));
        var node = input(keys[i]);
        if (node && typeof node.focus === 'function') node.focus();
        return false;
      }
      clearFieldError(keys[i]);
    }
    return true;
  }

  // ── Strict entry filters ──────────────────────────────────────────────
  // Malformed keystrokes are rejected at the keyboard instead of being
  // silently rewritten afterwards (never mutate field.value here).
  function installGuard(control, test, onReject) {
    if (!control) return;
    control.addEventListener('beforeinput', function (e) {
      if (e.inputType && e.inputType.indexOf('insert') !== 0) return;
      var data = e.data;
      if (data === null || data === undefined) return;   // paste/undo handled below
      var start = control.selectionStart === null ? control.value.length : control.selectionStart;
      var end = control.selectionEnd === null ? control.value.length : control.selectionEnd;
      var next = control.value.slice(0, start) + data + control.value.slice(end);
      if (!test(next)) {
        e.preventDefault();
        if (onReject) onReject();
      }
    });
    control.addEventListener('paste', function (e) {
      var text = (e.clipboardData && e.clipboardData.getData('text')) || '';
      if (!text || test(text)) return;
      e.preventDefault();
      if (onReject) onReject();
    });
  }

  function installGuards() {
    ['lastName', 'firstName', 'middleName'].forEach(function (key) {
      installGuard(input(key), function (v) { return NAME_PATTERN.test(v); }, function () {
        showFieldError(key, NAME_MESSAGE);
      });
    });
    installGuard(input('email'), function (v) { return NO_SPACES.test(v); }, function () {
      showFieldError('email', 'Email address cannot contain spaces.');
    });
    installGuard(input('phone'), function (v) { return DIGITS_ONLY.test(v); }, function () {
      showFieldError('phone', 'Phone number accepts digits only.');
    });
    var otp = el('signupOtp');
    installGuard(otp, function (v) { return DIGITS_ONLY.test(v); }, function () {
      showOtpError('The verification code is 6 digits.');
    });
  }

  // ── Phone normalisation (single owner of the hidden phone2 field) ─────
  function phoneValue() {
    var local = input('phone');
    var digits = local ? String(local.value).replace(/\D/g, '') : '';
    var hidden = el('signupPhone');
    var full = digits.length === LIMITS.phoneLocalDigits ? PH.storePrefix + digits : '';
    if (hidden) hidden.value = full;
    return full;
  }

  // ── OTP validation (step 4) ───────────────────────────────────────────
  function chosenVerificationMethod() {
    var checked = form ? form.querySelector('input[name="verificationMethod"]:checked') : null;
    return checked ? checked.value : 'email';
  }

  function showOtpError(message) {
    var node = el('swErr-otp');
    var otp = el('signupOtp');
    if (node) {
      node.textContent = message;
      node.hidden = !message;
    }
    if (otp) {
      if (message) otp.setAttribute('aria-invalid', 'true');
      else otp.removeAttribute('aria-invalid');
    }
  }

  function validateOtp() {
    if (chosenVerificationMethod() !== 'sms') {
      showOtpError('');
      return true;
    }
    var otp = el('signupOtp');
    var value = otp ? String(otp.value).trim() : '';
    if (!OTP_PATTERN.test(value)) {
      showOtpError('Enter the ' + LIMITS.otpDigits + '-digit verification code.');
      if (otp) otp.focus();
      return false;
    }
    showOtpError('');
    return true;
  }

  // ── Terms ─────────────────────────────────────────────────────────────
  function validateTerms() {
    var box = el('signupAgreeTerms');
    var node = el('swErr-terms');
    var missing = !box || !box.checked;
    if (node) {
      node.textContent = missing ? 'Please accept the Terms and Conditions to continue.' : '';
      node.hidden = !missing;
    }
    if (box) {
      if (missing) box.setAttribute('aria-invalid', 'true');
      else box.removeAttribute('aria-invalid');
    }
    return !missing;
  }

  // ── Markup ────────────────────────────────────────────────────────────
  function errorMarkup(key) {
    return '<p class="sw-field-error" id="swErr-' + key + '" role="alert" hidden></p>';
  }

  function attrs(map) {
    return Object.keys(map).filter(function (k) {
      return map[k] !== undefined && map[k] !== null && map[k] !== false;
    }).map(function (k) {
      return k === 'max' ? 'maxlength="' + map[k] + '"' : k + '="' + map[k] + '"';
    }).join(' ');
  }

  function renderField(key, extraClass) {
    var f = field(key);
    if (!f) return '';
    var describedBy = 'aria-describedby="swErr-' + key + '"';
    var a = attrs({
      id: f.id,
      name: f.name || undefined,
      type: f.type,
      placeholder: f.placeholder,
      max: f.max,
      inputmode: f.inputmode,
      autocomplete: f.autocomplete || 'off',
      spellcheck: 'false'
    }) + ' ' + describedBy;
    var control = f.type === 'textarea'
      ? '<textarea ' + a + ' rows="' + (f.rows || 2) + '" style="resize:none"></textarea>'
      : '<input ' + a + ' />';
    var requiredMark = f.required ? ' <span class="required">*</span>' : '';
    var hint = f.hint ? '<span class="form-hint">' + f.hint + '</span>' : '';

    if (key === 'phone') {
      // The visible field is the local 10 digits; phone2 is the normalised
      // value web-page/index.php already expects.
      return '<div class="form-group ' + (extraClass || '') + '" data-field="' + key + '">' +
        '<label for="' + f.id + '">' + f.label + requiredMark + '</label>' +
        '<div class="phone-input-wrapper"><span class="phone-country-code">' + PH.displayPrefix + '</span>' +
        '<input ' + a + ' />' +
        '</div>' +
        '<input type="hidden" id="signupPhone" name="phone2" value="" />' +
        hint + errorMarkup(key) +
        '</div>';
    }

    return '<div class="form-group ' + (extraClass || '') + '" data-field="' + key + '">' +
      '<label for="' + f.id + '">' + f.label + requiredMark + '</label>' +
      control + hint + errorMarkup(key) +
      '</div>';
  }

  function renderProgress() {
    return '<ol class="sw-progress" aria-label="Signup progress">' +
      STEPS.map(function (s, i) {
        return '<li class="sw-progress-step" data-progress="' + i + '">' +
          '<span class="sw-progress-dot" aria-hidden="true">' + (i + 1) + '</span>' +
          '<span class="sw-progress-label">' + s.label + '</span>' +
          '</li>';
      }).join('') +
      '</ol>';
  }

  function renderStepHead(index) {
    var s = STEPS[index];
    return '<div class="sw-step-head">' +
      '<h3 class="sw-step-title" id="swStepTitle-' + index + '" tabindex="-1">' + s.label + '</h3>' +
      '<p class="sw-step-note">' + s.note + '</p>' +
      '</div>';
  }

  function renderAccountStep() {
    return '<div class="sw-panel" data-panel="0" role="group" aria-labelledby="swStepTitle-0">' +
      renderStepHead(0) +
      renderField('email', 'sw-span-2') +
      '<div class="sw-grid">' + renderField('password') + renderField('confirmPassword') + '</div>' +
      '</div>';
  }

  function renderPersonalStep() {
    return '<div class="sw-panel" data-panel="1" role="group" aria-labelledby="swStepTitle-1">' +
      renderStepHead(1) +
      '<div class="sw-grid">' +
      renderField('lastName') + renderField('firstName') +
      renderField('middleName', 'sw-span-2') +
      renderField('phone') + renderField('dob') +
      renderField('address', 'sw-span-2') +
      '</div>' +
      '</div>';
  }

  var REVIEW_ROWS = [
    { key: 'email', label: 'Email', editStep: 0 },
    { key: 'name', label: 'Name', editStep: 1 },
    { key: 'phone', label: 'Phone', editStep: 1 },
    { key: 'dob', label: 'Date of Birth', editStep: 1 },
    { key: 'address', label: 'Address', editStep: 1 }
  ];

  function renderReviewStep() {
    return '<div class="sw-panel" data-panel="2" role="group" aria-labelledby="swStepTitle-2">' +
      renderStepHead(2) +
      '<p class="sw-review-intro">Please confirm your details before continuing. ' +
      'You can go back to edit anything.</p>' +
      '<dl class="sw-review" id="swReview"></dl>' +
      '<div class="terms-section sw-terms">' +
      '<div class="terms-checkbox">' +
      '<input type="checkbox" id="signupAgreeTerms" name="agreeTerms" aria-describedby="swErr-terms" />' +
      '<label for="signupAgreeTerms">I agree to the ' +
      '<a href="#" class="terms-link">Terms and Conditions</a> and ' +
      '<a href="#" class="terms-link">Privacy Policy</a>' +
      ' <span class="required">*</span></label>' +
      '</div>' +
      errorMarkup('terms') +
      '</div>' +
      '<p class="sw-no-pet">Your pet is added after you sign in — this step only creates your owner account.</p>' +
      '</div>';
  }

  function renderVerifyStep() {
    return '<div class="sw-panel" data-panel="3" role="group" aria-labelledby="swStepTitle-3">' +
      renderStepHead(3) +
      '<div class="form-group verification-method-group">' +
      '<label>Verification Method <span class="required">*</span></label>' +
      '<div class="verification-choices">' +
      choice('email', 'Verify via Email Link',
        '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>') +
      choice('sms', 'Verify via SMS OTP',
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12z"/>') +
      '</div></div>' +
      '<div id="otpVerificationContainer" class="form-group hidden">' +
      '<label for="signupOtp">SMS OTP Code <span class="required">*</span></label>' +
      '<div class="otp-input-wrapper">' +
      '<input type="text" id="signupOtp" name="otpCode" placeholder="Enter 6-digit OTP" ' +
      'maxlength="' + LIMITS.otpDigits + '" inputmode="numeric" aria-describedby="swErr-otp" />' +
      '<button type="button" id="resendOtpBtn" class="resend-btn" disabled>Resend in <span id="otpTimer">30</span>s</button>' +
      '</div>' +
      '<span class="form-hint">We have sent a 6-digit verification code to your phone number.</span>' +
      errorMarkup('otp') +
      '</div>' +
      '</div>';
  }

  function choice(value, label, svgPaths) {
    return '<label class="choice-container">' +
      '<input type="radio" name="verificationMethod" value="' + value + '"' + (value === 'email' ? ' checked' : '') + ' />' +
      '<span class="choice-label">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:0.4rem" ' +
      'aria-hidden="true">' + svgPaths + '</svg>' + label +
      '</span></label>';
  }

  // Navigation lives outside the panels so Back / Continue / Create Account
  // stay in one place and never shift position between steps.
  function renderNav() {
    return '<div class="form-actions sw-nav">' +
      '<button type="button" class="btn btn-secondary" id="swBackBtn">Back</button>' +
      '<button type="button" class="btn btn-primary" id="swNextBtn">Continue</button>' +
      '<button type="submit" class="btn btn-primary btn-submit" name="submitButt" id="swSubmitBtn">Create Account</button>' +
      '</div>';
  }

  function render() {
    mount.innerHTML =
      renderProgress() +
      '<div class="sw-body" id="swBody">' +
      renderAccountStep() + renderPersonalStep() + renderReviewStep() + renderVerifyStep() +
      '</div>' +
      renderNav();
  }

  // ── Review summary (never includes the password) ──────────────────────
  function fullName() {
    var parts = [cleanValue('firstName'), cleanValue('middleName'), cleanValue('lastName')];
    return parts.filter(Boolean).join(' ');
  }

  function reviewValue(row) {
    if (row.key === 'name') return fullName();
    if (row.key === 'phone') {
      var digits = rawValue('phone');
      return digits ? PH.displayPrefix + ' ' + digits : '—';
    }
    return cleanValue(row.key) || '—';
  }

  function renderReview() {
    var host = el('swReview');
    if (!host) return;
    host.innerHTML = REVIEW_ROWS.map(function (row) {
      return '<div class="sw-review-row">' +
        '<dt>' + escapeHtml(row.label) + '</dt>' +
        '<dd>' + escapeHtml(reviewValue(row)) + '</dd>' +
        '<button type="button" class="sw-review-edit" data-edit-step="' + row.editStep + '">Edit</button>' +
        '</div>';
    }).join('');
  }

  // ── Navigation ────────────────────────────────────────────────────────
  function gotoStep(next, focusPanel) {
    step = Math.max(0, Math.min(STEPS.length - 1, next));

    var panels = mount.querySelectorAll('.sw-panel');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.toggle('active', i === step);
      panels[i].hidden = i !== step;
    }

    var progress = mount.querySelectorAll('.sw-progress-step');
    for (var j = 0; j < progress.length; j++) {
      progress[j].classList.toggle('is-active', j === step);
      progress[j].classList.toggle('is-done', j < step);
      if (j === step) progress[j].setAttribute('aria-current', 'step');
      else progress[j].removeAttribute('aria-current');
    }

    var isLast = step === STEPS.length - 1;
    var back = el('swBackBtn');
    var nextBtn = el('swNextBtn');
    var submitBtn = el('swSubmitBtn');
    if (back) back.hidden = step === 0;
    if (nextBtn) nextBtn.hidden = isLast;
    if (submitBtn) submitBtn.hidden = !isLast;

    if (step === 2) renderReview();

    if (focusPanel) {
      var title = el('swStepTitle-' + step);
      if (title && typeof title.focus === 'function') title.focus();
    }
  }

  function validateStep(index) {
    if (index === 2) return validateTerms();
    if (index === 3) return validateOtp();
    return focusFirstInvalid(STEP_FIELDS[index]);
  }

  function goForward() {
    if (!validateStep(step)) return;
    gotoStep(step + 1, true);
  }

  function goBack() {
    gotoStep(step - 1, true);
  }

  // ── Public API ────────────────────────────────────────────────────────
  // The ONE gate web-page/script.js calls before it posts to index.php.
  function validateAll() {
    // Guarantee the normalised phone2 is current before anything reads it.
    phoneValue();

    var keys = STEP_FIELDS[0].concat(STEP_FIELDS[1]);
    var i;
    for (i = 0; i < keys.length; i++) validateField(keys[i]);

    var termsOk = validateTerms();
    var otpOk = validateOtp();

    // Send the user to the earliest step that still has a problem.
    var badStep = -1;
    var badKey = null;
    for (var s = 0; s < 2; s++) {
      for (var k = 0; k < STEP_FIELDS[s].length; k++) {
        if (fieldIssue(STEP_FIELDS[s][k])) {
          badStep = s;
          badKey = STEP_FIELDS[s][k];
          break;
        }
      }
      if (badStep !== -1) break;
    }
    if (badStep === -1 && !termsOk) badStep = 2;
    if (badStep === -1 && !otpOk) badStep = 3;

    if (badStep !== -1) {
      gotoStep(badStep, false);
      if (badKey) {
        showFieldError(badKey, fieldIssue(badKey));
        var node = input(badKey);
        if (node && typeof node.focus === 'function') node.focus();
      }
    }
    return badStep === -1;
  }

  function refresh() {
    phoneValue();
    renderReview();
  }

  // Phone rule exposed for the OTP flow in web-page/script.js so the PH
  // number format is never re-checked (and never drifts) in two places.
  function phoneIssue() {
    return fieldIssue('phone');
  }

  function init() {
    form = el('signupForm');
    if (!form) return false;
    mount = el('signupWizard');
    if (!mount) return false;

    // All validation is owned by this file, so the browser's own bubble UI
    // would only duplicate it (and would fire for hidden steps).
    form.setAttribute('novalidate', 'novalidate');

    render();

    var dob = el('signupDob');
    if (dob) dob.max = todayIso();

    installGuards();
    phoneValue();

    // Live re-validation clears an error as soon as it is fixed.
    Object.keys(FIELDS).forEach(function (key) {
      var control = input(key);
      if (!control) return;
      control.addEventListener('input', function () {
        if (key === 'phone') phoneValue();
        var err = errorNode(key);
        if (err && !err.hidden) validateField(key);
      });
      control.addEventListener('blur', function () {
        if (control.value.trim() !== '' || FIELDS[key].required) validateField(key);
      });
    });

    var terms = el('signupAgreeTerms');
    if (terms) terms.addEventListener('change', validateTerms);

    var otp = el('signupOtp');
    if (otp) otp.addEventListener('input', function () { validateOtp(); });

    var nextBtn = el('swNextBtn');
    if (nextBtn) nextBtn.addEventListener('click', goForward);

    var backBtn = el('swBackBtn');
    if (backBtn) backBtn.addEventListener('click', goBack);

    // Enter inside a field advances the wizard instead of submitting the
    // whole form, so a half-filled wizard can never post early.
    mount.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (e.target && e.target.tagName === 'BUTTON') return;
      if (step === STEPS.length - 1) return;
      e.preventDefault();
      goForward();
    });

    mount.addEventListener('click', function (e) {
      var edit = e.target.closest && e.target.closest('.sw-review-edit');
      if (edit) {
        var target = parseInt(edit.getAttribute('data-edit-step'), 10);
        if (!isNaN(target)) gotoStep(target, true);
      }
    });

    // web-page/script.js calls form.reset() after a successful registration.
    form.addEventListener('reset', function () {
      Object.keys(FIELDS).forEach(clearFieldError);
      showOtpError('');
      if (terms) terms.checked = false;
      validateTerms();
      phoneValue();
      gotoStep(0, false);
    });

    gotoStep(0, false);
    return true;
  }

  // Loaded before web-page/script.js so that script's load-time field
  // queries resolve against the rendered wizard.
  init();

  global.VHSSignup = {
    LIMITS: LIMITS,
    PH: PH,
    STEPS: STEPS.map(function (s) { return s.label; }),
    validateAll: validateAll,
    refresh: refresh,
    phoneValue: phoneValue,
    phoneIssue: phoneIssue,
    gotoStep: gotoStep,
    chosenVerificationMethod: chosenVerificationMethod
  };
})(window);