<?php
require_once '../php_files/db.php';
$conn = getDB();

$title   = 'Email Verification';
$iconSvg = '';
$heading = '';
$message = '';
$color   = '#6d4ab1';
$success = false;

if (isset($_GET['token'])) {
    $token  = mysqli_real_escape_string($conn, $_GET['token']);
    $result = mysqli_query($conn, "SELECT * FROM vet_users WHERE verify_token = '$token' LIMIT 1");

    if (mysqli_num_rows($result) > 0) {
        $user = mysqli_fetch_assoc($result);

        if ((int)$user['email_verified'] === 1) {
            $iconSvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            $heading = 'Already Verified';
            $message = 'This account has already been verified. You can log in now.';
            $color   = '#10b981';
            $success = true;
        } else {
            $update = mysqli_query($conn,
                "UPDATE vet_users SET email_verified = 1, verify_token = NULL WHERE verify_token = '$token'"
            );
            if ($update) {
                $iconSvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
                $heading = 'Email Verified!';
                $message = 'Your email has been successfully verified. You can now log in to your account.';
                $color   = '#10b981';
                $success = true;
            } else {
                $iconSvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
                $heading = 'Database Error';
                $message = 'Something went wrong while verifying your account. Please try again or contact support.';
                $color   = '#ef4444';
            }
        }
    } else {
        $iconSvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        $heading = 'Link Expired';
        $message = 'This verification link is invalid or has already been used. Please register again or contact support.';
        $color   = '#f59e0b';
    }
} else {
    $iconSvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    $heading = 'Invalid Link';
    $message = 'No verification token was provided.';
    $color   = '#ef4444';
}

mysqli_close($conn);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars($heading) ?> — VHS Animal Wellness Center</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #170741 0%, #2d1b69 50%, #6d4ab1 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .card {
      background: #ffffff;
      border-radius: 1.25rem;
      box-shadow: 0 24px 80px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 440px;
      overflow: hidden;
      text-align: center;
    }
    .card-accent {
      height: 5px;
      background: <?= $color ?>;
    }
    .card-body {
      padding: 2.5rem 2rem 2rem;
    }
    .icon-wrap {
      width: 5rem;
      height: 5rem;
      border-radius: 50%;
      background: <?= $color ?>18;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
      border: 2px solid <?= $color ?>30;
    }
    h1 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #111827;
      margin-bottom: 0.75rem;
    }
    p {
      font-size: 0.95rem;
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 1.75rem;
    }
    .btn {
      display: inline-block;
      padding: 0.75rem 2rem;
      background: linear-gradient(135deg, #6d4ab1, #8b5cf6);
      color: #fff;
      text-decoration: none;
      border-radius: 0.625rem;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 4px 14px rgba(109,74,177,0.35);
      transition: box-shadow 0.2s, transform 0.2s;
    }
    .btn:hover {
      box-shadow: 0 6px 20px rgba(109,74,177,0.5);
      transform: translateY(-1px);
    }
    .footer {
      padding: 1rem 2rem 1.5rem;
      font-size: 0.8rem;
      color: #9ca3af;
    }
    .brand {
      font-size: 0.85rem;
      font-weight: 600;
      color: #6d4ab1;
      margin-bottom: 0.25rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-accent"></div>
    <div class="card-body">
      <div class="icon-wrap" style="color:<?= $color ?>;"><?= $iconSvg ?></div>
      <h1><?= htmlspecialchars($heading) ?></h1>
      <p><?= htmlspecialchars($message) ?></p>
      <?php if ($success): ?>
        <a href="index.html" class="btn">Go to Login</a>
      <?php else: ?>
        <a href="index.html" class="btn">Back to Home</a>
      <?php endif; ?>
    </div>
    <div class="footer">
      <div class="brand">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:0.3rem;"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        VHS Animal Wellness Center
      </div>
      This is an automated verification email.
    </div>
  </div>
</body>
</html>
