<?php
require_once 'db.php';
$conn = getDB();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

set_exception_handler(function(\Throwable $e) {
    echo json_encode([
        "status" => "error",
        "message" => $e->getMessage()
    ]);
    exit;
});

error_reporting(0);
ini_set('display_errors', 0);

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    echo json_encode(["status" => "error", "message" => "Invalid Request Method"]);
    exit;
}

/* ---------------- INPUT ---------------- */
$raw_input = file_get_contents("php://input");
$data = json_decode($raw_input, true);

if (!$data) {
    echo json_encode(["status" => "error", "message" => "Invalid JSON payload"]);
    exit;
}

$user_id  = (int)($data["user_id"] ?? 0);
$pet_id   = (int)($data["pet_id"] ?? 0);

/* FIX: staff_id must NOT default to 0 */
$staff_id = isset($data["staff_id"]) && $data["staff_id"] !== ''
    ? (int)$data["staff_id"]
    : null;

$service  = strtolower(trim($data["service"] ?? ''));
$app_date = trim($data["appointment_date"] ?? '');
$notes    = trim($data["notes"] ?? '');

$status = "scheduled";

/* ---------------- TIME CONVERSION ---------------- */
$raw_time = trim($data["appointment_time"] ?? '');

if (preg_match('/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i', $raw_time, $m)) {
    $h = (int)$m[1];
    $min = $m[2];
    $ampm = strtoupper($m[3]);

    if ($ampm === 'PM' && $h !== 12) $h += 12;
    if ($ampm === 'AM' && $h === 12) $h = 0;

    $app_time = sprintf('%02d:%s:00', $h, $min);
} else {
    $app_time = $raw_time;
}

/* ---------------- VALIDATION ---------------- */
if ($pet_id <= 0 || empty($service) || empty($app_date) || empty($app_time)) {
    echo json_encode(["status" => "error", "message" => "Missing required fields"]);
    exit;
}

/* ---------------- SERVICE COLUMN CHECK ---------------- */
$col_check   = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'vet_service'");
$service_col = (mysqli_num_rows($col_check) > 0) ? 'vet_service' : 'service';

/* =========================================================
   AUTO ASSIGN STAFF (IMPORTANT)
========================================================= */
if ($staff_id === null) {
    $res = mysqli_query($conn, "
        SELECT staff_id 
        FROM staff 
        WHERE staff_role = 'veterinarian'
        LIMIT 1
    ");

    if ($res && $row = mysqli_fetch_assoc($res)) {
        $staff_id = (int)$row['staff_id'];
    }
}

/* =========================================================
   SLOT CHECK (NO DOUBLE BOOKING)
========================================================= */
$check = mysqli_prepare(
    $conn,
    "SELECT appointment_id 
     FROM appointments 
     WHERE appointment_date = ? 
     AND appointment_time = ? 
     AND status IN ('scheduled','pending','confirmed')
     LIMIT 1"
);

mysqli_stmt_bind_param($check, "ss", $app_date, $app_time);
mysqli_stmt_execute($check);
mysqli_stmt_store_result($check);

if (mysqli_stmt_num_rows($check) > 0) {
    echo json_encode([
        "status" => "error",
        "message" => "This time slot is already booked."
    ]);
    exit;
}

/* =========================================================
   INSERT APPOINTMENT (CLEAN VERSION)
========================================================= */
$reference_no = 'VHS-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
$stmt = mysqli_prepare(
    $conn,
    "INSERT INTO appointments 
    (user_id, pet_id, staff_id, service, appointment_date, appointment_time, notes, status, reference_no)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

mysqli_stmt_bind_param(
    $stmt,
    "iiissssss",
    $user_id,
    $pet_id,
    $staff_id,
    $service,
    $app_date,
    $app_time,
    $notes,
    $status,
    $reference_no
);

mysqli_stmt_execute($stmt);

/* ---------------- RESPONSE ---------------- */
if (mysqli_stmt_affected_rows($stmt) > 0) {
    echo json_encode([
    "status" => "success",
    "message" => "Appointment booked successfully!",
    "reference_no" => $reference_no,
    "staff_id" => $staff_id
]); 
} else {
    echo json_encode([
        "status" => "error",
        "message" => "Failed to book appointment"
    ]);
}

mysqli_close($conn);
?>