# Idempotent Phase 3 route installer for the existing root-level Laravel app.
# Does not replace routes/web.php or alter scheduling/booking/OTP routes.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$routeFile = Join-Path $root 'routes\web.php'
$controllerFile = Join-Path $root 'app\Http\Controllers\AI\UserVettiController.php'
$serviceFile = Join-Path $root 'app\Services\AI\UserVettiService.php'
foreach ($path in @($routeFile, $controllerFile, $serviceFile)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing required file: $path" }
}
$original = [System.IO.File]::ReadAllText($routeFile)
if ($original.Contains("Route::post('ai/vetti'")) {
    Write-Host 'Phase 3 User Vetti route is already installed.' -ForegroundColor Green
    exit 0
}
$anchor = "        Route::get('auth/me', [AuthController::class, 'me']);"
if (-not $original.Contains($anchor)) {
    throw 'Authenticated auth/me anchor is missing. Not modifying routes/web.php; inspect the current branch.'
}
$nl = if ($original.Contains("`r`n")) { "`r`n" } else { "`n" }
$addition = $nl + '        // Phase 3: User-only, authenticated, throttled. AI cannot write appointments.' + $nl +
    "        Route::post('ai/vetti', [\App\Http\Controllers\AI\UserVettiController::class, 'reply'])" + $nl +
    "            ->middleware(['role:User', 'throttle:12,1']);"
$revised = $original.Replace($anchor, $anchor + $addition)
if ($revised -eq $original) { throw 'Route patch produced no change.' }
$backup = $routeFile + '.phase3.bak'
if (-not (Test-Path -LiteralPath $backup)) {
    [System.IO.File]::WriteAllText($backup, $original, (New-Object System.Text.UTF8Encoding($false)))
}
[System.IO.File]::WriteAllText($routeFile, $revised, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Installed POST /api/ai/vetti inside existing session/auth/active middleware.' -ForegroundColor Green
Write-Host 'Local backup: routes/web.php.phase3.bak — do not git add.'
