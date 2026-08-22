import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sqlPath = path.join(
  root,
  'ops/issue97-computer-rollout/sql/43-activate-frozen-wave-ohio-successors.sql',
);
const authorityPath = path.join(
  root,
  'ops/issue97-computer-rollout/sql/42-extract-frozen-wave-ohio-activation-authority.sql',
);
const sql = fs.readFileSync(sqlPath, 'utf8').replaceAll('\r\n', '\n');
const authority = fs.readFileSync(authorityPath, 'utf8').replaceAll('\r\n', '\n');

const md5 = value => crypto.createHash('md5').update(value).digest('hex');
const count = (source, token) => source.split(token).length - 1;
const between = (source, start, end) => {
  const left = source.indexOf(start);
  const right = source.indexOf(end, left + start.length);
  assert.ok(left >= 0 && right > left, `missing block ${start} .. ${end}`);
  return source.slice(left + start.length, right);
};
const expectFailure = (label, mutated) => {
  assert.throws(() => audit(mutated), undefined, `mutation survived: ${label}`);
};

const expectedSuccessors = [
  ['BEL', '1c1320b3-4257-4239-9c55-b18a801aa97e', '24ffa531-0e69-4625-a137-da52020e6fd0', '269e903e991f1790bf5d1428e4c2bb43', '59e4d0079a9114a622ca6021d557cc07', 'b20843ddf3d2a648b8d53a0b3eb1a1c2', 5687, 3001, 4878, 112, 9912],
  ['CAR', '8e565c14-33a4-4862-9bf8-be9b5557b293', '5ee5f97b-447f-41d3-946a-68a8b28d8367', '2943504592861b83abce581f29a1cacb', '07dd91d21b7e757d3bf5f20db54ea579', '8405344f91e795398ab261a51f2a03bf', 2640, 1553, 2522, 90, 5251],
  ['COL', 'b86d14c7-5c8a-4cb9-8a3b-903965340678', 'c9f50b03-4328-4d8b-9995-4dc8bc85dd01', '6bd88992a7a63c9643d1a6f1535ca2af', '89fbad6cfcc8e62c6e600a406f243d08', '44b4e720a523face3149d7dbdc8a298b', 5754, 3006, 5091, 126, 10812],
  ['GUE', '44245144-3e39-45fe-907b-95e2b01b9c32', '84568854-3257-46b7-8581-374dc620ef16', 'd7a43bacbf54794d4e92d9e8ceca2e28', '02cc95bbbacaaa969a8e8420ae4987e1', 'b0cc4e8e3aaa7121cc39cc7935189664', 3648, 2079, 2995, 101, 6433],
  ['HAS', '0870470a-11f8-4f33-8af3-08d6849d5f34', '542c35d5-a9ba-4b43-8a64-63a66f6b29e2', 'fc53a1492a3eecab78a524dbadcddfe8', 'd814298cc86b83ea2cb5938dd8e978dd', 'ece929162c9063ea35a6a276de59a940', 2336, 1013, 1746, 57, 3550],
  ['JEF', 'c9bac3a2-82d4-4b76-813c-6a29c1bf062a', 'cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4', 'ce2de7721f56a145b21ddded270f07fd', '6c95c0985714405f2af340e9d7c7c924', '0d40dc262b0097cf48783f7271531153', 4135, 2187, 3498, 69, 7116],
  ['MOE', '8493f66b-b3d2-4673-be8a-07b024b9723d', 'ab9f4083-d572-4d9d-8e0a-28ebb77517e7', 'fafd62f37b76e57859164010d1be967b', '2e2fc9e336115c9fd5fced5a69f5a9ad', '5a82a31c86fdd78804bf113f73e49694', 2264, 1250, 1715, 32, 3504],
  ['NOB', '200d56dc-5b13-4f84-82cb-946b8ebeada2', '70f30495-860a-4199-9360-8e880f3b515b', '576c5e1b1012fcb8020fa637fb272082', '821c52a3c9090067a8496847ee1b1172', '795f812c7a9042318196195cccccf3a4', 1959, 1030, 1381, 40, 2841],
];

