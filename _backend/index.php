<?php
<?php

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Set header to JSON so JavaScript can parse it correctly
header('Content-Type: application/json');

require_once __DIR__ . '/php_files/db.php';
require_once __DIR__ . '/php_files/config.php';

$conn = getDB();

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    // Basic sanitization
    $fname   = trim($_POST["firstName2"]  ?? '');
    $lname   = trim($_POST["lastName2"]   ?? '');
    $mname   = trim($_POST["middleName2"] ?? '');
    $phone   = trim($_POST["phone2"]      ?? '');
    $email   = trim($_POST["email3"]      ?? '');
    $address = trim($_POST["address"]     ?? '');
    $dob     = trim($_POST["dob"]         ?? '');
    $pass    = $_POST["password2"]        ?? '';

    // 1. Check if email exists (Using Prepared Statement)
    $stmt = $conn->prepare("SELECT user_email FROM vet_users WHERE user_email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        echo json_encode(['success' => false, 'message' => 'This email is already registered.']);
        exit;
    }

    // 2. Insert User (Using Prepared Statement)
    $hash = password_hash($pass, PASSWORD_BCRYPT);
    $token = bin2hex(random_bytes(16));
    
    $stmt = $conn->prepare("INSERT INTO vet_users (first_name, last_name, middle_name, phone, user_address, user_email, user_pass, birthday, status, email_verified, verify_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 0, ?)");
    $stmt->bind_param("sssssssss", $fname, $lname, $mname, $phone, $address, $email, $hash, $dob, $token);

    iif ($stmt->execute()) {

    // 3. Send Email
    require_once __DIR__ . '/PHPMailer-7.1.1/src/PHPMailer.php';
    require_once __DIR__ . '/PHPMailer-7.1.1/src/SMTP.php';
    require_once __DIR__ . '/PHPMailer-7.1.1/src/Exception.php';

    $mail = new PHPMailer(true);

    try {

        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            ? 'https'
            : 'http';

        $verifyLink = $protocol . '://' . $_SERVER['HTTP_HOST']
            . dirname($_SERVER['PHP_SELF'])
            . '/verify.php?token=' . $token;

        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = MAIL_PORT;

        $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
        $mail->addAddress($email);

        $mail->isHTML(true);
        $mail->Subject = 'Verify Your Email';

        $mail->Body = "
            <h3>Welcome, $fname!</h3>
            <p>Click the link below to verify your account:</p>
            <a href='$verifyLink'>$verifyLink</a>
        ";

        // TEMP DEBUG
        $mail->SMTPDebug = 2;
        $mail->Debugoutput = 'html';

        $mail->send();

        echo json_encode([
            'success' => true,
            'message' => 'Registration successful! Please check your email.'
        ]);

    } catch (Exception $e) {

        echo json_encode([
            'success' => false,
            'message' => $mail->ErrorInfo
        ]);
    }

} else {

    echo json_encode([
        'success' => false,
        'message' => 'Database error: ' . $conn->error
    ]);
}
}
$conn->close();
?>
