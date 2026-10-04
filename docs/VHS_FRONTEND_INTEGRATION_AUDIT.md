# VHS Frontend & Integration Architecture Audit

**Scope:** frontend/mock architecture of the VHS Animal Wellness Center
**Branch:** `frontend` · **Audited at:** `c69e148834c94a08ec1ee1038af8614ec1083024`
**Method:** static inspection only. No application logic was changed.

> This is an audit document. Every claim below is traceable to a file and line.
> Claims I could not verify statically are marked as such rather than asserted.

---

## 1. Executive summary

The architecture intent — `UI → adapter → shared contract → mock now / API later` —
is **largely realised, and unusually so for a demo codebase**. The shared layer is
real: appointment contract, appointment store, user/pet catalog, doctor roster,
clinic settings, scheduling engine, documents, and audit each have exactly one
owner, and the portals genuinely go through adapters. Smart Scheduling (KAN-63)
is the single scheduling authority across all five surfaces. Vetti in particular
is close to textbook: `vetti-ui.js` / `vetti-tools.js` / `vetti-state.js` contain
**zero** direct shared-store or `localStorage` access — every read funnels
through `vetti-data.js`.

The architecture is **not yet backend-ready**, for one dominant reason: **there is
no identity layer.** Both the owner session and the veterinarian identity are
hardcoded constants, and no capability in the product has a session. That is not
a mock-data problem — it is the missing spine the API will own. Three P0 findings
follow from it plus one genuine data-loss risk in the Doctor portal.

The second theme is **convention drift at the seams**: two different cache-buster
versions of the same contract file loaded by different portals, three different
`referenceNo` formats, two copies of the ID-minting algorithm, and one field
(`service`) persisted in two different conventions. None of these corrupt data
today — the code defends against each one — but each is a place where two portals
can silently disagree the moment the backend becomes authoritative.

**Verdict: READY WITH CONDITIONS** — see §15.

| Priority | Count |
|---|---|
| P0 | 3 |
| P1 | 8 |
| P2 | 9 |
| P3 | 7 |
| DEFER | 6 |

---

## 2. Architecture map

### 2.1 Script include graph (as declared in HTML)

```
                       shared/ (the contract + mock layer)
  vhs-ui.js 2.6.0      clinic-settings.js 1.1.0
  appointment-contract.js   ⚠ 2.5.0 (admin)  /  ⚠ 2.8.0 (user, doctor)
  mock-users.js 2.12.0      mock-appointments.js 2.9.0      mock-doctors.js 2.7.0
  smart-scheduling.js 1.1.0 audit-store.js 1.0.0
  document-store.js 1.0.3   ⚠ document-render.js 1.0.0 (doctor) / 1.1.0 (admin, user)
  dashboard-shared.js 2.11.1        signup-wizard.js 1.1.0

  admin/   (9 pages)  → all 9 load admin-portal.js 2.20.0
             6 of 9 ALSO load appointment-contract + mock-users + mock-appointments
                          + smart-scheduling
             3 of 9 (accounts, doctors, audit-log) load NONE of those
             documents.html additionally loads document-store + document-render
                              + documents-page.js
  user/    index.html  → the full shared set + user-script 4.2.0, pet-onboarding,
                         checkin-script, vetti-{data,tools,state,onboarding,ui}
  doctor/  index.html  → appointment-contract, mock-*, audit-store,
                         document-store, document-render, doctor.js
                         ⚠ NO clinic-settings.js (unused — see F-P1-6)
  clerk/   4 pages     → ⚠ NO SCRIPTS AT ALL. Static mockups. Dead.
  web-page/ index.html → mock-users + signup-wizard only (public marketing site)
  index.html           → meta-refresh → web-page/index.html
```

### 2.2 Ownership by concern

| Concern | Owner | Notes |
|---|---|---|
| **Appointment shape** | `shared/appointment-contract.js` | `fromLegacy` / `toLegacyDisplay` / `normalizeStatus` / `timeToHHMM` / `timeTo12h`. Single definition. |
| **Appointment state + transitions** | `shared/mock-appointments.js` | One transition table, one `setStatus()`. Every portal writes through it. |
| **Users / pets / services catalog** | `shared/mock-users.js` | Service catalog + `SERVICE_SCHEDULING` merge (`_withScheduling`). |
| **Doctor roster / capacity** | `shared/mock-doctors.js` | `activeDoctors()` → doctor capacity for the engine. |
| **Clinic hours / cutoffs** | `shared/clinic-settings.js` | Centralised config, persisted to `vhs_mock_clinic_settings_v1`. |
| **Scheduling decision** | `shared/smart-scheduling.js` | Pure function of settings + catalog + effective appointments. Never mutates. |
| **Documents** | `shared/document-store.js` + `document-render.js` | Persistence and rendering cleanly split. |
| **Audit** | `shared/audit-store.js` | One writer, one key, `aud-NNNN` IDs. |
| **Persistence** | localStorage, one key per store, each store owns its own key | No key is written outside its owning module (exceptions in §8.3). |
| **Vetti boundary** | `user/vetti-data.js` (reads) + `user/vetti-tools.js` (acts) | Cleanest boundary in the codebase. |

