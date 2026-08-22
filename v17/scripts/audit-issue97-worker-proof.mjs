import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const bytes = (relative) => fs.readFileSync(path.join(root, relative));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
const count = (value, pattern) => [...value.matchAll(pattern)].length;
const expect = (value, message) => assert.ok(value, message);

const files = {
  manifest: 'ops/issue97-computer-rollout/issue97-worker-proof-manifest.json',
  lib: 'ops/issue97-computer-rollout/issue97-worker-proof-lib.ps1',
  authorize: 'ops/issue97-computer-rollout/issue97-worker-proof-authorize.ps1',
  authorizeProduction: 'ops/issue97-computer-rollout/issue97-worker-proof-authorize-production.ps1',
  launch: 'ops/issue97-computer-rollout/issue97-worker-proof-launch.ps1',
  bootstrap: 'ops/issue97-computer-rollout/issue97-worker-proof-bootstrap.ps1',
  worker: 'ops/issue97-computer-rollout/issue97-worker-proof-worker.ps1',
  status: 'ops/issue97-computer-rollout/issue97-worker-proof-status.ps1',
  provision: 'ops/issue97-computer-rollout/issue97-worker-proof-provision-log-root.ps1',
  inspect: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect.ps1',
  inspectBootstrap: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-bootstrap.ps1',
  inspectWorker: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-worker.ps1',
  inspectStatus: 'ops/issue97-computer-rollout/issue97-worker-proof-server-inspect-status.ps1',
  localLaunch: 'ops/issue97-computer-rollout/issue97-worker-proof-local-launch.ps1',
  localBootstrap: 'ops/issue97-computer-rollout/issue97-worker-proof-local-bootstrap.ps1',
  localWorker: 'ops/issue97-computer-rollout/issue97-worker-proof-local-worker.ps1',
  localChild: 'ops/issue97-computer-rollout/issue97-worker-proof-local-child.ps1',
  proofSql: 'ops/issue97-computer-rollout/sql/35-worker-proof-read-only.sql',
  inspectSql: 'ops/issue97-computer-rollout/sql/36-worker-proof-server-inspection.sql',
  readme: 'ops/issue97-computer-rollout/README.md',
  attributes: '.gitattributes',
  gitignore: '.gitignore',
};
const source = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, read(value)]));
const manifest = JSON.parse(source.manifest);

function gitBlob(relative) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', `HEAD:${relative}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `git blob lookup failed for ${relative}: ${result.stderr}`);
  return result.stdout.trim().toLowerCase();
}

for (const [file, expected] of new Map([
  ['ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql', '298ea15bfd7f8d388f819db07841e2ba2d54c905'],
  ['supabase/tests/issue97_frozen_route_closure_preinstall.sql', '868b85bea10116ed7908efd205581140fb8e2cf1'],
  ['v17/scripts/audit-issue97-frozen-route-closure.mjs', '3354271741221b181c391bb3cd17fc683c7ea60f'],
  ['package.json', '88cb52dfd8c5179fc60982be12eea1bbc6c590ab'],
])) assert.equal(gitBlob(file), expected, `audited 412-route closure artifact drifted: ${file}`);

assert.equal(manifest.schema_version, 3);
assert.equal(manifest.worker_proof_version, 'issue97-long-lived-worker-proof-v5');
assert.equal(manifest.generation_id, 'issue97-worker-proof-generation-5');
assert.equal(manifest.expected_branch, 'data/issue-97-authoritative-road-junction-graph');
assert.equal(manifest.expected_remote_url, 'https://github.com/FrankieJay52/Brinesearch.git');
assert.equal(manifest.expected_service, 'brinesearch_issue97_prod');
assert.equal(manifest.private_log_root, 'C:\\Users\\frank\\.issue97-runs\\issue97-worker-proof-v5');
assert.equal(manifest.historical_evidence_generation4.worker_proof_version, 'issue97-long-lived-worker-proof-v4');
assert.equal(manifest.historical_evidence_generation4.disposition, 'consumed_failed_local_no_retry');
assert.equal(manifest.historical_evidence_generation4.evidence_set_sha256,
  'AEFCF5CE0682F23EDFEAA82070E913A8282504D3C562DF4B8B0B4F0534E6DFDA');
