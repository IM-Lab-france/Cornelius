# Server and perception only. Safe to run repeatedly from Windows Task Scheduler.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')
Initialize-CorneliusDirs
$mutex = New-Object System.Threading.Mutex($false, 'Local\CorneliusEnsureRunning')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
try {
  $nodeDir = Get-ChildItem (Join-Path $Root '.local') -Directory -Filter 'node-v24*-win-x64' | Select-Object -First 1
  if (-not $nodeDir) { throw 'Portable Node 24 missing.' }
  $env:Path = "$($nodeDir.FullName);$env:Path"
  Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
  $port = Get-CorneliusPort
  $healthy = $false
  try { $healthy = (Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 5).status -eq 'ok' } catch {}
  if (-not $healthy) {
    & (Join-Path $PSScriptRoot 'start.ps1') *>> (Join-Path $LogDir 'autostart.log')
    if (-not (Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 5)) { throw 'Server did not start.' }
  } else {
    $state = Get-CorneliusState
    if (@(Get-CorneliusWorkerPids).Count -eq 0) {
      Start-CorneliusPerception -State $state *>> (Join-Path $LogDir 'autostart.log')
      Set-CorneliusState -State $state
    }
  }
  # A surviving worker can lose its server connection across suspend/resume.
  $failedAt = Join-Path $RunDir 'perception-unavailable.txt'
  $snapshot = (Invoke-RestMethod "http://127.0.0.1:$port/api/state" -TimeoutSec 5).state
  if ($snapshot.setup.perception) {
    Remove-Item -LiteralPath $failedAt -ErrorAction SilentlyContinue
  } elseif (-not (Test-Path -LiteralPath $failedAt)) {
    [DateTime]::UtcNow.ToString('o') | Set-Content -LiteralPath $failedAt
  } elseif (([DateTime]::UtcNow - [DateTime]::Parse((Get-Content -LiteralPath $failedAt))).TotalSeconds -ge 120) {
    foreach ($workerId in @(Get-CorneliusWorkerPids)) { Stop-CorneliusTree -ProcessId $workerId | Out-Null }
    $state = Get-CorneliusState
    Start-CorneliusPerception -State $state *>> (Join-Path $LogDir 'autostart.log')
    Set-CorneliusState -State $state
    Remove-Item -LiteralPath $failedAt -ErrorAction SilentlyContinue
  }
  [DateTime]::UtcNow.ToString('o') | Set-Content (Join-Path $RunDir 'autostart-last-ok.txt')
} catch {
  ('{0:o} {1}' -f [DateTime]::UtcNow, $_.Exception.Message) | Add-Content (Join-Path $LogDir 'autostart.log')
  exit 1
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
