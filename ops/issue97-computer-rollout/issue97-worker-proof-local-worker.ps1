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

if ($args.Count -ne 0) { exit 80 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$manifest = $null
$attempt = $null
$pidReceipt = $null
$finalPath = $null
$stdoutPath = $null
$stderrPath = $null
$failureCode = 'local_worker_initialization_failed'
$startUtc = [datetime]::UtcNow.ToString('o')
$stage = 'load_manifest'
$artifactSet = $null
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof'
$authorizationPath = Join-Path $logRoot 'authorization.json'

try {
  $stage = 'read_protected_attempt'
  $expectedAttemptPath = Join-Path $logRoot 'local.attempt.json'
  $attempt = [System.IO.File]::ReadAllText($expectedAttemptPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$attempt.manifest_sha256 -ne
      (Get-Issue97PreambleSha256 -LiteralPath $manifestPath)) {
    throw 'local attempt does not bind the current manifest bytes'
  }
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $artifactSet = [string]$manifest.artifact_set_sha256
  if ([string]$manifest.private_log_root -ne $logRoot -or
      [string]$attempt.artifact_set_sha256 -ne $artifactSet) {
    throw 'local attempt/manifest worker scope mismatch'
  }
  $stage = 'validate_library_before_execution'
  $libRelative = 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
  $workerRelative = 'ops/issue97-computer-rollout/issue97-worker-proof-local-worker.ps1'
  $libArtifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq $libRelative })
  $workerArtifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq $workerRelative })
  $attemptLibHash = $attempt.artifact_hashes.PSObject.Properties[$libRelative]
  $attemptWorkerHash = $attempt.artifact_hashes.PSObject.Properties[$workerRelative]
  if ($libArtifact.Count -ne 1 -or $workerArtifact.Count -ne 1 -or
      $null -eq $attemptLibHash -or $null -eq $attemptWorkerHash -or
      [string]$libArtifact[0].sha256 -ne ([string]$attemptLibHash.Value).ToUpperInvariant() -or
      [string]$workerArtifact[0].sha256 -ne ([string]$attemptWorkerHash.Value).ToUpperInvariant() -or
      (Get-Issue97PreambleSha256 -LiteralPath $libPath) -ne ([string]$attemptLibHash.Value).ToUpperInvariant() -or
      (Get-Issue97PreambleSha256 -LiteralPath $PSCommandPath) -ne ([string]$attemptWorkerHash.Value).ToUpperInvariant()) {
    throw 'local attempt does not bind the current worker/library bytes'
  }
  . $libPath
  $stage = 'validate_artifacts_and_environment'
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  Assert-Issue97NoCredentialEnvironment
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot `
    -TrustedRoot ([string]$manifest.trusted_owner_root)
  $stage = 'validate_attempt'
  if ([int]$attempt.schema_version -ne 2 -or
      [string]$attempt.job_kind -ne 'local_detached_process_proof' -or
      [string]$attempt.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$attempt.artifact_set_sha256 -ne $artifactSet -or
      [string]$attempt.attempt_id -notmatch '^issue97-local-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$' -or
      [string]$attempt.pgappname -notmatch '^local-only-no-database-[0-9a-f]{8}$') {
    throw 'local attempt identity mismatch'
  }
  $attemptId = [string]$attempt.attempt_id
  $expectedPidPath = Join-Path $logRoot 'local.pid.json'
  $expectedSpawnPath = Join-Path $logRoot 'local.spawn.json'
  $finalPath = Join-Path $logRoot 'local.final.json'
  $stdoutPath = Join-Path $logRoot "$attemptId.local.stdout.log"
  $stderrPath = Join-Path $logRoot "$attemptId.local.stderr.log"
  $expectedHostStdout = Join-Path $logRoot "$attemptId.worker.stdout.log"
  $expectedHostStderr = Join-Path $logRoot "$attemptId.worker.stderr.log"
  $fixedWorkerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-local-worker.ps1'
  $fixedBootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-local-bootstrap.ps1'
  foreach ($pair in @(
    @([string]$attempt.worker_spawn_receipt_path, $expectedSpawnPath),
    @([string]$attempt.worker_pid_receipt_path, $expectedPidPath),
    @([string]$attempt.final_status_path, $finalPath),
    @([string]$attempt.stdout_path, $stdoutPath),
    @([string]$attempt.stderr_path, $stderrPath),
    @([string]$attempt.worker_host_stdout_path, $expectedHostStdout),
    @([string]$attempt.worker_host_stderr_path, $expectedHostStderr),
    @([string]$attempt.authorization_path, $authorizationPath),
    @([string]$attempt.worker_script, $fixedWorkerPath),
    @([string]$attempt.bootstrap_script, $fixedBootstrapPath),
    @([string]$attempt.powershell_path, [string]$manifest.powershell.path)
  )) {
    if (-not (Test-Issue97SamePath -Left ([string]$pair[0]) -Right ([string]$pair[1]))) {
      throw 'local attempt contains a noncanonical fixed path'
    }
  }
  foreach ($path in @($expectedSpawnPath, $expectedPidPath, $finalPath, $stdoutPath, $stderrPath,
      $expectedHostStdout, $expectedHostStderr)) {
    Assert-Issue97PathUnderRoot -Candidate $path -AllowedRoot $logRoot
  }
  if ([string]$attempt.manifest_sha256 -ne (Get-Issue97Sha256 -LiteralPath $manifestPath) -or
      [string]$attempt.authorization_sha256 -ne (Get-Issue97Sha256 -LiteralPath $authorizationPath) -or
      [string]$attempt.powershell_sha256 -ne [string]$manifest.powershell.sha256) {
    throw 'local attempt runtime hash mismatch'
  }
  $authorization = Read-Issue97Json -LiteralPath $authorizationPath
  if ([string]$authorization.authorized_repo_sha -ne [string]$attempt.repo_sha -or
      [string]$authorization.artifact_set_sha256 -ne $artifactSet -or
      [string]$authorization.manifest_sha256 -ne [string]$attempt.manifest_sha256 -or
      -not [bool]$authorization.local_proof_authorized -or
      [bool]$authorization.mapping_rehearsal_authorized) {
    throw 'local worker exact-SHA authorization receipt mismatch'
  }
  if ((Test-Path -LiteralPath $expectedPidPath) -or (Test-Path -LiteralPath $finalPath)) {
    throw 'local PID or final receipt already exists'
  }
  $stage = 'prepare_private_host_logs'
  Write-Issue97TextNoClobber -LiteralPath $expectedHostStdout -Text ''
  Write-Issue97TextNoClobber -LiteralPath $expectedHostStderr -Text ''
  $stage = 'validate_worker_runtime'
  Assert-Issue97RuntimeFile -LiteralPath ([string]$manifest.powershell.path) `
    -ExpectedSha256 ([string]$manifest.powershell.sha256)
  $stage = 'validate_worker_process_identity'
  $selfIdentity = Get-Issue97ProcessIdentity -ProcessId $PID
  if (-not (Test-Issue97WorkerProcessIdentity -Actual $selfIdentity -ExpectedPid $PID `
      -ExpectedStartUtc ([string]$selfIdentity.process_start_utc) `
      -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $fixedWorkerPath)) {
    throw 'local worker process identity mismatch'
  }
  $stage = 'write_pid_receipt'
  $pidReceipt = [ordered]@{
    schema_version = 2
    worker_proof_version = [string]$manifest.worker_proof_version
    attempt_id = $attemptId
    repo_sha = [string]$attempt.repo_sha
    pid = $PID
    process_start_utc = [string]$selfIdentity.process_start_utc
    executable_path = [string]$manifest.powershell.path
    worker_script = $fixedWorkerPath
    pgappname = [string]$attempt.pgappname
  }
  Write-Issue97JsonAtomicNoClobber -LiteralPath $expectedPidPath -Value $pidReceipt

  $stage = 'validate_spawn_receipt'
  $spawnDeadline = [datetime]::UtcNow.AddSeconds(3)
  while (-not (Test-Path -LiteralPath $expectedSpawnPath -PathType Leaf)) {
    if ([datetime]::UtcNow -ge $spawnDeadline) { throw 'local spawn receipt did not arrive' }
    Start-Sleep -Milliseconds 50
  }
  $spawnReceipt = Read-Issue97Json -LiteralPath $expectedSpawnPath
  if ([int]$spawnReceipt.schema_version -ne 2 -or
      [string]$spawnReceipt.attempt_id -ne [string]$attempt.attempt_id -or
      [string]$spawnReceipt.repo_sha -ne [string]$attempt.repo_sha -or
      [int]$spawnReceipt.worker_pid -ne $PID -or
      [string]$spawnReceipt.process_start_utc -ne [string]$pidReceipt.process_start_utc) {
    throw 'local spawn receipt mismatch'
  }

  $stage = 'validate_repository_checkpoint'
  $verifiedSha = Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch
  if ($verifiedSha -ne [string]$attempt.repo_sha -or
      [string]$attempt.branch -ne [string]$manifest.expected_branch) {
    throw 'local attempt does not match the fetched clean repository checkpoint'
  }

  $stage = 'sleep'
  Start-Sleep -Seconds 7
  Write-Issue97TextNoClobber -LiteralPath $stdoutPath -Text "ISSUE97_LOCAL_WORKER_PASS`n"
  Write-Issue97TextNoClobber -LiteralPath $stderrPath -Text ''
  $failureCode = $null
} catch {
  $failureCode = 'local_worker_validation_or_execution_failed'
  if ([string]::IsNullOrWhiteSpace([string]$finalPath) -and -not [string]::IsNullOrWhiteSpace([string]$logRoot) -and
      -not [string]::IsNullOrWhiteSpace([string]$artifactSet)) {
    $earlyPath = Join-Path $logRoot 'local.early-failure.txt'
    try {
      $earlyBytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes("STAGE=$stage`n")
      $earlyStream = [System.IO.File]::Open($earlyPath, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      try { $earlyStream.Write($earlyBytes, 0, $earlyBytes.Length) } finally { $earlyStream.Dispose() }
    } catch { }
  }
} finally {
  if ($null -ne $attempt -and -not [string]::IsNullOrWhiteSpace($finalPath)) {
    $endUtc = [datetime]::UtcNow.ToString('o')
    $durationSeconds = (
      [datetime]::Parse($endUtc).ToUniversalTime() - [datetime]::Parse($startUtc).ToUniversalTime()
    ).TotalSeconds
    $success = (
      $null -eq $failureCode -and $durationSeconds -ge 5.0 -and
      (Test-Path -LiteralPath $stdoutPath) -and
      [System.IO.File]::ReadAllText($stdoutPath).Contains('ISSUE97_LOCAL_WORKER_PASS')
    )
    if (-not (Test-Path -LiteralPath $stderrPath)) {
      try { Write-Issue97TextNoClobber -LiteralPath $stderrPath -Text '' } catch { }
    }
    $receipt = [ordered]@{
      schema_version = 2
      worker_proof_version = [string]$attempt.worker_proof_version
      job_kind = [string]$attempt.job_kind
      attempt_id = [string]$attempt.attempt_id
      repo_sha = [string]$attempt.repo_sha
      pid = $PID
      process_start_utc = if ($null -ne $pidReceipt) { [string]$pidReceipt.process_start_utc } else { $null }
      pgappname = [string]$attempt.pgappname
      worker_start_utc = $startUtc
      worker_end_utc = $endUtc
      client_started = $false
      client_confirmed_finished = $true
      client_duration_seconds = 0.0
      worker_duration_seconds = $durationSeconds
      exit_code = if ($success) { 0 } else { 80 }
      final_marker_present = $success
      rollback_present = $false
      commit_count = 0
      stdout_sha256 = if (Test-Path -LiteralPath $stdoutPath) { Get-Issue97Sha256 -LiteralPath $stdoutPath } else { $null }
      stderr_sha256 = if (Test-Path -LiteralPath $stderrPath) { Get-Issue97Sha256 -LiteralPath $stderrPath } else { $null }
      server_inspection_required = $false
      success = $success
      failure_code = $failureCode
      failure_stage = if ($success) { $null } else { $stage }
    }
    try {
      Write-Issue97JsonAtomicNoClobber -LiteralPath $finalPath -Value $receipt
    } catch {
      exit 82
    }
    if ($success) { exit 0 }
  }
  exit 81
}
