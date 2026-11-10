# Phase 2 route installer. It changes ONLY routes/web.php and does not touch
# existing auth, appointment, clinic, or portal routes.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$routeFile = Join-Path $root 'routes\web.php'
$controllerFile = Join-Path $root 'app\Http\Controllers\AI\PublicVettiController.php'
$serviceFile = Join-Path $root 'app\Services\AI\PublicVettiService.php'
$frontendFile = Join-Path $root 'public\web-page\public-vetti.js'

foreach ($path in @($routeFile, $controllerFile, $serviceFile, $frontendFile)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing required file: $path" }
}

$original = [System.IO.File]::ReadAllText($routeFile)
$routeMarker = "Route::post('ai/public-vetti'"
if ($original.Contains($routeMarker)) {
    Write-Host 'Phase 2 Public Vetti API route already installed.' -ForegroundColor Green
    exit 0
}

$anchor = "    Route::get('public/doctors', [DoctorsController::class, 'publicIndex']);"
if (-not $original.Contains($anchor)) {
    throw 'Expected public doctors route not found. Aborting without changes; ask ChatGPT to inspect your current routes/web.php.'
}

$separator = if ($original.Contains("`r`n")) { "`r`n" } else { "`n" }
$insert = $separator + "    // Phase 2: public information only; no authenticated data or booking writes." + $separator +
          "    Route::post('ai/public-vetti', [\App\Http\Controllers\AI\PublicVettiController::class, 'reply'])" + $separator +
          "        ->middleware('throttle:10,1');"
$revised = $original.Replace($anchor, $anchor + $insert)
if ($revised -eq $original) { throw 'Route patch had no effect; no changes written.' }

$backup = $routeFile + '.phase2.bak'
if (-not (Test-Path -LiteralPath $backup)) {
    [System.IO.File]::WriteAllText($backup, $original, (New-Object System.Text.UTF8Encoding($false)))
}
[System.IO.File]::WriteAllText($routeFile, $revised, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Installed POST /api/ai/public-vetti into routes/web.php.' -ForegroundColor Green
Write-Host 'Backup saved at routes/web.php.phase2.bak (not needed by Laravel).'
