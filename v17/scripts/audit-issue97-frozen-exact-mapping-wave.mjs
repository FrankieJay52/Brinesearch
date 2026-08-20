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

const refreshExpansionBlock = migration.match(
  /insert into tmp_issue97_frozen_mapping_refresh_expansion values([\s\S]*?);\s*select pg_catalog\.pg_advisory_xact_lock/,
)?.[1];
if (!refreshExpansionBlock) {
  throw new Error('Could not parse the reviewed mapping-refresh expansion block');
}
const refreshExpansionPattern = /\('(BEL|CAR)','([0-9a-f-]{36})','([^']+)','([0-9a-f-]{36})','(state_route)','(SR)','([0-9]+)',null,null,null,'(verified)','(exact_route_designation)',([0-9]+),(false),'OH:(BEL|CAR)','(identity_exact_components)','(exact_route_designation)','(needs_review)','(verified)',([0-9]+)\)/g;
const refreshExpansion = [...refreshExpansionBlock.matchAll(refreshExpansionPattern)]
  .map((match) => ({
    county: match[1],
    identity: match[2],
    sourceIdentityKey: match[3],
    road: match[4],
    roadClass: match[5],
    routeSystem: match[6],
    routeNumber: match[7],
    routeSuffix: '',
    routeFraction: '',
    routeExtension: '',
    mappingStatus: match[8],
    mappingMethod: match[9],
    candidateCount: Number(match[10]),
    ambiguity: match[11] === 'true',
    refreshScope: `OH:${match[12]}`,
    designationSource: match[13],
    evidenceFamily: match[14],
    priorRoadStatus: match[15],
    newRoadStatus: match[16],
    oldMembershipOccurrences: Number(match[17]),
  }));
