<?php
session_start();
require_once '../php_files/db.php';   // Also loads config.php
require_once '../php_files/config.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

header('Content-Type: application/json');

// ─────────────────────────────────────────────────────────────────────────────
//  SMS_OTP_ENABLED — set to true once Semaphore account is approved & credited.
//  While false, SMS registration skips OTP check and registers immediately.
// ─────────────────────────────────────────────────────────────────────────────
define('SMS_OTP_ENABLED', true);

$conn = getDB();

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Collect and clean basic text string attributes
    $fname   = trim($_POST["firstName2"]  ?? '');
    $lname   = trim($_POST["lastName2"]   ?? '');
    $mname   = trim($_POST["middleName2"] ?? '');
    $phone   = trim($_POST["phone2"]      ?? '');
    $email   = trim($_POST["email3"]      ?? '');
    $address = trim($_POST["address"]     ?? '');
    $dob     = trim($_POST["dob"]         ?? '');
    
    $method  = trim($_POST["verificationMethod"] ?? 'email');
    $otpCode = trim($_POST["otpCode"] ?? '');

    if (empty($email) || empty($_POST["password2"])) {
        echo json_encode(['status' => 'Required fields are missing.']);
        mysqli_close($conn);
        exit;
    }

    // Fix: Convert the Email existence verification check to a safe prepared statement
    $checkStmt = mysqli_prepare($conn, "SELECT user_email FROM vet_users WHERE user_email = ? LIMIT 1");
    mysqli_stmt_bind_param($checkStmt, 's', $email);
    mysqli_stmt_execute($checkStmt);
    mysqli_stmt_store_result($checkStmt);

    if (mysqli_stmt_num_rows($checkStmt) > 0) {
        echo json_encode(['status' => 'This email address is already registered.']);
        mysqli_stmt_close($checkStmt);
    } else {
        mysqli_stmt_close($checkStmt);

        // Evaluate mobile authentication token matches
        // Only enforce OTP check when Semaphore is active
        if ($method === 'sms' && SMS_OTP_ENABLED) {
            if (empty($_SESSION['generated_otp']) || $_SESSION['generated_otp'] != $otpCode || time() > $_SESSION['otp_expiry']) {
                echo json_encode(['status' => 'Invalid or expired OTP verification code.']);
                mysqli_close($conn);
                exit;
            }
        }

        // When SMS is disabled, treat SMS registrations as email-verified immediately
        // (they provided a phone number, account is ready to use)
        $effective_method = (!SMS_OTP_ENABLED && $method === 'sms') ? 'sms_bypass' : $method;

        // Hash the password — safe to pass into standard parameterized inputs
        $pass = password_hash($_POST["password2"], PASSWORD_BCRYPT, ['cost' => 10]);
        
        $email_verified = ($method === 'sms' || $effective_method === 'sms_bypass') ? 1 : 0;
        $phone_verified = ($method === 'sms' || $effective_method === 'sms_bypass') ? 1 : 0;
        $token = ($email_verified === 1) ? NULL : bin2hex(random_bytes(16));

        // Check if phone_verified column exists (added by migration)
        $col_check = mysqli_query($conn, "SHOW COLUMNS FROM vet_users LIKE 'phone_verified'");
        $has_phone_verified = ($col_check && mysqli_num_rows($col_check) > 0);

        if ($has_phone_verified) {
            $stmt = mysqli_prepare($conn,
                "INSERT INTO vet_users (first_name, last_name, middle_name, phone, user_address, user_email, user_pass, birthday, status, email_verified, phone_verified, verify_token)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)"
            );
            // 11 params: ssssssssii s
            mysqli_stmt_bind_param($stmt, 'ssssssssiis', $fname, $lname, $mname, $phone, $address, $email, $pass, $dob, $email_verified, $phone_verified, $token);
        } else {
            // Fallback: column not yet added — insert without phone_verified
            $stmt = mysqli_prepare($conn,
                "INSERT INTO vet_users (first_name, last_name, middle_name, phone, user_address, user_email, user_pass, birthday, status, email_verified, verify_token)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
            );
            // 10 params: ssssssssis
            mysqli_stmt_bind_param($stmt, 'ssssssssis', $fname, $lname, $mname, $phone, $address, $email, $pass, $dob, $email_verified, $token);
        }

        if (!$stmt) {
            echo json_encode(['status' => 'Database prepare error: ' . mysqli_error($conn)]);
            mysqli_close($conn);
            exit;
        }

        $ok = mysqli_stmt_execute($stmt);
        mysqli_stmt_close($stmt);

        if ($ok) {
            if ($method === 'sms' && SMS_OTP_ENABLED) {
                // Real SMS OTP was verified — clear session
                unset($_SESSION['generated_otp']);
                unset($_SESSION['otp_expiry']);
                echo json_encode(['status' => 'Success_SMS']);
            } elseif ($effective_method === 'sms_bypass') {
                // SMS disabled — registered with phone, account auto-verified
                echo json_encode(['status' => 'Success_SMS']);
            } else {
                // Incorporate dynamic path matching for local PHPMailer dependencies
                require '../PHPMailer-7.1.1/src/PHPMailer.php';
                require '../PHPMailer-7.1.1/src/SMTP.php';
                require '../PHPMailer-7.1.1/src/Exception.php';

                $mail = new PHPMailer(true);
                try {
                    $protocol   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $scriptDir  = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
                    $verifyLink = $protocol . '://' . $_SERVER['HTTP_HOST'] . $scriptDir . '/verify.php?token=' . $token;

                    $mail->isSMTP();
                    $mail->Host       = MAIL_HOST;
                    $mail->SMTPAuth   = true;
                    $mail->Username   = MAIL_USERNAME;
                    $mail->Password   = MAIL_PASSWORD;
                    $mail->SMTPSecure = 'tls';
                    $mail->Port       = MAIL_PORT;

                    $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
                    $mail->addAddress($email);

                    $mail->isHTML(true);
                    $mail->Subject = 'Verify Your Email — VHS Animal Wellness Center';
                    $mail->Body    = "
<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='background:#f3f4f6;padding:2rem 1rem;'>
    <tr><td align='center'>
      <table width='560' cellpadding='0' cellspacing='0' style='background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);'>
        <tr>
          <td style='background:linear-gradient(135deg,#6d4ab1,#8b5cf6);padding:2rem;text-align:center;'>
            <h1 style='color:#ffffff;margin:0;font-size:1.5rem;'>🐾 VHS Animal Wellness Center</h1>
            <p style='color:rgba(255,255,255,0.85);margin:0.5rem 0 0;font-size:0.95rem;'>Email Verification</p>
          </td>
        </tr>
        <tr>
          <td style='padding:2rem;'>
            <p style='color:#374151;font-size:1rem;margin:0 0 1rem;'>Hi <strong>" . htmlspecialchars($fname) . "</strong>,</p>
            <p style='color:#374151;font-size:0.95rem;line-height:1.6;margin:0 0 1.5rem;'>
              Thank you for registering! Please verify your email address by clicking the button below to activate your account.
            </p>
            <div style='text-align:center;margin-bottom:1.5rem;'>
              <a href='$verifyLink'
                 style='display:inline-block;padding:0.75rem 2rem;background:linear-gradient(135deg,#6d4ab1,#8b5cf6);
                        color:#fff;text-decoration:none;border-radius:8px;font-size:0.95rem;
                        font-weight:600;box-shadow:0 4px 14px rgba(109,74,177,0.35);'>
                Verify My Email
              </a>
            </div>
            <p style='color:#6b7280;font-size:0.85rem;line-height:1.6;margin:0;'>
              This link will expire after use. If you did not create this account, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style='background:#f9fafb;padding:1.25rem 2rem;text-align:center;border-top:1px solid #e5e7eb;'>
            <p style='color:#9ca3af;font-size:0.8rem;margin:0;'>
              VHS Animal Wellness Center &nbsp;|&nbsp; This is an automated email, please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";
                    $mail->AltBody = "Hi $fname! Verify your email here: $verifyLink";

                    $mail->send();
                    echo json_encode(['status' => 'Success']);

                } catch (Exception $e) {
                    // Record inserted successfully into DB. Fail silently to client script framework if mailing fails.
                    echo json_encode(['status' => 'Success']);
                }
            }
        } else {
            echo json_encode(['status' => 'Database error during account processing.']);
        }
    }
}

mysqli_close($conn);
?>