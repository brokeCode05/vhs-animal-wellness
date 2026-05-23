<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'db.php';
$conn = getDB();

$sql = "SELECT p.pet_id, p.pet_name, p.pet_type, p.pet_breed, p.pet_age, p.pet_gender,
               p.pet_weight, p.medical_notes, p.pet_photo, p.created_at,
               CONCAT(u.first_name, ' ', u.last_name) AS owner_name
        FROM pets p
        LEFT JOIN vet_users u ON p.owner_id = u.idvet_users
        ORDER BY p.created_at DESC";

$result = mysqli_query($conn, $sql);
if (!$result) { http_response_code(500); echo json_encode(['message' => mysqli_error($conn)]); exit; }

$pets = [];
while ($row = mysqli_fetch_assoc($result)) {
    $pets[] = [
        'id'        => (int)$row['pet_id'],
        'name'      => $row['pet_name'],
        'type'      => $row['pet_type'],
        'breed'     => $row['pet_breed']     ?? '',
        'age'       => $row['pet_age']       ?? '',
        'gender'    => $row['pet_gender']    ?? '',
        'weight'    => $row['pet_weight']    ?? '',
        'notes'     => $row['medical_notes'] ?? '',
        'photo'     => $row['pet_photo']     ?? '',
        'ownerName' => $row['owner_name']    ?? '—',
    ];
}
echo json_encode($pets);
mysqli_close($conn);
?>
