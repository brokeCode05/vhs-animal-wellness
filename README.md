# VHS Animal Wellness Center — Veterinary Clinic Management Platform

> A full-stack web application for managing veterinary clinic operations — from public-facing website to internal dashboards for admins, clerks, and pet owners.

---

## 1. Project Overview & Objective

**VHS Animal Wellness Center** is a comprehensive veterinary clinic management platform built for a real veterinary practice. The system connects pet owners with clinic staff through a unified platform that handles appointment scheduling, client/pet management, clinic operations, and public website presence.

**Primary Goals:**
- Streamline appointment booking and management across all roles
- Provide pet owners with a self-service portal for managing pets and appointments
- Give admins and clerks real-time dashboards for clinic operations
- Present a professional public website with service information and online booking
- Ensure role-based access control with multi-factor authentication (OTP)

---

## 2. System Architecture & Tech Stack

### Frontend
| Technology | Usage |
|---|---|
| **HTML5** | Semantic markup across all pages |
| **CSS3** | Custom properties, CSS Grid, Flexbox, animations |
| **Vanilla JavaScript** | All client-side logic (~6,500 lines across 6 JS files) |
| **SVG Icons** | Inline Lucide-style icons (no icon library dependency) |
| **Google Fonts** | Baloo 2 (headings) + Nunito (body) |

**CSS Architecture:**
- `shared/dashboard-theme.css` — Shared design system (1,689 lines)
- `admin/admin-style.css` — Admin-specific overrides (2,011 lines)
- `user/user-style.css` — User portal styles (2,224 lines)
- `web-page/style.css` + `warm-theme.css` — Public website (5,179 lines)
- Per-role accent CSS files for color theming

**JavaScript Architecture:**
- `shared/dashboard-shared.js` — Shared dashboard logic (1,665 lines): calendar, appointments, custom dropdowns, datetime updater
- `shared/vhs-ui.js` — Shared UI utilities (190 lines): loading animation, service modal
- `admin/admin-script.js` — Admin-specific logic (312 lines)
- `clerk/clerk-script.js` — Clerk-specific logic (209 lines)
- `user/user-script.js` — User portal logic (2,853 lines): profile, pets, appointments
- `web-page/script.js` — Website interactions (1,328 lines): hero carousel, counters, modals

### Backend
| Technology | Usage |
|---|---|
| **PHP 8.2** | All server-side logic (13 API endpoints) |
| **MySQL/MariaDB** | Database (`vhsdb`) |
| **PHPMailer 7.1.1** | Email notifications (OTP, verification) |
| **Apache** | Web server (via Docker) |

### Database Schema (4 tables)
```sql
vet_users    — Pet owner accounts (id, name, email, password, role, status, profile_photo)
pets         — Pet records (id, name, type, breed, age, gender, weight, medical_notes, owner_id)
staff        — Clinic staff (id, name, email, password, role: clinic_owner/veterinarian/clerk)
appointments — Bookings (id, user_id, pet_id, staff_id, service, date, time, notes, status)
```

### Deployment
- **Docker** — PHP 8.2 + Apache + MySQL extension
- **Render** — Cloud hosting (dynamic port)
- **GitHub** — Version control (`brokeCode05/vhs-animal-wellness`)
- **SSL** — Certificate support via `certs/` directory

### Authentication
- **Two-step login:** Email/password → OTP verification (email or SMS)
- **Email verification** — Token-based account activation
- **Session management** — PHP sessions with OTP expiry
- **Role-based routing** — Different dashboards per role

---

## 3. Roles & Portals

### 🏠 Public Website (`web-page/`)
| Page | Purpose |
|---|---|
| `index.html` | Homepage with hero, services preview, stats, vet profile |
| `services.html` | Full service catalog with pricing |
| `about.html` | Clinic info, vet profile, team |
| `contact.html` | Contact form and clinic details |
| `login.php` | Two-step login (credentials → OTP) |

**Access:** Public — no authentication required

---

### 👤 Pet Owner Portal (`user/`)
| Page | Purpose |
|---|---|
| `index.html` | Single-page dashboard (sections toggled via JS) |

**Features:**
- Dashboard with stats (upcoming appointments, pets, completed visits)
- Profile management (name, email, phone, address, photo upload)
- Pet management (add/edit/delete pets with photos)
- Appointment booking (select pet, service, date, time)
- Appointment history and status tracking
- Mobile-responsive sidebar navigation

**Access:** Authenticated users with `role = 'user'` and `status = 'approved'`

---