### 2.3 Who touches the mocks directly

| File | Shared access | Verdict |
|---|---|---|
| `user/user-script.js` | via stores + `_smartSchedulingSlots` adapter + `_reopenBookingWizard` | **Adapter** ✅ |
| `admin/admin-portal.js` | via stores + `_adminSchedulingSlots` adapter | **Adapter** ✅ |
| `doctor/doctor.js` | reads `SharedMockAppointments.todays()`, `byId()`, `setStatus()`; writes `drafts` map | **Mixed** — see F-P0-3, F-P1-4 |
| `user/vetti-ui.js` / `vetti-tools.js` / `vetti-state.js` | none (except a Vetti "seen" flag) | **Adapter** ✅ |
| `user/vetti-data.js` | the designated boundary | **Adapter** ✅ |
| `user/checkin-script.js` | `SharedMockAppointments` directly | Acceptable — thin, read + `checkIn` |
| `user/pet-onboarding.js` | via `SharedMockUsers` | Adapter |

---

## 3. Data / ID consistency

### 3.1 Identifier inventory

| Concept | Field(s) in use | Type | Owner | Consistency |
|---|---|---|---|---|
| Appointment | `appointmentId` | string (`apt###`) | `AppointmentContract` + store | ⚠ two minting sites |
| Reference | `referenceNo` | string | same | ⚠ three formats |
| Owner | `userId` | **number** in store, **string** in `document-store` seed | `mock-users` | ⚠ mixed |
| Pet | `petId` | number | `mock-users` | Consistent ✅ |
| Doctor | `doctorId` | string (`vet-001`) | `mock-doctors` | Hardcoded identity — F-P0-2 |
| Service | `serviceId` (number) / `service` (string) | both | `mock-users` catalog | ⚠ **two conventions in one field** |
| Document | `docId` | string (`doc-N`) | `document-store` | Consistent ✅ |
| Audit | `auditId` | string (`aud-NNNN`) | `audit-store` | Consistent ✅ |

### 3.2 Findings

**`service` is persisted in two conventions.** Seed appointments store the display
label (`'Consultation'`, `'Dog Grooming'` — `shared/mock-appointments.js:32-115`); every
newly written record stores the catalog value (`'consultation'`). `serviceByValue()`
and `serviceLabel()` both resolve either via an alias map, so nothing breaks — but a
backend column with an FK to `services.id` cannot hold both. This is the single
most likely source of a migration bug.

**Three `referenceNo` formats coexist:**
| Format | Example | Source |
|---|---|---|
| Generated numeric | `VHS-20261007-0901` | `user/user-script.js:1097`, `admin/admin-portal.js:636` |
| Seed hex | `VHS-20260926-A1B2C3` | `shared/mock-appointments.js:32-115` |
| Demo placeholder | `VHS-DEMO-APT900` | `shared/mock-appointments.js:101`, `shared/document-store.js:86` |
| Dead legacy | `VHS-2026-0915-001` | `_legacyUserFixtures`, not rendered |

**ID minting is duplicated.** `user/user-script.js:1092-1097` and `admin/admin-portal.js:631-636`
contain the *same* algorithm (`max(apt\d+)+1`, zero-padded to 3, reference padded
to 4). They agree today. Two copies of an ID allocator is exactly the kind of rule
that drifts.

**Collisions fail safe.** `add()` rejects a duplicate `appointmentId` **or**
`referenceNo` (`shared/mock-appointments.js:260-265`), so a concurrent double-mint cannot
corrupt the store — the second write is refused. The user-facing error is misleading
("This booking already exists"), which is a UX bug not a data bug.

**IDs survive reschedule.** `reschedule()` mutates date/time on the same record;
`appointmentId` and `referenceNo` are untouched by design.

---

## 4. Appointment lifecycle

### 4.1 Canonical set

`AppointmentContract.STATUSES` (`shared/appointment-contract.js:16`):
```
pending · confirmed · checked_in · in_consultation · completed · canceled · no_show · rescheduled
```

### 4.2 Transition table — the single source

`shared/mock-appointments.js:387-395`:
```
confirmed        → checked_in
checked_in       → in_consultation
in_consultation  → completed
confirmed        → canceled
pending          → canceled
pending          → confirmed
rescheduled      → canceled
rescheduled      → confirmed
```

