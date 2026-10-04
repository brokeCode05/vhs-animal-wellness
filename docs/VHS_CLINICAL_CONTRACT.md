# VHS Clinical Record Contract

**Status:** frontend mock seam, ready for backend handoff. **No endpoints are
agreed yet** — every one below is marked `CONTRACT NEEDED` or `TBD`.

**Scope:** this document describes the *interface the frontend already depends
on*, so the backend can replace the mock without the Doctor portal changing. It
is deliberately **not** a final schema design.

**Related:** [`VHS_FRONTEND_INTEGRATION_AUDIT.md`](VHS_FRONTEND_INTEGRATION_AUDIT.md)
§16 (Batch A), [`VHS_SMART_SCHEDULING_CONTRACT.md`](VHS_SMART_SCHEDULING_CONTRACT.md).

> **No endpoint URL is invented in this document.** Where a capability is needed
> and no route is approved, it is marked `CONTRACT NEEDED / TBD`.

---

## 1. Why this exists

Before Batch A the Doctor portal owned its clinical data directly: a hardcoded
per-pet medical history array inside `doctor/doctor.js`, and consultation drafts
in an in-memory `Map`. A page reload lost every SOAP note, prescription, lab
request and timer.

`shared/mock-clinical.js` now sits between the Doctor UI and storage:

```
doctor/doctor.js  →  SharedMockClinical  →  localStorage (mock)  /  API (later)
```

`doctor/doctor.js` performs **no** storage access. This is a *replaceable seam*,
not a finished model — swapping the mock for HTTP is the whole point.

---

## 2. Current mock interface

`window.SharedMockClinical`, loaded by `doctor/index.html` only.

| Operation | Signature | Purpose |
|---|---|---|
| `getEmr` | `(petId) → object` | Per-pet baseline clinical record (moved verbatim from `doctor.js`). |
| `saveEmr` | `(petId, patch) → object` | Patch the baseline record. |
| `getClinicalHistory` | `(petId) → Array<{date, title, note}>` | Rendered history list for the EMR panel. |
| `getConsultationDraft` | `(appointmentId) → draft \| undefined` | Read the working draft for an appointment. |
| `ensureConsultationDraft` | `(appointmentId) → draft` | Read-or-create. Used by `draftFor()`. |
| `saveConsultationDraft` | `(appointmentId, patch) → draft` | Write through, stamped with `updatedAt`. |
| `clearConsultationDraft` | `(appointmentId)` | Explicit discard. **Not** called on completion — see §4. |
| `emptyMedicine` | `() → object` | Canonical empty prescription row shape. |

Supporting surface:

- `identityMode` — always `'mock'`. Marks the whole module as the fake
  implementation.
- Storage is encapsulated in private `_read(key)` / `_write(key, value)`. No key
  is exported and no other module touches them.

### 2.1 Mock storage keys

| Key | Contents |
|---|---|
| `vhs_mock_clinical_emr_v1` | Per-pet baseline EMR. |
| `vhs_mock_consultation_drafts_v1` | Consultation drafts, keyed by **appointmentId**. |
| `vhs_mock_appointments_added_v1` | **Appointment status authority** for records created in the demo (the ADDED layer). |
| `vhs_mock_checkin_overrides_v1` | **Appointment status authority** for seeded records (the OVERRIDES layer). |
| `vhs_audit_log_v1` | History/events only. Never a status source. |

Drafts are capped at `MAX_DRAFTS = 500` so a long demo session cannot grow
without bound.

---

## 2.2 Canonical appointment status

**`appointment.status` has exactly one owner: the shared appointment store
(`SharedMockAppointments`).** Every portal — User, Admin, Doctor, Vetti —
reads it through that store and nothing else.

| Rule | Consequence |
|---|---|
| `confirmed → checked_in → in_consultation → completed` | The only legal lifecycle. Transitions are guarded in one table in `shared/mock-appointments.js`. |
| Persisted in localStorage | `vhs_mock_appointments_added_v1` (created records) or `vhs_mock_checkin_overrides_v1` (seeded records). A status survives a hard refresh. |
| Clinical storage is NOT the status authority | Drafts hold SOAP, transcript, prescriptions/labs and clinical timestamps. `draft.completedAt` is a record, never a status. |
| Audit is history only | `vhs_audit_log_v1` proves what happened. It never sets, repairs or overrides a status, and no portal infers status from it. |
| One record per appointment | `appointmentId` and `referenceNo` stay stable through the whole lifecycle; a status change never creates a second record. |