const expectedRefreshExpansion = [
  ['BEL', '0ee37e9a-6dd3-a186-8d3c-fc7dae6bccf1', 'OH:ODOT:NLF:SBELSR00026**C', '0a96a8b7-e9f6-4607-8d09-20cd3793ff8d', '26', 21],
  ['BEL', '32151137-5710-e8d5-f106-83f5059b1d1d', 'OH:ODOT:NLF:SBELSR00007**N', '7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c', '7', 55],
  ['BEL', '4164e40d-9d86-bb26-0950-e590bc53cb15', 'OH:ODOT:NLF:SBELSR00265**C', '154688cf-a3d1-4c2f-bf9c-65b15ab424a4', '265', 3],
  ['BEL', '54c74ce8-54b5-69c9-f8ef-2bc5a59e6a3e', 'OH:ODOT:NLF:SBELSR00007**C', '7c9b1a62-4ed6-4721-94ed-a8bf12ed2f5c', '7', 88],
  ['BEL', 'b56195f1-296a-834e-f5e8-2df1ae3f197e', 'OH:ODOT:NLF:SBELSR00800**C', '0a8a8721-4d20-41bf-8d95-ec069173e584', '800', 96],
  ['CAR', '3a93792d-6725-df4b-de04-5a4075602ffc', 'OH:ODOT:NLF:SCARSR00332**N', '5ae10d76-e896-40bb-aecf-8d23f512e195', '332', 2],
  ['CAR', '43bbec47-3530-415d-dd5d-0fbb54371081', 'OH:ODOT:NLF:SCARSR00644**C', '102d9976-3801-42dc-a716-ee1540364f8f', '644', 2],
].map(([county, identity, sourceIdentityKey, road, routeNumber, oldMembershipOccurrences]) => ({
  county,
  identity,
  sourceIdentityKey,
  road,
  roadClass: 'state_route',
  routeSystem: 'SR',
  routeNumber,
  routeSuffix: '',
  routeFraction: '',
  routeExtension: '',
  mappingStatus: 'verified',
  mappingMethod: 'exact_route_designation',
  candidateCount: 1,
  ambiguity: false,
  refreshScope: `OH:${county}`,
  designationSource: 'identity_exact_components',
  evidenceFamily: 'exact_route_designation',
  priorRoadStatus: 'needs_review',
  newRoadStatus: 'verified',
  oldMembershipOccurrences,
}));
const sortExpansion = (rows) => [...rows].sort((a, b) => a.identity.localeCompare(b.identity));
if (JSON.stringify(sortExpansion(refreshExpansion))
    !== JSON.stringify(sortExpansion(expectedRefreshExpansion))) {
  throw new Error('Reviewed mapping-refresh expansion rows drifted');
}
const refreshExpansionIdentities = refreshExpansion.map(({ identity }) => identity).sort();
const refreshExpansionRoads = [...new Set(refreshExpansion.map(({ road }) => road))].sort();
const refreshExpansionCanonical = sortExpansion(refreshExpansion).map((row) => [
  row.county, row.identity, row.sourceIdentityKey, row.road,
  row.roadClass, row.routeSystem, row.routeNumber,
  row.routeSuffix, row.routeFraction, row.routeExtension,
  row.mappingStatus, row.mappingMethod, String(row.candidateCount),
  String(row.ambiguity), row.refreshScope, row.designationSource,
  row.evidenceFamily, row.priorRoadStatus, row.newRoadStatus,
  String(row.oldMembershipOccurrences),
].join('|')).join(',');
if (refreshExpansion.length !== 7
    || refreshExpansionIdentities.length !== new Set(refreshExpansionIdentities).size
    || refreshExpansionRoads.length !== 6
    || refreshExpansion.filter(({ county }) => county === 'BEL').length !== 5
    || refreshExpansion.filter(({ county }) => county === 'CAR').length !== 2
    || refreshExpansion.reduce((sum, row) => sum + row.oldMembershipOccurrences, 0) !== 267
    || refreshExpansion.some(({ identity }) => identities.includes(identity))
    || refreshExpansion.some(({ road }) => !targets.some(
      (target) => target.road === road && target.basis === 'exact_route_designation',
    ))
    || md5(refreshExpansionIdentities.join(',')) !== '8d8220e71953dc0ae998161ec169b1ae'
    || md5(refreshExpansionRoads.join(',')) !== 'b2498ac8d77d75d69e23e528b57de08d'
    || md5(sortExpansion(refreshExpansion)
      .map(({ identity, road }) => `${identity}|${road}`).join(','))
      !== '6c2fbf02b44ae04197e6da650a212da3'
    || md5(refreshExpansionCanonical) !== '1d47469b225657e89e3c54e2d476fecb') {
  throw new Error('Reviewed mapping-refresh expansion cardinality or digest drifted');
}
requireText(
  migration,
  "'reviewed_machine_refresh_proof_digest','94769e15269d21edca54c50f3330f7a8'",
  'complete rollback-proof transition digest',
);
const refreshExpansionGuard = migration.match(
  /if \(select count\(\*\) from tmp_issue97_frozen_mapping_refresh_expansion\)<>7[\s\S]*?raise exception\s*'Issue #97 reviewed exact mapping-refresh expansion contract drifted';\s*end if;/,
)?.[0];
if (!refreshExpansionGuard) {
  throw new Error('Could not parse the reviewed mapping-refresh expansion guard');
}
const normalizedRefreshExpansionGuard = refreshExpansionGuard.replace(/\s+/g, ' ');
for (const token of [
  '(select count(*) from tmp_issue97_frozen_mapping_refresh_expansion)<>7',
  '(select count(distinct identity_id) from tmp_issue97_frozen_mapping_refresh_expansion)<>7',
  '(select count(distinct road_id) from tmp_issue97_frozen_mapping_refresh_expansion)<>6',
  "where county_code='BEL')<>5",
  "where county_code='CAR')<>2",
  'select sum(old_active_membership_occurrence_count) from tmp_issue97_frozen_mapping_refresh_expansion)<>267',
  "identity.state_code is distinct from 'OH'",
  'identity.county_code is distinct from expansion.county_code',
  'identity.source_identity_key is distinct from expansion.source_identity_key',
  'road.verification_status is distinct from expansion.prior_road_verification_status',
  "expansion.mapping_status is distinct from 'verified'",
  "expansion.mapping_method is distinct from 'exact_route_designation'",
  'expansion.exact_candidate_count is distinct from 1',
  'or expansion.ambiguity_flag',
  "expansion.refresh_scope is distinct from 'OH:'||expansion.county_code",
  "expansion.designation_source is distinct from 'identity_exact_components'",
  "target.evidence_basis='exact_route_designation'",
  "<>'8d8220e71953dc0ae998161ec169b1ae'",
  "<>'b2498ac8d77d75d69e23e528b57de08d'",
  "<>'6c2fbf02b44ae04197e6da650a212da3'",
  "<>'1d47469b225657e89e3c54e2d476fecb'",
]) {
  requireText(
    normalizedRefreshExpansionGuard,
    token,
    `reviewed mapping-refresh expansion guard: ${token}`,
  );
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
  'tmp_issue97_frozen_mapping_refresh_expansion',
  'Issue #97 reviewed exact mapping-refresh expansion contract drifted',
  "'reviewed_machine_refresh_expansion_count',7",
  "'reviewed_machine_refresh_expansion_road_count',6",
  "'reviewed_machine_refresh_membership_occurrences',267",
  "'reviewed_machine_refresh_identity_digest','8d8220e71953dc0ae998161ec169b1ae'",
  "'reviewed_machine_refresh_road_digest','b2498ac8d77d75d69e23e528b57de08d'",
  "'reviewed_machine_refresh_pair_digest','6c2fbf02b44ae04197e6da650a212da3'",
  "'reviewed_machine_refresh_contract_digest','1d47469b225657e89e3c54e2d476fecb'",
  "'reviewed_machine_refresh_proof_digest','94769e15269d21edca54c50f3330f7a8'",
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
const refreshExpansionGuardIndex = migration.indexOf(refreshExpansionGuard);
const refreshExpansionGuardEndIndex = refreshExpansionGuardIndex
  + refreshExpansionGuard.length;
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
if (refreshExpansionGuardIndex < 0
    || !(refreshExpansionGuardEndIndex < roadWriteIndex
      && refreshExpansionGuardEndIndex < mappingWriteIndex)) {
  throw new Error('Completed mapping-refresh expansion guard must precede target road and mapping writes');
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
  'tmp_issue97_mapping_wave_refresh_expansion_before_build',
  'Issue #97 reviewed mapping-refresh expansion pre-build snapshot drifted',
  'Issue #97 reviewed exact mapping-refresh expansion changed during graph rebuilds',
  'old_active_membership_occurrence_count',
  'observed_old_membership_occurrence_count',
  'old_nonnull_road_id_count',
  "mapping.evidence->>'exact_candidate_count'",
  "mapping.evidence->>'ambiguity_held'",
  "mapping.evidence->>'refresh_scope'",
  "mapping.evidence->>'designation_source'",
  '(select count(*) from tmp_issue97_mapping_wave_post_migration_target_receipts)<>3',
  '(select count(*) from tmp_issue97_mapping_wave_post_migration_target_pads)<>3',
  "receipt.status is distinct from 'stale'",
  "receipt.hold_reason is distinct from 'road_identity_mapping_changed'",
  'where pg_catalog.to_jsonb(live) is distinct from pg_catalog.to_jsonb(snapshot)',
  'non_target_private_google',
  'non_target_pad_google',
  'brinesearch_google_route_refresh_queue_issue97',
  'v_google_diff_count',
  'v_google_diff_sample',
  'google_refresh_queue_count',
  'google_refresh_queue_sample',
  'target_google_receipt_diff_count',
  'target_google_receipt_diff_sample',
  'target_google_pad_diff_count',
  'target_google_pad_diff_sample',
  'target_google_stale_state_diff_count',
  'target_google_stale_state_diff_sample',
  'expected_non_target_receipt_digest',
  'observed_non_target_receipt_digest',
  'expected_non_target_pad_digest',
  'observed_non_target_pad_digest',
  'matching_deferred_trigger_count',
  'tmp_issue97_mapping_wave_refresh_expansion_google_before_build',
  '450948793c57a9a1535139fac4974792',
  'Issue #97 reviewed mapping-refresh Google dependency set drifted',
  'Issue #97 reviewed mapping-refresh Google queue contract drifted',
  'expected_queue_count',
  'observed_queue_count',
  'expected_queue_pad_digest',
  'observed_queue_pad_digest',
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_QUEUE|9|450948793c57a9a1535139fac4974792',
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS|',
  'Issue #97 rollback rehearsal post-processor Google contract failed',
  'Issue #97 rollback rehearsal Google target snapshot cardinality changed',
  'Issue #97 rollback rehearsal Google refresh queue is not empty after dark builds',
  'Issue #97 rollback rehearsal public Google or cutover state changed',
  'Issue #97 rollback rehearsal target Google receipts changed during dark builds',
  'Issue #97 rollback rehearsal target Google pad state changed during dark builds',
  'Issue #97 rollback rehearsal target Google stale-state contract changed',
  'Issue #97 rollback rehearsal non-target Google receipts changed',
  'Issue #97 rollback rehearsal non-target Google pad state changed',
  'Issue #97 rollback rehearsal deferred Google trigger contract changed',
]) requireText(rehearsal, token);
forbid(
  rehearsal,
  /Issue #97 rollback rehearsal Google state changed during dark builds/,
  'old combined Google dark-build assertion returned',
);
if ((rehearsal.match(/where pg_catalog\.to_jsonb\(live\) is distinct from pg_catalog\.to_jsonb\(snapshot\)/g) ?? []).length < 4) {
  throw new Error('Rollback rehearsal must byte-compare target receipts and pad state after processing and dark builds');
}
const normalizedRehearsal = rehearsal.replace(/\s+/g, ' ');
if (md5(normalizedRehearsal) !== '7daf7c656e9271a5b81c696b89627f48') {
  throw new Error('Complete frozen mapping-wave rehearsal drifted');
}
const rebuildAssertionsOpen = 'do $issue97_frozen_mapping_rebuild_assertions$';
const rebuildAssertionsClose = '$issue97_frozen_mapping_rebuild_assertions$;';
const rebuildAssertionsStart = normalizedRehearsal.indexOf(rebuildAssertionsOpen);
const rebuildAssertionsEnd = normalizedRehearsal.indexOf(
  rebuildAssertionsClose,
  rebuildAssertionsStart,
);
if (rebuildAssertionsStart < 0 || rebuildAssertionsEnd < 0) {
  throw new Error('Could not parse the mapping-wave rebuild assertion block');
}
const rebuildAssertionsBlock = normalizedRehearsal.slice(
  rebuildAssertionsStart,
  rebuildAssertionsEnd + rebuildAssertionsClose.length,
);
if (md5(rebuildAssertionsBlock) !== 'd7d294bef6ba8a96a0e9c38b0fb39578') {
  throw new Error('Complete mapping-wave rebuild assertion block drifted');
}
if ((rehearsal.match(/^\\set ON_ERROR_STOP on\s*$/gm) ?? []).length !== 1) {
  throw new Error('Mapping-wave rehearsal must enable ON_ERROR_STOP exactly once');
}
forbid(
  rehearsal,
  /^\s*\\set\s+ON_ERROR_STOP\s+(?:off|false|0)\b/im,
  'mapping-wave rehearsal disables ON_ERROR_STOP',
);
forbid(
  rehearsal,
  /^\s*\\(?:if|elif|else|endif|quit|q)\b/im,
  'psql conditional or early-exit metacommand can bypass a fail-closed contract',
);
forbid(
  rebuildAssertionsBlock,
  /\bexception\s+when\b/i,
  'rebuild assertion exception handler can swallow a fail-closed contract',
);
forbid(
  rebuildAssertionsBlock,
  /\b(?:return|exit|continue)\b/i,
  'rebuild assertion block can bypass a fail-closed contract',
);
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

