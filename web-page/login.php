<?php
// ============================================================
//  VHS — Login Handler
//  Handles two POST steps:
//    Step 1: email2 + password1  → credential check
//    Step 2: login_otp           → OTP verification
// ============================================================
session_start();
header('Content-Type: application/json');
error_reporting(0);
ini_set('display_errors', 0);

require_once __DIR__ . '/../php_files/db.php';
require_once __DIR__ . '/../php_files/config.php';

$conn = getDB();

$col_check = mysqli_query($conn, "SHOW COLUMNS FROM vet_users LIKE 'phone_verified'");
$has_phone_verified = ($col_check && mysqli_num_rows($col_check) > 0);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'Invalid request method.']);
    exit;
}

// ── Step 2: OTP verification ──────────────────────────────────────────────────
if (isset($_POST['login_otp'])) {
    $submitted = trim($_POST['login_otp']);

    if (empty($_SESSION['login_otp']) || empty($_SESSION['login_user_id'])) {
        echo json_encode(['status' => 'Session expired. Please log in again.']);
        exit;
    }
    if (time() > ($_SESSION['login_otp_expiry'] ?? 0)) {
        unset($_SESSION['login_otp'], $_SESSION['login_user_id'], $_SESSION['login_otp_expiry']);
        echo json_encode(['status' => 'OTP expired. Please log in again.']);
        exit;
    }
    if ($submitted !== (string)$_SESSION['login_otp']) {
        echo json_encode(['status' => 'Invalid verification code. Please try again.']);
        exit;
    }

    // OTP correct — fetch user and complete login
    $uid  = (int)$_SESSION['login_user_id'];
    $select_sql = $has_phone_verified
        ? "SELECT idvet_users, first_name, last_name, middle_name, phone, user_address,
                  user_email, role, phone_verified
           FROM vet_users WHERE idvet_users = ? LIMIT 1"
        : "SELECT idvet_users, first_name, last_name, middle_name, phone, user_address,
                  user_email, role
           FROM vet_users WHERE idvet_users = ? LIMIT 1";

    $stmt = mysqli_prepare($conn, $select_sql);
    mysqli_stmt_bind_param($stmt, 'i', $uid);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $user   = mysqli_fetch_assoc($result);
    mysqli_stmt_close($stmt);

    if (!$user) {
        echo json_encode(['status' => 'User not found.']);
        exit;
    }

    $user['phone_verified'] = $has_phone_verified ? (int)($user['phone_verified'] ?? 0) : 0;

    // Mark phone as verified if this was first-time verification
    if ($has_phone_verified && !$user['phone_verified']) {
        $upd = mysqli_prepare($conn, "UPDATE vet_users SET phone_verified = 1 WHERE idvet_users = ?");
        mysqli_stmt_bind_param($upd, 'i', $uid);
        mysqli_stmt_execute($upd);
        mysqli_stmt_close($upd);
        $user['phone_verified'] = 1;
    }

    // Clear OTP session
    unset($_SESSION['login_otp'], $_SESSION['login_user_id'], $_SESSION['login_otp_expiry']);

    echo json_encode([
        'status'        => 'Login successful',
        'id'            => $user['idvet_users'],
        'first_name'    => $user['first_name'],
        'last_name'     => $user['last_name'],
        'middle_name'   => $user['middle_name'],
        'email'         => $user['user_email'],
        'phone'         => $user['phone'],
        'address'       => $user['user_address'],
        'role'          => $user['role'] ?? 'client',
        'phone_verified'=> $user['phone_verified'],
    ]);
    mysqli_close($conn);
    exit;
}

// ── Step 1: Credential check ──────────────────────────────────────────────────
$email    = trim($_POST['email2']    ?? '');
$password = trim($_POST['password1'] ?? '');

if (empty($email) || empty($password)) {
    echo json_encode(['status' => 'Email and password are required.']);
    mysqli_close($conn);
    exit;
}

