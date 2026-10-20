# Safely replace an old PHP branch with the cleaned Laravel tree

**Important:** A normal Git merge does not delete old files that are absent from the incoming branch. A ZIP extraction over the old folder may leave old files too. Use a clean working directory and remove the legacy tracked paths explicitly.

## Recommended workflow

1. Back up the target branch / create a safety branch. Make sure you know which branch you are on. Do not work on `main` unless that is deliberate.
2. Clone the repository fresh, then `git switch <target-branch>` (for example `backend`). Check `git status` is clean.
3. **On the target branch**, remove old tracked code paths if they exist:

```powershell
git rm -r --ignore-unmatch admin doctor user shared web-page php_files clerk PHPMailer-7.1.1 backend
# Remove tracked old root files if present:
git rm --ignore-unmatch Dockerfile vet_db.sql index.html .nojekyll
```

4. Copy **the contents** of this ZIP's `vhs-animal-wellness/` directory into that repository root, **not** the containing directory. The result must have `artisan`, `composer.json`, and `app/`, `routes/`, `public/` at the top level.
5. Check `git status`, `git diff --stat`, and `git diff --cached --stat`. Review deletions and additions carefully. If you have valuable changes in the destination branch, compare before replacing them.
6. Stage and commit:

```powershell
git add -A
git status
git commit -m "Replace legacy PHP tree with integrated Laravel application"
git push origin <target-branch>
```

7. Point hosting to `public/`, and install/configure Laravel dependencies/environment. Do not reuse the legacy Dockerfile, which copied the PHP site into the web root.

## Validation checklist

- `artisan`, `composer.json`, `routes/web.php` appear at the repository root.
- `public/admin`, `public/doctor`, `public/user`, `public/shared`, `public/web-page` exist.
- There is **no** root `backend/`, `admin/`, `doctor/`, `user/`, `shared/`, `web-page/` or `php_files/` left in the merged branch.
- Existing `.env` / app key / production database are not overwritten or committed.
- Run `composer install`, `php artisan route:list`, `php artisan test` and browser smoke tests before deploying.

Do not run `php artisan migrate:fresh` on a real database. No remote changes were made by creating this ZIP.
