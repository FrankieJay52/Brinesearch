import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const sqlPath = 'ops/issue97-computer-rollout/sql/45-refresh-frozen-wave-nine-private-google-holds-and-spot-check.sql';
const sql = fs.readFileSync(sqlPath, 'utf8').replaceAll('\r\n', '\n');

const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
const stripComments = (value) => value
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--[^\n]*/g, '');
const need = (value, token, label) => assert.ok(value.includes(token), `missing ${label}`);
const forbid = (value, pattern, label) => assert.ok(!pattern.test(value), `forbidden ${label}`);
const marked = (value, begin, end, label) => {
  const start = value.indexOf(begin);
  const finish = value.indexOf(end);
  assert.ok(start >= 0 && finish > start, `missing ${label} markers`);
  return value.slice(start + begin.length, finish);
};

const expectedNine = [
  [1, '69c63442-de05-4d15-95da-07da587bc070', 'ascent--shutway', 'SHUTWAY', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0, 'da4bfcb7-65c9-48e8-bb90-253c6ceee755', 'untouched_394'],
  [2, '6ef0746f-341a-4d29-9399-a81cfbec11e8', 'ascent--scout', 'SCOUT', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0, 'ed9cd4bb-74ca-48f0-8994-8d39aa2f5e68', 'frozen_412'],
  [3, '75600d0c-17b8-488b-96c9-4b7b8ffc8b1b', 'ascent--pickens', 'PICKENS', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0, 'bee7fa0b-8ad8-4f44-9bbb-e55d4cdfc6ab', 'untouched_394'],
  [4, 'b6dae008-74d4-4976-9c72-fba7ae349c50', 'ascent--besece', 'BESECE', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0, '4b6160ce-c46e-4e7b-a146-d420c2a77cb6', 'frozen_412'],
  [5, 'b7526e45-0b33-4988-ae1c-0a4140971f8e', 'ascent--banjo', 'BANJO', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0, '20bc6634-c5de-46bd-9da7-e0785a3796fe', 'untouched_394'],
  [6, 'd7898e8c-1bb6-48f8-b5e0-87bc1898420e', 'ascent--bakos', 'BAKOS', '9acadc48-c230-5e7b-6f2a-0a77f86f625c', 'bbfacbaf-86be-4818-8541-61a697c71199', 1, '86d86ac5-199c-4715-be36-785a13c1cf30', 'frozen_412'],
  [7, 'e2b32e85-9e93-4388-8215-9d8167cbbeb8', 'ascent--cologie', 'COLOGIE', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0, 'dfb3f204-190c-4d65-85b3-16bcd1715825', 'frozen_412'],
  [8, 'f896d00c-da26-41b6-bf5b-e9d91afbdbc6', 'ascent--blayney', 'BLAYNEY', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0, 'c862dee4-41cb-4070-952a-55719ac0d915', 'untouched_394'],
  [9, 'fcbf5085-4ba2-496d-9c20-516e8b52f9bd', 'ascent--jennings', 'JENNINGS', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0, '9c3da66f-4a4f-48f3-a4fd-a70eef82d92c', 'frozen_412'],
];

const parseNine = (value) => {
  const block = marked(value, '-- ISSUE97_PRIVATE_GOOGLE_NINE_BEGIN', '-- ISSUE97_PRIVATE_GOOGLE_NINE_END', 'private Google nine');
  const rowPattern = /\((\d+),'([0-9a-f-]{36})','([^']+)','([^']+)',\s*'([0-9a-f-]{36})','([0-9a-f-]{36})',(\d+),\s*'([0-9a-f-]{36})','(frozen_412|untouched_394)'\)/g;
  return [...block.matchAll(rowPattern)].map((match) => [
    Number(match[1]), match[2], match[3], match[4], match[5], match[6],
    Number(match[7]), match[8], match[9],
  ]);
};

