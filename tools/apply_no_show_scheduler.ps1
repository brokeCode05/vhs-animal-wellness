$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$path = Join-Path $root 'routes\console.php'
if (-not (Test-Path -LiteralPath $path)) { throw 'Run this script from the Laravel project root (routes/console.php missing).' }
$contents = [System.IO.File]::ReadAllText($path)
$marker = "Artisan::command('vhs:reconcile-no-shows"
if ($contents.Contains($marker)) {
    Write-Host 'No-show command already installed. No changes made.'
    exit 0
}
if (-not $contents.Contains('use Illuminate\Support\Facades\Artisan;') -or -not $contents.Contains('use Illuminate\Support\Facades\Schedule;')) {
    throw 'Unexpected routes/console.php; installation stopped to protect existing routes.'
}
$backup = "$path.no-show.bak"
Copy-Item -LiteralPath $path -Destination $backup -Force
$snippet = @'

// Automatic no-show reconciliation. Runs only after the configured clinic grace period.
// Local development: php artisan schedule:work (in another terminal).
Artisan::command('vhs:reconcile-no-shows {--dry-run : Preview eligible visits without changing status}', function () {
    $service = app(\App\Services\AppointmentNoShowService::class);
    if ($this->option('dry-run')) {
        $this->info('Eligible confirmed/un-checked-in visits: '.$service->countDue());
        return;
    }
    $count = $service->reconcile();
    $this->info("Automatically marked {$count} missed appointment(s) as no-show.");
})->purpose('Reconcile unattended confirmed appointments after their check-in grace period');

Schedule::command('vhs:reconcile-no-shows')->everyMinute()->withoutOverlapping();
'@
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $contents.TrimEnd() + "`r`n" + $snippet + "`r`n", $utf8)
Write-Host 'Installed no-show command and scheduler in routes/console.php.'
Write-Host 'Backed up original routes/console.php.no-show.bak (do not stage the backup).'
