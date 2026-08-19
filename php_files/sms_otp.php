<?php
session_start();
header('Content-Type: application/json');
error_reporting(0);
ini_set('display_errors', 0);

// ─────────────────────────────────────────────────────────────────────────────
//  SMS_OTP_ENABLED — set to true once Semaphore account is approved & credited.
//  While false, OTP send is skipped and a bypass token is returned so the
//  registration form can complete without a real SMS.
// ─────────────────────────────────────────────────────────────────────────────
define('SMS_OTP_ENABLED', false);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method.']);
    exit;
}

if (!isset($_POST['phone2'])) {
    echo json_encode(['status' => 'error', 'message' => 'Missing phone number parameter.']);
    exit;
}

$number   = $_POST['phone2'];
$otp_code = rand(100000, 999999);

// Always store in session so the registration form can verify it
$_SESSION['generated_otp'] = $otp_code;
$_SESSION['otp_expiry']    = time() + 300; // 5 minutes

if (!SMS_OTP_ENABLED) {
    // Semaphore not ready — return the code directly so the form auto-fills
    // and registration can proceed. Remove dev_otp in production.
    echo json_encode([
        'status'  => 'success',
        'dev_otp' => $otp_code,
        'note'    => 'SMS disabled — using dev bypass'
    ]);
    exit;
}

// ── Live SMS send via Semaphore ───────────────────────────────────────────────
$apikey = 'e33a38c1825f4bb6b54f1e72b45c9593';
$params = [
    'apikey'     => $apikey,
    'number'     => $number,
    'message'    => "Your VHS verification code is $otp_code. Valid for 5 minutes.",
    'sendername' => 'SEMAPHORE'
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'https://api.semaphore.co/api/v4/messages');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$response = curl_exec($ch);
$curl_err  = curl_error($ch);
curl_close($ch);

// Check Semaphore response for errors
if ($curl_err) {
    echo json_encode(['status' => 'error', 'message' => 'Could not reach SMS gateway. Please try again.']);
    exit;
}

$semaphore = json_decode($response, true);
// Semaphore returns an array of message objects on success
if (is_array($semaphore) && isset($semaphore[0]['message_id'])) {
    echo json_encode(['status' => 'success']);
} else {
    // Return the raw Semaphore error so it's visible during testing
    $errMsg = isset($semaphore['message']) ? $semaphore['message'] : 'SMS gateway rejected the request.';
    echo json_encode(['status' => 'error', 'message' => $errMsg]);
}
?>
