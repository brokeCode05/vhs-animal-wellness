<?php
// Ensure this file sends JSON headers
header('Content-Type: application/json');

require_once __DIR__ . '/php_files/config.php';
require_once __DIR__ . '/php_files/db.php';

$conn = getDB();

// Initialize the response structure
$response = ['success' => false, 'message' => 'Invalid request'];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['email2'], $_POST['password1'])) {
    $email = mysqli_real_escape_string($conn, trim($_POST['email2']));
    $pass  = $_POST['password1'];

    $result = mysqli_query($conn, "SELECT * FROM vet_users WHERE user_email='$email'");

    if (mysqli_num_rows($result) === 0) {
        $response = ['success' => false, 'message' => 'Email does not exist'];
    } else {
        $user = mysqli_fetch_assoc($result);

        if (!password_verify($pass, $user['user_pass'])) {
            $response = ['success' => false, 'message' => 'Wrong password'];
        } elseif ((int)$user['email_verified'] === 0) {
            $response = ['success' => false, 'message' => 'Please verify your email first.'];
        } elseif ($user['status'] === 'pending') {
            $response = ['success' => false, 'message' => 'Account pending approval.'];
        } else {
            $response = ['success' => true, 'message' => 'Login successful'];
        }
    }
}

// Always echo just one JSON string at the end
echo json_encode($response);
mysqli_close($conn);
exit();
?>
