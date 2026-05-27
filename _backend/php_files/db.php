<?php
function getDB() {
    $conn = mysqli_init();
    
    // SSL is required for Aiven
    mysqli_ssl_set($conn, NULL, NULL, NULL, NULL, NULL);
    
    // Attempt the connection
    if (!mysqli_real_connect($conn, DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT, NULL, MYSQLI_CLIENT_SSL)) {
        error_log("Connection failed: " . mysqli_connect_error());
        http_response_code(500);
        die(json_encode(['message' => 'DB connection failed', 'details' => mysqli_connect_error()]));
    }
    
    mysqli_set_charset($conn, 'utf8mb4');
    return $conn;
}
