import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sqlDir = path.join(root, 'ops/issue97-computer-rollout/sql');
const paths = {
  core: path.join(sqlDir, '38-frozen-wave-ohio-state-manifest-core.sql'),
  rehearse: path.join(sqlDir, '39-rehearse-frozen-wave-ohio-state-manifest.sql'),
  persist: path.join(sqlDir, '40-persist-frozen-wave-ohio-state-manifest.sql'),
  verify: path.join(sqlDir, '41-verify-frozen-wave-ohio-state-manifest.sql'),
  pins: path.join(sqlDir, '37-frozen-mapping-wave-production-pins.sql'),
  package: path.join(root, 'package.json'),
};
const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const source = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const packageJson = JSON.parse(source.package);
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
const occurrences = (value, needle) => value.split(needle).length - 1;

const expectedMembers = `
retained|ATH|8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb|2080a5a06944f3d4842e31937748267f|4e955e0c8736f17dbd6ff79aa1c17e9d|9b7f9a9c682b51da132b927fba446429
replacement|BEL|1c1320b3-4257-4239-9c55-b18a801aa97e|269e903e991f1790bf5d1428e4c2bb43|b20843ddf3d2a648b8d53a0b3eb1a1c2|d2897b014f14e74eda72c11d1cac5f21
replacement|CAR|8e565c14-33a4-4862-9bf8-be9b5557b293|2943504592861b83abce581f29a1cacb|8405344f91e795398ab261a51f2a03bf|5cfeca8cfde72a71c70db7e0acaccf17
replacement|COL|b86d14c7-5c8a-4cb9-8a3b-903965340678|6bd88992a7a63c9643d1a6f1535ca2af|44b4e720a523face3149d7dbdc8a298b|85b6c4c11c8e8bff38624a1af957346f
retained|COS|7c979743-72e4-42a2-a6a9-006a369168c0|7791b63c7bcb5848200b5bc4cc970fb4|b9da0eb95ae5b4e03a0143484372b658|b4186d15df742d0fc8293dc806970350
replacement|GUE|44245144-3e39-45fe-907b-95e2b01b9c32|d7a43bacbf54794d4e92d9e8ceca2e28|b0cc4e8e3aaa7121cc39cc7935189664|d6b0bd997ae6b615ac3062adb91d0e31
replacement|HAS|0870470a-11f8-4f33-8af3-08d6849d5f34|fc53a1492a3eecab78a524dbadcddfe8|ece929162c9063ea35a6a276de59a940|38e64b032a5b6dda397adff52c2b0e84
replacement|JEF|c9bac3a2-82d4-4b76-813c-6a29c1bf062a|ce2de7721f56a145b21ddded270f07fd|0d40dc262b0097cf48783f7271531153|fed45e0eb7e217338b2b0a8d0e9d09da
retained|MAH|360472bf-cb96-4ba7-b2fe-efa04e230f69|4a80abcc01932b7a169189ec5f706cc4|79d1cd99ffcad7a04a06bd5ad7138417|b8f88d2df1a54a23bad6d77d68fdb5aa
retained|MEG|e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048|2fcf1a69c13907789a2f902574a35674|e90b8b30a449199a490fe85688670dfb|75886082576aece46f6da8bfe3512d78
replacement|MOE|8493f66b-b3d2-4673-be8a-07b024b9723d|fafd62f37b76e57859164010d1be967b|5a82a31c86fdd78804bf113f73e49694|287992b389092b7611328b7cceb3d66b
retained|MUS|98ae1835-1064-4c18-a8a7-9a9e570e212d|04a4c9d7a4274ac638cad78a406f76fa|0761cc66281b70da78dd0375ecb7cb86|d0a61a9e48eecf2bdd181af144c12278
replacement|NOB|200d56dc-5b13-4f84-82cb-946b8ebeada2|576c5e1b1012fcb8020fa637fb272082|795f812c7a9042318196195cccccf3a4|33dc4563999762e315d87ebf29581c70
retained|POR|c645a8bf-a920-432a-a341-a7b60d9cfd49|89513e609f359ad9064814ebbf074810|a86ed19837abdfa55047ddabbc60ffcc|f82c1db46f4f405610f4a7be525fd851
retained|STA|67541fad-5cf2-4483-b0f6-f4060197fda9|67be9ebece47e78c4c7ccf29ea92786e|adaeac05c1e99de304b1c9a10ac83443|d0826c5f57a593105b3aa43215e33873
retained|TRU|3c94b14c-9d9e-41ec-a897-b754dab6d8dd|2ff743a4c7f223a6821d3eaff7416d1d|60f07d2d3e4328c1f448c07aca49f4c8|c655a2dc29c81177694565dbc069f1a8
retained|TUS|fd6fdfff-f23f-42cc-a633-64448bd9d044|b5d73c4e9a397596bbdc1dd0697a0b6d|810a6b9c9f96448c52c722fbba8c3996|8232b7174a6e40b383f08173a3a2e81e
retained|VIN|785f5277-369c-4ae3-ba80-31411745e46d|551be5443af26c64d5ed5e92a58ee71b|c8962e1b5eec1d974533a973ca1f9362|7ae096daf0adf869efe405a5b5ae8530
retained|WAS|90982f30-8a06-4a53-8b4b-9efd5d9042bf|6ccff50666a085a4387c20fb49f90a59|d372a68557e29d1ae871025c372eb785|d6de47b387317ed968b15c1f74d7429c
`.trim().split('\n').map((line, index) => [index + 1, ...line.split('|')]);

