/* AI Scribe adapter — Doctor portal.
 *
 * WHY THIS FILE EXISTS
 * The Doctor consultation form already owns the SOAP fields (Subjective,
 * Objective, Assessment, Plan) and the vitals (weight, temperature, heart
 * rate). AI Scribe must FILL those controls, never replace them, so the
 * workflow lives here as an adapter instead of as generation rules inside
 * doctor/doctor.js:
 *
 *     Doctor UI  ->  window.DoctorScribe  ->  mock generator NOW
 *                                       ->  transcription/AI API LATER
 *
 * doctor/doctor.js therefore never learns what a draft may contain, how a
 * transcript is read, or which control a fact belongs in. The adapter returns
 * BOTH the structured result (the documented contract) and a flat `apply` map
 * of the exact strings for the existing controls, so the UI writes values
 * without ever parsing medical text. When the backend lands, ONLY the body of
 * generateSoapDraft() changes (mock text assembly -> POST to the consultation
 * AI endpoint); the UI call site does not move.
 * TODO(BACKEND): endpoint, route, auth and payload are CONTRACT NEEDED /
 * TBD — see docs/VHS_CLINICAL_CONTRACT.md §8. Do not invent them here.
 *
 * HARD RULES this module enforces:
 * - This module NEVER captures audio and NEVER transcribes it. The browser
 *   does the capturing (doctor/doctor.js); this adapter only validates the
 *   resulting recording object and describes the future backend seam.
 * - It fakes no transcription. processRecording() returns an explicit
 *   "not connected" result rather than inventing text from audio.
 * - No network, no storage, no DOM: the adapter is pure logic over strings, so
 *   the same call works in the browser and in a future unit test.
 * - The generator is DETERMINISTIC: same transcript in, same draft out.
 * - It only ever MOVES the doctor's own words. It never invents a diagnosis,
 *   a medication, a dosage, or a treatment decision. A section the transcript
 *   does not cover is emitted as the explicit NOT_PROVIDED marker.
 * - Measurements are only read when the transcript states them next to a
 *   vital word; a number alone is never treated as a vital.
 * - The pre-consultation summary is built ONLY from pet identity, the booked
 *   service and the concerns recorded with the booking. It never names a
 *   symptom that was not provided.
 * - Prescriptions and lab requests are out of scope: this module cannot and
 *   does not touch them.
 */
