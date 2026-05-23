<?php
header('Content-Type: application/json');

require_once 'db.php';
$conn = getDB();

// Add profile_photo column if missing
$col = mysqli_query($conn, "SHOW COLUMNS FROM vet_users LIKE 'profile_photo'");
if (mysqli_num_rows($col) === 0) {
    mysqli_query($conn, "ALTER TABLE vet_users ADD COLUMN profile_photo VARCHAR(255) DEFAULT ''");
}

$id      = (int)($_POST['id']      ?? 0);
$phone   = mysqli_real_escape_string($conn, trim($_POST['phone']   ?? ''));
$address = mysqli_real_escape_string($conn, trim($_POST['address'] ?? ''));
$newPass = $_POST['new_password'] ?? '';

if (!$id) { echo json_encode(["status" => "error", "message" => "Missing user ID"]); exit; }

$photoSql = '';
if (!empty($_FILES['profile_photo']['tmp_name'])) {
    $uploadDir = __DIR__ . '/../user/profile_photos/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
    $ext      = strtolower(pathinfo($_FILES['profile_photo']['name'], PATHINFO_EXTENSION));
    $filename = 'user_' . $id . '_' . time() . '.' . $ext;
    if (move_uploaded_file($_FILES['profile_photo']['tmp_name'], $uploadDir . $filename)) {
        $path = mysqli_real_escape_string($conn, 'profile_photos/' . $filename);
        $photoSql = ", profile_photo='$path'";
    }
}

$passSql = '';
if (!empty($newPass)) {
    $hashed  = mysqli_real_escape_string($conn, password_hash($newPass, PASSWORD_DEFAULT));
    $passSql = ", user_pass='$hashed'";
}

$sql = "UPDATE vet_users SET phone='$phone', user_address='$address' $passSql $photoSql WHERE idvet_users=$id";

if (mysqli_query($conn, $sql)) {
    $photoPath = '';
    if ($photoSql) {
        $r = mysqli_query($conn, "SELECT profile_photo FROM vet_users WHERE idvet_users=$id");
        $row = mysqli_fetch_assoc($r);
        $photoPath = $row['profile_photo'] ?? '';
    }
    echo json_encode(["status" => "success", "photo" => $photoPath]);
} else {
    echo json_encode(["status" => "error", "message" => mysqli_error($conn)]);
}
mysqli_close($conn);
?>
