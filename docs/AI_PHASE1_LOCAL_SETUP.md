# VHS AI Phase 1 — Safe local setup (patch for commit 9403ac9)

## What this patch does

Adds a Laravel 13-compatible, server-side Gemini text provider, provider interface,
AI gateway with safe failure behavior, a conservative Taglish-ready rule
router, a no-quota fake provider, structured JSON validation and focused tests. It registers an AI service provider. Phase 1 adds
**no AI HTTP endpoints**, **no Vetti frontend edits**, **no booking changes**, and
**no transcription implementation**. Do not report the site as AI-integrated yet.

### Baseline and compatibility

Target: `feature/ai-integration` at `9403ac9` (Laravel at project root).
Only one existing file is overlaid: `bootstrap/providers.php`.
It should originally register only `AppServiceProvider::class`. If your local file
has changed, merge the single `AiServiceProvider::class` line manually instead.

### 1. Apply patch locally

In PowerShell, confirm `git status` says clean and you are on `feature/ai-integration`.
Download the patch ZIP and extract/copy its **contents** into:

`D:\Cap\Git push\vhs-animal-wellness-repo-v2\`

Do **not** extract into `public/` or into `app/`. The patch ZIP contains root-relative
`app/`, `bootstrap/`, `config/`, `tests/`, and `docs/` folders.

The patch **does not contain `.env`, `vendor`, database, or personal data**.

### 2. Install Laravel dependencies if necessary

```powershell
composer install
php artisan --version
```

Do NOT use `composer update` just to make Phase 1 run. Missing `vendor/autoload.php`
means you need `composer install` in this repository.

### 3. Set safe local environment switches

Add these to YOUR EXISTING `.env` in the local Laravel project, NOT `.env.example`
or GitHub. Do not replace the existing `.env` or regenerate `APP_KEY`:

```dotenv
AI_ENABLED=false
AI_PROVIDER=gemini
AI_MODEL=gemini-3.5-flash-lite
AI_TRANSCRIBE_MODEL=gemini-3.5-transcribe
AI_API_KEY=
AI_TIMEOUT=15
AI_CONNECT_TIMEOUT=5
AI_MAX_INPUT_BYTES=4000
AI_MAX_OUTPUT_TOKENS=640
AI_PAID_DATA_APPROVED=false
AI_SCRIBE_GEMINI_ENABLED=false
AI_CLINICAL_USE_CLEARED=false
AI_TRANSCRIBE_GEMINI_ENABLED=false
```

Keep clinical flags off, including for demonstration with real pets/appointments.
A Gemini API key is NOT required for the automated tests. Do not send the key to
ChatGPT or commit it. `config('ai.*')`, not `env('AI_*')` in controllers, is the
source for runtime AI settings.

### 4. Verify and test

```powershell
php artisan optimize:clear
php artisan test --filter=AiFoundationTest
php artisan --version
git status --short
```

Expected: tests pass, new files appear as untracked, `bootstrap/providers.php`
shows a one-line provider registration change. If your tests fail because the
project/database environment is not initialized, share only the NONSECRET error.

### 5. Optional fake-provider demonstration (no token cost)

To test `AiGateway` from Laravel without any Gemini key, **keep AI_ENABLED=false
in `.env`** and run this in Tinker; the script enables AI only for that Tinker
process and injects a fake provider (no outgoing request):

```powershell
php artisan tinker
```

```php
config()->set('ai.enabled', true);
$fake = new \App\Services\AI\Providers\FakeAiProvider('Hello from fake Vetti.');
$gateway = new \App\Services\AI\AiGateway($fake);
$gateway->text('public_vetti', 'Hello', 'Only answer safe public clinic questions.', 'public');
```

The result should have `ok=true`, `source='ai'` and fake response text.
Exit Tinker with `exit`.

### Safety boundary for future phases

- Laravel must authenticate and authorize BEFORE constructing AI context.
- The caller is required to label every request `public`, `sanitized`, `personal`
  or `clinical`. **The gateway cannot verify that the caller's label is truthful.**
  Do not label raw owner messages as `public` if they contain personal or clinical
  information; the route must inspect and minimize inputs first.
- `AI_PAID_DATA_APPROVED` is a **manual policy gate**; it does not automatically
  prove the project has a compliant paid contract.
- `AI_CLINICAL_USE_CLEARED` is also only a configuration guard, NOT provider
  permission. Doctor clinical use remains blocked until terms, privacy and
  approvals have been explicitly resolved.
- No automatic retries, no raw Gemini errors/logs; failures return safe fallback.
- Schema checks cover basic JSON structure, NOT factual or clinical correctness.
- Later phases must add per-endpoint authorization, rate limiting, request caps,
  populated intent registries, server-side context curation and
  integration tests **before enabling any AI endpoint**.
- Phase 1 currently implements **text-only**. Audio needs a separate approved
  transcription provider and is out of scope here.

Official references:
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/gemini-api/terms

### Rollback

On a clean pre-patch repository, delete the newly added Phase 1 files and revert
`bootstrap/providers.php` using `git restore bootstrap/providers.php`. Don't
run `git clean -fd` unless you have independently reviewed all untracked files.
