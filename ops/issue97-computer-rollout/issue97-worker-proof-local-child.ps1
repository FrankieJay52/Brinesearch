param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($args.Count -ne 0) { exit 80 }
if ([string]::IsNullOrWhiteSpace([string]$env:ISSUE97_ATTEMPT_ID) -or
    [string]$env:ISSUE97_ATTEMPT_ID -notmatch '^issue97-local-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$' -or
    [string]$env:ISSUE97_ATTEMPT_LOCK_KEY -ne '-9700350004') {
  exit 17
}

$backendStart = (Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')
Write-Output "ISSUE97_LOCAL_BACKEND_IDENTITY|attempt_id=$([string]$env:ISSUE97_ATTEMPT_ID)|attempt_lock_key=$([string]$env:ISSUE97_ATTEMPT_LOCK_KEY)|backend_pid=$PID|backend_start=$backendStart|transaction_read_only=on|custom_guc=$([string]$env:ISSUE97_ATTEMPT_ID)|application_name=Supavisor"
Start-Sleep -Seconds 7
Write-Output 'ISSUE97_LOCAL_WORKER_PASS'
exit 0
