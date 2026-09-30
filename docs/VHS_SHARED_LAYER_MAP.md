# VHS Shared Layer Map — Dependency & Backend Migration Audit

> Audit of every file in `/shared`: what it does, who consumes it, why it exists, and what happens to it during backend integration.
> Method: real `<script src>` / `<link href>` traces across all HTML pages, cross-file `window.*` references, portal-script call sites, and inline `onclick` handlers — not filename guessing.
> **No files were changed, moved, or deleted by this audit.** The frontend is FROZEN; findings that suggest deletion are reported here for a separate decision.
> **Update (cleanup/shared-layer-clarity):** the dead `admin/audit-log.html` document-store/render script tags were removed and stale Clerk-era comments were cleaned (comments only — no logic); the public-pages finding in §7 was corrected. See §7.
> Companion docs: [BACKEND_START_HERE.md](BACKEND_START_HERE.md) §9 (Shared Frontend Layer) · [VHS_FRONTEND_BACKEND_WIRING.md](VHS_FRONTEND_BACKEND_WIRING.md) (per-domain API chains) · [VHS_LARAVEL_MAP.md](VHS_LARAVEL_MAP.md) §4 (store replacement/deletion list).

---

## 1. Master inventory table

| File | Purpose | Category | Consumers | Key globals / functions | Runtime dependency | Backend replacement | Final fate | Safe deletion condition |
|---|---|---|---|---|---|---|---|---|
| `appointment-contract.js` | Canonical appointment model; status normalization; snake_case wire mappers; time utils | B — DOMAIN CONTRACT | 7 admin pages, doctor, user (10 pages); `dashboard-shared.js`, `mock-appointments.js`, all 3 portal scripts | `window.AppointmentContract` (`normalizeStatus`, `fromLegacy`, `toLegacy`, `toLegacyDisplay`, `timeToHHMM`, `timeTo12h`) | Required at runtime | None — becomes the DTO/adapter layer over API JSON | **KEEP AFTER BACKEND** | N/A — permanent frontend responsibility |
| `audit-store.js` | Prototype append-only audit trail (ls `vhs_audit_log_v1`) + demo Admin actor | C — MOCK STORE | 7 admin pages, doctor, user (10 pages); all 3 portal scripts call `AuditLog.add`; `admin/audit-log-renderer.js` reads | `window.AuditLog` (`add`, `getAll`, `forEntity`, `clearDemoData`, `adminActor`); `ADMIN_ACTOR` | Required (demo only) | Server-generated `audit_logs` (same transaction as each action) + `GET /api/audit-logs` | **REPLACE THEN DELETE** | §2.2 conditions |
| `clinic-settings.js` | Global clinic config store + slot-grid generation (ls `vhs_mock_clinic_settings_v1`) | C — MOCK STORE (adapter-shaped) | 7 admin pages, user (8 pages); `admin-portal.js`, `user-script.js`; consumed in code by `vhs-ui.js` `getVHSTimeSlots()` | `window.VHSClinicSettings` (`get`, `update`, `reset`, `slotsFor`, `effectiveHoursFor`, …) | Required at runtime | `GET/PATCH /api/clinic-settings` + `GET /api/availability` | **REPLACE THEN DELETE** | §2.6 conditions |
| `dashboard-icons.css` | SVG icon system for dashboard sidebars/buttons | A — SHARED UI | 7 admin pages, doctor, 4 clerk redirect stubs (12 pages) | CSS classes only | Required at runtime | None | **KEEP AFTER BACKEND** | N/A |
| `dashboard-shared.js` | Dashboard UI framework: sidebar, modals, tables, filters, custom dropdowns, calendar, details modal + appointment action helpers | A — SHARED UI (with domain helpers mixed in) | 7 admin pages; `admin-portal.js` (`initDashboardShared()`); admin HTML inline onclick (`approveAppointment`, `checkInAppointment`, `closeAppointmentDetails`, …). **User/Doctor have local copies — do not load it** | ~40 plain globals: `initDashboardShared`, `toggleSidebar`, `initLogout`, `loadAppointments`, `renderTodaysScheduleTable`, `statusBadge`, `formatDateTime`, `approveAppointment`, `rejectAppointment`, `markComplete`, `cancelAppointment`, `openAppointmentDetails`, `renderAppointmentDetailsActions`, `initCustomDropdown`, `setupSearch/Filters/Tabs/Modals`, `autoLabelTables`, `initAllCustomDropdowns` | Required (Admin) | UI helpers stay; appointment pulls switch to the API via the contract adapter | **KEEP BUT REWIRE** | Rewire condition §2.5 |
| `dashboard-theme.css` | Shared design system for all dashboard portals | A — SHARED UI | 7 admin pages, doctor, user, 4 clerk redirect stubs (14 pages) | CSS only | Required at runtime | None | **KEEP AFTER BACKEND** | N/A |
| `document-render.js` | Print-style renderer for finalized client-facing documents | E — RENDERER | `admin/documents.html`, user page; called by `admin/documents-page.js`, `user-script.js` | `window.SharedDocumentRender.render(doc, clinicInfo?)` | Required | None short-term (frontend print view); a future server-side PDF would retire it (open decision) | **KEEP AFTER BACKEND** (review if server PDF is chosen) | N/A |
| `document-store.js` | Finalized client-facing documents store (ls `vhs_documents_v1`) | C — MOCK STORE | `admin/documents.html` + `documents-page.js`, user page + `user-script.js` (My Documents), doctor page + `doctor.js` (completion fan-out) | `window.SharedDocuments` (`getAll`, `forUser`, `forPet`, `forAppointment`, `byId`, `add`, `finalizeFromConsultation`, `clearDemoData`) | Required (demo only) | Documents API; server fan-out inside the completion transaction | **REPLACE THEN DELETE** | §2.4 conditions |
| `mock-appointments.js` | Canonical appointments store + guarded lifecycle transitions + slot availability (ls `vhs_mock_appointments_added_v1`, ss `vhs_mock_checkin_overrides_v1`) | C — MOCK STORE | 5 admin pages, user, doctor (8 pages); `dashboard-shared.js`; all 3 portal scripts | `window.SharedMockAppointments` (`getAll`, `byId`, `byReference`, `add`, `reschedule`, `cancel`, `setStatus`, `checkIn`, `takenSlots`, `isSlotAvailable`, `clearDemoData`, …) | Required (demo only) | Appointment API + Availability API (`AppointmentService` guards) | **REPLACE THEN DELETE** | §2.1 conditions |
| `mock-doctors.js` | Doctor records + account/availability status + portal identity seed (ls `vhs_mock_doctors_v1`) | C — MOCK STORE | `admin/accounts.html`, `admin/doctors.html` + `admin-portal.js`; doctor page + `doctor.js` (identity) | `window.SharedMockDoctors` (`getAll`, `byId`, `addDoctor`, `updateDoctor`, `setAccountStatus`, `setAvailability`, `currentDoctor`, `clearDemoData`) | Required (demo only) | Doctors API + `GET /api/auth/me` (portal identity) | **REPLACE THEN DELETE** | §2.3 conditions |
| `mock-users.js` | Users + Pets + **Service catalog** stores (ls `vhs_mock_users_pets_v1`, `vhs_mock_services_v1`) | C — MOCK STORE | 5 admin pages, user page, 2 public pages via `web-page/website-services.js`; `dashboard-shared.js`; `admin-portal.js`, `user-script.js` | `window.SharedMockUsers` (`users/pets/services` + `add*/update*/set*Status/deleteService`, `activeServices`, `serviceLabel`, `serviceValue`, `serviceInUse`, …) | Required (demo only) | Users API + Pets API + Services API | **REPLACE THEN DELETE** | §2.7 conditions |
| `vhs-ui.css` | Shared modals/toasts/booking-wizard visual language | A — SHARED UI | 7 admin pages, user, 4 public pages (13 pages) | CSS only | Required at runtime | None | **KEEP AFTER BACKEND** | N/A |
| `vhs-ui.js` | Shared interaction layer: toasts, confirm/prompt/alert modals, booking slot constant + slot filler, "under work" stub | A — SHARED UI | 7 admin pages, user, 4 public pages; `admin-portal.js` (67 call sites), `user-script.js` (47). **Doctor does not use it** | `VHS_TIME_SLOTS`, `VHS_CLINIC_HOURS`, `VHS_HOURS`, `getVHSTimeSlots()`, `showToast()`, `confirmAction()`, `showPrompt()`, `showAlert()`, `showUnderWork()` | Required at runtime | UI helpers stay; `getVHSTimeSlots` switches to the availability API | **KEEP BUT REWIRE** | Rewire condition §2.8 |

