> **Laravel-root update (2026-10-21; commit `60ce957`):** The historical `df969e4`
> checkpoint below remains useful for frontend design history, but the active
> integration baseline is now `integration/frontend-backend` at `60ce957`.
> Laravel is at the repository root (`app/`, `routes/`, `artisan`); portals and
> shared assets are under `public/`. Create future AI feature branches from
> the latest integration branch, not the old checkpoint. Preserve the existing
> `docs/ai-branch-preserved/` alternatives as reference artifacts only.
> No live AI provider is added by this corrective patch. REQ009/REQ035 remain deferred.

# VHS Animal Wellness Center — AI Integration Handoff

Audience: backend developer wiring a real AI provider into the existing Laravel app.
Baseline branch: `integration/frontend-backend` (frontend frozen at the checkpoint commit).
Scope of THIS document: the AI seams only (User Vetti, public Vetti, Doctor Scribe).

> **Companion document:** `docs/BACKEND_HANDOFF_AUDIT.md` is the authoritative map of the
> current system (routes, controllers, models, auth, scheduling, clinical flow). This file
> does **not** duplicate that audit. Where AI work touches an existing contract, this file
> defers to the audit and links the relevant section. Read the audit §8 (current AI status)
> and §9 (recommended AI architecture) alongside this document — they were verified against
> the live repository and this handoff is written to stay consistent with them.

---

## A. CURRENT PROJECT STATE

- **Laravel is the backend application** (`backend/`, PHP 8.3, MySQL). One app serves both
  the JSON API and the finished static frontend from `public/`. There is no separate
  frontend build step. (Audit §1.1, §13.1.)
- **Public marketing assets live under `public/web-page/`** (index/services/about/
  contact + `style.css`, `warm-theme.css`, `public-vetti.css`, `script.js`, `public-vetti.js`).
  The authenticated portals are `public/{user,admin,doctor}` with a shared integration
  layer in `public/shared/`.
- **User / Admin / Doctor portals already exist** and are LIVE against the API. Identity comes
  from `GET /api/auth/me` via the session cookie (`shared/session-auth.js`); roles are exactly
  `User | Doctor | Admin`. (Audit §1.1, §4.3.)
- **Current public User Vetti behavior is deterministic frontend logic**, not AI.
  `web-page/public-vetti.js` answers from a fixed phrase/table resolver over clinic info —
  no model, no network call to any provider.
- **Authenticated User Vetti (`user/vetti-ai.js`, `vetti-state.js`) is also deterministic.**
  `VettiAI.ask()` runs a phrase/table resolver over pets, appointments and the service catalog.
  A few pieces ARE real server calls: availability answers hit `GET /api/availability`, and
  booking actions drive the real wizard → booking OTP → `POST /api/appointments`. But the
  *answer generation* is client-side and deterministic. The module header states plainly:
  "NO network call, NO provider key, NO backend endpoint exists here." (Audit §8.1.)
- **Doctor Scribe (`doctor/doctor-scribe.js` + dictation in `doctor/doctor.js`) uses browser
  `SpeechRecognition` + a deterministic regex SOAP parser.** Transcript is in-memory only;
  nothing persists until the doctor manually Save Drafts (`PATCH /api/consultations/{id}`).
  (Audit §8.2.)
- **NO real LLM/provider is integrated anywhere. No provider key exists in the repo or in any
  JavaScript.** Both "AI" surfaces are deterministic with deliberate seams built for a swap.

> **Be explicit — do not describe the current Vetti or Scribe as real AI** in any code comment,
> doc, or demo. They are deterministic resolvers with frontend seams. This distinction matters
> for the defense and for honest handoff.

---

## B. AI FEATURES TO IMPLEMENT

### B1. USER PORTAL — VETTI AI (`user/vetti-ai.js` seam)

**Goal:** an authenticated pet-care assistant backed by a backend AI service.

