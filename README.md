# VHS Animal Wellness Center

Veterinary clinic management system with a public website, role-based dashboards (admin, clerk, user), and PHP/MySQL backend.

## Project Structure

```
/
├── index.php              # Root redirect → web-page/index.php
├── Dockerfile             # Production Docker image (PHP 8.2 + Apache)
├── vet_db.sql             # Database schema
├── web-page/              # Public website (Home, Services, About, Contact)
│   ├── index.html         # Homepage
│   ├── index.php          # Registration handler
│   ├── login.php          # Login handler (with OTP)
│   ├── verify.php         # Email verification page
│   ├── script.js          # Frontend JS (login, signup, booking)
│   ├── style.css          # Main styles
│   ├── warm-theme.css     # Theme overrides
│   └── image/             # Website images and assets
├── admin/                 # Admin dashboard
│   ├── index.html         # Dashboard overview
│   ├── accounts.html      # Staff & client account management
│   ├── appointments.html  # Appointment management
│   ├── clients-pets.html  # Client & pet management
│   └── website.html       # Website content editor
├── clerk/                 # Clerk dashboard
│   ├── index.html         # Dashboard overview
│   ├── appointments.html  # Appointment scheduling
│   ├── clients.html       # Client management
│   └── clients-pets.html  # Pet management
├── user/                  # Pet owner dashboard
│   ├── index.html         # Dashboard (pets, appointments, profile)
│   ├── petDB.php          # Pet CRUD handler
│   ├── get_pets_user.php  # Fetch user's pets
│   └── get_user_appointments.php  # Fetch user's appointments
├── shared/                # Shared UI components
│   ├── vhs-ui.css         # Core UI styles
│   ├── vhs-ui.js          # Core UI components
│   ├── dashboard-theme.css    # Dashboard theme
│   ├── dashboard-icons.css    # Dashboard icons
│   └── dashboard-shared.js    # Dashboard shared logic
├── php_files/             # Backend API endpoints
│   ├── .htaccess          # Block direct access to internal files
│   ├── config.php         # Database & mail config (env vars) — gitignored
│   ├── db.php             # Database connection
│   ├── book-appointment.php
│   ├── create_staff.php
│   ├── get_appointments.php
│   ├── get_booked_slots.php
│   ├── get_pets.php
│   ├── get_staff.php
│   ├── get_users.php
│   ├── get_user_profile.php
│   ├── send_email.php     # PHPMailer wrapper
│   ├── sms_otp.php        # SMS OTP verification
│   ├── update_appointment_status.php
│   └── update_profile.php
├── PHPMailer-7.1.1/       # PHPMailer library
├── image/                 # Shared images (logo, section images)
└── certs/                 # SSL certificates (gitignored)
```

## Quick Start

### Docker (recommended)
```bash
docker build -t vhs-app .
docker run -p 8080:80 vhs-app
```
Open http://localhost:8080

### PHP Built-in Server
```bash
php -S localhost:8000
```
Open http://localhost:8000

## What Works Without a Backend

- Public website (Home, Services, About, Contact)
- All animations, carousels, and UI interactions
- Admin, Clerk, and User dashboard layouts (view only)

## What Requires PHP + MySQL

- Login / Sign Up (with email verification + SMS OTP)
- Appointment booking
- Pet registration
- Profile management
- Staff management

## Environment Variables

Create `php_files/config.php` (gitignored) or set these environment variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection URL (`mysql://user:pass@host:port/db`) |
| `MAIL_HOST` | SMTP host |
| `MAIL_PORT` | SMTP port |
| `MAIL_USERNAME` | SMTP username |
| `MAIL_PASSWORD` | SMTP password |
| `MAIL_FROM` | Sender email address |
| `MAIL_FROM_NAME` | Sender display name |
| `SEMAPHORE_API_KEY` | Semaphore SMS API key |

## Database

Import `vet_db.sql` to set up the schema:
```bash
mysql -u root -p < vet_db.sql
```

## Deployment

Designed for PHP 8.2+ / MySQL:
- **Shared hosting**: InfinityFree, 000webhost, any cPanel host
- **VPS**: Apache/Nginx + PHP + MySQL
- **Cloud**: Render, Railway, or any Docker-compatible platform
