<?php
require_once '../php_files/db.php';
$conn = getDB();

echo "<div style='font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 30px; text-align: center; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-top: 5px solid #4CAF50;'>";

if (isset($_GET['token'])) {
    $token = mysqli_real_escape_string($conn, $_GET['token']);

    $query = "SELECT * FROM vet_users WHERE verify_token = '$token' LIMIT 1";
    $result = mysqli_query($conn, $query);

    if (mysqli_num_rows($result) > 0) {
        $user = mysqli_fetch_assoc($result);
        
        if ($user['email_verified'] == 1) {
            echo "<h2 style='color: #333;'>Already Verified</h2>";
            echo "<p style='color: #666;'>This account has already been verified. You can return to the portal and log in.</p>";
        } else {
            // Nullifying the token on success makes sure the link expires after use
            $updateQuery = "UPDATE vet_users SET email_verified = 1, verify_token = NULL WHERE verify_token = '$token'";
            if (mysqli_query($conn, $updateQuery)) {
                echo "<h2 style='color: #4CAF50;'>Verification Successful!</h2>";
                echo "<p style='color: #666;'>Your email has been successfully verified. You can close this tab and log in now.</p>";
            } else {
                echo "<h2 style='color: #f44336;'>Database Error</h2>";
                echo "<p style='color: #666;'>Error updating verification status.</p>";
            }
        }
    } else {
        echo "<h2 style='color: #ff9800;'>Link Expired</h2>";
        echo "<p style='color: #666;'>Invalid or expired verification token.</p>";
    }
} else {
    echo "<h2 style='color: #f44336;'>Error</h2>";
    echo "<p style='color: #666;'>No verification token provided.</p>";
}

echo "</div>";
mysqli_close($conn);
?>