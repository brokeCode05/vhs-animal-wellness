<?php
require_once __DIR__ . '/php_files/db.php';
$conn = getDB();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$user_id = (int)($_GET['user_id'] ?? 0);

if ($user_id <= 0) {
    echo json_encode(['status' => 'error', 'message' => 'Missing user_id']);
    exit;
}

// Detect correct service column name
$col_check   = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'vet_service'");
$service_col = (mysqli_num_rows($col_check) > 0) ? 'a.vet_service' : 'a.service';

$sql = "
    SELECT DISTINCT
        a.appointment_id,
        $service_col        AS service,
        a.appointment_date,
        a.appointment_time,
        a.notes,
        a.status,
        p.pet_name,
        p.pet_type,
        CONCAT(s.staff_firstname, ' ', s.staff_lastname) AS vet_name
    FROM appointments a
    LEFT JOIN pets  p ON a.pet_id   = p.pet_id
    LEFT JOIN staff s ON a.staff_id = s.staff_id
    WHERE a.user_id = $user_id
       OR (a.user_id IS NULL AND p.owner_id = $user_id)
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
";

$result = mysqli_query($conn, $sql);

if (!$result) {
    echo json_encode(['status' => 'error', 'message' => mysqli_error($conn)]);
    exit;
}

$appointments = [];
while ($row = mysqli_fetch_assoc($result)) {
    $appointments[] = [
        'id'       => (int)$row['appointment_id'],
        'service'  => $row['service'],
        'date'     => $row['appointment_date'],
        'time'     => $row['appointment_time'],
        'notes'    => $row['notes'],
        'status'   => $row['status'],
        'pet_name' => $row['pet_name'] ?? '—',
        'pet_type' => $row['pet_type'] ?? '',
        'vet_name' => $row['vet_name'] ?? '—',
    ];
}

echo json_encode(['status' => 'success', 'appointments' => $appointments]);
mysqli_close($conn);
?>
