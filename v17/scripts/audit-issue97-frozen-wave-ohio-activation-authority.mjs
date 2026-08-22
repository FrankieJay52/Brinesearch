import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sqlDir = path.join(root, 'ops/issue97-computer-rollout/sql');
const paths = {
  authority: path.join(sqlDir, '42-extract-frozen-wave-ohio-activation-authority.sql'),
  routes: path.join(sqlDir, '34-frozen-exact-mapping-wave-route-manifest.sql'),
  pins: path.join(sqlDir, '37-frozen-mapping-wave-production-pins.sql'),
  manifest: path.join(sqlDir, '38-frozen-wave-ohio-state-manifest-core.sql'),
  verifyManifest: path.join(sqlDir, '41-verify-frozen-wave-ohio-state-manifest.sql'),
  routeStepGuard: path.join(root, 'supabase/migrations/20260811093511_issue70_held_source_conflicts.sql'),
  package: path.join(root, 'package.json'),
};

const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const source = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const packageJson = JSON.parse(source.package);
const occurrences = (value, needle) => value.split(needle).length - 1;

function marked(value, begin, end, label) {
  assert.equal(occurrences(value, begin), 1, `${label} must have one begin marker`);
  assert.equal(occurrences(value, end), 1, `${label} must have one end marker`);
  const start = value.indexOf(begin) + begin.length;
  const finish = value.indexOf(end, start);
  assert.ok(finish > start, `${label} markers are reversed or empty`);
  return value.slice(start, finish);
}

function executableSql(value) {
  const output = [...value];
  const blank = (index) => {
    if (output[index] !== '\r' && output[index] !== '\n') output[index] = ' ';
  };
  let index = 0;
  const dollarClosings = new Map();
  while (index < value.length) {
    if (dollarClosings.has(index)) {
      const tag = dollarClosings.get(index);
      for (let at = index; at < index + tag.length; at += 1) blank(at);
      index += tag.length;
      continue;
    }
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
        for (let at = index; at < index + tag.length; at += 1) blank(at);
        dollarClosings.set(close, tag);
        index += tag.length;
        continue;
      }
    }
    index += 1;
  }
  return output.join('');
}

const expectedCandidates = [
  [1, 'BEL', '1c1320b3-4257-4239-9c55-b18a801aa97e', '269e903e991f1790bf5d1428e4c2bb43', '59e4d0079a9114a622ca6021d557cc07', 'b20843ddf3d2a648b8d53a0b3eb1a1c2', 5687, 3001, 4878, 112, 9912],
  [2, 'CAR', '8e565c14-33a4-4862-9bf8-be9b5557b293', '2943504592861b83abce581f29a1cacb', '07dd91d21b7e757d3bf5f20db54ea579', '8405344f91e795398ab261a51f2a03bf', 2640, 1553, 2522, 90, 5251],
  [3, 'COL', 'b86d14c7-5c8a-4cb9-8a3b-903965340678', '6bd88992a7a63c9643d1a6f1535ca2af', '89fbad6cfcc8e62c6e600a406f243d08', '44b4e720a523face3149d7dbdc8a298b', 5754, 3006, 5091, 126, 10812],
  [4, 'GUE', '44245144-3e39-45fe-907b-95e2b01b9c32', 'd7a43bacbf54794d4e92d9e8ceca2e28', '02cc95bbbacaaa969a8e8420ae4987e1', 'b0cc4e8e3aaa7121cc39cc7935189664', 3648, 2079, 2995, 101, 6433],
  [5, 'HAS', '0870470a-11f8-4f33-8af3-08d6849d5f34', 'fc53a1492a3eecab78a524dbadcddfe8', 'd814298cc86b83ea2cb5938dd8e978dd', 'ece929162c9063ea35a6a276de59a940', 2336, 1013, 1746, 57, 3550],
  [6, 'JEF', 'c9bac3a2-82d4-4b76-813c-6a29c1bf062a', 'ce2de7721f56a145b21ddded270f07fd', '6c95c0985714405f2af340e9d7c7c924', '0d40dc262b0097cf48783f7271531153', 4135, 2187, 3498, 69, 7116],
  [7, 'MOE', '8493f66b-b3d2-4673-be8a-07b024b9723d', 'fafd62f37b76e57859164010d1be967b', '2e2fc9e336115c9fd5fced5a69f5a9ad', '5a82a31c86fdd78804bf113f73e49694', 2264, 1250, 1715, 32, 3504],
  [8, 'NOB', '200d56dc-5b13-4f84-82cb-946b8ebeada2', '576c5e1b1012fcb8020fa637fb272082', '821c52a3c9090067a8496847ee1b1172', '795f812c7a9042318196195cccccf3a4', 1959, 1030, 1381, 40, 2841],
];

const expectedOld = [
  ['BEL', '24ffa531-0e69-4625-a137-da52020e6fd0', 'fc6dcbc8482b2e5c89f4069941c557de', 'd7565e078c0dda3d248555600522649b', '81355d7958b89ffccd08a5f521730f8e', 5687, 3001, 4878, 112, 9912],
  ['CAR', '5ee5f97b-447f-41d3-946a-68a8b28d8367', 'e9f4ed56bb2b1308b8b9913a751c78f5', 'e50ef5799abf04d16c2ecb79d4db0651', '853c139290afee94e391fc0395d40fed', 2640, 1553, 2522, 90, 5251],
  ['COL', 'c9f50b03-4328-4d8b-9995-4dc8bc85dd01', 'c13278c74933205f5c55cdf85f23f27e', '2d0b4ff159b673d214e3661feecd9088', '7f54d4a6e143c4006cb90b4b4fa0b67e', 5754, 3006, 5091, 126, 10812],
  ['GUE', '84568854-3257-46b7-8581-374dc620ef16', 'b11b2f5ac3c1c5d492c2233494706f4c', '30c17bd7c09c6093cfc3dc35a9adc5f8', 'b2bee82327b4ce24833fee33c4873238', 3648, 2079, 2995, 101, 6433],
  ['HAS', '542c35d5-a9ba-4b43-8a64-63a66f6b29e2', '1d8f6a52d2541e313932906f944b2f92', '7d0561a0f32e7432880d4ad39e5e7109', '610d4d5fe3a19cd1d07e9fc3049b2785', 2336, 1013, 1746, 57, 3550],
  ['JEF', 'cd096654-8a80-4cdb-b5ec-e1aa78b8b0c4', '06e8bd25f7fb46fe750214dd77e2b67d', '1b43430facf325e7ae1840f593f6e1ce', '03efea8f142bb29e5f27cb12bf84c49f', 4135, 2187, 3498, 69, 7116],
  ['MOE', 'ab9f4083-d572-4d9d-8e0a-28ebb77517e7', '69010044273a611876c3a8ace7c198a2', '7d794bd9b703b10c9579f97a325bb23a', '0921c5ea8751f20f079ba1a776bc7c1e', 2264, 1250, 1715, 32, 3504],
  ['NOB', '70f30495-860a-4199-9360-8e880f3b515b', 'eefc679ed36e6aba3a590c7ba2c9e541', 'ee7692fde47360caa2203b3436ca099b', '89af7128d56bbc4ef3733436d0813823', 1959, 1030, 1381, 40, 2841],
];

