# Stops the backend dev server (nodemon) for this repo so port 3007 stays free.
# Killing only the ts-node child is not enough: nodemon immediately restarts it.
$ErrorActionPreference = 'Stop'
$backendDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

$nodes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
if (-not $nodes) {
  Write-Host 'No node.exe processes found.'
  exit 0
}

$targets = @($nodes | Where-Object {
    $cl = $_.CommandLine
    if (-not $cl) { return $false }
    return ($cl.Contains('nodemon') -and $cl.Contains($backendDir))
})

if ($targets.Count -eq 0) {
  Write-Host "No nodemon process found for backend at:`n  $backendDir"
  exit 0
}

foreach ($t in $targets) {
  $procId = $t.ProcessId
  Write-Host "Stopping nodemon tree (PID $procId)..."
  & taskkill.exe /PID $procId /T /F | Out-Null
}

Write-Host 'Done. Port 3007 should be free unless another app uses it.'