assert.deepEqual(manifest.historical_evidence, {
  worker_proof_version: 'issue97-long-lived-worker-proof-v2',
  artifact_set_sha256: '3E3D5F560E5E223A1E9CF9CB19FACB226A40DE8C31AAC7C22EA82363A2E7E68B',
  private_log_root: 'C:\\Users\\frank\\.issue97-runs\\issue97-worker-proof',
  production_attempt_id: 'issue97-wp-20260818T043030245Z-ef613388',
  server_inspection_attempt_id: 'issue97-inspect-20260818T043213665Z',
  disposition: 'consumed_failed_no_retry',
  file_count: 36,
  evidence_set_sha256: '9BA10A27FF9B5044FAB58EDF76DE2B11BC7795B915C168E08E462BCA18FE62C0',
  critical_hashes: {
    'authorization.json': '17B9FCF59590ACA453E98493BE80E8A06E07503F790DB69AAFB86694C6DEA09A',
    'production.launch.json': '56042853BA798DC87129B7938260321DF95170FC4647EB45A9A1D0C7BC67C066',
    'production.attempt.json': '7A9A2559806A84E0C96BB7489FD7A28C7F7798D7A675D4C19A6A63EF5D30F67D',
    'production.client.json': '034E95CE860705DFE4C9107ABE50AA46E7DD797CF7E907D8EEBE29DFD133DBE3',
    'production.final.json': 'BC8B933578BBDA548697A5DF2B11CBCAA27961490C3B3B7B6F97F2EF43E17CB9',
    'server-inspection.launch.json': '6E176F9F0436EF1F912D3355F1BDEC1FD4F096CC290CC234DB811000780FC579',
    'server-inspection.final.json': '9B9C98585CAFE1F1C8814C5025B3BF3B9378AF71BF8732648BAEA5C7F7AEFE5B',
  },
});
assert.deepEqual(manifest.historical_evidence_generation3, {
  worker_proof_version: 'issue97-long-lived-worker-proof-v3',
  artifact_set_sha256: '9474CF2458191B0C9C0458632BCCF6EEFFB68C9A1C3E17393AD0E99C5197C0DB',
  private_log_root: 'C:\\Users\\frank\\.issue97-runs\\issue97-worker-proof-v3',
  production_attempt_id: 'issue97-wp-20260818T065601847Z-5e0d29a5',
  server_inspection_attempt_id: 'issue97-inspect-20260818T065824046Z',
  disposition: 'consumed_failed_no_retry',
  file_count: 42,
  evidence_set_sha256: '83AA4256D66BAA2A30C46868FBC90A1AC875B96978B6089866BCCA3774C0CB13',
  critical_hashes: {
    'production.authorization.json': '0131F80603537441CCE5136AA2109C324CD0C796E8854EA6A3993F1B13CBC9BC',
    'production.launch.json': 'FE40D9E67A3E428B7ECC729EADDCEF8816846464C237D2A94120880609597E3B',
    'production.attempt.json': '4C6FAB6C6B80C21306AAB0781BB8D9EE94EB27B004D4385DA713A13F8FCB5F71',
    'production.pid.json': '3D57D1F299423D6448C848C6C46A2D918ED40B946B1EB572B240191559B86200',
    'production.client.json': 'C9ACD6BCDF8408CCC283AC3E3E30978346D760389B8ABF39E0A818781D20B321',
    'production.client-final.json': '3C9669B5B2CEA9E5AF9B28A913E986D474AC05E040B18C81EB558CC360F82A3D',
    'production.final.json': '29927F5FD2671C7FEDE1AD97DD36025955719AD2BB888AEB5F4B5015A27BEDE3',
    'server-inspection.launch.json': '1FA079567652051E3ED5FE2BCD16D600D1E03EFBBB6CC3CAB853297163E36085',
    'server-inspection.client-final.json': '9AB8F530C0FD69C002E08058B1AFD52AD35E56FE8FAD72250F7AB2A9DEE4EB75',
    'server-inspection.final.json': '0B70195B2DFF0F29A78B1965353B63380150137EF526475D298E9A8E6EE87FF9',
  },
});
assert.equal(manifest.psql.version, 'psql (PostgreSQL) 17.11');
assert.equal(manifest.psql.sha256, '5BB3FAD8A7FF555ABFF37921A24EE3D9E377C15408B5E7267AA9245596965CA0');
assert.equal(manifest.psql.dlls.length, 29);
for (const required of ['libpq.dll', 'libintl-9.dll', 'libiconv-2.dll', 'libssl-3-x64.dll', 'libcrypto-3-x64.dll']) {
  expect(manifest.psql.dlls.some((entry) => entry.relative_path.endsWith(`/${required}`)), `missing DLL pin ${required}`);
}

