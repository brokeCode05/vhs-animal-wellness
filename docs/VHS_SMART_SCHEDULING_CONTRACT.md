# VHS Smart Scheduling Contract — v1 (Frontend / Mock)

> **Status:** FRONTEND CONTRACT. Frozen for backend build-out. Describes what the demo implements today and what the backend must eventually own.
> **Engine:** `shared/smart-scheduling.js` · **Service metadata:** `shared/mock-users.js` (`SERVICE_SCHEDULING`) · **Reschedule guard:** `shared/mock-appointments.js` (`_slotGuard`) · **Vetti adapter:** `user/vetti-data.js`.
> **Boundary:** this contract is frontend + mock only. No backend file is changed by it and no endpoint exists yet.

---

## 1. Feature purpose

Smart Scheduling is a **rule-based** availability and decision-support feature. It answers one question deterministically:

> Given a service, a date and optionally an appointment to exclude — which clinic slots can actually be booked right now, and why not the others?

It evaluates veterinarian availability, existing appointments, clinic hours, service/resource requirements and per-resource capacity, prevents conflicting appointments, recommends valid alternatives, and explains conflicts in structured form. It behaves identically in User, Admin and Vetti.

It is **not** machine learning. There is no model, no training, no inference and no prediction. Every decision is a deterministic comparison against configured data.

---

## 2. Current frontend/mock implementation

| Layer | Module | Role |
|---|---|---|
| Domain engine | `shared/smart-scheduling.js` | All availability, capacity, conflict and alternative logic |
| Service catalog | `shared/mock-users.js` | `durationMinutes`, `requiresDoctor`, `capacityPerSlot`, `active` — merged into every effective service |
| Clinic hours | `VHSClinicSettings` | Weekday/weekend hours, `slotIntervalMinutes`, cut-offs |
| Appointments | `SharedMockAppointments` | Effective records; mutation, persistence, lifecycle |
| Doctor roster | `SharedMockDoctors` | `activeDoctors()` → doctor capacity |
| User portal | `user/user-script.js` | `_smartSchedulingSlots()` — booking form + reschedule dropdown |
| Admin portal | `admin/admin-portal.js` | `_adminSchedulingSlots()` — booking form; `_populateAdminRescheduleSlots()` — reschedule dropdown |
| Vetti | `user/vetti-data.js` | `getAvailableSlots()` / `getServiceScheduling()` adapters |
| Mutator | `shared/mock-appointments.js` | `_slotGuard` revalidates immediately before every reschedule |

All consumers call the **same** engine instance. There is no second copy of scheduling logic in the UI.

**Five call sites, one engine.** `_smartSchedulingSlots()` (User), `_adminSchedulingSlots()` (Admin booking), `_populateAdminRescheduleSlots()` (Admin reschedule), `VettiData.getAvailableSlots()` (Vetti), `_slotGuard()` (reschedule mutation). Admin booking additionally calls `validateAppointmentRequest()` on submit — see §11.

### 2.1 Admin booking degraded mode

