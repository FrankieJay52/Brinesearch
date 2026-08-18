Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Issue97Sha256 {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) {
    throw 'required file is missing'
  }
  $stream = [System.IO.File]::Open(
    [System.IO.Path]::GetFullPath($LiteralPath),
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::Read
  )
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToUpperInvariant()
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Get-Issue97Utf8TextSha256 {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
  $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($Text)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToUpperInvariant()
  } finally {
    $algorithm.Dispose()
  }
}

function Read-Issue97Json {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) {
    throw 'required receipt is missing'
  }
  $raw = [System.IO.File]::ReadAllText($LiteralPath, [System.Text.Encoding]::UTF8)
  if ([string]::IsNullOrWhiteSpace($raw)) { throw 'required receipt is empty' }
  return $raw | ConvertFrom-Json
}

function Write-Issue97JsonNoClobber {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)]$Value
  )
  $parent = [System.IO.Path]::GetDirectoryName($LiteralPath)
  [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  $json = ($Value | ConvertTo-Json -Depth 32) + "`n"
  $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($json)
  $stream = [System.IO.File]::Open(
    $LiteralPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } finally {
    $stream.Dispose()
  }
}

function Write-Issue97TextNoClobber {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
  )
  $parent = [System.IO.Path]::GetDirectoryName($LiteralPath)
  [System.IO.Directory]::CreateDirectory($parent) | Out-Null
  $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($Text)
  $stream = [System.IO.File]::Open(
    $LiteralPath,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  try {
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
  } finally {
    $stream.Dispose()
  }
}