Possible capabilities:
- Answer clinic / service / policy questions.
- Use **authorized** user + pet context (the caller's own pets/appointments only).
- Help explain appointment preparation and process.
- Assist with the appointment flow (pre-fill the existing wizard).
- Summarize relevant pet information where appropriate.

**Hard rule:** the AI must **NOT** silently create, confirm, reschedule, or approve
appointments. It may only *pre-fill* the existing wizard; the actual write still goes through
the normal booking + booking-OTP flow (`POST /api/appointments`). No authorization or OTP
decision is ever delegated to the model. (Audit §9.C.)

The frontend already enforces this boundary: `VettiAI.ALLOWED_ACTIONS = ['openPetForm',
'openBooking', 'openReschedule', 'openCancel']` — any other action name is rejected by
`validateAnswer()` before `runAction()` ever sees it. Keep that whitelist as the contract.

### B2. PUBLIC WEBSITE — LIGHTWEIGHT VETTI (`web-page/public-vetti.js`)

Keep public scope limited. This surface is **unauthenticated**.

**Allowed to answer:** services, clinic hours, general appointment guidance, login/signup
guidance, general clinic information.

**Must NOT expose:** private pet data, user history, medical records, authenticated
appointment details, or anything requiring a session. If a public question needs private
context, the assistant must decline and point the user to log in.

### B3. DOCTOR PORTAL — AI SCRIBE (`doctor/doctor-scribe.js` seam)

**Goal:** convert a transcript/text into a structured consultation draft (SOAP).

Suggested output: Subjective, Objective, Assessment, Plan; vitals (weight / temperature /
heart rate) when clearly present; prescription/medication suggestions as **draft content only**.

**Hard rules:**
- AI output is a **DRAFT**. The doctor reviews/edits before applying.
- The doctor must still manually Save Draft (`PATCH /api/consultations/{id}`) — the AI never
  persists anything.
- The AI must **never** automatically complete/finalize a consultation
  (`POST /api/consultations/{id}/complete` stays a manual, reviewed doctor action).

The existing review → Apply → Save Draft UI already implements this; the AI should only
replace the body that currently produces the draft (the deterministic parser), leaving the
review/apply/save path unchanged. (Audit §8.2, §9.B.)

---

## C. RECOMMENDED BACKEND ARCHITECTURE

Use a server-side AI abstraction. **Never call the AI provider directly from browser
JavaScript** — the provider key must never reach the client.

This matches the audit's agreed direction (§9.A). Recommended structure:

```
app/Services/AI/
    AiProviderInterface.php      // contract: complete(array $messages, array $opts)
    AiGateway.php                // single entry point: timeout, size caps, validation, fallback
    <ProviderImplementation>.php // e.g. HttpAiProvider.php (real provider HTTP call)
    FallbackProvider.php         // optional server-side deterministic fallback
backend/config/ai.php            // reads env keys server-side only
```

Keep:
- **provider key server-side** (env / config, never in JS, never logged).
- **model/config server-side** (`config/ai.php`).
- **timeout + error handling centralized** in `AiGateway` (one retry-free attempt, mirroring
  the SMS lesson in `OtpDelivery` — a timed-out call may already have consumed a billable unit).
- **fallback behavior centralized** — on any provider failure, degrade to the existing
  deterministic behavior / a safe message, never a crash.

Do not hardcode provider secrets anywhere in the repo.

---

## D. PROPOSED API ENDPOINTS

These are **suggested contracts only** — the backend developer may refine names and fields.
They are **not implemented** by this handoff. The response shapes below are anchored to the
**real frontend contracts** (verified in source) so the existing UI keeps working.

### D1. `POST /api/ai/vetti` — authenticated assistant

- **Auth:** `auth` + `active` session middleware (same as other User endpoints). Role: `User`
  (self-scoped). Envelope `{ success, message, data }` per `Support/ApiResponse`.
- **Request:**
  ```json
  {
    "message": "...",
    "responseLanguage": "en|taglish",
    "conversation": [{ "role": "user|vetti", "text": "..." }],
    "pet_id": "optional — must belong to the authenticated user"
  }
  ```
  `conversation` is the bounded window the frontend already sends (max 12 turns, ≤2000 chars
  each). Validate sizes. `pet_id`, when present, must be ownership-checked against the session
  user (403 otherwise).
- **Response (`data`):** must satisfy the existing `validateAnswer()` contract in
  `user/vetti-ai.js`:
  ```json
  {
    "text": "plain string (rendered as-is, escaped)",
    "state": "a valid Vetti mascot state",
    "suggestions": ["optional", "string", "prompts"],
    "action": "optional — one of openPetForm|openBooking|openReschedule|openCancel",
    "bookingContext": { "petId": "...", "serviceId": "...", "preferredDate": "...", "preferredTime": "..." }
  }
  ```
  The server should additionally wrap this with provenance for observability, e.g.
  `source: "ai|fallback"` and `requires_confirmation: false`. The frontend only renders the
  whitelisted fields; unknown keys are inert. Actions may only pre-fill the wizard — never
  create/mutate appointments.
- **Validation:** trim/limit `message`; bound `conversation`; enforce `responseLanguage` to
  `en|taglish`; ownership-check `pet_id`.
- **Error behavior:** on provider failure/timeout/invalid output, return a safe fallback
  (the deterministic answer or a plain honest line) with `source: "fallback"` — the chat must
  never break. Use a strict server-side timeout (e.g. `AI_TIMEOUT`, default ~15s).

### D2. `POST /api/ai/scribe` — Doctor SOAP draft

- **Auth:** `auth` + `active`, role `Doctor`. In-controller, assert the appointment's
  `assigned_vet_id` matches the caller's `doctor_profiles.id` (403 otherwise). (Audit §4.3,
  §9.B.)
