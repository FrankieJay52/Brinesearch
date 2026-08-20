import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(
  'supabase/migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
  'utf8',
);
const routeManifest = fs.readFileSync(
  'ops/issue97-computer-rollout/sql/34-frozen-exact-mapping-wave-route-manifest.sql',
  'utf8',
);
const rehearsal = fs.readFileSync(
  'supabase/tests/issue97_frozen_exact_mapping_wave.sql',
  'utf8',
);
const syntheticRegression = fs.readFileSync(
  'supabase/tests/issue97_road_junction_graph_synthetic.sql',
  'utf8',
);

const requireText = (source, token, label = token) => {
  if (!source.includes(token)) throw new Error(`Missing Issue #97 mapping-wave contract: ${label}`);
};
const forbid = (source, pattern, label) => {
  if (pattern.test(source)) throw new Error(`Forbidden Issue #97 mapping-wave behavior: ${label}`);
};
const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

const targetBlock = migration.match(
  /insert into tmp_issue97_frozen_mapping_targets values([\s\S]*?);\s*select pg_catalog\.pg_advisory_xact_lock/,
)?.[1];
if (!targetBlock) throw new Error('Could not parse the frozen mapping target block');

const targetPattern = /\('([0-9a-f-]{36})','([0-9a-f-]{36})','(exact_route_designation|exact_base_nlf_source_street_core)','([0-9a-f]{32})','([0-9a-f]{32})'\)/g;
const targets = [...targetBlock.matchAll(targetPattern)].map((match) => ({
  identity: match[1], road: match[2], basis: match[3],
}));
const identities = [...new Set(targets.map(({ identity }) => identity))].sort();
const roads = [...new Set(targets.map(({ road }) => road))].sort();
if (targets.length !== 46 || identities.length !== 46 || roads.length !== 37) {
  throw new Error(`Frozen mapping cardinality drifted: ${targets.length}/${identities.length}/${roads.length}`);
}
if (targets.filter(({ basis }) => basis === 'exact_route_designation').length !== 28
    || targets.filter(({ basis }) => basis === 'exact_base_nlf_source_street_core').length !== 18) {
  throw new Error('Frozen mapping evidence-basis split drifted');
}
if (md5(identities.join('|')) !== '492ff9967d8a822d10c8d5003cd018a6'
    || md5(roads.join('|')) !== 'e512c45fa202ccf48df1ac272246ce94'
    || md5(targets.sort((a, b) => a.identity.localeCompare(b.identity))
      .map(({ identity, road }) => `${identity}:${road}`).join('|')) !== '0a0f29f2c40f1d1265b498f77ab56dd7') {
  throw new Error('Frozen mapping allowlist digest drifted');
}

const manifestTargetBlock = routeManifest.match(
  /target_pairs\(identity_id,road_id\) as \(\s*values([\s\S]*?)\),\s*-- EXACT_REPLACED_GRAPHS_BEGIN/,
)?.[1];
if (!manifestTargetBlock) throw new Error('Could not parse route-manifest mapping pairs');
const manifestPairs = [...manifestTargetBlock.matchAll(
  /\('([0-9a-f-]{36})'::uuid,'([0-9a-f-]{36})'::uuid\)/g,
)].map((match) => `${match[1]}:${match[2]}`).sort();
const migrationPairs = targets.map(({ identity, road }) => `${identity}:${road}`).sort();
if (manifestPairs.length !== 46
    || JSON.stringify(manifestPairs) !== JSON.stringify(migrationPairs)) {
  throw new Error('Migration and exact route manifest use different identity/road pairs');
}

const normalizedMigration = migration.replace(/\s+/g, ' ');
const frozenTargetMappingInsert = migration.match(
  /insert into public\.brinesearch_road_identity_mappings\(\s*id,identity_id,road_id,mapping_status,mapping_method,evidence,verified_at,created_at,updated_at\s*\)\s*select[\s\S]*?from tmp_issue97_frozen_mapping_targets target\s*join public\.brinesearch_authoritative_road_identities identity on identity\.id=target\.identity_id;/,
)?.[0];
if (!frozenTargetMappingInsert) {
  throw new Error('Could not parse the exact frozen target mapping INSERT');
}
const normalizedFrozenTargetMappingInsert = frozenTargetMappingInsert.replace(/\s+/g, ' ');
const reviewedEvidenceDigestExpression = "pg_catalog.md5( pg_catalog.concat_ws( '|', target.identity_id::text, target.road_id::text, target.evidence_basis, target.expected_source_digest, target.expected_road_row_md5 ) )";
if (!/target\.identity_id,target\.road_id,'verified',\s*'manual_reviewed_source_evidence',/.test(
  normalizedFrozenTargetMappingInsert,
)) {
  throw new Error('Frozen target mapping INSERT must select the reviewed mapping method');
}
if ((frozenTargetMappingInsert.match(/'manual_reviewed_source_evidence'/g) ?? []).length !== 1) {
  throw new Error('Frozen target mapping INSERT must select exactly one reviewed mapping method');
}
for (const token of [
  "'reviewed_by','issue97_repository_frozen_wave'",
  "'reviewed_at','2026-08-17T19:32:12Z'",
  "'repository_reviewed',true",
  "'machine_owned',false",
  "'exact_method',case target.evidence_basis when 'exact_route_designation' then 'official_source_id' else 'manual_source_conflation' end",
  `'evidence_digest',${reviewedEvidenceDigestExpression}`,
]) {
  requireText(
    normalizedFrozenTargetMappingInsert,
    token,
    `frozen reviewed mapping INSERT contract: ${token}`,
  );
}