(function (global) {
  'use strict';

  var VERSION = '3.1.0';

  // The EXISTING consultation controls, in SOAP order. `exam` is the Objective
  // textarea; the three vitals are the structured inputs the Scribe can fill
  // when — and only when — the transcript states them.
  var SOAP_FIELDS = ['subjective', 'exam', 'assessment', 'plan'];
  // The vitals the consultation already collects. Scribe never estimates these.
  var VITAL_FIELDS = ['weight', 'temperature', 'heartRate'];
  // Every control the generator may write, and the `apply` key that feeds it.
  // Keys are the existing form control names, so the UI writes by name and the
  // regenerate guard can compare a stored snapshot against the live controls
  // without knowing anything about SOAP.
  var APPLY_TARGETS = ['subjective', 'weight', 'temperature', 'heartRate', 'exam', 'assessment', 'plan'];
  // Character caps already declared on each SOAP textarea, so a generated value
  // can never trip doctorValidateClinical()'s limit check.
  var FIELD_LIMITS = { subjective: 1000, exam: 1000, assessment: 800, plan: 1000 };
  // Written into a section the transcript does not cover. Explicit beats blank:
  // the Doctor can see at a glance which sections the transcript missed.
  var NOT_PROVIDED = 'Not provided.';
  var MIN_CHARS = 12;     // below this there is nothing usable to structure
  var MAX_TRANSCRIPT_CHARS = 8000;
  var MAX_NOTE_CHARS = 160; // pre-consultation summary stays 2-4 short lines

  // Recording (Phase 2). The BROWSER captures audio; this adapter owns the
  // contract around the resulting object. `supported` describes the BUILD
  // (it ships a capture seam), not the browser — doctor.js probes the actual
  // MediaRecorder/getUserMedia capability at runtime and disables the control
  // when the browser cannot record. `transcription` is deliberately
  // 'not-connected': nothing turns audio into text yet.
  var RECORDING = {
    supported: true,
    mode: 'browser-capture',
    storage: 'memory-only',
    transcription: 'not-connected',
    message: 'Recording captures audio in this browser only and never leaves this device. Speech-to-text is not connected yet, so a recording is not transcribed — paste or upload the transcript instead.'
  };

  // Phase 2 deliberately refuses to guess: a recording is kept in memory for
  // this page session only. No audio in localStorage, none in
  // SharedMockClinical, none uploaded, none surviving a reload.
  var RECORDING_MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];

  // ── phrase matching ───────────────────────────────────────────────────────
  // Cue lists ROUTE existing words; they never contribute content. They match
  // on a LEADING boundary only, so a stem like 'dehydrat' also catches
  // 'dehydration' and 'dehydrated', while a full word like 'ears' still cannot
  // match inside 'years' (the character before it is a letter, not a boundary).
  function cueMatcher(cues) {
    var parts = cues.map(function (cue) {
      return '(?:^|[^a-z0-9])' + cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp(parts.join('|'), 'i');
  }

  // 1. Explicit section labels. Full words only — a single "A:" is too
  //    ambiguous to route safely, so single letters are deliberately ignored.
  var LABELS = [
    { field: 'subjective', re: /^\s*(?:subjective|hpi|history of presenting complaint)\s*[:\-–—]\s*/i },
    { field: 'exam', re: /^\s*(?:objective|findings|examination findings|exam findings)\s*[:\-–—]\s*/i },
    { field: 'assessment', re: /^\s*(?:assessment|impression|diagnosis|differentials?)\s*[:\-–—]\s*/i },
    { field: 'plan', re: /^\s*(?:plan|plan of action|next steps?|treatment plan)\s*[:\-–—]\s*/i }
  ];
  // 2. Owner-sourced history: the Doctor's report of what the owner said or
  //    saw at home. Always history, never an exam finding. Deliberately narrow —
  //    a phrase that merely MENTIONS home ("monitoring intake at home") belongs
  //    to the plan, so only explicit owner attribution routes here.
  var OWNER_CUES = cueMatcher([
    'owner', 'owners', 'reported', 'reports', 'complains', 'complaining', 'complaint',
    'mentions', 'mentioned', 'describes', 'described', 'history', 'observed at home'
  ]);
  // 3a. A measurement: number + unit. The strongest objective signal.
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
  // 4. Plan / next-step vocabulary, including a requested test or panel.
  var PLAN_CUES = cueMatcher([
    'plan', 'next step', 'follow up', 'follow-up', 'followup', 'recheck', 're-check',
    'review in', 'advise', 'advised', 'instruction', 'discharge', 'refer', 'referral',
    'monitor', 'treatment', 'therapy', 'dose', 'dosage', 'medication', 'prescription',
    'antibiotic', 'suture', 'dressing', 'deworm', 'vaccinat', 'continue', 'at home',
    'request', 'requested', 'ordered', 'panel of'
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
  function toNumber(raw) {
    var n = Number(String(raw).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  // ── STRUCTURED VITALS ────────────────────────────────────────────────────
  // A vital is only read when the transcript names it. "Temperature is 39.4°C"
  // is a measurement; a bare "6.8 kg of food" is not, and neither is "weight
  // loss" with no number. Each pattern must therefore either carry the vital's
  // own word, or be a unit that cannot mean anything else (°C, bpm).
  var VITAL_EXTRACTORS = [
    {
      key: 'weight',
      // "weight is 6.8 kg", "Weight: 6.8kg", "weighs 6.8 kg"
      re: /(?:body\s*weight|weight|weighs|weighed)\s*(?:of\s+|is\s+|:\s*|at\s+|now\s+)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilograms?)\b/gi
    },
    {
      key: 'temperature',
      // "temperature is 39.4°C", "Temp 39.4 degrees", "fever of 39.1"
      re: /(?:temperature|temps?|pyrexia|fever)\s*(?:of\s+|is\s+|:\s*|at\s+)?(\d{1,2}(?:[.,]\d)?)\s*(?:°\s*[cf]\b|degrees?\b|celsius\b|centigrade\b|fahrenheit\b)?/gi
    },
    {
      key: 'heartRate',
      // "heart rate is 125 bpm", "pulse 140", "HR: 110"
      re: /(?:heart\s*rate|heartrate|\bpulse\b|\bhr\b)\s*(?:of\s+|is\s+|:\s*|at\s+)?(\d{1,3})\s*(?:bpm\b|beats per minute\b)?/gi
    }
  ];
  // Unit-only fallbacks: a degree-Celsius value or a bpm reading cannot mean
  // anything else, so these need no vital word.
  var VITAL_FALLBACKS = [
    { key: 'temperature', re: /(\d{1,2}(?:[.,]\d)?)\s*°\s*[cf]\b/gi },
    { key: 'heartRate', re: /(\d{1,3})\s*bpm\b/gi }
  ];

  // Removes a matched vital phrase from the sentence and returns the number it
  // carried, so the same fact never appears twice in the note.
  function pullVital(pattern, text) {
    var value = null;
    var rest = text.replace(pattern, function (match, num) {
      if (value === null && num !== undefined) value = toNumber(num);
      return ' ';
    });
    return { value: value, text: rest };
  }

  // Reads every vital a sentence states. Returns the values found plus the
  // sentence with those phrases removed, so non-measurement words in the same
  // sentence ("Weight 6.8 kg and mild dehydration observed") survive into the
  // examination findings.
  function extractVitals(sentence) {
    var values = {};
    var rest = sentence;
    VITAL_EXTRACTORS.forEach(function (spec) {
      if (values[spec.key] !== undefined && values[spec.key] !== null) return;
      var pulled = pullVital(spec.re, rest);
      rest = pulled.text;
      if (pulled.value !== null) values[spec.key] = pulled.value;
    });
    VITAL_FALLBACKS.forEach(function (spec) {
      if (values[spec.key] !== undefined && values[spec.key] !== null) return;
      var pulled = pullVital(spec.re, rest);
      rest = pulled.text;
      if (pulled.value !== null) values[spec.key] = pulled.value;
    });
    return { values: values, rest: rest };
  }

  // Tidies what is left after the measurements are lifted out: drops the
  // orphaned punctuation and connectors the removal leaves behind. The
  // sentence's own full stop is KEPT — it is part of the Doctor's sentence.
// Returns '' when nothing but punctuation survived, so a pure measurement
  // sentence simply disappears from the findings instead of leaving "is ."
// behind.
//
// `capitalize` is passed only when a measurement was actually removed: that
// repair can leave a fragment starting mid-sentence ("and mild dehydration
// observed"), which reads as a sentence once the vital is gone. A sentence the
// Doctor wrote whole is returned untouched, label body included, so a labelled
// section keeps the Doctor's own capitalisation.
function tidyResidual(text, capitalize) {
  var out = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;:])\s*/g, '$1 ')
    .replace(/([,;:])\s*([,;.])/g, '$2')
    .trim()
    .replace(/^[,;:.\-\s]+/, '')
    .replace(/[\s,;:\-]+$/, '')
    .replace(/^(?:and|with|also|but|then)\s+/i, '')
    .trim();
  if (!/[a-z0-9]/i.test(out)) return '';
  if (!capitalize) return out;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

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
      return { ok: false, code: 'empty', message: 'Add the consultation transcript before generating a SOAP draft.' };
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
  // One place decides what the indicator says. `recording` is set by the Doctor
  // UI only while the browser is really capturing audio, so the pill never
  // claims audio exists when none does.
  function getScribeStatus(state) {
    var s = state && typeof state === 'object' ? state : {};
    if (s.unsavedChanges) return { state: 'unsaved_changes', label: 'Unsaved changes' };
    if (s.recording) return { state: 'recording', label: 'Recording' };
    if (s.saved) return { state: 'saved', label: 'Saved draft' };
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
    // so decimals ("39.4") are never split apart.
    return text
      .replace(/([.!?;])\s+/g, '$1\n')
      .split(/\n+/)
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part.length > 0; });
  }

  function classifySegment(segment) {
    var labelMatch = null;
    for (var i = 0; i < LABELS.length; i++) {
      var hit = segment.match(LABELS[i].re);
      if (hit) { labelMatch = LABELS[i].field; segment = segment.slice(hit[0].length).trim(); break; }
    }
    // Measurements are lifted out of every sentence, whatever it routes to:
    // "Weight 6.8 kg and mild dehydration observed" must yield the vital AND
    // the observation, never both in the findings and the vital field.
    var vitals = extractVitals(segment);
    // One residual for both paths: a labelled section has its label stripped
    // above, so `vitals.rest` is the section body minus the measurements —
    // "Objective: weight 3.1 kg." yields the vital and nothing in findings.
    var residual = tidyResidual(vitals.rest, hasVital(vitals.values));

    var route = labelMatch;
    if (!route) {
      var ownerSourced = matches(OWNER_CUES, segment);
      var objective = matches(MEASURED_VALUE, segment) || matches(EXAM_CUES, segment) || hasVital(vitals.values);
      if (ownerSourced) route = objective ? 'exam' : 'subjective';
      else if (objective) route = 'exam';
      else if (matches(PLAN_CUES, segment)) route = 'plan';
      else if (matches(ASSESSMENT_CUES, segment)) route = 'assessment';
      else if (matches(SYMPTOM_CUES, segment)) route = 'subjective';
      else route = null;
    }
    if (!route) {
      return hasVital(vitals.values) ? { field: 'exam', text: '', vitals: vitals.values } : null;
    }
    return { field: route, text: residual, vitals: vitals.values };
  }

  function hasVital(values) {
    return values.weight !== undefined || values.temperature !== undefined || values.heartRate !== undefined;
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

  // ── structured result -> flat `apply` map ────────────────────────────────
  // THE ONE place a structured SOAP result becomes form values. Both the mock
  // generator (generateSoapDraft) and the future backend path
  // (normalizeBackendResponse) call this, so the two can never disagree about
  // how a vital or a section reaches a control.
  //
  // Every value is a string because the controls are: a null vital becomes
  // '' — blanked, never left stale — so an applied result is always a clean
  // draft rather than a mix of old and new. `objective.findings` fills `exam`.
  // No trimming, no clamping and no range judgement happen here: those belong
  // to the portal's own validators, which must not be weakened.
  function buildApplyMap(soap) {
    var s = soap && typeof soap === 'object' ? soap : {};
    var o = s.objective && typeof s.objective === 'object' ? s.objective : {};
    var vital = function (value) {
      return value === null || value === undefined ? '' : String(value);
    };
    var text = function (value) {
      return value === null || value === undefined ? '' : String(value);
    };
    // Key order is the form's own order, so a snapshot, a JSON comparison and
    // the write loop all read the same way.
    return {
      subjective: text(s.subjective),
      weight: vital(o.weightKg),
      temperature: vital(o.temperatureC),
      heartRate: vital(o.heartRateBpm),
      exam: text(o.findings),
      assessment: text(s.assessment),
      plan: text(s.plan)
    };
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
      return {
        ok: false, error: validation, soap: null, apply: null,
        filled: [], missing: [], absentVitals: VITAL_FIELDS.slice(),
        unclassified: [], dropped: {}
      };
    }

    var segments = splitSegments(normalized.text);
    var buckets = { subjective: [], exam: [], assessment: [], plan: [] };
    var unclassified = [];
    var objectiveVitals = { weightKg: null, temperatureC: null, heartRateBpm: null };
    segments.forEach(function (segment) {
      var routed = classifySegment(segment);
      if (!routed) { unclassified.push(segment); return; }
      // First mention wins; a later repeat of the same vital is ignored rather
      // than contradicting the value already read.
      if (routed.vitals.weight !== undefined && objectiveVitals.weightKg === null) objectiveVitals.weightKg = routed.vitals.weight;
      if (routed.vitals.temperature !== undefined && objectiveVitals.temperatureC === null) objectiveVitals.temperatureC = routed.vitals.temperature;
      if (routed.vitals.heartRate !== undefined && objectiveVitals.heartRateBpm === null) objectiveVitals.heartRateBpm = routed.vitals.heartRate;
      if (routed.text) buckets[routed.field].push(routed.text);
    });
    Object.keys(buckets).forEach(function (field) { buckets[field] = dedupe(buckets[field]); });

    var dropped = {};
    function section(field, fallback) {
      var joined = joinWithinLimit(buckets[field], FIELD_LIMITS[field]);
      if (joined.dropped) dropped[field] = joined.dropped;
      return { text: joined.text, droppedCount: joined.dropped };
    }

    var subjective = section('subjective');
    var objective = section('exam');
    var assessment = section('assessment');
    var plan = section('plan');

    var soap = {
      subjective: subjective.text || NOT_PROVIDED,
      objective: {
        weightKg: objectiveVitals.weightKg,
        temperatureC: objectiveVitals.temperatureC,
        heartRateBpm: objectiveVitals.heartRateBpm,
        findings: objective.text || NOT_PROVIDED
      },
      assessment: assessment.text || NOT_PROVIDED,
      plan: plan.text || NOT_PROVIDED
    };

    var missing = [];
    if (!subjective.text) missing.push('subjective');
    if (!objective.text) missing.push('objective');
    if (!assessment.text) missing.push('assessment');
    if (!plan.text) missing.push('plan');
    var filled = ['subjective', 'objective', 'assessment', 'plan'].filter(function (field) { return missing.indexOf(field) === -1; });
    var absentVitals = VITAL_FIELDS.filter(function (field) {
      return objectiveVitals[VITAL_KEYS[field]] === null;
    });

    // The flat map the UI writes, built by the SAME helper the future backend
    // path uses (buildApplyMap), so the mock generator and a real service
    // cannot drift apart in how a structured result reaches the controls.
    var apply = buildApplyMap(soap);

    // generatedAt is metadata about the run, never part of the clinical text.
    // The caller may pass nowIso to keep the result reproducible in tests.
    var nowIso = typeof options.nowIso === 'string' ? options.nowIso : new Date().toISOString();

    return {
      ok: true,
      error: null,
      soap: soap,
      apply: apply,
      fields: APPLY_TARGETS.slice(),
      filled: filled,
      missing: missing,
      // Vitals the transcript did not state: the corresponding control is left
      // blank and the UI says so, so nobody reads an empty box as a normal one.
      absentVitals: absentVitals,
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

  // Form control name -> objective key in the structured result.
  var VITAL_KEYS = { weight: 'weightKg', temperature: 'temperatureC', heartRate: 'heartRateBpm' };

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
        soap: null, apply: null, filled: [], missing: [], absentVitals: VITAL_FIELDS.slice(),
        unclassified: [], dropped: {},
        meta: { engine: 'mock', generator: 'doctor-scribe-mock', version: VERSION, generatedAt: new Date().toISOString() }
      });
    }
  }

  // ── PRE-CONSULTATION SUMMARY ─────────────────────────────────────────────
  // The strip above the SOAP form. It is a PRE-consultation read of what the
  // clinic already knows: who the pet is, what the appointment is booked for,
  // and what the owner wrote when booking. It is deliberately NOT the pet's
  // triage fixture — that text describes symptoms for every visit of that pet,
  // including visits booked for something unrelated, so reusing it here would
  // invent symptoms the owner never reported for THIS appointment.
  //
  // Nothing is generated beyond those fields, and the concerns are echoed
  // verbatim. With nothing on file the summary says exactly that.
  function clip(text) {
    var value = String(text || '').replace(/\s+/g, ' ').trim();
    if (value.length <= MAX_NOTE_CHARS) return value;
    return value.slice(0, MAX_NOTE_CHARS - 1).replace(/\s+\S*$/, '') + '…';
  }

  function buildPreConsultationSummary(context) {
    var c = context && typeof context === 'object' ? context : {};
    var pet = clip(c.petName) || 'This patient';
    var service = clip(c.serviceLabel || c.service);
    var reason = clip(c.reason);
    var notes = clip(c.notes);

    var parts = [];
    parts.push(service
      ? (pet + ' is scheduled for ' + service + '.')
      : (pet + ' is scheduled for a consultation; no service was recorded with the appointment.'));
    if (reason && notes) {
      parts.push('Owner-stated concern: ' + reason + '. Booking notes: ' + notes + '.');
    } else if (reason) {
      parts.push('Owner-stated concern: ' + reason + '.');
    } else if (notes) {
      parts.push('Notes from the booking: ' + notes + '.');
    } else {
      parts.push('No additional symptoms or concerns were provided with the appointment.');
    }
    return parts.join(' ');
  }

  // ── RECORDING (browser capture -> future transcription seam) ─────────────
  // The recorder itself lives in the Doctor UI because only the browser can
  // grant a microphone. Everything the UI needs to be *correct* about a
  // recording — the state names, the labels, the error wording, the metadata
  // shape, the MIME choice and the processing result — lives here, so the same
  // rules apply in the portal and in a test with no microphone attached.
  var RECORDING_STATES = {
    READY: 'ready',
    REQUESTING: 'requesting_permission',
    RECORDING: 'recording',
    RECORDED: 'recorded',
    PROCESSING: 'processing',
    ERROR: 'error'
  };

  function getRecordingStatus(state) {
    var s = state && typeof state === 'object' ? state : {};
    switch (s.state) {
      case RECORDING_STATES.REQUESTING:
        return { state: RECORDING_STATES.REQUESTING, label: 'Waiting for microphone permission…' };
      case RECORDING_STATES.RECORDING:
        return { state: RECORDING_STATES.RECORDING, label: 'Recording…' };
      case RECORDING_STATES.PROCESSING:
        return { state: RECORDING_STATES.PROCESSING, label: 'Processing recording…' };
      case RECORDING_STATES.RECORDED:
        return { state: RECORDING_STATES.RECORDED, label: 'Recording ready' };
      case RECORDING_STATES.ERROR:
        return { state: RECORDING_STATES.ERROR, label: s.message ? 'Recording problem' : 'Recording problem' };
      default:
        return { state: RECORDING_STATES.READY, label: 'Recording is idle.' };
    }
  }

  // Friendly, non-technical wording for every getUserMedia failure the Doctor
  // can actually cause. The raw error never reaches the UI; it is for the
  // console only.
  var RECORDING_ERROR_MESSAGES = {
    NotAllowedError: 'Microphone permission was denied.',
    PermissionDeniedError: 'Microphone permission was denied.',
    NotFoundError: 'No microphone was found.',
    DevicesNotFoundError: 'No microphone was found.',
    NotReadableError: 'The microphone could not be accessed.',
    TrackStartError: 'The microphone could not be accessed.',
    AbortError: 'The microphone could not be accessed.',
    SecurityError: 'Microphone permission was denied.',
    NotSupportedError: 'Audio recording is not supported in this browser.',
    unsupported: 'Audio recording is not supported in this browser.',
    unknown: 'Recording could not start.'
  };

  function describeRecordingError(error) {
    if (error === 'unsupported' || (error && error.code === 'unsupported')) {
      return { code: 'unsupported', message: RECORDING_ERROR_MESSAGES.unsupported };
    }
    var name = (error && (error.name || error.code)) || 'unknown';
    return {
      code: String(name),
      message: RECORDING_ERROR_MESSAGES[name] || RECORDING_ERROR_MESSAGES.unknown
    };
  }

  // Capability detection, not a hardcoded format: the first candidate the
  // browser actually accepts wins, and an empty string means "let the browser
  // pick its own default". `isSupported` is injected so this is testable
  // without a MediaRecorder.
  function pickRecordingMimeType(isSupported, candidates) {
    var list = Array.isArray(candidates) && candidates.length ? candidates : RECORDING_MIME_CANDIDATES;
    if (typeof isSupported !== 'function') return '';
    for (var i = 0; i < list.length; i++) {
      try {
        if (isSupported(list[i])) return list[i];
      } catch (e) { /* an unknown type must never break recording */ }
    }
    return '';
  }

  // The recording object the future upload contract expects. Built HERE so the
  // UI cannot invent a second, looser shape: mimeType and sizeBytes come from
  // the Blob itself, and duration/recordedAt are supplied by the recorder.
  function buildRecording(blob, meta) {
    var b = blob || {};
    var m = meta && typeof meta === 'object' ? meta : {};
    var sizeBytes = typeof m.sizeBytes === 'number' ? m.sizeBytes
      : (typeof b.size === 'number' ? b.size : 0);
    if (sizeBytes <= 0) {
      return { ok: false, error: { code: 'empty_recording', message: 'The recording was empty. Try again.' } };
    }
    var durationSeconds = typeof m.durationSeconds === 'number' && m.durationSeconds >= 0
      ? Math.round(m.durationSeconds)
      : 0;
    return {
      ok: true,
      recording: {
        blob: b,
        mimeType: String(m.mimeType || b.type || 'application/octet-stream'),
        sizeBytes: sizeBytes,
        durationSeconds: durationSeconds,
        recordedAt: m.recordedAt || null
      }
    };
  }

  function validateRecording(recording) {
    var r = recording && typeof recording === 'object' ? recording : {};
    if (!r.blob) return { ok: false, code: 'no_recording', message: 'There is no recording to process.' };
    if (!(typeof r.sizeBytes === 'number' && r.sizeBytes > 0)) {
      return { ok: false, code: 'empty_recording', message: 'The recording was empty. Record again.' };
    }
    if (!r.mimeType) return { ok: false, code: 'no_mime', message: 'The recording has no audio format recorded.' };
    return { ok: true, code: 'ok', message: '' };
  }

  // FUTURE RESPONSE SHAPE (CONTRACT NEEDED / TBD).
  // When the Laravel endpoint exists it answers conceptually:
  //   { success, transcription: { text, language, durationSeconds },
  //     soap: { subjective, objective: { weightKg, temperatureC,
  //             heartRateBpm, findings | examinationFindings },
  //             assessment, plan, uncertainties: [] },
  //     warnings: [], providerMeta: { … } }
  // No provider name and no endpoint URL is hardcoded anywhere: providerMeta is
  // passed through untouched so the backend stays the only thing that knows who
  // transcribed the audio.
  // TODO(BACKEND): route, auth, upload limits and error codes are CONTRACT
  // NEEDED / TBD — see docs/VHS_CLINICAL_CONTRACT.md §7.11 / §8.

  // The internal property name for the Objective findings is `findings`. A
  // backend may spell it either way, so BOTH are accepted and normalized into
  // `findings`; the internal model and the `exam` binding are never renamed.
  var FINDINGS_ALIASES = ['examinationFindings', 'findings'];

  // The four sections a SOAP object must have at least one of for us to know we
  // are actually looking at a SOAP note rather than an unrecognised payload.
  var SOAP_SECTION_KEYS = ['subjective', 'objective', 'assessment', 'plan'];
  // The narrative sections a backend may spell differently or leave absent.
  var SOAP_TEXT_KEYS = ['subjective', 'assessment', 'plan'];

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isBlank(value) { return value === null || value === undefined; }

  // Keeps only usable strings from a warnings/uncertainties array. A warning
  // the Doctor cannot read is not a warning, and a non-string entry is a shape
  // fault rather than content.
  function normalizeWarningList(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (entry) {
      if (typeof entry === 'string' && entry.trim()) out.push(entry.trim());
    });
    return dedupe(out);
  }

  // FAIL CLOSED, never silently blank the clinical fields. A response that
  // claims a SOAP note but cannot be mapped safely is an error the Doctor sees;
  // it is never turned into four empty textareas, which would read as "nothing
  // was found" rather than "the answer was not understood".
  function validateSoapShape(s) {
    if (!isPlainObject(s)) {
      return { code: 'unsupported_soap_shape', message: 'The AI response did not contain a SOAP note.' };
    }
    var recognized = SOAP_SECTION_KEYS.filter(function (key) {
      return Object.prototype.hasOwnProperty.call(s, key);
    });
    if (!recognized.length) {
      return { code: 'unsupported_soap_shape', message: 'The AI response did not contain a recognisable SOAP note.' };
    }
    if ('objective' in s && !isPlainObject(s.objective)) {
      return { code: 'unsupported_soap_shape', message: 'The AI response returned an Objective section this portal cannot read.' };
    }
    // A text section must be text or absent. An object or number here is a
    // shape fault, not content to coerce.
    var textFault = SOAP_TEXT_KEYS.filter(function (key) {
      var value = s[key];
      return !isBlank(value) && typeof value !== 'string';
    });
    if (textFault.length) {
      return { code: 'unsupported_soap_shape', message: 'The AI response returned a malformed ' + textFault[0] + ' section.' };
    }
    var o = s.objective || {};
    var objectiveTextFault = FINDINGS_ALIASES.filter(function (key) {
      return !isBlank(o[key]) && typeof o[key] !== 'string';
    });
    if (objectiveTextFault.length) {
      return { code: 'unsupported_soap_shape', message: 'The AI response returned malformed examination findings.' };
    }
    return null;
  }

  // A vital must be a real number, and heart rate must be a WHOLE number,
  // because the consultation form's own gate accepts digits only for heart
  // rate. Coercing 125.5 to "125" would invent a precision the service did not
  // report, so a malformed vital is rejected instead.
  function validateVitals(o) {
    var faults = [
      { key: 'weightKg', label: 'Weight', integer: false },
      { key: 'temperatureC', label: 'Temperature', integer: false },
      { key: 'heartRateBpm', label: 'Heart rate', integer: true }
    ];
    for (var i = 0; i < faults.length; i++) {
      var f = faults[i];
      var value = o[f.key];
      if (isBlank(value)) continue;
      if (typeof value !== 'number' || !isFinite(value) || value < 0) {
        return { code: 'invalid_vital', message: 'The AI response returned an unusable ' + f.label + ' value.' };
      }
      if (f.integer && Math.floor(value) !== value) {
        return { code: 'invalid_vital', message: 'The AI response returned a heart rate that is not a whole number.' };
      }
    }
    return null;
  }

  // Field limits are the SAME caps the SOAP textareas already declare, so an
  // applied value can never trip doctorValidateClinical(). Over-long text is
  // rejected rather than truncated: cutting a clinical sentence in half is a
  // data change, and silently dropping the tail is worse than failing.
  function validateFieldLimits(soap) {
    var limits = [['subjective', soap.subjective], ['exam', soap.objective.findings],
      ['assessment', soap.assessment], ['plan', soap.plan]];
    for (var i = 0; i < limits.length; i++) {
      var value = limits[i][1];
      if (value.length > FIELD_LIMITS[limits[i][0]]) {
        return {
          code: 'field_too_long',
          message: 'The AI response\'s ' + limits[i][0] + ' is longer than the ' + FIELD_LIMITS[limits[i][0]] + '-character limit for that field.'
        };
      }
    }
    return null;
  }

  function normalizeBackendResponse(payload) {
    var p = payload && typeof payload === 'object' ? payload : {};
    // An EXPLICIT failure is reported as-is. A payload with no `success` flag is
    // not assumed to be a failure either: a service may answer with the bare
    // SOAP object, and refusing it here would be refusing it before it was ever
    // read. validateSoapShape() below is what decides whether a payload is
    // something this portal can safely map.
    if (p.success === false) {
      var reason = typeof p.message === 'string' && p.message.trim()
        ? p.message.trim()
        : 'The consultation AI service could not process this recording.';
      // Every failure carries `soap: null` and `apply: null`, so no caller can
      // ever find a partial result where a complete one was expected — the UI
      // cannot half-apply a draft from a rejected response.
      return { ok: false, error: { code: p.code || 'backend_error', message: reason }, soap: null, apply: null };
    }
    var t = isPlainObject(p.transcription) ? p.transcription : {};
    // The SOAP note is read from the documented envelope's `soap`, or from the
    // payload root when the service returns the bare SOAP object. Anything else
    // falls through to validateSoapShape() and is refused.
    var s = isPlainObject(p.soap) ? p.soap : p;

    var shapeFault = validateSoapShape(s);
    if (shapeFault) return { ok: false, error: shapeFault, apply: null, soap: null };
    var o = isPlainObject(s.objective) ? s.objective : {};

    // findings: either spelling normalizes into the ONE internal property.
    var findingsValue = '';
    for (var i = 0; i < FINDINGS_ALIASES.length; i++) {
      if (!isBlank(o[FINDINGS_ALIASES[i]])) { findingsValue = String(o[FINDINGS_ALIASES[i]]); break; }
    }

    var soap = {
      subjective: isBlank(s.subjective) ? '' : String(s.subjective),
      objective: {
        weightKg: isBlank(o.weightKg) ? null : o.weightKg,
        temperatureC: isBlank(o.temperatureC) ? null : o.temperatureC,
        heartRateBpm: isBlank(o.heartRateBpm) ? null : o.heartRateBpm,
        findings: findingsValue
      },
      assessment: isBlank(s.assessment) ? '' : String(s.assessment),
      plan: isBlank(s.plan) ? '' : String(s.plan)
    };

    var vitalFault = validateVitals(o);
    if (vitalFault) return { ok: false, error: vitalFault, apply: null, soap: null };
    var limitFault = validateFieldLimits(soap);
    if (limitFault) return { ok: false, error: limitFault, apply: null, soap: null };

    // `uncertainties` is folded into the EXISTING warnings channel rather than
    // given a new field or a new panel: one list, one place to read later.
    // `uncertainties` sits beside the sections wherever the SOAP object is, so
    // it is read from the same place the sections were.
    var warnings = normalizeWarningList(p.warnings)
      .concat(normalizeWarningList(s.uncertainties));

    var text = typeof t.text === 'string' ? t.text : '';
    return {
      ok: true,
      error: null,
      transcription: {
        text: text,
        language: typeof t.language === 'string' ? t.language : null,
        durationSeconds: typeof t.durationSeconds === 'number' ? t.durationSeconds : null
      },
      soap: soap,
      // Same flat, string-valued map the mock generator produces, built by the
      // same helper, so the UI's apply loop and draft snapshot are unchanged.
      apply: buildApplyMap(soap),
      fields: APPLY_TARGETS.slice(),
      warnings: dedupe(warnings),
      // Passthrough only. This module never names a provider.
      providerMeta: isPlainObject(p.providerMeta) ? p.providerMeta : {},
      meta: {
        engine: 'backend',
        generator: 'doctor-scribe-backend',
        version: VERSION,
        deterministic: false,
        generatedAt: new Date().toISOString(),
        // Identity only. The backend owns the joins; nothing is derived here.
        patient: sanitizePatient(isPlainObject(p.patient) ? p.patient : null)
      }
    };
  }

  // THE SEAM. The Doctor UI calls exactly this in Phase 2 and in production;
  // only the BODY changes when Laravel exists:
  //   mock (today) -> local, no audio touched, no network
  //   later        -> POST the recording to the consultation AI endpoint and
  //                   hand the answer to normalizeBackendResponse()
  // The Doctor never learns a provider, a URL or a key from either branch.
  // TODO(BACKEND): endpoint/auth/upload contract CONTRACT NEEDED / TBD.
  function processRecording(recording, context) {
    var r = recording && typeof recording === 'object' ? recording : {};
    var check = validateRecording(r);
    if (!check.ok) return { ok: false, error: { code: check.code, message: check.message } };
    var ctx = context && typeof context === 'object' ? context : {};
    return {
      ok: true,
      source: 'mock',
      // Explicitly NOT a transcription. Phase 2 has no speech-to-text, so the
      // text stays empty and the Doctor is told so; inventing words from audio
      // would be the most dangerous thing this panel could do.
      transcription: { text: '', language: null, durationSeconds: typeof r.durationSeconds === 'number' ? r.durationSeconds : null },
      soap: null,
      warnings: ['speech_to_text_not_connected'],
      providerMeta: null,
      meta: {
        engine: 'mock',
        generator: 'doctor-scribe-recording-mock',
        version: VERSION,
        recordedAt: r.recordedAt || null,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        durationSeconds: r.durationSeconds,
        // Identity only, for traceability. Clinical context is accepted so the
        // future call can send it, but nothing is derived from it here.
        appointmentId: ctx.appointmentId || '',
        petId: ctx.petId || ''
      }
    };
  }

  global.DoctorScribe = {
    identityMode: 'mock',
    engine: 'mock',
    version: VERSION,
    SOAP_FIELDS: SOAP_FIELDS,
    VITAL_FIELDS: VITAL_FIELDS,
    APPLY_TARGETS: APPLY_TARGETS,
    FIELD_LIMITS: FIELD_LIMITS,
    NOT_PROVIDED: NOT_PROVIDED,
    MAX_TRANSCRIPT_CHARS: MAX_TRANSCRIPT_CHARS,
    recording: RECORDING,
    RECORDING_STATES: RECORDING_STATES,
    RECORDING_MIME_CANDIDATES: RECORDING_MIME_CANDIDATES,
    normalizeTranscript: normalizeTranscript,
    validateScribeInput: validateScribeInput,
    getScribeStatus: getScribeStatus,
    getRecordingStatus: getRecordingStatus,
    describeRecordingError: describeRecordingError,
    pickRecordingMimeType: pickRecordingMimeType,
    buildRecording: buildRecording,
    validateRecording: validateRecording,
    normalizeBackendResponse: normalizeBackendResponse,
    buildApplyMap: buildApplyMap,
    processRecording: processRecording,
    generateSoapDraft: generateSoapDraft,
    createSoapDraft: createSoapDraft,
    buildPreConsultationSummary: buildPreConsultationSummary
  };
})(window);