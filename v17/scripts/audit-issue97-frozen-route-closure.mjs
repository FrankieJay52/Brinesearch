import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sqlPath = 'ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql';
const testPath = 'supabase/tests/issue97_frozen_route_closure_preinstall.sql';
const sql = readFileSync(sqlPath, 'utf8');
const test = readFileSync(testPath, 'utf8');
const md5 = (values) => createHash('md5').update([...values].sort().join('|')).digest('hex');
const uuids = (text) => [...text.matchAll(/'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'/g)].map((m) => m[1]);
const between = (text, start, end) => {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing frozen block ${start}`);
  return text.slice(a + start.length, b);
};

const finalRoutes = uuids(between(sql, '-- EXACT_FINAL_412_BEGIN', '-- EXACT_FINAL_412_END'));
assert.equal(finalRoutes.length, 412);
assert.equal(new Set(finalRoutes).size, 412);
assert.deepEqual(finalRoutes, [...finalRoutes].sort(), 'final UUID allowlist must be sorted');
assert.equal(md5(finalRoutes), '711b1ddd3ba6c47e7642fc700197432f');

const transitionOnly = `
0237aaa8-769f-42d0-bf76-660e45467ac4
1255a1d0-fff6-45bd-81cd-c8e854c9ec23
17461b0c-61f1-4960-93bf-2b73e1be336c
1f410075-fb69-4e48-a854-221a133380d0
206c6fe4-4282-42de-89db-c35566cceaa2
3a48446f-f4d6-4574-9d62-c2a0643f9462
3f06a12e-e128-4fa9-982a-965c1a7204ca
53319091-7b94-43e2-af8b-1a544255c64a
53643b41-d535-4b07-abe8-4fe9d9e8c831
5b64d2f5-3df2-4b39-8868-7c383d9c0918
5cd07214-4d94-4061-849b-2f228bfd8105
613a5a9a-8e00-4367-88ee-e1977ed45f09
61cd1cd6-6c30-4e8f-8a10-1d47f9f5690d
67ddaf5b-f34b-4bae-a4b6-aa774ce06d25
78fae1c9-5f87-409f-ab49-1429b2558975
86d86ac5-199c-4715-be36-785a13c1cf30
9487bb8e-cf34-4da0-bf9c-5a75bef4cdc9
94c18657-38da-402e-b678-11520768ce96
9a1c34b9-7110-4926-9d12-ea9de9359997
a0691079-a6d7-41c8-82de-f55f767dc7c6
b3dd5dee-5339-4628-9fff-da78488dd000
b41b4262-5d35-4588-8bff-4f06cbefc629
b7fedb52-d0ef-4c86-a5ff-6099016e42f5
bf8d7d07-ccf9-40a4-8903-fa36cd7aa624
cbe7c89b-d433-4ea8-9114-90dbf7397aca
db8deec0-ca56-4f13-b269-3f9b507e82ef
de30b941-703d-4f30-b2c4-93b78de03344
dfb3f204-190c-4d65-85b3-16bcd1715825
e5808459-ad54-4e21-9b1e-6b45c57a5f5d
e82b9222-3fbd-4edc-8984-017669195af9
f03e1196-9843-4a62-af08-b4c7eb681e38
f0f93b45-8c75-419c-bcf3-73b7e32c06b2
fd0b1343-e835-4d23-a1c5-ee08ebee01f6
`.trim().split('\n');
assert.equal(transitionOnly.length, 33);
for (const id of transitionOnly) assert.ok(finalRoutes.includes(id), `missing transition route ${id}`);
const former379 = finalRoutes.filter((id) => !transitionOnly.includes(id));
assert.equal(former379.length, 379);
assert.equal(md5(former379), '836c1f57210e4d18c0f60d4c1ea77d7d');
assert.notEqual(md5(former379), '711b1ddd3ba6c47e7642fc700197432f');

const validateFrozen = (ids, primary, alternate, digest) =>
  ids.length === 412 && new Set(ids).size === 412 && primary === 340 && alternate === 72 && md5(ids) === digest;
assert.equal(validateFrozen(finalRoutes, 340, 72, '711b1ddd3ba6c47e7642fc700197432f'), true);
assert.equal(validateFrozen(former379, 320, 59, '836c1f57210e4d18c0f60d4c1ea77d7d'), false);
assert.equal(validateFrozen(finalRoutes.slice(1), 339, 72, '711b1ddd3ba6c47e7642fc700197432f'), false);
assert.equal(validateFrozen([...finalRoutes, '00000000-0000-0000-0000-000000000000'], 340, 73, '711b1ddd3ba6c47e7642fc700197432f'), false);
assert.equal(validateFrozen(finalRoutes, 339, 73, '711b1ddd3ba6c47e7642fc700197432f'), false);
assert.equal(validateFrozen(finalRoutes, 340, 72, '00000000000000000000000000000000'), false);

const validateMappingState = ({
  migrationCount,
  validMigrationCount,
  exactVerifiedMappingCount,
  targetIdentityMappingCount,
  targetRoadMappingCount,
}) => migrationCount >= 0 && migrationCount <= 1
  && validMigrationCount === migrationCount
  && ((migrationCount === 0
    && exactVerifiedMappingCount === 0
    && targetIdentityMappingCount === 0
    && targetRoadMappingCount === 0)
    || (migrationCount === 1
      && exactVerifiedMappingCount === 46
      && targetIdentityMappingCount === 46
      && targetRoadMappingCount === 46));
const preinstallMappingState = {
  migrationCount: 0,
  validMigrationCount: 0,
  exactVerifiedMappingCount: 0,
  targetIdentityMappingCount: 0,
  targetRoadMappingCount: 0,
};
const installedMappingState = {
  migrationCount: 1,
  validMigrationCount: 1,
  exactVerifiedMappingCount: 46,
  targetIdentityMappingCount: 46,
  targetRoadMappingCount: 46,
};
assert.equal(validateMappingState(preinstallMappingState), true);
assert.equal(validateMappingState(installedMappingState), true);
assert.equal(validateMappingState({ ...installedMappingState, validMigrationCount: 0 }), false);
assert.equal(validateMappingState({ ...installedMappingState, targetIdentityMappingCount: 47 }), false);
assert.equal(validateMappingState({ ...installedMappingState, targetRoadMappingCount: 47 }), false);
assert.equal(validateMappingState({ ...installedMappingState, exactVerifiedMappingCount: 45 }), false);

const fixtures = [
  '86d86ac5-199c-4715-be36-785a13c1cf30',
  'dfb3f204-190c-4d65-85b3-16bcd1715825',
  'f03e1196-9843-4a62-af08-b4c7eb681e38',
];
for (const fixture of fixtures) assert.ok(finalRoutes.includes(fixture));

const builds = [
  ['BEL', '24ffa531-0e69-4625-a137-da52020e6fd0', 'fc6dcbc8482b2e5c89f4069941c557de'],
  ['CAR', '5ee5f97b-447f-41d3-946a-68a8b28d8367', 'e9f4ed56bb2b1308b8b9913a751c78f5'],
  ['COL', 'c9f50b03-4328-4d8b-9995-4dc8bc85dd01', 'c13278c74933205f5c55cdf85f23f27e'],
  ['GUE', '84568854-3257-46b7-8581-374dc620ef16', 'b11b2f5ac3c1c5d492c2233494706f4c'],
  ['HAS', '542c35d5-a9ba-4b43-8a64-63a66f6b29e2', '1d8f6a52d2541e313932906f944b2f92'],
  ['JEF', 'cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4', '06e8bd25f7fb46fe750214dd77e2b67d'],
  ['MOE', 'ab9f4083-d572-4d9d-8e0a-28ebb77517e7', '69010044273a611876c3a8ace7c198a2'],
  ['NOB', '70f30495-860a-4199-9360-8e880f3b515b', 'eefc679ed36e6aba3a590c7ba2c9e541'],
];
const replacedGraphRows = [...between(
  sql,
  '-- EXACT_REPLACED_GRAPHS_BEGIN',
  '-- EXACT_REPLACED_GRAPHS_END',
).matchAll(/\('([A-Z]{3})','([0-9a-f-]{36})'::uuid,'([0-9a-f]{32})'\)/g)]
  .map((match) => match.slice(1));
assert.equal(replacedGraphRows.length, 8, 'replaced graph allowlist must contain exactly eight rows');
assert.deepEqual(replacedGraphRows, builds, 'replaced graph allowlist must equal the reviewed eight tuples');
for (const [county, id, digest] of builds) {
  assert.ok(sql.includes(`('${county}','${id}'::uuid,'${digest}')`));
}

for (const required of [
  "affected.build_id=transition.graph_build_id",
  "name='issue97_frozen_exact_mapping_wave'",
  'pg_catalog.cardinality(statements)=1',
  'target_identity_mapping_count=46',
  'target_road_mapping_count=46',
  "build.state_code='OH'",
  "build.status='active'",
  "build.graph_digest=expected.graph_digest",
  "build.activated_at='2026-08-16 11:08:18.355674+00'::timestamptz",
  'brinesearch_issue97_graph_build_release_current(build.id)',
  'except select route_prep_id from derived_routes',
  'except select route_prep_id from frozen_routes',
  'post_mapping_install',
  'post_eight_dark_candidates',
  'pre_ohio_activation',
  'occurrence_geometry_receipts',
  'brinesearch_google_route_receipts',
  'approved-corridor',
  'saved-occurrence',
  'new-candidate',
  'reconciliation_manifest as (',
  "'reconciliation_manifest_count',412",
  "'reconciliation_manifest_digest','711b1ddd3ba6c47e7642fc700197432f'",
  "'caller_route_ids_allowed',false",
  "'exact_new_candidate_build_pins_required_before_activation',true",
]) assert.ok(sql.includes(required), `missing contract token: ${required}`);

assert.doesNotMatch(sql, /transition\.graph_digest\s*=/i);
assert.doesNotMatch(sql, /reconcile_route_corpus|run_all_pad_routing_pipeline|rebuild_county_graph|activate_graph_build|refresh_google_route/i);
assert.doesNotMatch(sql, /\b(?:create|insert|update|delete|merge|commit)\b\s+(?:table|into|public\.|private_verification\.)/i);
assert.match(sql, /1\/\(\(all_ok is true\)::integer\) contract_pass/);
assert.match(sql, /corridor_table is null/);
assert.match(sql, /unpinned_current_candidates=0/);
assert.match(test, /begin isolation level repeatable read read only;/i);
assert.match(test, /statement_timeout='15min'/i);
assert.match(test, /lock_timeout='2min'/i);
assert.equal((test.match(/\brollback\s*;/gi) || []).length, 1);
assert.equal((test.match(/\bcommit\s*;/gi) || []).length, 0);
assert.match(test, /version='20260817193212'\)<>0/);
assert.match(test, /brinesearch_driver_google_routes_public\)<>0/);
assert.match(test, /brinesearch_issue97_cutover_active\(\)/);
assert.match(test, /application_name like 'brinesearch-issue97-%'/);

console.log('Issue #97 exact 412-route closure audit passed.');
console.log('  Leg A: 379 (320 primary / 59 alternate; historical only)');
console.log('  transition-only: 33 (20 primary / 13 alternate)');
console.log('  final: 412 (340 primary / 72 alternate; 711b1ddd3ba6c47e7642fc700197432f)');
