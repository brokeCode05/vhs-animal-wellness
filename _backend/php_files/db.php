<?php
function getDB() {
    $conn = mysqli_init();
    
    // 1. Tell MySQLi to NOT verify the server's certificate
    mysqli_options($conn, MYSQLI_OPT_SSL_VERIFY_SERVER_CERT, false);
    
    // 2. Connect to the database
    // The MYSQLI_CLIENT_SSL flag initiates the secure connection
    if (!mysqli_real_connect($conn, DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT, NULL, MYSQLI_CLIENT_SSL)) {
        die(json_encode([
            'message' => 'DB connection failed', 
            'details' => mysqli_connect_error()
        ]));
    }
    
    mysqli_set_charset($conn, 'utf8mb4');
    return $conn;
}
?>