const expectedArtifacts = [files.lib, files.authorize, files.authorizeProduction, files.launch,
  files.bootstrap, files.worker, files.status, files.provision, files.inspect, files.inspectBootstrap,
  files.inspectWorker, files.inspectStatus, files.localLaunch, files.localBootstrap, files.localWorker,
  files.localChild, files.proofSql, files.inspectSql];
assert.deepEqual(manifest.artifacts.map((entry) => entry.path), expectedArtifacts);
for (const artifact of manifest.artifacts) {
  assert.match(artifact.sha256, /^[0-9A-F]{64}$/);
  assert.equal(sha256(bytes(artifact.path)), artifact.sha256, `raw artifact hash drifted: ${artifact.path}`);
}
const artifactInput = manifest.artifacts.map((entry) => `${entry.path}=${entry.sha256}\n`).sort().join('');
assert.equal(sha256(Buffer.from(artifactInput)), manifest.artifact_set_sha256);
expect(source.attributes.includes('issue97-worker-proof-*.ps1 text eol=lf'), 'PowerShell artifacts need stable LF bytes');
expect(/^\.tools\/$/m.test(source.gitignore), 'reviewed local PostgreSQL runtime must stay ignored');

for (const key of ['authorize', 'authorizeProduction', 'launch', 'bootstrap', 'worker', 'status', 'provision',
  'inspect', 'inspectBootstrap', 'inspectWorker', 'inspectStatus', 'localLaunch', 'localBootstrap',
  'localWorker', 'localChild']) {
  expect(/^param\(\)\s*$/m.test(source[key]), `${key} must be zero-argument`);
  expect(source[key].includes('$args.Count -ne 0'), `${key} must reject arbitrary arguments`);
}
for (const name of ['PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGOPTIONS',
  'PGSERVICEFILE', 'PGSYSCONFDIR', 'PGAPPNAME', 'DATABASE_URL', 'SUPABASE_DB_URL']) {
  expect(source.lib.includes(`'${name}'`), `unreviewed environment variable is not rejected: ${name}`);
}
for (const required of ['Get-Issue97GitMetadataRoots', 'Invoke-Issue97GitFetchWithTimeout',
  'artifact-set digest does not match the exact fixed artifact hashes',
  'private log root ACL is not the exact owner/SYSTEM/Administrators contract',
  'reviewed trusted path has an untrusted owner', 'historical worker-proof evidence file set or bytes changed']) {
  expect(source.lib.includes(required), `missing trust/no-clobber invariant: ${required}`);
}

expect(source.authorize.includes("'local.authorization.json'"), 'local authorization namespace must be fixed');
expect(source.authorize.includes('production_read_only_proof_authorized = $false'), 'local authorization cannot grant production');
expect(source.authorize.includes('automatic_retry_authorized = $false'), 'local authorization cannot grant retry');
expect(source.authorizeProduction.includes("'production.authorization.json'"), 'production authorization needs a separate no-clobber receipt');
expect(source.authorizeProduction.includes('local_authorization_sha256'), 'production authorization must chain to the local generation');
expect(source.authorizeProduction.includes('STATE=CLIENT_FINISHED_SUCCESS'), 'production authorization must require the exact local proof to pass');
expect(source.authorizeProduction.includes('local_final_receipt_sha256'), 'production authorization must bind the successful local final receipt');
expect(source.authorizeProduction.includes('production_read_only_proof_authorized = $true'), 'only the separate authorizer can enable a future production proof');
expect(source.authorizeProduction.includes('mapping_rehearsal_authorized = $false'), 'production authorization cannot enable mapping work');
expect(source.authorizeProduction.includes('automatic_retry_authorized = $false'), 'production authorization cannot enable retry');
for (const key of ['authorize', 'authorizeProduction', 'bootstrap', 'worker', 'localBootstrap',
  'localWorker', 'inspectBootstrap', 'inspectWorker', 'provision']) {
  expect(source[key].includes('Assert-Issue97HistoricalEvidence'), `${key} must preserve consumed v2/v3 evidence`);
}
expect(source.lib.includes('[System.StringComparer]::Ordinal'),
  'historical evidence digest must use runtime-independent ordinal filename ordering');

