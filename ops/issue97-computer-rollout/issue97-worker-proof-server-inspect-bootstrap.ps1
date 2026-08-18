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

if ($args.Count -ne 0) { exit 110 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$bootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-bootstrap.ps1'
$workerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-worker.ps1'
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof-v3'
$authorizationPath = Join-Path $logRoot 'production.authorization.json'
$claimPath = Join-Path $logRoot 'server-inspection.launch.json'
$bootstrapReceiptPath = Join-Path $logRoot 'server-inspection.bootstrap.json'
$bootstrapFinalPath = Join-Path $logRoot 'server-inspection.bootstrap-final.json'
$spawnPath = Join-Path $logRoot 'server-inspection.spawn.json'
$claim = $null
$bootstrapReceipt = $null
$success = $false
$failureCode = 'server_inspection_bootstrap_initialization_failed'
$stage = 'load_protected_inspection_claim'

try {
  $claim = [System.IO.File]::ReadAllText($claimPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([int]$claim.schema_version -ne 3 -or [string]$claim.job_kind -ne 'production_server_inspection' -or
      [string]$claim.manifest_sha256 -ne (Get-Issue97PreambleSha256 -LiteralPath $manifestPath)) {
    throw 'server-inspection launch claim identity mismatch'
  }
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$manifest.private_log_root -ne $logRoot -or
      [string]$claim.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256) {
    throw 'server-inspection launch claim/manifest scope mismatch'
  }
  foreach ($pair in @(
    @($libPath, 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'),
    @($bootstrapPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-bootstrap.ps1'),
    @($workerPath, 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-worker.ps1')
  )) {
    $relative = [string]$pair[1]
    $artifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq $relative })
    $claimHash = $claim.artifact_hashes.PSObject.Properties[$relative]
    if ($artifact.Count -ne 1 -or $null -eq $claimHash -or
        [string]$artifact[0].sha256 -ne ([string]$claimHash.Value).ToUpperInvariant() -or
        (Get-Issue97PreambleSha256 -LiteralPath ([string]$pair[0])) -ne
          ([string]$claimHash.Value).ToUpperInvariant()) {
      throw 'server-inspection claim does not bind bootstrap artifacts'
    }
  }
  . $libPath
  $stage = 'validate_fixed_inspection_scope'
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  Assert-Issue97NoCredentialEnvironment
  Assert-Issue97HistoricalEvidence -Manifest $manifest
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
  Assert-Issue97RuntimeFile -LiteralPath ([string]$manifest.powershell.path) `
    -ExpectedSha256 ([string]$manifest.powershell.sha256)
  if (-not (Test-Issue97SamePath -Left ([string]$claim.authorization_path) -Right $authorizationPath) -or
      [string]$claim.authorization_sha256 -ne (Get-Issue97Sha256 -LiteralPath $authorizationPath)) {
    throw 'server-inspection claim authorization binding mismatch'
  }
  $authorization = Read-Issue97Json -LiteralPath $authorizationPath
  if ([int]$authorization.schema_version -ne 3 -or
      [string]$authorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$authorization.generation_id -ne [string]$manifest.generation_id -or
      [string]$authorization.authorized_repo_sha -ne [string]$claim.authorized_repo_sha -or
      [string]$authorization.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
      [string]$authorization.manifest_sha256 -ne [string]$claim.manifest_sha256 -or
      -not [bool]$authorization.production_read_only_proof_authorized -or
      [bool]$authorization.mapping_rehearsal_authorized -or
      [bool]$authorization.automatic_retry_authorized) {
    throw 'server-inspection exact-SHA authorization mismatch'
  }
  foreach ($pair in @(
    @([string]$claim.bootstrap_script, $bootstrapPath),
    @([string]$claim.bootstrap_receipt_path, $bootstrapReceiptPath),
    @([string]$claim.bootstrap_final_path, $bootstrapFinalPath),
    @([string]$claim.worker_script, $workerPath),
    @([string]$claim.spawn_receipt_path, $spawnPath)
  )) {
    if (-not (Test-Issue97SamePath -Left ([string]$pair[0]) -Right ([string]$pair[1]))) {
      throw 'server-inspection claim contains a noncanonical bootstrap path'
    }
  }
  $selfIdentity = Get-Issue97ProcessIdentity -ProcessId $PID
  if (-not (Test-Issue97WorkerProcessIdentity -Actual $selfIdentity -ExpectedPid $PID `
      -ExpectedStartUtc ([string]$selfIdentity.process_start_utc) `
      -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $bootstrapPath)) {
    throw 'server-inspection bootstrap process identity mismatch'
  }
  $bootstrapReceipt = [ordered]@{
    schema_version = 3
    worker_proof_version = [string]$manifest.worker_proof_version
    generation_id = [string]$manifest.generation_id
    job_kind = [string]$claim.job_kind
    attempt_id = [string]$claim.attempt_id
    pid = $PID
    process_start_utc = [string]$selfIdentity.process_start_utc
    executable_path = [string]$manifest.powershell.path
    bootstrap_script = $bootstrapPath
    created_utc = [datetime]::UtcNow.ToString('o')
  }
  Write-Issue97JsonAtomicNoClobber -LiteralPath $bootstrapReceiptPath -Value $bootstrapReceipt
  $stage = 'spawn_detached_inspection_worker'
  $commandLine = '"' + [string]$manifest.powershell.path +
    '" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    $workerPath + '"'
  $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }
  if ([int]$created.ReturnValue -ne 0 -or [int]$created.ProcessId -le 0) {
    throw 'WMI failed to create the fixed server-inspection worker'
  }
  $workerProcess = Get-Process -Id ([int]$created.ProcessId) -ErrorAction Stop
  Write-Issue97JsonAtomicNoClobber -LiteralPath $spawnPath -Value ([ordered]@{
    schema_version = 3
    worker_proof_version = [string]$manifest.worker_proof_version
    generation_id = [string]$manifest.generation_id
    job_kind = [string]$claim.job_kind
    attempt_id = [string]$claim.attempt_id
    pid = [int]$created.ProcessId
    process_start_utc = $workerProcess.StartTime.ToUniversalTime().ToString('o')
    executable_path = [string]$manifest.powershell.path
    worker_script = $workerPath
    created_utc = [datetime]::UtcNow.ToString('o')
  })
  $success = $true
  $failureCode = $null
} catch {
  $failureCode = "server_inspection_bootstrap_fail_stop_$stage"
} finally {
  if ($null -ne $claim) {
    $finalReceipt = [ordered]@{
      schema_version = 3
      worker_proof_version = [string]$claim.worker_proof_version
      generation_id = [string]$manifest.generation_id
      job_kind = [string]$claim.job_kind
      attempt_id = [string]$claim.attempt_id
      pid = $PID
      process_start_utc = if ($null -ne $bootstrapReceipt) { [string]$bootstrapReceipt.process_start_utc } else { $null }
      end_utc = [datetime]::UtcNow.ToString('o')
      success = $success
      worker_spawned = (Test-Path -LiteralPath $spawnPath -PathType Leaf)
      server_inspection_required = (-not $success)
      failure_code = $failureCode
      failure_stage = if ($success) { $null } else { $stage }
    }
    try { Write-Issue97JsonAtomicNoClobber -LiteralPath $bootstrapFinalPath -Value $finalReceipt } catch { exit 112 }
  }
  if ($success) { exit 0 }
  exit 111
}