const frozenTargetMappingReceipt = migration.match(
  /if \(select count\(\*\) from public\.brinesearch_road_identity_mappings mapping[\s\S]*?raise exception 'Issue #97 exact frozen 46 mapping insert failed';\s*end if;/,
)?.[0];
if (!frozenTargetMappingReceipt) {
  throw new Error('Could not parse the exact frozen 46-row mapping receipt assertion');
}
const normalizedFrozenTargetMappingReceipt = frozenTargetMappingReceipt.replace(/\s+/g, ' ');
for (const token of [
  "mapping.mapping_method='manual_reviewed_source_evidence'",
  "mapping.evidence->>'migration'='issue97_frozen_exact_mapping_wave'",
  "mapping.evidence->>'reviewed_by'='issue97_repository_frozen_wave'",
  "mapping.evidence->>'reviewed_at'='2026-08-17T19:32:12Z'",
  "(mapping.evidence->>'repository_reviewed')::boolean=true",
  "(mapping.evidence->>'machine_owned')::boolean=false",
  "mapping.evidence->>'exact_method'=case target.evidence_basis when 'exact_route_designation' then 'official_source_id' else 'manual_source_conflation' end",
  `mapping.evidence->>'evidence_digest'=${reviewedEvidenceDigestExpression}`,
  ')<>46',
]) {
  requireText(
    normalizedFrozenTargetMappingReceipt,
    token,
    `frozen reviewed mapping receipt assertion: ${token}`,
  );
}
forbid(
  frozenTargetMappingInsert,
  /case\s+target\.evidence_basis\s+when\s+'exact_route_designation'\s+then\s+'exact_route_designation'\s+else\s+'exact_source_record_id'\s+end/i,
  'machine-owned mapping method restored in frozen target INSERT',
);

const machineOwnedMappingMethods = new Set([
  'exact_source_record_id',
  'exact_route_designation',
]);

const refreshMayRetire = (method) => machineOwnedMappingMethods.has(method);

assert.equal(refreshMayRetire('exact_source_record_id'), true);
assert.equal(refreshMayRetire('exact_route_designation'), true);
assert.equal(refreshMayRetire('manual_reviewed_source_evidence'), false);

const refreshOwnershipGuard = migration.match(
  /select pg_catalog\.regexp_replace\(\s*pg_catalog\.pg_get_functiondef\(proc\.oid\),[\s\S]*?raise exception\s*'Issue #97 exact mapping refresh ownership contract drifted';\s*end if;/,
)?.[0];
if (!refreshOwnershipGuard) {
  throw new Error('Could not parse the refresh ownership inspection and fail-closed guard');
}
const normalizedRefreshOwnershipGuard = refreshOwnershipGuard.replace(/\s+/g, ' ');
for (const token of [
  'pg_catalog.pg_get_functiondef(proc.oid)',
  'into strict v_refresh_exact_mappings_definition',
  'join pg_catalog.pg_namespace namespace on namespace.oid=proc.pronamespace',
  "namespace.nspname='public'",
  "proc.proname='brinesearch_issue97_refresh_exact_mappings'",
  'proc.pronargs=0',
  'v_refresh_exact_mappings_definition is null',
  "pg_catalog.strpos( v_refresh_exact_mappings_definition, 'where mapping_method in (''exact_source_record_id'',''exact_route_designation'') and mapping_status in (''verified'',''candidate'')' )=0",
  "pg_catalog.strpos( v_refresh_exact_mappings_definition, 'manual.mapping_method not in (''exact_source_record_id'',''exact_route_designation'')' )=0",
  "raise exception 'Issue #97 exact mapping refresh ownership contract drifted'",
]) {
  requireText(
    normalizedRefreshOwnershipGuard,
    token,
    `scoped refresh ownership guard: ${token}`,
  );
}

for (const token of [
  "array['BEL','CAR','COL','GUE','HAS','JEF','MOE','NOB']::text[]",
  "'affected_membership_count',1565",
  "'graph_action','rebuild_required'",
  "'route_refresh_performed',false",
  "private_verification.brinesearch_issue97_dataset_scope_current(",
  "identity.source_digest=target.expected_source_digest",
  "identity.source_identity_key not like 'OH:ODOT:NLF:'",
  "source.street_match_key=pg_catalog.split_part(road.source_record_id,'|street:',2)",
  "mapping_status='verified'",
  "'name_matching_used',false",
  "'fuzzy_matching_used',false",
  "'nearest_road_used',false",
  "where membership.road_id is not null",
  'A metadata restamp would',
  "'mapping_dependent_routes',379",
  "'transition_only_routes',33",
  "'final_route_count',412",
  "'final_primary_count',340",
  "'final_alternate_count',72",
  "'final_route_set_digest','711b1ddd3ba6c47e7642fc700197432f'",
  "'old_active_graphs_release_current',false",
  "'replacement_build_ids_must_be_repository_pinned',true",
  'v_refresh_exact_mappings_definition text',
  'pg_catalog.pg_get_functiondef(proc.oid)',
  "proc.proname='brinesearch_issue97_refresh_exact_mappings'",
  'proc.pronargs=0',
  "'where mapping_method in (''exact_source_record_id'',''exact_route_designation'') and mapping_status in (''verified'',''candidate'')'",
  "'manual.mapping_method not in (''exact_source_record_id'',''exact_route_designation'')'",
  'Issue #97 exact mapping refresh ownership contract drifted',
  'manual_reviewed_source_evidence',
  'issue97_repository_frozen_wave',
  '2026-08-17T19:32:12Z',
  'repository_reviewed',
  'machine_owned',
  'official_source_id',
  'manual_source_conflation',
  'evidence_digest',
  "'mapping_ownership','manual_reviewed_source_evidence'",
  "'machine_refresh_may_retire_target_mappings',false",
  'old affected graph escaped the mapping-currentness quarantine',
  'target.road_id=mapping.road_id',
  "mapping.id=private_verification.brinesearch_issue97_uuid(",
  'tmp_issue97_frozen_mapping_expected_google_pads',
  'with path_a as (',
  '), path_b as (',
  'select pad_id from path_a',
  'select pad_id from path_b',
  "pg_catalog.jsonb_array_elements(coalesce(receipt.manifest->'points','[]'::jsonb))",
  "'5cd68da6e31fa7bf5b59bca9935f96f2'",
  'road_update_hit',
  'expected_route_revision',
  "expected.structured_route_revision<>0",
  "expected.road_sequence_status is not distinct from 'owner_verified'",
  'non_target_private_google',
  'non_target_pad_google',
  'non_target_google_queue',
  "receipt.hold_reason is distinct from 'road_identity_mapping_changed'",
  "receipt.manifest->>'route_ready' is distinct from 'false'",
  'receipt.manifest_digest is not null',
  'receipt.dependency_digest is not null',
  "target.identity_id::text=receipt.evidence->>'identity_id'",
  "target.road_id::text=receipt.evidence->>'road_id'",
  "pad.brinesearch_google_route_status_issue97 is distinct from 'stale'",
  'pad.structured_route_revision is distinct from expected.structured_route_revision',
  'pad.road_sequence_status is distinct from expected.road_sequence_status',
  "queue.reason<>'road_identity_mapping_changed'",
  'tmp_issue97_frozen_mapping_google_immediate_receipts',
  'tmp_issue97_frozen_mapping_google_immediate_pads',
  '(select count(*) from tmp_issue97_frozen_mapping_google_immediate_receipts)<>3',
  '(select count(*) from tmp_issue97_frozen_mapping_google_immediate_pads)<>3',
  'Issue #97 frozen mapping wave immediate Google snapshot count drifted',
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;',
  'where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;',
  "trigger.tgenabled<>'O'",
  'Issue #97 frozen mapping wave broke target road/mapping contract',
  'Issue #97 frozen mapping wave changed non-target roads or mappings',
  'Issue #97 frozen mapping wave changed route occurrence or reconciliation receipts',
  'Issue #97 frozen mapping wave Google invalidation pad set drifted',
  'Issue #97 frozen mapping wave changed non-target Google state',
  'Issue #97 frozen mapping wave target immediate Google hold is invalid',
  'Issue #97 frozen mapping wave target pad Google state is invalid',
  'Issue #97 frozen mapping wave immediate Google refresh queue is invalid',
  'Issue #97 frozen mapping wave deferred processor changed target stale state',
  'Issue #97 frozen mapping wave deferred processor did not drain safely',
  'Issue #97 frozen mapping wave changed release source graph or reconciliation protected state',
  'Issue #97 frozen mapping wave public Google routes are not zero',
]) requireText(migration, token);

const expectedPadsIndex = migration.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_expected_google_pads',
);
const refreshOwnershipInspectionIndex = migration.indexOf(
  'into strict v_refresh_exact_mappings_definition',
);
const refreshOwnershipGuardIndex = migration.indexOf(refreshOwnershipGuard);
const refreshOwnershipGuardEndIndex = refreshOwnershipGuardIndex
  + refreshOwnershipGuard.length;
const roadWriteIndex = migration.indexOf('update public.brinesearch_roads road set');
const mappingWriteIndex = migration.indexOf(
  'insert into public.brinesearch_road_identity_mappings(',
);
const immediateQueueAssertionIndex = migration.indexOf(
  'Issue #97 frozen mapping wave immediate Google refresh queue is invalid',
);
const forceDeferredEventsIndex = migration.indexOf(
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;',
);
const restoreDeferredIndex = migration.indexOf(
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred deferred;',
);
const immediateReceiptSnapshotIndex = migration.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_google_immediate_receipts',
);
const immediatePadSnapshotIndex = migration.indexOf(
  'create temporary table tmp_issue97_frozen_mapping_google_immediate_pads',
);
const staleStateEqualityIndex = migration.indexOf(
  'Issue #97 frozen mapping wave deferred processor changed target stale state',
);
const drainedSafelyIndex = migration.indexOf(
  'Issue #97 frozen mapping wave deferred processor did not drain safely',
);
if (expectedPadsIndex < 0 || roadWriteIndex < 0 || mappingWriteIndex < 0
    || !(expectedPadsIndex < roadWriteIndex && expectedPadsIndex < mappingWriteIndex)) {
  throw new Error('Google invalidation dependency set must be frozen before road/mapping writes');
}
if (refreshOwnershipInspectionIndex < 0 || refreshOwnershipGuardIndex < 0
    || !(refreshOwnershipInspectionIndex < refreshOwnershipGuardEndIndex
      && refreshOwnershipGuardEndIndex < roadWriteIndex
      && refreshOwnershipGuardEndIndex < mappingWriteIndex)) {
  throw new Error('Completed refresh ownership guard must precede target road and mapping writes');
}
if (!(immediateQueueAssertionIndex < immediateReceiptSnapshotIndex
    && immediateQueueAssertionIndex < immediatePadSnapshotIndex
    && immediateReceiptSnapshotIndex < forceDeferredEventsIndex
    && immediatePadSnapshotIndex < forceDeferredEventsIndex
    && forceDeferredEventsIndex < staleStateEqualityIndex
    && staleStateEqualityIndex < drainedSafelyIndex
    && drainedSafelyIndex < restoreDeferredIndex)) {
  throw new Error('Deferred Google processor ordering drifted');
}
if ((migration.match(/where pg_catalog\.to_jsonb\(live\) is distinct from pg_catalog\.to_jsonb\(snapshot\)/g) ?? []).length < 2
    || (migration.match(/receipt\.status is distinct from 'stale'/g) ?? []).length < 2
    || (migration.match(/receipt\.hold_reason is distinct from 'road_identity_mapping_changed'/g) ?? []).length < 2) {
  throw new Error('Deferred Google processor must preserve the exact immediate stale receipt and pad state');
}