const refreshExpansionSnapshotRaise =
  'Issue #97 reviewed mapping-refresh expansion pre-build snapshot drifted';
const refreshExpansionSurvivalRaise =
  'Issue #97 reviewed exact mapping-refresh expansion changed during graph rebuilds';
if (offsetsOf(rehearsal, refreshExpansionSnapshotRaise).length !== 1
    || offsetsOf(rehearsal, refreshExpansionSurvivalRaise).length !== 1) {
  throw new Error('Reviewed mapping-refresh expansion assertions must each occur exactly once');
}
for (const token of [
  'create temporary table tmp_issue97_mapping_wave_refresh_expansion_before_build on commit drop as select expansion.*',
  "mapping.mapping_status in ('verified','candidate')",
  'snapshot.active_mapping_count<>0',
  'snapshot.observed_old_membership_occurrence_count<> snapshot.old_active_membership_occurrence_count',
  'snapshot.old_nonnull_road_id_count<>0',
  'select sum(observed_old_membership_occurrence_count) from tmp_issue97_mapping_wave_refresh_expansion_before_build )<>267',
]) {
  requireText(
    normalizedRehearsal,
    token,
    `reviewed mapping-refresh pre-build contract: ${token}`,
  );
}
const refreshExpansionSurvivalIndex = normalizedRehearsal.indexOf(
  `raise exception '${refreshExpansionSurvivalRaise}'`,
);
const refreshExpansionSurvivalStart = normalizedRehearsal.lastIndexOf(
  'if (',
  refreshExpansionSurvivalIndex,
);
const refreshExpansionSurvivalEnd = normalizedRehearsal.indexOf(
  'end if;',
  refreshExpansionSurvivalIndex,
);
if (refreshExpansionSurvivalIndex < 0
    || refreshExpansionSurvivalStart < 0
    || refreshExpansionSurvivalEnd < 0) {
  throw new Error('Could not parse reviewed mapping-refresh expansion survival assertion');
}
const refreshExpansionSurvivalBlock = normalizedRehearsal.slice(
  refreshExpansionSurvivalStart,
  refreshExpansionSurvivalEnd + 'end if;'.length,
);
for (const token of [
  '(select count(*) from tmp_issue97_frozen_mapping_refresh_expansion)<>7',
  "where mapping.mapping_status='verified')<>7",
  'left join public.brinesearch_road_identity_mappings mapping',
  'join tmp_issue97_mapping_wave_new_builds build',
  "mapping.mapping_status='verified'",
  'mapping.mapping_method is distinct from expansion.mapping_method',
  "mapping.evidence->>'source_identity_key' is distinct from expansion.source_identity_key",
  "mapping.evidence->>'route_class' is distinct from expansion.road_class",
  "mapping.evidence->>'route_token' is distinct from expansion.route_number",
  "mapping.evidence->>'designation_source' is distinct from expansion.designation_source",
  "mapping.evidence->>'refresh_scope' is distinct from expansion.refresh_scope",
  "(mapping.evidence->>'exact_candidate_count')::integer is distinct from expansion.exact_candidate_count",
  "(mapping.evidence->>'ambiguity_held')::boolean is distinct from expansion.ambiguity_flag",
  'occurrence.membership_count is distinct from expansion.old_active_membership_occurrence_count',
  'occurrence.exact_road_membership_count is distinct from expansion.old_active_membership_occurrence_count',
  "mapping.mapping_status in ('verified','candidate')",
  'mapping.road_id<>expansion.road_id',
]) {
  requireText(
    refreshExpansionSurvivalBlock,
    token,
    `reviewed mapping-refresh survival contract: ${token}`,
  );
}
if (offsetsOf(
  refreshExpansionSurvivalBlock,
  'join tmp_issue97_mapping_wave_new_builds build',
).length !== 1) {
  throw new Error('Reviewed expansion mappings must be global while candidate membership proof is pair-scoped');
}
forbid(
  refreshExpansionSurvivalBlock,
  /and not exists\(\s*select 1 from tmp_issue97_mapping_wave_new_builds build/i,
  'global reviewed expansion mapping rejected outside the currently built pair',
);

const reviewedRefreshExpansionPasses = ({
  transitionRows = 7,
  identities: expansionIdentityCount = 7,
  roads: expansionRoadCount = 6,
  membershipOccurrences = 267,
  mappingMethod = 'exact_route_designation',
  candidateCount = 1,
  ambiguity = false,
  scopeExact = true,
  evidenceExact = true,
  roadSetExact = true,
  roadOnlySemanticChange = true,
}) => transitionRows === 7
  && expansionIdentityCount === 7
  && expansionRoadCount === 6
  && membershipOccurrences === 267
  && mappingMethod === 'exact_route_designation'
  && candidateCount === 1
  && ambiguity === false
  && scopeExact
  && evidenceExact
  && roadSetExact
  && roadOnlySemanticChange;
assert.equal(reviewedRefreshExpansionPasses({}), true);
for (const mutation of [
  { transitionRows: 8 },
  { identities: 6 },
  { roads: 7 },
  { membershipOccurrences: 266 },
  { mappingMethod: 'exact_source_record_id' },
  { candidateCount: 2 },
  { ambiguity: true },
  { scopeExact: false },
  { evidenceExact: false },
  { roadSetExact: false },
  { roadOnlySemanticChange: false },
]) {
  assert.equal(reviewedRefreshExpansionPasses(mutation), false);
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

for (const token of [
  'v_junction_semantic_diff_count bigint := 0',
  'v_membership_semantic_diff_count bigint := 0',
  'v_anchor_semantic_diff_count bigint := 0',
  'v_non_target_membership_diff_count bigint := 0',
  "v_junction_semantic_diff_sample jsonb := '[]'::jsonb",
  "v_membership_semantic_diff_sample jsonb := '[]'::jsonb",
  "v_anchor_semantic_diff_sample jsonb := '[]'::jsonb",
  "v_non_target_membership_diff_sample jsonb := '[]'::jsonb",
]) {
  requireText(
    normalizedRehearsal,
    token,
    `semantic-topology diagnostic variable: ${token}`,
  );
}

const semanticTopologyMessages = {
  junction: 'Issue #97 rebuilt graph junction semantics changed',
  membership: 'Issue #97 rebuilt graph membership semantics changed beyond reviewed road IDs',
  anchor: 'Issue #97 rebuilt graph anchor semantics changed',
  nonTargetMembership: 'Issue #97 rebuilt graph non-target membership semantics changed',
};
for (const [name, message] of Object.entries(semanticTopologyMessages)) {
  if (offsetsOf(rehearsal, message).length !== 1) {
    throw new Error(`${name} semantic-topology RAISE must occur exactly once`);
  }
}
forbid(
  rehearsal,
  /Issue #97 rebuilt graph changed source topology beyond exact mapping road IDs/i,
  'combined semantic-topology assertion without predicate-specific diagnostics',
);

const semanticTopologyRaiseTokens = {
  junction: `message='${semanticTopologyMessages.junction}'`,
  membership: `message= '${semanticTopologyMessages.membership}'`,
  anchor: `message='${semanticTopologyMessages.anchor}'`,
  nonTargetMembership: `message= '${semanticTopologyMessages.nonTargetMembership}'`,
};
const semanticTopologyRaiseIndexes = Object.fromEntries(
  Object.entries(semanticTopologyRaiseTokens).map(([name, token]) => {
    const index = normalizedRehearsal.indexOf(token);
    if (index < 0) throw new Error(`Could not locate ${name} semantic-topology RAISE`);
    return [name, index];
  }),
);
const semanticTopologyBlockStarts = Object.fromEntries(
  Object.entries(semanticTopologyRaiseIndexes).map(([name, index]) => {
    const start = normalizedRehearsal.lastIndexOf('if exists(', index);
    if (start < 0) throw new Error(`Could not locate ${name} semantic-topology IF`);
    return [name, start];
  }),
);
const releaseCurrentnessAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rebuilt dark graph is not fully release-current'",
);
if (releaseCurrentnessAssertionIndex < 0) {
  throw new Error('Could not locate release-currentness assertion');
}
const releaseCurrentnessBlockStart = normalizedRehearsal.lastIndexOf(
  'if exists(',
  releaseCurrentnessAssertionIndex,
);
const semanticTopologyBlocks = {
  junction: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.junction,
    semanticTopologyBlockStarts.membership,
  ),
  membership: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.membership,
    semanticTopologyBlockStarts.anchor,
  ),
  anchor: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.anchor,
    semanticTopologyBlockStarts.nonTargetMembership,
  ),
  nonTargetMembership: normalizedRehearsal.slice(
    semanticTopologyBlockStarts.nonTargetMembership,
    releaseCurrentnessBlockStart,
  ),
};

