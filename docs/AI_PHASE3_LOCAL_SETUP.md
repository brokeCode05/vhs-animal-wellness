# VHS AI — Phase 3 Authenticated User Vetti Patch

**Baseline:** `feature/ai-integration` at commit `b964d1a` (Phase 1 + Phase 2 + safety hotfix).
**Laravel root:** `D:\Cap\Git push\vhs-animal-wellness-repo-v2` (not a `backend/` subfolder).
**Scope:** **User Vetti** (`public/user/vetti-ai.js`); keep Admin, Doctor, Public Vetti UI and the existing User Vetti layout unchanged.

## Security constraints

- The endpoint `POST /api/ai/vetti` requires the **existing Laravel session**, active verified account, and `role:User`. It uses the app's CSRF protection and throttling.
- `pet_id` is optional; when supplied it must belong to the signed-in User (403 otherwise). The server uses only session identity.
- Pets and appointments are read from Laravel on behalf of the session owner and **are never passed to Gemini**. Raw conversation history, active pet name/metadata, owner PII, and private records are not transmitted to Gemini.
- Public-language interpretation is based on **fixed canonical clinic questions**, not forwarded owner text. The model is called only for public nonmedical clinic questions when `AI_ENABLED=true` and `AI_USER_VETTI_ENABLED=true`. Medical guidance remains restricted pending provider review.
- The **original Vetti cards and actions remain on the deterministic UI path**, including `openPetForm`, `openBooking`, `openReschedule` and `openCancel`. The AI endpoint returns text-only answers; no action, timeslot, appointment save, cancellation, or OTP result can come from AI. Phase 4 will handle more sophisticated booking intent.
- No changes to HTML, CSS, mascot, User Portal layouts, Admin or Doctor modules. Only the `vetti-ai.js` provider seam is wired.

## Install locally

1. Confirm Git branch and commit: `git branch --show-current` and `git log -1 --oneline`. Expected branch `feature/ai-integration`, base `b964d1a`. Existing local untracked `.bak` files can remain. **Do not `git add .`.**
2. Back up modified files before extraction if you have any uncommitted changes:
   ```powershell
   git status --short
   Copy-Item .\public\user\vetti-ai.js .\public\user\vetti-ai.before-phase3.bak
   Copy-Item .\config\ai.php .\config\ai.before-phase3.bak
   Copy-Item .\app\Services\AI\PublicVettiService.php .\app\Services\AI\PublicVettiService.before-phase3.bak
   ```
3. Extract `VHS_AI_Phase3_User_Vetti_Patch.zip` **into the Laravel root folder** with `Expand-Archive -LiteralPath "D:\Cap\Git push\VHS_AI_Phase3_User_Vetti_Patch.zip" -DestinationPath (Get-Location).Path -Force`. Adjust source path to where you actually saved ZIP.
4. Add optional flag to **local** `.env` (never commit `.env`):
   ```dotenv
   AI_USER_VETTI_ENABLED=true
   AI_SCRIBE_GEMINI_ENABLED=false
   AI_TRANSCRIBE_GEMINI_ENABLED=false
   AI_CLINICAL_USE_CLEARED=false
   ```
   `AI_ENABLED=true` + valid private `AI_API_KEY` also required to make optional Gemini calls. The authenticated rule-based functionality works while the AI flags are false.
5. Run `powershell -ExecutionPolicy Bypass -File .\tools\apply_phase3_route.ps1`. The installer changes **only** `routes/web.php`, inserts into your already authenticated group, is idempotent, and creates `routes/web.php.phase3.bak` locally.
6. Run:
   ```powershell
   php artisan optimize:clear
   php artisan route:list --path=api/ai/vetti
   php artisan test --filter=UserVettiTest
   php artisan test --filter=PublicVettiTest
   php artisan test --filter=PublicVettiContactGuardTest
   php artisan test --filter=AiFoundationTest
   ```
   Inspect any failures before continuing. Additional regression suite recommended: `php artisan test`.
7. Serve using `php artisan serve --host=127.0.0.1 --port=8010`, login as a **User**, and test Vetti from `http://127.0.0.1:8010/user/index.html`. Hard refresh (`Ctrl+Shift+R`) to avoid a cached copy of `vetti-ai.js`. Network POST should reach `/api/ai/vetti` for text-only questions; **rich cards/booking actions deliberately remain local**, so not every message creates an AI request.

## Browser test matrix

| Input (User Portal) | Expected behavior |
|---|---|
| Show my pets | Existing pet cards; no Gemini request |
| Show my appointments | Existing appointment card/list; no Gemini request |
| I want to book a visit | Existing booking wizard + OTP; AI doesn't book |
| What services do you offer? | Existing service UI (rule) |
| I work late on weekdays; can I arrange a visit another way? | Text-only Laravel API; possibly `source: ai` when approved and enabled |
| I have a sick dog, what medicine should I give? | Rule-based safe guidance; **no Gemini data about the pet** |

For API verification, open F12 -> Network -> select the actual **POST** `api/ai/vetti` request and inspect **Response** (`data.source` is `rule`, `ai`, or `fallback`). Directly navigating to the URL in the address bar sends GET and rightly produces 405.

## API contract

`POST /api/ai/vetti` (authenticated User; JSON; CSRF for browser) accepts:

```json
{"message":"I work late; how can I arrange a clinic visit?", "responseLanguage":"en", "pet_id":7}
```

`pet_id` is optional and must be owned by signed-in User. No `user_id`, full pet record, or conversation history is accepted for provider context.

Successful response envelope:

```json
{"success":true,"message":"User Vetti response ready.","data":{"text":"...","state":"idle","suggestions":[],"source":"rule|ai|fallback","intent":"...","requires_confirmation":false}}
```

Errors: 401 unauthenticated/inactive, 403 wrong role/pet ID, 419 invalid CSRF (browser), 422 malformed input, 429 throttled. General provider outages return a safe fallback; the frontend retains its original deterministic resolver.

## Notes and limitations

- An active User login and working MySQL database are required for real pet/appointment lookups. No new migration or database table is added.
- In the installed browser integration, existing structured pet/appointment cards and booking wizard take priority over backend plain-text answers. The endpoint independently supports authorized pet and appointment text responses for testing and future use.
- The backend only sends **fixed sanitized public questions** to Gemini; no private contextual personalized summarization is enabled. A clinical-use or sensitive-data scope expansion is **not** part of Phase 3.
- This is a development patch: run PHPUnit on your local Windows installation and conduct manual role, session, and no-leak testing before committing or deployment. Tests written in this patch were syntax-checked, but the full PHP test runtime is unavailable in the packaging environment.
- If your working tree already contains manual edits to any of the 3 modified files, review their diffs before overwriting. The patch must be applied to the `b964d1a` baseline, not an older version.
