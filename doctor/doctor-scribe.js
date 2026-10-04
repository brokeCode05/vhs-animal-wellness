/* AI Scribe adapter — Doctor portal.
 *
 * WHY THIS FILE EXISTS
 * The Doctor consultation form already owns the SOAP fields (Subjective,
 * Objective, Assessment, Plan). AI Scribe must FILL those fields, never
 * replace them, so the workflow lives here as an adapter instead of as
 * generation rules inside doctor/doctor.js:
 *
 *     Doctor UI  ->  window.DoctorScribe  ->  mock generator NOW
 *                                       ->  transcription/AI API LATER
 *
 * doctor.js therefore never learns what a draft may contain, how a transcript
 * is read, or how a SOAP section is filled. When the backend lands, ONLY the
 * body of generateSoapDraft() changes (mock text assembly -> POST to the
 * consultation AI endpoint); the UI call site does not move.
 * TODO(BACKEND): endpoint, route, auth and payload are CONTRACT NEEDED /
 * TBD — see docs/VHS_CLINICAL_CONTRACT.md §8. Do not invent them here.
 *
 * HARD RULES this module enforces (Phase 1 scope):
 * - No microphone capture, no speech-to-text, no audio is requested or faked.
 * - No network, no storage, no DOM: the adapter is pure logic over strings, so
 *   the same call works in the browser and in a future unit test.
 * - The generator is DETERMINISTIC: same transcript in, same draft out.
 * - It only ever MOVES the doctor's own words. It never invents a diagnosis,
 *   a medication, a dosage, or a treatment decision. A section the transcript
 *   does not cover is emitted as the explicit NOT_PROVIDED marker.
 * - Prescriptions and lab requests are out of scope: this module cannot and
 *   does not touch them.
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  // The EXISTING consultation fields, in SOAP order. `exam` is the Objective
  // textarea; weight/temperature/heartRate are vitals the Scribe never guesses.
  var SOAP_FIELDS = ['subjective', 'exam', 'assessment', 'plan'];
  // Must equal the maxlength already declared on each SOAP textarea, so a
  // generated value can never trip doctorValidateClinical()'s limit check.
  var FIELD_LIMITS = { subjective: 1000, exam: 1000, assessment: 800, plan: 1000 };
  // Written into a section the transcript does not cover. Explicit beats blank:
  // the Doctor can see at a glance which sections the transcript missed.
  var NOT_PROVIDED = 'Not provided.';
  var MIN_CHARS = 12;     // below this there is nothing usable to structure
  var MAX_TRANSCRIPT_CHARS = 8000;

  // Recording is an integration seat, not a feature. Phase 1 ships no
  // microphone capture and no speech-to-text, so the UI asks this flag before
  // it implies anything about audio.
  var RECORDING = {
    supported: false,
    mode: 'unavailable',
    message: 'Recording is not active in this build — no microphone audio is captured or transcribed. Paste the consultation transcript instead.'
  };

  // ── phrase matching ───────────────────────────────────────────────────────
  // Cue lists ROUTE existing words; they never contribute content. Built with
  // explicit boundaries so 'ears' cannot match inside 'years' and 'crt' cannot
  // match inside another word.
  function cueMatcher(cues) {
    var parts = cues.map(function (cue) {
      return '(?:^|[^a-z0-9])' + cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])';
    });
    return new RegExp(parts.join('|'), 'i');
  }

  // 1. Explicit section labels. Full words only — a single "A:" is too
  //    ambiguous to route safely, so single letters are deliberately ignored.
  var LABELS = [
    { field: 'subjective', re: /^\s*(?:subjective|hpi|history of presenting complaint)\s*[:\-\u2013\u2014]\s*/i },
    { field: 'exam', re: /^\s*(?:objective|findings|examination findings|exam findings)\s*[:\-\u2013\u2014]\s*/i },
    { field: 'assessment', re: /^\s*(?:assessment|impression|diagnosis|differentials?)\s*[:\-\u2013\u2014]\s*/i },
    { field: 'plan', re: /^\s*(?:plan|plan of action|next steps?|treatment plan)\s*[:\-\u2013\u2014]\s*/i }
  ];
  // 2. Owner-sourced history: the Doctor's report of what the owner said or
  //    saw at home. Always history, never an exam finding. Deliberately narrow —
  //    a phrase that merely MENTIONS home ("monitoring intake at home") belongs
  //    to the plan, so only explicit owner attribution routes here.
  var OWNER_CUES = cueMatcher([
    'owner', 'owners', 'reported', 'reports', 'complains', 'complaining', 'complaint',
    'mentions', 'mentioned', 'describes', 'described', 'history', 'observed at home'
  ]);
  // 3a. A measurement: number + unit. This is the strongest objective signal.
  var MEASURED_VALUE = /(?:^|[^a-z0-9])\d{1,4}(?:[.,]\d+)?\s*(?:kgs?|°\s?[cf]|\bc\b|celsius|fahrenheit|degrees|bpm|beats per minute|cm|mm|seconds|minutes)\b/i;
  // 3b. An examination observation or maneuver.
  var EXAM_CUES = cueMatcher([
    'mucous membrane', 'mucous membranes', 'capillary refill', 'crt', 'body condition',
    'on examination', 'on exam', 'physical exam', 'palpat', 'auscultat', 'heart sound',
    'no obvious', 'no abnormality', 'dental', 'gums', 'ears', 'skin is', 'coat is',
    'hydration', 'hydrated', 'dehydrat', 'gait', 'abdomen feels', 'abdomen is', 'chest is',
    'lungs', 'lymph node', 'wound is', 'swelling is', 'lesion', 'pulse is', 'pulse quality',
    'respiratory rate', 'heart rate', 'temperature is', 'weight is', 'weighs', 'weighed',
    'posture', 'pain response', 'gum colour', 'gum color'
  ]);
  // 4. Plan / next-step vocabulary.
  var PLAN_CUES = cueMatcher([
    'plan', 'next step', 'follow up', 'follow-up', 'followup', 'recheck', 're-check',
    'review in', 'advise', 'advised', 'instruction', 'discharge', 'refer', 'referral',
    'monitor', 'treatment', 'therapy', 'dose', 'dosage', 'medication', 'prescription',
    'antibiotic', 'suture', 'dressing', 'deworm', 'vaccinat', 'continue', 'at home'
  ]);
  // 5. Assessment / diagnostic reasoning the Doctor stated. Phrased claims
  //    only — the generator never proposes one of these itself.
  var ASSESSMENT_CUES = cueMatcher([
    'assessment', 'impression', 'diagnosis', 'differential', 'consistent with', 'suspicion',
    'suspicious for', 'probable', 'likely', 'appears to be', 'rules out', 'rule out',
    'diagnostic of', 'provisional'
  ]);
  // 6. Owner-observed symptom vocabulary. Routing vocabulary only: no word
  //    here is ever added to the draft, it only decides where a sentence goes.
  var SYMPTOM_CUES = cueMatcher([
    'appetite', 'off food', 'not eating', 'refusing food', 'vomit', 'diarrhea', 'diarrhoea',
    'loose stool', 'limping', 'lame', 'scratching', 'coughing', 'sneezing', 'lethargy',
    'lethargic', 'water intake', 'drinking', 'urinating', 'straining', 'pain', 'whimper',
    'crying', 'restless', 'anxious', 'behaviour', 'behavior', 'weight loss', 'hair loss',
    'dandruff', 'sleeping', 'playful', 'swelling', 'wound', 'bite', 'itching', 'shaking'
  ]);

  function matches(re, text) { return re.test(text); }

  // ── normalizeTranscript ───────────────────────────────────────────────────
  // Accepts the raw textarea value, a {transcript} object, or nothing at all.
  // Newlines and stray carriage returns are normalized; the Doctor's wording,
  // order and casing are otherwise preserved verbatim.
  function normalizeTranscript(input) {
    var raw = '';
    if (typeof input === 'string') raw = input;
    else if (input && typeof input === 'object') {
      raw = typeof input.transcript === 'string' ? input.transcript
        : (typeof input.text === 'string' ? input.text : '');
    }
    var text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    var words = text ? text.split(/\s+/).length : 0;
    return {
      text: text,
      charCount: text.length,
      wordCount: words,
      isEmpty: text.length === 0
    };
  }

  // ── validateScribeInput ───────────────────────────────────────────────────
  // The UI calls this before generating so an empty or trivial transcript is
  // reported in words instead of producing four "Not provided." fields.
  function validateScribeInput(input) {
    var normalized = normalizeTranscript(input);
    if (normalized.isEmpty) {
      return { ok: false, code: 'empty', message: 'Paste or type the consultation transcript before generating a SOAP draft.' };
    }
    if (normalized.charCount < MIN_CHARS) {
      return { ok: false, code: 'too_short', message: 'The transcript is too short to structure — add the consultation notes and try again.' };
    }
    if (normalized.charCount > MAX_TRANSCRIPT_CHARS) {
      return { ok: false, code: 'too_long', message: 'The transcript is over ' + MAX_TRANSCRIPT_CHARS + ' characters — split it and generate again.' };
    }
    return { ok: true, code: 'ok', message: '', charCount: normalized.charCount, wordCount: normalized.wordCount };
  }

  // ── getScribeStatus ───────────────────────────────────────────────────────
  // One place decides what the indicator says. `recording` exists for the
  // future transcription integration; nothing in Phase 1 can set it, so the
  // indicator never claims audio is being captured.
  function getScribeStatus(state) {
    var s = state && typeof state === 'object' ? state : {};
    if (s.unsavedChanges) return { state: 'unsaved_changes', label: 'Unsaved changes' };
    if (s.recording) return { state: 'recording', label: 'Recording' };
    if (s.generatedAt) return { state: 'draft_generated', label: 'Draft generated' };
    if (typeof s.transcript === 'string' && s.transcript.trim()) return { state: 'transcript_ready', label: 'Transcript ready' };
    return { state: 'ready', label: 'Ready' };
  }

  // ── bucketing ─────────────────────────────────────────────────────────────
  // Split into sentences/lines, then route each one. Priority order matters and
  // is fixed: explicit label > owner history > measurement/exam > plan >
  // assessment > symptom vocabulary > unclassified.
  function splitSegments(text) {
    // A sentence break only counts when punctuation is followed by whitespace,
    // so decimals ("39.1") and abbreviations are never split apart.
    return text
      .replace(/([.!?;])\s+/g, '$1\n')
      .split(/\n+/)
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part.length > 0; });
  }

  function classifySegment(segment) {
    for (var i = 0; i < LABELS.length; i++) {
      var hit = segment.match(LABELS[i].re);
      if (hit) {
        var rest = segment.slice(hit[0].length).trim();
        return rest ? { field: LABELS[i].field, text: rest } : null;
      }
    }
    var ownerSourced = matches(OWNER_CUES, segment);
    var objective = matches(MEASURED_VALUE, segment) || matches(EXAM_CUES, segment);
    // Owner history stays history unless the sentence also reports a measured
    // value or an examination finding ("owner reports the wound is swollen").
    if (ownerSourced) return objective ? { field: 'exam', text: segment } : { field: 'subjective', text: segment };
    if (objective) return { field: 'exam', text: segment };
    if (matches(PLAN_CUES, segment)) return { field: 'plan', text: segment };
    if (matches(ASSESSMENT_CUES, segment)) return { field: 'assessment', text: segment };
    if (matches(SYMPTOM_CUES, segment)) return { field: 'subjective', text: segment };
    return null;
  }

  // Appends whole segments only: a section is never truncated mid-sentence.
  // Whatever did not fit is reported back so the UI can say so out loud.
  function joinWithinLimit(segments, limit) {
    var kept = [];
    var used = 0;
    segments.forEach(function (segment) {
      var addition = kept.length ? 1 + segment.length : segment.length;
      if (used + addition > limit) return;
      kept.push(segment);
      used += addition;
    });
    return { text: kept.join(' '), dropped: segments.length - kept.length };
  }

  function dedupe(list) {
    var seen = Object.create(null);
    return list.filter(function (item) {
      var key = item.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  // ── generateSoapDraft ─────────────────────────────────────────────────────
  // Sync on purpose: the mock generator needs no I/O. createSoapDraft() below
  // is the Promise-returning entry point the UI uses, so the future async
  // endpoint swaps in without touching the call site.
  function generateSoapDraft(input) {
    var options = input && typeof input === 'object' ? input : { transcript: input };
    var normalized = normalizeTranscript(options);
    var validation = validateScribeInput(normalized);
    if (!validation.ok) {
      return { ok: false, error: validation, soap: null, filled: [], missing: [], unclassified: [], dropped: {} };
    }

    var segments = splitSegments(normalized.text);
    var buckets = { subjective: [], exam: [], assessment: [], plan: [] };
    var unclassified = [];
    segments.forEach(function (segment) {
      var routed = classifySegment(segment);
      if (!routed) { unclassified.push(segment); return; }
      buckets[routed.field].push(routed.text);
    });
    Object.keys(buckets).forEach(function (field) { buckets[field] = dedupe(buckets[field]); });

    var soap = {};
    var dropped = {};
    var missing = [];
    SOAP_FIELDS.forEach(function (field) {
      var joined = joinWithinLimit(buckets[field], FIELD_LIMITS[field]);
      if (joined.dropped) dropped[field] = joined.dropped;
      soap[field] = joined.text || NOT_PROVIDED;
      if (!joined.text) missing.push(field);
    });

    var filled = SOAP_FIELDS.filter(function (field) { return missing.indexOf(field) === -1; });
    // generatedAt is metadata about the run, never part of the clinical text.
    // The caller may pass nowIso to keep the result reproducible in tests.
    var nowIso = typeof options.nowIso === 'string' ? options.nowIso : new Date().toISOString();

    return {
      ok: true,
      error: null,
      soap: soap,
      fields: SOAP_FIELDS.slice(),
      filled: filled,
      missing: missing,
      // Sentences the transcript did not place. They are never silently moved
      // into a SOAP section — the Doctor still has them in the transcript.
      unclassified: unclassified,
      dropped: dropped,
      meta: {
        engine: 'mock',
        generator: 'doctor-scribe-mock',
        version: VERSION,
        deterministic: true,
        recording: RECORDING.mode,
        generatedAt: nowIso,
        transcriptChars: normalized.charCount,
        segmentCount: segments.length,
        patient: sanitizePatient(options.patient)
      }
    };
  }

  // Pass-through identity only. No clinical content is derived from it here.
  function sanitizePatient(patient) {
    if (!patient || typeof patient !== 'object') return null;
    return {
      appointmentId: String(patient.appointmentId || patient.id || ''),
      petId: String(patient.petId || ''),
      name: String(patient.name || ''),
      species: String(patient.species || '')
    };
  }

  // The seam the UI actually calls. Today it resolves on the microtask queue;
  // with the transcription/AI backend it awaits that request instead. Same
  // arguments, same result shape, same call site.
  function createSoapDraft(input) {
    try {
      return Promise.resolve(generateSoapDraft(input));
    } catch (error) {
      // Failure is contained here so the Doctor workflow degrades to manual
      // SOAP entry instead of breaking mid-consultation.
      return Promise.resolve({
        ok: false,
        error: { ok: false, code: 'failed', message: 'The SOAP draft could not be generated. Enter the SOAP note manually.' },
        soap: null, filled: [], missing: [], unclassified: [], dropped: {},
        meta: { engine: 'mock', generator: 'doctor-scribe-mock', version: VERSION, generatedAt: new Date().toISOString() }
      });
    }
  }

  global.DoctorScribe = {
    identityMode: 'mock',
    engine: 'mock',
    version: VERSION,
    SOAP_FIELDS: SOAP_FIELDS,
    FIELD_LIMITS: FIELD_LIMITS,
    NOT_PROVIDED: NOT_PROVIDED,
    recording: RECORDING,
    normalizeTranscript: normalizeTranscript,
    validateScribeInput: validateScribeInput,
    getScribeStatus: getScribeStatus,
    generateSoapDraft: generateSoapDraft,
    createSoapDraft: createSoapDraft
  };
})(window);