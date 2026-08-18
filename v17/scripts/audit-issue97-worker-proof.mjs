import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const bytes = (relativePath) => fs.readFileSync(path.join(root, relativePath));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const occurrences = (value, pattern) => [...value.matchAll(pattern)].length;
const expect = (condition, message) => assert.ok(condition, message);

const files = {
  manifest: 'ops/issue97-computer-rollout/issue97-worker-proof-manifest.json',
  lib: 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1',
  authorize: 'ops/issue97-computer-rollout/issue97-worker-proof-authorize.ps1',
  launch: 'ops/issue97-computer-rollout/issue97-worker-proof-launch.ps1',
  bootstrap: 'ops/issue97-computer-rollout/issue97-worker-proof-bootstrap.ps1',
  worker: 'ops/issue97-computer-rollout/issue97-worker-proof-worker.ps1',
  status: 'ops/issue97-computer-rollout/issue97-worker-proof-status.ps1',
  provisionLogRoot: 'ops/issue97-computer-rollout/issue97-worker-proof-provision-log-root.ps1',
  serverInspect: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect.ps1',
  serverInspectBootstrap: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-bootstrap.ps1',
  serverInspectWorker: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-worker.ps1',
  serverInspectStatus: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-status.ps1',
  localLaunch: 'ops/issue97-computer-rollout/issue97-worker-proof-local-launch.ps1',
  localBootstrap: 'ops/issue97-computer-rollout/issue97-worker-proof-local-bootstrap.ps1',
  localWorker: 'ops/issue97-computer-rollout/issue97-worker-proof-local-worker.ps1',
  proofSql: 'ops/issue97-computer-rollout/sql/35-worker-proof-read-only.sql',
  inspectSql: 'ops/issue97-computer-rollout/sql/36-worker-proof-server-inspection.sql',
  readme: 'ops/issue97-computer-rollout/README.md',
  attributes: '.gitattributes',
  gitignore: '.gitignore',
};
const source = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, read(value)]));
const manifest = JSON.parse(source.manifest);

function gitBlob(relativePath) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', `HEAD:${relativePath}`], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `git hash-object failed for ${relativePath}: ${result.stderr}`);
  return result.stdout.trim().toLowerCase();
}

const frozenClosureBlobs = new Map([
  ['ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql', 'a9c6ea3ba75976d6a60fb78ffb4c4ff60a168327'],
  ['supabase/tests/issue97_frozen_route_closure_preinstall.sql', '868b85bea10116ed7908efd205581140fb8e2cf1'],
  ['v17/scripts/audit-issue97-frozen-route-closure.mjs', 'cc7c80b5938970bc27f9cbd720fd1115782813de'],
  ['package.json', 'c1ae801bbe78e09a4c9c0854068f320c29cc79d2'],
]);
for (const [file, expected] of frozenClosureBlobs) {
  assert.equal(gitBlob(file), expected, `audited 412-route closure artifact drifted: ${file}`);
}

assert.equal(manifest.schema_version, 2);
assert.equal(manifest.worker_proof_version, 'issue97-long-lived-worker-proof-v2');
assert.equal(manifest.expected_branch, 'data/issue-97-authoritative-road-junction-graph');
assert.equal(manifest.expected_remote_url, 'https://github.com/FrankieJay52/Brinesearch.git');
assert.equal(manifest.expected_service, 'brinesearch_issue97_prod');
assert.equal(manifest.trusted_owner_root, 'C:\\Users\\frank');
assert.equal(
  manifest.private_log_root,
  'C:\\Users\\frank\\.issue97-runs\\issue97-worker-proof',
);
assert.match(manifest.artifact_set_sha256, /^[0-9A-F]{64}$/);
assert.deepEqual(manifest.powershell, {
  path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  version: '5.1.22621.4391',
  sha256: '3247BCFD60F6DD25F34CB74B5889AB10EF1B3EC72B4D4B3D95B5B25B534560B8',
});
assert.equal(manifest.git.version, 'git version 2.55.0.windows.4');
assert.equal(manifest.git.sha256, 'C470D205517C7A53CECA321DF16A6E4549FCD52B576AB4D09536D36F26FDA5A9');
assert.equal(manifest.git.runtime_sha256, 'F83CB7F94F7C714F71ED4976C2C55AB35D80F392881EE586E5A0933424C135E6');
assert.equal(manifest.psql.relative_path, '.tools/postgresql17/bin/psql.exe');
assert.equal(manifest.psql.version, 'psql (PostgreSQL) 17.11');
assert.equal(manifest.psql.sha256, '5BB3FAD8A7FF555ABFF37921A24EE3D9E377C15408B5E7267AA9245596965CA0');
assert.equal(manifest.psql.dlls.length, 29, 'the complete reviewed PostgreSQL bin DLL set must be pinned');
for (const required of ['libpq.dll', 'libintl-9.dll', 'libiconv-2.dll', 'libssl-3-x64.dll', 'libcrypto-3-x64.dll']) {
  expect(manifest.psql.dlls.some((item) => item.relative_path.endsWith(`/${required}`)), `missing DLL pin ${required}`);
}
for (const dll of manifest.psql.dlls) {
  assert.match(dll.relative_path, /^\.tools\/postgresql17\/bin\/[A-Za-z0-9_.-]+\.dll$/);
  assert.match(dll.sha256, /^[0-9A-F]{64}$/);
}

const expectedArtifacts = [
  files.lib,
  files.authorize,
  files.launch,
  files.bootstrap,
  files.worker,
  files.status,
  files.provisionLogRoot,
  files.serverInspect,
  files.serverInspectBootstrap,
  files.serverInspectWorker,
  files.serverInspectStatus,
  files.localLaunch,
  files.localBootstrap,
  files.localWorker,
  files.proofSql,
  files.inspectSql,
];
assert.deepEqual(manifest.artifacts.map((item) => item.path), expectedArtifacts);
for (const artifact of manifest.artifacts) {
  assert.match(artifact.sha256, /^[0-9A-F]{64}$/);
  assert.equal(sha256(bytes(artifact.path)), artifact.sha256, `raw artifact hash drifted: ${artifact.path}`);
}
const artifactSetInput = manifest.artifacts
  .map((item) => `${item.path}=${item.sha256}\n`)
  .sort()
  .join('');
assert.equal(sha256(Buffer.from(artifactSetInput, 'utf8')), manifest.artifact_set_sha256);
expect(source.attributes.includes('issue97-worker-proof-*.ps1 text eol=lf'), 'PowerShell byte pins need LF checkout enforcement');
expect(source.attributes.includes('issue97-worker-proof-manifest.json text eol=lf'), 'manifest bytes need LF checkout enforcement');
expect(/^\.tools\/$/m.test(source.gitignore), 'reviewed local PostgreSQL runtime must stay ignored in a standalone clone');