function validate(value) {
  const clean = stripComments(value);
  const rows = parseNine(value);
  assert.deepEqual(rows, expectedNine, 'canonical nine pad/tuple/route rows drifted');
  assert.equal(new Set(rows.map((row) => row[1])).size, 9, 'duplicate pad UUID');
  assert.equal(new Set(rows.map((row) => row[7])).size, 9, 'duplicate primary route UUID');
  assert.equal(rows.filter((row) => row[8] === 'frozen_412').length, 5, 'frozen/untouched split drifted');
  assert.equal(md5([...rows].sort((a, b) => a[1].localeCompare(b[1])).map((row) => row[1]).join('|')),
    '450948793c57a9a1535139fac4974792', 'canonical pad digest drifted');
  assert.equal(md5([...rows].sort((a, b) => a[1].localeCompare(b[1]))
    .map((row) => `${row[1]}:${row[4]}:${row[5]}:${row[6]}`).join('|')),
  '5a75e5c4c34805b7dc2fdf8d0534a4f6', 'canonical dependency tuple digest drifted');

  for (const token of [
    "\\set issue97_commit 0",
    "select :'issue97_commit' in ('0','1')",
    '\\if :issue97_commit\ndo $issue97_refresh_exact_nine_private_google$',
    'writer_functions_called\',false',
    "'sequence_advance',false",
    'begin isolation level read committed;',
    "set local statement_timeout='30min';",
    "pg_catalog.hashtext('brinesearch:issue97:ohio-state-release')",
    "pg_catalog.hashtextextended('brinesearch:issue97:all-pad-routing-pipeline',97)",
    "pg_catalog.hashtextextended('brinesearch:issue97:route-corpus',97)",
    "pg_catalog.hashtext('brinesearch:issue97:saved-road-reconciliation')",
    "pg_catalog.hashtext('brinesearch:issue97:mapping-refresh')",
    "'2d3c4c7f7b8e21af7ec4d7aaad612c12'",
    "'1ef4015c-b1ae-45d2-8baa-86c47c561f54'",
    "'77cb00cf83ad8bab4a45c9b552626f76'",
    'private_verification.brinesearch_issue97_refresh_google_route_transition_dark(',
    'private_verification.brinesearch_issue97_transition_google_dark_current(',
    'before_state.route_receipt_digest',
    'before_state.route_history_digest',
    'sequence_before.route_history_last_value',
    'sequence_before.pad_history_last_value',
    'before_state.non_target_google_digest',
    'before_state.pad_digest',
    'before_state.graph_digest',
    'before_state.public_google_digest',
    'before_state.queue_rows',
    "'FROZEN_WAVE_NINE_PRIVATE_GOOGLE_REFRESH_COMPLETE'",
    "'FROZEN_WAVE_NINE_PRIVATE_GOOGLE_PREFLIGHT_COMPLETE'",
  ]) need(value, token, token);

  const writer = marked(value,
    '\\if :issue97_commit\ndo $issue97_refresh_exact_nine_private_google$',
    '$issue97_refresh_exact_nine_private_google$;', 'commit-only writer');
  assert.equal((writer.match(/brinesearch_issue97_refresh_google_route_transition_dark\s*\(/g) || []).length,
    1, 'private-dark generator must occur exactly once in the ordered loop');
  assert.equal((clean.match(/brinesearch_issue97_refresh_google_route_transition_dark\s*\(/g) || []).length,
    1, 'private-dark generator escaped commit-only writer block');

  const fixtureBlock = marked(value, '-- ISSUE97_SPOT_FIXTURES_BEGIN', '-- ISSUE97_SPOT_FIXTURES_END', 'spot fixtures');
  for (const token of [
    "'ascent--cologie','COLOGIE','Ascent',\n    'e2b32e85-9e93-4388-8215-9d8167cbbeb8','dfb3f204-190c-4d65-85b3-16bcd1715825'",
    "'ascent--cooper','COOPER','Ascent',\n    '852a50cf-855e-4ebc-96db-19edd085b083','5f3dd419-e78c-4623-88a7-0937f62b9903'",
    "'ascent--lorraine','LORRAINE','Ascent',null,null",
  ]) need(fixtureBlock, token, `spot fixture ${token.slice(0, 24)}`);
  assert.equal((fixtureBlock.match(/\(\d+,'ascent--/g) || []).length, 3, 'spot fixture count drifted');
  need(value, "where pad.legacy_id=fixture.legacy_id and pad.pad_name=fixture.pad_name", 'strict fixture identity predicate');
  need(value, "and not coalesce(pad.list_only,false))<>1", 'strict one-row fixture gate');
  assert.match(value, /receipt\.resolution_method in\s*\('name_only','fuzzy_name','nearest_road','route_number_only'\)/,
    'missing occurrence no-guess gate');

  assert.equal((clean.match(/^\s*commit\s*;/gm) || []).length, 1, 'exactly one commit required');
  assert.equal((clean.match(/^\s*rollback\s*;/gm) || []).length, 1, 'exactly one rollback required');
  assert.equal((clean.match(/^\s*begin\s+isolation\s+level\s+read\s+committed\s*;/gmi) || []).length, 1,
    'exactly one transaction required');
  assert.equal((clean.match(/\\if\s+:issue97_commit/g) || []).length, 1, 'one commit gate required');

  for (const match of clean.matchAll(/\binsert\s+into\s+([a-z0-9_.]+)/gi)) {
    assert.ok(match[1].startsWith('tmp_issue97_'), `persistent INSERT target ${match[1]}`);
  }
  assert.equal((clean.match(/\bcreate\s+temporary\s+table\b/gi) || []).length,
    (clean.match(/\bcreate\s+(?:temporary\s+)?table\b/gi) || []).length,
    'non-temporary table creation found');
  forbid(clean, /\b(update|delete\s+from|merge\s+into|copy\s+|alter\s+table|drop\s+table|truncate\s+)\b/i,
    'direct persistent mutation');
  forbid(clean, /\\ir\b|\\i\b|\\!|\\copy\b/i, 'include/shell/copy surface');
  forbid(clean, /brinesearch_issue97_refresh_google_route_transition\s*\(/i, 'public Google projection');
  forbid(clean, /brinesearch_issue97_refresh_google_route\s*\(/i, 'legacy/public dispatcher');
  forbid(clean, /brinesearch_issue97_refresh_google_routes_dark\s*\(/i, 'broad private refresh');
  forbid(clean, /brinesearch_issue97_refresh_route_receipt\s*\(/i, 'duplicate route receipt writer');
  forbid(clean, /brinesearch_issue97_(?:activate_cutover|activate_graph_build|reconcile|run_all_pad)/i,
    'activation/reconciliation/cutover writer');
  forbid(clean, /insert\s+into\s+public\.brinesearch_driver_google_routes_public/i, 'public Google insert');
  forbid(clean, /\b(pg_notify|dblink|pg_net|net\.http|http_post|copy\s+.*program)\b/i, 'external side effect');
}

validate(sql);

const mutations = [
  sql.replace(expectedNine[0][1], '00000000-0000-0000-0000-000000000000'),
  sql.replace(/\n  \(9,'fcbf5085[\s\S]*?'frozen_412'\);/, ';'),
  sql.replace("'frozen_412'),\n  (3", "'untouched_394'),\n  (3"),
  sql.replace('\\set issue97_commit 0', '\\set issue97_commit 1'),
  sql.replace('\\if :issue97_commit\ndo $issue97_refresh_exact_nine_private_google$',
    'do $issue97_refresh_exact_nine_private_google$'),
  sql.replace('brinesearch_issue97_refresh_google_route_transition_dark(',
    'brinesearch_issue97_refresh_google_route_transition('),
  sql.replace('do $issue97_private_google_postcheck$',
    'update public.pads set pad_name=pad_name;\ndo $issue97_private_google_postcheck$'),
  sql.replace('before_state.non_target_google_digest', 'removed_non_target_google_digest'),
  sql.replace('before_state.route_history_digest', 'removed_route_history_digest'),
  sql.replace("'ascent--lorraine','LORRAINE','Ascent',null,null", "'ascent--lorraine','ANY','Ascent',null,null"),
  sql.replace('rollback;', ''),
];
for (const [index, mutation] of mutations.entries()) {
  assert.throws(() => validate(mutation), `mutation ${index + 1} was not rejected`);
}

console.log(JSON.stringify({
  contract: 'issue97-frozen-wave-nine-private-google-and-spot-check',
  pads: 9,
  frozen412Pads: 5,
  untouched394Pads: 4,
  padDigest: '450948793c57a9a1535139fac4974792',
  tupleDigest: '5a75e5c4c34805b7dc2fdf8d0534a4f6',
  commitMode: 'explicit-1-only',
  rehearsalMode: 'preflight-only-zero-writer-calls',
  publicGoogle: 'forbidden',
  spotFixtures: ['ascent--cologie', 'ascent--cooper', 'ascent--lorraine'],
  mutationsRejected: mutations.length,
  result: 'PASS',
}, null, 2));
