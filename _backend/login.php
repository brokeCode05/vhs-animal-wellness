<?php
require_once __DIR__ . '/php_files/db.php';
$conn = getDB();

if (isset($_POST['email2']) && isset($_POST['password1'])) {
    $email = mysqli_real_escape_string($conn, trim($_POST['email2']));
    $pass  = $_POST['password1'];

    $result = mysqli_query($conn, "SELECT * FROM vet_users WHERE user_email='$email'");

    if (mysqli_num_rows($result) === 0) {
        echo json_encode(['status' => 'Email does not exist']);
    } else {
        $user = mysqli_fetch_assoc($result);

        if (!password_verify($pass, $user['user_pass'])) {
            echo json_encode(['status' => 'Wrong password']);
        } 
        // 🛑 NEW CHECKPOINT: Block users if their email verification is still 0
        elseif (isset($user['email_verified']) && (int)$user['email_verified'] === 0) {
            echo json_encode(['status' => 'Your email address has not been verified yet. Please check your inbox for the link.']);
        } 
        elseif (isset($user['status']) && $user['status'] === 'pending') {
            echo json_encode(['status' => 'Your account is pending approval by the admin.']);
        } 
        elseif (isset($user['status']) && $user['status'] === 'rejected') {
            echo json_encode(['status' => 'Your account has been rejected. Please contact the clinic.']);
        } 
        else {
            echo json_encode([
                'status'      => 'Login successful',
                'id'          => (int)$user['idvet_users'],
                'first_name'  => $user['first_name'],
                'last_name'   => $user['last_name'],
                'middle_name' => $user['middle_name'] ?? '',
                'email'       => $user['user_email'],
                'phone'       => $user['phone'] ?? '',
                'address'     => $user['user_address'] ?? '',
                'role'        => $user['role'] ?? 'user',
            ]);
        }
    }
}
mysqli_close($conn);
?>
