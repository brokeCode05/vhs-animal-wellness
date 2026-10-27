# VHS — User Vetti additional bug audit and safety correction

**Scope:** Authenticated User Vetti deterministic resolver and network-provider handoff, building on the Phase 4 Booking + NLU + Booking How-To + Past-Date hotfixes. No UI redesign, database migrations, clinical advice generation, or booking/OTP mutations.

## Reproduced regressions and corrections

| Reproduced request / condition | Previous behavior | New behavior |
|---|---|---|
| `I don't want to book an appointment` | Opened booking modal | Does not open modal; acknowledges opt-out |
| `Don't cancel my appointment` / `Don't reschedule my appointment` | Opened mutation modal | Does not open modal; no booking/appointment change claimed |
| `Book Luna and Bornok for grooming tomorrow` | Can silently use currently active pet | Asks to choose ONE pet; no booking action |
| `Book both my pets tomorrow` | Can use currently active pet | Asks for one pet |
| `Cancel Luna appointment` when Bornok is first upcoming | Opened Bornok's cancellation modal | Targets Luna's appointment if uniquely identifiable |
| `Reschedule Luna appointment` | Opened the next appointment, even for Bornok | Targets Luna, never another named pet |
| Multiple upcoming visits for one named pet | Could silently choose first | Asks user to select specific visit |
| Unknown pet in cancel/reschedule | Could choose next booked pet | Asks user to select the correct visit |
| `Book Bornok for grooming 2026-02-31` | Opened wizard despite impossible date | Says date invalid, no modal |
| A date more than 30 days ahead | Opened wizard, date dropped | Explains 30-day booking window; no modal |
| `Book Bornok tomorrow and next Friday` | Opened with no date selected | Asks to choose a single date |
| `What is your cancellation policy?` | Opened cancel modal | Provides policy guidance, no modal |
| `Can I reschedule my booking?` | Could open new booking wizard | Provides rescheduling guidance, no modal |
| `Book Luna ...` with Bornok active | Chat text claimed it was booking Bornok | Chat correctly names Luna |
| `Hi, I need consultation for Bornok tomorrow` | Greeting could swallow booking request | Existing booking wizard receives valid context |
| `Book vaccination for a dog that is not mine` | Could open with currently active pet | Refuses unowned-pet request |
| `My dog is in pain and I want to book` | Could simply open booking wizard | Directs to veterinary attention instead of clinical inference |

## Existing functionality preserved

- Working `openBooking` handoff, valid pet / service / date hints, real `/api/availability` checks, manual review, OTP confirmation remain unchanged.
- `Paano magpa-appointment?` help, past-date refusal, Taglish/washing interpretation and ambiguous service veto remain intact.
- `VettiAI` continues to call the authenticated booking-intent API only for normal booking requests. It refuses to overwrite local safety refusals with model text.
- No changes to Public Vetti, Doctor, Admin, the booking modal's HTML/CSS, Laravel backend, or database.

## Important known limits — not claimed fixed here

1. Rich multi-turn conversational memory still does not resolve follow-up references like `same pet next week` reliably.
2. No arbitrary free-form Filipino/Taglish understanding: outside covered safe patterns, the assistant can ask for clarification.
3. User dashboard async availability, server updates, and real OTP booking still require browser tests with a test account. This JS test harness cannot simulate a live clinic database.
4. Existing appointment-specific action constraints and late/no-show resolution still depend on Laravel and clinic workflow.
5. Booking multiple pets intentionally remains unsupported in one wizard operation: user must select one pet per appointment.
6. This audit is a targeted static review and simulated regression sweep, not a guarantee that all possible inputs or security bugs have been found.

## Back up before installing

Run in your Laravel root on `feature/ai-integration` (keep any `.bak` files untracked):

```powershell
$backup = "D:\Cap\Git push\VHS_UserVetti_Audit_Backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item .\public\user\vetti-state.js $backup
Copy-Item .\public\user\vetti-ai.js $backup
Write-Host "Saved to $backup"
```

Extract `VHS_User_Vetti_Additional_Safety_Audit_Hotfix.zip` to the **Laravel project root**, using `Expand-Archive -Force`, only after reviewing changes against your local files. The ZIP includes the latest *Past-Date No Modal* correction as the base. If you have applied other unshared changes to either file, compare/diff first rather than overwrite.

```powershell
Expand-Archive -LiteralPath "D:\Cap\Git push\VHS_User_Vetti_Additional_Safety_Audit_Hotfix.zip" -DestinationPath (Get-Location).Path -Force
php artisan optimize:clear
node .\tools\test_user_vetti_audit.cjs
node .\tools\test_vetti_booking_past_date.cjs
node .\tools\test_vetti_booking_help.cjs
node .\tools\test_vetti_language_upgrade.cjs
node .\tools\test_phase4_booking.cjs
node .\tools\test_phase4_booking_correction.cjs
php artisan test --filter=UserVettiTest
php artisan test --filter=BookingIntentTest
```

Hard-refresh the logged-in User Dashboard and manually exercise at least the negation, multi-pet, wrong-pet cancel, and impossible-date scenarios before committing. Never auto-confirm OTP or book real appointments during these tests. Nothing in this patch pushes to GitHub automatically.
