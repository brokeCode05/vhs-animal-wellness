# Smart Scheduling — audited implementation plan

Work only in D:\Cap\V3\vhs-animal-wellness-repo-v3. No push or deploy.

## Owner choices
- Initial minimum: 10 approved samples (upper end of the requested 7–10); configurable.
- No trusted duration: preserve current booking behavior and label duration unknown.
- Do not train on existing fictional consultations. No extra AI calls.

## Confirmed existing implementation
- Doctor start/resume preserves started_at; completion stores completed_at and elapsed duration_minutes. Appointment/service/veterinarian relationships and one-consultation-per-appointment constraint exist.
- Final completion requires doctor review and clinical revision. Reuse it; no second timer.
- Availability and booking use exact start-slot conflicts, not full interval overlap.
- Booking/rescheduling use the clinic settings row as a serialization gate. Current booking duration is not snapshotted.
- Service duration_minutes is nullable and editable by Admin. 26 active services, only 2 with entered durations (30–45 minutes).
- 6 completed consultations have start/end timestamps; 7 remain active. Existing data is fictional/unapproved for learning.
- Operating hours are separate from latest appointment starts. No per-day doctor roster, scheduled break table or configured buffers currently exists. Do not invent those constraints.
- Vetti already requests backend availability and hands proposals to the booking/OTP form.

## Small, reviewable implementation steps
1. Add explicit non-test/sample approval and scheduling allocation metadata. Preserve existing records as unapproved; keep actual time separate from future estimates.
2. Build a service-specific approved-sample median with visible counts/exclusions and transparent IQR outlier screening; use history only after the configured minimum, otherwise explicit service duration or unknown. Optional Admin buffer values are explicit, never invented.
3. Centralize full-interval evaluation for availability and final booking/rescheduling. Use half-open intervals, peak concurrent non-doctor capacity, existing doctor assignment, operating hours and frozen booking allocations. Unknown durations retain labeled legacy behavior.
4. Return structured duration/end/alternative metadata through existing APIs and Vetti proposal/form paths; keep OTP/authorization/confirmation intact.
5. Run isolated regression, completion-to-history, reschedule/cancel, stale-proposal and concurrency tests; inspect the live UI with fictional data where available. Report any deployment or physical-test limits.

## Sources
- NIST boxplot fences: https://www.itl.nist.gov/div898/handbook/eda/section3/boxplot.htm
- Laravel transaction locking: https://laravel.com/docs/13.x/queries#pessimistic-locking

The existing latest-start setting is not treated as a closing time. Missing operating hours must remain explicit; known closed/open periods are authoritative. Existing global On Duty/Break/Leave status remains the roster rule; no imaginary recurring shifts are added.