for (const key of ['authorize', 'launch', 'status', 'provisionLogRoot', 'serverInspect', 'serverInspectStatus', 'localLaunch']) {
  expect(/^param\(\)\s*$/m.test(source[key]), `${key} must accept zero parameters`);
  expect(source[key].includes('$args.Count -ne 0'), `${key} must reject arbitrary arguments`);
}
for (const key of ['worker', 'serverInspectBootstrap', 'serverInspectWorker', 'localWorker']) {
  expect(/^param\(\)\s*$/m.test(source[key]), `${key} must accept zero parameters`);
  expect(source[key].includes('$args.Count -ne 0'), `${key} must reject direct arguments`);
}

for (const name of [
  'PGPASSWORD', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGOPTIONS',
  'PGPASSFILE', 'PGSERVICEFILE', 'PGSYSCONFDIR', 'PGCONNECT_TIMEOUT', 'PGSSLMODE',
  'PGAPPNAME', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DATABASE_URL',
]) {
  expect(source.lib.includes(`'${name}'`), `connection or credential override is not rejected: ${name}`);
}
expect(source.lib.includes('secretNamePattern'), 'generic credential-bearing environment rejection is required');
expect(!source.lib.includes('Get-Issue97GitBlob'), 'runtime artifact trust must not use filter-aware git hashing');
expect(source.lib.includes('Get-Issue97Sha256 -LiteralPath $absolute'), 'runtime artifact trust must hash raw bytes');
expect(source.lib.includes('GIT_CONFIG_NOSYSTEM'), 'system Git config must be disabled');
expect(source.lib.includes('GIT_CONFIG_GLOBAL'), 'global Git config must be disabled');
expect(source.lib.includes('core.attributesfile=NUL'), 'external attribute filters must be disabled');
expect(source.lib.includes('core.hooksPath=NUL'), 'Git hooks must be disabled');
expect(source.lib.includes('expected_remote_url'), 'exact GitHub remote must be verified and fetched');
expect(source.lib.includes('status') && source.lib.includes('--porcelain=v1'), 'clean worktree must be enforced');
expect(source.lib.includes('local HEAD does not equal the fetched Issue #97 remote head'), 'local/remote equality is required');
expect(source.lib.includes('[System.IO.FileMode]::CreateNew'), 'no-clobber marker primitive required');
expect(source.lib.includes('[System.IO.File]::Move($temporaryPath, $LiteralPath)'), 'atomic final receipt rename required');
expect(source.lib.includes('private log path contains a reparse point'), 'private log path must reject reparse points');
expect(source.lib.includes('private log root must not inherit access rules'), 'private log DACL inheritance must fail closed');
expect(source.lib.includes('private log root ACL is not the exact owner/SYSTEM/Administrators contract'), 'private receipts require an owner-exclusive exact DACL');
expect(source.lib.includes('$expectedCommandLine'), 'worker process identity must bind a complete canonical command line');
expect(source.lib.includes('$commandLine.Trim(),'), 'worker command line must reject prefix and suffix arguments');
expect(source.lib.includes('a Git/proxy environment override must be unset before launch'), 'ambient Git/proxy overrides must fail closed');
expect(source.lib.includes('Get-Issue97GitMetadataRoots'), 'Git metadata roots must be resolved before Git runs');
expect(source.lib.includes('reviewed trusted path grants write/delete rights to an untrusted principal'), 'repository/runtime ancestor ACLs must fail closed');
expect(source.lib.includes('reviewed trusted path has an untrusted owner'), 'repository/runtime ancestor ownership must fail closed');
expect(source.lib.includes('artifact-set digest does not match the exact fixed artifact hashes'), 'runtime must recompute the one-shot artifact-set digest');
expect(source.lib.includes('Invoke-Issue97GitFetchWithTimeout'), 'Git fetch must have a fixed wall-clock bound');
expect(source.authorize.includes('authorized_repo_sha = $repoSha'), 'owner-protected authorization must bind one exact fetched SHA');
expect(source.authorize.includes('mapping_rehearsal_authorized = $false'), 'authorization receipt must exclude mapping rehearsal');
expect(source.launch.includes('authorization.json'), 'production launcher must require the exact-SHA authorization receipt');
expect(source.localLaunch.includes('authorization.json'), 'local launcher must require the exact-SHA authorization receipt');

expect(source.launch.includes("'production.launch.json'"), 'global one-shot launch claim must be fixed across SHA/artifact changes');
expect(source.launch.includes("'production.attempt.json'"), 'production attempt path must be globally fixed');
expect(source.launch.includes('[System.IO.File]::Move($temporaryClaim, $claimPath)'), 'launch claim must publish atomically');
expect(source.launch.includes('-PassThru -WindowStyle Hidden'), 'launcher must use Start-Process -PassThru');
expect(source.launch.includes('issue97-worker-proof-bootstrap.ps1'), 'launcher must start only the fixed bootstrap');
expect(!source.launch.includes('Invoke-CimMethod'), 'launcher itself must not create the long-lived worker');
expect(source.bootstrap.includes('Invoke-CimMethod -ClassName Win32_Process -MethodName Create'), 'fixed bootstrap must create the breakaway worker through WMI');
expect(source.bootstrap.includes('issue97-worker-proof-worker.ps1'), 'production bootstrap must pin the production worker');
expect(source.bootstrap.includes("$workerProcess.StartTime.ToUniversalTime().ToString('o')"), 'bootstrap must attest the WMI worker process start time');
expect(source.bootstrap.includes('Write-Issue97JsonAtomicNoClobber -LiteralPath $spawnPath'), 'bootstrap spawn receipt must publish atomically/no-clobber');
expect(source.bootstrap.includes('production launch claim does not bind the manifest bytes'), 'bootstrap must bind manifest bytes before trusted execution');
expect(source.bootstrap.includes('production launch claim does not bind bootstrap artifacts'), 'bootstrap must bind worker/library bytes to the protected claim');
expect(!source.launch.includes('pg_stat_activity'), 'short launcher must not own a database precheck');
expect(!source.launch.includes('--file='), 'short launcher must not launch psql');
expect(!source.launch.includes('-Wait'), 'short launcher must not wait for the long-lived worker');
expect(!source.launch.includes('Assert-Issue97RepositoryCheckpoint'), 'short launcher must not own Git/network preflight');
expect(!source.launch.includes('Assert-Issue97PostgreSQLRuntime'), 'short launcher must not own PostgreSQL runtime preflight');
expect(source.bootstrap.includes('Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch'), 'detached bootstrap must verify branch, clean worktree, and fetched exact head');
expect(source.bootstrap.includes('Assert-Issue97PostgreSQLRuntime -RepoRoot $repoRoot -Manifest $manifest'), 'detached bootstrap must validate the full reviewed PostgreSQL runtime');

