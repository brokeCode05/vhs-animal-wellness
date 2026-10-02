# VHS Role / Permission Matrix & Audit Rules

> Roles are exactly **User · Doctor · Admin** (no Clerk, no Clinic Owner, no generic Staff; exactly one Admin account — never creatable from the UI). Admin must never see user passwords (reset is server-issued).
> Server-side enforcement is mandatory: the frontend is not trusted for ownership, transitions, or audit.
> **Signup (frozen, Advisor Revision Sprint 1):** public self-registration creates the **OWNER ACCOUNT ONLY** — no pet, and no medical record. `role` is forced to `User` server-side and any browser-supplied role is ignored.

## 1. Permission matrix

Legend: ✅ allowed · ⛔ denied · 🔒 own-records-only (server-scoped by authenticated identity).

| Capability | User | Doctor | Admin |
|---|---|---|---|
| **Auth / account** | | | |
| Register / login | ✅ (self-registration → **role forced to `User`**, owner account only) | ✅ (provisioned by Admin) | ✅ (single seeded account) |
| Self-register as Doctor / Admin | ⛔ | ⛔ | ⛔ (Admin can never create Admin) |
| Reset own password | ✅ (server-issued) | ✅ | ✅ |
| Unlock / manage account access | ⛔ | ⛔ | ✅ (server-issued; never sees passwords) |
| **Profile & pets** | | | |
| View own profile | 🔒 | 🔒 (doctor profile) | ✅ (any) |
| Edit own profile | 🔒 | ⛔ (Admin edits account fields) | ✅ (any user) |
| Activate/Deactivate user accounts | ⛔ | ⛔ | ✅ |
| List all users | ⛔ | ⛔ | ✅ |
| View own pets | 🔒 | ⛔ (via records) | ✅ |
| Register / edit own pets | 🔒 (after login; owner from session, never a submitted `ownerId`) | ⛔ | ✅ (assisted registration for any owner) |
| **Appointments** | | | |
| Book appointment (self) | 🔒 | ⛔ | ✅ (walk-in/assisted for any client) |
| View appointments | 🔒 (own) | ✅ (assigned/today) | ✅ (all) |
| Check in patient | ⛔ | ⛔ | ✅ |
| Approve / reject (pending intake) | ⛔ | ⛔ | ✅ |
| Reschedule | 🔒 (own, confirmed, outside cutoff) | ⛔ | ✅ (confirmed/pending) |
| Cancel | 🔒 (own, confirmed, outside cutoff) | ⛔ | ✅ (pre-consult) |
| **Clinical workflow** | | | |
| Start consultation (`checked_in → in_consultation`) | ⛔ | ✅ | ⛔ (Admin NEVER completes or starts) |
| Read internal SOAP / EMR | ⛔ | ✅ | ⛔ |
| Write SOAP, prescriptions, lab requests | ⛔ | ✅ | ⛔ |
| Complete consultation | ⛔ | ✅ | ⛔ |
| **Documents** | | | |
| Finalize client-facing documents | ⛔ | ✅ (on completion) | ⛔ |
| View client-facing documents | 🔒 (own) | ✅ | ✅ (operational list/view) |
| View internal SOAP | ⛔ | ✅ | ⛔ |
| **Doctors / services / settings** | | | |
| Manage doctor accounts (create/edit/status) | ⛔ | ⛔ | ✅ |
| Update availability | ⛔ (own via Doctor portal only) | ✅ (own) | ✅ (any doctor, via directory) |
| Manage services catalog | ⛔ | ⛔ | ✅ |
| Manage clinic settings | ⛔ | ⛔ | ✅ |
| View audit log | ⛔ | ⛔ | ✅ (read-only) |
| **Availability visibility** | viewable status only | — | — |

## 2. Audit rules (server-generated, immutable)

Every row is written by the **server inside the same DB transaction as the action**, actor resolved from the authenticated session (never client-supplied). `audit_logs` is INSERT-only. The frontend `AuditLog` is a prototype and is never the authority.

**Audited actions (minimum set — frozen action keys from the frontend prototype):**

| Domain | Actions |
|---|---|
| Security-sensitive | login success/failure, OTP issued/verified (server-side), password reset issued, setup-link activation, account unlock, account status changes (activate/deactivate), role/status changes — **BACKEND DECISION REQUIRED** on final security-event list |
| Appointments | `appointment_created` · `appointment_rescheduled` (metadata: old/new date-time; also writes an authoritative `appointment_events` row) · `appointment_canceled` (metadata: reason) · `appointment_approved` · `appointment_rejected` · `patient_checked_in` · `no_show` marking (Admin-only action — eligibility is determined after the 15-min grace, never auto-marked on elapsed time alone) |
| Consultations | `consultation_started` · `consultation_completed` |
| Doctors | `doctor_availability_changed` (metadata: previous/new) · `doctor_activated` / `doctor_deactivated` · `doctor_created` · `doctor_updated` |
| Users / pets | `user_created` · `user_activated` / `user_deactivated` · `user_updated` · `pet_registered` · `pet_updated` |
| Services | `service_created` · `service_updated` · `service_activated` / `service_deactivated` · `service_deleted` |
| Clinic settings | `clinic_settings_updated` (metadata: changed fields old/new — **BACKEND DECISION REQUIRED** on granularity) |
| Documents | document finalized/released — key follows the frozen `entity_type='document'` extension (**BACKEND DECISION REQUIRED** on exact key) |

**Rules:**
- One event per successful action — exactly once; failed/aborted transactions log nothing (mirror of the frontend hook placement strictly after success).
- `metadata` JSON carries old→new values (e.g. reschedule `{previous_date, previous_time, appointment_date, appointment_time}`; availability `{previous, new}`).
- Appointment-scoped actions carry `reference_no`.
- The audit log endpoint is Admin-only, read-only, filterable (actor type / entity type / date), newest first.