const expectedRetained = [
  [1, 'ATH', '8a4bd4ca-7828-46c1-9c36-752d3a9f8ffb', '2080a5a06944f3d4842e31937748267f', '4e955e0c8736f17dbd6ff79aa1c17e9d', '9b7f9a9c682b51da132b927fba446429'],
  [5, 'COS', '7c979743-72e4-42a2-a6a9-006a369168c0', '7791b63c7bcb5848200b5bc4cc970fb4', 'b9da0eb95ae5b4e03a0143484372b658', 'b4186d15df742d0fc8293dc806970350'],
  [9, 'MAH', '360472bf-cb96-4ba7-b2fe-efa04e230f69', '4a80abcc01932b7a169189ec5f706cc4', '79d1cd99ffcad7a04a06bd5ad7138417', 'b8f88d2df1a54a23bad6d77d68fdb5aa'],
  [10, 'MEG', 'e1cb9c50-f2ec-486a-ba9c-2b4c0fcaf048', '2fcf1a69c13907789a2f902574a35674', 'e90b8b30a449199a490fe85688670dfb', '75886082576aece46f6da8bfe3512d78'],
  [12, 'MUS', '98ae1835-1064-4c18-a8a7-9a9e570e212d', '04a4c9d7a4274ac638cad78a406f76fa', '0761cc66281b70da78dd0375ecb7cb86', 'd0a61a9e48eecf2bdd181af144c12278'],
  [14, 'POR', 'c645a8bf-a920-432a-a341-a7b60d9cfd49', '89513e609f359ad9064814ebbf074810', 'a86ed19837abdfa55047ddabbc60ffcc', 'f82c1db46f4f405610f4a7be525fd851'],
  [15, 'STA', '67541fad-5cf2-4483-b0f6-f4060197fda9', '67be9ebece47e78c4c7ccf29ea92786e', 'adaeac05c1e99de304b1c9a10ac83443', 'd0826c5f57a593105b3aa43215e33873'],
  [16, 'TRU', '3c94b14c-9d9e-41ec-a897-b754dab6d8dd', '2ff743a4c7f223a6821d3eaff7416d1d', '60f07d2d3e4328c1f448c07aca49f4c8', 'c655a2dc29c81177694565dbc069f1a8'],
  [17, 'TUS', 'fd6fdfff-f23f-42cc-a633-64448bd9d044', 'b5d73c4e9a397596bbdc1dd0697a0b6d', '810a6b9c9f96448c52c722fbba8c3996', '8232b7174a6e40b383f08173a3a2e81e'],
  [18, 'VIN', '785f5277-369c-4ae3-ba80-31411745e46d', '551be5443af26c64d5ed5e92a58ee71b', 'c8962e1b5eec1d974533a973ca1f9362', '7ae096daf0adf869efe405a5b5ae8530'],
  [19, 'WAS', '90982f30-8a06-4a53-8b4b-9efd5d9042bf', '6ccff50666a085a4387c20fb49f90a59', 'd372a68557e29d1ae871025c372eb785', 'd6de47b387317ed968b15c1f74d7429c'],
];

