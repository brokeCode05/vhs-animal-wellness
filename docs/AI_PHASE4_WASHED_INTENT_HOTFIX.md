# VHS Phase 4 — "get washed" service inference hotfix

## Baseline
Apply on top of the **Phase 4 Booking Corrective Hotfix**, NOT on the original `f72f43a` checkout by itself. Local branch `feature/ai-integration`. ZIP contains just two complete PHP files plus this README. Does not alter any JavaScript, HTML, CSS, schemas, routes, appointments, migrations, or Git history.

## What changed
- A specific nonclinical `get washed` / `wash` / `washing` booking cue is resolved as a **grooming category** by deterministic server rules **when unambiguous**. Gemini may corroborate it, but cannot erase it by abstaining or failing.
- Gemini continues to receive **fixed sanitized cue tags only**, not the raw owner text, Bornok, appointment details or private data.
- Multiple service intent (`wash and vaccination`, `grooming and vaccination`) is still **ambiguous**, so the service selector stays blank.
- Emergency/clinical text prevents the shortcut. No appointment is created, no time slot is fabricated.
- The **existing browser handoff** still resolves the grooming category against the active clinic services and Bornok's species. It may select **Cat Grooming** only if exactly one active cat grooming service matches. The frontend's previously verified tomorrow-date and available-slot handling is untouched.

## Apply locally (PowerShell)

```powershell
# From the Laravel repository root, inspect changes before replacement:
git status --short

# Backup (do not commit .bak files):
Copy-Item .\app\Services\AI\BookingIntentService.php .\app\Services\AI\BookingIntentService.before-wash-fix.bak
Copy-Item .\tests\Feature\AI\BookingIntentTest.php .\tests\Feature\AI\BookingIntentTest.before-wash-fix.bak

# Adjust ZIP location if saved somewhere else:
Expand-Archive -LiteralPath "D:\Cap\Git push\VHS_AI_Phase4_Washed_Intent_Hotfix.zip" -DestinationPath (Get-Location).Path -Force
php artisan optimize:clear

php artisan test --filter=BookingIntentTest
php artisan test --filter=UserVettiTest
node .\tools\test_phase4_booking.cjs
node .\tools\test_phase4_booking_correction.cjs
```

Reopen User Dashboard / hard refresh, ask **"Book Bornok to get washed tomorrow"**. Step 1 should preselect **Bornok + Cat Grooming** when that service remains active. Step 2 should prefill **tomorrow**, but **leave time blank** since no exact time was requested. A request for **grooming and vaccination** must still ask to choose a service.

Run tests and browser checks before committing. No GitHub push is part of this patch. Roll back the two PHP files from `.before-wash-fix.bak` if needed.