This matches the intended happy path exactly, lives in one place, and every portal
writes through it. **This is a genuine strength.**

### 4.3 Observations

- **`normalizeStatus()` absorbs legacy values** (`scheduled`, `approved`, `cancelled`,
  `checked in`, `in-consultation`) into canonical ones, defaulting unknown values to
  `pending`. Safe, and one definition only — `user/vetti-data.js:169` is a thin delegating
  wrapper, not a reimplementation.
- **`no_show` is unreachable.** It is a valid status but has no entry in the
  transition table, so nothing can set it. Currently harmless (no UI offers it).
- **`pending` is nearly unreachable.** New bookings are written `confirmed`, so the
  `pending` branch is reachable only via a legacy seed. Admin's Approve/Reject actions
  are correctly gated on `a.status === 'pending'` (`admin/admin-portal.js:58`), so this is
  *not* a stale-UI bug — it is a mostly-dead action path.
- **No portal reimplements transitions.** Admin (`setStatus`), Doctor (`setStatus`),
  User cancel (`setStatus`), check-in (`checkIn` → `setStatus`) all route correctly.

---

## 5. Adapter boundaries

### 5.1 Per capability

| Capability | Pattern | Notes |
|---|---|---|
| User booking | **A** adapter | `_smartSchedulingSlots` → engine; `_finalizeBooking` → engine → `store.add` |
| Admin booking | **A** adapter | `_adminSchedulingSlots` → engine; `submitAdminBooking` → engine → `store.add` |
| Reschedule (both) | **A** adapter | store `_slotGuard` → engine |
| Cancel (User) | **A**, with a legacy `else` | `user/user-script.js:2743-2746` mutates `mockAppointmentsData` when no shared store — **F-P2-5** |
| Check-in | **B** acceptable | `checkin-script.js` calls the store directly; thin and correct |
| Admin approve/reject/cancel | **A** | `_adminSharedStatus` → `setStatus` |
| Doctor queue | **A/B** | reads the store; keeps a local `drafts` map — F-P0-3 |
| Doctor start/end consultation | **A** | `store.setStatus` + audit ✅ |
| EMR / pet history | **B — duplicate** | `doctor/doctor.js:63-88` carries its own hardcoded per-pet history arrays — F-P2-7 |
| SOAP / prescription / labs | **E — none** | memory-only `draft` — F-P0-3 |
| Documents | **A** | `SharedDocuments` + `document-render` |
| Vetti | **A** | `VettiData` / `VettiTools` |
| Public site | **A** (partial) | `web-page/website-services.js:16` reads `SharedMockUsers` |

### 5.2 Direct localStorage from UI code

Essentially clean. The only *real* access outside `shared/` is:

| Site | Purpose | Verdict |
|---|---|---|
| `user/vetti-state.js:737-758` | `LS_SEEN` — "has ever met Vetti" | Acceptable UI preference; survives logout by design |
| `user/vetti-data.js:349-358` | `qaPruneOwnerPets` — QA-only helper | Documented as QA-only, unreferenced by product code |

Everything else that mentions `localStorage` in portal files is a **comment**
(`admin/admin-portal.js:950` explicitly states "localStorage lives only inside the shared store").
**This is a strong result and a meaningful cutover asset.**

---

## 6. Smart Scheduling

### 6.1 Single authority — confirmed

One engine, five read surfaces, three write-time guards:

| Surface | Adapter | Location |
|---|---|---|
| User booking dropdown | `_smartSchedulingSlots()` | `user/user-script.js:828` |
| User booking submit | `_finalizeBooking()` | `user/user-script.js:1036` |
| User reschedule dropdown | `_populateRescheduleSlots()` | `user/user-script.js:2582` |
| Admin booking dropdown | `_adminSchedulingSlots()` | `admin/admin-portal.js:497` |
| Admin booking submit | `submitAdminBooking()` | `admin/admin-portal.js:578` |
| Admin reschedule dropdown | `_populateAdminRescheduleSlots()` | `admin/admin-portal.js:330` |
| Vetti | `VettiData.getAvailableSlots()` | `user/vetti-data.js:315` |
| Reschedule mutation | `_slotGuard()` | `shared/mock-appointments.js:191` |

Service-change and date-change triggers exist on **both** booking forms
(`admin/admin-portal.js:454`, `user/user-script.js:807` + the `onchange` on `#service_id`).
Verified live during the KAN-63 work: User == Admin == VettiData == engine for
consultation, cherry-eye (doctor-required) and cat grooming (non-doctor, capacity 2).

### 6.2 Fallback classification

