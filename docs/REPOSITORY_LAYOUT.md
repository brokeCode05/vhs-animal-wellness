# Repository layout (Laravel root)

The working Laravel application is directly under the repository root: `artisan`, `app/`, `bootstrap/`, `config/`, `database/`, `resources/`, and `routes/`. Its frontend files are in `public/admin/`, `public/doctor/`, `public/user/`, `public/web-page/`, and `public/shared/`.

Do not restore old root-level `admin/`, `doctor/`, `user/`, `shared/`, `web-page/`, `clerk/`, `php_files/`, `PHPMailer-7.1.1/` or the nested `backend/` tree.

The synchronization script leaves branch-only integration documentation in `docs/` untouched. It preserves conflicting AI artifacts under `docs/ai-branch-preserved/` for manual review rather than silently discarding AI work. These preserved snapshots are not active scripts.

AI provider integration is still in progress. REQ009 and REQ035 are intentionally deferred.
