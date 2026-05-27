<?php
function getDB() {
    $conn = mysqli_init();

    // Point to your actual CA certificate file
    $ca_cert = __DIR__ . '/certs/ca.pem'; 
    
    // Pass the file path instead of NULL
    mysqli_ssl_set($conn, NULL, NULL, $ca_cert, NULL, NULL);
    
    // Attempt the connection
    if (!mysqli_real_connect($conn, DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT, NULL, MYSQLI_CLIENT_SSL)) {
        // Output the specific error to help you debug
        die(json_encode([
            'message' => 'DB connection failed', 
            'details' => mysqli_connect_error()
        ]));
    }
    
    mysqli_set_charset($conn, 'utf8mb4');
    return $conn;
}
?>
