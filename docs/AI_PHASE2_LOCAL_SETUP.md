# VHS AI — Phase 2 Public Vetti Hybrid Integration

**Target:** `feature/ai-integration` at baseline `9403ac9` **with the Phase 1 patch installed**. This is a **separate additive patch**, not a copy of the whole Laravel application.

## Scope / hard boundaries

- Laravel is at the repository root, not under `backend/`.
- Modified existing files: `config/ai.php` (one new flag); `public/web-page/public-vetti.js` (**JavaScript fetch integration only; no markup/CSS/mascot/layout changes**); `routes/web.php` is patched by the included PowerShell script, not replaced.
- Added files: `app/Services/AI/PublicClinicFacts.php`, `app/Services/AI/PublicVettiService.php`, `app/Http/Controllers/AI/PublicVettiController.php`, `tests/Feature/AI/PublicVettiTest.php`, this guide and the route installer.
- No changes to `public/user/`, `public/doctor/`, `public/admin/`, booking, prescriptions, database migrations, or clinical workflows.
- Public Vetti does not access any pet/owner/appointment data. It queries `clinic_settings` and the active `services` list only. The website's old frontend rule table stays as **network fallback**.
- The public AI endpoint is **disabled for Gemini by default**. Its deterministic rules still answer when AI is off.
- Strict restrictions remain: no personal/medical queries sent to Gemini; no diagnosis, prescriptions, appointments, booking writes, or private lookups. Input screening is an additional heuristic, NOT a guarantee that free text is free of PII; do not use personal test messages on an unpaid API.

## Install (Windows PowerShell)

1. Ensure the current local project branch is `feature/ai-integration`, working tree is clean **except the intended Phase 1 uncommitted files**. Check before overwriting manually edited files:

   ```powershell
   cd 'D:\Cap\Git push\vhs-animal-wellness-repo-v2'
   git status --short
   Test-Path .\app\Services\AI\AiGateway.php  # must be True
   Test-Path .\public\web-page\public-vetti.js   # must be True
   ```

2. If you changed `public/web-page/public-vetti.js` after commit `9403ac9`, **stop** and ask for a tailored merge, rather than overwriting it. The stock file should have Git blob hash `1866ee2f97da6dfd200fe328907728927c8982a0`. To check:

   ```powershell
   git hash-object .\public\web-page\public-vetti.js
   ```

3. Back up the small existing files before extracting:

   ```powershell
   Copy-Item .\public\web-page\public-vetti.js .\public\web-page\public-vetti.phase2.bak
   Copy-Item .\config\ai.php .\config\ai.phase2.bak
   ```

4. Extract the ZIP **into the Laravel project folder**, preserving the `app`, `config`, `public`, `tests`, `tools`, and `docs` folders. `Expand-Archive ... -Force` is safe only if Step 2 matched and the Phase 1 config was not manually customized.

   ```powershell
   Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\VHS_AI_Phase2_Public_Vetti_Patch.zip" -DestinationPath (Get-Location).Path -Force
   ```

5. Apply the API route insertion (script backs up `routes/web.php` and does NOT replace it wholesale):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\apply_phase2_route.ps1
   ```

6. In your **local** `.env` (not in GitHub), leave these off while validating:

   ```dotenv
   AI_ENABLED=false
   AI_PUBLIC_VETTI_ENABLED=false
   AI_PROVIDER=gemini
   AI_MODEL=gemini-3.5-flash-lite
   AI_API_KEY=
   AI_SCRIBE_GEMINI_ENABLED=false
   AI_TRANSCRIBE_GEMINI_ENABLED=false
   AI_CLINICAL_USE_CLEARED=false
   ```

   To enable **only public nonclinical** Gemini questions *after* the backend tests pass and your provider account's terms/data-use settings have been reviewed, set `AI_ENABLED=true`, `AI_PUBLIC_VETTI_ENABLED=true`, and add a new private key to `AI_API_KEY`. **Never share your `.env` or key.** Do not enable doctor or clinical AI here.

7. Validate locally:

   ```powershell
   php artisan optimize:clear
   php artisan route:list --path=api/ai/public-vetti
   php artisan test --filter=AiFoundationTest
   php artisan test --filter=PublicVettiTest
   php artisan serve --host=127.0.0.1 --port=8010
   ```

8. Open `http://127.0.0.1:8010/web-page/index.html`. Ask Vetti: `What services do you offer?` (rule); `Anong oras kayo bukas?` (rule); `I work late on weekdays; can I arrange a clinic visit another way?` (AI only if both public flags enabled); `What is my pet's appointment?` (private blocked). Gemini is **not called** for known FAQs.

9. If posting manually to `POST /api/ai/public-vetti`, you need the ordinary Laravel session CSRF token. The existing public browser code now obtains it by `GET /api/auth/csrf` and sends it in `X-CSRF-TOKEN`. The route stays protected by Laravel CSRF, plus a per-IP rate limit of 10/minute. Do not add it to the global CSRF-exception list.

## Expected API contract

`POST /api/ai/public-vetti` with `{ "message":"..." }` and CSRF/session (no login needed):

```json
{
  "success": true,
  "message": "Public Vetti response ready.",
  "data": {
    "text": "Plain text answer",
    "source": "rule",
    "intent": "services",
    "requires_confirmation": false
  }
}
```

`source` is `rule`, `ai`, or `fallback`. Invalid input returns 422, throttle 429, and invalid/missing CSRF 419. Provider outages yield a safe 200 fallback so the chat continues. The browser also retains the existing JS fallback if Laravel is temporarily unreachable.

## Limitations / deployment notes

- Do not represent Phase 2 as verified live Gemini functionality until you have enabled Gemini and tested with **non-sensitive questions**. Unit tests use fake provider only.
- The stored `weekday_first` / `weekday_last` (and weekend counterparts) define **appointment windows**, not necessarily clinic opening hours. The assistant labels them accordingly; unknown hours are not invented.
- Database information can change; the rule path reads live public clinic/settings services when possible and does not write them. If DB fails, it uses safe generic messaging.
- Don't include unnecessary conversation history in the AI request: only current message is sent. Never paste real pet medical records to test public Vetti.
- External Gemini responses are not independently fact-checked by this small layer; they are constrained by a clinic-facts prompt and basic response checks, with fallback. Before production, conduct evaluation with real clinic-approved public FAQs and adversarial prompts, plus rate-limit and privacy tests.
- If a live Gemini test fails, verify model ID, enabled flags, API key, quota, network, and provider permissions. Do not paste error contents or keys into GitHub.
- Restore route backup if needed: `Copy-Item .\routes\web.php.phase2.bak .\routes\web.php -Force`; restore the JS and config files from your `.phase2.bak` copies. Do not run `git reset --hard` to undo this patch.

## Security reminder

A Gmail SMTP app password was exposed in earlier chat content. Revoke that password and create a replacement privately before any public deployment. It is not needed for Phase 2 tests.
