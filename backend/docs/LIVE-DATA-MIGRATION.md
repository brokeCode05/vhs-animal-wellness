# Live data runtime (Laravel + MySQL)

The finished frontend remains unchanged visually. Runtime entity data is now separated from the old demo fixtures.

## Runtime
- `public/shared/live-data.js` loads users, pets, doctors, services, and appointments from Laravel/MySQL.
- It exposes compatibility aliases (`SharedMockUsers`, `SharedMockDoctors`, `SharedMockAppointments`) only so the frozen portal scripts do not need a visual/front-end rewrite. These aliases contain **live database data**, not fixture seeds.
- User pet and appointment reads use `/legacy/user/pets` and `/legacy/user/appointments` to avoid the PHP-shaped path collision inside the physical `/public/user` directory.

## Isolated demo fixtures
The original seeded demo stores are preserved for reference only under:
- `public/shared/demo/mock-users.js`
- `public/shared/demo/mock-doctors.js`
- `public/shared/demo/mock-appointments.js`

No live portal HTML loads these files.

## Main live data flow
- Signup/login -> Laravel session
- User profile/pets/appointments -> MySQL
- Admin owners/pets/appointments/doctors/services -> MySQL
- Doctor assigned appointments/doctor availability -> MySQL

The old document/audit helper modules remain separate and can be migrated to the existing Laravel document/audit APIs in the next pass if those screens are needed for the defense.
