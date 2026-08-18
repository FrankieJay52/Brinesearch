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

if ($args.Count -ne 0) { throw 'issue97-worker-proof-authorize.ps1 accepts zero arguments' }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$libArtifact = @($manifest.artifacts | Where-Object {
  [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
})
$selfArtifact = @($manifest.artifacts | Where-Object {
  [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-authorize.ps1'
})
if ($libArtifact.Count -ne 1 -or $selfArtifact.Count -ne 1 -or
    (Get-Issue97PreambleSha256 -LiteralPath $libPath) -ne ([string]$libArtifact[0].sha256).ToUpperInvariant() -or
    (Get-Issue97PreambleSha256 -LiteralPath $PSCommandPath) -ne ([string]$selfArtifact[0].sha256).ToUpperInvariant()) {
  throw 'authorization library hash mismatch'
}
. $libPath

Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
Assert-Issue97NoCredentialEnvironment
Assert-Issue97RuntimeFile -LiteralPath ([string]$manifest.powershell.path) `
  -ExpectedSha256 ([string]$manifest.powershell.sha256)
$logRoot = [string]$manifest.private_log_root
Assert-Issue97PrivateLogRoot -LogRoot $logRoot -TrustedRoot ([string]$manifest.trusted_owner_root)
$authorizationPath = Join-Path $logRoot 'authorization.json'
foreach ($path in @(
  $authorizationPath,
  (Join-Path $logRoot 'local.launch.json'),
  (Join-Path $logRoot 'production.launch.json'),
  (Join-Path $logRoot 'server-inspection.launch.json')
)) {
  if (Test-Path -LiteralPath $path) {
    throw 'worker-proof authorization or one-shot claim already exists'
  }
}
$repoSha = Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch
$receipt = [ordered]@{
  schema_version = 2
  worker_proof_version = [string]$manifest.worker_proof_version
  authorized_repo_sha = $repoSha
  branch = [string]$manifest.expected_branch
  artifact_set_sha256 = [string]$manifest.artifact_set_sha256
  manifest_sha256 = Get-Issue97Sha256 -LiteralPath $manifestPath
  artifact_hashes = Get-Issue97ArtifactHashMap -Manifest $manifest
  authorized_utc = [datetime]::UtcNow.ToString('o')
  local_proof_authorized = $true
  production_read_only_proof_authorized = $true
  mapping_rehearsal_authorized = $false
}
Write-Issue97JsonAtomicNoClobber -LiteralPath $authorizationPath -Value $receipt
Write-Output 'STATE=EXACT_SHA_AUTHORIZED'
Write-Output "AUTHORIZED_REPO_SHA=$repoSha"
Write-Output "ARTIFACT_SET_SHA256=$([string]$manifest.artifact_set_sha256)"