forbid(migration, /brinesearch_oh_county_code\s*\(/i, 'stale Ohio county helper');
forbid(migration, /update\s+public\.brinesearch_road_graph_builds\b/i, 'mapping receipt restamp');
forbid(migration, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route refresh, reconciliation, or graph activation');
forbid(migration, /(?:name_only|fuzzy_name|nearest_road)\s*['"]?\s*[:,=]\s*(?:true|1)/i,
  'guess resolution evidence');
forbid(migration, /\bdisable\s+trigger\b/i, 'disabled Google safety trigger');
forbid(migration, /issue97_cutover_not_active/i,
  'stored held state substituted for the unchanged immediate stale state');
forbid(migration,
  /delete\s+from\s+private_verification\.brinesearch_google_route_refresh_queue_issue97/i,
  'manual deletion of pending deferred Google refresh events');

const finalBlock = routeManifest.match(
  /-- EXACT_FINAL_412_BEGIN([\s\S]*?)-- EXACT_FINAL_412_END/,
)?.[1];
if (!finalBlock) throw new Error('Could not parse exact final 412-route block');
const routeIds = [...finalBlock.matchAll(/\('([0-9a-f-]{36})'::uuid\)/g)].map((match) => match[1]);
if (routeIds.length !== 412 || new Set(routeIds).size !== 412
    || md5([...routeIds].sort().join('|')) !== '711b1ddd3ba6c47e7642fc700197432f') {
  throw new Error(`Frozen route manifest drifted: ${routeIds.length}`);
}
for (const token of [
  '-- EXACT_FINAL_412_BEGIN',
  '-- EXACT_FINAL_412_END',
  '(select count(*) from frozen_routes) final_count',
  "metrics.final_digest='711b1ddd3ba6c47e7642fc700197432f'",
  'metrics.former_379_omission_count=33 as former_379_rejected',
  'metrics.leg_a_count=379',
  "metrics.leg_a_digest='836c1f57210e4d18c0f60d4c1ea77d7d'",
  'metrics.transition_only_count=33',
  'metrics.final_count=412',
  "metrics.final_digest='711b1ddd3ba6c47e7642fc700197432f'",
  'metrics.former_379_omission_count=33',
  'except select route_prep_id',
]) requireText(routeManifest, token);
forbid(routeManifest, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route manifest execution');

for (const fixture of [
  '86d86ac5-199c-4715-be36-785a13c1cf30',
  'dfb3f204-190c-4d65-85b3-16bcd1715825',
  'f03e1196-9843-4a62-af08-b4c7eb681e38',
]) {
  if (!routeIds.includes(fixture)) throw new Error(`Frozen closure lost fixture ${fixture}`);
}

const replacedGraphs = [...routeManifest.matchAll(
  /\('([A-Z]{3})','([0-9a-f-]{36})'::uuid,'([0-9a-f]{32})'\)/g,
)].map((match) => match[1]);
if (replacedGraphs.join(',') !== 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB') {
  throw new Error(`Replaced active graph pins drifted: ${replacedGraphs.join(',')}`);
}

const builds = [...rehearsal.matchAll(
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','([A-Z]{3})'\)/g,
)].map((match) => match[1]);
if (builds.join(',') !== 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB') {
  throw new Error(`Exact serial rebuild plan drifted: ${builds.join(',')}`);
}

// Repeated-call temp-table guard. The pinned builder creates
// tmp_issue97_point_corroboration with ON COMMIT DROP and omits it from its own
// repeated-call cleanup block. ON COMMIT DROP does not run when a builder call
// returns, so any caller invoking the builder more than once inside a single
// transaction must clear that session-local table between calls or the next
// call fails with SQLSTATE 42P07. These assertions keep the guards paired with
// their calls, and the rationale token keeps them from being removed later as
// apparently unnecessary.
const guardStatement = 'drop table if exists pg_temp.tmp_issue97_point_corroboration;';
const guardToken = 'issue97-point-corroboration-repeated-call-guard';

const offsetsOf = (source, needle) => {
  const found = [];
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
    found.push(at);
  }
  return found;
};

// guardedFrom is the 1-based index of the first builder call that requires a
// preceding guard; earlier calls run against a clean pg_temp and need none.
const assertGuardedCalls = (source, label, callPattern, expectedCalls, guardedFrom) => {
  const calls = [...source.matchAll(callPattern)].map((match) => match.index);
  if (calls.length !== expectedCalls) {
    throw new Error(`${label}: expected ${expectedCalls} builder calls, found ${calls.length}`);
  }
  const guards = offsetsOf(source, guardStatement);
  const expectedGuards = expectedCalls - guardedFrom + 1;
  if (guards.length !== expectedGuards) {
    throw new Error(`${label}: expected ${expectedGuards} repeated-call guards, found ${guards.length}`);
  }
  for (let index = 0; index < guards.length; index += 1) {
    const call = calls[guardedFrom - 1 + index];
    const previousCall = index === 0 && guardedFrom === 1 ? -1 : calls[guardedFrom - 2 + index];
    if (guards[index] <= previousCall || guards[index] >= call) {
      throw new Error(`${label}: guard ${index + 1} is not between builder call ${guardedFrom - 1 + index} and call ${guardedFrom + index}`);
    }
  }
  requireText(source, guardToken, `${label}: repeated-call guard rationale token`);
  return guards.length;
};

const rehearsalGuards = assertGuardedCalls(
  rehearsal,
  'Frozen mapping rehearsal',
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','[A-Z]{3}'\)/g,
  8,
  1,
);
const syntheticGuards = assertGuardedCalls(
  syntheticRegression,
  'Synthetic topology regression',
  /public\.brinesearch_issue97_rebuild_county_graph\('WV','DOD'\)/g,
  3,
  2,
);
for (const token of [
  "set local statement_timeout='90min'", "set local lock_timeout='2min'",
  "'06705f5b35a6d37151bb2c0dc5ade9bd'",
  "where version='20260817193212'", "build.status<>'validated'",
  "build.activated_at is not null",
  "where target.identity_id=membership.identity_id",
  'rebuilt graph changed source topology beyond exact mapping road IDs',
  'brinesearch_issue97_graph_build_release_current(build.id)',
  "build.id=(result.result->>'build_id')::uuid",
  'requires_repository_pin',
  'candidate build lane activated or replaced a graph',
  "where evidence->>'migration'='issue97_frozen_exact_mapping_wave')<>0",
  'insert into supabase_migrations.schema_migrations(version,statements,name)',
  "'issue97_frozen_exact_mapping_wave'",
  'tmp_issue97_frozen_mapping_expected_google_pads',
  "'5cd68da6e31fa7bf5b59bca9935f96f2'",
  'tmp_issue97_frozen_mapping_google_immediate_receipts',
  'tmp_issue97_frozen_mapping_google_immediate_pads',
  'tmp_issue97_mapping_wave_post_migration_target_receipts',
  'tmp_issue97_mapping_wave_post_migration_target_pads',
  'tmp_issue97_mapping_wave_reviewed_mappings_before_build',
  'Issue #97 reviewed frozen mapping snapshot count drifted',
  'Issue #97 reviewed frozen mappings changed during graph rebuilds',
  '(select count(*) from tmp_issue97_mapping_wave_post_migration_target_receipts)<>3',
  '(select count(*) from tmp_issue97_mapping_wave_post_migration_target_pads)<>3',
  "receipt.status is distinct from 'stale'",
  "receipt.hold_reason is distinct from 'road_identity_mapping_changed'",
  'where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
  'non_target_private_google',
  'non_target_pad_google',
  'brinesearch_google_route_refresh_queue_issue97',
  'Issue #97 rollback rehearsal post-processor Google contract failed',
  'Issue #97 rollback rehearsal Google state changed during dark builds',
]) requireText(rehearsal, token);
if ((rehearsal.match(/where pg_catalog\.to_jsonb\(live\) is distinct from pg_catalog\.to_jsonb\(snapshot\)/g) ?? []).length < 4) {
  throw new Error('Rollback rehearsal must byte-compare target receipts and pad state after processing and dark builds');
}
const normalizedRehearsal = rehearsal.replace(/\s+/g, ' ');
if ((normalizedRehearsal.match(
  /from tmp_issue97_mapping_wave_reviewed_mappings_before_build\s*\)<>46/g,
) ?? []).length !== 2) {
  throw new Error('Reviewed frozen mapping snapshot count must be checked before and after builds');
}
for (const token of [
  'create temporary table tmp_issue97_mapping_wave_reviewed_mappings_before_build on commit drop as select mapping.*',
  "mapping.mapping_method='manual_reviewed_source_evidence'",
  '( select count(*) from public.brinesearch_road_identity_mappings mapping join tmp_issue97_frozen_mapping_targets target on target.identity_id=mapping.identity_id and target.road_id=mapping.road_id )<>46',
  'from tmp_issue97_mapping_wave_reviewed_mappings_before_build snapshot full join ( select mapping.*',
  ') live using(id) where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `reviewed frozen mapping survival contract: ${token}`,
  );
}
if (offsetsOf(
  rehearsal,
  'Issue #97 reviewed frozen mapping snapshot count drifted',
).length !== 1) {
  throw new Error('Reviewed frozen mapping snapshot-count RAISE must occur exactly once');
}
if (offsetsOf(
  rehearsal,
  'Issue #97 reviewed frozen mappings changed during graph rebuilds',
).length !== 1) {
  throw new Error('Reviewed frozen mapping survival RAISE must occur exactly once');
}
requireText(
  normalizedRehearsal,
  'build.graph_digest is not distinct from prior.graph_digest',
  'candidate graph digest must change',
);
requireText(
  normalizedRehearsal,
  "build.details->>'mapping_snapshot_digest' is not distinct from prior.details->>'mapping_snapshot_digest'",
  'candidate mapping snapshot digest must change',
);
requireText(
  normalizedRehearsal,
  "build.details->>'registry_digest' is not distinct from prior.details->>'registry_digest'",
  'candidate registry digest must change',
);
requireText(
  normalizedRehearsal,
  'build.source_revision_digest is not distinct from prior.source_revision_digest',
  'candidate source revision digest must change',
);
requireText(
  normalizedRehearsal,
  "build.details->'source_run_vector' is distinct from prior.details->'source_run_vector'",
  'candidate source-run vector must remain unchanged',
);
requireText(
  normalizedRehearsal,
  "build.details->>'source_vector_version' is distinct from prior.details->>'source_vector_version'",
  'candidate source-vector version must remain unchanged',
);
for (const token of [
  'build.source_segment_count is distinct from prior.source_segment_count',
  'build.identity_count is distinct from prior.identity_count',
  'build.point_junction_count is distinct from prior.point_junction_count',
  'build.shared_segment_count is distinct from prior.shared_segment_count',
  'build.membership_count is distinct from prior.membership_count',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `candidate source/topology count must remain unchanged: ${token}`,
  );
}

const validateCandidateDigestTransition = ({
  graphChanged,
  mappingSnapshotChanged,
  registryChanged,
  sourceRevisionChanged,
  sourceRunVectorUnchanged,
  sourceVectorVersionUnchanged,
  countsUnchanged,
}) => graphChanged
  && mappingSnapshotChanged
  && registryChanged
  && sourceRevisionChanged
  && sourceRunVectorUnchanged
  && sourceVectorVersionUnchanged
  && countsUnchanged;

const reviewedCandidateDigestTransition = {
  graphChanged: true,
  mappingSnapshotChanged: true,
  registryChanged: true,
  sourceRevisionChanged: true,
  sourceRunVectorUnchanged: true,
  sourceVectorVersionUnchanged: true,
  countsUnchanged: true,
};

assert.equal(validateCandidateDigestTransition(reviewedCandidateDigestTransition), true);
for (const property of Object.keys(reviewedCandidateDigestTransition)) {
  assert.equal(
    validateCandidateDigestTransition({
      ...reviewedCandidateDigestTransition,
      [property]: false,
    }),
    false,
    `candidate digest transition mutation escaped: ${property}`,
  );
}

for (const token of [
  'v_expected_target_membership_count constant bigint := 1565',
  'v_observed_target_membership_count bigint',
  'v_road_id_mismatch_count bigint',
  "v_count_diff_sample jsonb := '[]'::jsonb",
  "v_road_id_mismatch_sample jsonb := '[]'::jsonb",
  "'expected_target_membership_count'",
  "'observed_target_membership_count'",
  "'count_diff_sample'",
  "'road_id_mismatch_count'",
  "'road_id_mismatch_sample'",
  'junction.stable_junction_key',
  'Issue #97 rebuilt graph target-membership count drifted',
  'Issue #97 rebuilt graph target-membership road IDs mismatched',
  'into v_observed_target_membership_count',
  'into v_road_id_mismatch_count',
  'into v_count_diff_sample',
  'into v_road_id_mismatch_sample',
  'full join observed using(county_code,identity_id)',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `target-membership diagnostic contract: ${token}`,
  );
}

const countDriftRaise = "raise exception using message= 'Issue #97 rebuilt graph target-membership count drifted'";
const roadIdMismatchRaise = "raise exception using message= 'Issue #97 rebuilt graph target-membership road IDs mismatched'";
if (offsetsOf(normalizedRehearsal, countDriftRaise).length !== 1) {
  throw new Error('Target-membership count-drift RAISE must occur exactly once');
}
if (offsetsOf(normalizedRehearsal, roadIdMismatchRaise).length !== 1) {
  throw new Error('Target-membership road-ID mismatch RAISE must occur exactly once');
}

const candidateDigestContractIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 exact eight-county dark rebuild contract failed'",
);
const migrationApplicationIndex = normalizedRehearsal.indexOf(
  '\\ir ../migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
);
const reviewedSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_reviewed_mappings_before_build',
);
const buildResultsCreationIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_build_results(',
);
const firstGraphBuildIndex = normalizedRehearsal.indexOf(
  "public.brinesearch_issue97_rebuild_county_graph('OH','BEL')",
);
const lastGraphBuildIndex = normalizedRehearsal.indexOf(
  "public.brinesearch_issue97_rebuild_county_graph('OH','NOB')",
);
const newBuildMaterializationIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_new_builds on commit drop as',
);
const reviewedMappingSurvivalAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 reviewed frozen mappings changed during graph rebuilds'",
);
const countDriftAssertionIndex = normalizedRehearsal.indexOf(countDriftRaise);
const roadIdMismatchAssertionIndex = normalizedRehearsal.indexOf(roadIdMismatchRaise);
const semanticTopologyAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rebuilt graph changed source topology beyond exact mapping road IDs'",
);
const releaseCurrentnessAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rebuilt dark graph is not fully release-current'",
);
const activationProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 candidate build lane activated or replaced a graph'",
);
const routeProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rollback rehearsal changed route/public/cutover/WV/PA state'",
);
const googleProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rollback rehearsal Google state changed during dark builds'",
);
if (migrationApplicationIndex < 0 || reviewedSnapshotIndex < 0
    || buildResultsCreationIndex < 0
    || firstGraphBuildIndex < 0 || lastGraphBuildIndex < 0
    || newBuildMaterializationIndex < 0 || reviewedMappingSurvivalAssertionIndex < 0
    || candidateDigestContractIndex < 0 || countDriftAssertionIndex < 0
    || roadIdMismatchAssertionIndex < 0 || semanticTopologyAssertionIndex < 0
    || releaseCurrentnessAssertionIndex < 0 || activationProtectionAssertionIndex < 0
    || routeProtectionAssertionIndex < 0 || googleProtectionAssertionIndex < 0
    || !(migrationApplicationIndex < reviewedSnapshotIndex
      && reviewedSnapshotIndex < buildResultsCreationIndex
      && buildResultsCreationIndex < firstGraphBuildIndex
      && firstGraphBuildIndex < lastGraphBuildIndex
      && lastGraphBuildIndex < newBuildMaterializationIndex
      && newBuildMaterializationIndex < reviewedMappingSurvivalAssertionIndex
      && reviewedMappingSurvivalAssertionIndex < candidateDigestContractIndex
      && candidateDigestContractIndex < countDriftAssertionIndex
      && countDriftAssertionIndex < roadIdMismatchAssertionIndex
      && roadIdMismatchAssertionIndex < semanticTopologyAssertionIndex
      && semanticTopologyAssertionIndex < releaseCurrentnessAssertionIndex
      && releaseCurrentnessAssertionIndex < activationProtectionAssertionIndex
      && activationProtectionAssertionIndex < routeProtectionAssertionIndex
      && routeProtectionAssertionIndex < googleProtectionAssertionIndex)) {
  throw new Error('Reviewed-mapping survival and later rehearsal safety ordering drifted');
}

