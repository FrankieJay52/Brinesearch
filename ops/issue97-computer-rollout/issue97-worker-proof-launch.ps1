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

if ($args.Count -ne 0) {
  throw 'issue97-worker-proof-launch.ps1 accepts zero arguments'
}

# The short-lived caller only claims the one-shot lane and starts the fixed
# bootstrap. The independently running bootstrap owns every slow preflight.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$bootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-bootstrap.ps1'
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof'
if ([int]$manifest.schema_version -ne 2 -or
    [string]$manifest.private_log_root -ne $logRoot -or
    [string]$manifest.expected_service -ne 'brinesearch_issue97_prod' -or
    [string]$manifest.powershell.path -ne 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe') {
  throw 'fixed worker-proof manifest scope mismatch'
}
if ($env:PGSERVICE -ne 'brinesearch_issue97_prod') {
  throw 'PGSERVICE must be brinesearch_issue97_prod'
}
$forbiddenNames = @(
  'PGPASSWORD', 'PGPASSFILE', 'PGSERVICEFILE', 'PGSYSCONFDIR', 'PGHOST', 'PGHOSTADDR',
  'PGPORT', 'PGDATABASE', 'PGUSER', 'PGOPTIONS', 'PGCONNECT_TIMEOUT', 'PGSSLMODE',
  'PGAPPNAME', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DATABASE_URL'
)
foreach ($name in $forbiddenNames) {
  if (Test-Path -LiteralPath "Env:$name") { throw "$name must be unset" }
}
foreach ($entry in Get-ChildItem Env:) {
  if ($entry.Name -match '(?i)(password|passwd|token|secret|credential|api.?key|service.?role|database.?url)' -or
      $entry.Name -match '^(?i:GIT_|CURL_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$)') {
    throw 'credential-bearing or Git/proxy environment must be unset before launch'
  }
}
if (-not (Test-Path -LiteralPath $logRoot -PathType Container)) {
  throw 'the reviewed owner-protected private log root must be provisioned before launch'
}
$authorizationPath = Join-Path $logRoot 'authorization.json'
if (-not (Test-Path -LiteralPath $authorizationPath -PathType Leaf)) {
  throw 'the owner-protected exact-SHA authorization receipt is missing'
}
$authorization = [System.IO.File]::ReadAllText($authorizationPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$manifestSha256 = Get-Issue97PreambleSha256 -LiteralPath $manifestPath
if ([int]$authorization.schema_version -ne 2 -or
    [string]$authorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
    [string]$authorization.authorized_repo_sha -notmatch '^[0-9a-f]{40}$' -or
    [string]$authorization.branch -ne [string]$manifest.expected_branch -or
    [string]$authorization.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
    [string]$authorization.manifest_sha256 -ne $manifestSha256 -or
    -not [bool]$authorization.production_read_only_proof_authorized -or
    [bool]$authorization.mapping_rehearsal_authorized) {
  throw 'exact-SHA authorization receipt does not match this fixed production proof'
}
foreach ($pair in @(
  @($PSCommandPath, 'ops/issue97-computer-rollout/issue97-worker-proof-launch.ps1'),
  @($bootstrapPath, 'ops/issue97-computer-rollout/issue97-worker-proof-bootstrap.ps1'),
  @((Join-Path $PSScriptRoot 'issue97-worker-proof-worker.ps1'), 'ops/issue97-computer-rollout/issue97-worker-proof-worker.ps1'),
  @((Join-Path $PSScriptRoot 'issue97-worker-proof-status.ps1'), 'ops/issue97-computer-rollout/issue97-worker-proof-status.ps1'),
  @((Join-Path $repoRoot 'ops\issue97-computer-rollout\sql\35-worker-proof-read-only.sql'), 'ops/issue97-computer-rollout/sql/35-worker-proof-read-only.sql')
)) {
  $artifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq [string]$pair[1] })
  $authorizedHash = $authorization.artifact_hashes.PSObject.Properties[[string]$pair[1]]
  if ($artifact.Count -ne 1 -or $null -eq $authorizedHash -or
      [string]$artifact[0].sha256 -ne ([string]$authorizedHash.Value).ToUpperInvariant() -or
      (Get-Issue97PreambleSha256 -LiteralPath ([string]$pair[0])) -ne
        ([string]$authorizedHash.Value).ToUpperInvariant()) {
    throw 'production launcher artifacts are not the authorized exact bytes'
  }
}

