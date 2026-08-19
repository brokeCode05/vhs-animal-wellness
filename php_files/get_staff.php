<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'db.php';
$conn = getDB();

$role_filter = $_GET['role'] ?? null;
$where = $role_filter
    ? "WHERE staff_role = '" . mysqli_real_escape_string($conn, $role_filter) . "'"
    : "";

$staff = [];
$result = mysqli_query($conn,
    "SELECT staff_id, staff_lastname, staff_firstname, staff_middlename,
            staff_email, contact_number, staff_role, created_at
     FROM staff $where ORDER BY created_at ASC"
);

if (!$result) { echo json_encode([]); exit; }

while ($row = mysqli_fetch_assoc($result)) {
    $staff[] = [
        'id'         => (int)$row['staff_id'],
        'fullName'   => trim($row['staff_firstname'] . ' ' . $row['staff_lastname']),
        'email'      => $row['staff_email'],
        'phone'      => $row['contact_number'] ?? '',
        'role'       => $row['staff_role'],
        'created_at' => $row['created_at'] ?? '',
    ];
}
echo json_encode($staff);
mysqli_close($conn);
?>
