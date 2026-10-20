# Windows setup — integrated Laravel layout

The Laravel app is at the **repository root**. Do **not** copy a `backend/` folder into an old vanilla-PHP repository, and do **not** copy old frontend folders beside it.

1. Extract the cleaned archive and open its `vhs-animal-wellness` folder in VS Code.
2. From that directory, run `composer install`.
3. For a fresh environment only, run `Copy-Item .env.example .env` and `php artisan key:generate`. Never replace an existing deployed `.env` or APP_KEY.
4. Set `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, mail and SMS settings in `.env`; ensure MySQL is running and the database exists.
5. Run `php artisan migrate --seed` **only after reviewing migrations and ensuring the target database is correct**.
6. Run `php artisan serve --port=8010`, then visit `http://127.0.0.1:8010/`.

Laravel code is in `app/`, `routes/` and `database/`. Integrated frontend is exclusively under `public/admin`, `public/doctor`, `public/user`, `public/shared`, `public/web-page`. Never serve repository root directly as a web root; use `public/`.

See `README.md` and `MERGE_INSTRUCTIONS.md`. Any older docs mentioning `backend/...` or sibling original frontends may describe an intermediate migration stage and should not override this layout.
