# Doctor Scribe: project requirements

These requirements record the project owner's instructions for future Scribe work. They are design goals, not claims of clinical reliability.

- Work only in this repository. Do not push or deploy without a later explicit instruction.
- Produce a concise, editable SOAP proposal from the complete consultation. Support English, Filipino, and Taglish, including mixed languages and limited punctuation. A doctor chooses English or the consultation language; keep the full transcript available for comparison.
- Categorize information by its meaning and preserve relevant details, negation, uncertainty, corrections, timing, speaker context, laterality, and the status of discussed, recommended, declined, or completed actions. Do not invent facts, diagnoses, treatments, or medical advice.
- Use general solutions across consultations. Do not add case-specific clinical rules or tune behavior only to one example. Test correct examples as well as errors so false warnings remain visible.
- Make source passages useful for review, keep surrounding context, and never present AI-selected source links as proof of clinical accuracy. The veterinarian must review and edit the proposal before applying or saving it.
- Preserve assigned-doctor authorization, clinical/privacy approval gates, manual vital entry and confirmation, and the consultation review process. Use only fictional consultations and recordings in provider tests unless later explicitly authorized otherwise.
- Support recordings beyond two minutes and handle limits, interruptions, uploads and retries without silently discarding audio or transcript text. Clearly communicate what remains recoverable and where it is stored.
- Keep Gemini and the approved Groq backup available under existing privacy controls. Measure and minimize repeated requests and token use; do not silently send data to an additional provider.
- Verify behavior with varied short, medium, long, and punctuation-light fictional examples and the real doctor-portal review flow. Report the actual results, provider limitations, and remaining risks without claiming universal accuracy.

## Later follow-ups requested by the owner

After the Scribe work, investigate appointments remaining in consultation or appearing past their date when the patient was not checked in, and clarify the appropriate no-show/cancelled transition. Also investigate the reported authentication behavior when reusing links or browser back/forward across sessions. These are reported issues, not yet verified findings in this document.
## Development check: 10 November 2026

- The active experimental reviewer now compares the transcript and draft by SOAP category within its existing review request. Its internal comparison is not returned to the portal as source evidence. The separate correction check remains in place.
- The portal's source view can highlight selected parts of a sentence while retaining surrounding context. A highlighted passage is an AI selection, not a guarantee that the category or meaning is correct.
- Fictional paired tests covered misplaced examination findings, added advice, negation, unsupported details, and corrections. Some succeeded, but Groq produced a false warning and missed one altered example. A general review missed a correction in an 8,306-character synthetic transcript; the separate correction check caught the changed and correct versions in one paired run.
- In the latest fictional portal run, the examination finding appeared under Objective, Objective and Assessment displayed different source highlights, and applying without the required review confirmations was blocked. An earlier portal run still misplaced the finding without a specific warning. No SOAP note was applied or finalized.
- The targeted local suite passed 55 backend tests (887 assertions), with additional simulated source-view, vital, recording and integration checks. This does not establish clinical reliability or verify a real 30-minute recording.
- Measured provider tests in this development round reported at least 75,486 tokens; portal calls and some failed retries were not captured. The final checks made no further provider calls. These figures are not billing totals.

## Language and concise-draft check: 10 November 2026

- The open fictional consultation used the consultation-language option, but the displayed plan was entirely in English. The draft also implied the animal was without a companion when the source only said the speaker was away. Those observations show that language choice and source meaning can both drift; the draft remained unapproved.
- Draft-only fictional English, Filipino, and Taglish comparisons used a stubbed review model. A more compact English note preserved the tested ear-case correction and examination details in one run, while several mixed-language runs remained close to the source or switched the plan to English. These are examples, not reliability measurements.
- Shorter candidate instructions sometimes moved an examination finding, omitted a stated risk, or introduced an unsupported interpretation. A separate editing call returned unchanged text in one mixed-language run and used another 1,325 provider-reported tokens. The unsuccessful prompt and extra-edit candidates were removed and were not enabled in the portal.
- At least 23 observed provider requests in this work reported 35,422 tokens in total; one additional test result was not captured. Provider reports are not billing totals. The full clinical review was not exercised in the draft-only comparisons.
- A later draft-only comparison used generic SOAP field descriptions without an extra model call. In one English case it produced a shorter note; in a separate Taglish case it added an interpretation that the source did not clearly state. This candidate remains in the fictional test tool only, not the portal.
- The existing portal generator, clinical/privacy gates, source review and manual-vitals workflow were not changed by these experiments. The next candidate should be evaluated against varied fictional cases for language consistency, conciseness, omitted details, incorrect attribution and added advice, with both correct and incorrect examples.

## Two-stage implementation: 10 November 2026

The active single-pass branch now uses statement-linked drafting and one consolidated review, with encrypted short-lived checkpoints, duplicate-request locking, completion-integrity checks, aligned output ceilings, and editable preview. It no longer routinely calls the separate correction checker. See [Scribe verification](SCRIBE_TWO_STAGE_VERIFICATION.md) for the actual fictional portal results, provider usage limits, and the confirmed unknown-versus-abnormal reviewer miss. Earlier entries in this document describe earlier code states.

## Full safety audit: 10 November 2026

The expanded offline audit passed 227 backend tests (1690 assertions) and 16 JavaScript check scripts. It reproduced and fixed credential-change retry caching, checkpoint-store failure handling, and late recording/edit/patient races during finalization. No model calls were made during this audit. See [the full audit](SCRIBE_SYSTEM_SAFETY_AUDIT_2026-11-10.md) for evidence and remaining limits. This is controlled fictional-test readiness, not clinical or production certification.
