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

if ($args.Count -ne 0) { throw 'issue97-worker-proof-authorize-production.ps1 accepts zero arguments' }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$libArtifact = @($manifest.artifacts | Where-Object {
  [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
})
$selfArtifact = @($manifest.artifacts | Where-Object {
  [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-authorize-production.ps1'
})
if ($libArtifact.Count -ne 1 -or $selfArtifact.Count -ne 1 -or
    (Get-Issue97PreambleSha256 -LiteralPath $libPath) -ne ([string]$libArtifact[0].sha256).ToUpperInvariant() -or
    (Get-Issue97PreambleSha256 -LiteralPath $PSCommandPath) -ne ([string]$selfArtifact[0].sha256).ToUpperInvariant()) {
  throw 'production authorization library hash mismatch'
}
. $libPath

Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
Assert-Issue97NoCredentialEnvironment
Assert-Issue97RuntimeFile -LiteralPath ([string]$manifest.powershell.path) `
  -ExpectedSha256 ([string]$manifest.powershell.sha256)
Assert-Issue97HistoricalEvidence -Manifest $manifest
$logRoot = [string]$manifest.private_log_root
Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
$localAuthorizationPath = Join-Path $logRoot 'local.authorization.json'
$productionAuthorizationPath = Join-Path $logRoot 'production.authorization.json'
if (-not (Test-Path -LiteralPath $localAuthorizationPath -PathType Leaf)) {
  throw 'the reviewed local exact-SHA authorization receipt is missing'
}
foreach ($path in @(
  $productionAuthorizationPath,
  (Join-Path $logRoot 'production.launch.json'),
  (Join-Path $logRoot 'server-inspection.launch.json')
)) {
  if (Test-Path -LiteralPath $path) {
    throw 'production authorization or one-shot claim already exists'
  }
}
$repoSha = Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch
$localAuthorization = Read-Issue97Json -LiteralPath $localAuthorizationPath
$manifestHash = Get-Issue97Sha256 -LiteralPath $manifestPath
if ([int]$localAuthorization.schema_version -ne 3 -or
    [string]$localAuthorization.worker_proof_version -ne [string]$manifest.worker_proof_version -or
    [string]$localAuthorization.generation_id -ne [string]$manifest.generation_id -or
    [string]$localAuthorization.authorized_repo_sha -ne $repoSha -or
    [string]$localAuthorization.artifact_set_sha256 -ne [string]$manifest.artifact_set_sha256 -or
    [string]$localAuthorization.manifest_sha256 -ne $manifestHash -or
    -not [bool]$localAuthorization.local_proof_authorized -or
    [bool]$localAuthorization.production_read_only_proof_authorized -or
    [bool]$localAuthorization.mapping_rehearsal_authorized -or
    [bool]$localAuthorization.automatic_retry_authorized) {
  throw 'local authorization does not bind this audited generation and exact SHA'
}
$statusPath = Join-Path $PSScriptRoot 'issue97-worker-proof-status.ps1'
$statusOutput = @(& ([string]$manifest.powershell.path) -NoLogo -NoProfile -NonInteractive `
  -ExecutionPolicy Bypass -File $statusPath)
$statusExitCode = $LASTEXITCODE
if ($statusExitCode -ne 0 -or @($statusOutput | Where-Object { $_ -eq 'STATE=CLIENT_FINISHED_SUCCESS' }).Count -ne 1) {
  throw 'the exact generation local detached proof has not passed'
}
$localFinalPath = Join-Path $logRoot 'local.final.json'
if (-not (Test-Path -LiteralPath $localFinalPath -PathType Leaf)) {
  throw 'the exact generation local final receipt is missing'
}
$localFinal = Read-Issue97Json -LiteralPath $localFinalPath
if ([int]$localFinal.schema_version -ne 3 -or
    [string]$localFinal.worker_proof_version -ne [string]$manifest.worker_proof_version -or
    [string]$localFinal.generation_id -ne [string]$manifest.generation_id -or
    [string]$localFinal.repo_sha -ne $repoSha -or
    -not [bool]$localFinal.success -or [bool]$localFinal.server_inspection_required -or
    [int]$localFinal.exit_code -ne 0 -or [int]$localFinal.worker_exit_code -ne 0) {
  throw 'the exact generation local final receipt is not a successful proof'
}
$receipt = [ordered]@{
  schema_version = 3
  worker_proof_version = [string]$manifest.worker_proof_version
  generation_id = [string]$manifest.generation_id
  authorized_repo_sha = $repoSha
  branch = [string]$manifest.expected_branch
  artifact_set_sha256 = [string]$manifest.artifact_set_sha256
  manifest_sha256 = $manifestHash
  artifact_hashes = Get-Issue97ArtifactHashMap -Manifest $manifest
  local_authorization_path = $localAuthorizationPath
  local_authorization_sha256 = Get-Issue97Sha256 -LiteralPath $localAuthorizationPath
  local_final_receipt_path = $localFinalPath
  local_final_receipt_sha256 = Get-Issue97Sha256 -LiteralPath $localFinalPath
  authorized_utc = [datetime]::UtcNow.ToString('o')
  local_proof_authorized = $true
  production_read_only_proof_authorized = $true
  mapping_rehearsal_authorized = $false
  automatic_retry_authorized = $false
}
Write-Issue97JsonAtomicNoClobber -LiteralPath $productionAuthorizationPath -Value $receipt
Write-Output 'STATE=PRODUCTION_EXACT_SHA_AUTHORIZED'
Write-Output "AUTHORIZED_REPO_SHA=$repoSha"
Write-Output "ARTIFACT_SET_SHA256=$([string]$manifest.artifact_set_sha256)"
