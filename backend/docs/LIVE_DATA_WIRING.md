# VHS Live Data Wiring

The live portals use Laravel/MySQL as the authoritative source. Seeded/demo fixtures are archived under `public/shared/demo/` and are not loaded by live pages.

Key live sources:
- Authenticated identity: `GET /api/auth/me`
- Current user's pets: `GET /api/users/me/pets`
- Pet create/update (legacy form-compatible): `POST /api/pets/save_pet.php`
- Current role's appointments: `GET /api/appointments`
- Services: `GET /api/services`
- Doctors: `GET /api/doctors`

`public/shared/live-data.js` exposes `VHSUsers`, `VHSDoctors`, and `VHSAppointments`. The historical `SharedMock*` globals remain only as compatibility aliases to the same live API-backed state; they contain no seeded fixtures.