### 🔧 Admin Dashboard (`admin/`)
| Page | Purpose |
|---|---|
| `index.html` | Dashboard with stats, priority alerts, quick overview |
| `accounts.html` | Staff account management (create, edit, activate/deactivate) |
| `appointments.html` | Appointment calendar (month/week/day views) + booking modal |
| `clients-pets.html` | Client and pet management |
| `website.html` | Website content management (clinic info, hours, about, social media) |

**Features:**
- Full CRUD for staff accounts
- Calendar with month/week/day views
- Appointment status management (schedule, complete, cancel)
- Client activation/deactivation
- Website content editing
- Live datetime display in navbar

**Access:** Authenticated staff with `staff_role = 'clinic owner'`

---

### 📋 Clerk Dashboard (`clerk/`)
| Page | Purpose |
|---|---|
| `index.html` | Dashboard with today's stats |
| `appointments.html` | Appointment calendar + booking modal |
| `clients.html` | Client management |
| `clients-pets.html` | Client and pet records |

**Features:**
- Appointment calendar (month/week/day views)
- Create new appointments on behalf of clients
- View client details and pet records
- Same calendar UI as admin (limited permissions)

**Access:** Authenticated staff with `staff_role = 'clerk'`

---

## 4. Feature Breakdown

### 📅 Appointment Scheduling
| Feature | Status |
|---|---|
| Online booking (user portal) | ✅ Complete |
| Staff booking (admin/clerk) | ✅ Complete |
| Calendar views (month/week/day) | ✅ Complete |
| Time slot management (operating hours) | ✅ Complete |
| Booked slot detection | ✅ Complete |
| Status tracking (pending/scheduled/completed/canceled) | ✅ Complete |
| Appointment notes | ✅ Complete |
| Service selection with categories | ✅ Complete |
| Custom searchable dropdowns | ✅ Complete |

### 👥 Client & Pet Management
| Feature | Status |
|---|---|
| Client registration | ✅ Complete |
| Client profile management | ✅ Complete |
| Pet CRUD (add/edit/delete) | ✅ Complete |
| Pet photo upload | ✅ Complete |
| Profile photo upload | ✅ Complete |
| Client activation/deactivation | ✅ Complete |
| Pet medical notes | ✅ Complete |

### 🔐 Authentication & Security
| Feature | Status |
|---|---|
| Two-step login (credentials → OTP) | ✅ Complete |
| Email verification (token-based) | ✅ Complete |
| SMS OTP support | ✅ Complete |
| Role-based access control | ✅ Complete |
| Session management | ✅ Complete |
| Password hashing | ✅ Complete |

### 🌐 Public Website
| Feature | Status |
|---|---|
| Homepage with hero carousel | ✅ Complete |
| Services page with pricing | ✅ Complete |
| About page with vet profile | ✅ Complete |
| Contact page | ✅ Complete |
| Service detail modals | ✅ Complete |
| Animated counters | ✅ Complete |
| Responsive design | ✅ Complete |
| Loading animation | ✅ Complete |

### 📊 Dashboard & Analytics
| Feature | Status |
|---|---|
| Role-specific dashboards | ✅ Complete |
| Quick overview stats | ✅ Complete |
| Priority alerts section | ✅ Complete |
| Live datetime display | ✅ Complete |
| Status badge system | ✅ Complete |

### 🎨 UI/UX System
| Feature | Status |
|---|---|
| Contextual button colors (primary/secondary/danger/urgent/success) | ✅ Complete |
| Per-role accent color theming | ✅ Complete |
| Custom searchable dropdowns | ✅ Complete |
| Modal system | ✅ Complete |
| Mobile-responsive sidebar | ✅ Complete |
| Hamburger menu (mobile only) | ✅ Complete |
| Calendar legend | ✅ Complete |

### 📧 Communications
| Feature | Status |
|---|---|
| Email notifications (PHPMailer) | ✅ Complete |
| OTP via email/SMS | ✅ Complete |
| Appointment status emails | 🔶 Partial |

---

## 5. Current Development State

### ✅ Fully Implemented
- Complete public website with 4 pages
- User portal with profile, pet, and appointment management
- Admin dashboard with full CRUD operations
- Clerk dashboard with appointment and client management
- Two-step authentication with OTP
- Calendar with month/week/day views
- Responsive design across all portals
- Role-based color theming
- Custom UI components (dropdowns, modals, badges)

### 🔶 Partially Implemented
- **Website content management** — Admin can edit clinic info, but changes are stored client-side (no backend persistence)
- **Appointment status emails** — PHPMailer is set up, but automated notifications on status change are not fully wired
- **Emergency/urgent appointments** — Button styling exists but no dedicated emergency workflow