$claimPath = Join-Path $logRoot 'production.launch.json'
$bootstrapReceiptPath = Join-Path $logRoot 'production.bootstrap.json'
$bootstrapFinalPath = Join-Path $logRoot 'production.bootstrap-final.json'
$attemptPath = Join-Path $logRoot 'production.attempt.json'
$spawnPath = Join-Path $logRoot 'production.spawn.json'
$pidPath = Join-Path $logRoot 'production.pid.json'
$clientPath = Join-Path $logRoot 'production.client.json'
$finalPath = Join-Path $logRoot 'production.final.json'
foreach ($path in @($claimPath, $bootstrapReceiptPath, $bootstrapFinalPath, $attemptPath, $spawnPath, $pidPath, $clientPath, $finalPath)) {
  if (Test-Path -LiteralPath $path) {
    throw 'the one-shot production proof was already claimed; a new SHA or artifact set does not grant a retry'
  }
}

$token = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$now = [datetime]::UtcNow
$attemptId = "issue97-wp-$($now.ToString('yyyyMMddTHHmmssfffZ'))-$token"
$pgappname = "brinesearch-i97-wp-$($now.ToString('yyyyMMddHHmmss'))-$token"
$stdoutPath = Join-Path $logRoot "$attemptId.psql.stdout.log"
$stderrPath = Join-Path $logRoot "$attemptId.psql.stderr.log"
$hostStdout = Join-Path $logRoot "$attemptId.worker.stdout.log"
$hostStderr = Join-Path $logRoot "$attemptId.worker.stderr.log"
$claim = [ordered]@{
  schema_version = 2
  worker_proof_version = [string]$manifest.worker_proof_version
  job_kind = 'production_read_only_pg_sleep_proof'
  attempt_id = $attemptId
  utc_start = $now.ToString('o')
  pgappname = $pgappname
  repo_root = $repoRoot
  authorized_repo_sha = [string]$authorization.authorized_repo_sha
  authorization_path = $authorizationPath
  authorization_sha256 = Get-Issue97PreambleSha256 -LiteralPath $authorizationPath
  manifest_sha256 = $manifestSha256
  artifact_set_sha256 = [string]$manifest.artifact_set_sha256
  artifact_hashes = [ordered]@{}
  bootstrap_receipt_path = $bootstrapReceiptPath
  bootstrap_final_path = $bootstrapFinalPath
  attempt_path = $attemptPath
  worker_spawn_receipt_path = $spawnPath
  worker_pid_receipt_path = $pidPath
  client_pid_receipt_path = $clientPath
  stdout_path = $stdoutPath
  stderr_path = $stderrPath
  worker_host_stdout_path = $hostStdout
  worker_host_stderr_path = $hostStderr
  final_status_path = $finalPath
  bootstrap_script = $bootstrapPath
  worker_script = (Join-Path $PSScriptRoot 'issue97-worker-proof-worker.ps1')
  powershell_path = [string]$manifest.powershell.path
  powershell_sha256 = [string]$manifest.powershell.sha256
}
foreach ($artifact in @($manifest.artifacts)) {
  $claim.artifact_hashes[[string]$artifact.path] = ([string]$artifact.sha256).ToUpperInvariant()
}
$json = ($claim | ConvertTo-Json -Depth 32) + "`n"
$bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($json)
$temporaryClaim = "$claimPath.tmp.$PID.$([Guid]::NewGuid().ToString('N'))"
$stream = [System.IO.File]::Open($temporaryClaim, [System.IO.FileMode]::CreateNew,
  [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
try {
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
} finally {
  $stream.Dispose()
}
[System.IO.File]::Move($temporaryClaim, $claimPath)

$arguments = "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bootstrapPath`""
$bootstrap = Start-Process -FilePath ([string]$manifest.powershell.path) -ArgumentList $arguments `
  -PassThru -WindowStyle Hidden
Write-Output "BOOTSTRAP_PID=$($bootstrap.Id)"
Write-Output "PGAPPNAME=$pgappname"
Write-Output "ATTEMPT_ID=$attemptId"
Write-Output "STATUS_SCRIPT=$(Join-Path $PSScriptRoot 'issue97-worker-proof-status.ps1')"
Write-Output "STDOUT_PATH=$stdoutPath"
Write-Output "STDERR_PATH=$stderrPath"
Write-Output "FINAL_STATUS_PATH=$finalPath"