| Fallback | Sites | Classification |
|---|---|---|
| `takenSlots()` when engine absent | `admin/admin-portal.js:357`, `admin/admin-portal.js:621`, `user/user-script.js:1075`, `shared/mock-appointments.js:214` | **Acceptable temporary** — unreachable while `smart-scheduling.js` loads; fails *closed* (refuses), never open |
| `get_booked_slots.php` via `_legacyBookedSlotsFromPhp()` | `admin/admin-portal.js:484` | **Must be removed at cutover** — legacy endpoint, `TODO(BACKEND)` already marks it |
| "No service chosen → clinic hours" early return | `admin/admin-portal.js:536` | **Acceptable** — a UI state, not an engine failure |

No dangerous duplication: there is exactly one place where availability is *decided*.

### 6.3 Correct behaviours confirmed

- `durationMinutes` is explicitly non-authoritative (`durationIsAuthoritative: false`);
  no overlap blocking anywhere. Documented in `VHS_SMART_SCHEDULING_CONTRACT.md`.
- Doctor capacity derives from `activeDoctors()`, not a hardcoded 1.
- Service/date changes trigger recompute on both booking forms.

---

## 7. Hardcodes / configuration

| Value | Location | Class |
|---|---|---|
| **Owner identity `CURRENT_USER_ID = 1`** | `shared/mock-users.js:79` | **D — dangerous** → F-P0-1 |
| **Veterinarian `{id:'vet-001', name:'Dr. Santos'}`** | `doctor/doctor.js:169` | **D — dangerous** → F-P0-2 |
| Clinic hours, `slotIntervalMinutes: 60` | `shared/clinic-settings.js:23-27` | **B — centralised config** ✅ |
| Cancellation/reschedule cutoff 120 min, no-show grace 15 | `shared/clinic-settings.js:28-30` | **B** ✅ |
| `SERVICE_SCHEDULING` durations/capacity | `shared/mock-users.js:186-211` | **C — temporary mock**, correctly marked non-authoritative |
| Service labels + prices (₱) | `mock-users.js` catalog | **C** — demo data, not domain logic ✅ |
| PHP endpoints (`get_users.php`, `get_pets.php`, …) | portal `fetch()` calls | **E — backend-owned**, already `TODO(BACKEND)`-annotated |
| `apt###` / `VHS-…` patterns | 2 minting sites | **C**, but duplicated → F-P1-3 |
| `DOCTOR_TEST_DATE = null` | `doctor/doctor.js:106` | **A** — documented test seam, correctly inert ✅ |
| Admin actor `{admin-001, Administrator}` | `shared/audit-store.js:36` | **E** — backend owns identity |
| `MAX_DOCS = 500`, `MAX_ENTRIES = 500` | `shared/document-store.js:30`, `shared/audit-store.js:30` | **A** — demo safety valves, commented |
| `doctor/doctor.js:63-88` hardcoded pet history + dates | `doctor.js` | **D — dangerous** → F-P2-7 |
| `_legacyUserFixtures` (`apt001` scheme, `VHS-2026-0915-001`) | `user/user-script.js:2296-2346` | **P3 dead code** — explicitly "NOT rendered" |

No hardcoded value has leaked into domain logic. The dangerous ones are **identities**,
which is the theme of §1.

---

## 8. Storage / persistence

### 8.1 Key inventory — 9 keys, one owner each

| Key | Owner module | Layer |
|---|---|---|
| `vhs_mock_appointments_added_v1` | `mock-appointments.js` | ADDED (new records) |
| `vhs_mock_checkin_overrides_v1` | `mock-appointments.js` | OVERRIDES (seed mutations) |
| `vhs_mock_users_pets_v1` | `mock-users.js` | catalog mutations |
| `vhs_mock_services_v1` | `mock-users.js` | catalog mutations |
| `vhs_mock_doctors_v1` | `mock-doctors.js` | roster mutations |
| `vhs_mock_clinic_settings_v1` | `clinic-settings.js` | config mutations |
| `vhs_documents_v1` | `document-store.js` | documents |
| `vhs_audit_log_v1` | `audit-store.js` | audit |
| *(Vetti `LS_SEEN`)* | `vetti-state.js` | UI preference |

**No duplicate keys. No key is written by more than one module.** This is clean.

### 8.2 Two-layer appointment model

`MOCK_APPOINTMENTS` (frozen seed array) + `ADDED` (localStorage) + `OVERRIDES`
(localStorage) are merged by `effective()`. Seeds are never mutated in place, so
fixtures stay intact on disk. `_allBase()` returns `MOCK_APPOINTMENTS.concat(ADDED)`,
so reschedule/check-in **do** see added records — I checked this specifically and it
is correct. The cost is that the effective-record merge is duplicated in
`update()` (which reaches into `ADDED` directly) — a small inconsistency, not a bug.

