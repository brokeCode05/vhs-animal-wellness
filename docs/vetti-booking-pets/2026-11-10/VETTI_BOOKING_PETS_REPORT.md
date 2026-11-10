# Vetti booking, pet entry and voice repair — 10 November 2026

## Verified result

The final isolated backend suite passed **639 tests / 4,566 assertions**. All **64 offline interface scripts** and **47 public JavaScript syntax checks** passed. A bounded six-turn live-provider run completed with only fictional records in SQLite memory. It created no appointments or pets: appointments remained **1 → 1**, pets **2 → 2**.

The current browser could not be operated: the computer-use service reported that local browser use is disabled. The live test exercised the connected backend services, not the open browser. Form validation, prefill, transport and submission serialization were checked with offline interface fixtures. A refreshed real-browser acceptance check remains separate from those results.

## Causes and changes

### Booking dates

The active semantic interpreter still required a nearly literal model date quotation, while its private calendar parser accepted only relative words, ISO dates and full English month names. Numeric dates such as `11/11/2026` could pass quotation matching and then fail calendar parsing. A normalized ISO equivalent of “tomorrow” could fail the quotation check instead. The generic “Which date…” repair did not distinguish those failures from a genuine conflicting date.

Replaced both older private date methods with one `BookingDateResolver`, shared by proposal updates and appointment-management hints. It validates equivalent supported references against the current message and the configured clinic clock; models cannot choose a different day. It supports relative English/Filipino dates, ISO dates, named months (including abbreviations and day-first wording), and full numeric dates. All references must agree. Ambiguous day/month numbers require the month name unless another explicit reference disambiguates them. Invalid dates, past/out-of-window dates and model-invented dates are rejected. Conflicts now get a specific question and preserve the existing proposal. The 30-day booking window remains.

Example with the test clock at November 10: `tomorrow (11/11/2026)` is November 11. `tomorrow (11/12/2026)` conflicts and asks which day the owner means. This is calendar validation, not a conversation-specific name/date exception.

### Existing booking and older code

The original portal booking form, availability validation, explicit review and OTP confirmation remain. Vetti prepares a proposal; it does not create appointments. `public/user/index.html` enables the semantic frontend route, which also requires backend privacy/feature gates.

The older offline booking helper had still been invoked while building active AI requests, although the original message was ultimately retained for the semantic endpoint. It is now excluded from the active semantic path. Its offline callers remain because removing those shared helpers would break existing offline behavior and tests. No speculative file deletion was needed. The restrictive older date methods were removed after the shared replacement was connected.

### Decimal weights and month ages

Both pet forms allowed a leading decimal during typing, but their submit validators required a digit before the decimal point. They now accept `.05`, `.3`, `.5`, `.75`, `0.85`, `1.2`, `2.65` and other valid values within the existing **0–200 kg, two-decimal-place** storage contract. Blank optional weights remain blank. The backend now explicitly rejects excess precision rather than silently rounding it in the two-decimal database column. No database migration was needed.

Month ages already existed in the form, backend, database and presenter. Verified that month ages and decimal weights survive create/read/update, including custom small mammals. Changing the age unit now revalidates its current value. Ages remain whole months or years; no birthdate is invented. The existing limits are 600 months / 50 years.

### Prompt-to-pet-form assistance

Added `PetRegistrationDraft`: a private, provider-free, read-only form parser for explicit registration requests. It accepts labeled English/Filipino fields and common name/species/sex/age/weight phrasing. The endpoint returns only editable form values; it never creates a pet. Unsupported, conflicting or unreadable values remain blank. Contact/medical/secret filters and authenticated pet writes remain in place.

Connected the draft through `vetti-ai.js` → `vetti-ui.js` → `VettiOnboarding.applyPetDraft`. The form is filled using input values, not untrusted HTML. A new registration clears previous unsaved pet fields so missing values do not inherit another pet’s weight or age. The owner must inspect and press **Add pet**; normal backend validation and session ownership apply on save. No pet name, age or measurement from this route is sent to a provider, and it uses **zero model calls**.

Known breeds can suggest a species using the portal’s existing breed catalog. For example, Persian suggests Cat and the form explicitly asks the owner to check that suggestion. Unlisted or ambiguous breeds do not establish a species. This is not a claim to understand every possible free-text description; the visible form remains the correction path.

### Public/User tone

The common voice now asks for a friendly companion tone: simple wording, contractions and gentle puppy warmth without baby talk, barking, repeated introductions or formal stock phrasing. The booking-specific instructions previously forced unknown-duration and form/OTP explanations into every reply, competing with that voice. They now answer the current choice briefly and leave the fixed status/confirmation instructions in the review interface. The review form retains duration information; an explicit duration question still receives an honest unknown/estimate response. No extra polishing model call was added. Public composition uses the same shared voice and simpler wording.

## Connected fictional sample

| Step | Observed result |
|---|---|
| New consultation request with tomorrow + matching slash date + 3 PM | Proposal for November 11 at 15:00. |
| “What about 4pm?” | Same pet/service/date, time changed to 16:00. |
| Change to tomorrow + conflicting slash date | Specific conflicting-date question; previous proposal preserved. |
| Add a hamster with labeled details, 3 months, .25 kg | Correct form draft; zero provider calls; no pet creation. |
| Public Cat Grooming question | Verified service reply with warmer wording. |
| Public Tagalog follow-up | Cat Grooming subject retained in Filipino. |

The run had nine logical provider stages. Diagnostics showed 11 provider attempts: Gemini timed out once and returned HTTP 503 once; Groq recovery completed both affected interpretations. Nine attempts reported **8,840 total tokens**; the two failed attempts reported no usage, so this is not a complete billing total. The timeout diagnostic did not report an HTTP-request count, so 11 attempts must not be described as 11 verified HTTP requests. These numbers describe only this bounded six-turn run.

## Verification evidence and limits

- [Full backend output](backend-tests.txt): 639 passed, 4,566 assertions.
- [Offline interface results](javascript-results.json): 64/64.
- [JavaScript syntax results](javascript-syntax.json): 47/47.
- [Connected fictional results](fictional-live-results.json): six turns, memory-only records.
- New/expanded coverage includes varied decimal weights, month/year serialization, custom small mammals, invalid precision, conflicting dates, normalized date equivalence, calendar rollover, pending-proposal preservation, labeled/inline/natural/Taglish pet details, misleading name words, negative measurements, stale-field clearing, and no-save/no-provider prefill.
- Browser/mobile visual acceptance was not performed in this pass because browser control was disabled. Reload the User portal to load the updated asset versions before teammate testing. No actual appointment, pet or OTP delivery was created by the connected sample.
- Friendly tone is subjective; the sample is evidence of the observed wording, not a guarantee that every generated reply will use the same style.

All project changes were made under `D:/Cap/V3/vhs-animal-wellness-repo-v3`. No environment secrets were printed or edited. Nothing was pushed or deployed. Source checkpoints are under `storage/app/private/vetti-booking-pet-before-20261110`; that folder is local and private.
