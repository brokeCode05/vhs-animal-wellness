# User Vetti — Past-Date Booking Action Guard

## Why this patch exists
The previous booking intent returned text saying "that date has already passed" while still returning `action: 'openBooking'`. The renderer executes actions separately from showing chat text, so the booking wizard opened against the user's expectation.

## Fix
- Reject a booking instruction containing **yesterday**, **kahapon**, or an explicitly past `YYYY-MM-DD` date at the deterministic User Vetti resolver before the booking action is constructed.
- Return `booking_invalid_date` with **no action and no booking context**, with honest guidance to supply a future date.
- Keep this local safety decision from being overwritten by the optional authenticated text provider. No Gemini/provider call for the rejected booking.
- Update an old test that mistakenly expected the wizard to open for past dates.
- Leave valid future requests, user portal design, clinic scheduling, confirmation and OTP entirely unchanged.

## Local installation (after previous NLU + Booking Help hotfix)
1. Back up `public/user/vetti-state.js` and `public/user/vetti-ai.js` to a folder **outside** the repository.
2. Extract the zip into the Laravel root with `Expand-Archive -Force`.
3. Run `php artisan optimize:clear`, then hard-refresh User Dashboard (`Ctrl+Shift+R`).
4. Test with `node .\tools\test_vetti_booking_past_date.cjs`, `node .\tools\test_vetti_language_upgrade.cjs`, `node .\tools\test_vetti_booking_help.cjs`, plus your Phase 4 frontend regressions.
5. Browser tests: "Book Bornok for grooming yesterday" should explain the past date and **not open booking**. "Book Bornok tomorrow" should still open booking; "Paano magpa-appointment?" should show guidance.

Nothing is pushed to GitHub. No database migrations, `.env`, HTML/CSS, or booking backend are changed.