const targetMembershipDiagnosticBlock = normalizedRehearsal.slice(
  candidateDigestContractIndex,
  semanticTopologyAssertionIndex,
);
if ((targetMembershipDiagnosticBlock.match(/where membership\.road_id is distinct from target\.road_id/g) ?? []).length !== 2) {
  throw new Error('Target-membership diagnostics must fail closed on exactly two road-ID mismatch checks');
}
if ((targetMembershipDiagnosticBlock.match(/limit 50/g) ?? []).length !== 2) {
  throw new Error('Target-membership diagnostic samples must each remain bounded to 50 rows');
}
forbid(
  rehearsal,
  /Issue #97 rebuilt graph memberships did not capture the exact 46 mappings/i,
  'combined target-membership assertion without predicate-specific diagnostics',
);
forbid(
  rehearsal,
  /membership\.road_id\s*=\s*target\.road_id/i,
  'target-membership road-ID mismatch check changed to equality',
);

const targetMembershipContractPasses = ({
  expectedCount,
  observedCount,
  roadIdMismatchCount,
}) => observedCount === expectedCount
  && roadIdMismatchCount === 0;

assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1565,
  roadIdMismatchCount: 0,
}), true);
assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1564,
  roadIdMismatchCount: 0,
}), false);
assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1566,
  roadIdMismatchCount: 0,
}), false);
assert.equal(targetMembershipContractPasses({
  expectedCount: 1565,
  observedCount: 1565,
  roadIdMismatchCount: 1,
}), false);