**Shared→shared dependencies:** `mock-appointments.js` → `appointment-contract.js` · `dashboard-shared.js` → `appointment-contract.js`, `SharedMockAppointments`, `SharedMockUsers`, `vhs-ui.js` · `vhs-ui.js` → `VHSClinicSettings` (inside `getVHSTimeSlots`) · `document-render.js` → `VHSClinicSettings` (letterhead fallback). Nothing else is coupled.

---

## 2. Per-file detail + safe-deletion conditions

### 2.1 `shared/mock-appointments.js` — REPLACE THEN DELETE
- **Current consumers:** User booking wizard + My Appointments (`user/user-script.js`); Admin Appointments + Dashboard + walk-in booking + check-in lookup (`admin/admin-portal.js`, `admin/index.html`, `admin/appointments.html`); Doctor queue (`doctor/doctor.js`); `dashboard-shared.js` helpers (`loadAppointments`, `renderTodaysScheduleTable`, `_findCanonicalAppointment`).
- **Backend replacement:** Appointment API (`POST/PATCH /api/appointments…`, `AppointmentService` lifecycle guards) + Availability API (`GET /api/availability`).
- **Safe to delete ONLY AFTER:**
  1. all consumers use the backend API/service adapter (booking, reschedule, cancel, check-in, status transitions, lists, reference lookup);
  2. no HTML page loads the file (`<script src="…/mock-appointments.js">` removed from all 8 pages);
  3. no script references `SharedMockAppointments` (portal scripts, `dashboard-shared.js`, page inline code);
  4. reschedule/cancel/check-in lifecycle passes cross-portal QA against the API (same appointmentId/referenceNo, slot freed/occupied, guard table enforced server-side);
  5. `localStorage` fallback (`vhs_mock_appointments_added_v1`) and check-in overrides (`vhs_mock_checkin_overrides_v1`) are intentionally retired (data migration/one-time export decision made);
  6. availability + slot concurrency verified server-authoritative (double-booking race test: one 201, one 409).

