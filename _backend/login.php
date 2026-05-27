<?php
// Ensure the browser expects JSON and errors are captured
header('Content-Type: application/json');
require_once __DIR__ . '/php_files/config.php';
require_once __DIR__ . '/php_files/db.php';

$conn = getDB();
$response = ['success' => false, 'message' => 'An unexpected error occurred.'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = mysqli_real_escape_string($conn, trim($_POST['email2'] ?? ''));
    $pass  = $_POST['password1'] ?? '';

    $stmt = $conn->prepare("SELECT idvet_users, user_pass, email_verified, status FROM vet_users WHERE user_email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        $response['message'] = 'Email does not exist.';
    } else {
        $user = $result->fetch_assoc();
        if (!password_verify($pass, $user['user_pass'])) {
            $response['message'] = 'Wrong password.';
        } elseif ((int)$user['email_verified'] === 0) {
            $response['message'] = 'Please verify your email first.';
        } elseif ($user['status'] === 'pending') {
            $response['message'] = 'Account pending admin approval.';
        } else {
            $response = ['success' => true, 'message' => 'Login successful.'];
        }
    }
    $stmt->close();
}

echo json_encode($response);
$conn->close();
exit();
?>