const expectedRetained = [
  ['ATH', '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb'],
  ['COS', '7c979743-72e4-42a2-a6a9-006a369168c0'],
  ['MAH', '360472bf-cb96-4ba7-b2fe-efa04e230f69'],
  ['MEG', 'e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048'],
  ['MUS', '98ae1835-1064-4c18-a8a7-9a9e570e212d'],
  ['POR', 'c645a8bf-a920-432a-a341-a7b60d9cfd49'],
  ['STA', '67541fad-5cf2-4483-b0f6-f4060197fda9'],
  ['TRU', '3c94b14c-9d9e-41ec-a897-b754dab6d8dd'],
  ['TUS', 'fd6fdfff-f23f-42cc-a633-64448bd9d044'],
  ['VIN', '785f5277-369c-4ae3-ba80-31411745e46d'],
  ['WAS', '90982f30-8a06-4a53-8b4b-9efd5d9042bf'],
];

const expectedPads = [
  '69c63442-de05-4d15-95da-07da587bc070',
  '6ef0746f-341a-4d29-9399-a81cfbec11e8',
  '75600d0c-17b8-488b-96c9-4b7b8ffc8b1b',
  'b6dae008-74d4-4976-9c72-fba7ae349c50',
  'b7526e45-0b33-4988-ae1c-0a4140971f8e',
  'd7898e8c-1bb6-48f8-b5e0-87bc1898420e',
  'e2b32e85-9e93-4388-8215-9d8167cbbeb8',
  'f896d00c-da26-41b6-bf5b-e9d91afbdbc6',
  'fcbf5085-4ba2-496d-9c20-516e8b52f9bd',
];

const protectedRelations = [
  'public.brinesearch_route_prep',
  'public.brinesearch_route_prep_steps',
  'public.brinesearch_pad_roads',
  'private_verification.brinesearch_route_occurrence_candidates_issue97',
  'private_verification.brinesearch_route_occurrence_receipts_issue97',
  'private_verification.brinesearch_route_occurrence_receipt_history_issue97',
  'private_verification.brinesearch_route_reconciliation_receipts_issue97',
  'private_verification.brinesearch_route_reconciliation_history_issue97',
  'private_verification.brinesearch_route_transition_receipts_issue97',
  'private_verification.brinesearch_route_transition_history_issue97',
  'private_verification.brinesearch_route_occurrence_geometry_receipts_issue97',
  'private_verification.brinesearch_route_occurrence_geometry_history_issue97',
  'public.brinesearch_road_junctions',
  'public.brinesearch_road_junction_anchors',
  'public.brinesearch_road_junction_memberships',
  'public.pads',
  'private_verification.brinesearch_google_route_receipts_issue97',
  'private_verification.brinesearch_google_route_refresh_queue_issue97',
  'public.brinesearch_driver_google_routes_public',
  'public.public_pad_detail',
  'public.pad_verification_status',
  'public.pad_edit_history',
  'private_verification.brinesearch_issue97_saved_road_release_baseline',
  'private_verification.brinesearch_issue97_saved_road_reconciliation_runs',
  'private_verification.brinesearch_issue97_saved_road_reconciliation',
  'private_verification.brinesearch_issue97_state_candidate_manifests',
  'private_verification.brinesearch_issue97_state_candidate_manifest_members',
  'public.brinesearch_road_identity_mappings',
];

const parseSuccessors = source => {
  const block = between(
    source,
    'insert into issue97_successors values',
    'create temporary table issue97_retained',
  );
  const pattern = /\(\d+,'([A-Z]{3})','([0-9a-f-]{36})','([0-9a-f-]{36})','([0-9a-f]{32})','([0-9a-f]{32})','([0-9a-f]{32})',(\d+),(\d+),(\d+),(\d+),(\d+)\)/g;
  return [...block.matchAll(pattern)].map(match => [
    ...match.slice(1, 7),
    ...match.slice(7).map(Number),
  ]);
};

