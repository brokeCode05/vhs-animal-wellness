param(
    [switch]$Start,
    [switch]$ReconcileExisting
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($projectRoot -ne 'D:\Cap\V3\vhs-animal-wellness-repo-v3') { throw 'Run this helper only from the authorized VHS project.' }
Push-Location -LiteralPath $projectRoot
try {
    $preview = & php artisan vhs:reconcile-no-shows --dry-run --no-interaction
    if ($LASTEXITCODE -ne 0) { throw 'Could not preview overdue appointments. Scheduler was not started.' }
    Write-Output $preview
    if (-not $Start) { Write-Output 'Preview only. Use -Start to run the local scheduler.'; return }
    $match = [regex]::Match(($preview -join "`n"), 'visits:\s*(\d+)')
    if (-not $match.Success) { throw 'Preview was not understood. Scheduler was not started.' }
    if ([int]$match.Groups[1].Value -gt 0 -and -not $ReconcileExisting) {
        throw 'Existing overdue confirmed visits would be changed. Review them first; use -ReconcileExisting only when their reconciliation is authorized.'
    }
    $phpExecutable = (Get-Command php -CommandType Application).Source
    $pidPath = Join-Path $projectRoot 'storage/app/private/vhs-scheduler.pid'
    if (Test-Path -LiteralPath $pidPath) {
        $prior = Get-Process -Id ([int](Get-Content -LiteralPath $pidPath -Raw)) -ErrorAction SilentlyContinue
        if ($prior) { throw 'A recorded scheduler process still exists. Inspect it before starting another.' }
    }
    $process = Start-Process -FilePath $phpExecutable -ArgumentList @('artisan', 'schedule:work', '--no-interaction') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding ascii
    Write-Output ('Local scheduler started. Process ID: '+$process.Id+'. Admin status should report within two minutes. It must be restarted after a computer restart.')
} finally { Pop-Location }
