<?php
header('Content-Type: application/json');
require_once __DIR__ . '/php_files/db.php';
$conn = getDB();

$user_id = (int)($_GET['user_id'] ?? 0);
if (!$user_id) { echo json_encode([]); exit; }

$pets = [];
$result = mysqli_query($conn,
    "SELECT pet_id, pet_name, pet_type, pet_breed, pet_age, pet_gender, pet_weight, medical_notes, pet_photo
     FROM pets WHERE owner_id = $user_id ORDER BY pet_id DESC"
);

if (!$result) { echo json_encode([]); exit; }

while ($row = mysqli_fetch_assoc($result)) {
    $pets[] = [
        'id'     => (int)$row['pet_id'],
        'name'   => $row['pet_name'],
        'type'   => $row['pet_type'],
        'breed'  => $row['pet_breed']    ?? '',
        'age'    => $row['pet_age']      ?? '',
        'gender' => $row['pet_gender']   ?? '',
        'weight' => $row['pet_weight']   ?? '',
        'notes'  => $row['medical_notes'] ?? '',
        'photo'  => $row['pet_photo']    ?? '',
    ];
}
echo json_encode($pets);
mysqli_close($conn);
?>
