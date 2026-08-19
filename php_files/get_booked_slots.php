<?php
/**
 * get_booked_slots.php
 * Returns all booked time slots for a given date so the frontend
 * can disable them in the time picker.
 *
 * GET ?date=YYYY-MM-DD
 */
require_once 'db.php';
$conn = getDB();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$date = trim($_GET['date'] ?? '');

if (empty($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    echo json_encode(['booked_slots' => []]);
    exit;
}

$date = mysqli_real_escape_string($conn, $date);

// Detect correct column names
$col_check   = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'vet_service'");
$time_check  = mysqli_query($conn, "SHOW COLUMNS FROM appointments LIKE 'appointment_time'");
$time_col    = (mysqli_num_rows($time_check) > 0) ? 'appointment_time' : 'time';

// Only count active (scheduled) appointments — canceled/completed slots are freed up
$sql = "SELECT $time_col AS slot_time
        FROM appointments
        WHERE appointment_date = '$date'
          AND status NOT IN ('canceled', 'cancelled', 'completed')";

$result = mysqli_query($conn, $sql);

$booked = [];
if ($result) {
    while ($row = mysqli_fetch_assoc($result)) {
        $raw = trim($row['slot_time'] ?? '');
        if (empty($raw)) continue;

        // Normalize stored time to display format (e.g. "08:00:00" -> "8:00 AM")
        if (preg_match('/^(\d{1,2}):(\d{2})/', $raw, $m)) {
            $h = (int)$m[1];
            $min = $m[2];
            $ampm = $h >= 12 ? 'PM' : 'AM';
            $h12  = $h % 12 ?: 12;
            $booked[] = $h12 . ':' . $min . ' ' . $ampm;
        } else {
            $booked[] = $raw; // already formatted like "8:00 AM"
        }
    }
}

echo json_encode(['booked_slots' => array_values(array_unique($booked))]);
mysqli_close($conn);
?>
