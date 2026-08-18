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

function Write-Issue97InspectionState {
  param(
    [Parameter(Mandatory = $true)][ValidateSet(
      'NOT_STARTED', 'RUNNING', 'CLIENT_FINISHED_SUCCESS', 'RECEIPT_INVALID',
      'SERVER_INSPECTION_REQUIRED'
    )][string]$State,
    [hashtable]$Details = @{}
  )
  Write-Output "STATE=$State"
  $safe = [ordered]@{ state = $State }
  foreach ($key in $Details.Keys) { $safe[$key] = $Details[$key] }
  Write-Output ($safe | ConvertTo-Json -Compress -Depth 8)
  exit 0
}

if ($args.Count -ne 0) {
  throw 'issue97-worker-proof-server-inspect-status.ps1 accepts zero arguments'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$bootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-bootstrap.ps1'
$workerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-worker.ps1'

try {
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $logRoot = [string]$manifest.private_log_root
  if (-not [System.IO.Path]::IsPathRooted($logRoot)) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  $claimPath = Join-Path $logRoot 'server-inspection.launch.json'
  $bootstrapReceiptPath = Join-Path $logRoot 'server-inspection.bootstrap.json'
  $bootstrapFinalPath = Join-Path $logRoot 'server-inspection.bootstrap-final.json'
  $spawnPath = Join-Path $logRoot 'server-inspection.spawn.json'
  $pidPath = Join-Path $logRoot 'server-inspection.pid.json'
  $finalPath = Join-Path $logRoot 'server-inspection.final.json'
  if (-not (Test-Path -LiteralPath $claimPath -PathType Leaf)) {
    Write-Issue97InspectionState -State 'NOT_STARTED'
  }
  foreach ($pair in @(
    @($libPath, 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'),
    @($PSCommandPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-status.ps1')
  )) {
    $artifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq [string]$pair[1] })
    if ($artifact.Count -ne 1 -or (Get-Issue97PreambleSha256 -LiteralPath ([string]$pair[0])) -ne
        ([string]$artifact[0].sha256).ToUpperInvariant()) {
      Write-Issue97InspectionState -State 'RECEIPT_INVALID'
    }
  }
  . $libPath
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
  $claim = Read-Issue97Json -LiteralPath $claimPath
  $expectedPaths = @{
    bootstrap_script = $bootstrapPath
    bootstrap_receipt_path = $bootstrapReceiptPath
    bootstrap_final_path = $bootstrapFinalPath
    worker_script = $workerPath
    status_script = $PSCommandPath
    spawn_receipt_path = $spawnPath
    pid_receipt_path = $pidPath
    stdout_path = (Join-Path $logRoot 'server-inspection.stdout.log')
    stderr_path = (Join-Path $logRoot 'server-inspection.stderr.log')
    worker_host_stdout_path = (Join-Path $logRoot 'server-inspection.worker.stdout.log')
    worker_host_stderr_path = (Join-Path $logRoot 'server-inspection.worker.stderr.log')
    final_status_path = $finalPath
  }
  if ([int]$claim.schema_version -ne 2 -or [string]$claim.job_kind -ne 'production_server_inspection' -or
      [string]$claim.attempt_id -notmatch '^issue97-inspect-[0-9]{8}T[0-9]{9}Z$' -or
      [string]$claim.proof_attempt_id -notmatch '^issue97-wp-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$' -or
      [string]$claim.target_pgappname -notmatch '^brinesearch-i97-wp-[0-9]{14}-[0-9a-f]{8}$' -or
      [string]$claim.authorized_repo_sha -notmatch '^[0-9a-f]{40}$' -or
      [string]$claim.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
      [string]$claim.manifest_sha256 -ne (Get-Issue97Sha256 -LiteralPath $manifestPath)) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  foreach ($key in $expectedPaths.Keys) {
    if (-not (Test-Issue97SamePath -Left ([string]$claim.$key) -Right ([string]$expectedPaths[$key]))) {
      Write-Issue97InspectionState -State 'RECEIPT_INVALID'
    }
  }
  $authorizationPath = Join-Path $logRoot 'authorization.json'
  if (-not (Test-Issue97SamePath -Left ([string]$claim.authorization_path) -Right $authorizationPath) -or
      [string]$claim.authorization_sha256 -ne (Get-Issue97Sha256 -LiteralPath $authorizationPath)) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  $authorization = Read-Issue97Json -LiteralPath $authorizationPath
  if ([string]$authorization.authorized_repo_sha -ne [string]$claim.authorized_repo_sha -or
      [string]$authorization.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
      [string]$authorization.manifest_sha256 -ne [string]$claim.manifest_sha256 -or
      -not [bool]$authorization.production_read_only_proof_authorized -or
      [bool]$authorization.mapping_rehearsal_authorized) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  $proofAttemptPath = Join-Path $logRoot 'production.attempt.json'
  $proofClaimPath = Join-Path $logRoot 'production.launch.json'
  $expectedProofReceipt = if (Test-Path -LiteralPath $proofAttemptPath -PathType Leaf) {
    $proofAttemptPath
  } else { $proofClaimPath }
  if (-not (Test-Issue97SamePath -Left ([string]$claim.proof_receipt_path) -Right $expectedProofReceipt)) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  if (-not (Test-Path -LiteralPath $spawnPath -PathType Leaf)) {
    if (Test-Path -LiteralPath $bootstrapReceiptPath -PathType Leaf) {
      $bootstrapReceipt = Read-Issue97Json -LiteralPath $bootstrapReceiptPath
      if ([string]$bootstrapReceipt.attempt_id -eq [string]$claim.attempt_id -and
          [int]$bootstrapReceipt.pid -gt 0 -and
          (Test-Issue97SamePath -Left ([string]$bootstrapReceipt.bootstrap_script) -Right $bootstrapPath)) {
        $bootstrapProcess = Get-Process -Id ([int]$bootstrapReceipt.pid) -ErrorAction SilentlyContinue
        if ($null -ne $bootstrapProcess) {
          try {
            $bootstrapIdentity = Get-Issue97ProcessIdentity -ProcessId ([int]$bootstrapReceipt.pid)
            $bootstrapMatches = Test-Issue97WorkerProcessIdentity -Actual $bootstrapIdentity `
              -ExpectedPid ([int]$bootstrapReceipt.pid) `
              -ExpectedStartUtc ([string]$bootstrapReceipt.process_start_utc) `
              -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $bootstrapPath
          } catch { $bootstrapMatches = $false }
          if ($bootstrapMatches) {
            Write-Issue97InspectionState -State 'RUNNING' -Details @{
              attempt_id = [string]$claim.attempt_id
              pid = [int]$bootstrapReceipt.pid
              process_start_utc = [string]$bootstrapReceipt.process_start_utc
              target_pgappname = [string]$claim.target_pgappname
              bootstrap_preflight = $true
            }
          }
        }
      }
    }
    if (Test-Path -LiteralPath $bootstrapFinalPath -PathType Leaf) {
      $bootstrapFinal = Read-Issue97Json -LiteralPath $bootstrapFinalPath
      if (-not [bool]$bootstrapFinal.success) {
        Write-Issue97InspectionState -State 'SERVER_INSPECTION_REQUIRED' -Details @{
          attempt_id = [string]$claim.attempt_id
          target_pgappname = [string]$claim.target_pgappname
          failure_code = [string]$bootstrapFinal.failure_code
        }
      }
    }
    $claimAge = [datetime]::UtcNow - [datetime]::Parse([string]$claim.utc_start).ToUniversalTime()
    if ($claimAge.TotalSeconds -le 10) {
      Write-Issue97InspectionState -State 'RUNNING' -Details @{
        attempt_id = [string]$claim.attempt_id
        target_pgappname = [string]$claim.target_pgappname
        spawn_receipt_pending = $true
      }
    }
    Write-Issue97InspectionState -State 'SERVER_INSPECTION_REQUIRED' -Details @{
      attempt_id = [string]$claim.attempt_id
      target_pgappname = [string]$claim.target_pgappname
    }
  }
  $spawn = Read-Issue97Json -LiteralPath $spawnPath
  if ([int]$spawn.schema_version -ne 2 -or [string]$spawn.job_kind -ne [string]$claim.job_kind -or
      [string]$spawn.attempt_id -ne [string]$claim.attempt_id -or [int]$spawn.pid -le 0 -or
      -not (Test-Issue97SamePath -Left ([string]$spawn.executable_path) -Right ([string]$manifest.powershell.path)) -or
      -not (Test-Issue97SamePath -Left ([string]$spawn.worker_script) -Right $workerPath)) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  $process = Get-Process -Id ([int]$spawn.pid) -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    try {
      $identity = Get-Issue97ProcessIdentity -ProcessId ([int]$spawn.pid)
      $identityMatches = Test-Issue97WorkerProcessIdentity -Actual $identity -ExpectedPid ([int]$spawn.pid) `
        -ExpectedStartUtc ([string]$spawn.process_start_utc) `
        -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $workerPath
    } catch { $identityMatches = $false }
    if (-not $identityMatches) {
      Write-Issue97InspectionState -State 'SERVER_INSPECTION_REQUIRED' -Details @{
        attempt_id = [string]$claim.attempt_id
        target_pgappname = [string]$claim.target_pgappname
      }
    }
    Write-Issue97InspectionState -State 'RUNNING' -Details @{
      attempt_id = [string]$claim.attempt_id
      pid = [int]$spawn.pid
      process_start_utc = [string]$spawn.process_start_utc
      target_pgappname = [string]$claim.target_pgappname
    }
  }
  if (-not (Test-Path -LiteralPath $pidPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $finalPath -PathType Leaf)) {
    Write-Issue97InspectionState -State 'SERVER_INSPECTION_REQUIRED' -Details @{
      attempt_id = [string]$claim.attempt_id
      target_pgappname = [string]$claim.target_pgappname
    }
  }
  $pidReceipt = Read-Issue97Json -LiteralPath $pidPath
  $final = Read-Issue97Json -LiteralPath $finalPath
  if ([string]$pidReceipt.attempt_id -ne [string]$claim.attempt_id -or
      [int]$pidReceipt.pid -ne [int]$spawn.pid -or
      [string]$pidReceipt.process_start_utc -ne [string]$spawn.process_start_utc -or
      [string]$pidReceipt.target_pgappname -ne [string]$claim.target_pgappname -or
      [string]$final.attempt_id -ne [string]$claim.attempt_id -or
      [string]$final.proof_attempt_id -ne [string]$claim.proof_attempt_id -or
      [int]$final.pid -ne [int]$pidReceipt.pid -or
      [string]$final.process_start_utc -ne [string]$pidReceipt.process_start_utc -or
      [string]$final.repo_sha -ne [string]$claim.authorized_repo_sha -or
      [string]$final.target_pgappname -ne [string]$claim.target_pgappname -or
      [string]$final.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  $stdoutPath = [string]$expectedPaths.stdout_path
  $stderrPath = [string]$expectedPaths.stderr_path
  if (-not (Test-Path -LiteralPath $stdoutPath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $stderrPath -PathType Leaf) -or
      [string]$final.stdout_sha256 -ne (Get-Issue97Sha256 -LiteralPath $stdoutPath) -or
      [string]$final.stderr_sha256 -ne (Get-Issue97Sha256 -LiteralPath $stderrPath)) {
    Write-Issue97InspectionState -State 'RECEIPT_INVALID'
  }
  $stdout = [System.IO.File]::ReadAllText($stdoutPath)
  $stderr = [System.IO.File]::ReadAllText($stderrPath)
  $sqlArtifact = @($manifest.artifacts | Where-Object {
    [string]$_.path -eq 'ops/issue97-computer-rollout/sql/36-worker-proof-server-inspection.sql'
  })
  $success = [bool]$final.success -and [bool]$final.client_started -and
    [bool]$final.client_confirmed_finished -and [int]$final.exit_code -eq 0 -and
    [bool]$final.final_marker_present -and $stdout.Contains('ISSUE97_WORKER_PROOF_SERVER_INSPECTION_PASS') -and
    [bool]$final.rollback_present -and
    ([regex]::Matches($stdout, '(?im)^\s*ROLLBACK\s*$')).Count -eq 1 -and
    [int]$final.commit_count -eq 0 -and
    ([regex]::Matches($stdout + "`n" + $stderr, '(?im)^\s*COMMIT\s*$')).Count -eq 0 -and
    [string]$final.executed_sql_sha256 -eq ([string]$sqlArtifact[0].sha256).ToUpperInvariant() -and
    [string]$final.psql_sha256 -eq [string]$manifest.psql.sha256 -and
    -not [bool]$final.server_inspection_required
  if ($success) {
    Write-Issue97InspectionState -State 'CLIENT_FINISHED_SUCCESS' -Details @{
      attempt_id = [string]$claim.attempt_id
      proof_attempt_id = [string]$claim.proof_attempt_id
      target_pgappname = [string]$claim.target_pgappname
      final_status_path = $finalPath
    }
  }
  Write-Issue97InspectionState -State 'SERVER_INSPECTION_REQUIRED' -Details @{
    attempt_id = [string]$claim.attempt_id
    target_pgappname = [string]$claim.target_pgappname
    failure_code = [string]$final.failure_code
  }
} catch {
  Write-Issue97InspectionState -State 'SERVER_INSPECTION_REQUIRED'
}