`php_files/get_booked_slots.php` survives **only** as a legacy fallback, isolated in `_legacyBookedSlotsFromPhp()`. It is reached when the engine cannot answer at all — the engine script missing, or the selected service unresolvable against the catalog — and never for an ordinary UI state such as "no service chosen yet" (that shows the clinic's own hours, matching the User form).

The fallback applies the old universal "anything at this wall-clock time is booked" rule and understands neither doctor capacity nor per-service capacity, so it is **never authoritative**: its answer only populates the dropdown, and the final save (§11) revalidates through the engine and refuses if the engine is unavailable rather than trusting it.

---

## 3. Public scheduling operations

```js
SmartScheduling.getServiceScheduling(serviceId)
SmartScheduling.getDoctorCapacity()
SmartScheduling.describeReason(code)
SmartScheduling.getAvailableSlots(options)
SmartScheduling.isSlotAvailable(options)
SmartScheduling.validateAppointmentRequest(options)
SmartScheduling.getAlternativeSlots(options)
```

The engine **never** books, never reschedules, never mutates an appointment, never generates IDs or reference numbers, and never returns UI markup.

---

## 4. Input / request shape

```js
{
  serviceId: Number,              // required — SharedMockUsers catalog key
  date: 'YYYY-MM-DD',             // required
  time: 'HH:MM' | 'h:mm AM/PM',   // required for isSlotAvailable/validate
  doctorId: Number|null,          // optional — reserved; NOT auto-assigned
  excludeAppointmentId: String,   // optional — reschedule self-exclusion
  limit: Number,                  // optional — alternatives count (default 3)
  searchDays: Number              // optional — alternatives span (default 7)
}
```

`doctorId` is accepted but **never used to auto-assign a veterinarian**. Assignment remains outside this contract.

---

## 5. Output / response shapes

```js
// getAvailableSlots — bookable slots ONLY
{ ok: true,  reason: null, slots: [{ time, timeHHMM, used, capacity, resource, conflict: null }] }
{ ok: false, reason: Code, slots: [] }

// isSlotAvailable
{ ok: true,  available: true,  reason: null, slot, capacity, used, alternatives: [] }
{ ok: false, available: false, reason: Code, detail: {code, resource, used, capacity}, alternatives: [...] }

// validateAppointmentRequest
{ ok: true,  reason: null, detail: null, alternatives: [],
  request: { serviceId, date, time, timeHHMM, doctorId, excludeAppointmentId } }
{ ok: false, reason: Code, detail, request: null, alternatives: [...] }

// getAlternativeSlots / alternatives[]
{ ok: true, reason: null, slots: [{ date, time, timeHHMM, rank: 'same_day'|'later_day', sameDay: Boolean }] }

// getServiceScheduling
{ serviceId, value, label, durationMinutes, durationIsAuthoritative,
  requiresDoctor, capacityPerSlot, active }
```

A failure never returns a partially guessed slot list.

---

## 6. Reason / error codes

Codes are structured and stable; the UI maps them to friendly copy via `SmartScheduling.describeReason(code)`, so User and Admin explain a conflict identically.

| Code | Meaning |
|---|---|
| `unknown_service` | `serviceId` not found in the catalog |
| `service_inactive` | Service retired from new bookings (Admin `active:false`) |
| `invalid_date` | Missing/unusable date |
| `invalid_time` | Time is not a usable `HH:MM` value |
| `clinic_closed` | No configured slots for that date |
| `doctor_unavailable` | Service needs a Doctor and **zero** are active |
| `doctor_conflict` | Active Doctor pool is at capacity for that slot |
| `resource_capacity_reached` | Non-doctor service is at its `capacityPerSlot` |
| `slot_taken` | **Legacy degraded mode only** — emitted only when the engine is not loaded |
| `settings_unavailable` | Clinic settings module missing |
| `invalid_service` | Guard could not resolve a stored service (fails closed) |

`doctor_conflict`, `doctor_unavailable` and `resource_capacity_reached` are the three distinct meanings the previous single `slot_taken` conflated. They are deliberately **not** synonyms.

---

## 7. Business rules

1. **The clinic's configured hours are the only source of slots.** Candidates come from `VHSClinicSettings.slotsFor(date)`. The engine never widens hours, interpolates, or invents a time.
2. **Terminal statuses do not occupy capacity.** `canceled`, `completed`, `no_show` are excluded via canonical status normalization.
3. **Reschedulable statuses only** — `confirmed` / `pending` (lifecycle owned by the appointment store, unchanged).
4. **Reschedule cut-off is unchanged** — 2 hours, enforced by `VHSClinicSettings`, outside this engine.
5. **Unknown/retired stored services fail closed** as Doctor-required, so an unrecognised booking can never silently free a resource.

---

## 8. Resource / capacity behaviour

Scheduling is **resource-aware**, not "one appointment per time slot".

- A **Doctor-required** service draws from the active Doctor pool: `capacity = SharedMockDoctors.activeDoctors().length` (**1 today**). It is read from the roster, not hardcoded, so adding a Doctor raises capacity with no change to the engine.
- A **non-doctor** service draws from its own `capacityPerSlot` (grooming/boarding/confinement currently 2).
- Each non-doctor service is a **separate bucket**; two grooming services do not consume each other's capacity.
- Therefore a consultation and a grooming visit **may share a wall-clock time**, and a slot is refused only when the *relevant* resource is exhausted.

---

## 9. durationMinutes is NOT a scheduling input

The `durationMinutes` values in the catalog are **placeholders, not confirmed clinic facts**. They are exposed as metadata for display/future use and are explicitly flagged `durationIsAuthoritative: false`.

**No conflict decision reads them.** Occupancy is counted per configured slot; there is deliberately **no duration-overlap blocking**. Blocking a slot using an unverified duration would invent a clinic rule. Actual durations are a backend decision (§16).

---

## 10. Reschedule self-exclusion

`excludeAppointmentId` removes the appointment being moved from its **own currently held slot**, so it can be rescheduled into the slot it already occupies. It never creates a new appointment and never changes `appointmentId` or `referenceNo` — the same record is mutated.

Both portals pass the id: the User reschedule modal (`user/user-script.js`) and the Admin reschedule modal (`admin/admin-portal.js`).

---

## 11. Final-save revalidation requirement

**The dropdown is never trusted.** Every write path revalidates through `SmartScheduling.validateAppointmentRequest({serviceId, date, time, excludeAppointmentId})` immediately before mutating:

| Path | Revalidation point |
|---|---|
| Reschedule (all portals) | `SharedMockAppointments.reschedule()` → `_slotGuard(...)` |
| **Admin booking** | `submitAdminBooking()`, after field checks and **before** any id/reference is minted |
| User booking | *(gap)* — `SharedMockAppointments.add()` only rejects duplicate id/reference; the engine guards the dropdown, not the submit |

- Rejected ⇒ **no mutation**, **no audit entry at all** (not even a success one), and the portal shows its mapped error.
- Accepted ⇒ the record is written/mutated as before; `appointmentId`, `referenceNo`, owner, pet and lifecycle are untouched.
- If the engine is unavailable, Admin booking degrades to the legacy exact-time store check (`takenSlots`) and still refuses a taken slot — it never silently allows an unverified one.

Reason codes map to portal copy exactly as in the reschedule handler: `slot_taken` / `doctor_conflict` / `resource_capacity_reached` ⇒ "That slot is already booked."; every other reason renders `describeReason(reason)` so a closed-day or off-hours request is not mislabelled as a booking conflict.

The dropdown and the submit therefore cannot disagree — they are one engine, evaluated twice.

**Known gap (not part of this change):** the User booking *submit* path is still dropdown-guarded only. `add()` performs no availability check, so a User form left open long enough can write a slot that is taken. Closing this means giving the User submit the same `validateAppointmentRequest()` call Admin booking now has; it is listed in §17.

---

## 12. Frontend-owned responsibilities

Rendering, form/dropdown population, error copy mapped from reason codes, in-memory state, localStorage demo persistence, audit-log entries for the demo, and adapter selection.

## 13. Backend-owned responsibilities

Authoritative hours and blocked periods, the Doctor roster and per-Doctor availability, true service durations, capacity policy, concurrency and race handling, the cut-off, persistence, and audit. The frontend demo must never claim any of these are real (§14).

---

## 14. Expected future backend endpoints (NOT implemented)

```http
GET  /api/scheduling/slots?service_id=&date=&exclude_appointment_id=
GET  /api/scheduling/alternatives?service_id=&date=&time=&limit=
POST /api/scheduling/validate      { service_id, date, time, exclude_appointment_id }
```

These shapes are a **proposal**, not a commitment. The backend must re-validate on commit — the client check is a convenience, never a guarantee.

---

## 15. Adapter cutover plan

Today: `UI → scheduling adapter (VettiData / portal adapter) → SmartScheduling mock`
Later: `UI → same adapter → backend scheduling API → backend service → database`

Cutover is confined to the adapter edge — `VettiData.getAvailableSlots()`, `_slotGuard()`, `_smartSchedulingSlots()`, `_adminSchedulingSlots()` and `_populateAdminRescheduleSlots()`. UI, forms and dropdowns are untouched. Every UI already consumes reason codes rather than engine internals, so the swap is mechanical.

The Admin booking cutover is already complete on the mock side. Its remaining legacy artefact is `_legacyBookedSlotsFromPhp()`; that function is deleted the moment `GET /api/scheduling/slots` exists, and the whole adapter edge then swaps to the API in one pass.

---

## 16. Known temporary mock limitations

- `durationMinutes` is unverified placeholder data; no overlap blocking (correctly, per §9).
- Doctor capacity is 1 because exactly one Doctor is active; no per-Doctor working-hours model.
- Weekday/weekend hours only — no per-date overrides or blackout periods.
- Slot interval is uniform; capacity is per slot, so a long visit does not occupy the following slot.
- Everything is per-browser `localStorage`; no cross-device or shared state.
- Admin booking still carries a **fallback-only** reference to `php_files/get_booked_slots.php` (§2.1). It is unreachable in normal operation and is not authoritative; it is deleted when `GET /api/scheduling/slots` lands.
- Unknown/retired stored services fail closed as Doctor-required.

## 17. Open backend decisions

1. Real per-service durations, and whether overlap blocking becomes real.
2. Whether non-doctor capacity is per service, per shared resource, or per room/equipment.
3. Per-Doctor working hours, breaks and leave, and how capacity scales past one Doctor.
4. Per-date blackout/holiday handling beyond weekday/weekend.
5. Whether a cancelled appointment should free a slot retroactively for history.
6. Authoritative cut-off and concurrency/conflict resolution under simultaneous submits.
7. Whether the User booking submit adopts Admin's engine revalidation (§11) — the recommended answer is yes, at the same seam.
7. Whether `slot_taken` survives as a public code or is retired in favour of the three specific codes.