expect(source.launch.includes("'production.authorization.json'"), 'production launcher must require the separate authorization');
expect(source.localLaunch.includes("'local.authorization.json'"), 'local launcher must require only local authorization');
expect(source.localLaunch.includes("'PGAPPNAME'"), 'local launcher must reject an operator-supplied PGAPPNAME');
expect(source.launch.includes("'production.launch.json'"), 'production one-shot claim must be fixed');
expect(source.localLaunch.includes("'local.launch.json'"), 'local one-shot claim must be fixed');
expect(!source.launch.includes('--file=') && !source.launch.includes('-Wait'), 'short launcher must never own psql');
expect(source.bootstrap.includes('Invoke-CimMethod -ClassName Win32_Process -MethodName Create'), 'production bootstrap must detach through WMI');
expect(source.localBootstrap.includes('Invoke-CimMethod -ClassName Win32_Process -MethodName Create'), 'local bootstrap must detach through WMI');
expect(source.inspectBootstrap.includes('Invoke-CimMethod -ClassName Win32_Process -MethodName Create'), 'inspector bootstrap must detach through WMI');

function assertAuthoritativeExitCapture(text, timedWait, exitCapture) {
  expect(!text.includes('$LASTEXITCODE'), 'child outcome must never use LASTEXITCODE');
  const timed = text.indexOf(timedWait);
  const drain = text.indexOf('$client.WaitForExit()', timed);
  const refresh = text.indexOf('$client.Refresh()', drain);
  const capture = text.indexOf(exitCapture, refresh);
  expect(timed >= 0 && drain > timed && refresh > drain && capture > refresh,
    'ExitCode must be captured immediately from the unquestionably exited/refreshed process object');
}
assertAuthoritativeExitCapture(source.worker, '$clientConfirmedFinished = $client.WaitForExit(45000)', '$exitCode = [int]$client.ExitCode');
assertAuthoritativeExitCapture(source.inspectWorker, '$clientFinished = $client.WaitForExit(45000)', '$exitCode = [int]$client.ExitCode');
assertAuthoritativeExitCapture(source.localWorker, '$clientFinished = $client.WaitForExit(30000)', '$clientExitCode = [int]$client.ExitCode');

for (const key of ['worker', 'inspectWorker', 'localWorker']) {
  expect(source[key].includes('New-Object System.Diagnostics.ProcessStartInfo'), `${key} must own one explicit child environment`);
  expect(source[key].includes('New-Object System.Diagnostics.Process'), `${key} must capture the actual child process object`);
  expect(source[key].includes('client-final.json'), `${key} must publish authoritative process completion evidence`);
  expect(source[key].includes('worker_exit_code'), `${key} final receipt must agree with worker disposition`);
}
expect(source.worker.includes("$startInfo.EnvironmentVariables.Remove('PGOPTIONS')"), 'psql child must not accept PGOPTIONS');
expect(source.worker.includes('--set=issue97_expected_attempt_id=$attemptId'), 'SQL must receive only the immutable receipt attempt ID');
expect(source.worker.includes("$startInfo.EnvironmentVariables.Remove('PGAPPNAME')"), 'production worker must not try to force application_name');
expect(source.localWorker.includes("$startInfo.EnvironmentVariables['ISSUE97_ATTEMPT_ID']"), 'local child must receive the exact receipt attempt ID');
expect(source.localChild.includes('ISSUE97_LOCAL_BACKEND_IDENTITY|') && source.localChild.includes('application_name=Supavisor') &&
  source.localChild.includes('Start-Sleep -Seconds 7'), 'local child must simulate backend identity, Supavisor diagnostics, and lifetime');
