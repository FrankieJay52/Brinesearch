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
if ($args.Count -ne 0) { exit 60 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$bootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-local-bootstrap.ps1'
$workerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-local-worker.ps1'
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof-v3'
$authorizationPath = Join-Path $logRoot 'local.authorization.json'
$claimPath = Join-Path $logRoot 'local.launch.json'
$bootstrapReceiptPath = Join-Path $logRoot 'local.bootstrap.json'
$bootstrapFinalPath = Join-Path $logRoot 'local.bootstrap-final.json'
$attemptPath = Join-Path $logRoot 'local.attempt.json'
$spawnPath = Join-Path $logRoot 'local.spawn.json'
$pidPath = Join-Path $logRoot 'local.pid.json'
$clientPath = Join-Path $logRoot 'local.client.json'
$clientFinalPath = Join-Path $logRoot 'local.client-final.json'
$finalPath = Join-Path $logRoot 'local.final.json'
$stage = 'load_protected_local_claim'
$claim = $null
$bootstrapReceipt = $null
$success = $false
$failureCode = 'local_bootstrap_initialization_failed'

try {
  $claim = [System.IO.File]::ReadAllText($claimPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([int]$claim.schema_version -ne 3 -or [string]$claim.job_kind -ne 'local_detached_process_proof' -or
      [string]$claim.attempt_id -notmatch '^issue97-local-[0-9]{8}T[0-9]{9}Z-[0-9a-f]{8}$' -or
      [string]$claim.pgappname -notmatch '^local-only-no-database-[0-9a-f]{8}$') {
    throw 'local launch claim identity mismatch'
  }
  if ([string]$claim.manifest_sha256 -ne
      (Get-Issue97PreambleSha256 -LiteralPath $manifestPath)) {
    throw 'local launch claim does not bind the manifest bytes'
  }
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$manifest.private_log_root -ne $logRoot -or
      [string]$claim.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256) {
    throw 'local launch claim/manifest scope mismatch'
  }
  if (-not [string]::Equals([System.IO.Path]::GetFullPath([string]$claim.authorization_path),
        [System.IO.Path]::GetFullPath($authorizationPath), [System.StringComparison]::OrdinalIgnoreCase) -or
      [string]$claim.authorization_sha256 -ne (Get-Issue97PreambleSha256 -LiteralPath $authorizationPath)) {
    throw 'local launch claim does not bind the exact-SHA authorization receipt'
  }
  $authorization = [System.IO.File]::ReadAllText($authorizationPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([int]$authorization.schema_version -ne 3 -or
      [string]$authorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$authorization.generation_id -ne [string]$manifest.generation_id -or
      [string]$authorization.authorized_repo_sha -ne [string]$claim.authorized_repo_sha -or
      [string]$authorization.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
      [string]$authorization.manifest_sha256 -ne [string]$claim.manifest_sha256 -or
      -not [bool]$authorization.local_proof_authorized -or
      [bool]$authorization.production_read_only_proof_authorized -or
      [bool]$authorization.mapping_rehearsal_authorized -or
      [bool]$authorization.automatic_retry_authorized) {
    throw 'local exact-SHA authorization receipt is invalid'
  }
  foreach ($pair in @(
    @($libPath, 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'),
    @($bootstrapPath, 'ops/issue97-computer-rollout/issue97-worker-proof-local-bootstrap.ps1'),
    @($workerPath, 'ops/issue97-computer-rollout/issue97-worker-proof-local-worker.ps1')
  )) {
    $relative = [string]$pair[1]
    $artifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq $relative })
    $claimHash = $claim.artifact_hashes.PSObject.Properties[$relative]
    if ($artifact.Count -ne 1 -or $null -eq $claimHash -or
        [string]$artifact[0].sha256 -ne ([string]$claimHash.Value).ToUpperInvariant() -or
        (Get-Issue97PreambleSha256 -LiteralPath ([string]$pair[0])) -ne
          ([string]$claimHash.Value).ToUpperInvariant()) {
      throw 'local launch claim does not bind bootstrap artifacts'
    }
  }
  . $libPath
  $stage = 'validate_fixed_local_scope'
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  Assert-Issue97NoCredentialEnvironment
  Assert-Issue97HistoricalEvidence -Manifest $manifest
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
  Assert-Issue97RuntimeFile -LiteralPath ([string]$manifest.powershell.path) `
    -ExpectedSha256 ([string]$manifest.powershell.sha256)
  $expectedPaths = @{
    authorization_path = $authorizationPath
    bootstrap_receipt_path = $bootstrapReceiptPath
    bootstrap_final_path = $bootstrapFinalPath
    attempt_path = $attemptPath
    worker_spawn_receipt_path = $spawnPath
    worker_pid_receipt_path = $pidPath
    client_pid_receipt_path = $clientPath
    client_final_receipt_path = $clientFinalPath
    final_status_path = $finalPath
    bootstrap_script = $bootstrapPath
    worker_script = $workerPath
    local_child_script = (Join-Path $PSScriptRoot 'issue97-worker-proof-local-child.ps1')
  }
  foreach ($key in $expectedPaths.Keys) {
    if (-not (Test-Issue97SamePath -Left ([string]$claim.$key) -Right ([string]$expectedPaths[$key]))) {
      throw 'local launch claim contains a noncanonical fixed path'
    }
  }
  foreach ($path in @($bootstrapReceiptPath, $bootstrapFinalPath, $attemptPath, $spawnPath, $pidPath, $clientPath, $clientFinalPath, $finalPath,
      [string]$claim.stdout_path, [string]$claim.stderr_path, [string]$claim.worker_host_stdout_path,
      [string]$claim.worker_host_stderr_path)) {
    Assert-Issue97PathUnderRoot -Candidate $path -AllowedRoot $logRoot
  }
  if (-not (Test-Issue97SamePath -Left ([string]$claim.repo_root) -Right $repoRoot) -or
      -not (Test-Issue97SamePath -Left ([string]$claim.powershell_path) -Right ([string]$manifest.powershell.path)) -or
      [string]$claim.powershell_sha256 -ne [string]$manifest.powershell.sha256) {
    throw 'local launch claim runtime mismatch'
  }
  $selfIdentity = Get-Issue97ProcessIdentity -ProcessId $PID
  if (-not (Test-Issue97WorkerProcessIdentity -Actual $selfIdentity -ExpectedPid $PID `
      -ExpectedStartUtc ([string]$selfIdentity.process_start_utc) `
      -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $bootstrapPath)) {
    throw 'local bootstrap process identity mismatch'
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

  $stage = 'validate_local_repository'
  Assert-Issue97GitRuntime -Manifest $manifest
  $repoSha = Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch
  if ($repoSha -ne [string]$authorization.authorized_repo_sha -or
      $repoSha -ne [string]$claim.authorized_repo_sha) {
    throw 'fetched repository head is not the independently authorized exact SHA'
  }
  $artifactHashes = Get-Issue97ArtifactHashMap -Manifest $manifest
  foreach ($key in $artifactHashes.Keys) {
    if ([string]$claim.artifact_hashes.$key -ne [string]$artifactHashes[$key]) {
      throw 'local launch claim artifact hash map mismatch'
    }
  }
  $attempt = [ordered]@{
    schema_version = 3
    worker_proof_version = [string]$manifest.worker_proof_version
    generation_id = [string]$manifest.generation_id
    job_kind = [string]$claim.job_kind
    attempt_id = [string]$claim.attempt_id
    repo_sha = $repoSha
    authorization_path = $authorizationPath
    authorization_sha256 = [string]$claim.authorization_sha256
    branch = [string]$manifest.expected_branch
    utc_start = [string]$claim.utc_start
    pgappname = [string]$claim.pgappname
    worker_spawn_receipt_path = $spawnPath
    worker_pid_receipt_path = $pidPath
    client_pid_receipt_path = $clientPath
    client_final_receipt_path = $clientFinalPath
    stdout_path = [string]$claim.stdout_path
    stderr_path = [string]$claim.stderr_path
    worker_host_stdout_path = [string]$claim.worker_host_stdout_path
    worker_host_stderr_path = [string]$claim.worker_host_stderr_path
    final_status_path = $finalPath
    artifact_set_sha256 = [string]$manifest.artifact_set_sha256
    artifact_hashes = $artifactHashes
    manifest_sha256 = Get-Issue97Sha256 -LiteralPath $manifestPath
    powershell_path = [string]$manifest.powershell.path
    powershell_sha256 = [string]$manifest.powershell.sha256
    bootstrap_script = $bootstrapPath
    worker_script = $workerPath
    local_child_script = (Join-Path $PSScriptRoot 'issue97-worker-proof-local-child.ps1')
  }
  Write-Issue97JsonAtomicNoClobber -LiteralPath $attemptPath -Value $attempt
  $stage = 'spawn_detached_local_worker'
  $commandLine = '"' + [string]$manifest.powershell.path +
    '" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    $workerPath + '"'
  $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }
  if ([int]$created.ReturnValue -ne 0 -or [int]$created.ProcessId -le 0) {
    throw 'WMI failed to create the fixed local worker'
  }
  $workerProcess = Get-Process -Id ([int]$created.ProcessId) -ErrorAction Stop
  $spawnReceipt = [ordered]@{
    schema_version = 3
    worker_proof_version = [string]$manifest.worker_proof_version
    job_kind = [string]$claim.job_kind
    attempt_id = [string]$claim.attempt_id
    repo_sha = $repoSha
    worker_pid = [int]$created.ProcessId
    process_start_utc = $workerProcess.StartTime.ToUniversalTime().ToString('o')
    created_utc = [datetime]::UtcNow.ToString('o')
  }
  Write-Issue97JsonAtomicNoClobber -LiteralPath $spawnPath -Value $spawnReceipt
  $success = $true
  $failureCode = $null
} catch {
  $failureCode = "local_bootstrap_fail_stop_$stage"
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
      server_inspection_required = $false
      failure_code = $failureCode
      failure_stage = if ($success) { $null } else { $stage }
    }
    try { Write-Issue97JsonAtomicNoClobber -LiteralPath $bootstrapFinalPath -Value $finalReceipt } catch { exit 62 }
  }
  if ($success) { exit 0 }
  exit 61
}
