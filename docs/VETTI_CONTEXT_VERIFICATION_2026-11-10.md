# Public and User Vetti context verification — 2026-11-10

All project changes were made in D:/Cap/V3/vhs-animal-wellness-repo-v3. Nothing was pushed or deployed. No appointment, OTP/SMS, medical record or consultation was created or changed. The existing Doctor Scribe tab was not used or changed.

## Findings and changes

1. **Public translation task ambiguity.** The reported location reply was reproduced from the visible public chat. Routing diagnostics showed operation=translate with a prior location topic. The composition prompt nevertheless said the previous response was unavailable verbatim. The response combined a claim that there was no preceding information with the current address. Restatements now give the composer a resolved public topic and current verified facts. They are fresh explanations, not pretend quotations. If the saved subject is missing, expired or invalid, Laravel returns a short subject clarification instead of generating an unrelated address. The public prompt was simplified to stay below the existing instruction budget, including its safe-regeneration suffix.

2. **User context surviving a domain change.** Earlier public-information exchanges could remain available after a pet/private/booking interaction. Successful non-public responses now retire that old public text. Only a permitted recent-topic label is retained as a routing hint, never private record content. Pending booking preferences remain separately owner/chat scoped. Rejected replies do not become future public context.

3. **User restatements re-inferring the subject.** User public exchanges now retain a validated public subject separately from generated prose. A subsequent restatement revalidates that topic/service/subset against current facts and reuses it even if the new model interpretation proposes a conflicting public tool. Chained language changes retain the resolved source question rather than replacing it with an ambiguous “that.” The existing short-lived public-only exchange limit remains two turns; full chat history and private records are not sent.

4. **Verified fallback versus semantic context.** A successful provider-free User fallback now retires old semantic prose and marks the latest completed domain. For a public fallback, the semantic path can use its current validated topic/service selection. A private fallback cannot become a public translation source and does not transmit its private response text. Missing protected context produces clarification rather than reviving an old clinic reply.

5. **Five-choice ceiling.** The previous fixed limit of five service choices could discard larger active catalog subsets. Choices are now bounded by the active catalog and must be unique exact members. Category translations preserve larger subsets. A whole-catalog Public topic does not need a duplicated full-catalog selection in saved context. Removed or malformed services, categories and subsets are invalidated, including at the HTTP controller boundary, rather than silently broadening to the entire catalog.

6. **Language-control matching.** A short explicit language request sets the requested language. Its compatibility matcher is fully anchored, so a prefix such as “explain in Tagalog” cannot swallow an additional, newly named subject. The semantic restate_previous field distinguishes translation of the latest answer from a new question in another language. Known English/Filipino language controls take precedence over a conflicting model language label. They remain a narrow UI control, not a replacement for natural-language interpretation.

7. **Existing public topics.** Registration help and combined hours/location now have verified sources for restatement, consistent with the existing topic allowlist. These are read-only help operations and do not authorize login, booking, private queries or writes.

## Automated verification

Final complete run: php artisan test --compact --no-ansi

**566 tests passed, 3858 assertions; 22.85 seconds.** This includes existing authorization, Scribe, booking, provider-backup and Vetti tests. These are automated tests with controlled providers/in-memory test data, not 566 external API calls.

**10 selected JavaScript checks passed:** public message rendering; proposal availability; booking species/date memory; document navigation; current public-information browser routing; semantic static contract; semantic browser contract; retained compatibility/offline dialogue; five-turn routing; recovery/security. No frontend request format or actual booking action was changed in this context repair.

New tests cover resolved location tasks, missing subjects, chained languages, conflicting proposed tools, newly named subjects, private-domain transitions, rejected replies, expired context, new conversation IDs, another owner's context, public/private verified fallback continuity, registration and combined-hours topics, large service subsets, malformed/removed catalog selections and HTTP-level invalidation.

## Live verification

Before the resumed final check, the originally reported public location translation returned a direct Tagalog address explanation instead of the contradictory missing-context response.

The final resumed public-browser check used a newly created test tab at http://127.0.0.1:8012/web-page/index.html and four public-information submissions:

1. “Where is the clinic?” returned the configured address.
2. “Can you explain that in Tagalog?” retained the location and returned a Tagalog address explanation. One sentence additionally described access as easy; that convenience claim was not verified. This observation does not establish universal factual accuracy of model prose.
3. “How can I book an appointment?” changed the subject to the existing booking process.
4. “Explain that in Tagalog please” restated booking instructions in Filipino/Taglish, keeping registered-pet, service, available date/time, review and OTP steps. It did not return to the address or claim missing prior information.

A screenshot of the final booking/translation pair is saved in docs/verification/vetti-context-verified-20261110.jpg. The public test tab was kept available for review; the doctor tab was left unchanged.

A separate bounded live **User service-level** run used an in-memory fictional user, an array-backed session and empty private facts. It asked “Where is the clinic?” then “Can you explain that in Tagalog?” Both returned mode=semantic/source=ai and the unchanged public address. Both stored subject=location. Both stages in both turns reported successful Groq backup after the primary path. No real owner/pet data or persisted owner account was involved. Because the reply was only the proper address text, this verifies subject retention and address fidelity, not the quality of a longer Filipino explanation.

## Remaining limits

A signed-in User Portal browser journey was not performed in this context pass; its provider path was live-tested at the service boundary and the browser contract used real scripts with controlled responses. Private-record content is deliberately not retained as public translation material; after such a turn, the user may need to identify the topic or use the authorized portal view. Provider capacity, provider privacy/account settings and unlimited or universal language reliability were not established. The existing model checks can still miss unsupported prose; this work improves context behavior rather than guaranteeing every generated statement.
