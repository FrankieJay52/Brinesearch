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
  throw 'issue97-worker-proof-status.ps1 accepts zero arguments'
}

function Write-Issue97State {
  param(
    [Parameter(Mandatory = $true)][ValidateSet(
      'NOT_STARTED', 'RUNNING', 'CLIENT_FINISHED_SUCCESS', 'CLIENT_FINISHED_FAILURE',
      'WORKER_DISAPPEARED_WITHOUT_RECEIPT', 'RECEIPT_INVALID', 'SERVER_INSPECTION_REQUIRED'
    )][string]$State,
    [hashtable]$Details = @{}
  )
  Write-Output "STATE=$State"
  $safe = [ordered]@{ state = $State }
  foreach ($key in $Details.Keys) { $safe[$key] = $Details[$key] }
  Write-Output ($safe | ConvertTo-Json -Compress -Depth 8)
  exit 0
}

function Write-Issue97UnsafeReceiptState {
  param([hashtable]$Details = @{})
  if (-not $Details.ContainsKey('validation_line')) {
    $Details.validation_line = $MyInvocation.ScriptLineNumber
  }
  if ($script:expectedKind -eq 'production_read_only_pg_sleep_proof') {
    Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details $Details
  }
  Write-Issue97State -State 'RECEIPT_INVALID' -Details $Details
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$expectedKind = $null
$productionMarker = $null
$productionClaim = $null
$attempt = $null

try {
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([System.IO.Path]::IsPathRooted([string]$manifest.private_log_root)) {
    $productionClaim = Join-Path ([string]$manifest.private_log_root) 'production.launch.json'
    $productionMarker = Join-Path ([string]$manifest.private_log_root) 'production.attempt.json'
  }
  $libArtifact = @($manifest.artifacts | Where-Object {
    [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
  })
  $selfArtifact = @($manifest.artifacts | Where-Object {
    [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-status.ps1'
  })
  if ($libArtifact.Count -ne 1 -or $selfArtifact.Count -ne 1 -or
      (Get-Issue97PreambleSha256 -LiteralPath $libPath) -ne ([string]$libArtifact[0].sha256).ToUpperInvariant() -or
      (Get-Issue97PreambleSha256 -LiteralPath $PSCommandPath) -ne ([string]$selfArtifact[0].sha256).ToUpperInvariant()) {
    throw 'status library hash mismatch'
  }
  . $libPath
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  $logRoot = [string]$manifest.private_log_root
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
  $artifactSet = [string]$manifest.artifact_set_sha256
  $productionClaim = Join-Path $logRoot 'production.launch.json'
  $productionMarker = Join-Path $logRoot 'production.attempt.json'
  $localClaim = Join-Path $logRoot 'local.launch.json'
  $localMarker = Join-Path $logRoot 'local.attempt.json'
  if (Test-Path -LiteralPath $productionMarker -PathType Leaf) {
    $markerPath = $productionMarker
    $expectedKind = 'production_read_only_pg_sleep_proof'
    $expectedIdPattern = '^issue97-wp-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$'
    $expectedPgPattern = '^brinesearch-i97-wp-[0-9]{14}-[0-9a-f]{8}$'
    $expectedWorker = Join-Path $PSScriptRoot 'issue97-worker-proof-worker.ps1'
    $expectedBootstrap = Join-Path $PSScriptRoot 'issue97-worker-proof-bootstrap.ps1'
    $markerPrefix = 'production'
  } elseif ((-not (Test-Path -LiteralPath $productionClaim -PathType Leaf)) -and
      (Test-Path -LiteralPath $localMarker -PathType Leaf)) {
    $markerPath = $localMarker
    $expectedKind = 'local_detached_process_proof'
    $expectedIdPattern = '^issue97-local-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$'
    $expectedPgPattern = '^local-only-no-database-[0-9a-f]{8}$'
    $expectedWorker = Join-Path $PSScriptRoot 'issue97-worker-proof-local-worker.ps1'
    $expectedBootstrap = Join-Path $PSScriptRoot 'issue97-worker-proof-local-bootstrap.ps1'
    $markerPrefix = 'local'
  } elseif ((Test-Path -LiteralPath $productionClaim -PathType Leaf) -or
      (Test-Path -LiteralPath $localClaim -PathType Leaf)) {
    $claimPath = if (Test-Path -LiteralPath $productionClaim -PathType Leaf) { $productionClaim } else { $localClaim }
    $claimKind = if ($claimPath -eq $productionClaim) {
      'production_read_only_pg_sleep_proof'
    } else { 'local_detached_process_proof' }
    $script:expectedKind = $claimKind
    $claim = Read-Issue97Json -LiteralPath $claimPath
    $claimPrefix = if ($claimKind -eq 'production_read_only_pg_sleep_proof') { 'production' } else { 'local' }
    $bootstrapName = if ($claimKind -eq 'production_read_only_pg_sleep_proof') {
      'issue97-worker-proof-bootstrap.ps1'
    } else { 'issue97-worker-proof-local-bootstrap.ps1' }
    $bootstrapReceiptPath = Join-Path $logRoot "$claimPrefix.bootstrap.json"
    $bootstrapFinalPath = Join-Path $logRoot "$claimPrefix.bootstrap-final.json"
    $expectedBootstrap = Join-Path $PSScriptRoot $bootstrapName
    $authorizationPath = Join-Path $logRoot $(if ($claimKind -eq 'production_read_only_pg_sleep_proof') {
      'production.authorization.json'
    } else { 'local.authorization.json' })
    if ([int]$claim.schema_version -ne 3 -or [string]$claim.job_kind -ne $claimKind -or
        [string]$claim.generation_id -ne [string]$manifest.generation_id -or
        [string]$claim.artifact_set_sha256 -ne $artifactSet -or
        [string]$claim.authorized_repo_sha -notmatch '^[0-9a-f]{40}$' -or
        -not (Test-Issue97SamePath -Left ([string]$claim.authorization_path) -Right $authorizationPath) -or
        [string]$claim.authorization_sha256 -ne (Get-Issue97Sha256 -LiteralPath $authorizationPath) -or
        -not (Test-Issue97SamePath -Left ([string]$claim.bootstrap_receipt_path) -Right $bootstrapReceiptPath) -or
        -not (Test-Issue97SamePath -Left ([string]$claim.bootstrap_final_path) -Right $bootstrapFinalPath) -or
        -not (Test-Issue97SamePath -Left ([string]$claim.bootstrap_script) -Right $expectedBootstrap)) {
      Write-Issue97UnsafeReceiptState -Details @{ attempt_id = [string]$claim.attempt_id; pgappname = [string]$claim.pgappname }
    }
    $authorization = Read-Issue97Json -LiteralPath $authorizationPath
    $claimAuthorized = if ($claimKind -eq 'production_read_only_pg_sleep_proof') {
      [bool]$authorization.production_read_only_proof_authorized
    } else { [bool]$authorization.local_proof_authorized }
    if ([int]$authorization.schema_version -ne 3 -or
        [string]$authorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
        [string]$authorization.generation_id -ne [string]$manifest.generation_id -or
        [string]$authorization.authorized_repo_sha -ne [string]$claim.authorized_repo_sha -or
        [string]$authorization.artifact_set_sha256 -ne $artifactSet -or
        [string]$authorization.manifest_sha256 -ne [string]$claim.manifest_sha256 -or
        -not $claimAuthorized -or [bool]$authorization.mapping_rehearsal_authorized -or
        ($claimKind -eq 'local_detached_process_proof' -and [bool]$authorization.production_read_only_proof_authorized) -or
        [bool]$authorization.automatic_retry_authorized) {
      Write-Issue97UnsafeReceiptState -Details @{ attempt_id = [string]$claim.attempt_id; pgappname = [string]$claim.pgappname }
    }
    if (Test-Path -LiteralPath $bootstrapReceiptPath -PathType Leaf) {
      $bootstrapReceipt = Read-Issue97Json -LiteralPath $bootstrapReceiptPath
      if ([string]$bootstrapReceipt.attempt_id -ne [string]$claim.attempt_id -or
          [int]$bootstrapReceipt.pid -le 0 -or
          -not (Test-Issue97SamePath -Left ([string]$bootstrapReceipt.bootstrap_script) -Right $expectedBootstrap)) {
        Write-Issue97UnsafeReceiptState -Details @{ attempt_id = [string]$claim.attempt_id; pgappname = [string]$claim.pgappname }
      }
      $bootstrapProcess = Get-Process -Id ([int]$bootstrapReceipt.pid) -ErrorAction SilentlyContinue
      if ($null -ne $bootstrapProcess) {
        try {
          $bootstrapIdentity = Get-Issue97ProcessIdentity -ProcessId ([int]$bootstrapReceipt.pid)
          $bootstrapMatches = Test-Issue97WorkerProcessIdentity -Actual $bootstrapIdentity `
            -ExpectedPid ([int]$bootstrapReceipt.pid) -ExpectedStartUtc ([string]$bootstrapReceipt.process_start_utc) `
            -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $expectedBootstrap
        } catch { $bootstrapMatches = $false }
        if ($bootstrapMatches) {
          Write-Issue97State -State 'RUNNING' -Details @{
            attempt_id = [string]$claim.attempt_id
            pid = [int]$bootstrapReceipt.pid
            process_start_utc = [string]$bootstrapReceipt.process_start_utc
            pgappname = [string]$claim.pgappname
            bootstrap_preflight = $true
          }
        }
      }
    }
    if (Test-Path -LiteralPath $bootstrapFinalPath -PathType Leaf) {
      $bootstrapFinal = Read-Issue97Json -LiteralPath $bootstrapFinalPath
      if (-not [bool]$bootstrapFinal.success) {
        if ($claimKind -eq 'production_read_only_pg_sleep_proof') {
          Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
            attempt_id = [string]$claim.attempt_id
            pgappname = [string]$claim.pgappname
            failure_code = [string]$bootstrapFinal.failure_code
          }
        }
        Write-Issue97State -State 'CLIENT_FINISHED_FAILURE' -Details @{
          attempt_id = [string]$claim.attempt_id
          failure_code = [string]$bootstrapFinal.failure_code
        }
      }
    }
    $claimAge = [datetime]::UtcNow - [datetime]::Parse([string]$claim.utc_start).ToUniversalTime()
    if ($claimAge.TotalSeconds -le 60) {
      Write-Issue97State -State 'RUNNING' -Details @{
        attempt_id = [string]$claim.attempt_id
        pgappname = [string]$claim.pgappname
        bootstrap_receipt_pending = $true
      }
    }
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = [string]$claim.attempt_id; pgappname = [string]$claim.pgappname }
  } else {
    Write-Issue97State -State 'NOT_STARTED'
  }

  $attempt = Read-Issue97Json -LiteralPath $markerPath
  if ([int]$attempt.schema_version -ne 3 -or
      [string]$attempt.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$attempt.generation_id -ne [string]$manifest.generation_id -or
      [string]$attempt.artifact_set_sha256 -ne $artifactSet -or
      [string]$attempt.job_kind -ne $expectedKind -or
      [string]$attempt.attempt_id -notmatch $expectedIdPattern -or
      [string]$attempt.repo_sha -notmatch '^[0-9a-f]{40}$' -or
      -not (Test-Issue97SamePath -Left ([string]$attempt.worker_script) -Right $expectedWorker)) {
    Write-Issue97UnsafeReceiptState
  }
  $authorizationPath = Join-Path $logRoot $(if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
    'production.authorization.json'
  } else { 'local.authorization.json' })
  if (-not (Test-Issue97SamePath -Left ([string]$attempt.authorization_path) -Right $authorizationPath) -or
      [string]$attempt.authorization_sha256 -ne (Get-Issue97Sha256 -LiteralPath $authorizationPath)) {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = [string]$attempt.attempt_id; pgappname = [string]$attempt.pgappname }
  }
  $authorization = Read-Issue97Json -LiteralPath $authorizationPath
  $authorizedForKind = if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
    [bool]$authorization.production_read_only_proof_authorized
  } else { [bool]$authorization.local_proof_authorized }
  if ([int]$authorization.schema_version -ne 3 -or
      [string]$authorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$authorization.generation_id -ne [string]$manifest.generation_id -or
      [string]$authorization.authorized_repo_sha -ne [string]$attempt.repo_sha -or
      [string]$authorization.artifact_set_sha256 -ne $artifactSet -or
      [string]$authorization.manifest_sha256 -ne [string]$attempt.manifest_sha256 -or
      -not $authorizedForKind -or [bool]$authorization.mapping_rehearsal_authorized -or
      ($expectedKind -eq 'local_detached_process_proof' -and [bool]$authorization.production_read_only_proof_authorized) -or
      [bool]$authorization.automatic_retry_authorized) {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = [string]$attempt.attempt_id; pgappname = [string]$attempt.pgappname }
  }

  $attemptId = [string]$attempt.attempt_id
  $expectedSpawnPath = Join-Path $logRoot "$markerPrefix.spawn.json"
  $expectedPidPath = Join-Path $logRoot "$markerPrefix.pid.json"
  $expectedFinalPath = Join-Path $logRoot "$markerPrefix.final.json"
  if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
    $expectedStdout = Join-Path $logRoot "$attemptId.psql.stdout.log"
    $expectedStderr = Join-Path $logRoot "$attemptId.psql.stderr.log"
    $expectedClientPath = Join-Path $logRoot 'production.client.json'
    $expectedClientFinalPath = Join-Path $logRoot 'production.client-final.json'
  } else {
    $expectedStdout = Join-Path $logRoot "$attemptId.local.stdout.log"
    $expectedStderr = Join-Path $logRoot "$attemptId.local.stderr.log"
    $expectedClientPath = Join-Path $logRoot 'local.client.json'
    $expectedClientFinalPath = Join-Path $logRoot 'local.client-final.json'
  }
  $expectedHostStdout = Join-Path $logRoot "$attemptId.worker.stdout.log"
  $expectedHostStderr = Join-Path $logRoot "$attemptId.worker.stderr.log"
  foreach ($pair in @(
    @([string]$attempt.worker_spawn_receipt_path, $expectedSpawnPath),
    @([string]$attempt.worker_pid_receipt_path, $expectedPidPath),
    @([string]$attempt.client_pid_receipt_path, $expectedClientPath),
    @([string]$attempt.client_final_receipt_path, $expectedClientFinalPath),
    @([string]$attempt.final_status_path, $expectedFinalPath),
    @([string]$attempt.stdout_path, $expectedStdout),
    @([string]$attempt.stderr_path, $expectedStderr),
    @([string]$attempt.worker_host_stdout_path, $expectedHostStdout),
    @([string]$attempt.worker_host_stderr_path, $expectedHostStderr)
  )) {
    if (-not (Test-Issue97SamePath -Left ([string]$pair[0]) -Right ([string]$pair[1]))) {
      Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
    }
  }
  foreach ($path in @($expectedSpawnPath, $expectedPidPath, $expectedClientPath, $expectedClientFinalPath, $expectedFinalPath, $expectedStdout, $expectedStderr,
      $expectedHostStdout, $expectedHostStderr)) {
    Assert-Issue97PathUnderRoot -Candidate $path -AllowedRoot $logRoot
  }
  if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
    Assert-Issue97PathUnderRoot -Candidate $expectedClientPath -AllowedRoot $logRoot
  }
  if (-not (Test-Path -LiteralPath $expectedSpawnPath -PathType Leaf)) {
    $bootstrapReceiptPath = Join-Path $logRoot "$markerPrefix.bootstrap.json"
    if (Test-Path -LiteralPath $bootstrapReceiptPath -PathType Leaf) {
      $bootstrapReceipt = Read-Issue97Json -LiteralPath $bootstrapReceiptPath
      if ([string]$bootstrapReceipt.attempt_id -eq $attemptId -and [int]$bootstrapReceipt.pid -gt 0 -and
          -not [string]::IsNullOrWhiteSpace([string]$bootstrapReceipt.process_start_utc) -and
          (Test-Issue97SamePath -Left ([string]$bootstrapReceipt.bootstrap_script) -Right $expectedBootstrap)) {
        $bootstrapProcess = Get-Process -Id ([int]$bootstrapReceipt.pid) -ErrorAction SilentlyContinue
        if ($null -ne $bootstrapProcess) {
          try {
            $bootstrapIdentity = Get-Issue97ProcessIdentity -ProcessId ([int]$bootstrapReceipt.pid)
            $bootstrapMatches = Test-Issue97WorkerProcessIdentity -Actual $bootstrapIdentity `
              -ExpectedPid ([int]$bootstrapReceipt.pid) `
              -ExpectedStartUtc ([string]$bootstrapReceipt.process_start_utc) `
              -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $expectedBootstrap
          } catch { $bootstrapMatches = $false }
          if ($bootstrapMatches) {
            Write-Issue97State -State 'RUNNING' -Details @{
              attempt_id = $attemptId
              pid = [int]$bootstrapReceipt.pid
              process_start_utc = [string]$bootstrapReceipt.process_start_utc
              pgappname = [string]$attempt.pgappname
              worker_spawn_pending = $true
            }
          }
        }
      }
    }
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  $spawnReceipt = Read-Issue97Json -LiteralPath $expectedSpawnPath
  if ([int]$spawnReceipt.schema_version -ne 3 -or
      [string]$spawnReceipt.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$spawnReceipt.job_kind -ne $expectedKind -or
      [string]$spawnReceipt.attempt_id -ne $attemptId -or
      [string]$spawnReceipt.repo_sha -ne [string]$attempt.repo_sha -or
      [int]$spawnReceipt.worker_pid -le 0 -or
      [string]::IsNullOrWhiteSpace([string]$spawnReceipt.process_start_utc)) {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  if (-not (Test-Path -LiteralPath $expectedPidPath -PathType Leaf)) {
    $spawnedProcess = Get-Process -Id ([int]$spawnReceipt.worker_pid) -ErrorAction SilentlyContinue
    if ($null -ne $spawnedProcess) {
      try {
        $spawnedIdentity = Get-Issue97ProcessIdentity -ProcessId ([int]$spawnReceipt.worker_pid)
        $spawnedIdentityMatches = Test-Issue97WorkerProcessIdentity -Actual $spawnedIdentity `
          -ExpectedPid ([int]$spawnReceipt.worker_pid) -ExpectedStartUtc ([string]$spawnReceipt.process_start_utc) `
          -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $expectedWorker
      } catch {
        $spawnedIdentityMatches = $false
      }
      if ($spawnedIdentityMatches) {
        Write-Issue97State -State 'RUNNING' -Details @{
          attempt_id = $attemptId
          pid = [int]$spawnReceipt.worker_pid
          process_start_utc = [string]$spawnReceipt.process_start_utc
          pgappname = [string]$attempt.pgappname
          worker_receipt_pending = $true
        }
      }
    }
    if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
      Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
        attempt_id = $attemptId
        pid = [int]$spawnReceipt.worker_pid
        pgappname = [string]$attempt.pgappname
      }
    }
    if (-not (Test-Path -LiteralPath $expectedFinalPath -PathType Leaf)) {
      Write-Issue97State -State 'WORKER_DISAPPEARED_WITHOUT_RECEIPT' -Details @{
        attempt_id = $attemptId
        pid = [int]$spawnReceipt.worker_pid
        pgappname = [string]$attempt.pgappname
      }
    }
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  $pidReceipt = Read-Issue97Json -LiteralPath $expectedPidPath
  if (
      [int]$pidReceipt.schema_version -ne 3 -or
      [string]$pidReceipt.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$pidReceipt.attempt_id -ne $attemptId -or
      [string]$pidReceipt.repo_sha -ne [string]$attempt.repo_sha -or
      [int]$pidReceipt.pid -le 0 -or [int]$pidReceipt.pid -ne [int]$spawnReceipt.worker_pid -or
      [string]$pidReceipt.process_start_utc -ne [string]$spawnReceipt.process_start_utc -or
      -not (Test-Issue97SamePath -Left ([string]$pidReceipt.executable_path) -Right ([string]$manifest.powershell.path)) -or
      -not (Test-Issue97SamePath -Left ([string]$pidReceipt.worker_script) -Right $expectedWorker)) {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }

  $process = Get-Process -Id ([int]$pidReceipt.pid) -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    try {
      $actualIdentity = Get-Issue97ProcessIdentity -ProcessId ([int]$pidReceipt.pid)
      $identityMatches = Test-Issue97WorkerProcessIdentity -Actual $actualIdentity `
        -ExpectedPid ([int]$pidReceipt.pid) -ExpectedStartUtc ([string]$pidReceipt.process_start_utc) `
        -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $expectedWorker
    } catch {
      $identityMatches = $false
    }
    if (-not $identityMatches) {
      $state = if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
        'SERVER_INSPECTION_REQUIRED'
      } else { 'RECEIPT_INVALID' }
      Write-Issue97State -State $state -Details @{ attempt_id = $attemptId; pid = [int]$pidReceipt.pid }
    }
    Write-Issue97State -State 'RUNNING' -Details @{
      attempt_id = $attemptId
      pid = [int]$pidReceipt.pid
      process_start_utc = [string]$pidReceipt.process_start_utc
      pgappname = [string]$attempt.pgappname
    }
  }

  if (-not (Test-Path -LiteralPath $expectedFinalPath -PathType Leaf)) {
    Write-Issue97State -State 'WORKER_DISAPPEARED_WITHOUT_RECEIPT' -Details @{
      attempt_id = $attemptId
      pid = [int]$pidReceipt.pid
      pgappname = [string]$attempt.pgappname
    }
  }
  $final = Read-Issue97Json -LiteralPath $expectedFinalPath
  if ([int]$final.schema_version -ne 3 -or
      [string]$final.worker_proof_version -ne [string]$attempt.worker_proof_version -or
      [string]$final.generation_id -ne [string]$manifest.generation_id -or
      [string]$final.job_kind -ne $expectedKind -or
      [string]$final.attempt_id -ne $attemptId -or
      [string]$final.repo_sha -ne [string]$attempt.repo_sha -or
      [int]$final.pid -ne [int]$pidReceipt.pid -or
      [string]$final.process_start_utc -ne [string]$pidReceipt.process_start_utc) {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  if (-not (Test-Path -LiteralPath $expectedStdout -PathType Leaf) -or
      -not (Test-Path -LiteralPath $expectedStderr -PathType Leaf) -or
      [string]$final.stdout_sha256 -ne (Get-Issue97Sha256 -LiteralPath $expectedStdout) -or
      [string]$final.stderr_sha256 -ne (Get-Issue97Sha256 -LiteralPath $expectedStderr)) {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  $stdoutText = [System.IO.File]::ReadAllText($expectedStdout)
  $stderrText = [System.IO.File]::ReadAllText($expectedStderr)
  try {
    $backendPrefix = if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
      'ISSUE97_WORKER_PROOF_BACKEND_IDENTITY'
    } else { 'ISSUE97_LOCAL_BACKEND_IDENTITY' }
    $backendIdentity = Get-Issue97BackendIdentityMarker -Text $stdoutText `
      -ExpectedAttemptId $attemptId -ExpectedPrefix $backendPrefix
  } catch {
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; backend_identity = 'invalid' }
  }

  if (-not (Test-Path -LiteralPath $expectedClientPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $expectedClientFinalPath -PathType Leaf)) {
    if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
      Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
        attempt_id = $attemptId
        pgappname = [string]$attempt.pgappname
      }
    }
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  $clientReceipt = Read-Issue97Json -LiteralPath $expectedClientPath
  $clientFinal = Read-Issue97Json -LiteralPath $expectedClientFinalPath
  if ([int]$clientReceipt.schema_version -ne 3 -or
      [int]$clientFinal.schema_version -ne 3 -or
      [string]$clientReceipt.generation_id -ne [string]$manifest.generation_id -or
      [string]$clientFinal.generation_id -ne [string]$manifest.generation_id -or
      [string]$clientReceipt.attempt_id -ne $attemptId -or
      [string]$clientFinal.attempt_id -ne $attemptId -or
      [string]$clientReceipt.repo_sha -ne [string]$attempt.repo_sha -or
      [string]$clientFinal.repo_sha -ne [string]$attempt.repo_sha -or
      [int]$clientReceipt.pid -le 0 -or
      [int]$clientFinal.pid -ne [int]$clientReceipt.pid -or
      [string]$clientFinal.process_start_utc -ne [string]$clientReceipt.process_start_utc -or
      [int]$final.client_pid -ne [int]$clientReceipt.pid -or
      [string]$final.client_process_start_utc -ne [string]$clientReceipt.process_start_utc -or
      [int]$final.exit_code -ne [int]$clientFinal.exit_code -or
      [string]$clientFinal.backend_attempt_id -ne $attemptId -or
      [string]$final.backend_attempt_id -ne $attemptId -or
      [long]$clientFinal.backend_attempt_lock_key -ne [long]$backendIdentity.attempt_lock_key -or
      [long]$final.backend_attempt_lock_key -ne [long]$backendIdentity.attempt_lock_key -or
      [int]$clientFinal.backend_pid -ne [int]$backendIdentity.backend_pid -or
      [int]$final.backend_pid -ne [int]$backendIdentity.backend_pid -or
      [string]$clientFinal.backend_start_utc -ne [string]$backendIdentity.backend_start_utc -or
      [string]$final.backend_start_utc -ne [string]$backendIdentity.backend_start_utc -or
      -not [bool]$clientFinal.transaction_read_only -or -not [bool]$final.transaction_read_only -or
      [string]$clientFinal.backend_custom_guc -ne $attemptId -or
      [string]$final.backend_custom_guc -ne $attemptId -or
      [string]$clientFinal.observed_application_name -ne [string]$backendIdentity.observed_application_name -or
      [string]$final.observed_application_name -ne [string]$backendIdentity.observed_application_name -or
      [string]$final.client_final_receipt_sha256 -ne (Get-Issue97Sha256 -LiteralPath $expectedClientFinalPath) -or
      [string]$clientFinal.stdout_sha256 -ne (Get-Issue97Sha256 -LiteralPath $expectedStdout) -or
      [string]$clientFinal.stderr_sha256 -ne (Get-Issue97Sha256 -LiteralPath $expectedStderr)) {
    if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
      Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
        attempt_id = $attemptId
        pgappname = [string]$attempt.pgappname
      }
    }
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }
  if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
    $expectedPsqlPath = Join-Path $repoRoot (([string]$manifest.psql.relative_path) -replace '/', '\')
    $expectedExecutionSql = Join-Path $logRoot "$attemptId.reviewed.sql"
    if (-not (Test-Issue97SamePath -Left ([string]$clientReceipt.executable_path) -Right $expectedPsqlPath) -or
        -not (Test-Issue97SamePath -Left ([string]$clientReceipt.execution_sql_path) -Right $expectedExecutionSql)) {
      Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
        attempt_id = $attemptId
        pgappname = [string]$attempt.pgappname
      }
    }
  } else {
    $expectedChildPath = Join-Path $PSScriptRoot 'issue97-worker-proof-local-child.ps1'
    if (-not (Test-Issue97SamePath -Left ([string]$clientReceipt.executable_path) -Right ([string]$manifest.powershell.path)) -or
        -not (Test-Issue97SamePath -Left ([string]$clientReceipt.child_script) -Right $expectedChildPath)) {
      Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
    }
  }
  $liveClient = Get-Process -Id ([int]$clientReceipt.pid) -ErrorAction SilentlyContinue
  if ($null -ne $liveClient) {
    if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
      Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
        attempt_id = $attemptId
        pgappname = [string]$attempt.pgappname
        client_pid = [int]$clientReceipt.pid
      }
    }
    Write-Issue97UnsafeReceiptState -Details @{ attempt_id = $attemptId; pgappname = [string]$attempt.pgappname }
  }

  if ($expectedKind -eq 'production_read_only_pg_sleep_proof') {
    $sqlArtifact = @($manifest.artifacts | Where-Object {
      [string]$_.path -eq 'ops/issue97-computer-rollout/sql/35-worker-proof-read-only.sql'
    })
    $successContract = (
      [bool]$final.success -and [bool]$final.client_started -and [bool]$final.client_confirmed_finished -and
      [int]$final.exit_code -eq 0 -and [int]$clientFinal.exit_code -eq 0 -and
      [int]$final.worker_exit_code -eq 0 -and [double]$final.client_duration_seconds -ge 5.0 -and
      [bool]$final.final_marker_present -and
      [string]$final.backend_attempt_id -eq $attemptId -and
      [long]$final.backend_attempt_lock_key -eq [long]$backendIdentity.attempt_lock_key -and
      [int]$final.backend_pid -eq [int]$backendIdentity.backend_pid -and
      [string]$final.backend_start_utc -eq [string]$backendIdentity.backend_start_utc -and
      [bool]$final.transaction_read_only -and [string]$final.backend_custom_guc -eq $attemptId -and
      ([regex]::Matches($stdoutText, 'ISSUE97_WORKER_PROOF_PASS')).Count -eq 1 -and
      [bool]$final.rollback_present -and
      ([regex]::Matches($stdoutText, '(?im)^\s*ROLLBACK\s*$')).Count -eq 1 -and
      [int]$final.commit_count -eq 0 -and
      ([regex]::Matches($stdoutText + "`n" + $stderrText, '(?im)^\s*COMMIT\s*$')).Count -eq 0 -and
      [string]$final.psql_sha256 -eq [string]$manifest.psql.sha256 -and
      [string]$final.executed_sql_sha256 -eq ([string]$sqlArtifact[0].sha256).ToUpperInvariant() -and
      -not [bool]$final.server_inspection_required
    )
  } else {
    $successContract = (
      [bool]$final.success -and [bool]$final.client_started -and [bool]$final.client_confirmed_finished -and
      [int]$final.exit_code -eq 0 -and [int]$clientFinal.exit_code -eq 0 -and
      [int]$final.worker_exit_code -eq 0 -and
      [bool]$final.final_marker_present -and [double]$final.worker_duration_seconds -ge 5.0 -and
      [double]$final.client_duration_seconds -ge 5.0 -and
      ([regex]::Matches($stdoutText, 'ISSUE97_LOCAL_WORKER_PASS')).Count -eq 1 -and
      [string]$final.backend_attempt_id -eq $attemptId -and
      [long]$final.backend_attempt_lock_key -eq -9700350004 -and
      [int]$final.backend_pid -eq [int]$backendIdentity.backend_pid -and
      [string]$final.backend_start_utc -eq [string]$backendIdentity.backend_start_utc -and
      [bool]$final.transaction_read_only -and [string]$final.backend_custom_guc -eq $attemptId -and
      [string]$final.observed_application_name -eq 'Supavisor' -and
      -not [bool]$final.server_inspection_required
    )
  }
  $disposition = Get-Issue97FinalReceiptDisposition `
    -Production ($expectedKind -eq 'production_read_only_pg_sleep_proof') `
    -SuccessContract $successContract `
    -FinalClaimsSuccess ([bool]$final.success) `
    -ServerInspectionRequired ([bool]$final.server_inspection_required)
  if ($disposition -eq 'CLIENT_FINISHED_SUCCESS') {
    Write-Issue97State -State 'CLIENT_FINISHED_SUCCESS' -Details @{
      attempt_id = $attemptId
      pid = [int]$pidReceipt.pid
      process_start_utc = [string]$pidReceipt.process_start_utc
      pgappname = [string]$attempt.pgappname
      final_status_path = $expectedFinalPath
    }
  }
  if ($disposition -eq 'SERVER_INSPECTION_REQUIRED') {
    Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details @{
      attempt_id = $attemptId
      pid = [int]$pidReceipt.pid
      pgappname = [string]$attempt.pgappname
      failure_code = [string]$final.failure_code
    }
  }
  if ($disposition -eq 'RECEIPT_INVALID') {
    Write-Issue97State -State 'RECEIPT_INVALID' -Details @{ attempt_id = $attemptId }
  }
  Write-Issue97State -State 'CLIENT_FINISHED_FAILURE' -Details @{
    attempt_id = $attemptId
    pid = [int]$pidReceipt.pid
    pgappname = [string]$attempt.pgappname
    failure_code = [string]$final.failure_code
  }
} catch {
  $details = @{ validation_error = [string]$_.Exception.Message }
  if ($null -ne $attempt) {
    if (-not [string]::IsNullOrWhiteSpace([string]$attempt.attempt_id)) { $details.attempt_id = [string]$attempt.attempt_id }
    if (-not [string]::IsNullOrWhiteSpace([string]$attempt.pgappname)) { $details.pgappname = [string]$attempt.pgappname }
  }
  if ($script:expectedKind -eq 'production_read_only_pg_sleep_proof' -or
      ($null -ne $productionMarker -and (Test-Path -LiteralPath $productionMarker -PathType Leaf)) -or
      ($null -ne $productionClaim -and (Test-Path -LiteralPath $productionClaim -PathType Leaf))) {
    Write-Issue97State -State 'SERVER_INSPECTION_REQUIRED' -Details $details
  }
  Write-Issue97State -State 'RECEIPT_INVALID' -Details $details
}