- **Request:**
  ```json
  {
    "appointment_id": "...",
    "transcript": "..."
  }
  ```
- **Response (`data`):** must match the EXACT contract the current review/apply UI consumes
  (audit §9.B) so the frontend works unchanged:
  ```json
  {
    "ok": true,
    "apply": {
      "subjective": "...", "weight": "...", "temperature": "...", "heartRate": "...",
      "exam": "...", "assessment": "...", "plan": "..."
    },
    "meta": {}, "missing": [], "absentVitals": []
  }
  ```
  The endpoint is a **draft generator** — it does not save. The doctor still reviews, Applies,
  and manually Save-Drafts via the existing `PATCH /api/consultations/{id}`.
- **Validation:** require non-empty transcript; cap transcript size; verify appointment exists,
  is assigned to the caller's doctor profile, and is in an active consultation state.
- **Error behavior:** on failure, return an error the UI shows while **preserving the original
  transcript** — never discard doctor input; manual SOAP entry must remain usable.

> **Data minimization (audit §9.B):** send the provider ONLY the transcript plus minimal
> context (pet species/breed/age, service label). No owner PII, no other pets, no history
> beyond this appointment.

---

## E. AUTHORIZATION / SECURITY

- **Never expose the provider API key to the frontend.** Key stays in server env/config.
- **Authenticated Vetti requests must respect logged-in user ownership.** Scope every data
  lookup to the session user.
- **`pet_id` must belong to the authenticated user** — enforce server-side (403 on mismatch).
  Do not trust a client-supplied id.