const expectedGooglePads = [
  ['69c63442-de05-4d15-95da-07da587bc070', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
  ['6ef0746f-341a-4d29-9399-a81cfbec11e8', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['75600d0c-17b8-488b-96c9-4b7b8ffc8b1b', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0],
  ['b6dae008-74d4-4976-9c72-fba7ae349c50', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['b7526e45-0b33-4988-ae1c-0a4140971f8e', '542490a4-ba6f-02af-0209-37ad6257a962', '52b08bc7-9b54-4b8d-a833-f903fc298f7b', 0],
  ['d7898e8c-1bb6-48f8-b5e0-87bc1898420e', '9acadc48-c230-5e7b-6f2a-0a77f86f625c', 'bbfacbaf-86be-4818-8541-61a697c71199', 1],
  ['e2b32e85-9e93-4388-8215-9d8167cbbeb8', 'ebbc1392-345c-882e-2708-6ecc27a76f3c', 'cdcfd114-42c5-4478-9251-eac57a70e528', 0],
  ['f896d00c-da26-41b6-bf5b-e9d91afbdbc6', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
  ['fcbf5085-4ba2-496d-9c20-516e8b52f9bd', 'e78dcae3-372f-4cf6-9bdd-a3773b21a50e', '01bad0cc-614e-42b7-9db9-22bf6410c849', 0],
];

const expectedRouteFunctions = [
  ['private_verification.brinesearch_issue97_refresh_occurrence_candidate(uuid)', '0f139df2a01f68722958ff10f1dd6f49'],
  ['private_verification.brinesearch_issue97_resolve_route_identity_path(uuid)', '8ad311611cf361ca457e4084128b9cfb'],
  ['private_verification.brinesearch_issue97_refresh_route_receipt(uuid)', null],
  ['private_verification.brinesearch_issue97_refresh_transition_receipts(uuid)', null],
  ['private_verification.brinesearch_issue97_refresh_route_geometry(uuid)', null],
  ['private_verification.brinesearch_issue97_prepare_scope_current_cache(text)', null],
  ['private_verification.brinesearch_issue97_dataset_scope_current_cached(uuid,text,text)', null],
  ['private_verification.brinesearch_issue97_prepare_designation_cache(text)', null],
  ['private_verification.brinesearch_issue97_prepare_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)', null],
  ['private_verification.brinesearch_issue97_ensure_graph_release_current_cache()', null],
  ['private_verification.brinesearch_issue97_graph_build_release_current_contextual(uuid)', null],
  ['private_verification.brinesearch_issue97_graph_build_release_current_cached(uuid)', null],
  ['private_verification.brinesearch_issue97_identities_connected(uuid,uuid)', null],
  ['private_verification.brinesearch_issue97_terminal_private_access_destination(uuid)', '34bdc93597f6da3cad68376ca01906c1'],
  ['private_verification.brinesearch_issue97_mapping_fingerprint(uuid)', null],
  ['private_verification.brinesearch_issue97_route_state_code(text)', null],
  ['private_verification.brinesearch_issue97_normalize_route_token(text)', null],
  ['private_verification.brinesearch_issue97_explicit_occurrence_source_key(text,text,jsonb)', null],
  ['private_verification.brinesearch_issue97_identity_driver_name(uuid)', null],
  ['private_verification.brinesearch_issue97_identity_aliases(uuid,uuid)', null],
  ['private_verification.brinesearch_issue97_authoritative_identity_geometry(uuid)', null],
  ['private_verification.brinesearch_issue97_authoritative_identity_geometry_digest(uuid)', null],
  ['private_verification.brinesearch_issue97_clip_exact_authoritative_occurrence(uuid,uuid,extensions.geometry,extensions.geometry)', null],
  ['private_verification.brinesearch_issue97_normalize_saved_turn(text)', null],
  ['private_verification.brinesearch_issue97_geometry_turn(extensions.geometry,extensions.geometry)', null],
  ['private_verification.brinesearch_issue97_reverse_turn(text)', null],
  ['private_verification.brinesearch_issue97_transition_google_dependency(uuid)', null],
  ['private_verification.brinesearch_issue97_transition_google_dark_current(uuid)', null],
  ['private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)', null],
  ['private_verification.brinesearch_issue97_write_occurrence_history(uuid)', null],
  ['private_verification.brinesearch_issue97_write_transition_history(uuid,integer)', null],
  ['private_verification.brinesearch_issue97_write_geometry_history(uuid)', null],
  ['private_verification.brinesearch_issue97_refresh_google_route_transition_dark(uuid)', null],
];

const expectedRouteDependencyFunctions = [
  'private_verification.brinesearch_issue97_prepare_graph_release_current_cache()',
  'private_verification.brinesearch_issue97_assert_expected_state_manifest_cache_context(uuid,text,text,text,integer)',
  'private_verification.brinesearch_issue97_validate_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)',
  'private_verification.brinesearch_issue97_ensure_graph_release_current_cache_for_state_manifest(uuid,text,text,text,integer)',
  'private_verification.brinesearch_issue97_active_graph_release_generation()',
  'private_verification.brinesearch_issue97_identity_route_usable(text,text,text)',
  'private_verification.brinesearch_issue97_geometry_point_json(extensions.geometry)',
  'private_verification.brinesearch_issue97_pad_safety_facts(uuid)',
  'private_verification.brinesearch_issue97_route_data_blocked(uuid)',
  'private_verification.brinesearch_issue97_hold_google_route_dark(uuid,bigint,text,jsonb,text)',
  'private_verification.brinesearch_issue97_uuid(text)',
];

const expectedProtectedRouteRelations = [
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
];

const expectedRouteHistorySequences = [
  'private_verification.brinesearch_route_occurrence_receipt_history_issue97_id_seq',
  'private_verification.brinesearch_route_reconciliation_history_issue97_id_seq',
  'private_verification.brinesearch_route_transition_history_issue97_id_seq',
  'private_verification.brinesearch_route_occurrence_geometry_history_issue97_id_seq',
];

const expectedTriggers = [
  'brinesearch_issue97_google_route_graph_stale',
  'brinesearch_issue97_stamp_graph_release_receipt',
  'brinesearch_issue97_google_route_refresh_deferred',
  'brinesearch_issue97_google_route_pad_stale',
  'pads_sync_public_pad_detail_projection',
  'trg_pad_verification_invalidate',
  'public_pad_detail_sanitize_route_notes_issue73',
  'brinesearch_issue97_state_candidate_manifest_immutable',
  'brinesearch_issue97_state_candidate_manifest_member_immutable',
  'brinesearch_clear_stale_route_step_identity_issue70',
  'brinesearch_issue97_google_route_steps_stale',
];

const expectedPublicRouteMutationPattern = String.raw`E'\\m(?:insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(?:public\\.)?brinesearch_(?:route_prep|route_prep_steps|pad_roads)\\M'`;

function requireTokens(value, tokens, label) {
  for (const token of tokens) assert.ok(value.includes(token), `${label} missing ${token}`);
}

function auditLockOnlyDoBodies(value) {
  const bodies = [...value.matchAll(/\bdo\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)([\s\S]*?)\1\s*;/gi)];
  assert.equal(bodies.length, 3, 'authority extractor must contain exactly three DO lock blocks');
  assert.deepEqual(bodies.map((match) => match[1]), [
    '$issue97_activation_authority_ingest_locks$',
    '$issue97_activation_authority_graph_locks$',
    '$issue97_activation_authority_google_locks$',
  ], 'authority extractor DO blocks must be the three exact lock blocks in canonical order');

  for (const [, tag, body] of bodies) {
    const executableBody = executableSql(body).toLowerCase();
    assert.match(executableBody, /^\s*declare\s+lock_row\s+record\s*;\s*begin\b/,
      `${tag} must declare only the loop record before its body`);
    assert.equal((executableBody.match(/\bfor\s+lock_row\s+in\b/g) ?? []).length, 1,
      `${tag} must contain exactly one deterministic lock loop`);
    assert.equal((executableBody.match(/\bloop\b/g) ?? []).length, 2,
      `${tag} must contain one LOOP and one END LOOP`);
    assert.equal((executableBody.match(/\bperform\b/g) ?? []).length, 1,
      `${tag} must contain exactly one PERFORM`);
    assert.equal((executableBody.match(/\bpg_catalog\.pg_advisory_xact_lock\s*\(/g) ?? []).length, 1,
      `${tag} may perform only one transaction advisory-lock operation`);
    assert.doesNotMatch(executableBody,
      /\b(?:insert|update|delete|merge|copy|create|alter|drop|truncate|grant|revoke|vacuum|analyze|refresh\s+materialized|execute|call|raise|return)\b/i,
      `${tag} contains an unauthorized statement or dynamic execution`);
  }
}

function auditProtectedBaselines(value) {
  const relationState = marked(value,
    'route_relation_protected_state as materialized (',
    '),\nroute_relation_protected_rows(ordinal,relation_name,row_count,row_digest) as (',
    'route protected relation state');
  const relationRows = marked(value,
    'route_relation_protected_rows(ordinal,relation_name,row_count,row_digest) as (',
    '),\nroute_relation_protected_digest as materialized (',
    'route protected relation rows');
  let previous = -1;
  for (const relation of expectedProtectedRouteRelations) {
    assert.ok(relationState.includes(relation),
      `route protected state missing ${relation}`);
    assert.equal(occurrences(relationRows, `'${relation}'`), 1,
      `route protected row list must contain ${relation} exactly once`);
    const current = relationRows.indexOf(`'${relation}'`);
    assert.ok(current > previous, `route protected relation order drifted at ${relation}`);
    previous = current;
  }
  requireTokens(relationState, [
    'route_prep_rows', 'route_prep_digest',
    'route_prep_steps_rows', 'route_prep_steps_digest',
    'pad_roads_rows', 'pad_roads_digest',
    'occurrence_candidates_rows', 'occurrence_candidates_digest',
    'occurrence_receipts_rows', 'occurrence_receipts_digest',
    'occurrence_history_rows', 'occurrence_history_digest',
    'reconciliation_receipts_rows', 'reconciliation_receipts_digest',
    'reconciliation_history_rows', 'reconciliation_history_digest',
    'transition_receipts_rows', 'transition_receipts_digest',
    'transition_history_rows', 'transition_history_digest',
    'geometry_receipts_rows', 'geometry_receipts_digest',
    'geometry_history_rows', 'geometry_history_digest',
    'pg_catalog.md5(pg_catalog.to_jsonb(',
  ], 'route protected full-row receipts');
  requireTokens(value, [
    'route_protection.relation_rows=12',
    'route_protection.distinct_relation_rows=12',
    "'route_relation_count',route_protection.relation_rows",
    "'route_relations_protected_digest',route_protection.combined_digest",
  ], 'route protected combined receipt');

  const sequenceBlock = marked(value,
    'route_history_sequence_authority(',
    '),\nroute_history_sequence_state as materialized (',
    'route history sequence authority');
  for (const sequence of expectedRouteHistorySequences) {
    assert.equal(occurrences(sequenceBlock, sequence), 3,
      `route history sequence authority must bind ${sequence} three ways`);
  }
  requireTokens(value, [
    'route_sequences.rows=4',
    'route_sequences.distinct_sequence_rows=4',
    'route_sequences.exact_name_rows=4',
    "'route_history_sequence_state_digest',route_sequences.sequence_state_digest",
    "'ROUTE_HISTORY_SEQUENCE_AUTHORITY'",
  ], 'route history sequence receipt');

  const savedBlock = marked(value,
    'saved_road_protected_state as materialized (',
    '),\ngoogle_state as materialized (',
    'saved-road protected state');
  for (const relation of [
    'private_verification.brinesearch_issue97_saved_road_release_baseline',
    'private_verification.brinesearch_issue97_saved_road_reconciliation_runs',
    'private_verification.brinesearch_issue97_saved_road_reconciliation',
  ]) assert.ok(savedBlock.includes(relation), `saved-road state missing ${relation}`);
  requireTokens(value, [
    'saved_road.baseline_rows=1',
    'saved_road.run_rows=0',
    'saved_road.reconciliation_rows=0',
    "saved_road.run_digest='d41d8cd98f00b204e9800998ecf8427e'",
    "saved_road.reconciliation_digest='d41d8cd98f00b204e9800998ecf8427e'",
    "'SAVED_ROAD_PROTECTED_STATE'",
  ], 'saved-road protected receipt');

  const topologyBlock = marked(value,
    'topology_protected_state as materialized (',
    '),\ntopology_protected_digest as materialized (',
    'topology protected state');
  for (const relation of [
    'public.brinesearch_road_junctions',
    'public.brinesearch_road_junction_anchors',
    'public.brinesearch_road_junction_memberships',
  ]) assert.ok(topologyBlock.includes(relation), `topology state missing ${relation}`);
  requireTokens(topologyBlock, [
    'junction_rows', 'junction_digest', 'anchor_rows', 'anchor_digest',
    'membership_rows', 'membership_digest',
  ], 'topology full-row receipts');
  requireTokens(value, [
    'topology.junction_rows>0', 'topology.anchor_rows>0',
    'topology.membership_rows>0',
    "'topology_protected_digest',topology.combined_digest",
    "'TOPOLOGY_PROTECTED_STATE'",
  ], 'topology protected receipt');
}

function auditOperationalAuthority(value) {
  const ingestBlock = marked(value,
    'ingest_lock_scope_source as materialized (',
    '),\nactivation_references as materialized (',
    'ingest lock authority');
  requireTokens(ingestBlock, [
    "build.details->'source_run_vector'",
    'from expected_members member',
    'order by dataset_id,state_code,county_code',
    "'brinesearch:issue97:ingest:'||dataset_id::text||':'||county_code",
    'count(distinct lock_key)',
  ], 'ingest lock authority');
  requireTokens(value, [
    'ingest_locks.rows=38',
    'ingest_locks.distinct_lock_rows=38',
    'ingest_locks.complete_rows=38',
    "'ingest_lock_count',ingest_locks.rows",
    "'ingest_lock_authority_digest',ingest_locks.authority_digest",
    "'INGEST_LOCK_AUTHORITY'",
  ], 'ingest lock output');

  requireTokens(value, [
    'owner_role.rolname as owner_name',
    'procedure.proowner::text,owner_role.rolname',
    'as catalog_md5',
    'as captured_catalog_rows',
    'as catalog_authority_digest',
    'functions.captured_catalog_rows=24',
    "'catalog_md5',inventory.catalog_md5",
    "'definition',inventory.definition",
    "'owner_oid',inventory.proowner,'owner_name',inventory.owner_name",
    "'activation_function_catalog_authority_digest'",
  ], 'function catalog authority');
}

function assertFunctionArity(value, signature, maximumArguments) {
  const executable = executableSql(value).toLowerCase();
  const needle = `${signature.toLowerCase()}(`;
  let offset = 0;
  let calls = 0;
  while ((offset = executable.indexOf(needle, offset)) !== -1) {
    calls += 1;
    let index = offset + needle.length;
    let parentheses = 1;
    let brackets = 0;
    let commas = 0;
    let hasArgument = false;
    for (; index < executable.length && parentheses > 0; index += 1) {
      const character = executable[index];
      if (character === '(') parentheses += 1;
      else if (character === ')') parentheses -= 1;
      else if (character === '[') brackets += 1;
      else if (character === ']') brackets -= 1;
      else if (character === ',' && parentheses === 1 && brackets === 0) commas += 1;
      else if (parentheses === 1 && !/\s/.test(character)) hasArgument = true;
      assert.ok(brackets >= 0, `${signature} has an unmatched closing bracket`);
    }
    assert.equal(parentheses, 0, `${signature} has an unterminated call`);
    assert.equal(brackets, 0, `${signature} has an unterminated bracket expression`);
    const argumentCount = hasArgument ? commas + 1 : 0;
    assert.ok(argumentCount <= maximumArguments,
      `${signature} has ${argumentCount} arguments; PostgreSQL permits at most ${maximumArguments}`);
    offset = index;
  }
  assert.ok(calls > 0, `expected at least one ${signature} call`);
}

const compactSql = (value) => value.replace(/\s+/g, '');

function assertExactLiteralBlocks(value) {
  const candidateBlock = marked(value, '-- ISSUE97_ACTIVATION_CANDIDATES_BEGIN',
    '-- ISSUE97_ACTIVATION_CANDIDATES_END', 'activation candidates');
  for (const row of expectedCandidates) {
    for (const field of row) assert.ok(candidateBlock.includes(String(field)),
      `candidate block missing ${field}`);
  }
  assert.equal(compactSql(candidateBlock), `values${expectedCandidates.map((row) =>
    `(${row[0]},'${row[1]}','${row[2]}'::uuid,'${row[3]}','${row[4]}','${row[5]}',${row.slice(6).join(',')})`
  ).join(',')}`, 'candidate block must be the exact pinned ordered tuple set');
  assert.equal((candidateBlock.match(/\(\s*\d+\s*,\s*'[A-Z]{3}'/g) ?? []).length, 8,
    'candidate block must contain exactly eight rows');

  const oldBlock = marked(value, '-- ISSUE97_ACTIVATION_OLD_BUILDS_BEGIN',
    '-- ISSUE97_ACTIVATION_OLD_BUILDS_END', 'old builds');
  for (const row of expectedOld) {
    for (const field of row) assert.ok(oldBlock.includes(String(field)),
      `old block missing ${field}`);
  }
  assert.equal(compactSql(oldBlock), `values${expectedOld.map((row) =>
    `('${row[0]}','${row[1]}'::uuid,'${row[2]}','${row[3]}','${row[4]}',${row.slice(5).join(',')})`
  ).join(',')}`, 'old block must be the exact pinned ordered tuple set');
  assert.equal((oldBlock.match(/\(\s*'[A-Z]{3}'\s*,\s*'[0-9a-f-]{36}'/g) ?? []).length, 8,
    'old block must contain exactly eight rows');

  const retainedBlock = marked(value, '-- ISSUE97_ACTIVATION_RETAINED_ELEVEN_BEGIN',
    '-- ISSUE97_ACTIVATION_RETAINED_ELEVEN_END', 'retained builds');
  for (const row of expectedRetained) {
    for (const field of row) assert.ok(retainedBlock.includes(String(field)),
      `retained block missing ${field}`);
  }
  assert.equal(compactSql(retainedBlock), `values${expectedRetained.map((row) =>
    `(${row[0]},'${row[1]}','${row[2]}'::uuid,'${row[3]}','${row[4]}','${row[5]}')`
  ).join(',')}`, 'retained block must be the exact pinned ordered tuple set');
  assert.equal((retainedBlock.match(/\(\s*\d+\s*,\s*'[A-Z]{3}'/g) ?? []).length, 11,
    'retained block must contain exactly eleven rows');

  const googleBlock = marked(value, '-- ISSUE97_ACTIVATION_GOOGLE_PADS_BEGIN',
    '-- ISSUE97_ACTIVATION_GOOGLE_PADS_END', 'Google pads');
  for (const row of expectedGooglePads) {
    for (const field of row) assert.ok(googleBlock.includes(String(field)),
      `Google block missing ${field}`);
  }
  assert.equal(compactSql(googleBlock), `values${expectedGooglePads.map((row) =>
    `('${row[0]}'::uuid,'${row[1]}'::uuid,'${row[2]}'::uuid,${row[3]}::bigint)`
  ).join(',')}`, 'Google block must be the exact pinned ordered tuple set');
  assert.equal((googleBlock.match(/\(\s*'[0-9a-f-]{36}'::uuid/g) ?? []).length, 9,
    'Google block must contain exactly nine rows');

  const authorityRoutes = marked(value, '-- EXACT_FINAL_412_BEGIN',
    '-- EXACT_FINAL_412_END', 'authority routes');
  const sourceRoutes = marked(source.routes, '-- EXACT_FINAL_412_BEGIN',
    '-- EXACT_FINAL_412_END', 'file 34 routes');
  assert.equal(authorityRoutes, sourceRoutes,
    'file 42 route block must be byte-semantically identical to file 34');
  const routeIds = [...authorityRoutes.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)]
    .map((match) => match[0]);
  assert.equal(routeIds.length, 412, 'route block must contain exactly 412 UUIDs');
  assert.equal(new Set(routeIds).size, 412, 'route block contains a duplicate route UUID');
}

function auditAuthority(value) {
  assertExactLiteralBlocks(value);
  auditLockOnlyDoBodies(value);
  auditProtectedBaselines(value);
  auditOperationalAuthority(value);
  assertFunctionArity(value, 'pg_catalog.jsonb_build_object', 100);
  const executable = executableSql(value).toLowerCase();

  assert.equal(occurrences(value, '\\set ON_ERROR_STOP on'), 1,
    'authority extractor must enable ON_ERROR_STOP exactly once');
  assert.equal(occurrences(executable, 'begin isolation level read committed read only'), 1,
    'authority extractor must own one read-committed read-only transaction');
  assert.equal(occurrences(executable, 'repeatable read'), 0,
    'authority extractor must take its final snapshot after acquiring locks');
  assert.equal((executable.match(/\brollback\s*;/g) ?? []).length, 1,
    'authority extractor must end in one rollback');
  assert.equal((executable.match(/\bcommit\s*;/g) ?? []).length, 0,
    'authority extractor may not commit');
  assert.match(value, /set local statement_timeout='15min'/i,
    'authority extractor must have the exact finite statement timeout');
  assert.match(value, /set local lock_timeout='2min'/i,
    'authority extractor must have the exact finite lock timeout');
  assert.match(value, /set local timezone='UTC'/i,
    'authority extractor must canonicalize timestamptz serialization');
  assert.match(value, /set local datestyle='ISO, YMD'/i,
    'authority extractor must canonicalize date serialization');
  assert.match(value, /set local extra_float_digits=3/i,
    'authority extractor must canonicalize floating-point serialization');
  assert.match(value, /set local standard_conforming_strings=on/i,
    'authority extractor must pin standard string semantics');

  const matcherBlock = marked(value,
    'public_route_mutation_matcher(pattern) as (',
    '),\nroute_function_expected(ordinal,signature,expected_md5,forbidden_md5) as (',
    'public-route mutation matcher');
  assert.equal(compactSql(matcherBlock), `values(${expectedPublicRouteMutationPattern})`,
    'public-route mutation matcher must use the exact PostgreSQL ARE escape string');
  const matcherStateBlock = marked(value,
    'public_route_mutation_matcher_state as materialized (',
    '),\ntrigger_expected(', 'public-route mutation matcher self-test');
  requireTokens(matcherStateBlock, [
    "'UPDATE public.brinesearch_pad_roads SET road_id=road_id'~*pattern",
    "'insert into private_verification.brinesearch_route_transition_history_issue97 default values'~*pattern",
    'as positive_matches', 'as negative_matches',
  ], 'public-route mutation matcher self-test');

  for (const token of [
    "old.owner_decision='pending'",
    'new.raw_text is distinct from old.raw_text',
    'unmatched_saved_road_name', 'explicit_in_saved_directions',
    'state_context_candidate_only', 'new.road_id:=null',
    'new.distance_miles:=null', "new.geometry_status:='not_started'",
  ]) {
    assert.ok(source.routeStepGuard.includes(token),
      `tracked route-step guard migration missing ${token}`);
    assert.ok(value.includes(token.replaceAll("'", "''")),
      `live route-step guard shape check missing ${token}`);
  }

  assert.doesNotMatch(executable,
    /\b(?:insert|update|delete|merge|copy|create|alter|drop|truncate|grant|revoke|vacuum|analyze|refresh\s+materialized)\b/i,
    'authority extractor contains a mutating or administrative statement');
  assert.doesNotMatch(value, /\\(?:gexec|copy|prompt|shell|!|ir?|include)\b/i,
    'authority extractor may not include files, invoke a shell, or execute generated SQL');
  assert.doesNotMatch(executable,
    /\b(?:brinesearch_issue97_activate_graph_build|brinesearch_issue97_rebuild_county_graph|brinesearch_issue97_reconcile_route_corpus|brinesearch_issue97_refresh_google_route|brinesearch_issue97_hold_google_route|brinesearch_issue97_queue_google_route_refresh|brinesearch_issue97_activate_cutover|brinesearch_issue97_refresh_occurrence_candidate|brinesearch_issue97_resolve_route_identity_path|brinesearch_issue97_refresh_route_receipt|brinesearch_issue97_refresh_transition_receipts|brinesearch_issue97_refresh_route_geometry|brinesearch_issue97_write_occurrence_history|brinesearch_issue97_write_transition_history|brinesearch_issue97_write_geometry_history|brinesearch_issue97_refresh_google_route_transition_dark|brinesearch_issue97_hold_google_route_dark|brinesearch_issue97_persist_state_candidate_manifest)\s*\(/i,
    'authority extractor may inspect definitions but may not call a writer function');

  const lockTokens = [
    "'brinesearch:issue97:ohio-state-release'",
    "'brinesearch:issue97:all-pad-routing-pipeline'",
    "'brinesearch:issue97:route-corpus'",
    "'brinesearch:issue97:saved-road-reconciliation'",
    "'brinesearch:issue97:mapping-refresh'",
    "'brinesearch:issue97:ingest:'",
    "'brinesearch:issue97:graph:OH:'",
    "'brinesearch:issue97:google-route:'",
  ];
  requireTokens(value, lockTokens, 'activation lock order');
  for (let index = 1; index < lockTokens.length; index += 1) {
    assert.ok(value.indexOf(lockTokens[index - 1]) < value.indexOf(lockTokens[index]),
      `activation lock order drifted at ${lockTokens[index]}`);
  }

  requireTokens(value, [
    "'1ef4015c-b1ae-45d2-8baa-86c47c561f54'::uuid",
    "'issue97-ohio-r3-frozen-wave-candidate'",
    "'77cb00cf83ad8bab4a45c9b552626f76'",
    "'1f49bcb8edfdc386105fe84727fd53448c277d37'",
    "'c3f925954d41cb6fbd5939eca5de3288'",
    "'711b1ddd3ba6c47e7642fc700197432f'",
    "'450948793c57a9a1535139fac4974792'",
    "'5a75e5c4c34805b7dc2fdf8d0534a4f6'",
    "'73eb9adbfd16ea671873da7b4e495f73'",
    "'f6763925461111b2069bde0f60007dd4'",
    "'e3c8fa406c6b4631b25e95a7ebb6d2d2'",
    'activation_impact_receipts as materialized',
    'activation_impacts as materialized',
    "then 'junction_missing'",
    "then 'anchor_missing'",
    "then 'anchor_changed'",
    "then 'junction_digest_changed'",
    'pg_catalog.md5(impact.impacts::text)',
    'ambiguous_impact_order_key',
    'routes_outside_frozen',
    'google_projection',
    'expected_post_deferred',
    'session_replication_role',
    'competing_backends',
    "'ACTIVATION_IMPACT'",
    "'FUNCTION_INVENTORY'",
    "'TRIGGER_INVENTORY'",
    "'FROZEN_ROUTE'",
    "'ROUTE_FUNCTION_AUTHORITY'",
    "'ROUTE_DEPENDENCY_FUNCTION_AUTHORITY'",
    "'ROUTE_RELATION_TRIGGER_AUTHORITY'",
    "'PUBLIC_ROUTE_RELATION_TRIGGER_AUTHORITY'",
    'route_function_expected(ordinal,signature,expected_md5,forbidden_md5)',
    'route_function_authority as materialized',
    'route_functions.rows=33',
    'route_functions.present_rows=33',
    'route_functions.distinct_oid_rows=33',
    'route_functions.captured_hash_rows=33',
    'route_functions.captured_definition_rows=33',
    'route_functions.captured_catalog_rows=33',
    'route_functions.direct_public_route_mutator_rows=0',
    'route_functions.stale_hash_rows=0',
    'route_dependency_function_expected(ordinal,signature)',
    'route_dependency_function_authority as materialized',
    'route_dependencies.rows=11',
    'route_dependencies.present_rows=11',
    'route_dependencies.distinct_oid_rows=11',
    'route_dependencies.captured_hash_rows=11',
    'route_dependencies.captured_definition_rows=11',
    'route_dependencies.captured_catalog_rows=11',
    'route_dependencies.direct_public_route_mutator_rows=0',
    'route_relation_triggers.trigger_rows=0',
    'route_relation_triggers_ok',
    'public_route_relation_expected(',
    'public_route_relation_trigger_authority as materialized',
    'public_route_triggers.rows=3',
    'public_route_triggers.present_rows=3',
    'public_route_triggers.trigger_rows=2',
    'public_route_triggers.exact_count_rows=3',
    'public_route_triggers_ok',
    "(1,'public','brinesearch_route_prep',0)",
    "(2,'public','brinesearch_route_prep_steps',1)",
    "(3,'public','brinesearch_pad_roads',1)",
    "'public_route_trigger_authority_digest'",
    "'O'::\"char\",19::smallint,array['raw_text','match_method']",
    "'O'::\"char\",29::smallint,array[]::text[]",
    'route_step_identity_clear_shape_exact',
    "'selected_route_function_catalog_authority_digest'",
    "'route_dependency_function_catalog_authority_digest'",
    'receipt_route_revision=route_revision',
    'generated_at=(select install_timestamp from permanent_install_state)',
    'updated_at=(select install_timestamp from permanent_install_state)',
    '(select count(*) from pg_catalog.jsonb_object_keys(evidence))=2',
    "witness.identity_id::text=evidence->>'identity_id'",
    "witness.road_id::text=evidence->>'road_id'",
    "status='validated' and activated_at is null",
    'and release_current is true',
    'and sources_current is false',
    'other_validated_not_false=0',
    'active_ohio_rows=19',
    'google_trigger.trigger_routes_outside_frozen=0',
    'public_detail.projected_byte_semantic_noop',
    'projection_view_definition_md5',
    'projection_view.view_definition_md5',
    'projection_view.rows=1 and projection_view.exact as projection_view_ok',
    'as verification_projection_ok',
    'case when not coalesce(verification_projection_ok,false)',
    'pad_google_update_eligible_exact',
    'tgqual',
    'tgnargs',
    'tgargs_hex',
    'tgqual is null and tgnargs=0',
    'pg_catalog.octet_length(tgargs)=0',
    "'production_write',false",
  ], 'activation authority contract');

  for (const signature of [
    'private_verification.brinesearch_issue97_current_verified_run_id(uuid,text,text)',
    'private_verification.brinesearch_issue97_dataset_scope_current(uuid,text,text)',
    'private_verification.brinesearch_issue97_ingest_run_verified(uuid)',
    'private_verification.brinesearch_issue97_graph_source_content_digest(uuid)',
    'private_verification.brinesearch_issue97_state_candidate_manifest_authorizes_build(text,uuid)',
    'private_verification.brinesearch_issue97_invalidate_google_route_trigger()',
    'private_verification.brinesearch_clear_stale_route_step_identity_issue70()',
    'private_verification.brinesearch_issue97_hold_google_route(uuid,bigint,text,jsonb,text)',
    'private_verification.brinesearch_issue97_queue_google_route_refresh(uuid,text)',
    'private_verification.brinesearch_issue97_process_google_route_refresh_queue()',
    'private_verification.brinesearch_issue97_refresh_google_route(uuid)',
    'private_verification.brinesearch_issue97_refresh_google_route_published_core(uuid)',
    'private_verification.brinesearch_issue97_refresh_google_route_transition(uuid)',
    'public.brinesearch_issue97_cutover_active()',
  ]) assert.ok(value.includes(signature), `function inventory missing ${signature}`);

  for (const [signature, knownHash] of expectedRouteFunctions) {
    assert.ok(value.includes(`'${signature}'`),
      `route function authority missing ${signature}`);
    if (knownHash) assert.ok(value.includes(`'${knownHash}'`),
      `route function authority missing known hash ${knownHash}`);
  }
  assert.equal((value.match(/\(\d+,'private_verification\.brinesearch_issue97_[a-z0-9_]+\([^\n]*\)'/g) ?? [])
    .filter((row) => expectedRouteFunctions.some(([signature]) => row.includes(signature))).length,
  33, 'route function authority must contain exactly 33 pinned signatures');
  requireTokens(value, ["'72c16f75'", "'98f1421b'"],
    'route function stale-definition rejection');

  for (const signature of expectedRouteDependencyFunctions) {
    assert.ok(value.includes(`'${signature}'`),
      `route dependency authority missing ${signature}`);
  }
  const dependencyBlock = marked(value,
    'route_dependency_function_expected(ordinal,signature) as (',
    '),\nroute_dependency_function_authority as materialized (',
    'route dependency functions');
  assert.equal((dependencyBlock.match(/\(\d+,'private_verification\.brinesearch_issue97_[a-z0-9_]+\([^\n]*\)'/g) ?? []).length,
    11, 'route dependency authority must contain exactly 11 pinned signatures');

  const selectedAuthorityBlock = marked(value,
    'route_function_authority as materialized (',
    '),\nroute_function_state as materialized (',
    'selected route function authority');
  const dependencyAuthorityBlock = marked(value,
    'route_dependency_function_authority as materialized (',
    '),\nroute_dependency_function_state as materialized (',
    'route dependency function authority');
  for (const [label, block] of [
    ['selected route function authority', selectedAuthorityBlock],
    ['route dependency function authority', dependencyAuthorityBlock],
  ]) requireTokens(block, [
    'pg_catalog.pg_get_functiondef(procedure.oid) as definition',
    'language.oid as language_oid',
    'procedure.prokind',
    'procedure.proowner as owner_oid',
    'as catalog_md5',
    'has_function_privilege',
  ], label);

  for (const trigger of expectedTriggers)
    assert.ok(value.includes(trigger), `trigger inventory missing ${trigger}`);

  requireTokens(value, [
    'tgdeferrable', 'tginitdeferred', 'tgisinternal', 'tgattr',
    "array['status','graph_digest','source_revision_digest']",
    "array['latitude','longitude','structured_route_revision','road_sequence_status']",
    "array['status','details']",
    'proconfig', 'proacl', 'aclexplode', 'has_function_privilege',
    'relrowsecurity', 'relforcerowsecurity', 'has_table_privilege',
  ], 'function/trigger/table security catalog');

  assert.match(value, /active_counties_exact|county_registry_exact/i,
    'authority extractor must prove the exact active Ohio county registry');
  assert.match(value, /release_generation[^\n]{0,80}issue97-release-20260815-r2/i,
    'authority extractor must prove the exact active release generation');
  assert.match(value, /non_target_route|untouched_route|other_route/i,
    'authority extractor must pin the 394 non-target Ohio routes');
  assert.match(value, /non_ohio|west virginia|pennsylvania/i,
    'authority extractor must pin non-Ohio protected state');
}

auditAuthority(source.authority);

const mutations = [
  source.authority.replaceAll(expectedCandidates[0][2], '00000000-0000-0000-0000-000000000000'),
  source.authority.replaceAll(expectedCandidates[0][3], '00000000000000000000000000000000'),
  source.authority.replaceAll(expectedOld[0][1], expectedCandidates[0][2]),
  source.authority.replaceAll(expectedOld[0][3], '00000000000000000000000000000000'),
  source.authority.replaceAll(expectedRetained[0][5], '00000000000000000000000000000000'),
  source.authority.replaceAll(expectedGooglePads[0][0], '00000000-0000-0000-0000-000000000000'),
  source.authority.replaceAll(expectedGooglePads[0][1], '00000000-0000-0000-0000-000000000000'),
  source.authority.replaceAll('711b1ddd3ba6c47e7642fc700197432f', '00000000000000000000000000000000'),
  source.authority.replaceAll(expectedRouteFunctions[0][1], '00000000000000000000000000000000'),
  source.authority.replaceAll(expectedTriggers[0], 'unauthorized_trigger_name'),
  source.authority.replaceAll("status='validated' and activated_at is null",
    "status='active' and activated_at is not null"),
  source.authority.replace("begin isolation level read committed read only;", 'begin;'),
  source.authority.replace('rollback;', 'commit;'),
  source.authority.replace('rollback;', 'update public.pads set state=state; rollback;'),
  source.authority.replace('perform pg_catalog.pg_advisory_xact_lock',
    'update public.pads set state=state; perform pg_catalog.pg_advisory_xact_lock'),
  source.authority.replace(expectedRouteDependencyFunctions[0],
    'private_verification.brinesearch_issue97_missing_dependency()'),
  source.authority.replace('route_relation_triggers.trigger_rows=0',
    'route_relation_triggers.trigger_rows=1'),
  source.authority.replace(
    'projection_view.rows=1 and projection_view.exact as projection_view_ok',
    'projection_view.rows=0 and projection_view.exact as projection_view_ok'),
  source.authority.replace('as verification_projection_ok',
    'as verification_projection_bypassed'),
  source.authority.replace('tgqual is null and tgnargs=0',
    'tgqual is not null and tgnargs=0'),
  source.authority.replace('tgqual is null and tgnargs=0',
    'tgqual is null and tgnargs>=0'),
  source.authority.replace('pg_catalog.octet_length(tgargs)=0',
    'pg_catalog.octet_length(tgargs)>=0'),
  source.authority.replace('receipt_route_revision=route_revision',
    'receipt_route_revision<>route_revision'),
  source.authority.replace("set local timezone='UTC';", ''),
  source.authority.replace('as occurrence_candidates_digest',
    'as occurrence_candidates_missing_digest'),
  source.authority.replace('route_protection.relation_rows=12',
    'route_protection.relation_rows>=0'),
  source.authority.replace(expectedRouteHistorySequences[0],
    'private_verification.brinesearch_route_occurrence_receipt_history_missing_id_seq'),
  source.authority.replace('saved_road.run_rows=0',
    'saved_road.run_rows>=0'),
  source.authority.replace('ingest_locks.rows=38',
    'ingest_locks.rows>=0'),
  source.authority.replace('as membership_digest',
    'as membership_missing_digest'),
  source.authority.replace('functions.captured_catalog_rows=24',
    'functions.captured_catalog_rows>=0'),
  source.authority.replace('public_route_triggers.trigger_rows=2',
    'public_route_triggers.trigger_rows>=0'),
  source.authority.replaceAll('brinesearch_issue97_google_route_steps_stale',
    'unauthorized_public_route_trigger'),
  source.authority.replaceAll(
    'private_verification.brinesearch_clear_stale_route_step_identity_issue70()',
    'private_verification.brinesearch_missing_route_step_identity_guard()'),
  source.authority.replace('route_functions.captured_definition_rows=33',
    'route_functions.captured_definition_rows>=0'),
  source.authority.replace('route_dependencies.captured_catalog_rows=11',
    'route_dependencies.captured_catalog_rows>=0'),
  source.authority.replace("'definition',inventory.definition",
    "'definition_omitted',null"),
  source.authority.replace(expectedPublicRouteMutationPattern,
    expectedPublicRouteMutationPattern.replaceAll('\\\\', '\\\\\\\\')),
  source.authority.replace(
    'UPDATE public.brinesearch_pad_roads SET road_id=road_id',
    'SELECT road_id FROM public.brinesearch_pad_roads'),
  source.authority.replace(
    ") || pg_catalog.jsonb_build_object(\n    'topology_junction_count'",
    ",\n    'topology_junction_count'"),
  source.authority.replace('-- EXACT_FINAL_412_END',
    "    ('00000000-0000-0000-0000-000000000000'::uuid)\n-- EXACT_FINAL_412_END"),
];
for (const [index, mutation] of mutations.entries()) {
  assert.throws(() => auditAuthority(mutation), undefined,
    `mutation ${index + 1} must fail the activation-authority audit`);
}

assert.equal(packageJson.scripts['verify:issue97-frozen-wave-activation-authority'],
  'node v17/scripts/audit-issue97-frozen-wave-ohio-activation-authority.mjs',
  'package activation-authority script is missing or drifted');
const buildParts = packageJson.scripts.build.split(' && ');
const manifestIndex = buildParts.indexOf('npm run verify:issue97-frozen-wave-state-manifest');
assert.equal(buildParts[manifestIndex + 1],
  'npm run verify:issue97-frozen-wave-activation-authority',
  'activation-authority audit must run immediately after the manifest audit');

console.log('Issue #97 frozen-wave Ohio activation-authority static audit PASS.');