**Cross-tab write rule (the fix for the QA-reported revert).** Each page loads
its own copy of the persisted layers at start-up. Every store write is
therefore **read-modify-write against what is in storage now**, touching only
the appointment being changed — never a wholesale write of the page's own
copy. Writing the stale copy back was last-writer-wins: an ordinary check-in
from a tab that had been open since before another portal finished a
consultation silently dragged that appointment back to `checked_in`, so the
Doctor portal lost a completed consultation on refresh and offered Start
Consultation again on a record the audit log already said was finished.
Writes now accumulate; a `storage` listener re-reads the layers so an open tab
stops answering from a stale copy.

**Double-consultation protection.** A `completed` appointment can only be left
alone: `setStatus()` refuses `completed → in_consultation` and any repeat of
`completed` with `invalid_status`, so a direct Start or a duplicate Complete
fails safely. The Doctor portal additionally treats the store's answer as
final — if the canonical transition is refused it stamps **nothing** (no audit
event, no `completedAt`, no documents, no button state) and says so, instead
of showing a completion the rest of the system does not have.

---

## 3. Key IDs

| ID | Scope | Owner | Notes |
|---|---|---|---|
| `appointmentId` | Appointment | Appointment store | Format `apt001`. **Drafts are keyed by this**, not by pet. |
| `referenceNo` | Appointment | Appointment store | Human-facing. `VHS-YYYYMMDD-NNNN`. Never used as a key. |
| `petId` | Pet | User/pet catalog | Drafts are *per appointment*; EMR is *per pet*. |
| `veterinarianId` | Staff | Doctor roster | The roster `userId` (`vet-001`), **not** the numeric `doctorId`. |
| `serviceId` | Service | Service catalog | Canonical FK. `service` carries the catalog value; the label is derived at render. |

Drafts are keyed by `appointmentId` deliberately: one pet may have several
consultations, each with its own notes, prescriptions and labs.

---

## 4. Draft vs. finalized record

This is the single most important semantic in this document.

| | Draft | Finalized record |
|---|---|---|
| Meaning | Work in progress. Not part of the patient's medical history. | The consultation of record. |
| Lifecycle | Created on first open, mutated on every keystroke. | Created when the consultation is completed. |
| `completedAt` | `null` until completion. | Stamped on completion. |
| Status | **Holds no status at all.** | Status lives on the appointment. |
| Visibility | Doctor only. | Doctor, and released to Clerk/Admin + owner on completion. |

Two rules follow, and both are enforced in the frontend today:

1. **A draft never carries a lifecycle status.** The audit found the old
   `draft.status` field could disagree with the appointment store — and because
   drafts were memory-only, it was lost on reload, which left the **Complete**
   button permanently blocked with "start first" and no Start button to press.
   `statusFor()` in `doctor/doctor.js` now reads **only**
   `SharedMockAppointments`.
2. **Completion finalises rather than deletes.** `clearConsultationDraft()` is
   available for explicit discard but is *not* invoked on completion; the draft
   is retained with `completedAt` and `durationMinutes` stamped, and is what
   `buildConsultation()` reads to produce the document fan-out.

> **Open for backend (TBD):** whether a finalized consultation should be
> immutable (versioned / append-only) or editable with an audit trail.

---

## 5. Consultation start/end timestamps

Timestamps are stamped on the **appointment**, not on the draft, so every portal
observes the same lifecycle.

| Timestamp | Canonical field | Written by | Current mock behaviour |
|---|---|---|---|
| Check-in | `checkedInAt` | `SharedMockAppointments.setStatus()` | On transition to `checked_in`. |
| Start | `consultationStartedAt` | `SharedMockAppointments.setStatus()` | On transition to `in_consultation`. |
| End | `consultationCompletedAt` | `SharedMockAppointments.setStatus()` | On transition to `completed`. |

The draft mirrors `startedAt` / `completedAt` / `durationMinutes` for the
consultation record itself. **The store is canonical; the draft copy is derived.**
Status follows the same rule: the appointment owns it (see §2.2), and a draft
timestamp never stands in for it.

Status transitions are guarded in one table (see
`VHS_SMART_SCHEDULING_CONTRACT.md` §lifecycle and `shared/mock-appointments.js`).

