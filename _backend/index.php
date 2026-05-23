<?php
require_once '../php_files/db.php';   // also loads config.php
require_once '../php_files/config.php';
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$conn = getDB();

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $fname   = mysqli_real_escape_string($conn, trim($_POST["firstName2"]  ?? ''));
    $lname   = mysqli_real_escape_string($conn, trim($_POST["lastName2"]   ?? ''));
    $mname   = mysqli_real_escape_string($conn, trim($_POST["middleName2"] ?? ''));
    $phone   = mysqli_real_escape_string($conn, trim($_POST["phone2"]      ?? ''));
    $email   = mysqli_real_escape_string($conn, trim($_POST["email3"]      ?? ''));
    $address = mysqli_real_escape_string($conn, trim($_POST["address"]     ?? ''));
    $dob     = mysqli_real_escape_string($conn, trim($_POST["dob"]         ?? ''));

    // Check if email already exists
    $checkEmail = mysqli_query($conn, "SELECT user_email FROM vet_users WHERE user_email = '$email'");
    if (mysqli_num_rows($checkEmail) > 0) {
        echo "Error: This email address is already registered.";
    } else {
        // Hash BEFORE escaping
        $pass = password_hash($_POST["password2"] ?? '', PASSWORD_BCRYPT, ['cost' => 10]);
        $pass = mysqli_real_escape_string($conn, $pass);
        $token = bin2hex(random_bytes(16));

        $sql = "INSERT INTO vet_users (first_name, last_name, middle_name, phone, user_address, user_email, user_pass, birthday, status, email_verified, verify_token)
                VALUES ('$fname','$lname','$mname','$phone','$address','$email','$pass','$dob','approved',0,'$token')";

        if (mysqli_query($conn, $sql)) {
            require '../PHPMailer-7.1.1/src/PHPMailer.php';
            require '../PHPMailer-7.1.1/src/SMTP.php';
            require '../PHPMailer-7.1.1/src/Exception.php';

            $mail = new PHPMailer(true);
            try {
                // Build verify link dynamically — works on localhost and any live domain
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
                    <h3>Welcome, $fname!</h3>
                    <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
                    <p>
                      <a href='$verifyLink'
                         style='display:inline-block;padding:10px 20px;background:#4CAF50;color:#fff;
                                text-decoration:none;border-radius:5px;font-weight:bold;'>
                        Verify Email
                      </a>
                    </p>
                    <p style='color:#888;font-size:0.85em;'>If you did not create this account, you can safely ignore this email.</p>
                ";
                $mail->AltBody = "Welcome $fname! Verify your email: $verifyLink";

                $mail->send();
                echo "Success";

            } catch (Exception $e) {
                // DB insert succeeded — treat as success even if email fails
                echo "Success";
            }
        } else {
            echo "Error: " . mysqli_error($conn);
        }
    }
}

mysqli_close($conn);
?>
