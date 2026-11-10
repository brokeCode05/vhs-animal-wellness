# VHS AI — Phase 4 Controlled AI-Assisted Booking (local patch)

**Apply only to:** `feature/ai-integration` at **`f72f43a`** (October 21, 2026). The ZIP contains complete updated copies of 3 files from that precise branch plus new files. **Do not extract over another branch, or over locally modified tracked files.**

## What it does

- Vetti's **existing** `openBooking` action and wizard stay in place. The local deterministic resolver still owns exact pet identity, date, service and exact-time matches.
- New authenticated, User-only **POST `/api/ai/booking-intent`** can return optional `service_hint` and `time_preference` only. It creates **no booking**, touches no appointments, and supplies **no date, pet ID, time slot, price, clinical recommendation or arbitrary action**.
- For Gemini, the backend converts owner wording into **fixed, non-identifying cues** (e.g. `service_cues=grooming; time_cues=afternoon`). It never forwards the original user message, pet name, owner name, phone, date, clinical details or conversation history. The raw message is transmitted **only to the same-origin Laravel app** so it can sanitize it there. A specific medical/sensitive phrase guard also disables the provider for that request.
- With Gemini enabled, safe **advisory** wording such as `wash him after lunch` can be interpreted as grooming/afternoon, but only within server-approved hints. The model response must match its JSON schema and PHP allowlist. Otherwise the deterministic hints win.
- Frontend preselects a suggested service **only when exactly one ACTIVE catalog service matches**. Competing Grooming entries, inactive services, or unknown names leave the choice blank. No specific slot is invented; `morning` / `afternoon` / `evening` are preferences only.
- Original booking review, `GET /api/availability`, OTP verification and booking save all remain **unchanged**. Explicit user confirmation is mandatory.
- No modifications to HTML, CSS, mascots, Admin, Doctor, My Appointments, no-show scheduler, or database migrations.

## Install — PowerShell in Laravel root

1. `git branch --show-current` must say `feature/ai-integration`.
2. `git log -1 --oneline` should show `f72f43a` and `git status --short` should show **only existing untracked `.bak` files**. If any tracked files are modified, STOP and review before extraction.
3. Download `VHS_AI_Phase4_Booking_Patch.zip` and place it somewhere accessible. Example if stored under `D:\Cap\Git push`:

   ```powershell
   Expand-Archive -LiteralPath "D:\Cap\Git push\VHS_AI_Phase4_Booking_Patch.zip" -DestinationPath (Get-Location).Path -Force
   ```

4. In **local `.env` only**, add:

   ```dotenv
   AI_BOOKING_INTENT_ENABLED=true
   ```

   An external Gemini call additionally requires `AI_ENABLED=true`, a valid `AI_API_KEY`, the existing `AI_PROVIDER=gemini`, and a configured model. This patch does not alter other AI/privacy flags. **Never send your `.env` or API key to others.** With `AI_BOOKING_INTENT_ENABLED=false`, booking works via deterministic hints and existing wizard.

5. Run:

   ```powershell
   php artisan optimize:clear
   php artisan route:list --path=api/ai/booking-intent
   php artisan test --filter=BookingIntentTest
   php artisan test --filter=UserVettiTest
   php artisan test --filter=AppointmentAutoNoShowTest
   node .\tools\test_phase4_booking.cjs
   ```

6. Run Laravel at `http://127.0.0.1:8010` and log into the **User** Dashboard at `/user/index.html`. Hard refresh `Ctrl + Shift + R`.

## Browser acceptance checks

| User says | Expected |
|---|---|
| `Book Bornok for grooming tomorrow afternoon` | Vetti opens the **same** booking wizard; the owned pet and tomorrow date remain local; selects an active Grooming service **only if unique**; otherwise asks you to pick. Afternoon is a *preference*, not a fake slot |
| `Book Bornok to wash him after lunch` | With AI enabled, Gemini may infer a unique Grooming match using only safe sanitized cue tags; with AI disabled, wizard still opens and the owner manually chooses |
| `Book grooming and vaccination tomorrow` | No arbitrary service selected — ambiguous requests require manual selection |
| `Book for UnknownPet tomorrow` | Existing unresolved-pet behavior: pet stays unselected; no guessed pet |
| `Book Bornok for grooming tomorrow at 3:00 PM` | Exact time selected **only if returned as available** by real slot API |
| Disconnected network / Gemini unavailable | Existing deterministic booking wizard still opens; no fake booking or OTP |
| `Show my pets`, appointments, View Details | Existing Phase 3 and appointment fixes remain functional |

In Chrome F12 → Network, the browser may show the owner's text being POSTed to **your** `/api/ai/booking-intent` Laravel endpoint. This is expected. It does **not** show what Laravel forwards to Gemini; confirm sanitization with the `BookingIntentTest` spy test, not by assuming the browser payload is the provider payload.

## API response

`POST /api/ai/booking-intent` with JSON `{"message":"Book my pet for grooming tomorrow afternoon"}` (session + CSRF) returns:

```json
{
  "success": true,
  "message": "Booking preferences ready; no booking created.",
  "data": {
    "service_hint": "grooming",
    "time_preference": "afternoon",
    "source": "ai",
    "requires_confirmation": true,
    "booking_created": false
  }
}
```

`source` may be `rule`; `service_hint` and `time_preference` may be `none` when uncertain. Only User role can call it; unauthenticated/unverified and non-User roles are blocked. Response cannot name a route or action.

## Validation and scope limits

- JavaScript `.cjs` checks and PHP syntax checks were run when assembling this patch. An isolated PHP service smoke test passed. Full Laravel/PHPUnit integration tests **could not run in the packaging environment** due to missing PHP `dom`, `mbstring`, and `xmlwriter` extensions. They **must be run on your Windows Laravel installation** before committing.
- This is **controlled AI-assisted intent normalization**, not free-form conversational scheduling. It never books autonomously, suggests specific real slots, changes account data, or interprets medical symptoms. Wider language coverage/Taglish and schedule clarification can be added in a later patch after acceptance testing.
- Disable `AI_BOOKING_INTENT_ENABLED` immediately if unexpected behavior is seen, then `php artisan optimize:clear`. Existing deterministic booking remains available.
- Keep all `.bak` files untracked and do not commit `.env`. Do not push until tests and browser checks pass.
