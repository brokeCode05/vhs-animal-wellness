<?php
require_once __DIR__ . '/config.php';

function getDB() {
    $conn = mysqli_connect(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);
    if (!$conn) {
        http_response_code(500);
        die(json_encode(['message' => 'DB connection failed: ' . mysqli_connect_error()]));
    }
    mysqli_set_charset($conn, 'utf8mb4');
    return $conn;
}
