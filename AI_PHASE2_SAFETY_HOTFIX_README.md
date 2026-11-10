# Phase 2 Public Vetti — contact safety guard correction

This tiny patch fixes a false positive in the existing `unsafe_response` output filter. The original Phase 2 service rejected any phone-number-shaped output, including the clinic's legitimate phone number supplied by Laravel. The new guard allows **only** the phone and email values already read from verified public clinic settings, and continues blocking unverified URLs, invented contact numbers/emails, and numeric prices. No frontend, layout, mascot, stylesheet, routing, or booking code changes.

Target: the Phase 2 patch already installed on `feature/ai-integration`, with the 22 prior tests passing.

## Install in Windows PowerShell

From `D:\Cap\Git push\vhs-animal-wellness-repo-v2`:

```powershell
Copy-Item .\app\Services\AI\PublicVettiService.php .\app\Services\AI\PublicVettiService.before-hotfix.bak
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\VHS_AI_Phase2_Public_Vetti_Safety_Hotfix.zip" -DestinationPath (Get-Location).Path -Force
php artisan optimize:clear
php artisan test --filter=PublicVettiContactGuardTest
php artisan test --filter=PublicVettiTest
php artisan test --filter=AiFoundationTest
```

Only two files in this archive: `app/Services/AI/PublicVettiService.php` (replace current Phase 2 service), and `tests/Feature/AI/PublicVettiContactGuardTest.php` (new regression tests).

Next, test the public chatbot with **a fictional non-sensitive general clinic question**, then inspect `Network -> public-vetti (POST 200) -> Response -> data.source`. `source=ai` confirms the provider response survived application checks. If `source=fallback` persists, capture `data.intent` but do not paste any keys, private input, provider payloads, or raw clinical content. No source label alone proves the actual remote account is using Gemini rather than a fake provider: confirm `.env` is set to `AI_PROVIDER=gemini` and provider logs/response metadata if available.

Note: this does not resolve potential other reasons for `unsafe_response` (e.g. an invented URL, price, excessive output length); those restrictions intentionally remain.

Security: real pet clinical content is out of scope; keep Scribe flags off. Revoke any previously exposed mail credentials before deployment.