### 2.2 `shared/audit-store.js` — REPLACE THEN DELETE
- **Current consumers:** every recording surface calls `AuditLog.add(...)` (`admin-portal.js`, `user-script.js`, `doctor/doctor.js`); `admin/audit-log.html` + `admin/audit-log-renderer.js` render it; `shared/audit-store.js` also provides the demo Admin actor (`ADMIN_ACTOR`) used across Admin actions.
- **Backend replacement:** server-generated `audit_logs` rows written inside each action transaction; Admin reads `GET /api/audit-logs`.
- **Safe to delete ONLY AFTER:**
  1. every audited action is written server-side (exactly once per successful action, same transaction);
  2. Admin Audit Log page reads `GET /api/audit-logs` (actor/category/date filters, newest first);
  3. `AuditLog.add` call sites are removed from all three portal scripts (this is cutover step 12 — deliberately last);
  4. the demo Admin actor is replaced by the authenticated session identity;
  5. `localStorage vhs_audit_log_v1` is intentionally retired (demo history is disposable).

### 2.3 `shared/mock-doctors.js` — REPLACE THEN DELETE
- **Current consumers:** Admin Accounts + Admin Doctors (`admin-portal.js`); Doctor portal identity (`doctor.js` → `SharedMockDoctors.currentDoctor()`, seed `vet-001 / Dr. Santos`).
- **Backend replacement:** `/api/doctors` group + `GET /api/auth/me` for identity; `assigned_vet_id` workflow per final decisions.
- **Safe to delete ONLY AFTER:**
  1. Admin doctor CRUD/status/availability endpoints are live and audited old→new;
  2. Doctor portal identity resolves from `/api/auth/me` (no `currentDoctor()` seed);
  3. no HTML page loads the file (`admin/accounts.html`, `admin/doctors.html`, `doctor/index.html` tags removed);
  4. no script references `SharedMockDoctors`;
  5. `localStorage vhs_mock_doctors_v1` retired.

### 2.4 `shared/document-store.js` — REPLACE THEN DELETE
- **Current consumers:** Doctor completion fan-out (`doctor.js` L591 `finalizeFromConsultation`), Admin Documents (`admin/documents-page.js`), User My Documents (`user-script.js` `_renderUserDocuments`).
- **Backend replacement:** Documents API; documents are created server-side in the completion transaction (`DocumentService` twin of `finalizeFromConsultation`).
- **Safe to delete ONLY AFTER:**
  1. completion fans out documents server-side (summary always; prescription/lab request only when ordered);
  2. User My Documents reads `GET /api/documents?user_id=me` (server-scoped, ownership re-checked);
  3. Admin Documents reads `GET /api/documents`;
  4. no HTML page loads the file (remove tags from `admin/documents.html`, `user/index.html`, `doctor/index.html`);
  5. no script references `SharedDocuments`;
  6. `localStorage vhs_documents_v1` retired (demo docs disposable).

