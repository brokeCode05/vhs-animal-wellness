<?php
// ============================================================
//  VHS — Cloud Configuration
// ============================================================

// Grab the full connection URL from Render's Environment Variables
$db_url = getenv('DATABASE_URL');
$mail_pass = getenv('MAIL_PASSWORD');
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
define('MAIL_HOST', getenv('MAIL_HOST'));
define('MAIL_PORT', getenv('MAIL_PORT'));
define('MAIL_USERNAME', getenv('MAIL_USERNAME'));
define('MAIL_PASSWORD', getenv('MAIL_PASSWORD'));
define('MAIL_FROM', getenv('MAIL_FROM'));
define('MAIL_FROM_NAME', getenv('MAIL_FROM_NAME'));
?>
