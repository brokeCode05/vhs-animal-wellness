<?php
// ============================================================
//  VHS — Cloud Configuration
// ============================================================

// Grab the full connection URL from Render's Environment Variables
$db_url = getenv('DATABASE_URL');

if ($db_url) {
    $db_parts = parse_url($db_url);
    
    // PHP automatically populates these keys from your DATABASE_URL string
    define('DB_HOST', $db_parts['host']);
    define('DB_PORT', (int)$db_parts['port']);
    define('DB_USER', $db_parts['user']);
    define('DB_PASS', $db_parts['pass']);
    define('DB_NAME', ltrim($db_parts['path'], '/'));
} else {
    // Fallback only if running locally
    define('DB_HOST', 'localhost');
    define('DB_PORT', 3306);
    define('DB_USER', 'root');
    define('DB_PASS', '');
    define('DB_NAME', 'vhsdb');
}

// ── Mail (SMTP) ───────────────────────────────────────────────
define('MAIL_HOST',     getenv('MAIL_HOST')     ?: 'smtp.gmail.com');
define('MAIL_PORT',     (int)(getenv('MAIL_PORT') ?: 587));
define('MAIL_USERNAME', getenv('MAIL_USERNAME') ?: 'vhsadmin8@gmail.com');
define('MAIL_PASSWORD', getenv('MAIL_PASSWORD') ?: 'treszfmfbflmrtjy');          // set via env var on live server
define('MAIL_FROM',     getenv('MAIL_FROM')     ?: 'vhsadmin8@gmail.com');
define('MAIL_FROM_NAME',getenv('MAIL_FROM_NAME')?: 'Vet Clinic System');
?>
