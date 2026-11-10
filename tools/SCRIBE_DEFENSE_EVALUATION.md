# Doctor Scribe: fictional evaluation for defense

## Scope

The experimental summary produces a review-only SOAP proposal from already selected source sections. It is disabled by default, and a veterinarian must review the full transcript, source passages, and proposed note. It is not an autonomous clinical decision system and must not invent medical advice.

## Results from this evaluation

- Ten fictional source-section examples covered English, Filipino, and Taglish, including negation, corrections, historical versus current symptoms, measurements, uncertainty, laterality, attribution, and follow-up.
- All ten examples returned an audited draft. Two drafts were shorter than their supplied source sections by character count; eight were unchanged. The examples were relatively short and were not complete spoken consultations.
- An additional checker test presented 14 deliberately changed statements and three valid paraphrases. In that one run, the checker rejected all 14 altered examples and accepted all three valid examples. This is not a measured error rate.
- A separate three-case connected service test produced a shorter English draft; the Filipino and Taglish drafts retained source wording. This exercised application services, not an authenticated browser session.
- Automated regression checks in the preceding implementation run: 76 tests and 313 assertions passed. The review-control checks also passed.

The generated examples and their source sections are in `scribe-defense-fictional-results.jsonl`. They are synthetic. The evaluation script is `test_scribe_defense_fictional_live.php`; the adversarial checker script is `test_scribe_grounded_adversarial_live.php`. Model output can change between runs.

## Interpretation and limits

The model showed it can paraphrase and preserve the targeted details in some examples. It did not consistently shorten notes, especially in these short Filipino and Taglish cases. An AI audit can incorrectly approve a misleading claim or overlook a clinically important omission. These examples were reviewed during development, not independently adjudicated by veterinarians. The dataset is small, purpose-built, and cannot establish clinical accuracy, generalization, a sensitivity figure, or a production-readiness claim.

The prototype audits selected SOAP source sections; an earlier classification step can omit or misclassify transcript content. Full-transcript review remains necessary. A browser test of the existing portal confirmed the omission-review gate; it did not test the experimental summarizer in the portal.

## Appropriate defense statement

“We developed an experimental, review-only SOAP summarizer and tested it with fictional multilingual veterinary examples. In a small adversarial test it rejected the specified altered statements, but the evaluation is not large enough to establish clinical reliability. The doctor reviews source material and manually enters vital signs, and the experimental feature is disabled by default pending further validation.”

## Remaining validation

Use a larger, diverse, independently veterinarian-annotated set; score unsupported claims, omissions, negation, uncertainty, attribution, units, corrections, follow-up, language behavior, response times, and fallback behavior. Then test the full authenticated portal flow with fictional records and verify the review gates, privacy controls, transcript retention and manual vital entry. Assess risks and obtain the clinic's approval before any clinical pilot.

## Follow-up: compression experiment

A revised prompt shortened 9 of the same 10 preselected-source examples in one run, compared with 2 in the earlier run. In a separate connected Taglish test, however, the generated draft changed eating more slowly to decreased appetite and changed coughing mostly at night to worse at night; the model audit accepted the draft. These wordings can convey different clinical meanings. The more aggressive prompt was reverted. In a later isolated checker run, the checker rejected each of those changes, illustrating that one favorable run is not evidence of consistent detection. The experimental feature remains disabled by default.
