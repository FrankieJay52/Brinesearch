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
if ($args.Count -ne 0) { throw 'issue97-worker-proof-provision-log-root.ps1 accepts zero arguments' }

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestPath = Join-Path $PSScriptRoot 'issue97-worker-proof-manifest.json'
$libPath = Join-Path $PSScriptRoot 'issue97-worker-proof-lib.ps1'
$manifest = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$libArtifact = @($manifest.artifacts | Where-Object {
  [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1'
})
$selfArtifact = @($manifest.artifacts | Where-Object {
  [string]$_.path -eq 'ops/issue97-computer-rollout/issue97-worker-proof-provision-log-root.ps1'
})
if ($libArtifact.Count -ne 1 -or $selfArtifact.Count -ne 1 -or
    (Get-Issue97PreambleSha256 -LiteralPath $libPath) -ne ([string]$libArtifact[0].sha256).ToUpperInvariant() -or
    (Get-Issue97PreambleSha256 -LiteralPath $PSCommandPath) -ne ([string]$selfArtifact[0].sha256).ToUpperInvariant()) {
  throw 'log-root provisioner library hash mismatch'
}
. $libPath
Assert-Issue97ArtifactManifest -RepoRoot $repoRoot -Manifest $manifest
Assert-Issue97RuntimeFile -LiteralPath ([string]$manifest.powershell.path) `
  -ExpectedSha256 ([string]$manifest.powershell.sha256)
Assert-Issue97HistoricalEvidence -Manifest $manifest
Assert-Issue97PrivateLogRoot -LogRoot ([string]$manifest.private_log_root) `
  -TrustedRoot ([string]$manifest.trusted_owner_root) -Create
Write-Output 'STATE=PRIVATE_LOG_ROOT_READY'