expect(!/psql|PGSERVICE/i.test(source.localWorker + source.localChild), 'local proof must never access PostgreSQL');
expect(source.status.includes('[int]$final.exit_code -ne [int]$clientFinal.exit_code'), 'status must reject client/final exit disagreement');
for (const field of ['backend_attempt_id', 'backend_attempt_lock_key', 'backend_pid', 'backend_start_utc',
  'backend_custom_guc', 'observed_application_name']) {
  expect(source.worker.includes(field) && source.localWorker.includes(field) && source.status.includes(field),
    `worker/local/status receipts must bind ${field}`);
}
expect(source.status.includes("'production.client-final.json'") && source.status.includes("'local.client-final.json'"), 'status must require authoritative completion receipts');
expect(!/Start-Process|Stop-Process|Remove-Item/i.test(source.status), 'status must remain read-only');

expect(source.inspectWorker.includes('--set=issue97_target_attempt_id=') && source.inspectWorker.includes('--set=issue97_inspector_id='),
  'inspector SQL must receive target attempt and inspector receipt identities');
expect(source.inspectWorker.includes("$startInfo.EnvironmentVariables.Remove('PGAPPNAME')"), 'inspector must not force application_name');
expect(source.inspectWorker.includes('target_backend_pid') && source.inspectWorker.includes('target_backend_start_utc'),
  'inspector must bind exact PID/backend_start evidence when emitted');
expect(source.inspectWorker.includes('production.bootstrap-final.json'), 'inspector must require the production lifecycle terminal receipt');
expect(source.inspectWorker.includes('a reviewed PostgreSQL client process from the proof lane is still active'), 'inspector must reject an orphaned proof client');
expect(!/Start-Process|Stop-Process|Remove-Item/i.test(source.inspectStatus), 'inspector status must remain read-only');

const proofSql = source.proofSql.replaceAll('\r\n', '\n').trim();
const inspectSql = source.inspectSql.replaceAll('\r\n', '\n').trim();
for (const [label, sql] of [['proof', proofSql], ['inspection', inspectSql]]) {
  assert.equal(count(sql, /^begin\b/gim), 1, `${label} SQL must have one BEGIN`);
  assert.equal(count(sql, /^rollback\s*;/gim), 1, `${label} SQL must have one ROLLBACK`);
  assert.equal(count(sql, /^commit\b/gim), 0, `${label} SQL must have zero COMMIT`);
  expect(sql.includes('begin isolation level repeatable read read only;'), `${label} transaction must be READ ONLY`);
  expect(sql.includes("set local statement_timeout = '30s';") && sql.includes("set local lock_timeout = '2s';"), `${label} SQL needs finite timeouts`);
  const executable = sql.replace(/'(?:''|[^'])*'/g, "''");
  expect(!/\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|copy|call|do|vacuum|analyze|refresh|reindex|cluster)\b/i.test(executable), `${label} SQL contains write-capable syntax`);
}
assert.equal(count(proofSql, /pg_catalog\.pg_sleep\(5\)/g), 1, 'production proof must contain exactly one five-second sleep');
expect(proofSql.includes("set_config(\n  'brinesearch.issue97_attempt_id'") &&
  proofSql.includes("current_setting('brinesearch.issue97_attempt_id', true)"),
  'proof SQL must bind and prove the transaction-local custom GUC');
expect(proofSql.includes("hashtextextended(\n  :'issue97_expected_attempt_id',\n  970035") &&
  proofSql.includes('pg_try_advisory_xact_lock'), 'proof SQL must acquire the receipt-derived transaction lock');
expect(proofSql.indexOf('ISSUE97_WORKER_PROOF_BACKEND_IDENTITY') < proofSql.indexOf('pg_catalog.pg_sleep(5)'),
  'backend PID/start identity must be emitted before the sleep');
expect(inspectSql.includes("set_config(\n  'brinesearch.issue97_inspector_id'") &&
  inspectSql.includes("hashtextextended(\n  :'issue97_target_attempt_id',\n  970035"),
  'inspector must use its custom GUC and derive the exact proof lock');