### 5.1 Endpoints — all `CONTRACT NEEDED / TBD`

| Operation | Endpoint | Notes |
|---|---|---|
| Start consultation | **CONTRACT NEEDED / TBD** | Must validate the `checked_in → in_consultation` transition server-side. |
| Complete consultation | **CONTRACT NEEDED / TBD** | Must be transactional with document fan-out (§6.3). |
| Read consultation record | **CONTRACT NEEDED / TBD** | |
| Upsert draft | **CONTRACT NEEDED / TBD** | Only if drafts survive more than one device/session. |

---

## 6. Expected cutover adapter

The Doctor UI should not change at cutover. Only the module behind
`window.SharedMockClinical` does.

### 6.1 Shape of the swap

```js
// today
window.SharedMockClinical = <mock, localStorage>;

// at cutover — same call signatures, different transport
window.ClinicalService = <api-backed, fetch>;   // reads the session, not storage
```

`doctor/doctor.js` keeps calling `getClinicalHistory()`, `saveConsultationDraft()`
and friends. It must not learn about HTTP, tokens or error shapes.

### 6.2 What the backend must own

- Appointment/consultation identity, `appointmentId` + `referenceNo` assignment.
- Every lifecycle transition and its guard.
- `consultationStartedAt` / `consultationCompletedAt` stamping.
- Validation currently done client-side by `doctorValidateClinical()` and
  `doctorFirstPrescriptionIssue()` — **these are UI affordances, not security**,
  and must be re-implemented server-side.
- Authorization: a doctor may only read/write records for appointments assigned
  to them.

### 6.3 Transactional boundary

Completion currently fans out to client-facing documents (consultation summary,
prescription, lab request) in the browser. At cutover that **must move into one
server-side transaction** — a completed consultation with no prescription
document is a data-loss bug, and the current client-side fan-out can half-fail.

### 6.4 Identity at cutover

`identityMode: 'mock'` on this module, `SharedMockUsers` and `SharedMockDoctors`
marks all three as fakes. See
[`VHS_FRONTEND_INTEGRATION_AUDIT.md`](VHS_FRONTEND_INTEGRATION_AUDIT.md) §16.3 —
the boundaries exist so the session swap touches one function per module, not
every call site.

---

## 7. AI Scribe boundary

**Status:** frontend + mock generator only. **No speech-to-text, no microphone
capture, no LLM call, no network request, no endpoint.** What exists today is a
working, reviewable SOAP-draft workflow whose generator is a local,
deterministic function.

```
Doctor UI (doctor/doctor.js)
  → window.DoctorScribe            ← the adapter; the only thing the UI knows
       → mock generator NOW
       → transcription + AI backend LATER   ← same call site, new body
  → SharedMockClinical             ← draft persistence, unchanged
```

`doctor/doctor-scribe.js` owns every rule about what a draft may contain.
`doctor/doctor.js` owns none of them: it reads the transcript, calls the adapter
and writes the returned strings into the **existing** SOAP fields. Swapping the
mock for the real service therefore changes one file, not the consultation
workflow.

### 7.1 Adapter interface (`window.DoctorScribe`)

| Operation | Signature | Purpose |
|---|---|---|
| `normalizeTranscript(input)` | `(string \| {transcript}) → {text, charCount, wordCount, isEmpty}` | Normalises line endings/space. Never rewrites the Doctor's wording. |
| `validateScribeInput(input)` | `→ {ok, code, message, charCount, wordCount}` | The single gate both the UI and the generator use, so the wording the Doctor reads and the rule that runs cannot disagree. `code` ∈ `ok` / `empty` / `too_short` / `too_long`. |
| `generateSoapDraft(input)` | `→ result` (synchronous mock) | The mock generator. Same input ⇒ same output. |
| `createSoapDraft(input)` | `→ Promise<result>` | The seam the UI calls. Resolves on the microtask queue today; awaits the future endpoint instead. **The call site does not change.** |
| `getScribeStatus(state)` | `→ {state, label}` | One place decides the indicator: `ready` / `recording` / `transcript_ready` / `draft_generated` / `saved` / `unsaved_changes`. |
| `buildPreConsultationSummary(context)` | `→ string` | The "AI-assisted summary" strip. Grounded in appointment data only (§7.2). |
| `recording` | `{supported: false, mode, message}` | The UI reads this before implying anything about audio. |