function Write-Issue97JsonAtomicNoClobber {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)]$Value
  )
  $temporaryPath = "$LiteralPath.tmp.$PID.$([Guid]::NewGuid().ToString('N'))"
  try {
    Write-Issue97JsonNoClobber -LiteralPath $temporaryPath -Value $Value
    [System.IO.File]::Move($temporaryPath, $LiteralPath)
  } finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Test-Issue97SamePath {
  param(
    [Parameter(Mandatory = $true)][string]$Left,
    [Parameter(Mandatory = $true)][string]$Right
  )
  try {
    return [string]::Equals(
      [System.IO.Path]::GetFullPath($Left).TrimEnd('\'),
      [System.IO.Path]::GetFullPath($Right).TrimEnd('\'),
      [System.StringComparison]::OrdinalIgnoreCase
    )
  } catch {
    return $false
  }
}

function Assert-Issue97PathUnderRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$AllowedRoot
  )
  $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
  $rootFull = [System.IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\') + '\'
  if (-not $candidateFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'private receipt path escapes the approved log root'
  }
}

function Assert-Issue97NoReparseComponents {
  param([Parameter(Mandatory = $true)][string]$LiteralPath)
  $full = [System.IO.Path]::GetFullPath($LiteralPath)
  $root = [System.IO.Path]::GetPathRoot($full)
  $relative = $full.Substring($root.Length)
  $cursor = $root
  foreach ($component in @($relative.Split('\') | Where-Object { $_ -ne '' })) {
    $cursor = Join-Path $cursor $component
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'private log path contains a reparse point'
      }
    }
  }
}

function Assert-Issue97TrustedOwnerTree {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$TrustedRoot
  )
  $full = [System.IO.Path]::GetFullPath($LiteralPath).TrimEnd('\')
  $trusted = [System.IO.Path]::GetFullPath($TrustedRoot).TrimEnd('\')
  if (-not ($full -eq $trusted -or
      $full.StartsWith($trusted + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
    throw 'reviewed path is outside the trusted owner root'
  }
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $allowed = @{}
  foreach ($principal in @($identity, 'NT AUTHORITY\SYSTEM', 'BUILTIN\ADMINISTRATORS')) {
    $allowed[$principal.ToUpperInvariant()] = $true
  }
  $writeMask = [System.Security.AccessControl.FileSystemRights]::WriteData -bor
    [System.Security.AccessControl.FileSystemRights]::CreateFiles -bor
    [System.Security.AccessControl.FileSystemRights]::AppendData -bor
    [System.Security.AccessControl.FileSystemRights]::CreateDirectories -bor
    [System.Security.AccessControl.FileSystemRights]::WriteAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::WriteExtendedAttributes -bor
    [System.Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor
    [System.Security.AccessControl.FileSystemRights]::Delete -bor
    [System.Security.AccessControl.FileSystemRights]::ChangePermissions -bor
    [System.Security.AccessControl.FileSystemRights]::TakeOwnership
  $relative = $full.Substring($trusted.Length).TrimStart('\')
  $cursor = $trusted
  $candidates = @($trusted)
  foreach ($component in @($relative.Split('\') | Where-Object { $_ -ne '' })) {
    $cursor = Join-Path $cursor $component
    $candidates += $cursor
  }
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { throw 'reviewed trusted path component is missing' }
    $item = Get-Item -LiteralPath $candidate -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'reviewed trusted path contains a reparse point'
    }
    $acl = $item.GetAccessControl()
    $owner = ([string]$acl.Owner).ToUpperInvariant()
    if (-not $allowed.ContainsKey($owner)) {
      throw 'reviewed trusted path has an untrusted owner'
    }
    foreach ($rule in @($acl.Access)) {
      $principal = ([string]$rule.IdentityReference.Value).ToUpperInvariant()
      if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
          -not $allowed.ContainsKey($principal) -and
          (([int]$rule.FileSystemRights -band [int]$writeMask) -ne 0)) {
        throw 'reviewed trusted path grants write/delete rights to an untrusted principal'
      }
    }
  }
}

function Get-Issue97GitMetadataRoots {
  param([Parameter(Mandatory = $true)][string]$RepoRoot)
  $dotGit = Join-Path $RepoRoot '.git'
  if (Test-Path -LiteralPath $dotGit -PathType Container) {
    return @([System.IO.Path]::GetFullPath($dotGit))
  }
  if (-not (Test-Path -LiteralPath $dotGit -PathType Leaf)) { throw 'repository Git metadata is missing' }
  $pointer = [System.IO.File]::ReadAllText($dotGit).Trim()
  if ($pointer -notmatch '^gitdir:\s+(.+)$') { throw 'repository Git metadata pointer is invalid' }
  $gitDirValue = $Matches[1]
  $gitDir = if ([System.IO.Path]::IsPathRooted($gitDirValue)) {
    [System.IO.Path]::GetFullPath($gitDirValue)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $gitDirValue))
  }
  $roots = @($gitDir)
  $commonPointer = Join-Path $gitDir 'commondir'
  if (Test-Path -LiteralPath $commonPointer -PathType Leaf) {
    $commonRelative = [System.IO.File]::ReadAllText($commonPointer).Trim()
    if ([string]::IsNullOrWhiteSpace($commonRelative)) { throw 'repository common Git metadata pointer is invalid' }
    $roots += if ([System.IO.Path]::IsPathRooted($commonRelative)) {
      [System.IO.Path]::GetFullPath($commonRelative)
    } else {
      [System.IO.Path]::GetFullPath((Join-Path $gitDir $commonRelative))
    }
  }
  return @($roots | Sort-Object -Unique)
}

function Assert-Issue97PrivateLogRoot {
  param(
    [Parameter(Mandatory = $true)][string]$LogRoot,
    [Parameter(Mandatory = $true)][string]$TrustedRoot,
    [switch]$Create
  )
  if (-not [System.IO.Path]::IsPathRooted($LogRoot)) { throw 'private log root must be absolute' }
  if (-not (Test-Path -LiteralPath $LogRoot -PathType Container)) {
    if (-not $Create) { throw 'private log root does not exist' }
    $logParent = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($LogRoot))
    if (-not (Test-Path -LiteralPath $logParent -PathType Container)) {
      [System.IO.Directory]::CreateDirectory($logParent) | Out-Null
    }
    Assert-Issue97TrustedOwnerTree -LiteralPath $logParent -TrustedRoot $TrustedRoot
    [System.IO.Directory]::CreateDirectory($LogRoot) | Out-Null
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $newAcl = New-Object System.Security.AccessControl.DirectorySecurity
    $newAcl.SetOwner((New-Object System.Security.Principal.NTAccount($identity)))
    $newAcl.SetAccessRuleProtection($true, $false)
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
      [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    foreach ($principal in @($identity, 'NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators')) {
      $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $principal,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        $inheritance,
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
      )
      [void]$newAcl.AddAccessRule($rule)
    }
    (Get-Item -LiteralPath $LogRoot -Force).SetAccessControl($newAcl)
  }
  Assert-Issue97TrustedOwnerTree -LiteralPath $LogRoot -TrustedRoot $TrustedRoot
  Assert-Issue97NoReparseComponents -LiteralPath $LogRoot
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = (Get-Item -LiteralPath $LogRoot -Force).GetAccessControl()
  if (-not [string]::Equals($identity, $acl.Owner, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'private log root is not owned by the current Windows identity'
  }
  if (-not $acl.AreAccessRulesProtected) {
    throw 'private log root must not inherit access rules'
  }
  $allowed = @{}
  foreach ($principal in @($identity, 'NT AUTHORITY\SYSTEM', 'BUILTIN\ADMINISTRATORS')) {
    $allowed[$principal.ToUpperInvariant()] = $true
  }
  $seen = @{}
  $expectedInheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
    [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  foreach ($rule in @($acl.Access)) {
    $principal = ([string]$rule.IdentityReference.Value).ToUpperInvariant()
    if (-not $allowed.ContainsKey($principal) -or
        $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
        $rule.IsInherited -or
        [int]$rule.FileSystemRights -ne [int][System.Security.AccessControl.FileSystemRights]::FullControl -or
        [int]$rule.InheritanceFlags -ne [int]$expectedInheritance -or
        $rule.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None -or
        $seen.ContainsKey($principal)) {
      throw 'private log root ACL is not the exact owner/SYSTEM/Administrators contract'
    }
    $seen[$principal] = $true
  }
  if ($seen.Count -ne $allowed.Count) {
    throw 'private log root ACL is incomplete'
  }
}

function Get-Issue97ProcessIdentity {
  param([Parameter(Mandatory = $true)][int]$ProcessId)
  $process = Get-Process -Id $ProcessId -ErrorAction Stop
  $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
  return [pscustomobject]@{
    pid = $ProcessId
    process_start_utc = $process.StartTime.ToUniversalTime().ToString('o')
    executable_path = [string]$cim.ExecutablePath
    command_line = [string]$cim.CommandLine
  }
}

function Test-Issue97WorkerProcessIdentity {
  param(
    [Parameter(Mandatory = $true)]$Actual,
    [Parameter(Mandatory = $true)][int]$ExpectedPid,
    [Parameter(Mandatory = $true)][string]$ExpectedStartUtc,
    [Parameter(Mandatory = $true)][string]$ExpectedPowerShellPath,
    [Parameter(Mandatory = $true)][string]$ExpectedScript
  )
  if ([int]$Actual.pid -ne $ExpectedPid) { return $false }
  if ([datetime]::Parse([string]$Actual.process_start_utc).ToUniversalTime() -ne
      [datetime]::Parse($ExpectedStartUtc).ToUniversalTime()) { return $false }
  if (-not (Test-Issue97SamePath -Left ([string]$Actual.executable_path) -Right $ExpectedPowerShellPath)) {
    return $false
  }
  $commandLine = [string]$Actual.command_line
  if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
  $expectedCommandLine = "`"$ExpectedPowerShellPath`" -NoLogo -NoProfile -NonInteractive " +
    "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ExpectedScript`""
  return [string]::Equals(
    $commandLine.Trim(),
    $expectedCommandLine,
    [System.StringComparison]::OrdinalIgnoreCase
  )
}

function Get-Issue97FinalReceiptDisposition {
  param(
    [Parameter(Mandatory = $true)][bool]$Production,
    [Parameter(Mandatory = $true)][bool]$SuccessContract,
    [Parameter(Mandatory = $true)][bool]$FinalClaimsSuccess,
    [Parameter(Mandatory = $true)][bool]$ServerInspectionRequired
  )
  if ($SuccessContract) { return 'CLIENT_FINISHED_SUCCESS' }
  if ($Production -or $ServerInspectionRequired) { return 'SERVER_INSPECTION_REQUIRED' }
  if ($FinalClaimsSuccess) { return 'RECEIPT_INVALID' }
  return 'CLIENT_FINISHED_FAILURE'
}

function Assert-Issue97CommandLiteral {
  param([Parameter(Mandatory = $true)][string]$Literal)
  if ($Literal -match '[\x00-\x1f"&|<>^%!]') {
    throw 'fixed command path contains a cmd.exe metacharacter'
  }
}

function Assert-Issue97ArtifactManifest {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)]$Manifest
  )
  if ([int]$Manifest.schema_version -ne 2) { throw 'artifact manifest schema mismatch' }
  if ([string]$Manifest.worker_proof_version -ne 'issue97-long-lived-worker-proof-v2') {
    throw 'worker-proof version mismatch'
  }
  $expectedPaths = @(
    'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-authorize.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-launch.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-bootstrap.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-worker.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-status.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-provision-log-root.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-bootstrap.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-worker.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-status.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-local-launch.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-local-bootstrap.ps1',
    'ops/issue97-computer-rollout/issue97-worker-proof-local-worker.ps1',
    'ops/issue97-computer-rollout/sql/35-worker-proof-read-only.sql',
    'ops/issue97-computer-rollout/sql/36-worker-proof-server-inspection.sql'
  )
  if (@($Manifest.artifacts).Count -ne $expectedPaths.Count) {
    throw 'artifact manifest does not contain the exact fixed worker-proof set'
  }
  for ($index = 0; $index -lt $expectedPaths.Count; $index++) {
    if ([string]$Manifest.artifacts[$index].path -ne $expectedPaths[$index]) {
      throw 'artifact manifest path/order is not the exact fixed worker-proof set'
    }
  }
  $repoFull = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\') + '\'
  $seen = @{}
  $artifactSetLines = @()
  foreach ($artifact in @($Manifest.artifacts)) {
    $relativePath = [string]$artifact.path
    if ([string]::IsNullOrWhiteSpace($relativePath) -or [System.IO.Path]::IsPathRooted($relativePath)) {
      throw 'artifact path is invalid'
    }
    $normalized = $relativePath.Replace('/', '\')
    if ($normalized.Split('\') -contains '..') { throw 'artifact path is invalid' }
    $absolute = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $normalized))
    if (-not $absolute.StartsWith($repoFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'artifact path escapes the repository'
    }
    if ($seen.ContainsKey($relativePath)) { throw 'artifact path is duplicated' }
    $seen[$relativePath] = $true
    if ((Get-Issue97Sha256 -LiteralPath $absolute) -ne ([string]$artifact.sha256).ToUpperInvariant()) {
      throw 'reviewed artifact raw-byte hash mismatch'
    }
    $artifactSetLines += "$relativePath=$(([string]$artifact.sha256).ToUpperInvariant())`n"
  }
  $artifactSetLines = [string[]]$artifactSetLines
  [System.Array]::Sort($artifactSetLines, [System.StringComparer]::Ordinal)
  $artifactSetInput = ($artifactSetLines -join '')
  $computedArtifactSet = Get-Issue97Utf8TextSha256 -Text $artifactSetInput
  if ($computedArtifactSet -ne ([string]$Manifest.artifact_set_sha256).ToUpperInvariant()) {
    throw 'artifact-set digest does not match the exact fixed artifact hashes'
  }
}

function Get-Issue97ArtifactHashMap {
  param([Parameter(Mandatory = $true)]$Manifest)
  $result = [ordered]@{}
  foreach ($artifact in @($Manifest.artifacts)) {
    $result[[string]$artifact.path] = ([string]$artifact.sha256).ToUpperInvariant()
  }
  return $result
}

function Assert-Issue97NoCredentialEnvironment {
  $connectionVariables = @(
    'PGPASSWORD', 'PGPASSFILE', 'PGSERVICEFILE', 'PGSYSCONFDIR', 'PGHOST', 'PGHOSTADDR',
    'PGPORT', 'PGDATABASE', 'PGUSER', 'PGOPTIONS', 'PGCONNECT_TIMEOUT', 'PGSSLMODE',
    'PGREQUIRESSL', 'PGAPPNAME', 'PGCLIENTENCODING', 'PGTARGETSESSIONATTRS', 'PGSSLCERT',
    'PGSSLKEY', 'PGSSLROOTCERT', 'PGSSLCRL', 'PGSSLCRLDIR', 'PGSSLSNI', 'PGREQUIREAUTH',
    'PGCHANNELBINDING', 'PGGSSENCMODE', 'PGKRBSRVNAME', 'PGGSSLIB', 'PSQLRC',
    'PSQL_HISTORY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DATABASE_URL'
  )
  foreach ($name in $connectionVariables) {
    if (Test-Path -LiteralPath "Env:$name") {
      throw "$name must be unset; use only the reviewed PGSERVICE profile"
    }
  }
  $secretNamePattern = '(?i)(password|passwd|token|secret|credential|api.?key|service.?role|database.?url)'
  foreach ($entry in Get-ChildItem Env:) {
    if ($entry.Name -match $secretNamePattern) {
      throw 'a credential-bearing environment variable must be unset before launch'
    }
    if ($entry.Name -match '^(?i:GIT_|CURL_|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$)') {
      throw 'a Git/proxy environment override must be unset before launch'
    }
  }
}

function Assert-Issue97RuntimeFile {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256
  )
  if ((Get-Issue97Sha256 -LiteralPath $LiteralPath) -ne $ExpectedSha256.ToUpperInvariant()) {
    throw 'reviewed runtime file hash mismatch'
  }
}

function Assert-Issue97PostgreSQLRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)]$Manifest
  )
  $psqlPath = Join-Path $RepoRoot (([string]$Manifest.psql.relative_path) -replace '/', '\')
  Assert-Issue97PathUnderRoot -Candidate $psqlPath -AllowedRoot $RepoRoot
  Assert-Issue97TrustedOwnerTree -LiteralPath $psqlPath -TrustedRoot ([string]$Manifest.trusted_owner_root)
  Assert-Issue97NoReparseComponents -LiteralPath $psqlPath
  Assert-Issue97RuntimeFile -LiteralPath $psqlPath -ExpectedSha256 ([string]$Manifest.psql.sha256)
  $psqlBin = Split-Path -Parent $psqlPath
  $actualDlls = @(Get-ChildItem -LiteralPath $psqlBin -Filter '*.dll' -File | Sort-Object Name)
  $expectedDlls = @($Manifest.psql.dlls | Sort-Object relative_path)
  if ($actualDlls.Count -ne $expectedDlls.Count) { throw 'PostgreSQL DLL closure count mismatch' }
  for ($index = 0; $index -lt $expectedDlls.Count; $index++) {
    $expectedDllPath = Join-Path $RepoRoot (([string]$expectedDlls[$index].relative_path) -replace '/', '\')
    if (-not (Test-Issue97SamePath -Left $actualDlls[$index].FullName -Right $expectedDllPath)) {
      throw 'PostgreSQL DLL closure name mismatch'
    }
    Assert-Issue97RuntimeFile -LiteralPath $expectedDllPath -ExpectedSha256 ([string]$expectedDlls[$index].sha256)
  }
  $version = (& $psqlPath --version 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne [string]$Manifest.psql.version) {
    throw 'reviewed PostgreSQL client version mismatch'
  }
  return $psqlPath
}

function Assert-Issue97GitRuntime {
  param([Parameter(Mandatory = $true)]$Manifest)
  Assert-Issue97RuntimeFile -LiteralPath ([string]$Manifest.git.path) -ExpectedSha256 ([string]$Manifest.git.sha256)
  Assert-Issue97RuntimeFile -LiteralPath ([string]$Manifest.git.runtime_path) -ExpectedSha256 ([string]$Manifest.git.runtime_sha256)
  $version = (& ([string]$Manifest.git.path) --version 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne [string]$Manifest.git.version) {
    throw 'reviewed Git runtime version mismatch'
  }
}

function Invoke-Issue97Git {
  param(
    [Parameter(Mandatory = $true)]$Manifest,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )
  $oldNoSystem = [Environment]::GetEnvironmentVariable('GIT_CONFIG_NOSYSTEM', 'Process')
  $oldGlobal = [Environment]::GetEnvironmentVariable('GIT_CONFIG_GLOBAL', 'Process')
  try {
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_NOSYSTEM', '1', 'Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_GLOBAL', 'NUL', 'Process')
    $output = & ([string]$Manifest.git.path) `
      -c core.attributesfile=NUL -c core.hooksPath=NUL -c core.fsmonitor=false `
      -c core.untrackedCache=false -c submodule.recurse=false -c credential.helper= `
      -c core.askPass= -c http.proxy= -c https.proxy= -c protocol.file.allow=never `
      @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'reviewed Git command failed' }
    return @($output)
  } finally {
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_NOSYSTEM', $oldNoSystem, 'Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_GLOBAL', $oldGlobal, 'Process')
  }
}

