$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'logs\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { exit 0 }
$serverPid = [int](Get-Content -LiteralPath $pidFile)
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
$expectedScript = Join-Path $PSScriptRoot 'server.py'
if ($serverProcess -and $serverProcess.CommandLine.Contains($expectedScript)) {
    Stop-Process -Id $serverPid
    Write-Output 'RC Studio stopped. Saved projects are preserved.'
} elseif ($serverProcess) {
    throw 'PID belongs to another process; nothing was stopped.'
}
