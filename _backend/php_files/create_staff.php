<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once 'db.php';
$conn = getDB();

$data       = json_decode(file_get_contents('php://input'), true);
$lastName   = mysqli_real_escape_string($conn, trim($data['lastName']   ?? ''));
$firstName  = mysqli_real_escape_string($conn, trim($data['firstName']  ?? ''));
$middleName = mysqli_real_escape_string($conn, trim($data['middleName'] ?? ''));
$email      = mysqli_real_escape_string($conn, trim($data['email']      ?? ''));
$phone      = mysqli_real_escape_string($conn, trim($data['phone']      ?? ''));
$role       = mysqli_real_escape_string($conn, trim($data['role']       ?? ''));
$password   = $data['password'] ?? '';

if (!$lastName || !$firstName || !$email || !$role || !$password) {
    echo json_encode(['status' => 'error', 'message' => 'Missing required fields']); exit;
}

$check = mysqli_query($conn, "SELECT staff_id FROM staff WHERE staff_email='$email'");
if (mysqli_num_rows($check) > 0) {
    echo json_encode(['status' => 'error', 'message' => 'Email already exists']); exit;
}

$hash = mysqli_real_escape_string($conn, password_hash($password, PASSWORD_BCRYPT));

$sql = "INSERT INTO staff (staff_lastname, staff_firstname, staff_middlename, staff_email, contact_number, staff_password, staff_role)
        VALUES ('$lastName','$firstName','$middleName','$email','$phone','$hash','$role')";

if (mysqli_query($conn, $sql)) {
    echo json_encode(['status' => 'success']);
} else {
    echo json_encode(['status' => 'error', 'message' => mysqli_error($conn)]);
}
mysqli_close($conn);
?>