function Invoke-Issue97GitFetchWithTimeout {
  param(
    [Parameter(Mandatory = $true)]$Manifest,
    [Parameter(Mandatory = $true)][string]$RepoRoot
  )
  $job = Start-Job -ScriptBlock {
    param($GitPath, $Repository, $RemoteUrl, $Branch)
    $env:GIT_CONFIG_NOSYSTEM = '1'
    $env:GIT_CONFIG_GLOBAL = 'NUL'
    $output = @(& $GitPath `
      -c core.attributesfile=NUL -c core.hooksPath=NUL -c core.fsmonitor=false `
      -c core.untrackedCache=false -c submodule.recurse=false -c credential.helper= `
      -c core.askPass= -c http.proxy= -c https.proxy= -c protocol.file.allow=never `
      -c http.lowSpeedLimit=1 -c http.lowSpeedTime=15 `
      -C $Repository fetch --quiet --no-tags $RemoteUrl `
      "+refs/heads/${Branch}:refs/remotes/origin/${Branch}" 2>&1)
    [pscustomobject]@{
      exit_code = [int]$LASTEXITCODE
      output = ($output -join "`n")
    }
  } -ArgumentList @(
    [string]$Manifest.git.path,
    $RepoRoot,
    [string]$Manifest.expected_remote_url,
    [string]$Manifest.expected_branch
  )
  try {
    if ($null -eq (Wait-Job -Job $job -Timeout 45)) {
      Stop-Job -Job $job -ErrorAction SilentlyContinue
      throw 'reviewed Git fetch exceeded the fixed 45-second wall-clock bound'
    }
    $result = Receive-Job -Job $job
    if ($null -eq $result -or [int]$result.exit_code -ne 0) {
      throw 'reviewed Git fetch failed'
    }
  } finally {
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
  }
}

