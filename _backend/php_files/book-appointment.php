<?php
require_once 'db.php';
$conn = getDB();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $raw_input = file_get_contents("php://input");
    $data = json_decode($raw_input, true);

    if (!$data) {
        echo json_encode(["status" => "error", "message" => "Invalid JSON payload"]);
        exit;
    }

    $user_id  = (int)($data["user_id"]  ?? 0);
    $pet_id   = (int)($data["pet_id"]   ?? 0);
    $staff_id = (int)($data["staff_id"] ?? 0);

    // Lowercase service to match ENUM values in DB
    $service  = mysqli_real_escape_string($conn, strtolower(trim($data["service"] ?? '')));
    $app_date = mysqli_real_escape_string($conn, trim($data["appointment_date"] ?? ''));
    $app_time = mysqli_real_escape_string($conn, trim($data["appointment_time"] ?? ''));
    $notes    = mysqli_real_escape_string($conn, trim($data["notes"] ?? ''));
    $status   = 'pending';

    if ($pet_id > 0 && !empty($service) && !empty($app_date) && !empty($app_time)) {

        // Detect correct service column name
        $col_check   = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'vet_service'");
        $service_col = (mysqli_num_rows($col_check) > 0) ? 'vet_service' : 'service';

        // Include user_id if provided
        if ($user_id > 0 && $staff_id > 0) {
            $sql = "INSERT INTO appointments (`user_id`, `pet_id`, `staff_id`, `$service_col`, `appointment_date`, `appointment_time`, `notes`, `status`)
                    VALUES ($user_id, $pet_id, $staff_id, '$service', '$app_date', '$app_time', '$notes', '$status')";
        } elseif ($user_id > 0) {
            $sql = "INSERT INTO appointments (`user_id`, `pet_id`, `$service_col`, `appointment_date`, `appointment_time`, `notes`, `status`)
                    VALUES ($user_id, $pet_id, '$service', '$app_date', '$app_time', '$notes', '$status')";
        } elseif ($staff_id > 0) {
            $sql = "INSERT INTO appointments (`pet_id`, `staff_id`, `$service_col`, `appointment_date`, `appointment_time`, `notes`, `status`)
                    VALUES ($pet_id, $staff_id, '$service', '$app_date', '$app_time', '$notes', '$status')";
        } else {
            $sql = "INSERT INTO appointments (`pet_id`, `$service_col`, `appointment_date`, `appointment_time`, `notes`, `status`)
                    VALUES ($pet_id, '$service', '$app_date', '$app_time', '$notes', '$status')";
        }

        if (mysqli_query($conn, $sql)) {
            echo json_encode(["status" => "success", "message" => "Appointment requested successfully!"]);
        } else {
            echo json_encode(["status" => "error", "message" => "Database error: " . mysqli_error($conn)]);
        }

    } else {
        echo json_encode([
            "status"  => "error",
            "message" => "Missing required fields. Received: pet_id=$pet_id, service=$service, date=$app_date, time=$app_time"
        ]);
    }

} else {
    echo json_encode(["status" => "error", "message" => "Invalid Request Method"]);
}

mysqli_close($conn);
?>