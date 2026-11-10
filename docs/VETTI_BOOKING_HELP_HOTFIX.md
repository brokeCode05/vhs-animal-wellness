# VHS User Vetti — Booking how-to routing correction

**Base:** VHS Vetti NLU Reliability Upgrade (installed after Phase 4 corrective fixes).
**Scope:** Route *Paano magpa-appointment?* and equivalent English/Taglish HOW-TO questions to booking instructions, not an existing appointment-history query.

## Changes
- `public/user/vetti-state.js`: check booking HOW-TO questions **before** broad `appointment` keyword matching. Return text + suggestions; no booking action.
- `public/user/vetti-ai.js`: preserve that deterministic explanation even when backend network provider is on.
- `app/Services/AI/UserVettiService.php`: matching read-only authenticated API response, without looking up appointments or calling Gemini.
- One PHP and one JavaScript regression test.
- **No changes** to Public Vetti, Doctor Portal, HTML/CSS, booking wizard, OTP, database, or service availability.

## Install
Back up the three modified files to a directory **outside** the repository before extraction. Extract this ZIP to Laravel root, then `php artisan optimize:clear`.

## Verify
```powershell
php artisan test --filter=VettiBookingHelpTest
php artisan test --filter=VettiNLUUpgradeTest
php artisan test --filter=UserVettiTest
node .\tools\test_vetti_booking_help.cjs
node .\tools\test_vetti_language_upgrade.cjs
```

Hard-refresh the User Dashboard, then test *Paano magpa-appointment?* (should explain steps, no appointment cards), *Show my appointments* (still lists records), and *Book Bornok tomorrow* (still opens the wizard). Test Public Vetti separately at `/web-page/index.html`.

Do not push to GitHub before local verification. Never commit `.env` or `.bak` files.