function Assert-Issue97RepositoryCheckpoint {
  param(
    [Parameter(Mandatory = $true)][string]$RepoRoot,
    [Parameter(Mandatory = $true)]$Manifest,
    [switch]$Fetch
  )
  Assert-Issue97TrustedOwnerTree -LiteralPath $RepoRoot -TrustedRoot ([string]$Manifest.trusted_owner_root)
  foreach ($gitMetadataRoot in @(Get-Issue97GitMetadataRoots -RepoRoot $RepoRoot)) {
    Assert-Issue97TrustedOwnerTree -LiteralPath $gitMetadataRoot -TrustedRoot ([string]$Manifest.trusted_owner_root)
  }
  Assert-Issue97GitRuntime -Manifest $Manifest
  $localConfig = (Invoke-Issue97Git -Manifest $Manifest -Arguments @(
    '-C', $RepoRoot, 'config', '--local', '--list'
  )) -join "`n"
  foreach ($line in @($localConfig -split "`r?`n" | Where-Object { $_ -ne '' })) {
    $key = ($line -split '=', 2)[0]
    if ($key -match '^(?i:alias\.|url\.|credential\.|http\.|include\.|includeif\.|filter\.|protocol\.)' -or
        $key -match '^(?i:core\.(fsmonitor|sshcommand|hookspath|attributesfile|pager)$|diff\.external$|remote\..*\.proxy$)') {
      throw 'repository-local Git config contains an executable or redirecting setting'
    }
  }
  $remote = (Invoke-Issue97Git -Manifest $Manifest -Arguments @('-C', $RepoRoot, 'remote', 'get-url', 'origin')) -join "`n"
  if ($remote.Trim() -ne [string]$Manifest.expected_remote_url) { throw 'origin URL mismatch' }
  if ($Fetch) {
    Invoke-Issue97GitFetchWithTimeout -Manifest $Manifest -RepoRoot $RepoRoot
  }
  $branch = ((Invoke-Issue97Git -Manifest $Manifest -Arguments @('-C', $RepoRoot, 'branch', '--show-current')) -join "`n").Trim()
  if ($branch -ne [string]$Manifest.expected_branch) { throw 'wrong Issue #97 branch' }
  $status = (Invoke-Issue97Git -Manifest $Manifest -Arguments @(
    '-C', $RepoRoot, 'status', '--porcelain=v1', '--untracked-files=normal'
  )) -join "`n"
  if (-not [string]::IsNullOrWhiteSpace($status)) { throw 'worktree must be clean' }
  $repoSha = ((Invoke-Issue97Git -Manifest $Manifest -Arguments @('-C', $RepoRoot, 'rev-parse', 'HEAD')) -join "`n").Trim().ToLowerInvariant()
  $remoteSha = ((Invoke-Issue97Git -Manifest $Manifest -Arguments @(
    '-C', $RepoRoot, 'rev-parse', "refs/remotes/origin/$([string]$Manifest.expected_branch)"
  )) -join "`n").Trim().ToLowerInvariant()
  if ($repoSha -notmatch '^[0-9a-f]{40}$' -or $repoSha -ne $remoteSha) {
    throw 'local HEAD does not equal the fetched Issue #97 remote head'
  }
  $infoAttributes = ((Invoke-Issue97Git -Manifest $Manifest -Arguments @(
    '-C', $RepoRoot, 'rev-parse', '--git-path', 'info/attributes'
  )) -join "`n").Trim()
  if (-not [string]::IsNullOrWhiteSpace($infoAttributes) -and (Test-Path -LiteralPath $infoAttributes)) {
    if (-not [string]::IsNullOrWhiteSpace([System.IO.File]::ReadAllText($infoAttributes))) {
      throw 'repository-local info/attributes must be empty'
    }
  }
  return $repoSha
}