const parseRetained = source => {
  const block = between(
    source,
    'insert into issue97_retained values',
    'create temporary table issue97_google_pads',
  );
  return [...block.matchAll(/\(\d+,'([A-Z]{3})','([0-9a-f-]{36})'/g)]
    .map(match => [match[1], match[2]]);
};

const parsePads = source => {
  const block = between(
    source,
    'insert into issue97_google_pads values',
    'create temporary table issue97_expected_members',
  );
  return [...block.matchAll(/'([0-9a-f-]{36})'/g)].map(match => match[1]);
};

function audit(source) {
  assert.deepEqual(parseSuccessors(source), expectedSuccessors);
  assert.deepEqual(parseRetained(source), expectedRetained);
  assert.deepEqual(parsePads(source), expectedPads);
  assert.equal(new Set(expectedSuccessors.flatMap(row => [row[1], row[2]])).size, 16);
  assert.equal(new Set(expectedRetained.map(row => row[1])).size, 11);
  assert.equal(new Set(expectedPads).size, 9);

  const candidateDigest = md5(
    expectedSuccessors
      .toSorted((left, right) => left[0].localeCompare(right[0]))
      .map(row => `${row[0]}:${row[1]}:${row[3]}:${row[4]}:${row[5]}`)
      .join('|'),
  );
  assert.equal(candidateDigest, 'c3f925954d41cb6fbd5939eca5de3288');
  assert.ok(source.includes("<>'c3f925954d41cb6fbd5939eca5de3288'"));

  const authorityCandidates = between(
    authority,
    '-- ISSUE97_ACTIVATION_CANDIDATES_BEGIN',
    '-- ISSUE97_ACTIVATION_CANDIDATES_END',
  );
  for (const row of expectedSuccessors) {
    assert.ok(authorityCandidates.includes(`'${row[0]}'`));
    assert.ok(authorityCandidates.includes(row[1]));
  }
  const authorityOld = between(
    authority,
    '-- ISSUE97_ACTIVATION_OLD_BUILDS_BEGIN',
    '-- ISSUE97_ACTIVATION_OLD_BUILDS_END',
  );
  for (const row of expectedSuccessors) assert.ok(authorityOld.includes(row[2]));
  const authorityPads = between(
    authority,
    '-- ISSUE97_ACTIVATION_GOOGLE_PADS_BEGIN',
    '-- ISSUE97_ACTIVATION_GOOGLE_PADS_END',
  );
  for (const pad of expectedPads) assert.ok(authorityPads.includes(pad));

  for (const stale of [
    '72af99f3-a6a7-413e-856d-361fc08215ec',
    '6453ddbd-d2f5-4c0f-9228-8dba5ef17751',
    '0924d44d-15b3-4eb0-921c-8418a0d810e9',
  ]) assert.ok(!source.includes(stale), `discarded authority present: ${stale}`);

  for (const token of [
    "\\set issue97_activation_commit false",
    "lower(:'issue97_activation_commit') in ('true','false','on','off','1','0')",
    'begin isolation level read committed;',
    "set local statement_timeout='15min'",
    "set local lock_timeout='2min'",
    'set local synchronous_commit=on',
    "hashtext('brinesearch:issue97:ohio-state-release')",
    "hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)",
    "hashtextextended('brinesearch:issue97:route-corpus',97)",
    "hashtext('brinesearch:issue97:saved-road-reconciliation')",
    "hashtext('brinesearch:issue97:mapping-refresh')",
    'issue97_pre_active_members',
    'successor.old_build_id as build_id',
    'select county_code,build_id from issue97_pre_active_members',
    'select county_code,build_id from issue97_expected_members',
    "manifest_key='issue97-ohio-r3-frozen-wave-candidate'",
    "manifest_digest='77cb00cf83ad8bab4a45c9b552626f76'",
    'brinesearch_issue97_state_candidate_manifest_integrity(v_manifest.id)',
    'brinesearch_issue97_state_candidate_manifest_current(v_manifest.id)',
    "v_target_digest<>'3ef4ff5b89cc5cb974cf7601347923bb'",
    "v_non_target_digest<>'b38ea0d39e75cd30cfc54a9469e485b7'",
    "v_retained_digest<>'10b7c0f2fb42c03a49b19f37cc1bca6c'",
    "'392C1881B8DFD2D80190A29EBA8ECD2982A9C02A691A4062348BB2E84695B67F'",
    "v_function.definition_md5<>'73eb9adbfd16ea671873da7b4e495f73'",
    "v_function.catalog_md5<>'3b6e0ea1fb1da8fe88bc67f3c5169a62'",
    "v_function.definition_md5<>'f6763925461111b2069bde0f60007dd4'",
    "v_function.catalog_md5<>'3cb37659bb973f4f753301352574f6d7'",
    'create temporary table issue97_authorizer_original(',
    'execute original.definition;',
    'candidate authorizer was not restored exactly',
    'p_build_id=any(array[',
    'result:=public.brinesearch_issue97_activate_graph_build(',
    "result->>'impact_digest'<>'d751713988987e9331980363e24189ce'",
    "'status','retired'",
    "'status','active','activated_at',pg_catalog.transaction_timestamp()",
    'is distinct from expected_row',
    'protected activation collateral changed',
    'protected sequence state changed',
    "'route_relations_changed',false,'google_queue',0,'public_google',0",
    "'cutover',false",
    '\\if :issue97_control_commit_requested',
    'ISSUE97_FROZEN_WAVE_OHIO_ATOMIC_SWITCH_REHEARSAL_ROLLED_BACK',
    'ISSUE97_FROZEN_WAVE_OHIO_ATOMIC_SWITCH_COMMITTED',
  ]) assert.ok(source.includes(token), `missing atomic activation control: ${token}`);

  assert.equal(count(source, 'begin isolation level read committed;'), 1);
  assert.equal(count(source.toLowerCase(), '\n  commit;'), 1);
  assert.equal(count(source.toLowerCase(), '\n  rollback;'), 1);
  assert.equal(count(source, 'result:=public.brinesearch_issue97_activate_graph_build('), 1);
  assert.equal(
    [...source.matchAll(/\b(?:result:=|perform|select)\s*public\.brinesearch_issue97_activate_graph_build\s*\(/gi)].length,
    1,
    'there must be one installed activation call site',
  );
  assert.equal(count(source, 'create or replace function private_verification.brinesearch_issue97_candidate_manifest_authorizes_build('), 1);
  assert.equal(count(source, 'execute original.definition;'), 1);
  assert.equal(count(source, 'is distinct from expected_row'), 2,
    'both predecessor and successor rows require byte-exact poststate checks');
  assert.equal(count(source, 'successor.old_build_id as build_id'), 1);
  assert.equal(count(source, 'select county_code,build_id from issue97_pre_active_members'), 2,
    'preflight must compare both directions against predecessors plus retained');
  assert.equal(count(source, 'select county_code,build_id from issue97_expected_members'), 2,
    'postcheck must compare both directions against successors plus retained');
  assert.equal(count(source, 'do $snapshot_'), 2);
  assert.equal(count(source, "insert into issue97_protected_snapshot values("), 2);
  assert.equal(count(source, "'before',relation_row.ordinal"), 1);
  assert.equal(count(source, "'after',relation_row.ordinal"), 1);

  const relationBlock = between(
    source,
    'insert into issue97_protected_relations values',
    'create temporary table issue97_protected_snapshot',
  );
  for (const relation of protectedRelations) {
    const [schema, table] = relation.split('.');
    assert.ok(relationBlock.includes(`'${schema}','${table}'`), `unprotected ${relation}`);
  }
  assert.equal([...relationBlock.matchAll(/\(\d+,'[^']+','[^']+'\)/g)].length, 28);
  assert.ok(source.includes("phase='after')<>28"));
  assert.equal(count(source, "'public.pad_edit_history_id_seq'"), 2);

  const lockOrder = [
    'ohio-state-release',
    'all-pad-routing-pipeline',
    'route-corpus',
    'saved-road-reconciliation',
    'mapping-refresh',
    'do $locks$',
  ].map(token => source.indexOf(token));
  assert.ok(lockOrder.every(index => index >= 0));
  assert.deepEqual(lockOrder, lockOrder.toSorted((left, right) => left - right));

  for (const forbidden of [
    /\bbrinesearch_issue97_rebuild_county_graph\s*\(/i,
    /\bbrinesearch_issue97_reconcile_route_corpus\s*\(/i,
    /\bbrinesearch_issue97_refresh_(?:occurrence|route|transition|google|saved)/i,
    /\bbrinesearch_issue97_hold_google_route\s*\(/i,
    /\bbrinesearch_issue97_activate_cutover\s*\(/i,
    /\bbrinesearch_issue97_persist_state_candidate_manifest\s*\(/i,
    /\bbrinesearch_publish_structured_route/i,
    /\bpg_(?:terminate|cancel)_backend\s*\(/i,
    /\\(?:ir|i|include)\b/i,
  ]) assert.doesNotMatch(source, forbidden);

  for (const statement of source.matchAll(/^\s*(insert|update|delete|merge|copy)\s+(?:into\s+|from\s+)?([^\s(;]+)/gim)) {
    const verb = statement[1].toLowerCase();
    const target = statement[2].replaceAll('"', '').toLowerCase();
    assert.equal(verb, 'insert', `direct ${verb} is forbidden`);
    assert.match(target, /^issue97_/, `persistent DML target is forbidden: ${target}`);
  }

  assert.equal(count(source, 'execute pg_catalog.format('), 2);
  assert.equal(count(source, 'execute '), 3);
  assert.ok(source.indexOf('do $preflight$') < source.indexOf('create or replace function private_verification'));
  assert.ok(source.indexOf('do $restore_authorizer$') < source.indexOf('do $postcheck$'));
  assert.ok(source.indexOf('do $postcheck$') < source.indexOf('\\if :issue97_control_commit_requested'));
  return true;
}

audit(sql);

expectFailure('successor missing', sql.replace(expectedSuccessors[0][1], '11111111-1111-4111-8111-111111111111'));
expectFailure('preactive set swapped to successors', sql.replace(
  'select county_code,build_id from issue97_pre_active_members\n     except select county_code,id',
  'select county_code,build_id from issue97_expected_members\n     except select county_code,id',
));
expectFailure('preactive set definition weakened', sql.replace(
  'successor.old_build_id as build_id',
  'successor.build_id as build_id',
));
expectFailure('unsafe default commit', sql.replace('\\set issue97_activation_commit false', '\\set issue97_activation_commit true'));
expectFailure('rollback removed', sql.replace('  rollback;', '  select 1;'));
expectFailure('second activation call', sql.replace(
  'end\n$activate$;',
  "perform public.brinesearch_issue97_activate_graph_build('1c1320b3-4257-4239-9c55-b18a801aa97e',null,'{}');\nend\n$activate$;",
));
expectFailure('manifest digest altered', sql.replaceAll('77cb00cf83ad8bab4a45c9b552626f76', '00000000000000000000000000000000'));
expectFailure('authority receipt altered', sql.replaceAll('392C1881B8DFD2D80190A29EBA8ECD2982A9C02A691A4062348BB2E84695B67F', '0'.repeat(64)));
expectFailure('activation hash weakened', sql.replace("v_function.definition_md5<>'73eb9adbfd16ea671873da7b4e495f73'", 'false'));
expectFailure('authorizer restore removed', sql.replace('execute original.definition;', 'perform true;'));
expectFailure('protected relation removed', sql.replace("  (12,'private_verification','brinesearch_route_occurrence_geometry_history_issue97'),\n", ''));
expectFailure('post collateral gate removed', sql.replace('protected activation collateral changed', 'collateral ignored'));
expectFailure('cross-phase route writer inserted', sql.replace('do $postcheck$', 'select private_verification.brinesearch_issue97_reconcile_route_corpus(null);\ndo $postcheck$'));
expectFailure('cross-phase Google writer inserted', sql.replace('do $postcheck$', "select private_verification.brinesearch_issue97_refresh_google_route('69c63442-de05-4d15-95da-07da587bc070');\ndo $postcheck$"));
expectFailure('target exact-row gate removed', sql.replace('is distinct from expected_row', 'is null'));

console.log('Issue #97 frozen-wave Ohio atomic activation audit passed.');
console.log('  exact switch: 8 successors / 8 predecessors / 11 retained; zero impacts');
console.log('  default: full rehearsal + ROLLBACK; explicit boolean required for COMMIT');
console.log('  protected: 28 relations, 5 sequences, authorizer byte-restored, Google/public/cutover dark');