expect(source.worker.includes('Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch'), 'detached worker must fetch and verify branch/head/clean state');
expect(source.worker.includes('attempt does not bind the current manifest bytes'), 'worker must bind manifest bytes before loading the library');
expect(source.worker.includes('attempt does not bind the current worker/library bytes'), 'worker must bind its executable/library bytes before dot-sourcing');
expect(source.worker.includes("$stage = 'prepare_private_host_logs'"), 'worker must reserve distinct private host logs');
expect(!source.worker.includes('Issue97NativeHandles'), 'the WMI-created worker must not mutate inherited console handles');
expect(source.worker.includes('worker spawn receipt mismatch'), 'worker must bind the WMI-created PID');
expect(source.worker.includes('attempt contains a noncanonical fixed path'), 'every attempt-supplied path must match a derived path');
expect(source.worker.includes("$fixedSqlPath = Join-Path $repoRoot 'ops\\issue97-computer-rollout\\sql\\35-worker-proof-read-only.sql'"), 'fixed SQL path must be derived internally');
expect(source.worker.includes('Write-Issue97TextNoClobber -LiteralPath $executionSqlPath -Text $sqlText'), 'worker must execute a no-clobber copy of reviewed SQL bytes');
expect(source.worker.includes('private reviewed SQL execution copy mismatch'), 'execution-copy hash must be rechecked');
expect(source.worker.includes('[System.IO.FileShare]::Read'), 'reviewed SQL bytes must remain write-locked while psql reads them');
expect(source.worker.includes("$env:PGCONNECT_TIMEOUT = '10'"), 'fixed connection timeout required');
expect(source.worker.includes('$env:PGSERVICE = [string]$manifest.expected_service'), 'WMI worker must set only the fixed reviewed service name');
expect(source.worker.includes('$client.WaitForExit(45000)'), 'client wall-clock bound required');
assert.equal(occurrences(source.worker, /\$client\s*=\s*Start-Process/g), 1, 'worker may start exactly one psql client');
expect(source.worker.includes('-X --no-psqlrc --set=ON_ERROR_STOP=1'), 'reviewed psql flags required');
expect(source.worker.includes('--set=issue97_expected_pgappname=$([string]$attempt.pgappname)'), 'worker must pass its receipt-bound PGAPPNAME into fixed SQL');
expect(source.lib.includes('actualDlls.Count -ne $expectedDlls.Count'), 'complete local DLL set must be exact');
expect(source.worker.includes('Assert-Issue97PostgreSQLRuntime -RepoRoot $repoRoot -Manifest $manifest'), 'worker must revalidate the full PostgreSQL runtime');
expect(source.worker.includes('server_inspection_required = (-not $success)'), 'every production failure must require server inspection');
expect(!/retry/i.test(source.worker), 'worker must contain no retry path');
expect(source.worker.includes('client_duration_seconds'), 'five-second duration evidence required');
expect(source.worker.includes('executed_sql_sha256'), 'executed SQL hash receipt required');
expect(source.worker.includes('stdout_sha256') && source.worker.includes('stderr_sha256'), 'distinct log hashes required');
expect(source.worker.includes("'production.client.json'"), 'production worker must persist the reviewed psql PID/start receipt');
expect(source.worker.includes('client_process_start_utc'), 'production final receipt must bind the psql process start time');

const allowedStates = [
  'NOT_STARTED', 'RUNNING', 'CLIENT_FINISHED_SUCCESS', 'CLIENT_FINISHED_FAILURE',
  'WORKER_DISAPPEARED_WITHOUT_RECEIPT', 'RECEIPT_INVALID', 'SERVER_INSPECTION_REQUIRED',
];
for (const state of allowedStates) expect(source.status.includes(`'${state}'`), `status missing ${state}`);
expect(!/Start-Process|Stop-Process|Remove-Item/i.test(source.status), 'status must only read local state');
expect(!source.status.includes('Get-ChildItem -LiteralPath $logRoot -Filter'), 'status must not select a wildcard/latest marker');
expect(source.status.includes('production_read_only_pg_sleep_proof'), 'production marker must require the production job kind');
expect(source.status.includes('local_detached_process_proof'), 'local marker must require the local job kind');
expect(source.status.includes('Test-Issue97WorkerProcessIdentity'), 'status must reject stale PID reuse and extra arguments');
expect(source.status.includes('client_duration_seconds -ge 5.0'), 'production success needs measured duration');
expect(source.status.includes('server_inspection_required'), 'ambiguous production results must require server inspection');
expect(source.status.includes('Write-Issue97UnsafeReceiptState'), 'malformed production receipts must require server inspection');
expect(source.status.includes('Get-Issue97FinalReceiptDisposition'), 'status must use the tested PowerShell disposition function');
expect(source.provisionLogRoot.includes('Assert-Issue97PrivateLogRoot') && source.provisionLogRoot.includes('-Create'), 'private log root needs an explicit reviewed provisioner');
expect(source.serverInspect.includes("'production.attempt.json'"), 'server inspector must bind the fixed production attempt');
expect(source.serverInspect.includes('Start-Process') && source.serverInspect.includes('-PassThru -WindowStyle Hidden'), 'server inspector launcher must detach promptly');
expect(!source.serverInspect.includes('--file='), 'short server inspector launcher must not own psql');
expect(source.serverInspect.includes('issue97-worker-proof-server-inspect-bootstrap.ps1'), 'short inspector launcher must start only its fixed bootstrap');
expect(!source.serverInspect.includes('Invoke-CimMethod'), 'short inspector launcher must not own the WMI worker spawn');
expect(source.serverInspectBootstrap.includes('Invoke-CimMethod -ClassName Win32_Process -MethodName Create'), 'inspection bootstrap must create the long-lived worker through WMI');
expect(source.serverInspectBootstrap.includes('server-inspection claim does not bind bootstrap artifacts'), 'inspection bootstrap must bind its executable bytes before trusted execution');
expect(source.serverInspectBootstrap.includes('Write-Issue97JsonAtomicNoClobber -LiteralPath $spawnPath'), 'inspection bootstrap must publish its worker receipt atomically');
expect(source.serverInspectWorker.includes('issue97_target_pgappname'), 'server inspector worker must query the exact receipt-bound PGAPPNAME');
expect(source.serverInspectWorker.includes('$client.WaitForExit(45000)'), 'server inspector worker needs a finite wall-clock bound');
expect(source.serverInspectWorker.includes('production proof bootstrap/worker lifecycle is still active'), 'server inspector must reject a still-live proof lifecycle');
expect(source.serverInspectWorker.includes('a reviewed PostgreSQL client process from the proof lane is still active'), 'server inspector must reject an orphaned reviewed psql client');
expect(source.serverInspectWorker.includes('a reviewed PostgreSQL client remains after the server inspection'), 'server inspector must recheck the reviewed client process after SQL');
expect(source.serverInspectWorker.includes('execution copy mismatch'), 'server inspector must re-hash its exact SQL execution copy');
expect(source.serverInspectWorker.includes('executed_sql_sha256'), 'server inspector final receipt must bind executed SQL');
expect(source.serverInspectWorker.includes('final_marker_present') && source.serverInspectWorker.includes('rollback_present'), 'server inspector final receipt must bind PASS/ROLLBACK');
expect(!/Start-Process|Stop-Process|Remove-Item/i.test(source.serverInspectStatus), 'server-inspection status must only read local state');
expect(source.serverInspectStatus.includes('CLIENT_FINISHED_SUCCESS'), 'server-inspection status needs a validated success state');
expect(source.serverInspectWorker.includes("production.bootstrap-final.json"), 'server inspection must require the production bootstrap terminal receipt');
expect(source.serverInspectWorker.includes('production proof bootstrap has no terminal receipt'), 'server inspection must fail before a terminal production bootstrap receipt exists');
expect(source.serverInspectWorker.includes('production proof bootstrap lifecycle receipts disagree'), 'server inspection must bind bootstrap process and terminal receipts');
expect(source.serverInspectWorker.includes('production proof bootstrap PID remains active or has become ambiguous'), 'server inspection must reject an active or reused bootstrap PID');
expect(source.serverInspectWorker.includes('server-inspection bootstrap lifecycle receipts disagree'), 'inspection worker must wait for its own detached bootstrap to terminate');
expect(source.serverInspect.includes('the one-shot server inspection was already claimed'), 'server inspector must never retry');