const expectedOldAffected = `
BEL|24ffa531-0e69-4625-a137-da52020e6fd0|fc6dcbc8482b2e5c89f4069941c557de|81355d7958b89ffccd08a5f521730f8e
CAR|5ee5f97b-447f-41d3-946a-68a8b28d8367|e9f4ed56bb2b1308b8b9913a751c78f5|853c139290afee94e391fc0395d40fed
COL|c9f50b03-4328-4d8b-9995-4dc8bc85dd01|c13278c74933205f5c55cdf85f23f27e|7f54d4a6e143c4006cb90b4b4fa0b67e
GUE|84568854-3257-46b7-8581-374dc620ef16|b11b2f5ac3c1c5d492c2233494706f4c|b2bee82327b4ce24833fee33c4873238
HAS|542c35d5-a9ba-4b43-8a64-63a66f6b29e2|1d8f6a52d2541e313932906f944b2f92|610d4d5fe3a19cd1d07e9fc3049b2785
JEF|cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4|06e8bd25f7fb46fe750214dd77e2b67d|03efea8f142bb29e5f27cb12bf84c49f
MOE|ab9f4083-d572-4d9d-8e0a-28ebb77517e7|69010044273a611876c3a8ace7c198a2|0921c5ea8751f20f079ba1a776bc7c1e
NOB|70f30495-860a-4199-9360-8e880f3b515b|eefc679ed36e6aba3a590c7ba2c9e541|89af7128d56bbc4ef3733436d0813823
`.trim().split('\n').map((line) => line.split('|'));

function marked(value, begin, end, label) {
  assert.equal(occurrences(value, begin), 1, `${label} must have one begin marker`);
  assert.equal(occurrences(value, end), 1, `${label} must have one end marker`);
  const start = value.indexOf(begin) + begin.length;
  const finish = value.indexOf(end, start);
  assert.ok(finish > start, `${label} markers are reversed or empty`);
  return value.slice(start, finish);
}

