param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Issue97PreambleSha256 {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)
  $stream = [System.IO.File]::Open([System.IO.Path]::GetFullPath($LiteralPath),
    [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToUpperInvariant() }
    finally { $algorithm.Dispose() }
  } finally { $stream.Dispose() }
}

function Write-Issue97PreambleJsonAtomic {
  param([Parameter(Mandatory = $true)][string]$LiteralPath, [Parameter(Mandatory = $true)]$Value)
  $temporary = "$LiteralPath.tmp.$PID.$([Guid]::NewGuid().ToString('N'))"
  $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes(($Value | ConvertTo-Json -Depth 24) + "`n")
  $stream = [System.IO.File]::Open($temporary, [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
  [System.IO.File]::Move($temporary, $LiteralPath)
}

if ($args.Count -ne 0) { throw 'issue97-worker-proof-server-inspect.ps1 accepts zero arguments' }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$bootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-bootstrap.ps1'
$workerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-worker.ps1'
$statusPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-status.ps1'
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof'
if ([int]$manifest.schema_version -ne 2 -or [string]$manifest.private_log_root -ne $logRoot -or
    [string]$manifest.expected_service -ne 'brinesearch_issue97_prod' -or
    [string]$manifest.powershell.path -ne 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe') {
  throw 'fixed server-inspection manifest scope mismatch'
}
if ($env:PGSERVICE -ne 'brinesearch_issue97_prod') { throw 'PGSERVICE must be brinesearch_issue97_prod' }
foreach ($entry in Get-ChildItem Env:) {
  if ($entry.Name -match '(?i)(password|passwd|token|secret|credential|api.?key|service.?role|database.?url)' -or
      $entry.Name -match '^(?i:GIT_|CURL_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$)' -or
      $entry.Name -match '^(?i:PGPASSFILE$|PGSERVICEFILE$|PGSYSCONFDIR$|PGHOST$|PGHOSTADDR$|PGPORT$|PGDATABASE$|PGUSER$|PGOPTIONS$|PGCONNECT_TIMEOUT$|PGSSLMODE$|PGAPPNAME$)') {
    throw 'credential-bearing, connection, or Git/proxy environment must be unset before inspection'
  }
}
if (-not (Test-Path -LiteralPath $logRoot -PathType Container)) { throw 'private log root is missing' }
$authorizationPath = Join-Path $logRoot 'authorization.json'
$authorization = [System.IO.File]::ReadAllText($authorizationPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$manifestSha256 = Get-Issue97PreambleSha256 -LiteralPath $manifestPath
if ([string]$authorization.authorized_repo_sha -notmatch '^[0-9a-f]{40}$' -or
    [string]$authorization.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
    [string]$authorization.manifest_sha256 -ne $manifestSha256 -or
    -not [bool]$authorization.production_read_only_proof_authorized -or
    [bool]$authorization.mapping_rehearsal_authorized) {
  throw 'exact-SHA authorization receipt does not authorize the fixed inspection'
}
foreach ($pair in @(
  @($PSCommandPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect.ps1'),
  @($bootstrapPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-bootstrap.ps1'),
  @($workerPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-worker.ps1'),
  @($statusPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-status.ps1')
)) {
  $artifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq [string]$pair[1] })
  $authorizedHash = $authorization.artifact_hashes.PSObject.Properties[[string]$pair[1]]
  if ($artifact.Count -ne 1 -or $null -eq $authorizedHash -or
      [string]$artifact[0].sha256 -ne ([string]$authorizedHash.Value).ToUpperInvariant() -or
      (Get-Issue97PreambleSha256 -LiteralPath ([string]$pair[0])) -ne
        ([string]$authorizedHash.Value).ToUpperInvariant()) {
    throw 'server-inspection launcher artifacts are not the authorized exact bytes'
  }
}
$proofAttemptPath = Join-Path $logRoot 'production.attempt.json'
$proofClaimPath = Join-Path $logRoot 'production.launch.json'
$proofReceiptPath = if (Test-Path -LiteralPath $proofAttemptPath -PathType Leaf) { $proofAttemptPath } else { $proofClaimPath }
$proofReceipt = [System.IO.File]::ReadAllText($proofReceiptPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$proofRepoShaProperty = $proofReceipt.PSObject.Properties['repo_sha']
if ($null -eq $proofRepoShaProperty) {
  $proofRepoShaProperty = $proofReceipt.PSObject.Properties['authorized_repo_sha']
}
if ([string]$proofReceipt.job_kind -ne 'production_read_only_pg_sleep_proof' -or
    [string]$proofReceipt.pgappname -notmatch '^brinesearch-i97-wp-[0-9]{14}-[0-9a-f]{8}$' -or
    [string]$proofReceipt.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
    $null -eq $proofRepoShaProperty -or
    [string]$proofRepoShaProperty.Value -ne [string]$authorization.authorized_repo_sha) {
  throw 'production proof receipt is not a fixed inspectable attempt'
}
$claimPath = Join-Path $logRoot 'server-inspection.launch.json'
$bootstrapReceiptPath = Join-Path $logRoot 'server-inspection.bootstrap.json'
$bootstrapFinalPath = Join-Path $logRoot 'server-inspection.bootstrap-final.json'
$spawnPath = Join-Path $logRoot 'server-inspection.spawn.json'
$pidPath = Join-Path $logRoot 'server-inspection.pid.json'
$finalPath = Join-Path $logRoot 'server-inspection.final.json'
$stdoutPath = Join-Path $logRoot 'server-inspection.stdout.log'
$stderrPath = Join-Path $logRoot 'server-inspection.stderr.log'
$hostStdout = Join-Path $logRoot 'server-inspection.worker.stdout.log'
$hostStderr = Join-Path $logRoot 'server-inspection.worker.stderr.log'
foreach ($path in @($claimPath, $bootstrapReceiptPath, $bootstrapFinalPath, $spawnPath, $pidPath, $finalPath,
    $stdoutPath, $stderrPath, $hostStdout, $hostStderr)) {
  if (Test-Path -LiteralPath $path) { throw 'the one-shot server inspection was already claimed' }
}
$now = [datetime]::UtcNow
$claim = [ordered]@{
  schema_version = 2
  worker_proof_version = [string]$manifest.worker_proof_version
  job_kind = 'production_server_inspection'
  attempt_id = "issue97-inspect-$($now.ToString('yyyyMMddTHHmmssfffZ'))"
  proof_attempt_id = [string]$proofReceipt.attempt_id
  target_pgappname = [string]$proofReceipt.pgappname
  authorized_repo_sha = [string]$authorization.authorized_repo_sha
  artifact_set_sha256 = [string]$manifest.artifact_set_sha256
  manifest_sha256 = $manifestSha256
  authorization_path = $authorizationPath
  authorization_sha256 = Get-Issue97PreambleSha256 -LiteralPath $authorizationPath
  proof_receipt_path = $proofReceiptPath
  artifact_hashes = [ordered]@{}
  bootstrap_script = $bootstrapPath
  bootstrap_receipt_path = $bootstrapReceiptPath
  bootstrap_final_path = $bootstrapFinalPath
  worker_script = $workerPath
  status_script = $statusPath
  spawn_receipt_path = $spawnPath
  pid_receipt_path = $pidPath
  stdout_path = $stdoutPath
  stderr_path = $stderrPath
  worker_host_stdout_path = $hostStdout
  worker_host_stderr_path = $hostStderr
  final_status_path = $finalPath
  utc_start = $now.ToString('o')
}
foreach ($artifact in @($manifest.artifacts)) {
  $claim.artifact_hashes[[string]$artifact.path] = ([string]$artifact.sha256).ToUpperInvariant()
}
Write-Issue97PreambleJsonAtomic -LiteralPath $claimPath -Value $claim
$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bootstrapPath`""
$bootstrap = Start-Process -FilePath ([string]$manifest.powershell.path) -ArgumentList $arguments -PassThru -WindowStyle Hidden
Write-Output "INSPECTION_BOOTSTRAP_PID=$($bootstrap.Id)"
Write-Output "TARGET_PGAPPNAME=$([string]$claim.target_pgappname)"
Write-Output "STATUS_SCRIPT=$statusPath"
