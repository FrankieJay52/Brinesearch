param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args.Count -ne 0) { exit 80 }
if ([string]::IsNullOrWhiteSpace([string]$env:PGAPPNAME) -or
    [string]$env:PGAPPNAME -notmatch '^local-only-no-database-[0-9a-f]{8}$') {
  exit 17
}

Write-Output "ISSUE97_LOCAL_CHILD_PGAPPNAME=$([string]$env:PGAPPNAME)"
Start-Sleep -Seconds 7
Write-Output 'ISSUE97_LOCAL_WORKER_PASS'
exit 0
