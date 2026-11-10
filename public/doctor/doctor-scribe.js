/* Doctor Scribe SOAP draft adapter.
 * Local deterministic parser is the default. An explicitly enabled,
 * Doctor-only Laravel proposal endpoint may supply a structured SOAP draft.
 * Neither path automatically applies, saves, prescribes, or completes a visit.
 * Clinical/provider clearance is mandatory for external Gemini calls.
 */
(function (global) {
  'use strict';

  var VERSION = '3.5.0';

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
  var FIELD_LIMITS = { subjective: 2000, exam: 1000, assessment: 800, plan: 1000 };
  // Written into a section the transcript does not cover. Explicit beats blank:
  // the Doctor can see at a glance which sections the transcript missed.
  var NOT_PROVIDED = 'Not provided.';
  var MIN_CHARS = 12;     // below this there is nothing usable to structure
  var MAX_TRANSCRIPT_CHARS = 8000;
  var MAX_NOTE_CHARS = 160; // pre-consultation summary stays 2-4 short lines

  // Dictation (browser speech recognition). The BROWSER converts speech to
  // text; this adapter owns the wording and the error mapping. doctor.js
  // probes the actual SpeechRecognition capability at runtime and hides the
  // microphone control when the browser has none — the transcript box is the
  // honest fallback there, never a fake mic. The transcript text stays in the
  // Doctor UI's own state (the consultation draft), never in a store here.
  var RECORDING = {
    supported: true,
    mode: 'browser-dictation',
    storage: 'transcript-only',
    transcription: 'browser-speech-api',
    message: 'Browser dictation may process audio through your browser provider. SOAP drafting sends the transcript to Google and may send it to Groq if the approved backup is enabled. Use real clinical details only with approved privacy controls, and review the transcript before generating.'
  };

  // The line shown when the browser has no SpeechRecognition at all. Explicit
  // beats a silently dead button: the Doctor is told why and what to use.
  var DICTATION_UNSUPPORTED_MESSAGE =
    'This browser has no speech recognition, so dictation is unavailable.';

  function dictationUnsupportedMessage() { return DICTATION_UNSUPPORTED_MESSAGE; }

  // Friendly wording for every SpeechRecognition error the Doctor can cause.
  // The raw error name stays for the console only.
  var DICTATION_ERROR_MESSAGES = {
    'not-allowed': 'Microphone permission was denied for speech recognition.',
    'service-not-allowed': 'Speech recognition was blocked by this browser.',
    'audio-capture': 'No microphone was found for speech recognition.',
    'no-speech': 'No speech was detected.',
    'network': 'Speech recognition could not reach the browser\u2019s speech service.',
    'language-not-supported': 'This browser cannot recognise speech in the current language.',
    'aborted': 'Dictation was stopped.',
    unsupported: DICTATION_UNSUPPORTED_MESSAGE,
    unknown: 'Dictation could not start.'
  };

  function describeDictationError(error) {
    var code = (error && (error.error || error.code)) || error || 'unknown';
    if (code === 'unsupported' || code === 'language-not-allowed') code = code === 'unsupported' ? 'unsupported' : 'language-not-supported';
    return {
      code: String(code),
      message: DICTATION_ERROR_MESSAGES[code] || DICTATION_ERROR_MESSAGES.unknown
    };
  }

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
    // Common dictation shorthand: 'subject owner reports ...' (without a colon).
    { field: 'subjective', re: /^\s*subject\s+(?=(?:pet\s+)?owner\s+(?:reports?|reported|states?|stated|says?|said)\b)/i },
    { field: 'exam', re: /^\s*(?:objective|findings|examination findings|exam findings)\s*[:\-–—]\s*/i },
    { field: 'assessment', re: /^\s*(?:assessment|impression|diagnosis|differentials?)\s*[:\-–—]\s*/i },
    { field: 'plan', re: /^\s*(?:plan|plan of action|next steps?|treatment plan)\s*[:\-–—]\s*/i }
  ];
  // 2. Owner-sourced history: the Doctor's report of what the owner said or
  //    saw at home. Always history, never an exam finding. Deliberately narrow —
  //    a phrase that merely MENTIONS home ("monitoring intake at home") belongs
  //    to the plan, so only explicit owner attribution routes here.
  // Provenance matters more than anatomy. "Owner reports red ears" is NOT
  // evidence that the doctor examined the ears.
  var OWNER_CUES = /(?:\b(?:owner|guardian|client|caregiver|pet parent)\s+(?:reports?|reported|says?|said|states?|stated|notices?|noticed|mentions?|mentioned|describes?|described|complains?|complained|estimates?|estimated|believes?|believed|recalls?|recalled|thinks?|thought|measures?|measured)\b|\b(?:as reported by|according to)\s+(?:the\s+)?(?:owner|guardian|client)\b|\b(?:sabi|ayon|kwento|reklamo)\s+(?:ng|ni)\s+(?:owner|amo)\b|\b(?:iniulat|sinabi)\s+ng\s+(?:owner|amo)\b)/i;
  var HISTORICAL_CUES = /\b(?:previously|historically|last week|last month|last year|yesterday|ago|taken at home|measured at home|at home|before the visit|noong|kahapon|dati|nakaraan)\b/i;
  // Only explicit physical observations are Objective. Generic body parts like
  // "ears", "skin" and "gums" are deliberately NOT examination evidence.
  var EXAM_CUES = cueMatcher([
    'on examination', 'on exam', 'upon examination', 'physical exam', 'examination shows',
    'during examination', 'during the examination', 'during physical examination',
    'during the physical examination', 'during exam', 'during the exam',
    'examination revealed', 'exam revealed',
    'exam shows', 'observed on examination', 'observed on exam', 'clinician observed',
    'i observed', 'we observed', 'palpat', 'auscultat', 'capillary refill', 'crt',
    'mucous membranes', 'mucous membrane', 'body condition score', 'sa examination',
    'sa exam', 'sa pagsusuri', 'sa physical exam', 'upon inspection', 'i see', 'i observed'
  ]);
  // A documented absence of a current measurement is an Objective note,
  // not a numerical value. Preserve it for the clinician to review.
  var NO_CURRENT_MEASUREMENT = /\b(?:(?:no current|no)\s+(?:weight|temperature|heart\s*rate|pulse)\s+(?:(?:was|is)\s+)?(?:measured|recorded|measurement)|(?:weight|temperature|heart\s*rate|pulse)\s+(?:(?:was|is)\s+)?not\s+(?:measured|recorded))\b/i;
  var PLAN_CUES = cueMatcher([
    'plan', 'recommend', 'recommended', 'advise', 'advised', 'follow up', 'follow-up',
    'followup', 'recheck', 're-check', 'review in', 'schedule', 'scheduled follow',
    'next step', 'return for', 'discharge patient', 'discharge instructions', 'refer', 'referral', 'monitor',
    'treatment', 'therapy', 'prescribe', 'prescribed', 'prescription',
    'order', 'ordered', 'requested', 'request', 'administer', 'continue',
    'pinayuhan', 'inirerekomenda', 'irekomenda', 'ipagpatuloy', 'balik para',
    'bumalik', 'followup sa', 'gamutin', 'reseta'
  ]);
  var ASSESSMENT_CUES = cueMatcher([
    'assessment', 'impression', 'diagnosis', 'differential', 'consistent with',
    'suspicion', 'suspicious for', 'suspect', 'suspected', 'suggestive of',
    'probable', 'likely', 'appears to be', 'rule out', 'rules out', 'diagnostic of',
    'provisional', 'possible', 'posibleng', 'pinaghihinalaan', 'hinala', 'tingin ko'
  ]);
  var SYMPTOM_CUES = cueMatcher([
    'appetite', 'off food', 'not eating', 'refusing food', 'vomit', 'diarrhea', 'diarrhoea',
    'loose stool', 'limping', 'lame', 'scratching', 'coughing', 'sneezing', 'lethargy',
    'lethargic', 'water intake', 'drinking', 'urinating', 'straining', 'pain', 'whimper',
    'crying', 'restless', 'anxious', 'behaviour', 'behavior', 'weight loss', 'hair loss',
    'dandruff', 'sleeping', 'playful', 'swelling', 'wound', 'bite', 'itching', 'shaking',
    'nagsusuka', 'sumusuka', 'walang gana', 'ayaw kumain', 'nangangati', 'nagkakamot',
    'matamlay', 'inuubo', 'bahing', 'pilay', 'pagtatae', 'di kumakain', 'hindi kumakain'
  ]);
  // Strong indicators at the START of a phrase. An assessment outranks an ear
  // symptom and a future recommendation outranks a generic examination noun.
  var PLAN_START = /^(?:\s*(?:and|then)\s+)?(?:i |we |doctor |vet |the vet )?(?:recommend(?:ed)?|advise(?:d)?|plan(?:ning)? to|schedule|monitor|follow[- ]?up|recheck|refer|prescrib(?:e|ed)|order(?:ed)?|return for|pinayuhan|inirerekomenda|irekomenda|ipagpatuloy|bumalik)\b/i;
  var ASSESSMENT_START = /^(?:\s*(?:and|then)\s+)?(?:i |we |doctor |vet |the vet )?(?:suspect(?:ed)?|possible|likely|assessment|impression|diagnosis|hinala|posibleng|pinaghihinalaan|tingin ko)\b/i;
  // No blind Fahrenheit-to-Celsius conversion. A value in F stays in the
  // original text and the temperatureC input remains blank for doctor review.
  var FAHRENHEIT_CUE = /(?:\b(?:temperature|temp|fever|t)\b[^.!?;\n]{0,22}\d{2,3}(?:[.,]\d+)?\s*(?:°\s*)?(?:f\b|fahrenheit\b)|\b\d{2,3}(?:[.,]\d+)?\s*°\s*f\b)/i;

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
    { key: 'weight', examOnly: true, re: /\btimbang\s+(?:ay|na)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilograms?)\b/gi },
    { key: 'temperature', examOnly: true, re: /\btemperatura\s+(?:ay|na)\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°\s*c\b|celsius\b|c\b)/gi },
    {
      key: 'weight',
      // "weight was recorded as 6 kg" is a named measurement, just like
      // "weight is 6 kg". Without this, conflicting values remain blank
      // accidentally and the review panel never warns the doctor.
      re: /\b(?:body\s*weight|weight|wt|weighs|weighed)\s*(?:(?:of|is|was|at|now)\s+|(?:(?:is|was)\s+)?(?:recorded|measured)\s+(?:as|at|to\s+be)\s+|(?:(?:is|was)\s+)?(?:around|about|approximately|roughly|approx\.?|nearly)\s+|:\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilograms?)\b/gi
    },
    {
      key: 'temperature',
      re: /\b(?:temperature|temp|fever)\s*(?:(?:of|is|was|at)\s+|(?:(?:is|was)\s+)?(?:recorded|measured)\s+(?:as|at|to\s+be)\s+|(?:(?:is|was)\s+)?(?:around|about|approximately|roughly|approx\.?)\s+|:\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°\s*c\b|celsius\b|centigrade\b|c\b)/gi
    },
    {
      key: 'temperature',
      re: /(?:^|[\s,;(])t\s*(?:(?:of|is)\s+|:\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°\s*c\b|c\b|celsius\b)/gi
    },
    {
      key: 'heartRate',
      re: /\b(?:heart\s*rate|heartrate|pulse|hr)\s*(?:(?:of|is|was|at)\s+|(?:(?:is|was)\s+)?(?:recorded|measured)\s+(?:as|at|to\s+be)\s+|(?:(?:is|was)\s+)?(?:around|about|approximately|roughly|approx\.?)\s+|:\s*)?(\d{1,3})\s*(?:bpm\b|beats per minute\b)?/gi
    }
  ];
  var VITAL_FALLBACKS = [
    { key: 'temperature', re: /(\d{1,2}(?:[.,]\d{1,2})?)\s*°\s*c\b/gi },
    { key: 'heartRate', re: /(\d{1,3})\s*bpm\b/gi }
  ];
  // After a named vital is found, subsequent same-unit readings in the SAME
  // sentence must be considered too ("weight is 6 kg and 7 kg", "38 C, 39 C").
  // Otherwise a conflicting second reading can be silently discarded.
  // Do not apply these bare-unit patterns unless a named vital was found first:
  // arbitrary "8 kg of food" is not evidence of the animal's weight.
  var VITAL_SAME_SENTENCE_ADDITIONAL = [
    { key: 'weight', re: /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kgs?|kilograms?)\b/gi },
    { key: 'temperature', re: /\b(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°\s*)?(?:c\b|celsius\b|centigrade\b)/gi },
    { key: 'heartRate', re: /\b(\d{1,3})\s*(?:bpm\b|beats per minute\b)/gi }
  ];

  function extractVitals(sentence, omit) {
    var values = {};
    var seen = {};
    var rest = sentence;
    var warnings = [];
    var conflicted = [];
    if (omit) return { values: values, rest: rest, warnings: warnings, conflicted: conflicted };
    VITAL_EXTRACTORS.concat(VITAL_FALLBACKS).forEach(function (spec) {
      if (spec.examOnly && !/\b(?:sa pagsusuri|sa eksaminasyon|on examination|during examination)\b/i.test(sentence)) return;
      // Don't extract an unsupported unit or silently reinterpret a Fahrenheit
      // number as degrees C. The objective narrative retains its source.
      if (spec.key === 'temperature' && FAHRENHEIT_CUE.test(sentence)) return;
      rest = rest.replace(spec.re, function (full, numeric) {
        var value = toNumber(numeric);
        if (value === null) return full;
        if (!seen[spec.key]) seen[spec.key] = [];
        seen[spec.key].push(value);
        return ' ';
      });
    });
    // Look for remaining unit-marked readings after the first named extraction.
    // These are candidates for conflict, NOT independently verified current
    // vitals. This check also catches "temp 38 C, 39 C on repeat".
    VITAL_SAME_SENTENCE_ADDITIONAL.forEach(function (spec) {
      if (!seen[spec.key] || !seen[spec.key].length) return;
      if (spec.key === 'temperature' && FAHRENHEIT_CUE.test(sentence)) return;
      rest = rest.replace(spec.re, function (full, numeric) {
        var value = toNumber(numeric);
        if (value === null) return full;
        seen[spec.key].push(value);
        return ' ';
      });
    });
    Object.keys(seen).forEach(function (key) {
      var unique = seen[key].filter(function (value, i, all) { return all.indexOf(value) === i; });
      if (unique.length > 1) {
        conflicted.push(key);
        warnings.push('Conflicting ' + (key === 'heartRate' ? 'heart rate' : key) +
          ' measurements: the structured field was left blank for manual verification.');
      } else if (unique.length === 1 && unique[0] > 0) {
        values[key] = unique[0];
      } else {
        warnings.push('Invalid ' + key + ' measurement was left blank.');
      }
    });
    if (FAHRENHEIT_CUE.test(sentence)) {
      warnings.push('Fahrenheit temperature was not converted. Verify and enter degrees Celsius manually.');
    }
    return { values: values, rest: rest, warnings: warnings, conflicted: conflicted };
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
    var inputLimit = input && input.allowLongTranscript === true ? 30000 : MAX_TRANSCRIPT_CHARS;
    if (normalized.charCount > inputLimit) {
      return { ok: false, code: 'too_long', message: 'The transcript remains in the working draft, but SOAP generation currently supports up to ' + inputLimit + ' characters. Review it manually or use shorter excerpts.' };
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
    // Headings and strong clinician actions may appear in a single paragraph or
    // imperfect dictation without periods. Split only at explicit boundaries;
    // never invent words or interpret unsupported free-form statements.
    return text
      .replace(/([.!?;])\s+/g, '$1\n')
      // Separate changes in the source of a clinical statement even when the
      // doctor dictated one long sentence. Keeping the boundary words (and,
      // but, etc.) preserves the transcript's meaning for manual review.
      // These boundaries are only used when the following phrase explicitly
      // names an owner OR a clinician examination; body-part vocabulary is
      // never treated as evidence of a physical exam.
      .replace(/([,;]\s*(?:(?:and|but|while|however)\s+)?|\s+(?:and|but|while|however)\s+)(?=(?:on (?:physical )?exam(?:ination)?\b|upon exam(?:ination)?\b|during (?:the )?examination\b|(?:the\s+)?owner\s+(?:reports?|says?|states?|estimates?)\b))/gi, '$1\n')
      .replace(/\s+(?=(?:subjective|objective|assessment|plan|hpi|findings)\s*[:\-–—])/gi, '\n')
      .replace(/\s+(?:and|then)\s+(?=(?:on (?:physical )?exam(?:ination)?|upon examination|sa exam(?:ination)?|i see|i observed|i suspect|i recommend|we recommend|suspected|recommend|pinayuhan|posibleng)\b)/gi, '\n')
      .split(/\n+/)
      .map(function (part) { return part.trim(); })
      .filter(function (part) { return part.length > 0; });
  }

  function classifySegment(original) {
    var segment = original;
    var labelMatch = null;
    for (var i = 0; i < LABELS.length; i++) {
      var hit = segment.match(LABELS[i].re);
      if (hit) { labelMatch = LABELS[i].field; segment = segment.slice(hit[0].length).trim(); break; }
    }
    // A sentence crossing an owner-to-clinician transition cannot be safely
    // assigned as one SOAP section. Preserve it as unclassified for review.
    var ownerObservation = /\b(?:may (?:kaunti|konti) po ako napansin|hindi ko po alam|wala naman po ako napansin|napansin ko po|owner (?:reports?|says?|states?))\b/i.test(segment);
    var clinicalTransition = /\b(?:titignan|titingnan|susuriin)\s+(?:natin|ko)\b|\b(?:sa pagsusuri|on examination|during examination)\b/i.test(segment);
    if (ownerObservation && clinicalTransition) return null;
    var ownerSourced = OWNER_CUES.test(segment) || /\b(?:owner|guardian|client|may-ari|may ari)\s+(?:asks?|asked|nagtanong)\b|\b(?:sabi|ayon|kwento)\s+ng\s+(?:may-ari|may ari)\b/i.test(segment);
    // Temporal qualifiers are not limited to owner testimony. A clinician's
    // "Weight 8 kg last month" is ALSO historical, not a current vital.
    // Conservatively hold measurements whenever a segment refers to the past;
    // ask the Doctor to verify current values rather than infer them.
    var historical = HISTORICAL_CUES.test(segment);
    var historyHasMeasurement = historical && /\b(?:weight|weighs|weighed|wt|temperature|temp|heart\s*rate|pulse|hr)\b[^.!?;\n]{0,55}\d|\b\d{1,3}(?:[.,]\d{1,2})?\s*(?:kgs?|kilograms?|°\s*c|bpm)\b/i.test(segment);
    var planStart = PLAN_START.test(segment);
    var assessmentStart = ASSESSMENT_START.test(segment);
    var planContext = planStart || (!ownerSourced && matches(PLAN_CUES, segment) && !matches(EXAM_CUES, segment));
    var assessmentContext = assessmentStart || (!ownerSourced && matches(ASSESSMENT_CUES, segment));
    // Subjective, historic, suspected and planned measurements are not
    // clinician-confirmed vitals. Keep their source sentence visible instead.
    var mixedSource = ownerSourced && matches(EXAM_CUES, segment);
    var hypothetical = /\b(?:what if|would|could|might|hypothetical|suppose|if the|paano kung|kung sakali)\b/i.test(segment) || /\?/.test(segment);
    // Any unreliable or uncertain reading in the same segment needs manual review.
    // Do not attempt to identify which of multiple readings a qualifier modifies.
    var unreliable = /\b(?:broken|faulty|malfunction(?:ing|ed)?|defective|inaccurate|unreliable|uncertain|unsure|not sure|not accurate|not reliable|not calibrated|uncalibrated|out of calibration|stopped working|not working|new battery|false readings?|false results?|no,? i meant|did not measure|was not measured|hindi ito sigurado|hindi ko sinukat|questionable|unconfirmed|misread|misheard|incorrect|wrong|approximately|estimated?|about|maybe|perhaps|possibly|possible|sira|mali|hindi sigurado|tantiya)\b/i.test(segment);
    var omitVitals = historical || ownerSourced || hypothetical || unreliable || labelMatch === 'subjective'
      || labelMatch === 'plan' || labelMatch === 'assessment' || planContext || assessmentContext;
    var vitals = extractVitals(segment, omitVitals);
    if (unreliable && /\d/.test(segment)) vitals.warnings.push('A reading may be unreliable or uncertain. Review the original transcript and enter any verified measurements manually.');
    if (hypothetical && /\b(?:temperature|temp|temperatura|weight|timbang|heart rate|pulse|bpm)\b/i.test(segment) && /\d/.test(segment)) {
      vitals.warnings.push('A possible or hypothetical measurement was not entered as a vital. Verify the actual measurement manually.');
    }
    if (mixedSource) {
      vitals.warnings.push('This sentence mixes owner-reported information and examination wording. Verify source attribution manually.');
    }
    if (historyHasMeasurement && !ownerSourced) {
      vitals.warnings.push('Historical measurement was not entered as a current vital; verify the current value manually.');
    }
    // Clinical-text integrity: never carve a measurement out of the Doctor's
    // sentence. Regex replacement can leave misleading text such as
    // "On examination, Bella and has a ." when a statement includes more
    // than one vital or contains other examination findings. The structured
    // inputs hold the extracted numeric values, while the Objective narrative
    // keeps the original words verbatim (even when that duplicates a vital).
    // Preserve the full source on warnings too: the Doctor must be able to
    // review and resolve contradictions before applying the proposal.
    var residual = (vitals.warnings.length || hasVital(vitals.values))
      ? segment : tidyResidual(vitals.rest, false);
    var route = labelMatch;
    if (!route) {
      if (planStart || (planContext && !ownerSourced)) route = 'plan';
      else if (assessmentStart || assessmentContext) route = 'assessment';
      else if (ownerSourced) route = 'subjective';
      else if (matches(EXAM_CUES, segment) || NO_CURRENT_MEASUREMENT.test(segment) || hasVital(vitals.values)) route = 'exam';
      else if (matches(SYMPTOM_CUES, segment)) route = 'subjective';
      else if (matches(PLAN_CUES, segment)) route = 'plan';
      else route = null;
    }
    if (!route) {
      return hasVital(vitals.values) || vitals.warnings.length
        ? { field: 'exam', text: vitals.warnings.length ? segment : '', vitals: vitals.values, warnings: vitals.warnings, conflicted: vitals.conflicted } : null;
    }
    return { field: route, text: residual, vitals: vitals.values, warnings: vitals.warnings, conflicted: vitals.conflicted };
  }

  function hasVital(values) {
    return values.weight !== undefined || values.temperature !== undefined || values.heartRate !== undefined;
  }

  // Appends whole segments only: a section is never truncated mid-sentence.
  // Whatever did not fit is reported back so the UI can say so out loud.
  function joinWithinLimit(segments, limit) {
    var kept = [];
    var omitted = [];
    var used = 0;
    segments.forEach(function (segment) {
      var addition = kept.length ? 1 + segment.length : segment.length;
      if (used + addition > limit) { omitted.push(segment); return; }
      kept.push(segment);
      used += addition;
    });
    return { text: kept.join(' '), dropped: omitted.length, omitted: omitted };
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

  // Only readings entered by the doctor in this draft's review are applied.
  // Missing reviewed readings clear old values; AI candidates are never applied.
  function applyReviewedDraft(form, proposal, reviewedVitals) {
    var applied = {};
    SOAP_FIELDS.concat(VITAL_FIELDS).forEach(function (name) {
      var field = form && form.elements && form.elements.namedItem(name);
      if (!field) return;
      var source = VITAL_FIELDS.indexOf(name) !== -1 ? reviewedVitals : proposal;
      var value = source && source[name] != null ? String(source[name]) : '';
      field.value = value;
      applied[name] = value;
    });
    return applied;
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
    var warnings = [];
    var objectiveVitals = { weightKg: null, temperatureC: null, heartRateBpm: null };
    var vitalObservations = { weight: [], temperature: [], heartRate: [] };
    var blockedVitals = { weight: false, temperature: false, heartRate: false };
    segments.forEach(function (segment) {
      var routed = classifySegment(segment);
      if (!routed) { unclassified.push(segment); return; }
      if (routed.warnings) warnings = warnings.concat(routed.warnings);
      // A conflict within any sentence cannot be undone by a third reading
      // elsewhere in the transcript. Require an explicit manual review.
      (routed.conflicted || []).forEach(function (key) { blockedVitals[key] = true; });
      // Gather every observation. Different values never silently choose the
      // first or latest measurement; a doctor must resolve the conflict.
      VITAL_FIELDS.forEach(function (key) {
        if (routed.vitals[key] !== undefined) vitalObservations[key].push(routed.vitals[key]);
      });
      if (routed.text) buckets[routed.field].push(routed.text);
    });
    VITAL_FIELDS.forEach(function (key) {
      var observations = vitalObservations[key];
      var unique = observations.filter(function (number, index) { return observations.indexOf(number) === index; });
      if (blockedVitals[key] || unique.length > 1) {
        if (unique.length > 1) {
          warnings.push('Conflicting ' + (key === 'heartRate' ? 'heart rate' : key) +
            ' readings were recorded. The structured value was left blank; check the transcript.');
        }
      } else if (unique.length === 1) {
        objectiveVitals[VITAL_KEYS[key]] = unique[0];
      }
    });
    Object.keys(buckets).forEach(function (field) { buckets[field] = dedupe(buckets[field]); });

    var dropped = {};
    var omittedSegments = {};
    function section(field, fallback) {
      var joined = joinWithinLimit(buckets[field], FIELD_LIMITS[field]);
      if (joined.dropped) { dropped[field] = joined.dropped; omittedSegments[field] = joined.omitted; }
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
      warnings: dedupe(warnings),
      dropped: dropped,
      omittedSegments: omittedSegments,
      meta: {
        engine: 'local-deterministic',
        generator: 'doctor-scribe-local',
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

  // Review-only candidates are calculated locally from the original transcript,
  // independently of model-supplied numbers. Conservative omissions are intentional.
  function reviewableVitals(transcript) {
    transcript = String(transcript || '');
    var local = generateSoapDraft(transcript);
    if (!local.ok) return {};
    var segments = splitSegments(transcript), blocked = {weight:false, temperature:false, heartRate:false};
    var kinds = {
      weight: /\b(?:weight|weighs?|weighed|timbang|scale|weighing|kgs?|kilograms?)\b/i,
      temperature: /\b(?:temperature|temp|temperatura|thermometer|fever|celsius|fahrenheit)\b|°\s*[cf]\b/i,
      heartRate: /\b(?:heart\s*rate|pulse|bpm|stethoscope|pulse oximeter)\b/i
    };
    // A questionable source without an identifiable vital can refer to any
    // previous reading. Hold all candidates in that situation.
    var risk = /\b(?:broken|faulty|malfunction(?:ing|ed)?|defective|inaccurate|unreliable|uncertain|unsure|not sure|not accurate|not reliable|not calibrated|uncalibrated|out of calibration|stopped working|not working|new battery|false readings?|false results?|no,? i meant|did not measure|was not measured|hindi ito sigurado|hindi ko sinukat|questionable|unconfirmed|misread|misheard|incorrect|wrong|approximately|estimated?|about|maybe|perhaps|possibly|possible|might|could|would|hypothetical|suppose|what if|not measured|not recorded|no current|last (?:week|month|year)|yesterday|at home|owner|guardian|client|may-ari|sira|mali|hindi sigurado|tantiya|posible|siguro|hindi sinukat)\b/i;
    // Any separate comment about measuring equipment can qualify an earlier
    // reading, even when it uses words we do not recognize. Hold that vital.
    var equipment = { weight:/\b(?:scale|weighing machine|timbangan)\b/i, temperature:/\b(?:thermometer)\b/i, heartRate:/\b(?:stethoscope|pulse oximeter)\b/i };
    segments.forEach(function(segment) {
      VITAL_FIELDS.forEach(function(key) { if (equipment[key].test(segment) && !/\d/.test(segment)) blocked[key]=true; });
      if (/\b(?:actually|correction|i meant|i guess|guessing|guess|flicker(?:ing)?|inconsistent|hindi pala|akala ko)\b/i.test(segment)) {
        VITAL_FIELDS.forEach(function(key) { blocked[key]=true; });
      }
      if (!risk.test(segment)) return;
      var named = VITAL_FIELDS.filter(function(key) { return kinds[key].test(segment); });
      // An owner reporting ordinary symptoms is not by itself a vital warning.
      if (!named.length && /\b(?:owner|guardian|client|may-ari)\b/i.test(segment) && !/\b(?:broken|faulty|wrong|misheard|uncertain|unsure|not sure|maybe|approximately|sira|mali|measured|measurement|following|at home)\b/i.test(segment)) return;
      (named.length ? named : VITAL_FIELDS).forEach(function(key) { blocked[key] = true; });
    });
    var out = {};
    VITAL_FIELDS.forEach(function(key) {
      var value = local.apply[key];
      if (!value || blocked[key]) return;
      var sources = segments.filter(function(segment) {
        var parsed = classifySegment(segment);
        return parsed && parsed.vitals && String(parsed.vitals[key]) === String(value);
      });
      if (!sources.length) return;
      out[key] = {value:String(value), source:sources.join(' '), context:transcript};
    });
    return out;
  }

  // Show the original passage for unit-marked measurements without deciding
  // whether a value is current, historical, reliable, or even a patient vital.
  function measurementSourcePassages(transcript) {
    return String(transcript || '').split(/(?<=[.!?])\s+|\n+/u).map(function (part) {
      return part.trim();
    }).filter(function (part) {
      return /\b(?:kilos?|kilograms?|timbang|timbangan|weight|weighs?|weighed)\b/i.test(part) || /\d+(?:[.,]\d+)?\s*(?:kgs?\b|kilograms?\b|(?:°\s*)?[cf]\b|celsius\b|fahrenheit\b|bpm\b|beats\s+per\s+minute\b)/i.test(part);
    });
  }
  // Highlight only wording copied from a measurement passage. These spans are
  // text aids, not classifications, conversions or verified vital readings.
  function measurementSourceRuns(source) {
    source = String(source || '');
    var unitMention = /(?:\b\d+(?:[.,]\d+)?|[\p{L}]+(?:\s+na)?)\s*(?:kgs?|kilograms?|kilos?|bpm|beats\s+per\s+minute|°\s*[cf]|celsius|fahrenheit)(?![\p{L}])/giu;
    var runs = [], offset = 0, match;
    while ((match = unitMention.exec(source)) !== null) {
      if (match.index > offset) runs.push({ text: source.slice(offset, match.index), highlight: false });
      runs.push({ text: match[0], highlight: true });
      offset = match.index + match[0].length;
    }
    if (offset < source.length) runs.push({ text: source.slice(offset), highlight: false });
    return runs;
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
    var requestedDraftLanguage = input && input.draftLanguage === 'source' ? 'source' : 'english';
    function localDraft(reason) {
      try {
        var draft = generateSoapDraft(input);
        if (draft.ok) {
          if (reason) draft.warnings = (draft.warnings || []).concat([reason]);
          if (requestedDraftLanguage === 'english') draft.warnings = (draft.warnings || []).concat(['Language choice requires AI drafting; this local draft uses source wording.']);
        }
        return draft;
      } catch (error) {
        return {
          ok: false,
          error: { code: 'failed', message: 'The SOAP draft could not be generated. Enter the SOAP note manually.' },
          soap: null, apply: null, filled: [], missing: [], absentVitals: VITAL_FIELDS.slice(),
          unclassified: [], dropped: {}, meta: { engine: 'local-deterministic' }
        };
      }
    }

    // This flag is false by default. Without clinical/provider approval, real
    // transcripts must never leave the clinic's local drafting workflow.
    if (global.VHS_DOCTOR_SCRIBE_GEMINI !== true) {
      if (normalizeTranscript(input).text.length > MAX_TRANSCRIPT_CHARS) return Promise.resolve({ok:false,error:{code:'long_draft_unavailable',message:'Full-length drafting is not enabled. The transcript remains unchanged.'}});
      return Promise.resolve(localDraft());
    }
    var auth = global.VHSAuth;
    var appointmentId = input && input.appointmentId;
    var transcript = normalizeTranscript(input).text;
    if (!auth || typeof auth.send !== 'function' || !/^\d+$/.test(String(appointmentId || ''))) {
      if (transcript.length > MAX_TRANSCRIPT_CHARS) return Promise.resolve({ok:false,error:{code:'long_draft_unavailable',message:'The full-length drafting service is unavailable. The transcript remains unchanged.'}});
      return Promise.resolve(localDraft('Gemini unavailable; this proposal used the local parser.'));
    }
    // Only appointment_id and doctor-entered transcript go to authorized Laravel.
    // Pet identity, user details and historic records are NOT sent here.
    var request = Promise.resolve().then(function () {
      if (transcript.length <= 3500) return true;
      // Ask the authenticated server before transmitting a longer transcript.
      return auth.send('ai/doctor-scribe-audio-limits', null, {method:'GET'}).then(function (response) {
        return !!(response && response.ok && response.data && response.data.draft_max_chars >= transcript.length);
      }).catch(function () { return false; });
    }).then(function (allowed) {
      if (!allowed) return {ok:false, raw:{code:'long_draft_unavailable'}};
      var payload={ appointment_id: Number(appointmentId), transcript: transcript, mode: 'summary', draft_language: requestedDraftLanguage };
      if (typeof input.retryToken === 'string' && input.retryToken) payload.retry_token=input.retryToken;
      return auth.send('ai/doctor-scribe', payload);
    });
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = global.setTimeout(function () { reject(new Error('timed out')); }, 115000);
    });
    return Promise.race([request, timeout]).then(function (response) {
      if (!response || !response.ok || !response.data) {
        var code = response && response.raw && response.raw.code;
        if (code === 'long_draft_unavailable' && transcript.length > MAX_TRANSCRIPT_CHARS) return {ok:false,error:{code:code,message:'This transcript is preserved, but full-length drafting is not enabled. Review it manually.'}};
        if (code === 'long_draft_unavailable') return localDraft('Long experimental drafting is unavailable; this proposal uses the local parser. Review the full transcript.');
        if (code === 'single_pass_unavailable') {
          var reasons={checkpoint_unavailable:'Secure retry storage is unavailable. No provider work was started; retry when storage is available.',invalid_input:'The request could not be processed safely.',in_progress:'This consultation draft is already processing. Retry shortly to retrieve the same job.',incomplete_response:'The provider reached its output budget before completing the proposal.',needs_manual_compression:'This consultation cannot fit safely in the SOAP fields. Review the full transcript and enter a shorter note manually.',rate_limit:'The drafting service reached a usage limit.',advice_unverified:'A proposed recommendation could not be verified against the transcript. Review it manually.',invalid_section:'The draft had an empty or oversized section.',invalid_reference:'The draft cited an invalid source passage.',invalid_json:'The service returned invalid structured output.',invalid_schema:'The service returned invalid structured output.',http_error:'The provider could not complete the request.',timeout:'The drafting service timed out.',transport:'The drafting service could not be reached.',segment_exceeds_limit:'One uninterrupted passage exceeded the supported size.'};
          var status=response.data || {}; var detail=reasons[status.failure] || 'Full-transcript drafting did not finish.';
          var names={gemini:'Gemini',groq:'Groq',configured:'Configured provider'}, outcomes={ok:'responded',rate_limit:'usage limit',timeout:'timed out',transport:'connection failed',invalid_json:'invalid response',invalid_schema:'invalid response',http_error:'service error',configuration:'configuration error',incomplete_response:'incomplete response',empty_response:'empty response',safety_refusal:'refused',unknown:'unavailable'};
          var attempts=(Array.isArray(status.providerAttempts)?status.providerAttempts:[]).filter(function(a){return a && names[a.provider] && outcomes[a.category];}).map(function(a){return names[a.provider]+': '+outcomes[a.category];});
          return {ok:false,error:{code:code,message:detail+' The transcript is unchanged; retry or review it manually.'+(attempts.length?' Last AI request — '+attempts.join('; ')+'.':'')}};
        }
        if (transcript.length > MAX_TRANSCRIPT_CHARS) return {ok:false,error:{code:code || 'draft_unavailable',message:'Full-transcript drafting did not finish. The transcript is unchanged; retry or review it manually.'}};
        if (code === 'experimental_incomplete' && response.data && typeof response.data.retryToken === 'string') return {ok:false, error:{code:code,message:'Processing incomplete. Retry failed parts or review the transcript manually.'}, retryToken:response.data.retryToken, failedChunks:Array.isArray(response.data.failedChunks)?response.data.failedChunks:[], completedChunks:Number.isSafeInteger(response.data.completedChunks)?response.data.completedChunks:0, totalChunks:Number.isSafeInteger(response.data.totalChunks)?response.data.totalChunks:0, resumedChunks:Number.isSafeInteger(response.data.resumedChunks)?response.data.resumedChunks:null, summaryFailure:typeof response.data.summaryFailure==='string'?response.data.summaryFailure:null, reviewSources:Array.isArray(response.data.reviewSources)?response.data.reviewSources:[], providerAttempts:Array.isArray(response.data.providerAttempts)?response.data.providerAttempts:[], summaryStage:['generation','source_check','meaning_check','draft_format','draft_field_limit','draft_section_mismatch','source_coverage','source_support','source_links'].includes(response.data.summaryStage)?response.data.summaryStage:null};
        if (code === 'experimental_incomplete' && response.data && response.data.summaryStage === 'source_too_large') return {ok:false,error:{code:code,message:'This transcript has more source material than the current verification can process at once. The transcript is unchanged; review it manually. Repeating the same retry will not fix this.'}};
        if (code === 'retry_expired') return {ok:false,error:{code:code,message:'The retry expired or the consultation changed. Generate a new draft.'}};
        if (code === 'experimental_incomplete') return {ok:false,error:{code:code,message:'Processing did not finish. The transcript is unchanged; review it manually or generate again.'}};
        if (code === 'privacy_contact_detected') return localDraft('Possible email or Philippine mobile number detected. Transcript was not sent for external drafting. Remove contact details and review names and other identifiers; this check is not comprehensive.');
        if (code === 'ungrounded_vital' || code === 'invalid_vital') {
          return localDraft('The AI draft could not be verified because a proposed vital reading was uncertain or inconsistent with the transcript. This proposal uses the local parser; review the original text and enter vital signs manually.');
        }
        if (typeof code === 'string' && (/^ungrounded_(subjective|objective|assessment|plan)$/.test(code) || /^source_mismatch_(subjective|objective|assessment|plan)$/.test(code))) {
          return localDraft('The AI draft could not be verified against the transcript. This proposal uses the local parser; review the original text carefully.');
        }
        return localDraft('SOAP drafting unavailable or not authorized; this proposal used the local parser.');
      }
      var normalized = normalizeBackendResponse(response.data);
      if (!normalized.ok) {
        if (transcript.length > MAX_TRANSCRIPT_CHARS) return {ok:false,error:{code:'invalid_draft',message:'The returned draft could not be reviewed safely. The transcript remains unchanged.'}};
        return localDraft('The SOAP service returned an unusable draft; this proposal used the local parser.');
      }
      // Compare complete source sentences, not isolated words. A partial quote
      // is flagged for review because qualifiers and negations may be missing.
      var sections = [normalized.soap.subjective, normalized.soap.objective.findings,
        normalized.soap.assessment, normalized.soap.plan].map(function (v) {
          return String(v || '').replace(/\s+/g, ' ').trim();
        });
      // For summarized sections, compare omissions against the original
      // source passages rather than treating every paraphrase as an omission.
      if (normalized.sourceSections) sections = ['subjective','objective','assessment','plan'].map(function (key) { return String(normalized.sourceSections[key] || '').replace(/\s+/g, ' ').trim(); });
      var sourceSegments = transcript.split(/(?<=[.!?])\s+|\n+/u).map(function (v) {
        // Match the server's narrowly defined neutral document headings.
        // Never strip arbitrary prefixes: they can contain clinical qualifiers.
        return v.replace(/\s+/g, ' ').trim().replace(/^(?:fictional test|test transcript|consultation transcript|transcript)\s*:\s*/i, '');
      });
      normalized.questionAnswerContext = sourceSegments.map(function (v, index) {
        if (!v || !/\?\s*$/.test(v) || index + 1 >= sourceSegments.length) return null;
        var following = sourceSegments[index + 1];
        if (!following || /\?\s*$/.test(following)) return null;
        var included = sections.some(function (section) { return section.indexOf(following) !== -1; });
        if (!included) return null;
        // Preserve consecutive question fragments; a punctuation model can
        // split one spoken question into several separate questions.
        var first = index;
        while (first > 0 && /\?\s*$/.test(sourceSegments[first - 1])) first--;
        return { question: sourceSegments.slice(first, index + 1).join(' '), response: following };
      }).filter(Boolean);
      // New experimental responses identify uncertain or unlinked passages.
      // Older responses keep the conservative full-sentence comparison.
      if (Array.isArray(normalized.reviewItems)) {
        normalized.sourceReview = normalized.auditReviewSources || [];
      } else {
        normalized.sourceReview = sourceSegments.filter(function (v) {
          return v && !sections.some(function (section) { return section.indexOf(v) !== -1; });
        }).concat(normalized.auditReviewSources || []);
      }
      normalized.emptyNarrative = sections.every(function (v) { return !v || v === NOT_PROVIDED; });
      return normalized;
    }).catch(function (error) {
      if (error && error.message === 'timed out') {
        return {ok:false,error:{code:'draft_timeout',message:'Drafting timed out. The server may still be processing the request; wait before generating again. Your transcript is unchanged.'},
          retryToken:typeof input.retryToken === 'string' ? input.retryToken : null, failedChunks:[]};
      }
      if (typeof input.retryToken === 'string' && input.retryToken) return {ok:false,error:{code:'retry_unavailable',message:'Could not reach the service. Retry failed parts again.'},retryToken:input.retryToken,failedChunks:[]};
      if (transcript.length > MAX_TRANSCRIPT_CHARS) return {ok:false,error:{code:'draft_unavailable',message:'Could not reach the drafting service. The transcript remains unchanged.'}};
      return localDraft('SOAP drafting request failed; this proposal used the local parser.');
    }).finally(function () {
      if (timer !== undefined) global.clearTimeout(timer);
    });
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
    ERROR: 'error'
  };

  function getRecordingStatus(state) {
    var s = state && typeof state === 'object' ? state : {};
    switch (s.state) {
      case RECORDING_STATES.REQUESTING:
        return { state: RECORDING_STATES.REQUESTING, label: 'Starting dictation…' };
      case RECORDING_STATES.RECORDING:
        return { state: RECORDING_STATES.RECORDING, label: 'Listening…' };
      case RECORDING_STATES.RECORDED:
        return { state: RECORDING_STATES.RECORDED, label: 'Dictation captured' };
      case RECORDING_STATES.ERROR:
        return { state: RECORDING_STATES.ERROR, label: 'Dictation problem' };
      default:
        return { state: RECORDING_STATES.READY, label: 'Dictation is idle.' };
    }
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
    // `uncertainties` is read from BOTH places it can sensibly sit: beside the
    // sections (the bare SOAP object) and at the envelope root (next to
    // `warnings`, which is where the documented envelope puts it). Reading only
    // one would drop the list silently, which is the exact failure this
    // normalizer exists to prevent.
    var warnings = normalizeWarningList(p.warnings)
      .concat(normalizeWarningList(s.uncertainties))
      .concat(normalizeWarningList(p.uncertainties));

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
      sourceSections: isPlainObject(p.sourceSections) ? p.sourceSections : null,
      sourceViews: isPlainObject(p.sourceViews) ? p.sourceViews : null,
      automatedReview: isPlainObject(p.automatedReview) && ['unavailable','flagged','no_issue_found'].includes(p.automatedReview.status) ? p.automatedReview : null,
      processing: isPlainObject(p.processing) ? p.processing : null,
      reused: p.reused === true,
      jobId: typeof p.jobId === 'string' ? p.jobId : null,
      sourceVersion: typeof p.sourceVersion === 'string' ? p.sourceVersion : null,
      summaryApplied: p.summaryApplied === true,
      summaryMethod: ['semantic','grounded','single_pass'].includes(p.summaryMethod) ? p.summaryMethod : 'source',
      summaryLanguage: ['english','source'].includes(p.summaryLanguage) ? p.summaryLanguage : null,
      auditReviewSources: Array.isArray(p.auditReviewSources) ? p.auditReviewSources.filter(function (v) { return typeof v === 'string' && v.trim(); }) : [],
      reviewItems: Array.isArray(p.reviewItems) ? p.reviewItems.filter(function (v) {
        return isPlainObject(v) && typeof v.text === 'string' && v.text.trim() && typeof v.reason === 'string';
      }).map(function (v) { return { text: v.text, reason: v.reason }; }) : null,
      unlinkedSources: Array.isArray(p.unlinkedSources) ? p.unlinkedSources.filter(function(v){return typeof v==='string' && v.trim();}) : [],
      claimLinks: Array.isArray(p.claimLinks) ? p.claimLinks : [],
      placementSuggestions: Array.isArray(p.placementSuggestions) ? p.placementSuggestions : [],
      summaryProvider: ['gemini','groq'].includes(p.summaryProvider) ? p.summaryProvider : null,
      summaryCheckProvider: ['gemini','groq'].includes(p.summaryCheckProvider) ? p.summaryCheckProvider : null,
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

  global.DoctorScribe = {
    suggestConservativeCleanup: function (source) {
      source = String(source || '');
      // A review-only option: remove isolated hesitation sounds only.
      // Never remove clinical words, numbers, negations, or repetitions.
      var cleaned = source.replace(/(^|(?<=[.!?;])\s+)(?:fictional test|test transcript|consultation transcript|transcript)\s*:\s*/giu, '$1')
        .replace(/(^|[^\p{L}\p{N}])(?:um+|uh+)(?=$|[^\p{L}\p{N}])/giu, '$1')
        .replace(/[ \t]{2,}/g, ' ').replace(/(^|[.!?]\s*)[,;]\s*/g, '$1').trim();
      return { source: source, suggestion: cleaned, changed: cleaned !== source.trim() };
    },
    prepareReviewedCleanup: function (apply) {
      var prepared = Object.assign({}, apply || {}), changes = [];
      [['subjective','Subjective'], ['exam','Objective findings'], ['assessment','Assessment'], ['plan','Plan']].forEach(function (entry) {
        var original = prepared[entry[0]];
        if (typeof original !== 'string' || !original.trim()) return;
        var proposal = global.DoctorScribe.suggestConservativeCleanup(original);
        if (!proposal.changed || !proposal.suggestion) return;
        prepared[entry[0]] = proposal.suggestion;
        changes.push({label:entry[1], source:proposal.source, suggestion:proposal.suggestion});
      });
      return {apply:prepared, changes:changes};
    },
    identityMode: 'local-deterministic',
    engine: 'local-deterministic',
    version: VERSION,
    SOAP_FIELDS: SOAP_FIELDS,
    VITAL_FIELDS: VITAL_FIELDS,
    APPLY_TARGETS: APPLY_TARGETS,
    FIELD_LIMITS: FIELD_LIMITS,
    NOT_PROVIDED: NOT_PROVIDED,
    MAX_TRANSCRIPT_CHARS: MAX_TRANSCRIPT_CHARS,
    recording: RECORDING,
    RECORDING_STATES: RECORDING_STATES,
    dictationUnsupportedMessage: dictationUnsupportedMessage,
    describeDictationError: describeDictationError,
    normalizeTranscript: normalizeTranscript,
    validateScribeInput: validateScribeInput,
    getScribeStatus: getScribeStatus,
    getRecordingStatus: getRecordingStatus,
    normalizeBackendResponse: normalizeBackendResponse,
    buildApplyMap: buildApplyMap,
    applyReviewedDraft: applyReviewedDraft,
    generateSoapDraft: generateSoapDraft,
    reviewableVitals: reviewableVitals,
    measurementSourcePassages: measurementSourcePassages,
    measurementSourceRuns: measurementSourceRuns,
    createSoapDraft: createSoapDraft,
    buildPreConsultationSummary: buildPreConsultationSummary
  };
})(window);
