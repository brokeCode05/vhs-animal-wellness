<?php
// Load the config FIRST so the constants exist
require_once __DIR__ . '/php_files/config.php';
require_once __DIR__ . '/php_files/db.php';

// Now you can safely call your function

$conn = getDB();

// Force browser to expect JSON and prevent errors from printing to the screen
header('Content-Type: application/json');
error_reporting(0); // Prevents PHP warnings from breaking JSON

require_once __DIR__ . '/php_files/config.php';
require_once __DIR__ . '/php_files/db.php';

$conn = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = mysqli_real_escape_string($conn, trim($_POST['email2'] ?? ''));
    $pass  = $_POST['password1'] ?? '';

    $result = mysqli_query($conn, "SELECT * FROM vet_users WHERE user_email='$email'");

    if (mysqli_num_rows($result) === 0) {
        echo json_encode(['success' => false, 'message' => 'Email does not exist']);
    } else {
        $user = mysqli_fetch_assoc($result);

        if (!password_verify($pass, $user['user_pass'])) {
            echo json_encode(['success' => false, 'message' => 'Wrong password']);
        } elseif ((int)$user['email_verified'] === 0) {
            echo json_encode(['success' => false, 'message' => 'Email not verified yet.']);
        } elseif ($user['status'] === 'pending') {
            echo json_encode(['success' => false, 'message' => 'Account pending approval.']);
        } else {
            echo json_encode([
                'success' => true,
                'message' => 'Login successful',
                'id'      => (int)$user['idvet_users']
            ]);
        }
    }
}
mysqli_close($conn);
exit();
?>
