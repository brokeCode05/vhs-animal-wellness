<?php
require_once 'db.php';
$conn = getDB();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Optional filter: ?status=pending|scheduled|completed|canceled
$statusFilter = isset($_GET['status']) ? trim($_GET['status']) : '';

// Dynamically read allowed ENUM values from DB
$enumQuery = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'status'");
$allowedStatuses = ['pending', 'scheduled', 'completed', 'canceled']; // fallback
if ($enumQuery && $enumRow = mysqli_fetch_assoc($enumQuery)) {
    preg_match_all("/'([^']+)'/", $enumRow['Type'], $m);
    if (!empty($m[1])) $allowedStatuses = $m[1];
}

$where = '';
if ($statusFilter && in_array($statusFilter, $allowedStatuses)) {
    $statusFilter = mysqli_real_escape_string($conn, $statusFilter);
    $where = "WHERE a.status = '$statusFilter'";
}

// Detect correct service column name
$col_check   = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'vet_service'");
$service_col = (mysqli_num_rows($col_check) > 0) ? 'a.vet_service' : 'a.service';

// Use COALESCE to resolve owner: prefer a.user_id, fall back to pet's owner_id
$sql = "
    SELECT
        a.appointment_id,
        a.pet_id,
        a.staff_id,
        $service_col                                      AS service,
        a.appointment_date,
        a.appointment_time,
        a.notes,
        a.status,
        a.created_at,
        p.pet_name,
        p.pet_type,
        CONCAT(u.first_name, ' ', u.last_name)            AS owner_name,
        u.phone                                           AS owner_phone,
        CONCAT(s.staff_firstname, ' ', s.staff_lastname)  AS vet_name
    FROM appointments a
    LEFT JOIN pets      p  ON a.pet_id   = p.pet_id
    LEFT JOIN vet_users u  ON u.idvet_users = COALESCE(a.user_id, p.owner_id)
    LEFT JOIN staff     s  ON a.staff_id = s.staff_id
    $where
    ORDER BY a.appointment_date ASC, a.appointment_time ASC
";

$result = mysqli_query($conn, $sql);

if (!$result) {
    echo json_encode(['status' => 'error', 'message' => mysqli_error($conn)]);
    exit;
}

$appointments = [];
while ($row = mysqli_fetch_assoc($result)) {
    $appointments[] = [
        'id'          => (int)$row['appointment_id'],
        'pet_id'      => (int)$row['pet_id'],
        'staff_id'    => (int)$row['staff_id'],
        'service'     => $row['service']      ?? '',
        'date'        => $row['appointment_date'],
        'time'        => $row['appointment_time'],
        'notes'       => $row['notes']        ?? '',
        'status'      => $row['status']       ?? 'pending',
        'created_at'  => $row['created_at'],
        'owner_name'  => $row['owner_name']   ?? 'Unknown',
        'owner_phone' => $row['owner_phone']  ?? '',
        'pet_name'    => $row['pet_name']     ?? 'Unknown',
        'pet_type'    => $row['pet_type']     ?? '',
        'vet_name'    => $row['vet_name']     ?? 'Unknown',
    ];
}

echo json_encode(['status' => 'success', 'appointments' => $appointments]);
mysqli_close($conn);
?>