### 8.3 Stale snapshots — confirmed

`ADDED` and `OVERRIDES` are **module-level IIFE snapshots** read once at script load
(`shared/mock-appointments.js:139-142, 163-166`). No `storage` event listener exists.

Consequence, observed live during this audit: a record written by the User portal is
**invisible to an already-open Admin/Doctor tab** until that tab reloads. Availability
parity between two open tabs is therefore not guaranteed.

**Classification: leave as-is.** It disappears entirely at backend cutover (the API is
the source), and adding cross-tab sync now would add code the backend immediately
replaces. It is a demo-labelling hazard, not an integration blocker. — F-DEFER-1

### 8.4 What disappears at cutover vs what remains

| Disappears with the backend | Remains frontend work |
|---|---|
| All 8 `vhs_mock_*` keys | None — no key is load-bearing for UI logic |
| `ADDED` / `OVERRIDES` merge | None |
| `_allBase()` seed array | None |
| Every `fetch()` fallback branch | None |
| Identity constants (once a session exists) | Session plumbing + route guards |

**No storage concern needs a frontend adapter after cutover.** That is the best news
in this audit.

---

## 9. Cross-portal parity

Same appointment rendered in User / Admin / Doctor:

| Field | User | Admin | Doctor | Parity |
|---|---|---|---|---|
| `appointmentId` | via `toLegacyDisplay` | via `toLegacyDisplay` | `byId()` | ✅ |
| `referenceNo` | ✅ | ✅ | ✅ | ✅ |
| owner / pet | ✅ | ✅ | ✅ | ✅ |
| service | `serviceLabel()` | `serviceLabel()` | `serviceLabel()` (`:176`) | ✅ (label), ⚠ (stored convention — F-P1-1) |
| date / time | `timeTo12h` | `timeTo12h` | `timeTo12h` (`:138`) | ✅ |
| **status** | `normalizeStatus` | `normalizeStatus` | `draft.status` **preferred over the store** (`:197-207`) | ⚠ **F-P1-4** |
| status **rendering** | local badge | `statusBadge()` in `dashboard-shared.js` | own renderer, does **not** use `statusBadge` | ⚠ F-P2-6 |
| pet metadata | shared pet catalog | shared | **hardcoded per-pet history** (`:63-88`) | ⚠ F-P2-7 |
| clinical documents | — | `SharedDocuments` | `SharedDocuments` (`:776`) | ✅ |

`user-script.js` re-derives its list from the store via `_syncFromStore()`
(`:2276-2282`) rather than mutating a local copy — the correct pattern, called after
every write (`:1149, :2684, :2749`).

`mockAppointmentsData` is a **derived mirror**, not a second source — it is reassigned
from `SharedMockAppointments.all()` filtered by owner. Healthy.

---

## 10. Doctor portal readiness

**Correctly shared:** queue source (`SharedMockAppointments.todays`), status writes
(`setStatus`), audit (`AuditLog.add` with a `Doctor` actor), documents
(`SharedDocuments`), contract mapping (`fromLegacy`), service labels.

**UI-only (no persistence):**

| Feature | State | Gap |
|---|---|---|
| Consultation timer | `draft.startedAt` in memory | Lost on refresh |
| SOAP fields | `draft.fields` | Lost on refresh |
| Prescriptions | `draft.medicines` | Lost on refresh |
| Lab requests | `draft.labs` | Lost on refresh |
| Consultation document | generated on completion (`:776`) | **No persistence contract** — a document is created but SOAP data itself is never stored |

`drafts` is a plain `Map` (`doctor/doctor.js:165, 306-309`). **Nothing about a consultation
survives a page reload.** For a clinical workflow this is the most serious functional
gap found. → **F-P0-3**

**Notes:**
- `doctor/index.html` loads `smart-scheduling.js` but `doctor.js` never calls it —
  harmless, but it is an unused dependency. It does **not** need `clinic-settings.js`.
- `VETERINARIAN` is hardcoded — F-P0-2.
- Doctor correctly refuses duplicate check-in (`setStatus` returns `already`).

---

## 11. Vetti readiness

**Architecture: exemplary.** `vetti-ui.js` (1,828 lines), `vetti-tools.js`,
`vetti-state.js`, `vetti-onboarding.js` contain **no** direct `SharedMock*` access and
**no** `localStorage` reads of shared data — only a local `LS_SEEN` UI flag.

| Check | Result |
|---|---|
| Direct mock imports in UI | none ✅ |
| Direct `localStorage` of shared data | none ✅ |
| Duplicate appointment logic | none — `VettiData` delegates ✅ |
| Direct scheduling logic | none — delegates to `SmartScheduling` ✅ |
| Direct booking mutations | none — `VettiTools` returns `{ok, handledBy}` ✅ |
| Owner resolution | `VettiData` resolves by id; **fails closed** (`:169`, and the documented owner-filter fix) ✅ |
| Duplicate validators | none ✅ |