### 2.5 `shared/dashboard-shared.js` — KEEP BUT REWIRE (not deleted)
- **Why kept:** it is the Admin UI framework (sidebar, modals, custom dropdowns, tables, filters, details modal). UI behavior is a permanent frontend responsibility.
- **What gets rewired:** its appointment-pulling helpers (`loadAppointments`, `renderTodaysScheduleTable`, `_findCanonicalAppointment`, owner/pet profile lookups) switch from `SharedMockAppointments`/`SharedMockUsers` to the API-backed adapter while returning the same display shapes. `statusBadge`/lifecycle-gated action buttons keep consulting `AppointmentContract`.
- **Rewire is complete when:** no `window.SharedMock*` reference remains in the file, and Admin dashboard/appointments render API data through the contract adapter.

### 2.6 `shared/clinic-settings.js` — REPLACE THEN DELETE
- **Current consumers:** booking slot grids (`vhs-ui.js` `getVHSTimeSlots`, `user-script.js`, `admin-portal.js`), Admin Clinic Settings form, cutoff checks in booking/reschedule/cancel, document letterhead fallback (`document-render.js`). (No public page loads this file — see §7 correction.)
- **Backend replacement:** `GET/PATCH /api/clinic-settings` + `GET /api/availability` (server computes slots).
- **Safe to delete ONLY AFTER:**
  1. slot pickers consume `GET /api/availability` (server-authoritative slots);
  2. Admin Clinic Settings form reads/writes the API (update audited server-side);
  3. reschedule/cancel cutoff enforcement is server-side (client checks are convenience only);
  4. document rendering receives clinic info from API data (letterhead no longer falls back to the store);
  5. no HTML page loads the file (13 tags);
  6. no script references `VHSClinicSettings`;
  7. `localStorage vhs_mock_clinic_settings_v1` retired.

### 2.7 `shared/mock-users.js` — REPLACE THEN DELETE
- **Current consumers:** Admin Clients & Pets / Accounts-user-create / Services (`admin-portal.js`), User profile + My Pets + booking owner/pet/service selection (`user-script.js`), `dashboard-shared.js` (`SharedMockUsers.serviceLabel/activeServices`), public site catalog sync (`web-page/website-services.js` on `index.html` + `services.html`).
- **Backend replacement:** `/api/users`, `/api/pets` (+ `/api/users/:id/pets`), `/api/services`.
- **Safe to delete ONLY AFTER:**
  1. Users + Pets cutover done (Admin directory/CRUD + User own-profile/pets on API, ownership server-scoped);
  2. Services cutover done — **including the public site** (`website-services.js` consumes the Services API; static markup stays the SEO fallback);
  3. booking validates owner↔pet server-side (`owner_not_found` semantics);
  4. no HTML page loads the file (7 tags);
  5. no script references `SharedMockUsers` (portals, `dashboard-shared.js`, `website-services.js`);
  6. `vhs_mock_users_pets_v1` + `vhs_mock_services_v1` retired.

### 2.8 `shared/vhs-ui.js` — KEEP BUT REWIRE (not deleted)
- **Why kept:** toasts, confirm/prompt/alert modals, "under work" stub are pure presentation used by Admin + User + public pages.
- **What gets rewired:** `getVHSTimeSlots()` currently fills `VHS_TIME_SLOTS` with `VHSClinicSettings.slotsFor(date)` — after the availability cutover it must consume `GET /api/availability`. `VHS_TIME_SLOTS`/`VHS_CLINIC_HOURS`/`VHS_HOURS` are legacy constants kept only as fallbacks.
- **Rewire is complete when:** no `VHSClinicSettings` reference remains in the file.

---

## 3. Flow diagrams (current → future)

```
User / Admin / Doctor
        ↓
SharedMockAppointments        (shared/mock-appointments.js, guarded transitions)
        ↓
Future Appointment API  →  AppointmentController → AppointmentService → appointments
(Future Availability API →  AvailabilityController → AvailabilityService)
```

```
Admin / Doctor / User
        ↓
SharedDocuments               (shared/document-store.js)
        ↓
Future Documents API    →  DocumentController → DocumentService → documents
(doctor completion fan-out moves server-side into the completion transaction)
```