function maskSql(value) {
  const output = [...value];
  const blank = (index) => {
    if (output[index] !== '\r' && output[index] !== '\n') output[index] = ' ';
  };
  let index = 0;
  while (index < value.length) {
    if (value.startsWith('--', index)) {
      while (index < value.length && !['\r', '\n'].includes(value[index])) blank(index++);
      continue;
    }
    if (value.startsWith('/*', index)) {
      let depth = 0;
      do {
        if (value.startsWith('/*', index)) {
          depth += 1; blank(index++); blank(index++);
        } else if (value.startsWith('*/', index)) {
          depth -= 1; blank(index++); blank(index++);
        } else blank(index++);
      } while (index < value.length && depth > 0);
      assert.equal(depth, 0, 'unterminated SQL block comment');
      continue;
    }
    if (value[index] === "'" || value[index] === '"') {
      const quote = value[index];
      blank(index++);
      let closed = false;
      while (index < value.length) {
        blank(index);
        if (value[index] === quote) {
          if (value[index + 1] === quote) { blank(index + 1); index += 2; }
          else { index += 1; closed = true; break; }
        } else index += 1;
      }
      assert.ok(closed, 'unterminated SQL quoted value');
      continue;
    }
    if (value[index] === '$') {
      const tag = value.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        const close = value.indexOf(tag, index + tag.length);
        assert.notEqual(close, -1, `unterminated SQL dollar quote ${tag}`);
        for (let at = index; at < close + tag.length; at += 1) blank(at);
        index = close + tag.length;
        continue;
      }
    }
    index += 1;
  }
  return output.join('');
}

