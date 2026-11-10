# VHS automatic no-show reconciliation (Phase 3 corrective patch)

This patch addresses an appointment that is still `confirmed` long after its scheduled time, with no check-in. No changes are made to HTML, CSS, Vetti's UI, or Gemini logic.

## Expected behavior

- `confirmed` + no `checked_in_at` + scheduled time and configured `noshow_grace_minutes` elapsed -> **`no_show`**.
- `checked_in`, `in_consultation`, `completed`, `canceled`, and `pending` remain unchanged. The service also refuses to change a `confirmed` visit with `checked_in_at` populated.
- `no_show` appointments are **removed from Upcoming/Next** by the existing User dashboard/Vetti status filters; they remain in **Past/History** and in the database.
- Automatic changes get both a `System` appointment event and immutable audit-log entry, distinct from human Admin actions.
- The scheduling grace is the existing `clinic_settings.noshow_grace_minutes` (default **15**). No Gemini API use or tokens.

## Installation (local `feature/ai-integration` after Phase 3 patch)

1. Back up your database. Confirm you're on the expected branch and save/commit any unrelated changes separately.
2. Extract this ZIP **at your Laravel project root**; it only adds new PHP files and a route installer, and does not replace existing frontend files.
3. Run once:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\apply_no_show_scheduler.ps1
   ```
4. Run the new migration (required to represent the `System` actor honestly in audit/event enums):
   ```powershell
   php artisan migrate
   php artisan optimize:clear
   php artisan test --filter=AppointmentAutoNoShowTest
   ```
5. Preview how many existing appointments would change before applying it:
   ```powershell
   php artisan vhs:reconcile-no-shows --dry-run
   ```
   Review the count. The first run may include historical test appointments, so back up the database before proceeding. Then mark **already missed** appointments (such as a 9:00 AM booking still confirmed after the grace period):
   ```powershell
   php artisan vhs:reconcile-no-shows
   ```
   To keep it working in local development, **start a second terminal** and leave this running alongside `php artisan serve`:
   ```powershell
   php artisan schedule:work
   ```
6. Refresh the User dashboard (Ctrl+F5) or reload appointments. The record should appear in Past/History marked **No Show**, and Vetti should not display it as the *next* appointment.
7. Before committing, exclude `routes/console.php.no-show.bak`, `.env`, and other existing backup files.

## Deployed systems

`php artisan serve` does **not** run Laravel's scheduler. In production configure the deployment scheduler/cron to execute `php artisan schedule:run` every minute. The worker can be offline while the UI is accessed: during this time records may remain `confirmed` until the scheduler runs. Monitor the scheduler health. Do not run one-off reconciliation on a real clinic database without reviewing the operational policy and appointment data first.

## Technical notes

- The migration expands `appointment_events.actor_type` and `audit_logs.actor_type` to include `System`. It does not change any current User/Admin/Doctor actor values. A rollback refuses to shrink these enums while System records exist, to preserve audit history.
- Each status transition is protected with a row lock, eligibility recheck, and DB transaction. Re-running the command is safe/idempotent.
- Admin manual `no_show` behavior, capacity rules, and existing workflows remain unchanged.
- The patch does **not** delete records or change frontend content, cards, styles, or JS. The existing filters already exclude `no_show` from Upcoming, but the browser must refresh its backend data to see the status change.

## QA checklist

- One past confirmed un-checked-in appointment becomes no-show after grace.
- Future confirmed visit stays confirmed.
- A checked-in patient never becomes no-show.
- A completed consultation never becomes no-show.
- Re-running reconciliation does not create duplicate event/audit entries.
- User Past/History retains the missed appointment; Vetti next-visit ignores it.
