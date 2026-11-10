# Vetti natural conversation and protected pet follow-ups — 10 November 2026

## What was changed

The previous scope repair was too narrow. It treated ordinary thanks/acknowledgments as unsupported, used fixed refusal wording on the active path, and the local pet extractor could return before AI interpretation. Those choices did not match the requested conversational workflow.

The active flow now separates meaning, facts and wording:

1. Gemini or authorized Groq recovery interprets the sanitized message and bounded current context.
2. Laravel validates permissions, source references, dates, services and form/proposal state.
3. The configured provider writes the reply from the permitted purpose or verified results.
4. Laravel and the existing interface control the review, form submission, OTP and final writes.

Normal social turns have an explicit semantic category, covering greetings, gratitude, acknowledgments, farewells, apologies, feedback and light assistant conversation. This is not an exact “alright thanks” exception. Mixed messages containing an actual clinic request retain that request’s workflow. Courtesy replies do not overwrite the latest verified public topic, booking proposal or private form context.

Unrelated requests and privacy/language boundaries also receive AI wording from the approved reason. A short literal, sanitized topic may be included for an unrelated request; the rejected instructions/private question are not replayed to the wording stage. An unverified clinic item gets a natural explanation from a verified non-match result. Shared friendly voice guidance applies to the same provider gateway and deadline as interpretation.

Security decisions remain server-enforced. Fixed recovery text still exists for provider failure/invalid output and some validation/emergency paths. Authoritative list headers/status and form labels remain data-controlled interface copy. These are distinct from replacing ordinary conversation with canned answers; this change does not claim that every string in Vetti is generated or that every possible utterance is classified correctly.

## Pet registration: AI interpretation with protected values

Removed the unused `PetRegistrationDraft.php` path after its callers and tests were replaced. Its old source is retained in the private checkpoint. The new privacy envelope identifies source values for masking; it does not select a conversational intent or choose a fixed reply.

Names, age values and weights become opaque `PRIVATE_VALUE_N` references before interpretation. The provider sees field/unit hints, anonymous registered-pet context and the names of fields already provided, without receiving the protected values. AI selects the intended references and canonical form fields; Laravel resolves the originals locally and validates them. Unknown units, invalid precision, out-of-range values and ungrounded references are not silently accepted.

The temporary field state is encrypted, scoped to authenticated owner plus chat, expires after ten minutes and is bounded to six entries. It contains allowlisted form fields rather than raw messages or generated text. It does not create a pet. Closing the form is respected on the next request, and explicit new registrations use replacement semantics.

Follow-up updates use patches to the existing editable form. A weight correction does not clear the name/age/other fields or overwrite unrelated manual entries. New registrations clear old form values. Custom small-mammal species, month/year ages and weights such as `.05`, `.3`, `.75`, `1.2` and `2.65` remain covered. Storage retains the existing two-decimal, 0–200 kg contract. The owner must still review and press **Add pet**; normal authenticated backend validation controls that save.

Privacy masking supports tested English, Filipino and Taglish field/quantity wording. It is not a guarantee that arbitrary free text can always be anonymized. If values cannot be isolated safely, Vetti asks the owner to check the editable form without transmitting the unprotected details. There is no claim of universal free-text field extraction.

## Actual browser verification

Browser access was available in this pass. A separate test tab was used through the existing local tunnel; the original user-created tab was not overwritten. Five User messages and four Public messages were observed.

| Observed browser step | Result |
|---|---|
| User: “alright thanks” | Friendly acknowledgment, not a scope rejection. |
| User asks to add another pet | Natural name question and editable in-chat form. |
| Fictional natural sentence gives name, dog, 4 kg, 2 months | Those fields populated. Vetti asked for missing breed information. |
| Follow-up supplies Unknown breed, Male and corrected `.75 kg` | Corrected fields populated; name/species/age retained. |
| “salamat gets ko na” | Friendly mixed-language acknowledgment; form values retained. |
| Public Cat Grooming price question | Price-range reply. |
| Public: “alright thanks” | “You’re very welcome!” |
| Public Tagalog restatement after thanks | Cat Grooming and the same range remained the subject. |
| Public recipe request | Natural clinic-role explanation, without cooking instructions. |

No **Add pet** or booking confirmation was clicked. The fictional pet form was closed using **Not now**. Screenshots and exact observed replies are linked below. The public price answer included a generic explanation of price variation; this pass checked the topic/range retention, not the factual basis for that added explanation. Generated wording is still subject to evaluation rather than a blanket accuracy guarantee.

## Booking preservation and a real defect caught in testing

An extra connected fictional booking check initially failed: the interface asked for a date despite a complete request. That first result is retained. Inspecting the merger exposed a general defect: a new proposal could discard supplied fields when the model returned an empty `changed_fields` list. A new proposal has no inherited values to protect; the change list is relevant to updating an existing proposal.

The merger now accepts supplied, validated new-proposal fields independently of missing change metadata. Existing-proposal updates still respect the declared changes and source grounding. The connected retry returned `date_expression: tomorrow`, `exact_time_expression: 3pm`, `changed_fields: []` and successfully produced the proposal. “Actually 4pm please” changed only the time. The original failed response’s structured fields were not captured, so its exact metadata cannot be conclusively reconstructed; the defect itself is reproduced by the new regression and the successful connected retry.

The connected fixture uses SQLite `:memory:` and fictional owner/pets/services. Appointments remained **1 → 1** and pets **2 → 2**. Six provider HTTP requests were observed across the two successful turns; the owner email and pet name were absent from captured provider payload checks. The run reported 4,082 tokens, with two provider attempts lacking usage. This is not a complete billing total. The browser batch’s HTTP/token totals were not collected, and no total is claimed for the entire debugging session.

Unused registration-field schema is omitted from ordinary requests, reducing duplicated structure on bookings and normal clinic questions. No extra clinical audit/review model stage was added.

## Final verification

- **655 backend tests passed / 4,858 assertions.** Isolated fixtures and mocked providers cover authorization, privacy, Scribe, booking/OTP and the new conversation paths.
- **66 offline interface scripts passed.** Includes prior booking/pet repairs, authoritative appointment lists and legacy-path isolation; the pet-form check now covers incremental updates and custom species.
- **47 public JavaScript files passed syntax checks.**
- Actual browser: nine observed messages across User/Public, including the fictional form flow and courtesy/context behavior.
- Connected service: two successful final fictional booking turns after a retained failed first attempt.

No Scribe, other-dashboard, authentication, API-key or environment implementation changes were made for this repair. The original booking form, OTP confirmation, owner permissions, record boundaries, appointment-list scope and earlier decimal/month-age fixes remain in the full regression suite. Nothing was pushed or deployed.

## Evidence

- [Backend output](backend-tests.txt)
- [Offline interface results](javascript-results.json)
- [JavaScript syntax results](javascript-syntax.json)
- [Observed browser conversation](browser-verification.json)
- [Filled month-age/decimal-weight form](browser-pet-prefill.jpg)
- [User courtesy reply](browser-user-replies.jpg)
- [Public context/refusal replies](browser-public-replies.jpg)
- [Failed first fictional booking check](fictional-booking-first-attempt.json)
- [Successful final fictional booking check](fictional-booking-results.json)
- [Final booking usage summary](fictional-booking-summary.json)

Project source changes were confined to `D:/Cap/V3/vhs-animal-wellness-repo-v3`. Local checkpoint: `storage/app/private/vetti-conversational-before-20261110`. Screenshots were captured temporarily by the browser tool and copied into this report folder.
