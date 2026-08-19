<?php
// ============================================================
//  VHS — Root entry point
//  Registration is handled by web-page/index.php
//  This file exists only to prevent a 404 if the root is
//  accessed directly as a PHP endpoint.
// ============================================================
header('Location: web-page/index.php', true, 301);
exit;
?>
