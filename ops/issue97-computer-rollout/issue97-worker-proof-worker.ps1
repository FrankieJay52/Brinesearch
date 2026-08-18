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

if ($args.Count -ne 0) { exit 90 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$manifest = $null
$attempt = $null
$pidReceipt = $null
$finalPath = $null
$stdoutPath = $null
$stderrPath = $null
$executionSqlPath = $null
$sqlGuardStream = $null
$workerStartUtc = [datetime]::UtcNow.ToString('o')
$clientStartUtc = $null
$clientEndUtc = $null
$clientPid = $null
$clientProcessStartUtc = $null
$clientFinalPath = $null
$exitCode = 91
$failureCode = 'worker_initialization_failed'
$clientStarted = $false
$clientConfirmedFinished = $false
$finalMarkerPresent = $false
$rollbackPresent = $false
$commitCount = -1
$durationSeconds = 0.0
$stage = 'load_manifest'
$artifactSet = $null
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof-v3'
$authorizationPath = Join-Path $logRoot 'production.authorization.json'

try {
  $stage = 'read_protected_attempt'
  $expectedAttemptPath = Join-Path $logRoot 'production.attempt.json'
  $attempt = [System.IO.File]::ReadAllText($expectedAttemptPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$attempt.manifest_sha256 -ne
      (Get-Issue97PreambleSha256 -LiteralPath $manifestPath)) {
    throw 'attempt does not bind the current manifest bytes'
  }
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $artifactSet = [string]$manifest.artifact_set_sha256
  if ([string]$manifest.private_log_root -ne $logRoot -or
      [string]$attempt.artifact_set_sha256 -ne $artifactSet) {
    throw 'attempt/manifest worker scope mismatch'
  }
  $stage = 'validate_library_before_execution'
  $libRelative = 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
  $workerRelative = 'ops/issue97-computer-rollout/issue97-worker-proof-worker.ps1'
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
    throw 'attempt does not bind the current worker/library bytes'
  }
  . $libPath
  $stage = 'validate_artifacts_and_environment'
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  Assert-Issue97NoCredentialEnvironment
  Assert-Issue97HistoricalEvidence -Manifest $manifest
  if (-not [string]::IsNullOrWhiteSpace([string]$env:PGSERVICE) -and
      $env:PGSERVICE -ne [string]$manifest.expected_service) {
    throw 'an unreviewed PGSERVICE override is present'
  }
  $env:PGSERVICE = [string]$manifest.expected_service
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
  $stage = 'validate_attempt'
  if ([int]$attempt.schema_version -ne 3 -or
      [string]$attempt.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$attempt.generation_id -ne [string]$manifest.generation_id -or
      [string]$attempt.job_kind -ne 'production_read_only_pg_sleep_proof' -or
      [string]$attempt.artifact_set_sha256 -ne $artifactSet) {
    throw 'production attempt identity mismatch'
  }
  if ([string]$attempt.attempt_id -notmatch '^issue97-wp-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$' -or
      [string]$attempt.pgappname -notmatch '^brinesearch-i97-wp-[0-9]{14}-[0-9a-f]{8}$' -or
      [string]$attempt.repo_sha -notmatch '^[0-9a-f]{40}$') {
    throw 'production attempt format mismatch'
  }

  $attemptId = [string]$attempt.attempt_id
  $repoSha = [string]$attempt.repo_sha
  $expectedPidPath = Join-Path $logRoot 'production.pid.json'
  $expectedClientPath = Join-Path $logRoot 'production.client.json'
  $clientFinalPath = Join-Path $logRoot 'production.client-final.json'
  $expectedSpawnPath = Join-Path $logRoot 'production.spawn.json'
  $finalPath = Join-Path $logRoot 'production.final.json'
  $stdoutPath = Join-Path $logRoot "$attemptId.psql.stdout.log"
  $stderrPath = Join-Path $logRoot "$attemptId.psql.stderr.log"
  $expectedHostStdout = Join-Path $logRoot "$attemptId.worker.stdout.log"
  $expectedHostStderr = Join-Path $logRoot "$attemptId.worker.stderr.log"
  $executionSqlPath = Join-Path $logRoot "$attemptId.reviewed.sql"
  $fixedWorkerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-worker.ps1'
  $fixedBootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-bootstrap.ps1'
  $fixedSqlPath = Join-Path $repoRoot 'ops\issue97-computer-rollout\sql\35-worker-proof-read-only.sql'
  $fixedPsqlPath = Join-Path $repoRoot (([string]$manifest.psql.relative_path) -replace '/', '\')

  $pathPairs = @(
    @([string]$attempt.worker_spawn_receipt_path, $expectedSpawnPath),
    @([string]$attempt.worker_pid_receipt_path, $expectedPidPath),
    @([string]$attempt.client_pid_receipt_path, $expectedClientPath),
    @([string]$attempt.client_final_receipt_path, $clientFinalPath),
    @([string]$attempt.final_status_path, $finalPath),
    @([string]$attempt.stdout_path, $stdoutPath),
    @([string]$attempt.stderr_path, $stderrPath),
    @([string]$attempt.worker_host_stdout_path, $expectedHostStdout),
    @([string]$attempt.worker_host_stderr_path, $expectedHostStderr),
    @([string]$attempt.authorization_path, $authorizationPath),
    @([string]$attempt.worker_script, $fixedWorkerPath),
    @([string]$attempt.bootstrap_script, $fixedBootstrapPath),
    @([string]$attempt.sql_path, $fixedSqlPath),
    @([string]$attempt.psql_path, $fixedPsqlPath),
    @([string]$attempt.powershell_path, [string]$manifest.powershell.path)
  )
  foreach ($pair in $pathPairs) {
    if (-not (Test-Issue97SamePath -Left ([string]$pair[0]) -Right ([string]$pair[1]))) {
      throw 'attempt contains a noncanonical fixed path'
    }
  }
  foreach ($path in @($expectedSpawnPath, $expectedPidPath, $expectedClientPath, $clientFinalPath, $finalPath, $stdoutPath, $stderrPath, $expectedHostStdout,
      $expectedHostStderr, $executionSqlPath)) {
    Assert-Issue97PathUnderRoot -Candidate $path -AllowedRoot $logRoot
  }
  if ([string]$attempt.manifest_sha256 -ne (Get-Issue97Sha256 -LiteralPath $manifestPath) -or
      [string]$attempt.authorization_sha256 -ne (Get-Issue97Sha256 -LiteralPath $authorizationPath) -or
      [string]$attempt.powershell_sha256 -ne [string]$manifest.powershell.sha256 -or
      [string]$attempt.psql_sha256 -ne [string]$manifest.psql.sha256) {
    throw 'attempt runtime hash receipt mismatch'
  }
  $authorization = Read-Issue97Json -LiteralPath $authorizationPath
  if ([int]$authorization.schema_version -ne 3 -or
      [string]$authorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$authorization.generation_id -ne [string]$manifest.generation_id -or
      [string]$authorization.authorized_repo_sha -ne $repoSha -or
      [string]$authorization.artifact_set_sha256 -ne $artifactSet -or
      [string]$authorization.manifest_sha256 -ne [string]$attempt.manifest_sha256 -or
      -not [bool]$authorization.production_read_only_proof_authorized -or
      [bool]$authorization.mapping_rehearsal_authorized -or
      [bool]$authorization.automatic_retry_authorized) {
    throw 'production worker exact-SHA authorization receipt mismatch'
  }
  $expectedArtifactHashes = Get-Issue97ArtifactHashMap -Manifest $manifest
  foreach ($key in $expectedArtifactHashes.Keys) {
    if ([string]$attempt.artifact_hashes.$key -ne [string]$expectedArtifactHashes[$key]) {
      throw 'attempt artifact hash receipt mismatch'
    }
  }
  if (Test-Path -LiteralPath $expectedPidPath) { throw 'worker PID receipt already exists' }
  if (Test-Path -LiteralPath $expectedClientPath) { throw 'client PID receipt already exists' }
  if (Test-Path -LiteralPath $clientFinalPath) { throw 'client final receipt already exists' }
  if (Test-Path -LiteralPath $finalPath) { throw 'final receipt already exists' }

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
    throw 'worker process identity mismatch'
  }
  $stage = 'write_pid_receipt'
  $pidReceipt = [ordered]@{
    schema_version = 3
    worker_proof_version = [string]$manifest.worker_proof_version
    generation_id = [string]$manifest.generation_id
    attempt_id = $attemptId
    repo_sha = $repoSha
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
    if ([datetime]::UtcNow -ge $spawnDeadline) { throw 'worker spawn receipt did not arrive' }
    Start-Sleep -Milliseconds 50
  }
  $spawnReceipt = Read-Issue97Json -LiteralPath $expectedSpawnPath
  if ([int]$spawnReceipt.schema_version -ne 3 -or
      [string]$spawnReceipt.attempt_id -ne [string]$attempt.attempt_id -or
      [string]$spawnReceipt.repo_sha -ne $repoSha -or
      [int]$spawnReceipt.worker_pid -ne $PID -or
      [string]$spawnReceipt.process_start_utc -ne [string]$pidReceipt.process_start_utc) {
    throw 'worker spawn receipt mismatch'
  }

  $stage = 'validate_repository_and_runtime'
  $verifiedSha = Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch
  if ($verifiedSha -ne $repoSha -or [string]$attempt.branch -ne [string]$manifest.expected_branch) {
    throw 'attempt does not match the fetched clean repository checkpoint'
  }
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  $verifiedPsqlPath = Assert-Issue97PostgreSQLRuntime -RepoRoot $repoRoot -Manifest $manifest
  if (-not (Test-Issue97SamePath -Left $verifiedPsqlPath -Right $fixedPsqlPath)) {
    throw 'reviewed PostgreSQL client path mismatch'
  }

  $sqlArtifact = @($manifest.artifacts | Where-Object {
    [string]$_.path -eq 'ops/issue97-computer-rollout/sql/35-worker-proof-read-only.sql'
  })
  if ($sqlArtifact.Count -ne 1 -or
      (Get-Issue97Sha256 -LiteralPath $fixedSqlPath) -ne ([string]$sqlArtifact[0].sha256).ToUpperInvariant()) {
    throw 'fixed SQL proof raw-byte hash mismatch'
  }
  $sqlText = [System.IO.File]::ReadAllText($fixedSqlPath, [System.Text.Encoding]::UTF8)
  Write-Issue97TextNoClobber -LiteralPath $executionSqlPath -Text $sqlText
  if ((Get-Issue97Sha256 -LiteralPath $executionSqlPath) -ne ([string]$sqlArtifact[0].sha256).ToUpperInvariant()) {
    throw 'private reviewed SQL execution copy mismatch'
  }
  $sqlGuardStream = [System.IO.File]::Open(
    $executionSqlPath,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::Read
  )
  if ((Test-Path -LiteralPath $stdoutPath) -or (Test-Path -LiteralPath $stderrPath)) {
    throw 'psql output path already exists'
  }

  $stage = 'execute_read_only_client'
  $clientStartUtc = [datetime]::UtcNow.ToString('o')
  $clientStarted = $true
  $psqlArguments = "-X --no-psqlrc --set=ON_ERROR_STOP=1 --set=issue97_expected_pgappname=$([string]$attempt.pgappname) --file=`"$executionSqlPath`""
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $fixedPsqlPath
  $startInfo.Arguments = $psqlArguments
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGSERVICE'] = [string]$manifest.expected_service
  $startInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
  $startInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '10'
  $startInfo.EnvironmentVariables['PGAPPNAME'] = [string]$attempt.pgappname
  $startInfo.EnvironmentVariables.Remove('PGOPTIONS')
  $client = New-Object System.Diagnostics.Process
  $client.StartInfo = $startInfo
  if (-not $client.Start()) { throw 'reviewed psql client did not start' }
  $stdoutTask = $client.StandardOutput.ReadToEndAsync()
  $stderrTask = $client.StandardError.ReadToEndAsync()
  $clientPid = [int]$client.Id
  $clientProcessStartUtc = $client.StartTime.ToUniversalTime().ToString('o')
  Write-Issue97JsonAtomicNoClobber -LiteralPath $expectedClientPath -Value ([ordered]@{
    schema_version = 3
    worker_proof_version = [string]$manifest.worker_proof_version
    generation_id = [string]$manifest.generation_id
    job_kind = [string]$attempt.job_kind
    attempt_id = [string]$attempt.attempt_id
    repo_sha = [string]$attempt.repo_sha
    pgappname = [string]$attempt.pgappname
    child_environment_pgappname = [string]$startInfo.EnvironmentVariables['PGAPPNAME']
    pid = $clientPid
    process_start_utc = $clientProcessStartUtc
    executable_path = $fixedPsqlPath
    execution_sql_path = $executionSqlPath
  })
  $clientConfirmedFinished = $client.WaitForExit(45000)
  if (-not $clientConfirmedFinished) {
    $failureCode = 'psql_wallclock_timeout_server_inspection_required'
    throw 'reviewed psql client exceeded the fixed wall-clock bound'
  }
  $client.WaitForExit()
  $client.Refresh()
  $clientEndUtc = [datetime]::UtcNow.ToString('o')
  $exitCode = [int]$client.ExitCode
  $stdoutText = [string]$stdoutTask.GetAwaiter().GetResult()
  $stderrText = [string]$stderrTask.GetAwaiter().GetResult()
  Write-Issue97TextNoClobber -LiteralPath $stdoutPath -Text $stdoutText
  Write-Issue97TextNoClobber -LiteralPath $stderrPath -Text $stderrText
  $stdoutHash = Get-Issue97Sha256 -LiteralPath $stdoutPath
  $stderrHash = Get-Issue97Sha256 -LiteralPath $stderrPath
  Write-Issue97JsonAtomicNoClobber -LiteralPath $clientFinalPath -Value ([ordered]@{
    schema_version = 3
    worker_proof_version = [string]$attempt.worker_proof_version
    generation_id = [string]$manifest.generation_id
    job_kind = [string]$attempt.job_kind
    attempt_id = [string]$attempt.attempt_id
    repo_sha = [string]$attempt.repo_sha
    pgappname = [string]$attempt.pgappname
    child_environment_pgappname = [string]$startInfo.EnvironmentVariables['PGAPPNAME']
    pid = $clientPid
    process_start_utc = $clientProcessStartUtc
    process_end_utc = $clientEndUtc
    exit_code = $exitCode
    stdout_sha256 = $stdoutHash
    stderr_sha256 = $stderrHash
  })
  $finalMarkerPresent = ([regex]::Matches($stdoutText, 'ISSUE97_WORKER_PROOF_PASS')).Count -eq 1
  $rollbackPresent = ([regex]::Matches($stdoutText, '(?im)^\s*ROLLBACK\s*$')).Count -eq 1
  $commitCount = [regex]::Matches($stdoutText + "`n" + $stderrText, '(?im)^\s*COMMIT\s*$').Count
  $durationSeconds = (
    [datetime]::Parse($clientEndUtc).ToUniversalTime() - [datetime]::Parse($clientStartUtc).ToUniversalTime()
  ).TotalSeconds
  if ($exitCode -ne 0) { $failureCode = 'psql_nonzero_exit_server_inspection_required' }
  elseif (-not $finalMarkerPresent) { $failureCode = 'final_pass_marker_missing_server_inspection_required' }
  elseif (-not $rollbackPresent) { $failureCode = 'rollback_marker_missing_server_inspection_required' }
  elseif ($commitCount -ne 0) { $failureCode = 'commit_marker_present_server_inspection_required' }
  elseif ($durationSeconds -lt 5.0) { $failureCode = 'five_second_lifetime_not_proven' }
  else { $failureCode = $null }
} catch {
  if ($failureCode -eq 'worker_initialization_failed') {
    $failureCode = 'worker_validation_or_execution_failed_server_inspection_required'
  }
  if ([string]::IsNullOrWhiteSpace([string]$finalPath) -and -not [string]::IsNullOrWhiteSpace([string]$logRoot) -and
      -not [string]::IsNullOrWhiteSpace([string]$artifactSet)) {
    $earlyPath = Join-Path $logRoot 'production.early-failure.txt'
    try {
      $earlyBytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes("STAGE=$stage`n")
      $earlyStream = [System.IO.File]::Open($earlyPath, [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
      try { $earlyStream.Write($earlyBytes, 0, $earlyBytes.Length) } finally { $earlyStream.Dispose() }
    } catch { }
  }
} finally {
  if ($null -ne $sqlGuardStream) { $sqlGuardStream.Dispose() }
  Remove-Item Env:PGAPPNAME -ErrorAction SilentlyContinue
  Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  Remove-Item Env:PGSERVICE -ErrorAction SilentlyContinue
  if ($null -ne $attempt -and -not [string]::IsNullOrWhiteSpace($finalPath)) {
    $endUtc = [datetime]::UtcNow.ToString('o')
    $success = (
      $clientStarted -and $clientConfirmedFinished -and $exitCode -eq 0 -and
      $finalMarkerPresent -and $rollbackPresent -and $commitCount -eq 0 -and $durationSeconds -ge 5.0
    )
    $receipt = [ordered]@{
      schema_version = 3
      worker_proof_version = [string]$attempt.worker_proof_version
      generation_id = [string]$manifest.generation_id
      job_kind = [string]$attempt.job_kind
      attempt_id = [string]$attempt.attempt_id
      repo_sha = [string]$attempt.repo_sha
      pid = $PID
      process_start_utc = if ($null -ne $pidReceipt) { [string]$pidReceipt.process_start_utc } else { $null }
      pgappname = [string]$attempt.pgappname
      worker_start_utc = $workerStartUtc
      client_start_utc = $clientStartUtc
      client_end_utc = $clientEndUtc
      client_pid = $clientPid
      client_process_start_utc = $clientProcessStartUtc
      worker_end_utc = $endUtc
      client_started = $clientStarted
      client_confirmed_finished = $clientConfirmedFinished
      client_duration_seconds = $durationSeconds
      exit_code = $exitCode
      client_final_receipt_path = $clientFinalPath
      client_final_receipt_sha256 = if ($clientConfirmedFinished -and (Test-Path -LiteralPath $clientFinalPath)) { Get-Issue97Sha256 -LiteralPath $clientFinalPath } else { $null }
      child_environment_pgappname = if ($clientConfirmedFinished) { [string]$attempt.pgappname } else { $null }
      final_marker_present = $finalMarkerPresent
      rollback_present = $rollbackPresent
      commit_count = $commitCount
      stdout_sha256 = if ($clientConfirmedFinished -and (Test-Path -LiteralPath $stdoutPath)) { Get-Issue97Sha256 -LiteralPath $stdoutPath } else { $null }
      stderr_sha256 = if ($clientConfirmedFinished -and (Test-Path -LiteralPath $stderrPath)) { Get-Issue97Sha256 -LiteralPath $stderrPath } else { $null }
      executed_sql_sha256 = if ($null -ne $executionSqlPath -and (Test-Path -LiteralPath $executionSqlPath)) { Get-Issue97Sha256 -LiteralPath $executionSqlPath } else { $null }
      psql_sha256 = if ($null -ne $manifest) { [string]$manifest.psql.sha256 } else { $null }
      server_inspection_required = (-not $success)
      success = $success
      failure_code = $failureCode
      failure_stage = if ($success) { $null } else { $stage }
      worker_exit_code = if ($success) { 0 } else { 91 }
    }
    try {
      Write-Issue97JsonAtomicNoClobber -LiteralPath $finalPath -Value $receipt
    } catch {
      exit 92
    }
    if ($success) { exit 0 }
  }
  exit 91
}
