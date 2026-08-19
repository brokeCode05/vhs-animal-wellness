<?php
require_once 'db.php';
$conn = getDB();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['status' => 'error', 'message' => 'POST required']);
    exit;
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data) {
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
    exit;
}

$id        = (int)($data['id']     ?? 0);
$newStatus = trim($data['status']  ?? '');

if ($id <= 0 || empty($newStatus)) {
    echo json_encode(['status' => 'error', 'message' => 'Missing id or status']);
    exit;
}

// Dynamically fetch allowed ENUM values from the actual DB schema
$allowed   = [];
$enumQuery = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'status'");
if ($enumQuery && $row = mysqli_fetch_assoc($enumQuery)) {
    // e.g. "enum('pending','scheduled','completed','canceled')"
    preg_match_all("/'([^']+)'/", $row['Type'], $matches);
    $allowed = $matches[1] ?? [];
}

// Fallback if SHOW COLUMNS fails
if (empty($allowed)) {
    $allowed = ['pending', 'scheduled', 'completed', 'canceled'];
}

if (!in_array($newStatus, $allowed)) {
    echo json_encode([
        'status'  => 'error',
        'message' => 'Invalid status "' . $newStatus . '". Allowed: ' . implode(', ', $allowed)
    ]);
    exit;
}

$newStatus = mysqli_real_escape_string($conn, $newStatus);
$sql       = "UPDATE appointments SET status = '$newStatus' WHERE appointment_id = $id";

if (mysqli_query($conn, $sql)) {
    echo json_encode(['status' => 'success', 'message' => 'Appointment updated to ' . $newStatus]);
} else {
    echo json_encode(['status' => 'error', 'message' => mysqli_error($conn)]);
}

mysqli_close($conn);
?>
