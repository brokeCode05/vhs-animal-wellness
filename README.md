# VHS Animal Wellness Center — Laravel Integrated Project

This is the **Laravel application** and its **integrated public frontend**, cleaned for use as the repository root. The old standalone PHP/MySQL application is **not** included.

## Directory layout

- `artisan`, `composer.json`, `app/`, `bootstrap/`, `config/`, `routes/`, `database/` — Laravel application at the **repository root**.
- `public/admin/`, `public/doctor/`, `public/user/`, `public/web-page/`, `public/shared/` — integrated browser-facing frontend and assets.
- `public/index.php` — Laravel request entrypoint.

**Do not add back** root-level `admin/`, `doctor/`, `user/`, `shared/`, `web-page/`, `php_files/`, `clerk/`, the legacy root `Dockerfile`, or `vet_db.sql`. Do not put this project inside a second `backend/` directory. Existing legacy URLs handled by Laravel routes are not proof that the legacy physical PHP files are needed.

## Local setup (PowerShell, from this directory)

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
```

Set database credentials and mail/OTP provider configuration in `.env` for your own environment. Create the MySQL database before migrating. **Only generate an APP_KEY for a fresh environment**; for an existing deployment, preserve the current `.env` and key.

```powershell
php artisan migrate --seed
php artisan serve --port=8010
```

Open `http://127.0.0.1:8010/`. For production, point the web server's **document root to `public/`**, install production dependencies, and configure `.env`, storage permissions, and the production DB appropriately. Never expose Laravel repository root as the web root.

Read `MERGE_INSTRUCTIONS.md` before merging this into an existing branch. This package does **not** overwrite your remote GitHub branch automatically.

**Verification scope:** archive structure is corrected; functional integration, live mail/SMS, database settings, and production deployment were not exercised in this environment.