expect(inspectSql.includes('ISSUE97_WORKER_PROOF_TARGET_ATTEMPT_LOCK_STILL_HELD'),
  'inspector must fail closed while the proof attempt lock is held');
expect(inspectSql.includes('activity.pid = :\'issue97_target_backend_pid\'::integer') &&
  inspectSql.includes('activity.backend_start = :\'issue97_target_backend_start\'::timestamptz'),
  'inspector must reject the exact PID/backend_start identity');
expect(!/set\s+local\s+application_name|current_setting\('application_name'\)\s*=/i.test(proofSql + inspectSql),
  'application_name must never be an identity/equality gate');
expect(!/issue97_(expected|target|inspector)_pgappname/i.test(proofSql + inspectSql),
  'no PGAPPNAME-derived SQL identity variable may remain');
expect(!/pg_catalog\.coalesce\s*\(/i.test(proofSql + inspectSql), 'COALESCE is SQL syntax and must never be schema-qualified');
expect(count(`${proofSql}\n${inspectSql}`, /\bCOALESCE\s*\(/g) >= 2, 'protected-state queries must retain corrected COALESCE');
for (const sql of [proofSql, inspectSql]) {
  for (const token of ["version = '20260817193212'", '= 806', '= 38', "status = 'staging'", "state_code in ('WV', 'PA')"]) {
    expect(sql.includes(token), `protected-state guard missing: ${token}`);
  }
}

function outcome({ exitCode, pass = true, rollback = true, commits = 0, hashes = true, identities = true }) {
  return exitCode === 0 && pass && rollback && commits === 0 && hashes && identities;
}
assert.equal(outcome({ exitCode: 0 }), true);
assert.equal(outcome({ exitCode: 17 }), false, 'PASS text cannot override nonzero ExitCode');
assert.equal(outcome({ exitCode: 0, pass: false }), false, 'zero exit without PASS must fail');
assert.equal(outcome({ exitCode: 0, rollback: false }), false, 'zero exit without ROLLBACK must fail');
assert.equal(outcome({ exitCode: 0, commits: 1 }), false, 'COMMIT must fail');
assert.equal(outcome({ exitCode: 0, hashes: false }), false, 'log/receipt mismatch must fail');
assert.equal(outcome({ exitCode: 0, identities: false }), false, 'attempt/GUC/lock/PID-start mismatch must fail');
for (const bad of [null, undefined, Number.NaN]) assert.equal(outcome({ exitCode: bad }), false, 'missing process ExitCode must fail closed');

function receiptsAgree({
  attemptId = 'issue97-wp-20260818T000000000Z-deadbeef',
  receiptAttemptId = 'issue97-wp-20260818T000000000Z-deadbeef',
  customGuc = 'issue97-wp-20260818T000000000Z-deadbeef',
  lockKey = -123456789n,
  receiptLockKey = -123456789n,
  backendPid = 4101,
  receiptBackendPid = 4101,
  backendStart = '2026-08-18T00:00:00.0000000Z',
  receiptBackendStart = '2026-08-18T00:00:00.0000000Z',
  applicationName = 'Supavisor',
  clientExit = 0,
  finalExit = 0,
  finalReceiptPresent = true,
} = {}) {
  return finalReceiptPresent && attemptId === receiptAttemptId &&
    customGuc === attemptId && lockKey === receiptLockKey &&
    backendPid === receiptBackendPid && backendStart === receiptBackendStart &&
    typeof applicationName === 'string' &&
    clientExit === finalExit;
}
assert.equal(receiptsAgree(), true);
assert.equal(receiptsAgree({ receiptAttemptId: 'issue97-wp-20260818T000000000Z-cafebabe' }), false, 'stale/wrong attempt receipt must fail');
assert.equal(receiptsAgree({ customGuc: '' }), false, 'missing custom GUC must fail');
assert.equal(receiptsAgree({ customGuc: 'issue97-wp-20260818T000000000Z-cafebabe' }), false, 'changed custom GUC must fail');
assert.equal(receiptsAgree({ receiptLockKey: 99n }), false, 'wrong attempt lock key must fail');
assert.equal(receiptsAgree({ receiptBackendPid: 4102 }), false, 'wrong backend PID must fail');
assert.equal(receiptsAgree({ receiptBackendStart: '2026-08-18T00:00:01.0000000Z' }), false, 'PID reuse with a different backend_start must fail');
assert.equal(receiptsAgree({ applicationName: 'Supavisor' }), true, 'Supavisor application_name is diagnostic only');
assert.equal(receiptsAgree({ applicationName: 'psql' }), true, 'application_name cannot substitute for attempt identity');
assert.equal(receiptsAgree({ clientExit: 17 }), false, 'client/final exit disagreement must fail');
assert.equal(receiptsAgree({ finalReceiptPresent: false }), false, 'missing process-exit receipt must fail');
assert.throws(() => JSON.parse('{'), SyntaxError, 'malformed receipt JSON must fail');

const inspectorAccepts = ({ lockAcquired = true, pidStartAbsent = true, receiptAgreement = true } = {}) =>
  lockAcquired && pidStartAbsent && receiptAgreement;
assert.equal(inspectorAccepts(), true, 'released attempt lock and absent PID/start must pass inspection identity');
assert.equal(inspectorAccepts({ lockAcquired: false }), false, 'held attempt lock must fail closed');
assert.equal(inspectorAccepts({ pidStartAbsent: false }), false, 'live exact PID/start must fail closed');
assert.equal(inspectorAccepts({ receiptAgreement: false }), false, 'stale/malformed inspector receipt must fail');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'issue97-v5-no-clobber-'));
try {
  const marker = path.join(temp, 'claim.json');
  fs.closeSync(fs.openSync(marker, 'wx'));
  assert.throws(() => fs.openSync(marker, 'wx'), /EEXIST/, 'second generation claim must fail');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

if (process.platform === 'win32') {
  const ps = manifest.powershell.path;
  for (const file of [files.lib, files.authorize, files.authorizeProduction, files.launch, files.bootstrap,
    files.worker, files.status, files.provision, files.inspect, files.inspectBootstrap, files.inspectWorker,
    files.inspectStatus, files.localLaunch, files.localBootstrap, files.localWorker, files.localChild]) {
    const absolute = path.join(root, file);
    const command = `$e=$null;[Management.Automation.Language.Parser]::ParseFile('${absolute.replaceAll("'", "''")}',[ref]$null,[ref]$e)|Out-Null;if($e.Count){$e|% Message;exit 1}`;
    const result = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
    assert.equal(result.status, 0, `PowerShell parse failed for ${file}: ${result.stdout}${result.stderr}`);
  }
  const forbiddenArgument = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, files.launch), 'forbidden'], {
    encoding: 'utf8', env: { ...process.env, PGSERVICE: 'brinesearch_issue97_prod' },
  });
  assert.notEqual(forbiddenArgument.status, 0, 'production launcher must reject arguments');
  const secret = 'ISSUE97_TEST_SECRET_MUST_NOT_PRINT';
  const credentialFailure = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(root, files.launch)], {
    encoding: 'utf8', env: { ...process.env, PGSERVICE: 'brinesearch_issue97_prod', PGPASSWORD: secret },
  });
  assert.notEqual(credentialFailure.status, 0, 'production launcher must reject credential environment');
  expect(!`${credentialFailure.stdout}${credentialFailure.stderr}`.includes(secret), 'credential value must not be logged');
  const exitHarness = [
    '$code=[int]$env:ISSUE97_TEST_EXIT',
    '$si=New-Object Diagnostics.ProcessStartInfo',
    `$si.FileName='${ps.replaceAll("'", "''")}'`,
    '$si.Arguments="-NoLogo -NoProfile -NonInteractive -Command `"exit $code`""',
    '$si.UseShellExecute=$false;$p=New-Object Diagnostics.Process;$p.StartInfo=$si',
    'if(-not $p.Start()){exit 90};if(-not $p.WaitForExit(10000)){exit 91}',
    '$p.WaitForExit();$p.Refresh();$captured=[int]$p.ExitCode',
    '$null=(New-Object Security.Cryptography.SHA256Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes("later"))',
    'Write-Output "CAPTURED=$captured";exit 0',
  ].join(';');
  for (const code of [0, 17]) {
    const result = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', exitHarness], {
      encoding: 'utf8', env: { ...process.env, ISSUE97_TEST_EXIT: String(code) },
    });
    assert.equal(result.status, 0, `controlled child test failed: ${result.stdout}${result.stderr}`);
    expect(result.stdout.includes(`CAPTURED=${code}`), `actual child exit ${code} was not preserved after later hashing`);
  }
  const localAttempt = 'issue97-local-20260818T000000000Z-deadbeef';
  const local = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(root, files.localChild)], {
      encoding: 'utf8',
      env: { ...process.env, ISSUE97_ATTEMPT_ID: localAttempt, ISSUE97_ATTEMPT_LOCK_KEY: '-9700350004', PGAPPNAME: '' },
      timeout: 15000,
    });
  assert.equal(local.status, 0, `fixed local child failed: ${local.stdout}${local.stderr}`);
  assert.equal(count(local.stdout, /ISSUE97_LOCAL_BACKEND_IDENTITY\|/g), 1);
  expect(local.stdout.includes(`attempt_id=${localAttempt}`) && local.stdout.includes('application_name=Supavisor'),
    'local child must emit exact attempt identity and Supavisor diagnostics');
  assert.equal(count(local.stdout, /ISSUE97_LOCAL_WORKER_PASS/g), 1);
  const generic = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(root, files.localChild)], {
      encoding: 'utf8', env: { ...process.env, ISSUE97_ATTEMPT_ID: localAttempt, ISSUE97_ATTEMPT_LOCK_KEY: '17' }, timeout: 5000,
    });
  assert.notEqual(generic.status, 0, 'wrong local attempt-lock identity must fail');

  const markerHarness = [
    `. '${path.join(root, files.lib).replaceAll("'", "''")}'`,
    '$attempt="issue97-wp-20260818T000000000Z-deadbeef"',
    '$marker="ISSUE97_WORKER_PROOF_BACKEND_IDENTITY|attempt_id=$attempt|attempt_lock_key=-123456789|backend_pid=4101|backend_start=2026-08-18T00:00:00.000000Z|transaction_read_only=on|custom_guc=$attempt|application_name=Supavisor`r`n"',
    '$value=Get-Issue97BackendIdentityMarker -Text $marker -ExpectedAttemptId $attempt -ExpectedPrefix ISSUE97_WORKER_PROOF_BACKEND_IDENTITY',
    'if($value.attempt_lock_key -ne -123456789 -or $value.backend_pid -ne 4101 -or $value.observed_application_name -ne "Supavisor"){exit 2}',
    'try { Get-Issue97BackendIdentityMarker -Text $marker.Replace("custom_guc=$attempt","custom_guc=wrong") -ExpectedAttemptId $attempt -ExpectedPrefix ISSUE97_WORKER_PROOF_BACKEND_IDENTITY | Out-Null; exit 3 } catch {}',
    'try { Get-Issue97BackendIdentityMarker -Text $marker -ExpectedAttemptId "issue97-wp-20260818T000000000Z-cafebabe" -ExpectedPrefix ISSUE97_WORKER_PROOF_BACKEND_IDENTITY | Out-Null; exit 4 } catch {}',
    'try { Get-Issue97BackendIdentityMarker -Text ($marker+"`n"+$marker) -ExpectedAttemptId $attempt -ExpectedPrefix ISSUE97_WORKER_PROOF_BACKEND_IDENTITY | Out-Null; exit 5 } catch {}',
    'exit 0',
  ].join(';');
  const markerResult = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', markerHarness], { encoding: 'utf8' });
  assert.equal(markerResult.status, 0, `backend identity parser regressions failed: ${markerResult.stdout}${markerResult.stderr}`);
}

expect(source.readme.includes('Fixed Windows worker proof (not a job runner)'), 'README must retain the narrow-lane contract');
expect(source.readme.includes('issue97-worker-proof-v5'), 'README must document the new proof namespace');
expect(source.readme.includes('Supavisor'), 'README must document the observed PGAPPNAME root cause');
expect(source.readme.includes('production authorization'), 'README must document the separate future authorization gate');

console.log('Issue #97 custom-GUC/advisory-lock/PID-start worker-proof v5 audit passed.');