function parseMembers(value, label) {
  const block = marked(value, '-- ISSUE97_FROZEN_MANIFEST_MEMBERS_BEGIN',
    '-- ISSUE97_FROZEN_MANIFEST_MEMBERS_END', label);
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const rows = [...block.matchAll(new RegExp(
    `\\(\\s*(\\d+)\\s*,\\s*'(replacement|retained)'\\s*,\\s*'([A-Z]{3})'\\s*,\\s*'(${uuid})'(?:\\s*::\\s*uuid)?\\s*,\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*\\)`,
    'g',
  ))].map((match) => [Number(match[1]), ...match.slice(2)]);
  assert.equal((block.match(/\(/g) ?? []).length, rows.length,
    `${label} contains an unparsed or malformed row`);
  return rows;
}

function parseOldAffected(value) {
  const block = marked(value, '-- ISSUE97_FROZEN_MANIFEST_OLD_AFFECTED_BEGIN',
    '-- ISSUE97_FROZEN_MANIFEST_OLD_AFFECTED_END', 'old affected manifest rows');
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const rows = [...block.matchAll(new RegExp(
    `\\(\\s*'([A-Z]{3})'\\s*,\\s*'(${uuid})'\\s*::\\s*uuid\\s*,\\s*'([0-9a-f]{32})'\\s*,\\s*'([0-9a-f]{32})'\\s*\\)`,
    'g',
  ))].map((match) => match.slice(1));
  assert.equal((block.match(/\(/g) ?? []).length, rows.length,
    'old affected block contains an unparsed or malformed row');
  return rows;
}

function jsonbMemberText(row) {
  const [, , county, buildId, graphDigest, sourceRevisionDigest] = row;
  return JSON.stringify({
    build_id: buildId,
    state_code: 'OH',
    county_code: county,
    graph_digest: graphDigest,
    generation_key: 'issue97-release-20260815-r2',
    source_revision_digest: sourceRevisionDigest,
  }).replaceAll(':', ': ').replaceAll(',', ', ');
}

function manifestModelPasses(rows) {
  if (rows.length !== 19) return false;
  if (new Set(rows.map((row) => row[2])).size !== 19) return false;
  if (new Set(rows.map((row) => row[3])).size !== 19) return false;
  if (rows.filter((row) => row[1] === 'replacement').length !== 8) return false;
  if (rows.filter((row) => row[1] === 'retained').length !== 11) return false;
  const serialized = rows.map((row) => {
    const member = `OH:${row[2]}:${jsonbMemberText(row)}`;
    if (md5(member) !== row[6]) return null;
    return member;
  });
  return !serialized.includes(null)
    && md5(serialized.sort((a, b) => a.localeCompare(b)).join('|'))
      === '77cb00cf83ad8bab4a45c9b552626f76';
}

function calls(value, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...maskSql(value).toLowerCase().matchAll(new RegExp(`${escaped}\\s*\\(`, 'g'))].length;
}

function requireTokens(value, tokens, label) {
  for (const token of tokens) assert.ok(value.includes(token), `${label} missing ${token}`);
}

function auditCore(value) {
  const rows = parseMembers(value, 'manifest core members');
  assert.deepEqual(rows, expectedMembers, 'manifest core exact 19-member authority drifted');
  assert.equal(manifestModelPasses(rows), true, 'manifest core digest model failed');
  const executable = maskSql(value).toLowerCase();
  const structural = executable.replaceAll('on commit drop', '');

  assert.equal(occurrences(value, '\\ir 37-frozen-mapping-wave-production-pins.sql'), 1,
    'manifest core must execute the repository pin gate exactly once');
  assert.equal(calls(value,
    'private_verification.brinesearch_issue97_persist_state_candidate_manifest'), 1,
  'manifest core must call the installed persistence function exactly once');
  assert.doesNotMatch(structural, /\b(?:begin|commit|rollback|savepoint|truncate|merge|alter|grant|revoke|copy)\b/i,
    'manifest core may not own a transaction end or perform direct persistent administration');
  assert.doesNotMatch(executable, /\b(?:update|delete\s+from)\b/i,
    'manifest core may not update or delete any row');
  assert.doesNotMatch(executable, /\binsert\s+into\s+(?:public|private_verification)\./i,
    'manifest core may not directly insert into persistent storage');
  assert.doesNotMatch(executable, /\bcreate\s+(?!temporary\b|temp\b)/i,
    'manifest core may create only temporary tables');
  assert.deepEqual([...executable.matchAll(/\bcreate\s+(?:temporary|temp)\s+table\s+([a-z0-9_]+)/g)]
    .map((match) => match[1]), [
    'issue97_frozen_manifest_pins',
    'issue97_frozen_manifest_members',
    'issue97_frozen_manifest_prestate',
    'issue97_frozen_manifest_receipt',
  ], 'manifest core temporary-table boundary drifted');
  assert.deepEqual([...executable.matchAll(/\binsert\s+into\s+([a-z0-9_]+)/g)]
    .map((match) => match[1]), ['issue97_frozen_manifest_pins'],
  'manifest core direct insert must target only its literal temporary pin table');
  for (const forbidden of [
    'brinesearch_issue97_activate_graph_build',
    'brinesearch_issue97_activate_state_candidate_manifest',
    'brinesearch_issue97_activate_cutover',
    'brinesearch_issue97_rebuild_county_graph',
    'brinesearch_issue97_refresh_exact_mappings_oh',
    'brinesearch_issue97_refresh_google_route',
    'brinesearch_issue97_reconcile',
  ]) assert.equal(calls(value, forbidden), 0, `manifest core forbids ${forbidden}`);

  requireTokens(value, [
    "current_setting('transaction_isolation')='serializable'",
    "current_setting('transaction_read_only')='off'",
    "set local statement_timeout='15min'",
    "set local lock_timeout='2min'",
    "'issue97-ohio-r3-frozen-wave-candidate'",
    "'77cb00cf83ad8bab4a45c9b552626f76'",
    "'1f49bcb8edfdc386105fe84727fd53448c277d37'",
    "'3014f559859d4980493fac5fca5c09eb458309c4'",
    "'5378340646'",
    "'c3f925954d41cb6fbd5939eca5de3288'",
    "'711b1ddd3ba6c47e7642fc700197432f'",
    "'450948793c57a9a1535139fac4974792'",
    "'5a75e5c4c34805b7dc2fdf8d0534a4f6'",
    "'7776affed9bb9dd931aa86116e490a68'",
    "'fd0a1f874a042ac532d3057ef0bedafb'",
    "'c41f5320-1273-470c-a316-28b42211d697'",
    "'9763dc5bb626da71881b7381ed28a436'",
    "'508fe45bbfa886beb892734a2c1284b8'",
    "'5653fb3e85b9a9962dbcc9f5af0329e7'",
    "'6471a34ccf42d058b846776d23cb0216'",
    "'4a0875ea950d93807180affc093a0448'",
    "'efc91280ee792db0bedf6415a0b2fb3b'",
    "'0720949a9b7a08e741a07979d0dd02be'",
    "'75d25d5298c59869b656bb9db3cc3fe2'",
  ], 'manifest core');
  assert.match(value,
    /from pg_catalog\.pg_trigger t[\s\S]*?left join trigger_expected expected[\s\S]*?c\.relname in\s*\([\s\S]*?state_candidate_manifests[\s\S]*?state_candidate_manifest_members/i,
    'manifest core must audit every noninternal trigger on both immutable tables');
  assert.match(value, /current_setting\('session_replication_role'\)='origin'/i,
    'manifest core must reject non-origin trigger execution mode');
  assert.match(value,
    /union[\s\S]*?jsonb_array_elements\s*\([\s\S]*?source_run_vector[\s\S]*?order by lock_scope\.dataset_id,lock_scope\.state_code,lock_scope\.county_code/i,
    'manifest core must lock all exact build source-vector scopes plus required Ohio scopes');
  assert.match(value, /\(select count\(\*\) from pg_catalog\.jsonb_object_keys\(review_details\)\)=31/i,
    'manifest core must bind the complete 31-key immutable review receipt');
  assert.doesNotMatch(value, /jsonb_object_length/i,
    'manifest core must not use the nonexistent PostgreSQL jsonb_object_length function');
  for (const flag of [
    'activation_authorized', 'activation_impact_reviewed',
    'route_reconciliation_authorized', 'private_google_refresh_authorized',
    'public_google_authorized', 'global_cutover_authorized',
  ]) assert.match(value, new RegExp(`'${flag}',false`), `manifest core must store ${flag}=false`);

  const order = [
    "hashtext('brinesearch:issue97:ohio-state-release')",
    '$issue97_frozen_manifest_graph_locks$',
    '$issue97_frozen_manifest_ingest_locks$',
    "hashtext('brinesearch:issue97:mapping-refresh')",
    "hashtext('brinesearch:issue97:saved-road-reconciliation')",
    '\\ir 37-frozen-mapping-wave-production-pins.sql',
    'select private_verification.brinesearch_issue97_persist_state_candidate_manifest(',
  ].map((token) => value.indexOf(token));
  assert.ok(order.every((at) => at >= 0) && order.every((at, index) => index === 0 || at > order[index - 1]),
    'manifest core lock, preflight, and persistence order drifted');
  assert.match(value,
    /pre\.graph_registry_digest=post\.graph_registry_digest[\s\S]*?pre\.mapping_digest=post\.mapping_digest[\s\S]*?pre\.route_digest=post\.route_digest[\s\S]*?pre\.google_receipt_digest=post\.google_receipt_digest/i,
    'manifest core must prove protected graph/mapping/route/Google state unchanged');
  assert.equal((value.match(/build\.id::text\|\|':'\|\|pg_catalog\.to_jsonb\(build\)::text/g) || []).length, 2,
    'manifest core must hash every column of every graph-build row before and after persistence');
}

function auditRehearsal(value) {
  const executable = maskSql(value).toLowerCase();
  assert.equal((executable.match(/\bbegin\b/g) ?? []).length, 2,
    'rehearsal must open exactly two transactions');
  assert.equal((executable.match(/\brollback\b/g) ?? []).length, 2,
    'rehearsal must roll back both transactions');
  assert.equal((executable.match(/\bcommit\b/g) ?? []).length, 0,
    'rehearsal must never commit');
  assert.equal((executable.match(/\bset\s+local\s+statement_timeout\s*=/g) ?? []).length, 2,
    'rehearsal must set one finite statement timeout per transaction');
  assert.equal((executable.match(/\bset\s+local\s+lock_timeout\s*=/g) ?? []).length, 2,
    'rehearsal must set one finite lock timeout per transaction');
  assert.equal(occurrences(value, '\\ir 38-frozen-wave-ohio-state-manifest-core.sql'), 1,
    'rehearsal must include the exact core once');
  requireTokens(value, [
    'begin isolation level serializable;',
    'begin isolation level repeatable read read only;',
    "set local statement_timeout='15min';",
    "set local statement_timeout='2min';",
    "set local lock_timeout='2min';",
    "'issue97-ohio-r3-frozen-wave-manifest-v1'",
    'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST_REHEARSAL|PASS|ROLLBACK_ONLY',
  ], 'rollback rehearsal');
  assert.doesNotMatch(executable, /\b(?:insert|update|delete|merge|truncate|create|alter|drop)\b/i,
    'rehearsal wrapper may not add SQL beyond the included core and rollback proof');
}

function auditPersist(value) {
  const executable = maskSql(value).toLowerCase();
  assert.equal((executable.match(/\bbegin\b/g) ?? []).length, 1,
    'permanent wrapper must open exactly one transaction');
  assert.equal((executable.match(/\bcommit\b/g) ?? []).length, 1,
    'permanent wrapper must commit exactly once');
  assert.equal((executable.match(/\brollback\b/g) ?? []).length, 0,
    'permanent wrapper must not contain a retry/rollback branch');
  assert.equal((executable.match(/\bset\s+local\s+statement_timeout\s*=/g) ?? []).length, 1,
    'permanent wrapper must set exactly one finite statement timeout');
  assert.equal((executable.match(/\bset\s+local\s+lock_timeout\s*=/g) ?? []).length, 1,
    'permanent wrapper must set exactly one finite lock timeout');
  assert.equal(occurrences(value, '\\ir 38-frozen-wave-ohio-state-manifest-core.sql'), 1,
    'permanent wrapper must include the exact core once');
  requireTokens(value, [
    'begin isolation level serializable;',
    "set local statement_timeout='15min';",
    "set local lock_timeout='2min';",
    "'issue97-ohio-r3-frozen-wave-manifest-v1'",
    'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST_PERSIST|COMMITTED',
  ], 'permanent wrapper');
  assert.doesNotMatch(executable, /\b(?:insert|update|delete|merge|truncate|create|alter|drop)\b/i,
    'permanent wrapper may not add SQL beyond the included core and commit');
}

function auditVerify(value) {
  assert.equal((value.match(/build\.id::text\|\|':'\|\|pg_catalog\.to_jsonb\(build\)::text/g) || []).length, 1,
    'postverify must hash every column of every protected graph-build row');
  assert.deepEqual(parseMembers(value, 'postcommit manifest members'), expectedMembers,
    'postcommit verifier exact 19-member authority drifted');
  assert.deepEqual(parseOldAffected(value), expectedOldAffected,
    'postcommit verifier exact prior affected authority drifted');
  const executable = maskSql(value).toLowerCase();
  assert.equal((executable.match(/\bbegin\b/g) ?? []).length, 1,
    'postcommit verifier must open one transaction');
  assert.equal((executable.match(/\bcommit\b/g) ?? []).length, 0,
    'postcommit verifier must never commit');
  assert.equal((executable.match(/\brollback\b/g) ?? []).length, 1,
    'postcommit verifier must roll back exactly once');
  assert.match(executable, /begin\s+isolation\s+level\s+repeatable\s+read\s+read\s+only\s*;/i,
    'postcommit verifier must be REPEATABLE READ READ ONLY');
  assert.doesNotMatch(executable,
    /\b(?:insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|copy|call|execute)\b/i,
    'postcommit verifier must remain observational');
  assert.equal(calls(value,
    'private_verification.brinesearch_issue97_graph_build_sources_current'), 1,
  'postcommit verifier must have one decisive sources-current call site');
  assert.equal(calls(value,
    'private_verification.brinesearch_issue97_graph_build_release_current'), 2,
  'postcommit verifier must have one main and one unexpected-build release-current call site');
  assert.equal(calls(value,
    'private_verification.brinesearch_issue97_dataset_scope_current'), 1,
  'postcommit verifier must have one bounded dataset-scope call site');
  assert.equal(calls(value,
    'private_verification.brinesearch_issue97_current_state_candidate_members'), 0,
  'postcommit verifier must not invoke the row-by-row state helper');
  assert.equal(calls(value,
    'private_verification.brinesearch_issue97_state_candidate_manifest_current'), 0,
  'postcommit verifier must not invoke duplicate manifest currentness reconstruction');
  assert.match(value,
    /case when pin\.kind='old_affected'[\s\S]*?graph_build_sources_current[\s\S]*?else private_verification\.brinesearch_issue97_graph_build_release_current[\s\S]*?end as decisive_current/i,
    'postcommit verifier must use the single-decision currentness matrix');
  assert.match(value,
    /currentness\.retained_rows=35[\s\S]*?currentness\.active_rows=19[\s\S]*?currentness\.validated_rows=16[\s\S]*?currentness\.unexpected_validated_rows=8[\s\S]*?currentness\.unexpected_not_false_rows=0/i,
    'postcommit verifier must reject every extra release-current validated build');
  assert.match(value,
    /active_counties\.expected_rows=19[\s\S]*?active_counties\.actual_rows=19[\s\S]*?active_counties\.exact as active_counties_ok/i,
    'postcommit verifier must bind the exact 19 active Ohio county registry');
  assert.match(value,
    /release_generation\.active_rows=1[\s\S]*?release_generation\.exact_rows=1[\s\S]*?as release_generation_ok/i,
    'postcommit verifier must bind the sole active release generation');
  assert.match(value,
    /and exists\s*\([\s\S]*?historical_members[\s\S]*?except[\s\S]*?eligible_members[\s\S]*?union all[\s\S]*?eligible_members[\s\S]*?except[\s\S]*?historical_members/i,
    'postcommit verifier must explicitly prove the historical manifest stale');
  assert.match(value, /from gate left join new_manifest manifest on true/i,
    'postcommit verifier must evaluate its fail-closed gate even when the new manifest is absent');
  for (const label of [
    'functions_ok', 'storage_guards_ok', 'replacements_ok', 'retained_ok', 'old_ok',
    'currentness_universe_ok', 'active_boundary_ok', 'active_counties_ok',
    'release_generation_ok', 'sources_ok',
    'manifests_ok', 'non_ohio_ok', 'isolation_ok',
  ]) assert.match(value, new RegExp(`not coalesce\\(${label},false\\)`),
    `postcommit fail-closed labels must include ${label}`);
  requireTokens(value, [
    "set local statement_timeout='15min'",
    "'issue97-ohio-r3-frozen-wave-candidate'",
    "'77cb00cf83ad8bab4a45c9b552626f76'",
    "'1f49bcb8edfdc386105fe84727fd53448c277d37'",
    "'5378340646'",
    "'7776affed9bb9dd931aa86116e490a68'",
    "'fd0a1f874a042ac532d3057ef0bedafb'",
    'ISSUE97_FROZEN_WAVE_OHIO_MANIFEST_VERIFY|',
  ], 'postcommit verifier');
  for (const token of [
    "'5653fb3e85b9a9962dbcc9f5af0329e7'",
    "'6471a34ccf42d058b846776d23cb0216'",
    "pg_catalog.current_setting('session_replication_role')='origin'",
    "(select count(*) from pg_catalog.jsonb_object_keys(review_details))=31",
    "pg_catalog.pg_try_advisory_xact_lock(",
    "coalesce(activity.query,'') ilike '%brinesearch_issue97_activate_graph_build%'",
  ]) assert.ok(value.includes(token), `postcommit verifier missing hardened token ${token}`);
  assert.doesNotMatch(value, /jsonb_object_length/i,
    'postcommit verifier must not use the nonexistent PostgreSQL jsonb_object_length function');
}

auditCore(source.core);
auditRehearsal(source.rehearse);
auditPersist(source.persist);
auditVerify(source.verify);

for (const row of expectedMembers) {
  const supportedTokens = row[1] === 'replacement' ? row.slice(2, 6) : row.slice(2, 5);
  for (const token of supportedTokens) assert.ok(source.pins.includes(token),
    `repository production pins do not support successor member token ${token}`);
}
for (const token of [
  'c3f925954d41cb6fbd5939eca5de3288',
  '711b1ddd3ba6c47e7642fc700197432f',
  '450948793c57a9a1535139fac4974792',
  '5a75e5c4c34805b7dc2fdf8d0534a4f6',
]) assert.ok(source.pins.includes(token), `repository production pins missing ${token}`);

const scriptName = 'verify:issue97-frozen-wave-state-manifest';
const scriptCommand = 'node v17/scripts/audit-issue97-frozen-wave-ohio-state-manifest.mjs';
assert.equal(packageJson.scripts?.[scriptName], scriptCommand,
  'package successor-manifest verification script is missing or drifted');
assert.equal(occurrences(source.package, `"${scriptName}"`), 1,
  'package successor-manifest script key must occur exactly once');
const build = packageJson.scripts.build.split(' && ');
const pinStep = 'npm run verify:issue97-frozen-wave-production-pins';
const manifestStep = `npm run ${scriptName}`;
assert.equal(build.filter((step) => step === manifestStep).length, 1,
  'build must execute successor-manifest verification exactly once');
assert.equal(build.indexOf(manifestStep), build.indexOf(pinStep) + 1,
  'successor-manifest verification must immediately follow production-pin verification');
assert.equal(packageJson.name, 'brinesearch');
assert.equal(packageJson.version, '17.3.31');
assert.deepEqual(packageJson.devDependencies, { vite: '^7.1.0' });
assert.equal(packageJson.dependencies, undefined,
  'manifest package must not introduce dependencies');

// Mutation sentinels prove the audit rejects the dangerous drift classes.
assert.equal(manifestModelPasses(expectedMembers), true);
assert.equal(manifestModelPasses(expectedMembers.slice(1)), false);
assert.equal(manifestModelPasses([...expectedMembers, expectedMembers[0]]), false);
assert.equal(manifestModelPasses(expectedMembers.map((row, index) => (
  index === 0 ? [...row.slice(0, 3), '00000000-0000-0000-0000-000000000000', ...row.slice(4)] : row
))), false);
assert.equal(manifestModelPasses(expectedMembers.map((row, index) => (
  index === 0 ? [...row.slice(0, 6), '00000000000000000000000000000000'] : row
))), false);
for (const mutated of [
  source.core.replace(expectedMembers[0][3], '00000000-0000-0000-0000-000000000000'),
  source.core.replace('\\ir 37-frozen-mapping-wave-production-pins.sql', ''),
  `${source.core}\ncommit;\n`,
  `${source.core}\ninsert into private_verification.forbidden values (1);\n`,
  source.core.replace(
    'select private_verification.brinesearch_issue97_persist_state_candidate_manifest(',
    'select public.brinesearch_issue97_activate_graph_build(',
  ),
]) assert.throws(() => auditCore(mutated));
assert.throws(() => auditRehearsal(source.rehearse.replace('rollback;', 'commit;')));
assert.throws(() => auditPersist(source.persist.replace('commit;', 'rollback;')));
for (const mutated of [
  source.verify.replace(expectedOldAffected[0][1], '00000000-0000-0000-0000-000000000000'),
  source.verify.replace('from gate left join new_manifest manifest on true',
    'from gate cross join new_manifest manifest'),
  source.verify.replace('rollback;',
    "select private_verification.brinesearch_issue97_state_candidate_manifest_current(null);\nrollback;"),
]) assert.throws(() => auditVerify(mutated));

console.log('Issue #97 frozen-wave Ohio state-manifest audit passed: exact 8+11 successor, immutable rollback/commit wrappers, and fail-closed postcommit verification.');