**Cutover points:** swap `VettiData`'s four read adapters and `VettiTools`' one action
adapter; the entire Vetti UI is untouched. This is the best-prepared module in the repo.

---

## 12. Maintainability findings

**Size / responsibility concentration**

| File | Lines | Concern |
|---|---|---|
| `user/user-script.js` | 4,227 | Booking + appointments + pets + reschedule + cancel + check-in + legacy fixtures. 25 `TODO(BACKEND)`. |
| `admin/admin-portal.js` | 2,015 | 9 pages' worth of behaviour in one file. 21 `TODO(BACKEND)`. |
| `user/vetti-ui.js` | 1,828 | Large but cohesive. |
| `doctor/doctor.js` | 1,530 | 21 `TODO(BACKEND)`. |
| `shared/dashboard-shared.js` | 1,993 | Mixed: theme + helpers + custom dropdown + bootstrap. |

**Duplicated helpers** (P3, no behaviour risk)

| Helper | Duplicated in | Count |
|---|---|---|
| `esc` / `escapeHtml` | `admin-portal`, `audit-log-renderer`, `documents-page`, `document-render`, `vhs-ui`, `checkin-script`, `signup-wizard`, `user-script` | **8 files** |
| `fmtDate` | `document-render`, `checkin-script`, `vetti-data`, `vetti-ui` | **4 files** |

**Not duplicated (checked, to avoid false positives):**
- `normalizeStatus` — one definition; `user/vetti-data.js:169` delegates.
- `VHSserviceLabel` — thin alias over `mock-users.serviceLabel`, not a reimplementation.

**Dead code**
- `_legacyUserFixtures` (9 records, `user/user-script.js:2296-2346`) — marked "NOT rendered",
  never referenced. Carries a *third* reference format and an `apt001` ID scheme that
  would confuse a reader.
- `clerk/` — 4 HTML pages, **zero** `<script src>` tags.
- `web-page/about.html`, `contact.html`, `services.html` — static.

**Cache-buster drift** (real risk — see F-P1-7)

| File | Versions in use |
|---|---|
| `appointment-contract.js` | **2.5.0** (all 9 admin pages) / **2.8.0** (user, doctor) |
| `document-render.js` | **1.0.0** (doctor) / **1.1.0** (admin, user) |

**Ordering fragility**
- `admin-portal.js` is loaded on 9 pages but 6 of them never load the mock/contract/
  scheduling layer it references. All call sites are guarded, so nothing crashes, but
  the guards are load-bearing rather than structural.

---

## 13. Backend contract matrix

Existing documentation consulted before writing this (no endpoints invented):
`VHS_API_CONTRACT.md`, `VHS_DATA_CONTRACT.md`, `VHS_FRONTEND_BACKEND_WIRING.md`,
`VHS_SMART_SCHEDULING_CONTRACT.md`, `VHS_SHARED_LAYER_MAP.md`, `VHS_BACKEND_HANDOFF.md`.

| Capability | Contract exists? | Current frontend source | Cutover adapter | Open decision |
|---|---|---|---|---|
| **Auth / session** | **No** | `shared/mock-users.js:79` constant | **new** — nothing to swap | IdP, token, role model |
| **Users** | Partial (`VHS_API_CONTRACT`) | `mock-users.js` | `SharedMockUsers` | PII ownership |
| **Pets** | Partial | `mock-users.js` | `SharedMockUsers` | pet-owner FK |
| **Services** | Partial | `mock-users.js` catalog | `SharedMockUsers` | `service` label-vs-value (F-P1-1) |
| **Doctors** | **No** | `mock-doctors.js` | `SharedMockDoctors` | per-doctor hours (scheduling §17.3) |
| **Appointments** | Yes | `mock-appointments.js` | `SharedMockAppointments` | ID assignment server-side |
| **Availability / scheduling** | **Yes — complete** | `smart-scheduling.js` | `SmartScheduling` | duration + capacity (§17.1-2) |
| **Reschedule / Cancel** | Yes | store + `_slotGuard` | store methods | cutoff authority (§17.6) |
| **QR check-in** | **No** | `checkin-script.js` | **new** | token lifetime |
| **Consultation lifecycle** | Partial | `setStatus` | store | timestamp authority |
| **SOAP** | **No** | `doctor.js` draft Map | **new** | record vs document (§14.2) |
| **Prescriptions** | **No** | `doctor.js` draft | **new** | schema |
| **Lab requests** | **No** | `doctor.js` draft | **new** | schema |
| **Documents** | **No** | `document-store.js` | `SharedDocuments` | blob storage |
| **Audit** | **No** | `audit-store.js` | `SharedAuditLog` | retention |
| **Notifications** | **No** | none (SMTP/OTP PHP exists) | **new** | SMS vs email |
| **Vetti tools** | **No** | `vetti-tools.js` | `VettiTools` | server-side intent execution |