- **Doctor Scribe must require Doctor authorization**, and the appointment must be assigned to
  that doctor (`assigned_vet_id` == caller's `doctor_profiles.id`).
- **Validate input sizes** (message, transcript, conversation window) before hitting the provider.
- **Rate-limit the AI endpoints** (throttle per session/IP) to control cost and abuse.
- **Sanitize / log carefully** — do not log full transcripts, provider keys, or sensitive
  clinical/PII payloads.
- **Do not send unnecessary personal or clinical data to the provider** (data minimization).
- **Do not trust model output** — validate structured responses server-side against the expected
  contract before returning them; strip unknown actions/fields.
- Reuse the existing `auth` + `active` + role middleware stack; do not invent a parallel auth path.

---

## F. FRONTEND EXPECTATIONS

The frontend is **frozen** at the checkpoint commit and already implements these states. The
backend must fit the existing contracts — the frontend will NOT call any provider directly and
holds NO provider credentials.

**User Vetti (`user/vetti-ai.js`) can already show:**
- idle, thinking, success, and error states;
- a **deterministic fallback** if the AI call fails (`VettiAI.ask()` always resolves, never
  rejects; provider failure/timeout/invalid-answer falls back to the deterministic resolver).

`VettiAI.setProvider(fn)` is the single production wiring seam — when the backend endpoint
lands, the provider becomes a function that calls `POST /api/ai/vetti` and maps the response to
the existing answer shape. The UI does not change.

**Doctor Scribe (`doctor/doctor-scribe.js`) already:**
- sends the transcript/text;
- shows a loading state;
- populates SOAP as an **editable DRAFT** in the review panel;
- lets the doctor review/edit (Apply), then manually Save Draft;
- never automatically saves or completes a consultation.

Only the body that currently produces the draft (the deterministic parser) is meant to change.

---

## G. FALLBACK BEHAVIOR

If the AI provider is unavailable, times out, or returns invalid output:

- **Public Vetti:** continue the existing deterministic / general-clinic fallback. No visible
  breakage; never expose private data as a fallback.
- **User Vetti:** show the safe deterministic fallback / error line. **Do not break the
  appointment workflow** — booking actions keep working through the real wizard + OTP path.
- **Scribe:** **preserve the original transcript** (never delete doctor input) and keep manual
  SOAP entry fully usable. A failed AI draft must leave the doctor exactly where they were.

The frontend already treats any provider failure as "fall back to deterministic" and never
surfaces a raw provider error to the user.

---

## H. ENVIRONMENT VARIABLES (placeholders only — do NOT commit real values)

```
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
AI_TIMEOUT=
```

- Backend reads these **server-side only** (e.g. `config/ai.php`).
- **Do not put secrets in this document.** **Do not edit `.env` automatically** — configure
  the key in the deployment environment / secret store.
- `AI_TIMEOUT` should default to a sane bound (~15s) and be enforced inside `AiGateway`.

---

## I. CURRENT KNOWN LIMITATIONS

- Real AI provider is **not integrated**; no key exists anywhere in the repo.
- **Public Vetti is currently deterministic** (fixed phrase/table resolver).
- **User Vetti still needs backend AI wiring** — the frontend seam (`setProvider`) is ready but
  the endpoint does not exist yet.
- **Doctor Scribe is currently deterministic / browser-assisted** (SpeechRecognition + regex
  parser); the real-LLM swap is confined to the draft-generation body.
- **SMS is not part of this frontend handoff** — it is code-complete but unconfigured
  (`SMS_DRIVER` default `disabled`); see audit §4.5.
- **Final frontend visual polish may resume after AI integration** — the frontend is only
  *temporarily* frozen for this handoff, not abandoned.

---

## J. INTEGRATION ACCEPTANCE CHECKLIST

### Vetti
- [ ] Endpoint requires correct auth (`auth` + `active`, User role, self-scoped).
- [ ] Frontend can send a message and receive an answer.
- [ ] AI response renders through the existing answer contract.
- [ ] Thinking / loading state works.
- [ ] Provider failure falls back safely (deterministic / honest error; chat never breaks).
- [ ] Unauthorized pet access is blocked (mismatched `pet_id` → 403).
- [ ] No provider key appears in the browser (network tab / bundle).

### Scribe
- [ ] Doctor-only (role `Doctor` enforced; non-Doctors 403).
- [ ] Transcript accepted (non-empty, size-capped).
- [ ] Structured SOAP returned matching the existing `apply` contract.
- [ ] Returned SOAP is marked/handled as a **draft** (nothing auto-saved).
- [ ] Doctor can edit the output (review → Apply → manual Save Draft).
- [ ] No automatic consultation completion.
- [ ] On failure, the original transcript is preserved and manual SOAP entry stays usable.

---

## Cross-references (see `docs/BACKEND_HANDOFF_AUDIT.md`)

- Current AI status (deterministic seams, exact contracts): **§8**
- Recommended real AI architecture (provider abstraction, endpoints, data minimization): **§9**
- Auth / roles / ownership: **§4**
- Consultation / SOAP lifecycle and the user-facing summary boundary: **§6, §7**
- Backend developer TODO (this AI work is P1 item #6): **§10**