Also exported: `SOAP_FIELDS`, `VITAL_FIELDS`, `APPLY_TARGETS`, `FIELD_LIMITS`,
`NOT_PROVIDED`, `MAX_TRANSCRIPT_CHARS`, `engine: 'mock'`, `identityMode: 'mock'`,
`version`.

### 7.2 Pre-consultation summary — source rules

The strip above the SOAP form is a **pre-consultation** read of what the clinic
already holds. `DoctorScribe.buildPreConsultationSummary(context)` builds it from
exactly these fields:

| Field | Source | Example |
|---|---|---|
| `petName` | appointment pet | `Luna` |
| `species` | appointment pet | `Cat` |
| `serviceLabel` | booked service, resolved through `SharedMockUsers.serviceLabel()` | `Blood Test` |
| `reason` | `visitContext` / `customVisitContext` stored with the booking | `Reduced appetite for 2 days` |
| `notes` | booking notes | — |

**It must never name a symptom, duration, diagnosis, treatment or observation
that is not in those fields.** With nothing on file it says so explicitly:

> Luna is scheduled for Blood Test. No additional symptoms or concerns were
> provided with the appointment.

The pet's `ai_summary` triage fixture is **not** a permitted source. That text
describes the same symptoms for every visit of that pet, so reusing it showed
"vomiting and reduced appetite over 24 hours" to a patient booked for a blood
test with no notes. Triage severity remains a queue-level badge and is not part
of the summary.

### 7.3 Transcript sources

| Source | State | Notes |
|---|---|---|
| Typed into the transcript box | current | Plain text, up to `MAX_TRANSCRIPT_CHARS`. |
| Pasted into the transcript box | current | An empty box takes the paste natively (bounded by `maxlength`). Over existing text it asks first (§7.6), and a confirmed paste **replaces** the transcript exactly as an upload does. Over `MAX_TRANSCRIPT_CHARS` it is refused. |
| `.txt` file upload | current | Read in the browser with `FileReader`. `.txt` only, 64 KB / `MAX_TRANSCRIPT_CHARS` limits, friendly rejection otherwise. Nothing is uploaded. |
| Recorded audio → transcription | **CONTRACT NEEDED / TBD** | `recording.supported` is `false`; the control states that no audio is captured. |

All sources write the same textarea, so the generator has one input shape.

### 7.4 Transcript input shape (current)

```js
DoctorScribe.generateSoapDraft({
  transcript: "Owner reports …\nWeight 4.2 kg, temperature 39.1 degrees …",
  appointmentId: 'apt902',
  petId: '4',
  patient: { appointmentId, petId, name, species },  // pass-through identity only
  nowIso: '2026-10-04T00:00:00.000Z'                  // optional; keeps results reproducible
})
```

Identity fields are echoed into `meta.patient` for traceability. **No clinical
content is derived from them.**

### 7.5 SOAP output shape (current)

```js
{
  ok: true,
  // Structured result — the documented contract.
  soap: {
    subjective: 'Owner reports vomiting since last night.',
    objective: {
      weightKg: null,          // number | null  → Weight (kg)
      temperatureC: 39.4,      // number | null  → Temp. (°C)
      heartRateBpm: null,      // number | null  → Heart rate (bpm)
      findings: 'Mild dehydration observed.'   // → Examination findings
    },
    assessment: 'Not provided.',
    plan: 'CBC requested.'
  },
  // Flat map for the UI, keyed by the EXISTING control names. The UI writes
  // these and nothing else — it never parses medical text.
  apply: { subjective, weight, temperature, heartRate, exam, assessment, plan },

  fields: ['subjective','weight','temperature','heartRate','exam','assessment','plan'],
  filled: [...],        // sections the transcript covered
  missing: [...],       // sections written as NOT_PROVIDED
  absentVitals: [...],  // vitals the transcript never stated (left blank)
  unclassified: [...],  // lines the transcript did not place (never guessed into a section)
  dropped: {field: n},  // lines omitted because the field limit was reached
  meta: { engine: 'mock', generator: 'doctor-scribe-mock', version, deterministic: true,
          recording: 'unavailable', generatedAt, transcriptChars, segmentCount, patient }
}
```

