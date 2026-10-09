# VHS Laravel foundation + email/SMS OTP

This is the B1/B2 backend delivery for the supplied VHS repository. It is a complete Laravel application under `backend/`, not a collection of files to paste into your existing `VHSmain` Laravel app.

**Read `docs/WINDOWS_SETUP.md` first.** Files are already arranged; copy the entire backend folder into the extracted VHS repository root.

Implemented: migrations from `docs/vhs_schema.sql`, domain models/relationships, clinic defaults, explicit-price catalog import, owner registration, email/SMS verification, password + optional login OTP (enabled by default), session login/logout/me, email password setup/reset, active-account and role middleware, a functional `/auth` page, tests, and server-console Admin/Doctor provisioning.

Scope: this implements the foundation and authentication stages. Original User/Admin/Doctor portals still use their existing mock stores/legacy PHP. Pet, booking/booking OTP, clinic QR, clinical records, documents, audit read APIs, Admin account management/unlock APIs, and Vetty/Scribe integration are subsequent stages. No legacy data has been imported. The authentication page does not pretend the original portals are connected.

No production SMTP or SMS messages were sent during development. SMTP and SMS require your provider credentials and successful delivery testing on your computer. Tests fake external delivery.

## Contents

| Folder/file | Responsibility |
|---|---|
| `app/Http/Controllers/AuthController.php` | Registration, verification, session login/logout/me, reset |
| `app/Http/Requests/RegisterRequest.php` | Signup field validation, 18+ rule, password limits |
| `app/Services/OtpService.php` | Code generation, purpose/session binding, hashes, expiry, attempts, consumption |
| `app/Services/OtpDelivery.php` | Laravel mail + Twilio Programmable Messaging adapter |
| `app/Http/Middleware/` | Active account/session-version and role checks |
| `app/Models/` | All 15 domain models with relationships and protected fields |
| `app/Support/Identity.php` | Email and PH phone normalization |
| `database/migrations/` | Schema + framework cache/jobs + auth security fields |
| `database/seeders/` | Clinic defaults and explicit approved-price catalog import |
| `routes/web.php` | `/api/auth/*` routes using session + CSRF middleware |
| `routes/console.php` | Initial Admin/Doctor provisioning and OTP cleanup |
| `resources/views/auth.blade.php` | Functional standalone authentication page |
| `resources/views/terms.blade.php` | Terms copied from the uploaded public frontend |
| `public/auth-client.js` | JSON requests and CSRF handling for the auth page |
| `config/vhs.php` | OTP policy and SMS settings |
| `.env.example` | Safe configuration template; copy locally to `.env` |
| `docs/` | Setup, API, implementation report, file manifest |
| `tests/Feature/` | Auth, authorization, OTP, delivery transport tests |

Run `composer test` or `php vendor/bin/phpunit` from this folder. No npm build is needed for the included auth page.
