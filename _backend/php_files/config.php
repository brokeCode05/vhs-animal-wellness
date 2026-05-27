<?php
// ============================================================
//  VHS — Environment Configuration
//  Copy this file to config.php and fill in your live values.
//  NEVER commit real credentials to version control.
// ============================================================

// ── Database ─────────────────────────────────────────────────
define('DB_HOST', getenv('DB_HOST') ?: 'sql308.infinityfree.com');
define('DB_PORT', (int)(getenv('DB_PORT') ?: 3306));
define('DB_USER', getenv('DB_USER') ?: 'if0_41983811');
define('DB_PASS', getenv('DB_PASS') ?: 'Vethaven1212');
define('DB_NAME', getenv('DB_NAME') ?: 'if0_41983811_vhsdb');

// ── Mail (SMTP) ───────────────────────────────────────────────
define('MAIL_HOST',     getenv('MAIL_HOST')     ?: 'smtp.gmail.com');
define('MAIL_PORT',     (int)(getenv('MAIL_PORT') ?: 587));
define('MAIL_USERNAME', getenv('MAIL_USERNAME') ?: 'vhsadmin8@gmail.com');
define('MAIL_PASSWORD', getenv('MAIL_PASSWORD') ?: '');          // set via env var on live server
define('MAIL_FROM',     getenv('MAIL_FROM')     ?: 'vhsadmin8@gmail.com');
define('MAIL_FROM_NAME',getenv('MAIL_FROM_NAME')?: 'Vet Clinic System');