### ❌ Not Yet Implemented
- **Billing & Invoicing** — No payment processing or invoice generation
- **Medical Records** — Pet medical notes exist but no formal medical history system
- **Inventory Management** — No medication/supply tracking
- **Vaccination Tracking** — No vaccination schedule or reminder system
- **Reporting & Analytics** — No charts, graphs, or exportable reports
- **Multi-language Support** — English only
- **Push Notifications** — No real-time notifications
- **API Documentation** — PHP endpoints have no formal API docs
- **Unit/Integration Tests** — No test suite
- **CI/CD Pipeline** — Manual deployment only

### 📁 Project Structure
```
vhs-animal-wellness/
├── admin/                    # Admin dashboard (5 pages)
│   ├── index.html           # Dashboard
│   ├── accounts.html        # Staff management
│   ├── appointments.html    # Appointment calendar
│   ├── clients-pets.html    # Client & pet records
│   ├── website.html         # Website content management
│   ├── admin-style.css      # Admin styles
│   ├── admin-accent.css     # Blue accent theme
│   └── admin-script.js      # Admin logic
├── clerk/                    # Clerk dashboard (4 pages)
│   ├── index.html           # Dashboard
│   ├── appointments.html    # Appointment calendar
│   ├── clients.html         # Client management
│   ├── clients-pets.html    # Client & pet records
│   ├── clerk-style.css      # Clerk styles
│   ├── clerk-accent.css     # Yellow accent theme
│   └── clerk-script.js      # Clerk logic
├── user/                     # Pet owner portal (single-page)
│   ├── index.html           # Dashboard (sections toggled via JS)
│   ├── user-style.css       # User portal styles
│   ├── user-accent.css      # Purple accent theme
│   ├── user-script.js       # User portal logic (2,853 lines)
│   ├── petDB.php            # Pet database operations
│   ├── get_pets_user.php    # Get user's pets
│   ├── get_user_appointments.php  # Get user's appointments
│   ├── pet_photos/          # Uploaded pet photos
│   └── profile_photos/      # Uploaded profile photos
├── web-page/                 # Public website (4 pages)
│   ├── index.html           # Homepage
│   ├── services.html        # Services & pricing
│   ├── about.html           # About & vet profile
│   ├── contact.html         # Contact form
│   ├── login.php            # Two-step login
│   ├── verify.php           # Email verification
│   ├── style.css            # Website styles
│   ├── warm-theme.css       # Purple theme overrides
│   └── script.js            # Website interactions
├── shared/                   # Shared components
│   ├── dashboard-theme.css  # Shared design system (1,689 lines)
│   ├── dashboard-shared.js  # Shared dashboard logic (1,665 lines)
│   ├── vhs-ui.css           # Shared UI components
│   ├── vhs-ui.js            # Shared UI utilities
│   └── dashboard-icons.css  # Icon styles
├── php_files/                # Backend API (13 endpoints)
│   ├── db.php               # Database connection
│   ├── config.php           # Config (gitignored)
│   ├── book-appointment.php # Book appointment
│   ├── get_appointments.php # Fetch appointments
│   ├── get_booked_slots.php # Get booked time slots
│   ├── get_pets.php         # Fetch pets
│   ├── get_users.php        # Fetch users
│   ├── get_staff.php        # Fetch staff
│   ├── get_user_profile.php # Fetch user profile
│   ├── update_profile.php   # Update profile
│   ├── update_appointment_status.php  # Update status
│   ├── create_staff.php     # Create staff account
│   ├── send_email.php       # PHPMailer wrapper
│   └── sms_otp.php          # SMS OTP handler
├── image/                    # Static images
│   ├── vhs-assets/          # Logo and clinic images
│   ├── section-image/       # Section backgrounds
│   └── service-bg-image/    # Service backgrounds
├── PHPMailer-7.1.1/         # Email library
├── certs/                    # SSL certificates (gitignored)
├── vet_db.sql                # Database schema
├── Dockerfile                # Docker deployment config
├── index.html                # Root redirect
├── index.php                 # Root redirect
└── .gitignore                # Git ignore rules
```

### 🔧 Development Notes
- **No build step** — Pure vanilla HTML/CSS/JS, no bundler or framework
- **No package manager** — No npm/yarn/composer (PHPMailer is vendored)
- **Cache busting** — Timestamp-based `?v=` on all CSS/JS includes
- **CSS specificity** — Accent files use `!important` to override shared theme
- **Custom dropdowns** — Reusable `initCustomDropdown()` with search, dynamic options, MutationObserver
- **Calendar** — Full month/week/day views with time slot generation based on operating hours
- **Responsive** — Mobile-first with breakpoints at 480px, 768px, 1024px
