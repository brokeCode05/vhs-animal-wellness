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

Drafts are capped at `MAX_DRAFTS = 500` so a long demo session cannot grow
without bound.

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
| `getScribeStatus(state)` | `→ {state, label}` | One place decides the indicator: `ready` / `recording` / `transcript_ready` / `draft_generated` / `unsaved_changes`. |
| `recording` | `{supported: false, mode, message}` | The UI reads this before implying anything about audio. |

Also exported: `SOAP_FIELDS`, `FIELD_LIMITS`, `NOT_PROVIDED`, `engine: 'mock'`,
`identityMode: 'mock'`, `version`.

### 7.2 Transcript input shape (current)

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

### 7.3 SOAP output shape (current)

```js
{
  ok: true,
  soap: { subjective, exam, assessment, plan },   // the EXISTING textarea ids
  fields: ['subjective', 'exam', 'assessment', 'plan'],
  filled: [...],        // sections the transcript covered
  missing: [...],       // sections written as NOT_PROVIDED
  unclassified: [...],  // lines the transcript did not place (never guessed into a section)
  dropped: {field: n},  // lines omitted because the field limit was reached
  meta: { engine: 'mock', generator: 'doctor-scribe-mock', version, deterministic: true,
          recording: 'unavailable', generatedAt, transcriptChars, segmentCount, patient }
}
```

`exam` is the Objective textarea. `FIELD_LIMITS` equals the `maxlength` already
declared on each SOAP textarea, so a generated value can never trip
`doctorValidateClinical()`.

**What the mock generator will not do:** it only moves the Doctor's own
sentences between sections using routing vocabulary. It never proposes a
diagnosis, a medication, a dosage, or a treatment decision; a section the
transcript does not cover is emitted as `NOT_PROVIDED` (`"Not provided."`). It
cannot write prescriptions or lab requests — those controls are outside its
reach entirely.

### 7.4 Draft vs. final

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
  soap,                  // snapshot of what was written (regeneration guard)
  patient                // appointmentId/petId linkage, pass-through
}
```

The finalized consultation document (§6.3) is unaffected: it is built by
`buildConsultation()` from the Doctor's saved SOAP fields.

### 7.5 Doctor approval responsibility

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

### 7.6 Future recording / transcription boundary

`DoctorScribe.recording.supported` is `false` in Phase 1 and the **Start
Recording** button states that no microphone audio is captured or transcribed —
it must never imply otherwise. The placement, control and status value
(`recording`) already exist for the real integration.

When it arrives, the expected chain is:

```
Doctor UI
  → DoctorScribe (unchanged)
  → transcription / AI backend            ← CONTRACT NEEDED / TBD
  → SOAP draft response (§7.3 shape)
  → Doctor review / edit / save
```

Unknowns the backend must settle — all **CONTRACT NEEDED / TBD**, none
guessed here: route and method; whether transcription happens in-browser or
server-side; consent and retention for recorded audio; whether a transcript is
stored server-side or stays device-local; maximum duration/size; authentication
and per-doctor authorization; error and timeout behaviour.

### 7.7 Failure and fallback

The adapter contains its failures: `createSoapDraft()` resolves with
`{ok: false, error: {message}}` instead of throwing, and the UI writes that
message under the controls and leaves every SOAP field untouched. The Doctor can
always type the note by hand — AI Scribe is never required. A backend
integration must preserve exactly this fallback.

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
| 9 | AI Scribe transcription + SOAP draft service (§7.6) | **CONTRACT NEEDED / TBD** |

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
