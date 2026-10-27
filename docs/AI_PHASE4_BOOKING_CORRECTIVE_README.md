# VHS AI Phase 4 — Booking Prefill and Ambiguity Corrective Patch

**Baseline:** Phase 4 patch already installed locally on `feature/ai-integration`, based on the last pushed `f72f43a` checkpoint. This ZIP is a correction **on top of Phase 4**, not a replacement for Phases 1–3. Nothing in this ZIP is pushed to GitHub.

## What the screenshot testing revealed

1. The client service matcher returned a **numeric service ID** (`22`) where the Laravel-integrated booking wizard's `<select>` expects the **canonical service value** (`cat_grooming`). This left the service blank.
2. The catalog includes **Dog Grooming** and **Cat Grooming**. The fix may narrow an otherwise ambiguous grooming hint using the locally selected, authenticated pet species (Bornok: Cat), but only when exactly one appropriate active service remains. Pet names/species are **not sent to Gemini**.
3. The old deterministic extractor could match `Vaccination` even when a sentence mentioned **both Grooming and Vaccination**. The backend now returns `service_ambiguous: true`, which vetoes any local preselection; a local dual-service guard does the same even if the API fails.
4. Exact time preselection was consumed by an asynchronous slot refresh **before the service was chosen**. The fix defers consuming the requested time until a service is selected and the **actual returned slots** have been loaded. It never invents unavailable slots.
5. Tomorrow/local date formatting uses the browser's local calendar day instead of `toISOString()` UTC, avoiding a date shift near midnight in Philippine time.

## Included files (8)

- `app/Services/AI/BookingIntentService.php` — ambiguity veto field
- `public/user/vetti-ai.js` — canonical service values, cat/dog catalog filtering, ambiguity guard
- `public/user/vetti-state.js` — local date selection
- `public/user/user-script.js` — booking dropdown prefill and asynchronous availability correction
- `tests/Feature/AI/BookingIntentTest.php` — 3 new regression tests
- `tools/test_phase4_booking.cjs` — updated original Phase 4 test expectations
- `tools/test_phase4_booking_correction.cjs` — integrated booking handoff / time availability test
- `docs/AI_PHASE4_BOOKING_CORRECTIVE_README.md` — this file

No changes to User/Doctor/Admin HTML or CSS, OTP, appointment writes, doctor workflow, database/migrations, routes, `.env`, or provider credentials.

## Apply to your LOCAL Windows Laravel checkout

1. Stay on `feature/ai-integration`; leave other branches alone. Run `git status --short` to examine current edits (the earlier Phase 4 files will be modified/untracked). **If you edited these exact four runtime files yourself after applying Phase 4, compare before overwriting.**
2. Back up the four runtime files in your own project root (PowerShell):

   ```powershell
   Copy-Item .\public\user\vetti-ai.js .\public\user\vetti-ai.before-phase4fix.bak
   Copy-Item .\public\user\vetti-state.js .\public\user\vetti-state.before-phase4fix.bak
   Copy-Item .\public\user\user-script.js .\public\user\user-script.before-phase4fix.bak
   Copy-Item .\app\Services\AI\BookingIntentService.php .\app\Services\AI\BookingIntentService.before-phase4fix.bak
   ```

3. Extract `VHS_AI_Phase4_Booking_Corrective_Hotfix.zip` **into the existing Laravel project root** (adjust the location of the downloaded ZIP):

   ```powershell
   Expand-Archive -LiteralPath "D:\Cap\Git push\VHS_AI_Phase4_Booking_Corrective_Hotfix.zip" -DestinationPath (Get-Location).Path -Force
   php artisan optimize:clear
   ```

4. Run test commands individually:

   ```powershell
   php artisan test --filter=BookingIntentTest
   php artisan test --filter=UserVettiTest
   node .\tools\test_phase4_booking.cjs
   node .\tools\test_phase4_booking_correction.cjs
   ```

   Node tests passed before packaging (both), PHP files passed syntax checks. The new PHP service's four core paths passed isolated smoke testing. **Full Laravel tests must run on your Windows checkout**; do not claim deployment readiness before they pass.

5. Keep `php artisan serve --host=127.0.0.1 --port=8010` running. Go to `http://127.0.0.1:8010/user/index.html` and hard-refresh using **Ctrl + Shift + R**.

## Browser checks (don't confirm a real booking)

| Prompt | Step 1 expected | Step 2 expected |
|---|---|---|
| `Book Bornok for grooming tomorrow at 3:00 PM` | Bornok (Cat); **Cat Grooming** when unique/active | Tomorrow prefilled. **3:00 PM** selected only if Laravel returned it for Cat Grooming + tomorrow; otherwise user selects an offered time |
| `Book Bornok to get washed tomorrow` | Bornok; Cat Grooming if Gemini safely classifies `wash` as grooming and the service is active; if AI disabled, service remains manual | Tomorrow prefilled; time manual (none requested) |
| `Book grooming and vaccination tomorrow` | **Choose a service** (never auto-select Vaccination) | Tomorrow prefilled; time remains manual until a service is chosen |
| Simulate AI request network outage | Original wizard remains functional | Never displays a fabricated available slot |

**Time of day ≠ exact time.** “Tomorrow afternoon” does not authorize Vetti to guess 3:00 PM. The owner must pick from Laravel's offered times unless an exact requested time is present and offered.

In DevTools → Network, verify actual **POST** `/api/ai/booking-intent` Response contains `data.service_ambiguous` `true` for the third prompt, and on Step 2 inspect the **GET** `/api/availability` response's `display_slots`. Do not put `.env` or API keys in screenshots.

## Known scope and rollback

- Provider key remains server-only; pet identity and species filtering happens in the browser; raw text is passed to the authenticated Laravel endpoint, **not** to Gemini. PHP produces fixed provider-safe cues.
- No booking is created by Vetti; OTP and final confirmation remain unchanged.
- This hotfix changes only the shown behavior. Do not push/commit until the PHP tests and live browser flow are confirmed.
- Rollback: restore the `.before-phase4fix.bak` versions of the four runtime files; restore the previous `BookingIntentTest.php`/`test_phase4_booking.cjs` if needed; run `php artisan optimize:clear` and hard-refresh.