```
Admin / Doctor / User (prototype audit)
        ↓
window.AuditLog               (shared/audit-store.js)
        ↓
(no write endpoint — server generates audit_logs rows inside each action transaction)
        ↓
GET /api/audit-logs     →  AuditLogController → AuditLog model → audit_logs
```

```
Public site / User / Admin (catalog)
        ↓
SharedMockUsers.services()    (shared/mock-users.js; public via web-page/website-services.js)
        ↓
Future Services API     →  ServiceController → ServiceService → services
```

```
User / Doctor / Admin (identity — demo today)
        ↓
sessionStorage vhs_user · ADMIN_ACTOR · SharedMockDoctors.currentDoctor()
        ↓
GET /api/auth/me        →  AuthController → users (+ role middleware)
```

---

## 4. Architecture question — does `/shared` mix too many responsibilities?

**Yes.** The 13 files currently carry five distinct concerns:

| Concern | Files |
|---|---|
| UI / theme | `dashboard-theme.css`, `dashboard-icons.css`, `vhs-ui.css`, `vhs-ui.js` |
| Shared UI logic | `dashboard-shared.js` (plus domain helpers: appointment pulls, status badges, details modal actions) |
| Domain contract | `appointment-contract.js` |
| Mock data / persistence | `mock-appointments.js`, `mock-users.js`, `mock-doctors.js`, `clinic-settings.js`, `audit-store.js`, `document-store.js` (6 of 13 files, ~8 storage keys) |
| Rendering utilities | `document-render.js` |

**Why it happened:** `/shared` began as the Admin/Clerk look-and-feel layer; the cross-portal demo then needed every portal to read the *same* data, so all mock stores landed here too. That was correct for the demo (one canonical dataset) but leaves UI and persistence in one folder.

**Is restructuring justified? Partially.** The high-value split is conceptual, not physical: the mock stores are the deletion list, and once they are gone the folder is mostly clean UI + one contract + one renderer. Two recommendations, in order:

1. **Minimal path (recommended):** do NOT reorganize; execute the REPLACE THEN DELETE conditions in §2. After cutover, `/shared` naturally reduces to `appointment-contract.js`, `document-render.js`, `dashboard-shared.js`, `vhs-ui.js` and the three CSS files — a coherent "UI + contract" layer with no restructuring cost.
2. **Optional future shape** (only if the team wants explicit separation after backend integration; do NOT force now — frontend is frozen):

```
shared/
  ui/          dashboard-theme.css, dashboard-icons.css, vhs-ui.css, vhs-ui.js, dashboard-shared.js
  domain/      appointment-contract.js
  services/    per-domain API adapters (appointment-service.js, user-service.js, …)
               — the REPLACE THEN DELETE stores' public surfaces, backed by the API
  renderers/   document-render.js
```

The `services/` folder is the useful part of that sketch: the mock stores' method surfaces (`SharedMockAppointments.add/reschedule/...`) are exactly the seams where adapters should call the API, per [VHS_FRONTEND_BACKEND_WIRING.md](VHS_FRONTEND_BACKEND_WIRING.md).

---

## 5. Special review — shared UI history (Clerk legacy)

`/shared` originally existed because Admin and Clerk portals intentionally shared one UI. Findings after Clerk's retirement:

- **Genuinely shared UI (still multi-portal):** `dashboard-theme.css` (Admin + User + Doctor), `dashboard-icons.css` (Admin + Doctor), `vhs-ui.css`/`vhs-ui.js` (Admin + User + public site), `appointment-contract.js` (User + Admin + Doctor). **Clerk retirement does NOT obsolete any of these.**
- **Shared UI that is now Admin-only in practice:** `dashboard-shared.js` — loaded by the 7 Admin pages only; `user-script.js` and `doctor.js` keep local copies of overlapping helpers (sidebar toggle, logout, dropdowns, labels). It survives because Admin uses it, not because of Clerk.
- **Clerk-only remnants:** the 4 `clerk/*.html` redirect stubs still load `dashboard-theme.css` so the 800ms "redirecting" notice is styled. That is the only remaining Clerk-era consumption of shared UI, and it is compatibility-only (see §7).
- **Clerk-era abstraction now unnecessary:** none at file level. Inside files, the *header comments* still say "Used by: admin, clerk, user" (`vhs-ui.js`, `vhs-ui.css`, `dashboard-theme.css`, `dashboard-icons.css`, `mock-appointments.js`, `mock-users.js`) — comments are stale, code is not. No code path exists solely for Clerk.

