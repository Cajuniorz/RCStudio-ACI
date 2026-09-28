$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$url = 'http://127.0.0.1:8766'
try {
    $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
    if ($health.app -eq 'RCStudio') { Start-Process $url; exit 0 }
} catch {}
$candidates = @($env:RCSTUDIO_PYTHON, (Join-Path $projectDir '.venv\Scripts\python.exe'), 'H:\structure anlysis\.verification-tools\pynite-3.0.0\Scripts\python.exe')
$runtime = $null
foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { $runtime = $candidate; break }
}
if (-not $runtime) { throw 'Python environment not found. See README.md or set RCSTUDIO_PYTHON.' }
$logDir = Join-Path $projectDir 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$serverPath = Join-Path $projectDir 'server.py'
$process = Start-Process -FilePath $runtime -ArgumentList @('-X','utf8', ('"' + $serverPath + '"')) -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
for ($attempt=0; $attempt -lt 25; $attempt++) {
    Start-Sleep -Milliseconds 400
    if ($process.HasExited) { throw 'RC Studio could not start. See logs/server-error.log.' }
    try {
        $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 1
        if ($health.app -eq 'RCStudio') { Set-Content -LiteralPath (Join-Path $logDir 'server.pid') -Value $process.Id; Start-Process $url; exit 0 }
    } catch {}
}
throw 'RC Studio did not respond. See logs/server-error.log.'