---

## 14. Prioritized issues

### P0 — blocks backend integration / corrupts data

**F-P0-1 · No owner session — identity is a constant**
`shared/mock-users.js:79` `var CURRENT_USER_ID = 1;`
Every User portal instance is Maria Santos. `_getSessionUser()` reads it, booking
writes it, and audit rows attribute to it. No login, no token, no expiry.
**Why it matters:** the API owns identity; without a session layer nothing can be
authenticated and every audit row is fabricated.
**Owner:** Backend (session) + Shared/Integration (plumbing) · **Before first API call**

**F-P0-2 · No staff identity — veterinarian is a constant**
`doctor/doctor.js:169` `const VETERINARIAN = { id: 'vet-001', name: 'Dr. Santos' };`
Consultation start/complete audit rows attribute to a fictional doctor.
**Why it matters:** clinical actions are untraceable; role checks impossible.
**Owner:** Backend + Shared/Integration · **Before Doctor API integration**

**F-P0-3 · Consultation drafts are memory-only — clinical data loss**
`doctor/doctor.js:165, 306-309` — `drafts` is a `Map`, never persisted.
SOAP fields, medicines, lab requests, `startedAt`/`completedAt` and `durationMinutes`
are lost on every reload. A consultation *document* is generated on completion but the
SOAP record itself is never stored anywhere.
**Why it matters:** a clinical record cannot be lost. This also has no defined
persistence contract, so it blocks the Doctor API work entirely.
**Owner:** Backend (contract) + Frontend (draft persistence) · **Before Doctor E2E**

### P1 — high-risk inconsistency before integration

**F-P1-1 · `service` field holds two conventions** — seeds store labels, new records
store values. Handled by alias lookup; breaks a real FK.
*Owner: Shared/Integration · Before schema freeze*

**F-P1-2 · Three `referenceNo` formats** — numeric, hex, demo placeholder.
*Owner: Backend · With ID assignment decision*

**F-P1-3 · ID minting duplicated** — identical algorithm in `user/user-script.js:1092-1097`
and `admin/admin-portal.js:631-636`. Will drift.
*Owner: Frontend · Before API cutover*

**F-P1-4 · Doctor `draft.status` shadows the shared appointment status**
`doctor/doctor.js:197-207` — `statusFor()` prefers `draft.status` over
`SharedMockAppointments.byId()`. The Doctor queue can display a status the shared
store does not hold.
*Owner: Frontend · Before Doctor E2E*

**F-P1-5 · Legacy cancel path is a second source of truth**
`user/user-script.js:2743-2746` — when no shared store exists, cancel mutates
`mockAppointmentsData` directly.
*Owner: Frontend · Before final E2E*

**F-P1-6 · `no_show` unreachable from the transition table**
`shared/mock-appointments.js:387-395`. Valid status with no path into it.
*Owner: Backend + Shared · With lifecycle contract*

**F-P1-7 · Cache-buster version skew on shared modules**
`appointment-contract.js` 2.5.0 vs 2.8.0; `document-render.js` 1.0.0 vs 1.1.0.
Two portals can run **different contract code**. Any contract fix applied to one
version silently misses the other.
*Owner: Frontend · Immediately*

**F-P1-8 · `admin-portal.js` loaded without its dependencies on 3 pages**
`accounts`, `doctors`, `audit-log`. Safe today only because every call site is
null-guarded.
*Owner: Frontend · P2 of the work*

### P2 — cleanup before final E2E

| ID | File | Issue | Owner |
|---|---|---|---|
| F-P2-1 | `admin/admin-portal.js:484` | `get_booked_slots.php` legacy adapter — remove at cutover | Frontend |
| F-P2-2 | 4 sites | `takenSlots()` degraded fallbacks — remove at cutover | Frontend |
| F-P2-3 | `doctor/doctor.js` | Own status renderer instead of shared `statusBadge()` | Frontend |
| F-P2-4 | `shared/dashboard-shared.js:165` | `VHSserviceLabel` global alias duplicates the catalog accessor | Frontend |
| F-P2-5 | `doctor/doctor.js:63-88` | Hardcoded per-pet medical history + dates — portal-local clinical data | Frontend |
| F-P2-6 | `user/user-script.js:1092` | ID collision produces a misleading "already exists" message | Frontend |
| F-P2-7 | `shared/mock-appointments.js:277` | `update()` reaches into `ADDED` directly while everything else uses `_allBase()` | Frontend |
| F-P2-8 | `admin/documents.html:133` | `document-store.js` loads AFTER `admin-portal.js`, unlike the User page | Frontend |
| F-P2-9 | `PHPMailer-7.1.1/` | Vendored mailer committed to the repo | Backend |