expect(source.localWorker.includes('Start-Sleep -Seconds 7'), 'local worker must outlive five seconds');
expect(source.localWorker.includes('ISSUE97_LOCAL_WORKER_PASS'), 'local proof marker required');
expect(!/psql|PGSERVICE/i.test(source.localWorker), 'local worker must not access PostgreSQL');
expect(source.localLaunch.includes('-PassThru -WindowStyle Hidden'), 'local launcher must use Start-Process -PassThru');
expect(source.localLaunch.includes('issue97-worker-proof-local-bootstrap.ps1'), 'local launcher must use the fixed local bootstrap');
expect(!source.localLaunch.includes('Assert-Issue97RepositoryCheckpoint'), 'short local launcher must not own Git/network preflight');
expect(source.localBootstrap.includes('Invoke-CimMethod -ClassName Win32_Process -MethodName Create'), 'local proof must use the same WMI breakaway architecture');
expect(source.localBootstrap.includes("$workerProcess.StartTime.ToUniversalTime().ToString('o')"), 'local bootstrap must attest process start time');
expect(source.localBootstrap.includes('Write-Issue97JsonAtomicNoClobber -LiteralPath $spawnPath'), 'local spawn receipt must publish atomically');
expect(source.localBootstrap.includes('Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch'), 'detached local bootstrap must bind the clean fetched checkpoint');
expect(source.localWorker.includes('Assert-Issue97RepositoryCheckpoint -RepoRoot $repoRoot -Manifest $manifest -Fetch'), 'local worker must revalidate the clean fetched checkpoint');
expect(source.status.includes('worker_receipt_pending = $true'), 'status must report a spawned worker as RUNNING before its worker receipt arrives');
expect(source.status.includes('worker_spawn_pending = $true'), 'status must preserve RUNNING during the bound bootstrap-to-worker spawn gap');
expect(source.serverInspectStatus.includes('spawn_receipt_pending = $true'), 'inspection status must preserve a short bound claim-to-spawn transition');

const proofSql = source.proofSql.replaceAll('\r\n', '\n').trim();
const closureSql = read('ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql')
  .replaceAll('\r\n', '\n');
const pairPattern = /\('([0-9a-f-]{36})'::uuid,'([0-9a-f-]{36})'::uuid\)/g;
const frozenPairBlock = closureSql.slice(
  closureSql.indexOf('target_pairs(identity_id,road_id) as ('),
  closureSql.indexOf('-- EXACT_REPLACED_GRAPHS_BEGIN'),
);
const expectedFrozenPairs = [...frozenPairBlock.matchAll(pairPattern)]
  .map((match) => `${match[1]}:${match[2]}`)
  .sort();
assert.equal(expectedFrozenPairs.length, 46, 'audited closure must expose exactly 46 frozen identity/road pairs');
for (const [label, sql] of [['proof', proofSql], ['inspection', source.inspectSql.replaceAll('\r\n', '\n')]]) {
  const start = sql.indexOf('frozen_mapping_pairs(identity_id, road_id) as (');
  const end = sql.indexOf('select (pg_catalog.count(*) = 0)::integer as issue97_frozen_mapping_rows_zero', start);
  expect(start >= 0 && end > start, `${label} SQL must contain the exact frozen-mapping guard`);
  const actualPairs = [...sql.slice(start, end).matchAll(pairPattern)]
    .map((match) => `${match[1]}:${match[2]}`)
    .sort();
  assert.deepEqual(actualPairs, expectedFrozenPairs, `${label} SQL frozen mapping set drifted from the audited 46 pairs`);
  expect(sql.includes('target.identity_id = mapping.identity_id or target.road_id = mapping.road_id'),
    `${label} SQL must reject mappings on either frozen identity or frozen Road Manager family`);
}
assert.equal(occurrences(proofSql, /^begin\b/gim), 1, 'proof SQL must have one BEGIN');
assert.equal(occurrences(proofSql, /^rollback\s*;/gim), 1, 'proof SQL must have one ROLLBACK');
assert.equal(occurrences(proofSql, /^commit\b/gim), 0, 'proof SQL must have zero COMMIT');
expect(proofSql.includes('begin isolation level repeatable read read only;'), 'proof transaction must be repeatable-read/read-only');
expect(proofSql.includes("set local statement_timeout = '30s';"), '30-second statement timeout required');
expect(proofSql.includes("set local lock_timeout = '2s';"), 'two-second lock timeout required');
assert.equal(occurrences(proofSql, /pg_catalog\.pg_sleep\(5\)/g), 1, 'exact five-second sleep required');
assert.equal(occurrences(proofSql, /ISSUE97_WORKER_PROOF_PASS/g), 1, 'one final PASS marker required');
expect(proofSql.includes("current_database() = 'postgres'"), 'proof must pin the database identity');
expect(proofSql.includes("version = '20260817193212'"), 'proof must require the mapping migration absent');
expect(proofSql.includes('ISSUE97_WORKER_PROOF_FROZEN_MAPPINGS_CHANGED'), 'proof must require all frozen identity/family mappings absent');
expect(proofSql.includes('c41f5320-1273-470c-a316-28b42211d697'), 'proof must pin the Ohio manifest');
expect(proofSql.includes("current_setting('application_name') = :'issue97_expected_pgappname'"), 'proof SQL must assert the exact receipt-bound PGAPPNAME');
expect(proofSql.includes('pg_catalog.pg_stat_activity'), 'proof must reject a competing backend');
for (const lockName of ['ohio-state-release', 'all-pad-routing-pipeline', 'route-corpus', 'saved-road-reconciliation', 'mapping-refresh']) {
  expect(proofSql.includes(lockName), `proof must take the established ${lockName} lock`);
}
expect(proofSql.includes('pg_try_advisory_xact_lock(9700350001::bigint)'), 'proof must take the proof-specific transaction-local advisory lock');
expect(proofSql.includes('= 806'), 'proof must pin the Ohio active receipt count');
expect(proofSql.includes('= 38'), 'proof must pin 38/38 Ohio source currentness');
expect(proofSql.includes("status = 'staging'"), 'proof must pin staging to zero');
expect(proofSql.includes("state_code in ('WV', 'PA')"), 'proof must pin WV/PA r2 work to zero');
expect(proofSql.includes('ISSUE97_WORKER_PROOF_WRONG_OR_UNSAFE_TARGET'), 'wrong-target fail-stop marker required');
const proofSqlExecutableTokens = proofSql.replace(/'(?:''|[^'])*'/g, "''");
expect(!/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|reindex|cluster)\b/i.test(proofSqlExecutableTokens), 'proof SQL contains DDL/DML or a write-capable block');
expect(!/brinesearch_issue97_(rebuild|refresh|reconcile|activate|google)/i.test(proofSql), 'proof SQL calls an Issue #97 mutation path');
const inspectSql = source.inspectSql.replaceAll('\r\n', '\n').trim();
assert.equal(occurrences(inspectSql, /^begin\b/gim), 1, 'inspection SQL must have one BEGIN');
assert.equal(occurrences(inspectSql, /^rollback\s*;/gim), 1, 'inspection SQL must have one ROLLBACK');
assert.equal(occurrences(inspectSql, /^commit\b/gim), 0, 'inspection SQL must have zero COMMIT');
expect(inspectSql.includes(":'issue97_target_pgappname'"), 'inspection SQL must match the exact receipt-bound PGAPPNAME');
expect(inspectSql.includes('ISSUE97_WORKER_PROOF_SERVER_INSPECTION_PASS'), 'inspection SQL needs a fixed final marker');
const inspectSqlExecutableTokens = inspectSql.replace(/'(?:''|[^'])*'/g, "''");
expect(!/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|reindex|cluster)\b/i.test(inspectSqlExecutableTokens), 'inspection SQL contains DDL/DML');