const semanticDiagnosticContracts = {
  junction: {
    block: semanticTopologyBlocks.junction,
    countVariable: 'v_junction_semantic_diff_count',
    sampleVariable: 'v_junction_semantic_diff_sample',
    detailCount: "'junction_semantic_diff_count'",
    detailSample: "'junction_semantic_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, difference_kind, prior_semantic, new_semantic from differences order by county_code,stable_junction_key limit 50',
    semanticRow: "pg_catalog.to_jsonb(junction) -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at' as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||(pg_catalog.to_jsonb(junction) -'id'-'build_id'-'graph_digest'-'created_at'-'updated_at')::text, '|' order by junction.stable_junction_key",
    fullJoinKey: 'full join new_rows using(county_code,stable_junction_key)',
    hashSource: 'from public.brinesearch_road_junctions junction',
    priorHashFilter: 'where junction.build_id=prior.id',
    newHashFilter: 'where junction.build_id=build.id',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code,sample.stable_junction_key )',
    blockMd5: 'd811f2d958525db8e5d686440e196146',
  },
  membership: {
    block: semanticTopologyBlocks.membership,
    countVariable: 'v_membership_semantic_diff_count',
    sampleVariable: 'v_membership_semantic_diff_sample',
    detailCount: "'membership_semantic_diff_count'",
    detailSample: "'membership_semantic_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, identity_id, membership_role, is_frozen_target, difference_kind, prior_semantic, new_semantic from differences order by county_code, stable_junction_key, identity_id, membership_role limit 50',
    semanticRow: "pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'road_id'-'created_at'-'updated_at' as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||(pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text, '|' order by junction.stable_junction_key, (pg_catalog.to_jsonb(membership)-'id'-'junction_id'-'road_id'-'created_at'-'updated_at')::text",
    fullJoinKey: 'full join new_rows using( county_code, stable_junction_key, identity_id, membership_role )',
    hashSource: 'from public.brinesearch_road_junction_memberships membership join public.brinesearch_road_junctions junction on junction.id=membership.junction_id',
    priorHashFilter: 'where junction.build_id=prior.id',
    newHashFilter: 'where junction.build_id=build.id',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code, sample.stable_junction_key, sample.identity_id, sample.membership_role )',
    blockMd5: 'f925905b791400576f593f953c584fd2',
  },
  anchor: {
    block: semanticTopologyBlocks.anchor,
    countVariable: 'v_anchor_semantic_diff_count',
    sampleVariable: 'v_anchor_semantic_diff_sample',
    detailCount: "'anchor_semantic_diff_count'",
    detailSample: "'anchor_semantic_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, anchor_key, difference_kind, prior_semantic, new_semantic from differences order by county_code,stable_junction_key,anchor_key limit 50',
    semanticRow: "pg_catalog.to_jsonb(anchor) -'id'-'junction_id'-'created_at'-'updated_at' as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||(pg_catalog.to_jsonb(anchor) -'id'-'junction_id'-'created_at'-'updated_at')::text, '|' order by junction.stable_junction_key,anchor.anchor_key",
    fullJoinKey: 'full join new_rows using(county_code,stable_junction_key,anchor_key)',
    hashSource: 'from public.brinesearch_road_junction_anchors anchor join public.brinesearch_road_junctions junction on junction.id=anchor.junction_id',
    priorHashFilter: 'where junction.build_id=prior.id',
    newHashFilter: 'where junction.build_id=build.id',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code, sample.stable_junction_key, sample.anchor_key )',
    blockMd5: '21da1c402a1b98a1570f78c862e09f99',
  },
  nonTargetMembership: {
    block: semanticTopologyBlocks.nonTargetMembership,
    countVariable: 'v_non_target_membership_diff_count',
    sampleVariable: 'v_non_target_membership_diff_sample',
    detailCount: "'non_target_membership_diff_count'",
    detailSample: "'non_target_membership_diff_sample'",
    sampleProjection: 'select county_code, stable_junction_key, identity_id, membership_role, difference_kind, prior_road_id, new_road_id, prior_semantic, new_semantic from differences order by county_code, stable_junction_key, identity_id, membership_role limit 50',
    semanticRow: "( pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'created_at'-'updated_at' )||pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_expansion expansion where expansion.identity_id=membership.identity_id and expansion.road_id=membership.road_id ) then null else membership.road_id end ) as semantic_row",
    semanticHash: "junction.stable_junction_key||':'||( (pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'created_at'-'updated_at') ||pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_expansion expansion where expansion.identity_id=membership.identity_id and expansion.road_id=membership.road_id ) then null else membership.road_id end ) )::text, '|' order by junction.stable_junction_key, ( (pg_catalog.to_jsonb(membership) -'id'-'junction_id'-'created_at'-'updated_at') ||pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_expansion expansion where expansion.identity_id=membership.identity_id and expansion.road_id=membership.road_id ) then null else membership.road_id end ) )::text",
    fullJoinKey: 'full join new_rows using( county_code, stable_junction_key, identity_id, membership_role )',
    hashSource: 'from public.brinesearch_road_junction_memberships membership join public.brinesearch_road_junctions junction on junction.id=membership.junction_id',
    priorHashFilter: 'where junction.build_id=prior.id and not exists(select 1 from tmp_issue97_frozen_mapping_targets target where target.identity_id=membership.identity_id)',
    newHashFilter: 'where junction.build_id=build.id and not exists(select 1 from tmp_issue97_frozen_mapping_targets target where target.identity_id=membership.identity_id)',
    aggregateOrder: 'pg_catalog.jsonb_agg( pg_catalog.to_jsonb(sample) order by sample.county_code, sample.stable_junction_key, sample.identity_id, sample.membership_role )',
    blockMd5: 'd501b032a6848eef59b1d2456f1e5959',
  },
};