requireText(normalizedRehearsal,
  "from private_verification.brinesearch_route_reconciliation_receipts_issue97 receipt join public.brinesearch_route_prep route on route.id=receipt.route_prep_id join public.pads pad on pad.id=route.pad_id where route.active and route.route_group in ('primary','alternate') and pad.state='Ohio' and not coalesce(pad.list_only,false))<>806",
  'Ohio-only 806 route-reconciliation receipt preflight');
if ((rehearsal.match(/^begin;/gmi) ?? []).length !== 1
    || (rehearsal.match(/^rollback;/gmi) ?? []).length !== 1
    || (rehearsal.match(/insert into supabase_migrations\.schema_migrations/gi) ?? []).length !== 1
    || /^commit;/mi.test(rehearsal)) {
  throw new Error('Rollback rehearsal must have one BEGIN, one ROLLBACK, and zero COMMIT');
}
forbid(rehearsal, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route refresh, reconciliation, or activation in rehearsal');
forbid(rehearsal, /order\s+by[\s\S]{0,120}(?:completed_at|created_at)[\s\S]{0,80}limit\s+1/i,
  'latest/newest graph selection');
forbid(rehearsal, /where\s+build\.status='validated'[\s\S]{0,120}(?:select|into)\s+[^;]*build\.id/i,
  'validated-status-only graph selection');
forbid(rehearsal, /\bdisable\s+trigger\b/i, 'disabled Google safety trigger');
forbid(rehearsal, /issue97_cutover_not_active/i,
  'stored held state substituted for the unchanged immediate stale state');
forbid(
  rehearsal,
  /build\.source_revision_digest\s*<>\s*prior\.source_revision_digest/i,
  'source revision incorrectly required to remain unchanged after mapping install',
);
forbid(rehearsal,
  /delete\s+from\s+private_verification\.brinesearch_google_route_refresh_queue_issue97/i,
  'manual deletion of pending deferred Google refresh events');

// Static mutation checks: the package must fail its model if any frozen
// cardinality, digest, graph footprint, or final reconciliation set drifts.
const validateModel = ({
  identities: identityCount = 46,
  roads: roadCount = 37,
  memberships = 1565,
  counties = replacedGraphs,
  mappingRoutes = 379,
  transitionRoutes = 33,
  totalRoutes = 412,
  primary = 340,
  alternate = 72,
  digest = '711b1ddd3ba6c47e7642fc700197432f',
}) => identityCount === 46 && roadCount === 37 && memberships === 1565
  && counties.join(',') === 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB'
  && mappingRoutes === 379 && transitionRoutes === 33
  && totalRoutes === 412 && primary === 340 && alternate === 72
  && digest === '711b1ddd3ba6c47e7642fc700197432f';
if (!validateModel({})) throw new Error('Exact mapping package model rejected its reviewed state');
for (const mutation of [
  { identities: 45 }, { roads: 38 }, { memberships: 1564 },
  { counties: replacedGraphs.slice(1) }, { mappingRoutes: 412 },
  { transitionRoutes: 32 }, { totalRoutes: 379 }, { primary: 339 },
  { alternate: 73 }, { digest: '836c1f57210e4d18c0f60d4c1ea77d7d' },
]) {
  if (validateModel(mutation)) throw new Error(`Mutation escaped mapping package model: ${JSON.stringify(mutation)}`);
}

console.log('Issue #97 frozen exact mapping-wave audit passed.');
console.log(`  frozen identities/roads: ${identities.length}/${roads.length}`);
console.log(`  evidence split: 28 designation / 18 base-NLF street-core`);
console.log(`  graph rebuild footprint: ${builds.join(',')}`);
console.log(`  repeated-call temp guards: ${rehearsalGuards} rehearsal / ${syntheticGuards} synthetic`);
console.log(`  exact final route closure: ${routeIds.length} (340 primary / 72 alternate)`);
console.log('  closure legs: 379 mapping-dependent + 33 transition-only');
console.log(`  route digest: ${md5([...routeIds].sort().join('|'))}`);
