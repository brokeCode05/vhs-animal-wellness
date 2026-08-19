<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'db.php';
$conn = getDB();

$id = (int)($_GET['id'] ?? 0);
if (!$id) { http_response_code(400); echo json_encode(['message' => 'Missing ID']); exit; }

$r = mysqli_query($conn, "SELECT * FROM vet_users WHERE idvet_users = $id");
if (!$r || mysqli_num_rows($r) === 0) { http_response_code(404); echo json_encode(['message' => 'User not found']); exit; }
$user = mysqli_fetch_assoc($r);

$pets = [];
$rp = mysqli_query($conn, "SELECT pet_id, pet_name, pet_type, pet_breed, pet_age FROM pets WHERE owner_id = $id");
while ($row = mysqli_fetch_assoc($rp)) {
    $pets[] = [
        'id'    => (int)$row['pet_id'],
        'name'  => $row['pet_name'],
        'type'  => $row['pet_type'],
        'breed' => $row['pet_breed'] ?? '—',
        'age'   => $row['pet_age']   ?? '—',
    ];
}

echo json_encode([
    'id'         => (int)$user['idvet_users'],
    'fullName'   => trim($user['first_name'] . ' ' . $user['last_name']),
    'email'      => $user['user_email'],
    'phone'      => $user['phone']        ?? '—',
    'address'    => $user['user_address'] ?? '—',
    'bday'       => $user['birthday']     ?? '—',
    'created_at' => $user['created_at']   ?? '—',
    'pets'       => $pets,
]);
mysqli_close($conn);
?>