**Vital extraction rules.** A vital is read only when the transcript states it:
`Weight is 6.8 kg`, `Temperature is 39.4°C`, `Heart rate is 125 bpm`. A bare
number is not enough — "2 kg of food", "weight loss" and "three degrees of
lameness" must not become a weight or a temperature. A measurement is lifted out
of the sentence that carries it, so the same fact never appears twice: the vital
goes to its dedicated field and the rest of the sentence ("…and mild
dehydration observed") stays in `findings`. The first mention of a vital wins;
a later repeat is ignored rather than allowed to contradict it. Values are
passed through as parsed — clinical range judgement stays with the portal's
existing vitals validators, not with the generator.

`FIELD_LIMITS` equals the `maxlength` already declared on each SOAP textarea, so
a generated value can never trip `doctorValidateClinical()`.

**What the mock generator will not do:** it only moves the Doctor's own
sentences between sections using routing vocabulary. It never proposes a
diagnosis, a medication, a dosage, or a treatment decision; a section the
transcript does not cover is emitted as `NOT_PROVIDED` (`"Not provided."`). It
cannot write prescriptions or lab requests — those controls are outside its
reach entirely.

### 7.6 Confirmations required

Every irreversible step in the consultation asks first, through one shared
dialog that resolves to a boolean:

| Action | Condition | Message |
|---|---|---|
| Regenerate SOAP draft | any control the generator writes already has content (generated **or** hand-typed) | "This will replace the current SOAP fields. Any unsaved manual edits will be lost." |
| Replace transcript | paste or upload over a non-empty transcript | "Your existing transcript text (…) will be replaced." Never shown for an empty box. |
| Complete consultation | **after** every existing validation guard passes | "Once completed, this consultation will become read-only. Make sure the SOAP notes, prescriptions, and lab requests have been reviewed." |

Cancelling any of them changes nothing. Completion re-runs its guards after the
dialog closes, because the Doctor may have edited the form while it was open.

### 7.7 Draft vs. final

AI output is **always a draft**. Generating fills the four SOAP textareas and
nothing else: it does not set `saved`, does not tick the review
acknowledgement, does not complete the consultation, and creates no document. A
clinical edit — including one made to generated text — routes through the
existing `markChanged()`, which clears the saved flag **and** the acknowledgement.

Persisted on the consultation draft (`vhs_mock_consultation_drafts_v1`, via
`SharedMockClinical.saveConsultationDraft` — no new key, no `localStorage` in
`doctor.js` or `doctor-scribe.js`):

```js
draft.scribe = {
  transcript,            // the notes the draft came from
  transcriptAtGenerate,  // staleness check for the indicator
  generatedAt,           // when the last draft was produced
  engine,                // 'mock' today
  soap,                  // snapshot of what was written, keyed by control name
  patient                // appointmentId/petId linkage, pass-through
}
```

The finalized consultation document (§6.3) is unaffected: it is built by
`buildConsultation()` from the Doctor's saved SOAP fields.

### 7.8 Doctor approval responsibility

The veterinarian remains the sole author of the record. AI Scribe may not start
a consultation, end one, complete an appointment, approve a SOAP note, or sign a
document. Regeneration is destructive to hand edits, so it is never silent: if
any generated SOAP field has been edited (or the transcript has changed since
generation), the first press of **Generate SOAP Draft** only arms an explicit
**Confirm Regenerate** step. Lifecycle gating reads the canonical
`statusFor()`:

| Appointment status | AI Scribe |
|---|---|
| `confirmed` | locked |
| `checked_in` | locked |
| `in_consultation` | enabled |
| `completed` | read-only |

### 7.9 Future recording / transcription boundary

**Phase 1 (superseded):** `recording.supported` was `false` and **Start
Recording** stated that no microphone audio was captured.

**Phase 2 (current):** capture is real — see §7.11 for states, the recording
object and the audio-handling rules. Transcription is still absent, and the UI
still never implies otherwise: `recording.transcription` is `'not-connected'`
and `processRecording()` returns an empty transcription with an explicit
warning.

When it arrives, the expected chain is:

```
Doctor UI
  → DoctorScribe.processRecording() (unchanged call site, §7.11 C)
  → transcription / AI backend            ← CONTRACT NEEDED / TBD
  → SOAP draft response (§7.5 shape)
  → Doctor review / edit / save
```

Unknowns the backend must settle — all **CONTRACT NEEDED / TBD**, none
guessed here: route and method; whether transcription happens in-browser or
server-side; consent and retention for recorded audio; whether a transcript is
stored server-side or stays device-local; maximum duration/size; authentication
and per-doctor authorization; error and timeout behaviour.

### 7.10 Failure and fallback

The adapter contains its failures: `createSoapDraft()` resolves with
`{ok: false, error: {message}}` instead of throwing, and the UI writes that
message under the controls and leaves every SOAP field untouched. The Doctor can
always type the note by hand — AI Scribe is never required. A backend
integration must preserve exactly this fallback.

### 7.11 Browser recording (Phase 2) and the future transcription seam

Phase 2 replaces the Phase 1 "seat" with **real browser audio capture**. It
still transcribes nothing and calls nothing.

#### A0. Two source paths, not consecutive steps

The Scribe panel offers **two alternative ways in**. They are never a chain, and
the UI is laid out so the Doctor can tell them apart at a glance:

```
RECORDING PATH   Record → Stop → Recording ready → Process Recording
                 (audio → future STT → SOAP, ONE action, no second click)

TRANSCRIPT PATH  Paste Transcript / Upload .txt → transcript → Generate SOAP Draft
                 (text → SOAP)
```

* **Process Recording** is the end-to-end action for *recorded audio*: once the
  backend exists it transcribes AND fills the SOAP fields in one step. The
  Doctor does **not** then press Generate SOAP Draft.
* **Generate SOAP Draft** is the equivalent action for a *text* source. It is
  about the transcript, not the audio.

Until the backend half exists, Process Recording says so and keeps the clip —
it never fabricates a transcript, never fills the SOAP fields, and never forces
an extra generation step. Paste, upload and manual SOAP entry keep working, so
recording remains optional.

User-facing wording is deliberately plain ("Recording ready · 00:13"). Codec and
byte counts stay on the recording object for the adapter, the console and the
future upload contract — they are not the Doctor's status text.

#### A. Recording states

`DoctorScribe.RECORDING_STATES` + `getRecordingStatus(state)` own the wording;
the Doctor UI owns nothing but the buttons.

| State | Entered when | UI |
|---|---|---|
| `ready` | idle | Start Recording enabled |
| `requesting_permission` | `getUserMedia()` pending | Start disabled; live line "Waiting for microphone permission…" |
| `recording` | `MediaRecorder.start()` resolved | Stop Recording prominent; timer + indicator visible; Paste / Upload / Generate disabled |
| `recorded` | a non-empty clip is in memory | Process Recording / Discard Recording / Record Again |
| `processing` | `processRecording()` called | controls disabled; "Processing recording…" |
| `error` | permission, device or encoder failure | friendly message; retry stays available |

#### B. Recording object shape

Built by `DoctorScribe.buildRecording(blob, meta)` — the shape a future upload
expects:

```js
{ blob, mimeType, sizeBytes, durationSeconds, recordedAt }
```

`mimeType` and `sizeBytes` come from the Blob itself; `durationSeconds` and
`recordedAt` come from the recorder. An empty Blob is refused
(`empty_recording`). `validateRecording()` is the single gate.

MIME type is **capability detected**, never hardcoded:
`pickRecordingMimeType(isSupported, candidates)` walks
`audio/webm;codecs=opus → audio/webm → audio/ogg;codecs=opus → audio/mp4`
through `MediaRecorder.isTypeSupported()` and returns `''` when none is
supported, which tells `MediaRecorder` to use its own default.

#### C. `processRecording()` — the seam

```js
DoctorScribe.processRecording(recording, {
  appointmentId, petId, patientContext, appointmentContext
})
```

The call site does not change between Phase 2 and production. Only the body
does: today it is a local mock; later it is a POST to the consultation AI
endpoint whose answer goes through `normalizeBackendResponse()`.

**Today's mock result is explicit, never faked:**

```js
{ ok: true, source: 'mock',
  transcription: { text: '', language: null, durationSeconds },
  soap: null,                                   // no draft is invented
  warnings: ['speech_to_text_not_connected'],
  providerMeta: null }
```

An empty `transcription.text` is the contract: no words are ever produced from
audio. The UI says so on screen and keeps Paste / Upload as the way forward.

#### D. Future Laravel responsibility

```
Doctor UI → DoctorScribe adapter → Laravel endpoint → external provider
```

Laravel owns credentials, provider calls, upload validation, size/duration
limits, rate limiting, audit and error normalization. The browser owns none of
it.

#### E. Security boundary (enforced, not aspirational)

The frontend must never contain a provider API key, call a provider directly,
or name a provider in UI text. `providerMeta` is passthrough so the backend
stays the only component that knows who transcribed. `processRecording()`'s
mock result contains no provider name, no URL and no key.

#### F. Temporary audio rule (Phase 2)

Audio is **memory-only**: never written to `localStorage`, never into
`SharedMockClinical`, never uploaded, never surviving a reload. It is released
on Discard, on Record Again, on patient switch, on completion, and on
`pagehide`. Track.stop() releases the microphone; recorder handlers are
detached before stop so a discarded session cannot rebuild a clip.

#### G. Patient-switch behaviour

A recording belongs to one patient. Switching patients is confirmed first:
*"Stop the recording and switch patients?"* while recording, *"Discard the
recording and switch patients?"* when a clip is waiting. Cancelling switches
nothing and the recording continues. The clip also stores its patient id and
`processRecording()` drops it on a mismatch, so patient A's audio can never be
applied under patient B.

#### H. Failure and fallback

`NotAllowedError` / `SecurityError` → "Microphone permission was denied.";
`NotFoundError` → "No microphone was found."; `NotReadableError` /
`TrackStartError` / `AbortError` → "The microphone could not be accessed.";
`NotSupportedError` and a missing `MediaRecorder` → "Audio recording is not
supported in this browser." Raw errors go to the console only. Every failure
ends in "Paste or upload the transcript instead.", because paste, upload,
manual SOAP entry and Generate SOAP Draft keep working unchanged.

#### I. Future request / response shape — CONTRACT NEEDED / TBD

Route, auth, multipart field names, size/duration limits, retry policy and
error codes are **CONTRACT NEEDED / TBD**. No URL is invented here. The
response is expected conceptually as:

```js
{ success: true,
  transcription: { text, language, durationSeconds },
  soap: { subjective, objective: { weightKg, temperatureC, heartRateBpm, findings }, assessment, plan },
  warnings: [],
  providerMeta: { … } }
```

`normalizeBackendResponse()` accepts exactly this shape, fails closed when
`success !== true`, and never invents content for missing sections.

#### J. Phase 2 scope

No external AI service is called, no provider key exists in the frontend, and
no real speech-to-text runs. Recording produces an in-memory audio clip and an
explicit "not connected" result. Recording is allowed **only** while the
appointment is `in_consultation`: it is disabled before the consultation and
read-only after completion, and it never starts, completes or otherwise changes
an appointment.

---

## 8. Unresolved backend decisions

Everything here is **open**. None is settled by the frontend.

| # | Question | Status |
|---|---|---|
| 1 | Consultation endpoints and routes | **CONTRACT NEEDED / TBD** |
| 2 | Does a finalized record stay editable, or is it append-only? | **TBD** |
| 3 | Should drafts be server-side at all, or device-local until completion? | **TBD** — affects multi-device behaviour |
| 4 | EMR (`vhs_mock_clinical_emr_v1`) vs. consultation history — one table or two? | **TBD** |
| 5 | Lab requests: ordering, results, and who may release them? | **CONTRACT NEEDED / TBD** |
| 6 | Prescription pricing snapshot — captured at booking or at issue? | **TBD** |
| 7 | Retention: who may delete a consultation record? | **TBD** |
| 8 | Do drafts carry an `updatedAt` conflict check (optimistic locking)? | **TBD** — mock overwrites unconditionally |
| 9 | AI Scribe transcription + SOAP draft service (§7.9) | **CONTRACT NEEDED / TBD** |
| 10 | Recording upload: route, auth, size/duration limits, retention, multipart shape (§7.11) | **CONTRACT NEEDED / TBD** |

---

## 9. Explicit non-goals for this document

- It does **not** fix the final clinical schema. §7 is a list of decisions the
  backend has to make, not a design.
- It does **not** invent REST routes. Unapproved endpoints are marked
  `CONTRACT NEEDED / TBD` rather than guessed.
- It does **not** design the AI Scribe backend. §7 documents the boundary the
  frontend needs; diagnosis logic, prescription generation and any clinical
  decision remain the veterinarian's alone.
- It does **not** change any behaviour currently implemented in the mock.