---

## 6. Misleading filenames (report only — no renames now)

| Current name | Actual responsibility | Recommended future name (only if restructuring) |
|---|---|---|
| `mock-users.js` | Users **+ Pets + the entire 26-service catalog** (3 domains, 2 storage keys) | `mock-directory.js` or split `mock-users.js` / `mock-services.js` under `services/` adapters at cutover |
| `mock-doctors.js` | Doctor records **+ account/availability status + the Doctor portal demo identity** (`currentDoctor()`) | `mock-doctors.js` (name is fair) — but identity moves to `/api/auth/me`, leaving pure directory data |
| `audit-store.js` | Audit prototype **+ the demo Admin actor** (`ADMIN_ACTOR`) used for all Admin-side actions | (none needed; note the actor role in the header comment) |
| `dashboard-shared.js` | "Admin/Clerk dashboards" per its header — **Admin-only since Clerk retirement** | `admin-dashboard-shared.js` |
| `vhs-ui.js` | UI helpers **+ legacy slot constants** (`VHS_TIME_SLOTS`, `VHS_HOURS`, `VHS_CLINIC_HOURS`) superseded by `clinic-settings.js` | `vhs-ui.js` (drop the dead constants at cutover) |

Stale *comments* (not names): several headers still list "Clerk" as a consumer (see §5).

---

## 7. Unused / dead findings (report only — DO NOT delete in this task)

1. **Dead script tags in `admin/audit-log.html` — REMOVED in cleanup/shared-layer-clarity:** `shared/document-store.js` and `shared/document-render.js` were loaded but never referenced by the page or `admin/audit-log-renderer.js`; both tags were removed and the page verified.
2. **`clerk/*.html` load `dashboard-theme.css`** solely to style the redirect notice for ~800ms before `window.location.replace()` fires. Intentional compatibility cost; revisit only if the stubs are ever redesigned.
3. **Public pages and `clinic-settings.js` (audit correction):** an earlier revision of this map stated the four public pages load `shared/clinic-settings.js` with no consumer. Verified against the repository: **no public page loads `clinic-settings.js`** — their shared tags are `vhs-ui.js` and, on `index.html`/`services.html`, `mock-users.js` (consumed by `web-page/website-services.js`). Nothing to remove; the master-table consumer counts were corrected.
4. **`user/index.html` pins `vhs-ui.css?v=2.6.0`** while other pages pin `?v=1787393620` — both resolve to the same file; only cache-busting differs. Not a defect.
5. **No orphan files:** every file in `/shared` has at least one real runtime consumer. **DELETE NOW CANDIDATES: none. REVIEW REQUIRED: none.**

---

## 8. Summary counts

| Measure | Count | Files |
|---|---|---|
| Total `/shared` files | **13** | — |
| Category A — SHARED UI | **5** | `dashboard-theme.css`, `dashboard-icons.css`, `vhs-ui.css`, `vhs-ui.js`, `dashboard-shared.js` |
| Category B — DOMAIN CONTRACT | **1** | `appointment-contract.js` |
| Category C — MOCK STORE | **6** | `mock-appointments.js`, `mock-users.js`, `mock-doctors.js`, `clinic-settings.js`, `audit-store.js`, `document-store.js` |
| Category D — ADAPTER candidates | **0 pure** (2 adapter-shaped surfaces) | `clinic-settings.js` (get/update API-shaped), `appointment-contract.js` (mapper layer) |
| Category E — RENDERER | **1** | `document-render.js` |
| Category F — LEGACY / UNCLEAR | **0** | — |
| KEEP AFTER BACKEND | **6** | 3 CSS + `appointment-contract.js` + `document-render.js` (+ `dashboard-shared.js` as KEEP BUT REWIRE below counts separately) |
| KEEP BUT REWIRE | **2** | `vhs-ui.js`, `dashboard-shared.js` |
| REPLACE THEN DELETE | **6** | `mock-appointments.js`, `mock-users.js`, `mock-doctors.js`, `clinic-settings.js`, `audit-store.js`, `document-store.js` |
| DELETE NOW CANDIDATE | **0** | (the 2 dead script tags reported in §7 were removed by cleanup/shared-layer-clarity) |
| REVIEW REQUIRED | **0** | — |

*Net expectation: after backend cutover `/shared` shrinks from 13 files to ~7 (6 KEEP/REWIRE, with `vhs-ui.js` and `dashboard-shared.js` rewired internally), and 6 mock/store files disappear per the §2 conditions.*
