param(
  [string] $BaseUrl = 'http://127.0.0.1:8010'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$files = @(
  @{ local='public\user\index.html'; relative='user/index.html' },
  @{ local='public\user\vetti-state.js'; relative='user/vetti-state.js' },
  @{ local='public\user\vetti-ai.js'; relative='user/vetti-ai.js' }
)
$bad = 0
foreach ($item in $files) {
  $localPath = Join-Path $root $item.local
  if (-not (Test-Path -LiteralPath $localPath)) { throw "Missing local source: $localPath" }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) (([guid]::NewGuid()).ToString('N') + '.tmp')
  try {
    $uri = $BaseUrl.TrimEnd('/') + '/' + $item.relative + '?vetti_audit=' + [guid]::NewGuid().ToString('N')
    Invoke-WebRequest -Uri $uri -UseBasicParsing -OutFile $tmp -Headers @{ 'Cache-Control'='no-cache' } | Out-Null
    $localHash = (Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash
    $servedHash = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash
    if ($localHash -eq $servedHash) {
      Write-Host ('MATCH    ' + $item.relative) -ForegroundColor Green
    } else {
      Write-Host ('MISMATCH ' + $item.relative) -ForegroundColor Red
      $bad++
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}
if ($bad -gt 0) {
  Write-Host 'A different/stale Laravel directory or asset is being served. Check which php artisan serve process is running.' -ForegroundColor Yellow
  exit 1
}
Write-Host 'PASS: The running Laravel server serves the exact same User Vetti assets as this project folder.' -ForegroundColor Green
