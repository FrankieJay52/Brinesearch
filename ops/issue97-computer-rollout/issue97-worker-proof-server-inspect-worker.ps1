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

if ($args.Count -ne 0) { exit 100 }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$bootstrapPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-bootstrap.ps1'
$workerPath = Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-worker.ps1'
$logRoot = 'C:\Users\frank\.issue97-runs\issue97-worker-proof-v3'
$claimPath = Join-Path $logRoot 'server-inspection.launch.json'
$spawnPath = Join-Path $logRoot 'server-inspection.spawn.json'
$pidPath = Join-Path $logRoot 'server-inspection.pid.json'
$finalPath = Join-Path $logRoot 'server-inspection.final.json'
$clientPath = Join-Path $logRoot 'server-inspection.client.json'
$clientFinalPath = Join-Path $logRoot 'server-inspection.client-final.json'
$executionSqlPath = Join-Path $logRoot 'server-inspection.reviewed.sql'
$claim = $null
$manifest = $null
$spawnReceipt = $null
$libLoaded = $false
$clientStarted = $false
$clientFinished = $false
$exitCode = 101
$success = $false
$failureCode = 'server_inspection_worker_initialization_failed'
$startUtc = [datetime]::UtcNow.ToString('o')

try {
  $claim = [System.IO.File]::ReadAllText($claimPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  if ([string]$claim.manifest_sha256 -ne (Get-Issue97PreambleSha256 -LiteralPath $manifestPath)) {
    throw 'server-inspection claim does not bind the manifest bytes'
  }
  $manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $libRelative = 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
  $workerRelative = 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-worker.ps1'
  $libArtifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq $libRelative })
  $workerArtifact = @($manifest.artifacts | Where-Object { [string]$_.path -eq $workerRelative })
  if ($libArtifact.Count -ne 1 -or $workerArtifact.Count -ne 1 -or
      (Get-Issue97PreambleSha256 -LiteralPath $libPath) -ne ([string]$libArtifact[0].sha256).ToUpperInvariant() -or
      (Get-Issue97PreambleSha256 -LiteralPath $workerPath) -ne ([string]$workerArtifact[0].sha256).ToUpperInvariant()) {
    throw 'server-inspection worker/library bytes are not reviewed'
  }
  . $libPath
  $libLoaded = $true
  Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
  Assert-Issue97NoCredentialEnvironment
  Assert-Issue97HistoricalEvidence -Manifest $manifest
  $env:PGSERVICE = [string]$manifest.expected_service
  Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
  if ([int]$claim.schema_version -ne 3 -or [string]$claim.job_kind -ne 'production_server_inspection' -or
      [string]$claim.generation_id -ne [string]$manifest.generation_id -or
      [string]$claim.target_pgappname -notmatch '^brinesearch-i97-wp-[0-9]{14}-[0-9a-f]{8}$' -or
      [string]$claim.inspector_pgappname -ne 'brinesearch-i97-wp-postcheck-v3' -or
      [string]$claim.authorized_repo_sha -notmatch '^[0-9a-f]{40}$' -or
      [string]$claim.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256) {
    throw 'server-inspection claim identity mismatch'
  }
  $authorizationPath = Join-Path $logRoot 'production.authorization.json'
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
  $expectedPaths = @{
    bootstrap_script = $bootstrapPath
    bootstrap_receipt_path = (Join-Path $logRoot 'server-inspection.bootstrap.json')
    bootstrap_final_path = (Join-Path $logRoot 'server-inspection.bootstrap-final.json')
    worker_script = $workerPath
    status_script = (Join-Path $PSScriptRoot 'issue97-worker-proof-server-inspect-status.ps1')
    spawn_receipt_path = $spawnPath
    pid_receipt_path = $pidPath
    client_pid_receipt_path = $clientPath
    client_final_receipt_path = $clientFinalPath
    stdout_path = (Join-Path $logRoot 'server-inspection.stdout.log')
    stderr_path = (Join-Path $logRoot 'server-inspection.stderr.log')
    worker_host_stdout_path = (Join-Path $logRoot 'server-inspection.worker.stdout.log')
    worker_host_stderr_path = (Join-Path $logRoot 'server-inspection.worker.stderr.log')
    final_status_path = $finalPath
  }
  foreach ($key in $expectedPaths.Keys) {
    if (-not (Test-Issue97SamePath -Left ([string]$claim.$key) -Right ([string]$expectedPaths[$key]))) {
      throw 'server-inspection claim contains a noncanonical path'
    }
  }
  $bootstrapDeadline = [datetime]::UtcNow.AddSeconds(10)
  while (-not (Test-Path -LiteralPath ([string]$claim.bootstrap_receipt_path) -PathType Leaf) -or
      -not (Test-Path -LiteralPath ([string]$claim.bootstrap_final_path) -PathType Leaf) -or
      -not (Test-Path -LiteralPath $spawnPath -PathType Leaf)) {
    if ([datetime]::UtcNow -ge $bootstrapDeadline) {
      throw 'server-inspection bootstrap lifecycle receipts did not arrive'
    }
    Start-Sleep -Milliseconds 50
  }
  $inspectionBootstrapReceipt = Read-Issue97Json -LiteralPath ([string]$claim.bootstrap_receipt_path)
  $inspectionBootstrapFinal = Read-Issue97Json -LiteralPath ([string]$claim.bootstrap_final_path)
  if ([string]$inspectionBootstrapReceipt.attempt_id -ne [string]$claim.attempt_id -or
      [int]$inspectionBootstrapReceipt.pid -le 0 -or
      [string]$inspectionBootstrapFinal.attempt_id -ne [string]$claim.attempt_id -or
      [int]$inspectionBootstrapFinal.pid -ne [int]$inspectionBootstrapReceipt.pid -or
      [string]$inspectionBootstrapFinal.process_start_utc -ne [string]$inspectionBootstrapReceipt.process_start_utc -or
      -not [bool]$inspectionBootstrapFinal.success -or
      -not [bool]$inspectionBootstrapFinal.worker_spawned -or
      -not (Test-Issue97SamePath -Left ([string]$inspectionBootstrapReceipt.bootstrap_script) -Right $bootstrapPath)) {
    throw 'server-inspection bootstrap lifecycle receipts disagree'
  }
  while ($null -ne (Get-Process -Id ([int]$inspectionBootstrapReceipt.pid) -ErrorAction SilentlyContinue) -and
      [datetime]::UtcNow -lt $bootstrapDeadline) {
    Start-Sleep -Milliseconds 50
  }
  if ($null -ne (Get-Process -Id ([int]$inspectionBootstrapReceipt.pid) -ErrorAction SilentlyContinue)) {
    throw 'server-inspection bootstrap PID remains active or has become ambiguous'
  }
  $spawnReceipt = Read-Issue97Json -LiteralPath $spawnPath
  if ([string]$spawnReceipt.attempt_id -ne [string]$claim.attempt_id -or [int]$spawnReceipt.pid -ne $PID -or
      -not (Test-Issue97SamePath -Left ([string]$spawnReceipt.worker_script) -Right $workerPath)) {
    throw 'server-inspection spawn receipt mismatch'
  }
  $proofAttemptPath = Join-Path $logRoot 'production.attempt.json'
  $proofClaimPath = Join-Path $logRoot 'production.launch.json'
  $expectedProofReceipt = if (Test-Path -LiteralPath $proofAttemptPath -PathType Leaf) { $proofAttemptPath } else { $proofClaimPath }
  if (-not (Test-Issue97SamePath -Left ([string]$claim.proof_receipt_path) -Right $expectedProofReceipt)) {
    throw 'server-inspection proof receipt path mismatch'
  }
  $proofReceipt = Read-Issue97Json -LiteralPath $expectedProofReceipt
  $proofRepoShaProperty = $proofReceipt.PSObject.Properties['repo_sha']
  if ($null -eq $proofRepoShaProperty) {
    $proofRepoShaProperty = $proofReceipt.PSObject.Properties['authorized_repo_sha']
  }
  if ([string]$proofReceipt.job_kind -ne 'production_read_only_pg_sleep_proof' -or
      [string]$proofReceipt.attempt_id -ne [string]$claim.proof_attempt_id -or
      [string]$proofReceipt.pgappname -ne [string]$claim.target_pgappname -or
      [string]$proofReceipt.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
      $null -eq $proofRepoShaProperty -or
      [string]$proofRepoShaProperty.Value -ne [string]$claim.authorized_repo_sha) {
    throw 'server-inspection proof receipt binding mismatch'
  }
  # The proof launcher publishes its claim immediately before starting the
  # detached bootstrap.  Require the bootstrap's exact terminal receipt so an
  # inspection cannot pass while that bootstrap could still start a worker.
  $proofBootstrapReceiptPath = Join-Path $logRoot 'production.bootstrap.json'
  $proofBootstrapFinalPath = Join-Path $logRoot 'production.bootstrap-final.json'
  if (-not (Test-Path -LiteralPath $proofBootstrapFinalPath -PathType Leaf)) {
    throw 'production proof bootstrap has no terminal receipt'
  }
  $proofBootstrapFinal = Read-Issue97Json -LiteralPath $proofBootstrapFinalPath
  if ([int]$proofBootstrapFinal.schema_version -ne 3 -or
      [string]$proofBootstrapFinal.worker_proof_version -ne [string]$manifest.worker_proof_version -or
      [string]$proofBootstrapFinal.job_kind -ne 'production_read_only_pg_sleep_proof' -or
      [string]$proofBootstrapFinal.attempt_id -ne [string]$claim.proof_attempt_id -or
      [int]$proofBootstrapFinal.pid -le 0 -or
      [string]::IsNullOrWhiteSpace([string]$proofBootstrapFinal.end_utc)) {
    throw 'production proof bootstrap terminal receipt identity mismatch'
  }
  $null = [datetime]::Parse([string]$proofBootstrapFinal.end_utc).ToUniversalTime()
  if ([bool]$proofBootstrapFinal.success) {
    if (-not [bool]$proofBootstrapFinal.worker_spawned -or
        [bool]$proofBootstrapFinal.server_inspection_required -or
        -not (Test-Path -LiteralPath (Join-Path $logRoot 'production.attempt.json') -PathType Leaf) -or
        -not (Test-Path -LiteralPath (Join-Path $logRoot 'production.spawn.json') -PathType Leaf)) {
      throw 'successful production bootstrap terminal receipt is incomplete'
    }
  } elseif (-not [bool]$proofBootstrapFinal.server_inspection_required -or
      [string]::IsNullOrWhiteSpace([string]$proofBootstrapFinal.failure_code)) {
    throw 'failed production bootstrap terminal receipt is not fail-closed'
  }
  if (Test-Path -LiteralPath $proofBootstrapReceiptPath -PathType Leaf) {
    $proofBootstrapReceipt = Read-Issue97Json -LiteralPath $proofBootstrapReceiptPath
    if ([int]$proofBootstrapReceipt.schema_version -ne 3 -or
        [string]$proofBootstrapReceipt.worker_proof_version -ne [string]$manifest.worker_proof_version -or
        [string]$proofBootstrapReceipt.job_kind -ne 'production_read_only_pg_sleep_proof' -or
        [string]$proofBootstrapReceipt.attempt_id -ne [string]$claim.proof_attempt_id -or
        [int]$proofBootstrapReceipt.pid -ne [int]$proofBootstrapFinal.pid -or
        [string]$proofBootstrapReceipt.process_start_utc -ne [string]$proofBootstrapFinal.process_start_utc -or
        -not (Test-Issue97SamePath -Left ([string]$proofBootstrapReceipt.bootstrap_script) `
          -Right (Join-Path $PSScriptRoot 'issue97-worker-proof-bootstrap.ps1'))) {
      throw 'production proof bootstrap lifecycle receipts disagree'
    }
  } elseif (-not [string]::IsNullOrWhiteSpace([string]$proofBootstrapFinal.process_start_utc)) {
    throw 'production bootstrap terminal receipt lacks its bound process receipt'
  }
  if ($null -ne (Get-Process -Id ([int]$proofBootstrapFinal.pid) -ErrorAction SilentlyContinue)) {
    throw 'production proof bootstrap PID remains active or has become ambiguous'
  }
  $verifiedSha = Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch
  if ($verifiedSha -ne [string]$claim.authorized_repo_sha) {
    throw 'server-inspection repository is not the authorized exact SHA'
  }
  $fixedPsqlPath = Join-Path $repoRoot (([string]$manifest.psql.relative_path) -replace '/', '\')
  $liveReviewedClients = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'psql.exe'" | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) -and
    (Test-Issue97SamePath -Left ([string]$_.ExecutablePath) -Right $fixedPsqlPath)
  })
  if ($liveReviewedClients.Count -ne 0) {
    throw 'a reviewed PostgreSQL client process from the proof lane is still active'
  }
  $originalClientReceiptPath = Join-Path $logRoot 'production.client.json'
  if (Test-Path -LiteralPath $originalClientReceiptPath -PathType Leaf) {
    $originalClient = Read-Issue97Json -LiteralPath $originalClientReceiptPath
    $expectedOriginalSql = Join-Path $logRoot "$([string]$claim.proof_attempt_id).reviewed.sql"
    if ([string]$originalClient.attempt_id -ne [string]$claim.proof_attempt_id -or
        [string]$originalClient.repo_sha -ne [string]$claim.authorized_repo_sha -or
        [string]$originalClient.pgappname -ne [string]$claim.target_pgappname -or
        [int]$originalClient.pid -le 0 -or
        -not (Test-Issue97SamePath -Left ([string]$originalClient.executable_path) -Right $fixedPsqlPath) -or
        -not (Test-Issue97SamePath -Left ([string]$originalClient.execution_sql_path) -Right $expectedOriginalSql)) {
      throw 'original proof client receipt is invalid'
    }
    $originalProcess = Get-Process -Id ([int]$originalClient.pid) -ErrorAction SilentlyContinue
    if ($null -ne $originalProcess) {
      throw 'the original proof client PID remains active or has become ambiguous'
    }
  }
  $selfIdentity = Get-Issue97ProcessIdentity -ProcessId $PID
  if (-not (Test-Issue97WorkerProcessIdentity -Actual $selfIdentity -ExpectedPid $PID `
      -ExpectedStartUtc ([string]$spawnReceipt.process_start_utc) `
      -ExpectedPowerShellPath ([string]$manifest.powershell.path) -ExpectedScript $workerPath)) {
    throw 'server-inspection worker process identity mismatch'
  }
  $proofBootstrap = Join-Path $PSScriptRoot 'issue97-worker-proof-bootstrap.ps1'
  $proofWorker = Join-Path $PSScriptRoot 'issue97-worker-proof-worker.ps1'
  $expectedLifecycleCommands = @(
    '"' + [string]$manifest.powershell.path + '" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $proofBootstrap + '"',
    '"' + [string]$manifest.powershell.path + '" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $proofWorker + '"'
  )
  $liveLifecycle = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {
    $candidate = $_
    @($expectedLifecycleCommands | Where-Object {
      [string]::Equals([string]$candidate.CommandLine, [string]$_, [System.StringComparison]::OrdinalIgnoreCase)
    }).Count -ne 0
  })
  if ($liveLifecycle.Count -ne 0) { throw 'production proof bootstrap/worker lifecycle is still active' }
  Write-Issue97TextNoClobber -LiteralPath ([string]$claim.worker_host_stdout_path) -Text ''
  Write-Issue97TextNoClobber -LiteralPath ([string]$claim.worker_host_stderr_path) -Text ''
  Write-Issue97JsonAtomicNoClobber -LiteralPath $pidPath -Value ([ordered]@{
    schema_version = 3
    generation_id = [string]$manifest.generation_id
    job_kind = [string]$claim.job_kind
    attempt_id = [string]$claim.attempt_id
    repo_sha = $verifiedSha
    pid = $PID
    process_start_utc = [string]$selfIdentity.process_start_utc
    executable_path = [string]$manifest.powershell.path
    worker_script = $workerPath
    target_pgappname = [string]$claim.target_pgappname
  })
  $psqlPath = Assert-Issue97PostgreSQLRuntime -RepoRoot $repoRoot -Manifest $manifest
  $liveReviewedClients = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'psql.exe'" | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) -and
    (Test-Issue97SamePath -Left ([string]$_.ExecutablePath) -Right $fixedPsqlPath)
  })
  if ($liveReviewedClients.Count -ne 0) {
    throw 'a reviewed PostgreSQL client appeared during server-inspection preflight'
  }
  $sqlPath = Join-Path $repoRoot 'ops\issue97-computer-rollout\sql\36-worker-proof-server-inspection.sql'
  $sqlArtifact = @($manifest.artifacts | Where-Object {
    [string]$_.path -eq 'ops/issue97-computer-rollout/sql/36-worker-proof-server-inspection.sql'
  })
  if ($sqlArtifact.Count -ne 1 -or (Get-Issue97Sha256 -LiteralPath $sqlPath) -ne
      ([string]$sqlArtifact[0].sha256).ToUpperInvariant()) { throw 'server-inspection SQL hash mismatch' }
  $sqlText = [System.IO.File]::ReadAllText($sqlPath, [System.Text.Encoding]::UTF8)
  Write-Issue97TextNoClobber -LiteralPath $executionSqlPath -Text $sqlText
  if ((Get-Issue97Sha256 -LiteralPath $executionSqlPath) -ne ([string]$sqlArtifact[0].sha256).ToUpperInvariant()) {
    throw 'server-inspection reviewed SQL execution copy mismatch'
  }
  $guard = [System.IO.File]::Open($executionSqlPath, [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
  try {
    $arguments = "-X --no-psqlrc --set=ON_ERROR_STOP=1 --set=issue97_target_pgappname=$([string]$claim.target_pgappname) --set=issue97_inspector_pgappname=$([string]$claim.inspector_pgappname) --file=`"$executionSqlPath`""
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $psqlPath
    $startInfo.Arguments = $arguments
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables['PGSERVICE'] = [string]$manifest.expected_service
    $startInfo.EnvironmentVariables['PGSSLMODE'] = 'require'
    $startInfo.EnvironmentVariables['PGCONNECT_TIMEOUT'] = '10'
    $startInfo.EnvironmentVariables['PGAPPNAME'] = [string]$claim.inspector_pgappname
    $startInfo.EnvironmentVariables.Remove('PGOPTIONS')
    $clientStarted = $true
    $client = New-Object System.Diagnostics.Process
    $client.StartInfo = $startInfo
    if (-not $client.Start()) { throw 'server inspection psql client did not start' }
    $stdoutTask = $client.StandardOutput.ReadToEndAsync()
    $stderrTask = $client.StandardError.ReadToEndAsync()
    $clientPid = [int]$client.Id
    $clientProcessStartUtc = $client.StartTime.ToUniversalTime().ToString('o')
    Write-Issue97JsonAtomicNoClobber -LiteralPath $clientPath -Value ([ordered]@{
      schema_version = 3
      worker_proof_version = [string]$claim.worker_proof_version
      generation_id = [string]$manifest.generation_id
      job_kind = [string]$claim.job_kind
      attempt_id = [string]$claim.attempt_id
      repo_sha = [string]$claim.authorized_repo_sha
      target_pgappname = [string]$claim.target_pgappname
      inspector_pgappname = [string]$claim.inspector_pgappname
      child_environment_pgappname = [string]$startInfo.EnvironmentVariables['PGAPPNAME']
      pid = $clientPid
      process_start_utc = $clientProcessStartUtc
      executable_path = $psqlPath
      execution_sql_path = $executionSqlPath
    })
    $clientFinished = $client.WaitForExit(45000)
    if (-not $clientFinished) { throw 'server inspection exceeded its fixed wall-clock bound' }
    $client.WaitForExit()
    $client.Refresh()
    $exitCode = [int]$client.ExitCode
    $stdout = [string]$stdoutTask.GetAwaiter().GetResult()
    $stderr = [string]$stderrTask.GetAwaiter().GetResult()
    Write-Issue97TextNoClobber -LiteralPath ([string]$claim.stdout_path) -Text $stdout
    Write-Issue97TextNoClobber -LiteralPath ([string]$claim.stderr_path) -Text $stderr
    $stdoutHash = Get-Issue97Sha256 -LiteralPath ([string]$claim.stdout_path)
    $stderrHash = Get-Issue97Sha256 -LiteralPath ([string]$claim.stderr_path)
    Write-Issue97JsonAtomicNoClobber -LiteralPath $clientFinalPath -Value ([ordered]@{
      schema_version = 3
      worker_proof_version = [string]$claim.worker_proof_version
      generation_id = [string]$manifest.generation_id
      job_kind = [string]$claim.job_kind
      attempt_id = [string]$claim.attempt_id
      repo_sha = [string]$claim.authorized_repo_sha
      target_pgappname = [string]$claim.target_pgappname
      inspector_pgappname = [string]$claim.inspector_pgappname
      child_environment_pgappname = [string]$startInfo.EnvironmentVariables['PGAPPNAME']
      pid = $clientPid
      process_start_utc = $clientProcessStartUtc
      process_end_utc = [datetime]::UtcNow.ToString('o')
      exit_code = $exitCode
      stdout_sha256 = $stdoutHash
      stderr_sha256 = $stderrHash
    })
  } finally {
    $guard.Dispose()
  }
  $success = $exitCode -eq 0 -and $stdout.Contains('ISSUE97_WORKER_PROOF_SERVER_INSPECTION_PASS') -and
    ([regex]::Matches($stdout, '(?im)^\s*ROLLBACK\s*$')).Count -eq 1 -and
    ([regex]::Matches($stdout + "`n" + $stderr, '(?im)^\s*COMMIT\s*$')).Count -eq 0
  if (-not $success) { throw 'server-inspection SQL did not satisfy its complete success contract' }
  $liveReviewedClients = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'psql.exe'" | Where-Object {
    -not [string]::IsNullOrWhiteSpace([string]$_.ExecutablePath) -and
    (Test-Issue97SamePath -Left ([string]$_.ExecutablePath) -Right $fixedPsqlPath)
  })
  if ($liveReviewedClients.Count -ne 0) {
    throw 'a reviewed PostgreSQL client remains after the server inspection'
  }
  $failureCode = $null
} catch {
  $failureCode = 'server_inspection_fail_stop'
} finally {
  Remove-Item Env:PGAPPNAME -ErrorAction SilentlyContinue
  Remove-Item Env:PGCONNECT_TIMEOUT -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
  Remove-Item Env:PGSERVICE -ErrorAction SilentlyContinue
  if ($null -ne $claim -and $libLoaded) {
    $stdoutHash = if (Test-Path -LiteralPath ([string]$claim.stdout_path) -PathType Leaf) {
      Get-Issue97Sha256 -LiteralPath ([string]$claim.stdout_path)
    } else { $null }
    $stderrHash = if (Test-Path -LiteralPath ([string]$claim.stderr_path) -PathType Leaf) {
      Get-Issue97Sha256 -LiteralPath ([string]$claim.stderr_path)
    } else { $null }
    try {
      Write-Issue97JsonAtomicNoClobber -LiteralPath $finalPath -Value ([ordered]@{
        schema_version = 3
        worker_proof_version = [string]$claim.worker_proof_version
        generation_id = [string]$manifest.generation_id
        job_kind = [string]$claim.job_kind
        attempt_id = [string]$claim.attempt_id
        proof_attempt_id = [string]$claim.proof_attempt_id
        repo_sha = [string]$claim.authorized_repo_sha
        artifact_set_sha256 = [string]$claim.artifact_set_sha256
        target_pgappname = [string]$claim.target_pgappname
        inspector_pgappname = [string]$claim.inspector_pgappname
        pid = $PID
        process_start_utc = if ($null -ne $spawnReceipt) { [string]$spawnReceipt.process_start_utc } else { $null }
        start_utc = $startUtc
        end_utc = [datetime]::UtcNow.ToString('o')
        client_started = $clientStarted
        client_confirmed_finished = $clientFinished
        exit_code = $exitCode
        client_final_receipt_path = $clientFinalPath
        client_final_receipt_sha256 = if ($clientFinished -and (Test-Path -LiteralPath $clientFinalPath)) { Get-Issue97Sha256 -LiteralPath $clientFinalPath } else { $null }
        child_environment_pgappname = if ($clientFinished) { [string]$claim.inspector_pgappname } else { $null }
        final_marker_present = if ($clientFinished) { $stdout.Contains('ISSUE97_WORKER_PROOF_SERVER_INSPECTION_PASS') } else { $false }
        rollback_present = if ($clientFinished) { ([regex]::Matches($stdout, '(?im)^\s*ROLLBACK\s*$')).Count -eq 1 } else { $false }
        commit_count = if ($clientFinished) { ([regex]::Matches($stdout + "`n" + $stderr, '(?im)^\s*COMMIT\s*$')).Count } else { -1 }
        stdout_sha256 = $stdoutHash
        stderr_sha256 = $stderrHash
        executed_sql_sha256 = if (Test-Path -LiteralPath $executionSqlPath -PathType Leaf) { Get-Issue97Sha256 -LiteralPath $executionSqlPath } else { $null }
        psql_sha256 = if ($null -ne $manifest) { [string]$manifest.psql.sha256 } else { $null }
        success = $success
        server_inspection_required = (-not $success)
        failure_code = $failureCode
        worker_exit_code = if ($success) { 0 } else { 103 }
      })
    } catch { exit 102 }
  }
  if (-not $success) { exit 103 }
}