// Fetch user by email — check both client and staff tables via role column
$select_sql = $has_phone_verified
    ? "SELECT idvet_users, first_name, last_name, middle_name, phone, user_address,
              user_email, user_pass, role, email_verified, phone_verified, status
       FROM vet_users WHERE user_email = ? LIMIT 1"
    : "SELECT idvet_users, first_name, last_name, middle_name, phone, user_address,
              user_email, user_pass, role, email_verified, status
       FROM vet_users WHERE user_email = ? LIMIT 1";

$stmt = mysqli_prepare($conn, $select_sql);
mysqli_stmt_bind_param($stmt, 's', $email);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);
$user   = mysqli_fetch_assoc($result);
mysqli_stmt_close($stmt);

if (!$user) {
    echo json_encode(['status' => 'No account found with that email address.']);
    mysqli_close($conn);
    exit;
}

// Check account status
if (isset($user['status']) && $user['status'] === 'deactivated') {
    echo json_encode(['status' => 'Your account has been deactivated. Please contact the clinic.']);
    mysqli_close($conn);
    exit;
}

// Verify password
if (!password_verify($password, $user['user_pass'])) {
    echo json_encode(['status' => 'Incorrect password. Please try again.']);
    mysqli_close($conn);
    exit;
}

$user['phone_verified'] = $has_phone_verified ? (int)($user['phone_verified'] ?? 0) : 0;
$role = $user['role'] ?? 'client';

// Staff (admin/clerk) skip email/OTP verification — log in directly
if ($role === 'admin' || $role === 'clerk') {
    echo json_encode([
        'status'        => 'Login successful',
        'id'            => $user['idvet_users'],
        'first_name'    => $user['first_name'],
        'last_name'     => $user['last_name'],
        'middle_name'   => $user['middle_name'],
        'email'         => $user['user_email'],
        'phone'         => $user['phone'],
        'address'       => $user['user_address'],
        'role'          => $role,
        'phone_verified'=> $user['phone_verified'] ?? 1,
    ]);
    mysqli_close($conn);
    exit;
}

// Client: check email verification
if (!$user['email_verified']) {
    echo json_encode([
        'status' => 'email_not_verified',
        'email'  => $user['user_email'],
    ]);
    mysqli_close($conn);
    exit;
}

// Client: generate OTP for SMS 2FA / first-time phone verification
$otp = rand(100000, 999999);
$_SESSION['login_otp']         = $otp;
$_SESSION['login_user_id']     = $user['idvet_users'];
$_SESSION['login_otp_expiry']  = time() + 300; // 5 minutes

// Mask phone for display: +63 9XX XXX X789 → +63 9** *** *789
$phone       = $user['phone'] ?? '';
$maskedPhone = preg_replace('/(\+\d{2}\s?\d)(\d+)(\d{3})/', '$1' . str_repeat('*', max(0, strlen($phone) - 6)) . '$3', $phone);

// Try to send OTP via Semaphore (reuse sms_otp logic inline)
$dev_otp = null;
define('SMS_LOGIN_ENABLED', false); // flip to true when Semaphore is live

if (SMS_LOGIN_ENABLED && !empty($phone)) {
    $apikey = getenv('SEMAPHORE_API_KEY') ?: 'e33a38c1825f4bb6b54f1e72b45c9593';
    $params = [
        'apikey'     => $apikey,
        'number'     => $phone,
        'message'    => "Your VHS login code is $otp. Valid for 5 minutes.",
        'sendername' => 'SEMAPHORE'
    ];
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, 'https://api.semaphore.co/api/v4/messages');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_exec($ch);
    curl_close($ch);
} else {
    // Dev bypass — return OTP so the frontend can auto-fill
    $dev_otp = $otp;
}

echo json_encode([
    'status'        => 'otp_required',
    'phone'         => $maskedPhone,
    'phone_verified'=> (int)($user['phone_verified'] ?? 0),
    'dev_otp'       => $dev_otp,   // null in production when SMS_LOGIN_ENABLED = true
]);

mysqli_close($conn);
?>
