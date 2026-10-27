# VHS Vetti Natural-Language Reliability Upgrade — local installation

**Baseline:** `feature/ai-integration` at `f72f43a` **PLUS ALL THREE tested local Phase 4 patch packages** (initial booking, corrective booking, washed-intent hotfix). Do NOT install on unpatched Phase 3 or an older checkout. Do not cherry-pick over newer custom changes without reviewing the diff.

**Scope:** Public Vetti FAQs and User Vetti booking intent/booking prefill/read-only upcoming appointments. No database migration, HTML/CSS redesign, authentication changes, OTP changes, doctor consultation/SOAP changes, or direct appointment creation. Does not change GitHub until you commit and push yourself.

## What changed

- Taglish/Filipino booking verbs (`ipa-groom`, `magpa-groom`, etc.) and local **bukas** recognition; fixed English requests such as “arrange a wash.” The service is identified against the **active** service catalog and selected pet species, never fabricated.
- `next Friday` resolves to Friday of the **next calendar week**, locally, within the wizard's existing 30-day window. `sa Friday`/`on Friday` resolves to its next future occurrence. Unsupported/ambiguous dates remain unselected; yesterday/kahapon produces an explanatory reply.
- Negated commands, explicit non-owned-pet references, and medical/urgent messages never open the booking wizard. They cannot be overwritten by a generic model answer.
- A unique explicit service cue can correct an incorrect locally inferred service. Multiple services always veto autofill, even if a provider gives a single service.
- Vetti's `Upcoming` text-data query now excludes checked-in/in-consultation and passed-time visits. Existing No-Show state transitions are not changed.
- If a requested exact time is not in the **actual availability result**, the select remains blank and the existing toast system explains why. No made-up slots.
- Public Vetti gains bounded Taglish FAQs and a tighter public privacy check (`appointment ko`, etc.); clinical advice and private data are still off limits.

**Privacy:** The booking endpoint receives the user's text within YOUR Laravel server, but Gemini receives only fixed server-derived cue tokens. The public assistant's other model path is governed by its existing public-info restrictions. No pet names/appointment data/medical details are intentionally forwarded by this upgrade. Do not log private raw prompts.

## Back up first

Do not commit a `.env` file or any `.bak` files. Commit/push nothing until manual QA passes. Recommended: back up local modified files with PowerShell:

```powershell
$files = @(
'app/Services/AI/BookingIntentService.php',
'app/Services/AI/PublicVettiService.php',
'app/Services/AI/UserVettiService.php',
'app/Services/AI/UserVettiFacts.php',
'public/user/vetti-ai.js',
'public/user/vetti-state.js',
'public/user/user-script.js',
'public/web-page/public-vetti.js'
)
$backup = Join-Path (Get-Location).Path '..\VHS_NLU_PrePatch_Backup'
foreach ($file in $files) {
  $dest = Join-Path $backup $file
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $file -Destination $dest -Force
}
```

Then extract `VHS_Vetti_NLU_Reliability_Upgrade.zip` into your Laravel root using the actual location you downloaded it:

```powershell
Expand-Archive -LiteralPath 'D:\Cap\Git push\VHS_Vetti_NLU_Reliability_Upgrade.zip' -DestinationPath (Get-Location).Path -Force
php artisan optimize:clear
```

## Automated tests

From the Laravel root:

```powershell
php artisan test --filter=VettiNLUUpgradeTest
php artisan test --filter=BookingIntentTest
php artisan test --filter=UserVettiTest
php artisan test --filter=PublicVettiTest
node .\tools\test_vetti_language_upgrade.cjs
node .\tools\test_phase4_booking.cjs
node .\tools\test_phase4_booking_correction.cjs
php .\tools\test_vetti_nlu_php_smoke.php
git diff --check
```

An older optional test suite `tests/booking-extract.js` has also been updated for next-week date parsing and past-date rejection. To run it:

```powershell
Push-Location .\public
node ..\tests\booking-extract.js
Pop-Location
```

## Browser checks

Hard refresh BOTH the User Portal and Public Website (Ctrl+Shift+R). Log in as a User for the following:

| Prompt | Expected |
| --- | --- |
| `Gusto ko ipa-groom si Bornok bukas` | Wizard; Bornok, Cat Grooming and tomorrow; NO fabricated time |
| `Can you arrange a wash for Bornok tomorrow?` | Wizard; Cat Grooming instead of Consultation |
| `Book Bornok for grooming next Friday` | Next calendar week's Friday if within 30 days |
| `Book an appointment for a pet that isn't mine` | Refuses; NO wizard, no pet substitution |
| `Don't book Bornok tomorrow` | Refuses; NO wizard |
| `Book grooming and vaccination tomorrow` | Wizard service blank; ambiguity warning |
| `Book Bornok grooming yesterday` | Past-date message; date blank |
| `Book Bornok grooming tomorrow at 11:00 PM` | Time blank if unavailable; informative toast |
| `Book Bornok grooming because he is bleeding` | Veterinary safety reply; NO wizard |
| `Show my appointments` | Existing appointments view, NOT new booking |
| `Vaccination schedule` | Existing information/reminder intent, NOT new booking |
| Public `Paano magpa-appointment?`, `Anong serbisyo ninyo?` | Public FAQ guidance |
| Public `Saan appointment ko?` | Directs to login/authorized portal; no private data |

Do NOT actually create a booking during basic prefill QA; bookings still require explicit review and OTP through the original Laravel workflow.

## Limitations and next stages

This is a **bounded multilingual reliability upgrade**, not unrestricted conversation-level understanding. It explicitly supports tested English/Filipino/Taglish patterns, but rare paraphrases and code-switching will need more examples and tests. Do not claim a Gemini call occurred for deterministic answers; use DevTools Network/endpoint `source` when investigating. This phase does not activate Doctor AI Scribe or expose clinical data to Gemini. The clinic/provider privacy review and synthetic-only doctor pilot remain separate work. Verify the complete Laravel regression suite and actual browser behavior before committing.