expect(source.readme.includes('Fixed Windows worker proof (not a job runner)'), 'README must define the narrow lane');
expect(/does not authorize the frozen mapping\s+rehearsal/.test(source.readme), 'README must preserve the authorization boundary');

function classify({ marker = true, pid = true, process = 'missing', kind = 'production', final = null }) {
  if (!marker) return 'NOT_STARTED';
  if (!pid) return 'RECEIPT_INVALID';
  if (process === 'matching') return 'RUNNING';
  if (process === 'mismatch') return kind === 'production' ? 'SERVER_INSPECTION_REQUIRED' : 'RECEIPT_INVALID';
  if (!final) return 'WORKER_DISAPPEARED_WITHOUT_RECEIPT';
  const bound = final.sameKind && final.sameAttempt && final.samePid && final.sameStart && final.samePgapp && final.logHashes;
  if (!bound) return 'RECEIPT_INVALID';
  if (kind === 'production' && final.serverInspection) return 'SERVER_INSPECTION_REQUIRED';
  const success = final.success && final.exitCode === 0 && final.pass && final.rollback && final.commits === 0 && final.duration >= 5;
  if (success) return 'CLIENT_FINISHED_SUCCESS';
  if (kind === 'production') return 'SERVER_INSPECTION_REQUIRED';
  if (final.success) return 'RECEIPT_INVALID';
  return 'CLIENT_FINISHED_FAILURE';
}
const good = {
  sameKind: true, sameAttempt: true, samePid: true, sameStart: true, samePgapp: true,
  logHashes: true, serverInspection: false, success: true, exitCode: 0, pass: true,
  rollback: true, commits: 0, duration: 5.1,
};
assert.equal(classify({ marker: false }), 'NOT_STARTED');
assert.equal(classify({ pid: false }), 'RECEIPT_INVALID');
assert.equal(classify({ process: 'matching' }), 'RUNNING');
assert.equal(classify({ process: 'mismatch' }), 'SERVER_INSPECTION_REQUIRED');
assert.equal(classify({ process: 'missing' }), 'WORKER_DISAPPEARED_WITHOUT_RECEIPT');
assert.equal(classify({ final: good }), 'CLIENT_FINISHED_SUCCESS');
for (const mutation of [
  { sameKind: false }, { sameAttempt: false }, { samePid: false }, { sameStart: false },
  { samePgapp: false }, { logHashes: false },
]) {
  assert.equal(classify({ final: { ...good, ...mutation } }), 'RECEIPT_INVALID');
}
for (const mutation of [{ exitCode: 1 }, { pass: false }, { rollback: false }, { commits: 1 }, { duration: 4.9 }]) {
  assert.equal(classify({ final: { ...good, ...mutation } }), 'SERVER_INSPECTION_REQUIRED');
}
assert.equal(classify({ final: { ...good, success: false, serverInspection: true } }), 'SERVER_INSPECTION_REQUIRED');
assert.equal(classify({ final: { ...good, success: false, serverInspection: false } }), 'SERVER_INSPECTION_REQUIRED');
assert.equal(classify({ kind: 'local', final: { ...good, success: false } }), 'CLIENT_FINISHED_FAILURE');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'issue97-worker-proof-'));
try {
  const marker = path.join(tempRoot, 'attempt.json');
  fs.closeSync(fs.openSync(marker, 'wx'));
  assert.throws(() => fs.openSync(marker, 'wx'), /EEXIST/, 'second atomic marker claim must fail');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (process.platform === 'win32') {
  const powerShell = manifest.powershell.path;
  for (const script of [files.lib, files.authorize, files.launch, files.bootstrap, files.worker, files.status,
    files.provisionLogRoot, files.serverInspect, files.serverInspectBootstrap, files.serverInspectWorker, files.serverInspectStatus,
    files.localLaunch, files.localBootstrap, files.localWorker]) {
    const absolute = path.join(root, script);
    const command = `$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${absolute.replaceAll("'", "''")}',[ref]$null,[ref]$errors)|Out-Null; if($errors.Count){$errors|ForEach-Object{$_.Message}; exit 1}`;
    const parsed = spawnSync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    assert.equal(parsed.status, 0, `PowerShell parse failed for ${script}: ${parsed.stdout}${parsed.stderr}`);
  }
  const forbiddenArgument = spawnSync(powerShell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, files.launch), 'forbidden',
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, PGSERVICE: 'brinesearch_issue97_prod' } });
  assert.notEqual(forbiddenArgument.status, 0, 'production launcher must reject arguments');
  const secret = 'ISSUE97_SECRET_MUST_NOT_PRINT';
  const credentialFailure = spawnSync(powerShell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, files.launch),
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, PGSERVICE: 'brinesearch_issue97_prod', PGPASSWORD: secret } });
  assert.notEqual(credentialFailure.status, 0, 'production launcher must reject credential environment');
  expect(!(credentialFailure.stdout + credentialFailure.stderr).includes(secret), 'credential value leaked to launcher output');

  const quotePs = (value) => `'${value.replaceAll("'", "''")}'`;
  const secureDirectory = (directory) => {
    const command = [
      `$p=${quotePs(directory)}`,
      '$id=[Security.Principal.WindowsIdentity]::GetCurrent().Name',
      '$a=New-Object Security.AccessControl.DirectorySecurity',
      '$a.SetOwner((New-Object Security.Principal.NTAccount($id)))',
      '$a.SetAccessRuleProtection($true,$false)',
      '$i=[Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit',
      "foreach($n in @($id,'NT AUTHORITY\\SYSTEM','BUILTIN\\Administrators')){$r=New-Object Security.AccessControl.FileSystemAccessRule($n,[Security.AccessControl.FileSystemRights]::FullControl,$i,[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow);[void]$a.AddAccessRule($r)}",
      '(Get-Item -LiteralPath $p -Force).SetAccessControl($a)',
    ].join(';');
    const result = spawnSync(powerShell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    assert.equal(result.status, 0, `unable to secure actual-status fixture: ${result.stdout}${result.stderr}`);
  };
  const actualStatusRoot = fs.mkdtempSync(path.join(manifest.trusted_owner_root, 'issue97-worker-status-fixture-'));
  try {
    secureDirectory(actualStatusRoot);
    const fixtureRepo = path.join(actualStatusRoot, 'repo');
    const fixtureLogs = path.join(actualStatusRoot, 'logs');
    fs.mkdirSync(fixtureLogs, { recursive: true });
    secureDirectory(fixtureLogs);
    for (const artifact of manifest.artifacts) {
      const destination = path.join(fixtureRepo, artifact.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, artifact.path), destination);
    }
    const fixtureManifest = { ...manifest, private_log_root: fixtureLogs };
    const fixtureManifestPath = path.join(fixtureRepo, files.manifest);
    fs.mkdirSync(path.dirname(fixtureManifestPath), { recursive: true });
    const fixtureManifestBytes = Buffer.from(`${JSON.stringify(fixtureManifest, null, 2)}\n`);
    fs.writeFileSync(fixtureManifestPath, fixtureManifestBytes);
    const attemptId = 'issue97-local-20260818T000000000Z-deadbeef';
    const pgappname = 'local-only-no-database-deadbeef';
    const markerPath = path.join(fixtureLogs, 'local.attempt.json');
    const spawnPath = path.join(fixtureLogs, 'local.spawn.json');
    const pidPath = path.join(fixtureLogs, 'local.pid.json');
    const finalPath = path.join(fixtureLogs, 'local.final.json');
    const stdoutPath = path.join(fixtureLogs, `${attemptId}.local.stdout.log`);
    const stderrPath = path.join(fixtureLogs, `${attemptId}.local.stderr.log`);
    const hostStdout = path.join(fixtureLogs, `${attemptId}.worker.stdout.log`);
    const hostStderr = path.join(fixtureLogs, `${attemptId}.worker.stderr.log`);
    const copiedWorker = path.join(fixtureRepo, files.localWorker);
    const copiedBootstrap = path.join(fixtureRepo, files.localBootstrap);
    const repoSha = 'a'.repeat(40);
    const authorizationPath = path.join(fixtureLogs, 'authorization.json');
    const authorization = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      authorized_repo_sha: repoSha,
      branch: manifest.expected_branch,
      artifact_set_sha256: manifest.artifact_set_sha256,
      manifest_sha256: sha256(fixtureManifestBytes),
      artifact_hashes: Object.fromEntries(manifest.artifacts.map((item) => [item.path, item.sha256])),
      authorized_utc: '2026-08-18T00:00:00.0000000Z',
      local_proof_authorized: true,
      production_read_only_proof_authorized: true,
      mapping_rehearsal_authorized: false,
    };
    const authorizationBytes = Buffer.from(`${JSON.stringify(authorization, null, 2)}\n`);
    fs.writeFileSync(authorizationPath, authorizationBytes);
    const processStart = '2026-08-18T00:00:00.0000000Z';
    const missingPid = 2147483000;
    const attempt = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      job_kind: 'local_detached_process_proof',
      attempt_id: attemptId,
      repo_sha: repoSha,
      branch: manifest.expected_branch,
      utc_start: processStart,
      pgappname,
      worker_spawn_receipt_path: spawnPath,
      worker_pid_receipt_path: pidPath,
      stdout_path: stdoutPath,
      stderr_path: stderrPath,
      worker_host_stdout_path: hostStdout,
      worker_host_stderr_path: hostStderr,
      final_status_path: finalPath,
      artifact_set_sha256: manifest.artifact_set_sha256,
      manifest_sha256: authorization.manifest_sha256,
      authorization_path: authorizationPath,
      authorization_sha256: sha256(authorizationBytes),
      worker_script: copiedWorker,
      bootstrap_script: copiedBootstrap,
    };
    const spawn = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      job_kind: attempt.job_kind,
      attempt_id: attemptId,
      repo_sha: repoSha,
      worker_pid: missingPid,
      process_start_utc: processStart,
      created_utc: processStart,
    };
    const pidReceipt = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      attempt_id: attemptId,
      repo_sha: repoSha,
      pid: missingPid,
      process_start_utc: processStart,
      executable_path: manifest.powershell.path,
      worker_script: copiedWorker,
      pgappname,
    };
    const stdout = 'ISSUE97_LOCAL_WORKER_PASS\n';
    const stderr = '';
    const goodFinal = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      job_kind: attempt.job_kind,
      attempt_id: attemptId,
      repo_sha: repoSha,
      pid: missingPid,
      process_start_utc: processStart,
      pgappname,
      worker_start_utc: processStart,
      worker_end_utc: '2026-08-18T00:00:07.0000000Z',
      client_started: false,
      client_confirmed_finished: true,
      client_duration_seconds: 0,
      worker_duration_seconds: 7,
      exit_code: 0,
      final_marker_present: true,
      rollback_present: false,
      commit_count: 0,
      stdout_sha256: sha256(Buffer.from(stdout)),
      stderr_sha256: sha256(Buffer.from(stderr)),
      server_inspection_required: false,
      success: true,
      failure_code: null,
    };
    const writeJson = (target, value) => fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
    const resetGood = () => {
      writeJson(markerPath, attempt);
      writeJson(spawnPath, spawn);
      writeJson(pidPath, pidReceipt);
      writeJson(finalPath, goodFinal);
      fs.writeFileSync(stdoutPath, stdout);
      fs.writeFileSync(stderrPath, stderr);
      fs.writeFileSync(hostStdout, '');
      fs.writeFileSync(hostStderr, '');
    };
    let lastStatusOutput = '';
    const runStatus = () => {
      const result = spawnSync(powerShell, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(fixtureRepo, files.status),
      ], { cwd: fixtureRepo, encoding: 'utf8' });
      assert.equal(result.status, 0, `actual status fixture failed: ${result.stdout}${result.stderr}`);
      lastStatusOutput = `${result.stdout}${result.stderr}`;
      const match = result.stdout.match(/^STATE=([A-Z_]+)$/m);
      assert.ok(match, `actual status fixture omitted state: ${result.stdout}`);
      return match[1];
    };
    resetGood();
    assert.equal(runStatus(), 'CLIENT_FINISHED_SUCCESS', lastStatusOutput);
    writeJson(finalPath, { ...goodFinal, process_start_utc: '2026-08-18T00:00:01.0000000Z' });
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'actual status must reject a stale/wrong process start');
    resetGood();
    writeJson(pidPath, { ...pidReceipt, pid: missingPid - 1 });
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'actual status must reject a wrong worker PID');
    resetGood();
    writeJson(pidPath, { ...pidReceipt, pgappname: 'local-only-no-database-cafebabe' });
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'actual status must reject a wrong PGAPPNAME');
    resetGood();
    writeJson(markerPath, { ...attempt, job_kind: 'production_read_only_pg_sleep_proof' });
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'local marker must reject a production job kind');
    resetGood();
    fs.writeFileSync(finalPath, '{');
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'actual status must reject malformed final JSON');
    resetGood();
    fs.writeFileSync(stdoutPath, 'tampered\n');
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'actual status must reject a log hash mutation');
    resetGood();
    writeJson(finalPath, {
      ...goodFinal,
      success: false,
      exit_code: 80,
      final_marker_present: false,
      failure_code: 'synthetic_local_failure',
    });
    assert.equal(runStatus(), 'CLIENT_FINISHED_FAILURE', 'actual status must preserve an explicit local failure');
    resetGood();
    writeJson(finalPath, { ...goodFinal, worker_duration_seconds: 4.9 });
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'claimed success must satisfy the complete duration contract');
    resetGood();
    fs.writeFileSync(pidPath, '{');
    assert.equal(runStatus(), 'RECEIPT_INVALID', 'actual status must reject a partial/malformed PID receipt');
    resetGood();
    fs.rmSync(finalPath);
    assert.equal(runStatus(), 'WORKER_DISAPPEARED_WITHOUT_RECEIPT');
    for (const target of [markerPath, spawnPath, pidPath, finalPath, stdoutPath, stderrPath, hostStdout, hostStderr]) {
      fs.rmSync(target, { force: true });
    }
    const productionAttemptId = 'issue97-wp-20260818T000000000Z-deadbeef';
    const productionPgapp = 'brinesearch-i97-wp-20260818000000-deadbeef';
    const productionSpawn = path.join(fixtureLogs, 'production.spawn.json');
    const productionPid = path.join(fixtureLogs, 'production.pid.json');
    const productionClient = path.join(fixtureLogs, 'production.client.json');
    const productionFinal = path.join(fixtureLogs, 'production.final.json');
    const productionStdout = path.join(fixtureLogs, `${productionAttemptId}.psql.stdout.log`);
    const productionStderr = path.join(fixtureLogs, `${productionAttemptId}.psql.stderr.log`);
    const productionHostStdout = path.join(fixtureLogs, `${productionAttemptId}.worker.stdout.log`);
    const productionHostStderr = path.join(fixtureLogs, `${productionAttemptId}.worker.stderr.log`);
    const productionAttempt = {
      ...attempt,
      job_kind: 'production_read_only_pg_sleep_proof',
      attempt_id: productionAttemptId,
      pgappname: productionPgapp,
      worker_spawn_receipt_path: productionSpawn,
      worker_pid_receipt_path: productionPid,
      client_pid_receipt_path: productionClient,
      stdout_path: productionStdout,
      stderr_path: productionStderr,
      worker_host_stdout_path: productionHostStdout,
      worker_host_stderr_path: productionHostStderr,
      final_status_path: productionFinal,
      worker_script: path.join(fixtureRepo, files.worker),
      bootstrap_script: path.join(fixtureRepo, files.bootstrap),
    };
    const productionMarker = path.join(fixtureLogs, 'production.attempt.json');
    writeJson(productionMarker, productionAttempt);
    assert.equal(runStatus(), 'SERVER_INSPECTION_REQUIRED', 'missing production spawn receipt is ambiguous');
    writeJson(productionMarker, { ...productionAttempt, job_kind: 'local_detached_process_proof' });
    assert.equal(runStatus(), 'SERVER_INSPECTION_REQUIRED', 'production marker/job mismatch is ambiguous');
    writeJson(productionMarker, productionAttempt);
    const productionSpawnReceipt = {
      ...spawn,
      job_kind: productionAttempt.job_kind,
      attempt_id: productionAttemptId,
    };
    const productionPidReceipt = {
      ...pidReceipt,
      attempt_id: productionAttemptId,
      worker_script: productionAttempt.worker_script,
      pgappname: productionPgapp,
    };
    const productionOutput = 'ISSUE97_WORKER_PROOF_PASS\nROLLBACK\n';
    const productionError = '';
    const productionSuccessFinal = {
      ...goodFinal,
      job_kind: productionAttempt.job_kind,
      attempt_id: productionAttemptId,
      pgappname: productionPgapp,
      client_pid: missingPid - 3,
      client_process_start_utc: '2026-08-18T00:00:02.0000000Z',
      client_started: true,
      client_confirmed_finished: true,
      client_duration_seconds: 5.1,
      worker_duration_seconds: 7,
      rollback_present: true,
      stdout_sha256: sha256(Buffer.from(productionOutput)),
      stderr_sha256: sha256(Buffer.from(productionError)),
      executed_sql_sha256: manifest.artifacts.find((item) => item.path === files.proofSql).sha256,
      psql_sha256: manifest.psql.sha256,
    };
    writeJson(productionSpawn, productionSpawnReceipt);
    writeJson(productionPid, productionPidReceipt);
    writeJson(productionClient, {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      job_kind: productionAttempt.job_kind,
      attempt_id: productionAttemptId,
      repo_sha: repoSha,
      pgappname: productionPgapp,
      pid: missingPid - 3,
      process_start_utc: '2026-08-18T00:00:02.0000000Z',
      executable_path: path.join(fixtureRepo, manifest.psql.relative_path),
      execution_sql_path: path.join(fixtureLogs, `${productionAttemptId}.reviewed.sql`),
    });
    fs.writeFileSync(productionStdout, productionOutput);
    fs.writeFileSync(productionStderr, productionError);
    fs.writeFileSync(productionHostStdout, '');
    fs.writeFileSync(productionHostStderr, '');
    writeJson(productionFinal, productionSuccessFinal);
    assert.equal(runStatus(), 'CLIENT_FINISHED_SUCCESS', 'actual production success contract must pass');
    writeJson(productionFinal, {
      ...productionSuccessFinal,
      success: false,
      exit_code: 1,
      final_marker_present: false,
      server_inspection_required: false,
      failure_code: 'synthetic_production_failure',
    });
    assert.equal(runStatus(), 'SERVER_INSPECTION_REQUIRED', 'every production failure requires server inspection');

    const inspectionAttemptId = 'issue97-inspect-20260818T000010000Z';
    const inspectionClaimPath = path.join(fixtureLogs, 'server-inspection.launch.json');
    const inspectionBootstrapReceiptPath = path.join(fixtureLogs, 'server-inspection.bootstrap.json');
    const inspectionBootstrapFinalPath = path.join(fixtureLogs, 'server-inspection.bootstrap-final.json');
    const inspectionSpawnPath = path.join(fixtureLogs, 'server-inspection.spawn.json');
    const inspectionPidPath = path.join(fixtureLogs, 'server-inspection.pid.json');
    const inspectionFinalPath = path.join(fixtureLogs, 'server-inspection.final.json');
    const inspectionStdoutPath = path.join(fixtureLogs, 'server-inspection.stdout.log');
    const inspectionStderrPath = path.join(fixtureLogs, 'server-inspection.stderr.log');
    const inspectionHostStdoutPath = path.join(fixtureLogs, 'server-inspection.worker.stdout.log');
    const inspectionHostStderrPath = path.join(fixtureLogs, 'server-inspection.worker.stderr.log');
    const inspectionWorker = path.join(fixtureRepo, files.serverInspectWorker);
    const inspectionBootstrap = path.join(fixtureRepo, files.serverInspectBootstrap);
    const inspectionStatus = path.join(fixtureRepo, files.serverInspectStatus);
    const inspectionProcessStart = '2026-08-18T00:00:10.0000000Z';
    const inspectionPid = missingPid - 2;
    const inspectionClaim = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      job_kind: 'production_server_inspection',
      attempt_id: inspectionAttemptId,
      proof_attempt_id: productionAttemptId,
      target_pgappname: productionPgapp,
      authorized_repo_sha: repoSha,
      artifact_set_sha256: manifest.artifact_set_sha256,
      manifest_sha256: authorization.manifest_sha256,
      authorization_path: authorizationPath,
      authorization_sha256: sha256(authorizationBytes),
      proof_receipt_path: productionMarker,
      bootstrap_script: inspectionBootstrap,
      bootstrap_receipt_path: inspectionBootstrapReceiptPath,
      bootstrap_final_path: inspectionBootstrapFinalPath,
      worker_script: inspectionWorker,
      status_script: inspectionStatus,
      spawn_receipt_path: inspectionSpawnPath,
      pid_receipt_path: inspectionPidPath,
      stdout_path: inspectionStdoutPath,
      stderr_path: inspectionStderrPath,
      worker_host_stdout_path: inspectionHostStdoutPath,
      worker_host_stderr_path: inspectionHostStderrPath,
      final_status_path: inspectionFinalPath,
      utc_start: inspectionProcessStart,
    };
    const inspectionSpawn = {
      schema_version: 2,
      job_kind: inspectionClaim.job_kind,
      attempt_id: inspectionAttemptId,
      pid: inspectionPid,
      process_start_utc: inspectionProcessStart,
      executable_path: manifest.powershell.path,
      worker_script: inspectionWorker,
    };
    const inspectionPidReceipt = {
      schema_version: 2,
      job_kind: inspectionClaim.job_kind,
      attempt_id: inspectionAttemptId,
      repo_sha: repoSha,
      pid: inspectionPid,
      process_start_utc: inspectionProcessStart,
      executable_path: manifest.powershell.path,
      worker_script: inspectionWorker,
      target_pgappname: productionPgapp,
    };
    const inspectionOutput = 'ISSUE97_WORKER_PROOF_SERVER_INSPECTION_PASS\nROLLBACK\n';
    const inspectionError = '';
    const inspectionFinal = {
      schema_version: 2,
      worker_proof_version: manifest.worker_proof_version,
      job_kind: inspectionClaim.job_kind,
      attempt_id: inspectionAttemptId,
      proof_attempt_id: productionAttemptId,
      repo_sha: repoSha,
      artifact_set_sha256: manifest.artifact_set_sha256,
      target_pgappname: productionPgapp,
      pid: inspectionPid,
      process_start_utc: inspectionProcessStart,
      start_utc: inspectionProcessStart,
      end_utc: '2026-08-18T00:00:11.0000000Z',
      client_started: true,
      client_confirmed_finished: true,
      exit_code: 0,
      final_marker_present: true,
      rollback_present: true,
      commit_count: 0,
      stdout_sha256: sha256(Buffer.from(inspectionOutput)),
      stderr_sha256: sha256(Buffer.from(inspectionError)),
      executed_sql_sha256: manifest.artifacts.find((item) => item.path === files.inspectSql).sha256,
      psql_sha256: manifest.psql.sha256,
      success: true,
      server_inspection_required: false,
      failure_code: null,
    };
    const runInspectionStatus = () => {
      const result = spawnSync(powerShell, [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', inspectionStatus,
      ], { cwd: fixtureRepo, encoding: 'utf8' });
      assert.equal(result.status, 0, `actual inspection status fixture failed: ${result.stdout}${result.stderr}`);
      const match = result.stdout.match(/^STATE=([A-Z_]+)$/m);
      assert.ok(match, `actual inspection status fixture omitted state: ${result.stdout}`);
      return match[1];
    };
    writeJson(inspectionClaimPath, inspectionClaim);
    writeJson(inspectionSpawnPath, inspectionSpawn);
    writeJson(inspectionPidPath, inspectionPidReceipt);
    writeJson(inspectionFinalPath, inspectionFinal);
    fs.writeFileSync(inspectionStdoutPath, inspectionOutput);
    fs.writeFileSync(inspectionStderrPath, inspectionError);
    fs.writeFileSync(inspectionHostStdoutPath, '');
    fs.writeFileSync(inspectionHostStderrPath, '');
    assert.equal(runInspectionStatus(), 'CLIENT_FINISHED_SUCCESS', 'actual server-inspection success must pass');
    writeJson(inspectionFinalPath, { ...inspectionFinal, target_pgappname: 'brinesearch-i97-wp-20260818000000-cafebabe' });
    assert.equal(runInspectionStatus(), 'RECEIPT_INVALID', 'server-inspection status must reject a wrong target PGAPPNAME');
    writeJson(inspectionFinalPath, { ...inspectionFinal, success: false, exit_code: 1, server_inspection_required: true });
    assert.equal(runInspectionStatus(), 'SERVER_INSPECTION_REQUIRED', 'failed server inspection remains fail-stop');
  } finally {
    if (process.env.ISSUE97_KEEP_STATUS_FIXTURE === '1') {
      console.error(`ISSUE97_STATUS_FIXTURE=${actualStatusRoot}`);
    } else {
      fs.rmSync(actualStatusRoot, { recursive: true, force: true });
    }
  }
}

console.log('Issue #97 long-lived worker-proof audit passed.');
