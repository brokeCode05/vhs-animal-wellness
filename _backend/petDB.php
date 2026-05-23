<?php
header('Content-Type: text/plain');

require_once '../php_files/db.php';
$conn = getDB();

$owner_id = (int)($_POST['user_id']   ?? 0);
$pet_id   = (int)($_POST['pet_id']    ?? 0);
$petName  = mysqli_real_escape_string($conn, trim($_POST['petName']    ?? ''));
$species  = mysqli_real_escape_string($conn, trim($_POST['petSpecies'] ?? ''));
$breed    = mysqli_real_escape_string($conn, trim($_POST['petBreed']   ?? ''));
$age      = (int)($_POST['petAge']    ?? 0);
$gender   = mysqli_real_escape_string($conn, trim($_POST['petGender']  ?? ''));
$weight   = (float)($_POST['petWeight'] ?? 0);
$notes    = mysqli_real_escape_string($conn, trim($_POST['petNote']    ?? ''));

if (!$owner_id || !$petName || !$species) {
    echo "Error: Missing required fields"; exit;
}

// Handle photo upload
$photoPath = null;
if (!empty($_FILES['petPhoto']['tmp_name'])) {
    $uploadDir = __DIR__ . '/pet_photos/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
    $ext      = strtolower(pathinfo($_FILES['petPhoto']['name'], PATHINFO_EXTENSION));
    $filename = 'pet_' . time() . '_' . rand(100,999) . '.' . $ext;
    if (move_uploaded_file($_FILES['petPhoto']['tmp_name'], $uploadDir . $filename)) {
        $photoPath = mysqli_real_escape_string($conn, 'pet_photos/' . $filename);
    }
}

if ($pet_id) {
    // UPDATE
    $photoSql = $photoPath !== null ? ", pet_photo='$photoPath'" : "";
    $sql = "UPDATE pets SET pet_name='$petName', pet_type='$species', pet_breed='$breed',
            pet_age=$age, pet_gender='$gender', pet_weight=$weight, medical_notes='$notes' $photoSql
            WHERE pet_id=$pet_id AND owner_id=$owner_id";
} else {
    // INSERT
    $photo = $photoPath ?? '';
    $sql = "INSERT INTO pets (pet_name, pet_type, pet_breed, pet_age, pet_gender, pet_weight, owner_id, medical_notes, pet_photo)
            VALUES ('$petName','$species','$breed',$age,'$gender',$weight,$owner_id,'$notes','$photo')";
}

echo mysqli_query($conn, $sql) ? "Success" : "Error: " . mysqli_error($conn);
mysqli_close($conn);
?>