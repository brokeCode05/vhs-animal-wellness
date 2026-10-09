# Windows setup — follow in order

## 1. Put the files in the correct place

Your existing Laravel folder is `C:\Users\Corvus\VHSmain`. Leave it alone for now to avoid mixing two Laravel applications.

1. Extract the ORIGINAL GitHub ZIP you uploaded into a new folder, for example `C:\Users\Corvus\vhs-animal-wellness-main`.
2. Extract the delivered ZIP separately.
3. Copy its entire `backend` folder into `C:\Users\Corvus\vhs-animal-wellness-main`.
4. The result must have these sibling folders:

| Location | Contents |
|---|---|
| `C:\Users\Corvus\vhs-animal-wellness-main\backend` | Delivered Laravel application |
| `C:\Users\Corvus\vhs-animal-wellness-main\admin` | Original Admin frontend |
| `C:\Users\Corvus\vhs-animal-wellness-main\doctor` | Original Doctor frontend |
| `C:\Users\Corvus\vhs-animal-wellness-main\user` | Original User frontend |
| `C:\Users\Corvus\vhs-animal-wellness-main\web-page` | Original public frontend |
| `C:\Users\Corvus\vhs-animal-wellness-main\shared` | Original shared scripts |
| `C:\Users\Corvus\vhs-animal-wellness-main\docs` | Original handoff contracts |

Do not put Laravel files into `php_files`, `web-page`, or `backend/public`. Do not copy the original SQL exports into the new database. The migration files create the new schema.

All generated files are already in their correct folders. `backend/docs/FILE_MANIFEST.txt` lists them. Use VS Code → Open Folder → `vhs-animal-wellness-main` to see the full project.

## 2. Install dependencies

Open PowerShell:

```powershell
cd C:\Users\Corvus\vhs-animal-wellness-main\backend
php -v
composer --version
composer install
Copy-Item .env.example .env
php artisan key:generate
```

Only copy `.env.example` and generate the key on your FIRST setup. Do not overwrite an already configured `.env` or rotate an existing app key on every start.

You showed PHP 8.5.0, Composer 2.8.12 and Laravel 13.33.0. This package locks Laravel 13.34.0 and supports PHP ^8.3; `composer install` installs the project's locked dependencies rather than using another folder's Laravel version.

If Composer reports a missing extension, run `php --ini` to locate the Herd Lite PHP configuration actually used by your terminal. Enable the named extension there (e.g. `pdo_mysql`, `mbstring`, `openssl`, `curl`, `dom`/`xml`), then reopen PowerShell. Do not use `--ignore-platform-reqs`.

## 3. Prepare MySQL

PHP/Composer/Herd Lite being installed does not establish that MySQL is running. Start your existing MySQL server (or XAMPP MySQL/MariaDB if that is what you already use). Use your database manager to create a NEW empty database named `vhs_laravel`:

```sql
CREATE DATABASE vhs_laravel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Open `backend/.env` in VS Code. Match these values to YOUR local database account:

```dotenv
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=vhs_laravel
DB_USERNAME=root
DB_PASSWORD="your-local-database-password"
```

If your local database password is genuinely blank, use `DB_PASSWORD=`. Do not assume it is blank merely because an example says so.

Then, from `backend`:

```powershell
php artisan config:clear
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8000
```

Open http://127.0.0.1:8000/auth. Keep this terminal running. A separate terminal can run other commands. Use `127.0.0.1` consistently; switching between it and `localhost` changes the browser cookie context.

`/api/health` confirms Laravel is running. The migration command checks the database. Health alone is not a database readiness check.

No `npm install` or `npm run dev` is needed for this auth page.

### Optional local-only SQLite check

If you do not have MySQL yet, you can first exercise authentication with SQLite. Do not call this MySQL verification.

```powershell
New-Item -ItemType File -Path database\database.sqlite
```

Set `DB_CONNECTION=sqlite` and set `DB_DATABASE` to the absolute path using forward slashes, for example `C:/Users/Corvus/vhs-animal-wellness-main/backend/database/database.sqlite`. Ensure `pdo_sqlite` is enabled. Run `php artisan config:clear` and `php artisan migrate --seed`. Switch to a NEW MySQL database later and run its migrations; data does not automatically transfer.

## 4. Test email OTP without sending mail first

Defaults:

```dotenv
MAIL_MAILER=log
LOG_LEVEL=debug
SMS_DRIVER=disabled
```

1. On `/auth`, create an account using **Email code**.
2. Open `backend/storage/logs/laravel.log` locally. Find the latest six-digit registration code. This local mode writes the email body to a file; it does not send an email.
3. Enter the code under **Enter your verification code**, purpose **Verify email registration**, channel **Email**.
4. Sign in using that email and password. Login OTP is enabled by default, so find the new login code in the same log and enter it with purpose **Complete sign in**.
5. The page should show your name and role. Test logout too.

Codes expire after 5 minutes and allow at most 5 guesses. Wait 60 seconds between code sends. This cooldown is shared per destination, so you may need to wait between registration and your first login code.

Keep the same browser/session while requesting and entering a code. Never post your logs or `.env` publicly; local log mail contains usable temporary codes.

## 5. Send real email using Gmail SMTP

Use a dedicated clinic/development Gmail mailbox that you control.

1. Turn on Google 2-Step Verification.
2. Create an App Password at https://myaccount.google.com/apppasswords, if your Google account allows it. School/organization/Advanced Protection accounts may not offer App Passwords.
3. Edit ONLY your local `backend/.env`:

```dotenv
MAIL_MAILER=smtp
MAIL_SCHEME=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME="your-clinic-address@gmail.com"
MAIL_PASSWORD="your16characterapppassword"
MAIL_FROM_ADDRESS="your-clinic-address@gmail.com"
MAIL_FROM_NAME="VHS Animal Wellness Center"
```

Use the App Password, not your normal Google sign-in password. Remove the visual spaces from the App Password when copying it. Leave TLS verification enabled; SMTP on port 587 uses STARTTLS with the underlying mail transport.

```powershell
php artisan config:clear
```

Restart `php artisan serve`, then request a new code and check Inbox/Spam. Password setup/reset uses the same mail transport. If SMTP is rejected, check the App Password, sender address, account restrictions and network access. You can also use any SMTP provider by replacing these host/port/user/password values.

If account creation succeeds but email delivery fails, the unverified account remains. Use the verification form with the same email and **Resend code** after fixing SMTP; do not repeatedly register it.

Google reference: https://support.google.com/accounts/answer/185833
Laravel mail reference: https://laravel.com/docs/13.x/mail

## 6. Configure real SMS delivery

The included adapter uses **Twilio Programmable Messaging**, not Twilio Verify. Laravel generates and validates the code; Twilio delivers the SMS.

PH delivery has an external setup dependency: Twilio's published Philippine guidance requires a **registered Alphanumeric Sender ID** and lists approximately **two weeks** for provisioning. An arbitrary sender name or overseas trial phone number is not a working substitute. Verify your account's eligibility before spending money. Use email OTP while sender approval is pending.

1. Open your own Twilio account and confirm that your account can send your OTP message content to Philippine mobile numbers.
2. Complete Twilio's sender registration for the Philippines. Get the approved Alphanumeric Sender ID or a Messaging Service configured with that approved sender.
3. Enable the Philippines in Messaging Geographic Permissions.
4. Copy your Account SID and Auth Token from Twilio Console into your local `.env`:

```dotenv
SMS_DRIVER=twilio
TWILIO_ACCOUNT_SID="ACyour-account-sid"
TWILIO_AUTH_TOKEN="your-auth-token"
TWILIO_FROM="ApprovedID"
TWILIO_MESSAGING_SERVICE_SID=
```

`ApprovedID` is a placeholder: replace it with your actual approved sender. Alternatively set `TWILIO_MESSAGING_SERVICE_SID="MGyour-service-sid"` for the correctly configured service; the code prefers that over `TWILIO_FROM`.

5. Clear config and restart the server.
6. On `/auth`, choose **SMS code**, enter your own PH mobile number, click **Send signup SMS**, then submit that code with the registration form.
7. SMS-verified accounts can receive login codes by SMS. Email-verified accounts cannot select SMS login until their phone has been verified; a separate authenticated contact-verification feature is a later stage.

Numbers like `09171234567`, `9171234567` and `+639171234567` normalize to `+639171234567`.

SMS sending may incur charges. Trial accounts have recipient/content/geographic limits; current trial restrictions can prevent this application's custom message body. Do not assume a free trial will work for this PH flow. Provider acceptance is not proof of handset delivery: check Twilio messaging logs for failed/undelivered messages.

Provider references (checked 2026-10-03):
- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/en-us/guidelines/ph/sms
- https://www.twilio.com/docs/messaging/guides/sms-geo-permissions
- https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account

If your team already has Semaphore or another PH SMS provider, only `app/Services/OtpDelivery.php` and related config need another adapter. No such adapter is claimed in this delivery.

## 7. Create your first Admin / Doctor

From the trusted backend terminal:

```powershell
php artisan vhs:create-admin
php artisan vhs:create-doctor
```

Each command asks for the real name and email. No default or plaintext password is assigned. The account holder visits `/auth`, requests an email password setup/reset code, and sets their own password. Admin creation is a trusted CLI operation only, never a public signup option.

Use the Doctor command with the intended Dr. Santos account if that identity is needed; do not invent a real mailbox or share a demo password. The Admin UI's account management endpoints are not implemented yet.

## 8. Tests and troubleshooting

```powershell
composer test
# Equivalent:
php vendor/bin/phpunit
```

Tests use an isolated in-memory SQLite database by default, and fake outgoing email/SMS. Enable `pdo_sqlite` for the default suite. Never point test runs at real clinic data: RefreshDatabase resets the selected test schema.

| Error | What to check |
|---|---|
| `Could not open input file: artisan` | Terminal must be in `...\backend`, not the repository root |
| `vendor/autoload.php` missing | Run `composer install` in backend |
| `No application encryption key` | First setup: copy `.env.example`, then `php artisan key:generate` |
| SQL connection refused | Start MySQL; confirm host/port/password |
| Unknown database | Create the empty `vhs_laravel` database first |
| Cache table missing | Run migrations; OTP throttles use the database cache |
| HTTP 419 | Refresh `/auth`, use the same hostname, and allow cookies |
| HTTP 429 | Wait for cooldown; do not keep resending |
| HTTP 503 on sending | Check SMTP/SMS credentials and provider status; SMS defaults to disabled |
| Verification fails | Correct purpose, same browser, latest code, within 5 minutes; request a new code after 5 wrong attempts |
| Email code not in local log | Ensure `MAIL_MAILER=log` AND `LOG_LEVEL=debug`, then clear config |
| Existing public signup still calls PHP | Expected: original portal integration is a later phase; test at `/auth` |

## 9. Production boundary

Deploy with the web document root pointing to `backend/public`, never the repository root. Use HTTPS, `APP_ENV=production`, `APP_DEBUG=false`, `SESSION_SECURE_COOKIE=true`, a real SMTP transport, `LOG_LEVEL=warning`, and a stable private `APP_KEY`. Log/array mail is rejected in production. Configure Laravel's scheduler to run `schedule:run` each minute for daily expired-code cleanup.

For multiple app servers, use a shared session driver and shared atomic cache. The local file session default is for one server. Same-origin routing is the simplest integration target; the existing GitHub Pages frontend is not wired to these session endpoints by this delivery.

Do not deploy the legacy PHP endpoints unchanged as the auth backend: they have not been audited or migrated in this package.