for (const [name, contract] of Object.entries(semanticDiagnosticContracts)) {
  if (md5(contract.block) !== contract.blockMd5) {
    throw new Error(`${name} complete semantic assertion block drifted`);
  }
  for (const token of [
    'difference_kind',
    'prior_semantic',
    'new_semantic',
    'stable_junction_key',
    contract.countVariable,
    contract.sampleVariable,
    contract.detailCount,
    contract.detailSample,
    contract.sampleProjection,
    contract.aggregateOrder,
  ]) {
    requireText(contract.block, token, `${name} semantic diagnostic: ${token}`);
  }
  if ((contract.block.match(/limit 50/g) ?? []).length !== 1) {
    throw new Error(`${name} semantic diagnostic must have exactly one 50-row sample limit`);
  }
  if (offsetsOf(contract.block, contract.semanticRow).length !== 2) {
    throw new Error(`${name} diagnostic semantic-row normalization drifted`);
  }
  if (offsetsOf(contract.block, contract.semanticHash).length !== 2) {
    throw new Error(`${name} original semantic hash comparison drifted`);
  }
  const expectedHashGuard = [
    'if exists( select 1 from tmp_issue97_mapping_wave_active_before prior',
    'join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code)',
    `where (select pg_catalog.md5(coalesce(pg_catalog.string_agg( ${contract.semanticHash}),''))`,
    `${contract.hashSource} ${contract.priorHashFilter})`,
    `<>(select pg_catalog.md5(coalesce(pg_catalog.string_agg( ${contract.semanticHash}),''))`,
    `${contract.hashSource} ${contract.newHashFilter}) )`,
  ].join(' ');
  const actualHashGuard = contract.block.slice(
    0,
    contract.block.indexOf(' then with pairs as ('),
  );
  if (actualHashGuard !== expectedHashGuard) {
    throw new Error(`${name} complete old-versus-candidate hash predicate drifted`);
  }
  if (offsetsOf(
    contract.block,
    'select 1 from tmp_issue97_mapping_wave_active_before prior join tmp_issue97_mapping_wave_new_builds build using(state_code,county_code) where (',
  ).length !== 1) {
    throw new Error(`${name} original active-to-candidate build pairing drifted`);
  }
  if ((contract.block.match(
    /\(select pg_catalog\.md5\(coalesce\(pg_catalog\.string_agg\(/g,
  ) ?? []).length !== 2) {
    throw new Error(`${name} original semantic hash wrappers drifted`);
  }
  const priorBuildSelectorIndex = contract.block.indexOf(
    'where junction.build_id=prior.id',
  );
  const hashComparatorIndex = contract.block.indexOf(
    ') <>(select pg_catalog.md5(',
  );
  const newBuildSelectorIndex = contract.block.indexOf(
    'where junction.build_id=build.id',
  );
  if (priorBuildSelectorIndex < 0 || hashComparatorIndex < 0
      || newBuildSelectorIndex < 0
      || !(priorBuildSelectorIndex < hashComparatorIndex
        && hashComparatorIndex < newBuildSelectorIndex)
      || offsetsOf(contract.block, ') <>(select pg_catalog.md5(').length !== 1) {
    throw new Error(`${name} original old-versus-candidate hash comparator drifted`);
  }
  if (offsetsOf(
    contract.block,
    'where prior_rows.semantic_row is distinct from new_rows.semantic_row',
  ).length !== 1) {
    throw new Error(`${name} row-difference predicate drifted`);
  }
  if (contract.fullJoinKey
      && offsetsOf(contract.block, contract.fullJoinKey).length !== 1) {
    throw new Error(`${name} row-difference full-join key drifted`);
  }
  if (offsetsOf(
    contract.block,
    "case when prior_rows.row_present is null then 'added' when new_rows.row_present is null then 'missing' else 'changed' end as difference_kind",
  ).length !== 1) {
    throw new Error(`${name} row-difference classification drifted`);
  }
}

for (const block of [
  semanticTopologyBlocks.membership,
  semanticTopologyBlocks.nonTargetMembership,
]) {
  if (offsetsOf(
    block,
    'coalesce(prior_rows.membership_role,new_rows.membership_role) as membership_role',
  ).length !== 1) {
    throw new Error('Membership diagnostic stable-role projection drifted');
  }
}

for (const token of [
  'identity_id',
  'membership_role',
  'is_frozen_target',
]) {
  requireText(semanticTopologyBlocks.membership, token, `membership sample field: ${token}`);
}
requireText(
  semanticTopologyBlocks.anchor,
  'anchor_key',
  'anchor semantic diagnostic key',
);
for (const token of [
  'identity_id',
  'membership_role',
  'prior_road_id',
  'new_road_id',
]) {
  requireText(
    semanticTopologyBlocks.nonTargetMembership,
    token,
    `non-target membership sample field: ${token}`,
  );
}
if ((semanticTopologyBlocks.nonTargetMembership.match(
  /not exists\(select 1 from tmp_issue97_frozen_mapping_targets target/g,
) ?? []).length !== 2
    || (semanticTopologyBlocks.nonTargetMembership.match(
      /from tmp_issue97_frozen_mapping_targets target where target\.identity_id=membership\.identity_id/g,
    ) ?? []).length !== 4) {
  throw new Error('Non-target membership hashes and diagnostics must exclude every frozen target identity');
}
forbid(
  semanticTopologyBlocks.nonTargetMembership,
  /to_jsonb\(membership\)\s*-'id'-'junction_id'-'road_id'/i,
  'non-target membership semantic row excludes road_id',
);
const exactRefreshExpansionRoadNormalization =
  "pg_catalog.jsonb_build_object( 'road_id', case when exists( select 1 from tmp_issue97_frozen_mapping_refresh_expansion expansion where expansion.identity_id=membership.identity_id and expansion.road_id=membership.road_id ) then null else membership.road_id end )";
if (offsetsOf(
  semanticTopologyBlocks.nonTargetMembership,
  exactRefreshExpansionRoadNormalization,
).length !== 6) {
  throw new Error('Non-target membership must normalize only the seven exact expansion identity/road pairs');
}
forbid(
  semanticTopologyBlocks.nonTargetMembership,
  /then null else null end/i,
  'non-target membership road normalization widened to every identity',
);

const candidateDigestContractIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 exact eight-county dark rebuild contract failed'",
);
const migrationApplicationIndex = normalizedRehearsal.indexOf(
  '\\ir ../migrations/20260817193212_issue97_frozen_exact_mapping_wave.sql',
);
const reviewedSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_reviewed_mappings_before_build',
);
const refreshExpansionSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_refresh_expansion_before_build',
);
const refreshExpansionGoogleSnapshotIndex = normalizedRehearsal.indexOf(
  'create temporary table tmp_issue97_mapping_wave_refresh_expansion_google_before_build',
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
const refreshExpansionGoogleQueueAssertionIndex = normalizedRehearsal.indexOf(
  "message= 'Issue #97 reviewed mapping-refresh Google queue contract drifted'",
);
const refreshExpansionGoogleProcessorIndex = normalizedRehearsal.indexOf(
  'set constraints private_verification.brinesearch_issue97_google_route_refresh_deferred immediate;',
  refreshExpansionGoogleQueueAssertionIndex,
);
const refreshExpansionGooglePostprocessIndex = normalizedRehearsal.indexOf(
  'ISSUE97_REVIEWED_REFRESH_GOOGLE_POSTPROCESS|',
);
const reviewedMappingSurvivalAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 reviewed frozen mappings changed during graph rebuilds'",
);
const refreshExpansionSurvivalAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 reviewed exact mapping-refresh expansion changed during graph rebuilds'",
);
const countDriftAssertionIndex = normalizedRehearsal.indexOf(countDriftRaise);
const roadIdMismatchAssertionIndex = normalizedRehearsal.indexOf(roadIdMismatchRaise);
const activationProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 candidate build lane activated or replaced a graph'",
);
const routeProtectionAssertionIndex = normalizedRehearsal.indexOf(
  "raise exception 'Issue #97 rollback rehearsal changed route/public/cutover/WV/PA state'",
);
const googleProtectionRaises = [
  'Issue #97 rollback rehearsal Google target snapshot cardinality changed',
  'Issue #97 rollback rehearsal Google refresh queue is not empty after dark builds',
  'Issue #97 rollback rehearsal public Google or cutover state changed',
  'Issue #97 rollback rehearsal target Google receipts changed during dark builds',
  'Issue #97 rollback rehearsal target Google pad state changed during dark builds',
  'Issue #97 rollback rehearsal target Google stale-state contract changed',
  'Issue #97 rollback rehearsal non-target Google receipts changed',
  'Issue #97 rollback rehearsal non-target Google pad state changed',
  'Issue #97 rollback rehearsal deferred Google trigger contract changed',
];
const googleProtectionRaiseIndexes = googleProtectionRaises.map((message) => {
  const indexes = offsetsOf(rehearsal, message);
  if (indexes.length !== 1) {
    throw new Error(`Google dark-build diagnostic must occur exactly once: ${message}`);
  }
  return normalizedRehearsal.indexOf(message);
});
const googleProtectionAssertionIndex = googleProtectionRaiseIndexes[0];
if (!googleProtectionRaiseIndexes.every((index, position) => (
  position === 0 || googleProtectionRaiseIndexes[position - 1] < index
))) {
  throw new Error('Google dark-build diagnostics are not in fail-closed contract order');
}
const googleProtectionBlock = normalizedRehearsal.slice(
  googleProtectionRaiseIndexes[0],
  rebuildAssertionsEnd,
);
if ((googleProtectionBlock.match(/limit 50/g) ?? []).length !== 3) {
  throw new Error('Google dark-build diagnostic samples must retain three 50-row bounds');
}
if (migrationApplicationIndex < 0 || reviewedSnapshotIndex < 0
    || refreshExpansionSnapshotIndex < 0
    || refreshExpansionGoogleSnapshotIndex < 0
    || buildResultsCreationIndex < 0
    || firstGraphBuildIndex < 0 || lastGraphBuildIndex < 0
    || newBuildMaterializationIndex < 0
    || refreshExpansionGoogleQueueAssertionIndex < 0
    || refreshExpansionGoogleProcessorIndex < 0
    || refreshExpansionGooglePostprocessIndex < 0
    || reviewedMappingSurvivalAssertionIndex < 0
    || refreshExpansionSurvivalAssertionIndex < 0
    || candidateDigestContractIndex < 0 || countDriftAssertionIndex < 0
    || roadIdMismatchAssertionIndex < 0
    || semanticTopologyRaiseIndexes.junction < 0
    || semanticTopologyRaiseIndexes.membership < 0
    || semanticTopologyRaiseIndexes.anchor < 0
    || semanticTopologyRaiseIndexes.nonTargetMembership < 0
    || releaseCurrentnessAssertionIndex < 0 || activationProtectionAssertionIndex < 0
    || routeProtectionAssertionIndex < 0 || googleProtectionAssertionIndex < 0
    || !(migrationApplicationIndex < reviewedSnapshotIndex
      && reviewedSnapshotIndex < refreshExpansionSnapshotIndex
      && refreshExpansionSnapshotIndex < refreshExpansionGoogleSnapshotIndex
      && refreshExpansionGoogleSnapshotIndex < buildResultsCreationIndex
      && buildResultsCreationIndex < firstGraphBuildIndex
      && firstGraphBuildIndex < lastGraphBuildIndex
      && lastGraphBuildIndex < newBuildMaterializationIndex
      && newBuildMaterializationIndex < refreshExpansionGoogleQueueAssertionIndex
      && refreshExpansionGoogleQueueAssertionIndex < refreshExpansionGoogleProcessorIndex
      && refreshExpansionGoogleProcessorIndex < refreshExpansionGooglePostprocessIndex
      && refreshExpansionGooglePostprocessIndex < reviewedMappingSurvivalAssertionIndex
      && reviewedMappingSurvivalAssertionIndex < refreshExpansionSurvivalAssertionIndex
      && refreshExpansionSurvivalAssertionIndex < candidateDigestContractIndex
      && candidateDigestContractIndex < countDriftAssertionIndex
      && countDriftAssertionIndex < roadIdMismatchAssertionIndex
      && roadIdMismatchAssertionIndex < semanticTopologyRaiseIndexes.junction
      && semanticTopologyRaiseIndexes.junction < semanticTopologyRaiseIndexes.membership
      && semanticTopologyRaiseIndexes.membership < semanticTopologyRaiseIndexes.anchor
      && semanticTopologyRaiseIndexes.anchor < semanticTopologyRaiseIndexes.nonTargetMembership
      && semanticTopologyRaiseIndexes.nonTargetMembership < releaseCurrentnessAssertionIndex
      && releaseCurrentnessAssertionIndex < activationProtectionAssertionIndex
      && activationProtectionAssertionIndex < routeProtectionAssertionIndex
      && routeProtectionAssertionIndex < googleProtectionAssertionIndex)) {
  throw new Error('Reviewed-mapping survival and later rehearsal safety ordering drifted');
}

const targetMembershipDiagnosticBlock = normalizedRehearsal.slice(
  candidateDigestContractIndex,
  semanticTopologyBlockStarts.junction,
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
