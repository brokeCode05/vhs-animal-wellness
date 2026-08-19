<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'db.php';
$conn = getDB();

$status = $_GET['status'] ?? null;
$where  = $status ? "WHERE status = '" . mysqli_real_escape_string($conn, $status) . "'" : "";

$users = [];
$result = mysqli_query($conn, "SELECT * FROM vet_users $where ORDER BY created_at ASC");
while ($row = mysqli_fetch_assoc($result)) {
    $users[] = [
        'id'         => (int)$row['idvet_users'],
        'fullName'   => trim($row['first_name'] . ' ' . ($row['middle_name'] ? $row['middle_name'] . ' ' : '') . $row['last_name']),
        'email'      => $row['user_email'],
        'phone'      => $row['phone'] ?? '',
        'address'    => $row['user_address'] ?? '',
        'bday'       => $row['birthday'] ?? '',
        'status'     => $row['status'] ?? 'pending',
        'created_at' => $row['created_at'] ?? '',
    ];
}
echo json_encode($users);
mysqli_close($conn);
?>