### P3 — cosmetic / maintainability

| ID | File | Issue |
|---|---|---|
| F-P3-1 | 8 files | `esc`/`escapeHtml` duplicated |
| F-P3-2 | 4 files | `fmtDate` duplicated |
| F-P3-3 | `user/user-script.js:2296-2346` | `_legacyUserFixtures` dead code with a conflicting ID scheme |
| F-P3-4 | `clerk/` | 4 dead HTML pages, no scripts |
| F-P3-5 | `user/user-script.js` (4,227 lines) | Mixed responsibilities |
| F-P3-6 | `shared/dashboard-shared.js` | Theme + helpers + widget + bootstrap in one file |
| F-P3-7 | repo-wide | ~147 `TODO(BACKEND)` markers — useful, but no central index |

### DEFER — safe to leave until the backend replaces mocks

| ID | Item | Why safe |
|---|---|---|
| F-DEFER-1 | Cross-tab staleness (no `storage` listener) | Disappears when the API is the source |
| F-DEFER-2 | `durationMinutes` placeholder values | Already marked non-authoritative; no rule reads them |
| F-DEFER-3 | `MAX_DOCS`/`MAX_ENTRIES` = 500 | Demo valves, commented |
| F-DEFER-4 | `DOCTOR_TEST_DATE` seam | Documented and inert |
| F-DEFER-5 | `serviceLabel` legacy alias map | Defensive; harmless once the backend normalises |
| F-DEFER-6 | Vetti `LS_SEEN` preference | A genuine UI preference, not domain data |

---

## 15. Recommended next actions

### Batch A — critical architecture fixes (frontend-only, small)

1. **Align cache-buster versions** — one version per shared file across all pages (F-P1-7). *Minutes; removes a whole class of "works in User, not Admin" bugs.*
2. **Move ID minting into one shared helper** — lift the algorithm from `user-script.js` / `admin-portal.js` into `shared/` and call it from both (F-P1-3). *Small; eliminates a duplicated business rule.*
3. **Make Doctor draft status derive from the store** — remove `draft.status` as a status source; keep it only for unsaved-form state (F-P1-4). *Small; restores cross-portal status parity.*
4. **Delete the legacy cancel branch** — always route cancel through `setStatus` (F-P1-5). *Tiny.*
5. **Remove the Doctor hardcoded pet-history arrays** — read from `SharedDocuments`/catalog, or mark clearly as fixture (F-P2-5). *Small.*

### Batch B — backend-contract documentation

6. **Session/identity contract** — auth, roles, token shape, and how `CURRENT_USER_ID` /
   `VETERINARIAN` retire (F-P0-1, F-P0-2).
7. **Clinical record contract** — SOAP, prescriptions, lab requests, and where a
   consultation draft is persisted between start and end (F-P0-3). *This is the single
   largest unknown.*
8. **ID/reference decision** — server-side assignment, and which `referenceNo` format
   wins (F-P1-2, F-P1-3).
9. **Canonical `service` column** — value vs label (F-P1-1).
10. **Check-in, notifications, documents, audit contracts** — the six capabilities
    currently marked "contract needed" in §13.

### Batch C — optional cleanup before final E2E

11. Consolidate `esc`/`fmtDate` into `shared/vhs-ui.js` (F-P3-1/2).
12. Delete `_legacyUserFixtures` and `clerk/` (F-P3-3/4).
13. Retire `get_booked_slots.php` adapter and the `takenSlots` fallbacks once the
    scheduling API exists (F-P2-1/2).
14. Split `user-script.js` and `admin-portal.js` by domain (F-P3-5/6) — only once
    the above is done.

### Overall verdict: **READY WITH CONDITIONS**

The **shape** is right and the shared layer is genuinely good — one contract, one
store, one transition table, one scheduling engine, one audit writer, one document
store, and a Vetti boundary that is already API-shaped. Scheduling (KAN-63) is
functionally complete and verified across five surfaces.

What is missing is not architecture, it is **identity and clinical persistence**.
Those are additive seams, not rework: Batch A is roughly a day of small, isolated
changes, and Batch B is mostly writing down decisions the backend already has to
make. Once a session exists and SOAP has a home, the adapters in §13 are
mechanical swaps.

**Do not mark KAN-63 Done on the basis of this audit** — it assessed frontend/mock
scheduling only, which is complete. Backend readiness is a separate question that
Batch B has to answer first.