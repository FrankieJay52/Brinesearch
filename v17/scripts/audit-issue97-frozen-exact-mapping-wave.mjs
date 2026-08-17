import fs from 'node:fs';
import crypto from 'node:crypto';

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
]) requireText(migration, token);

forbid(migration, /brinesearch_oh_county_code\s*\(/i, 'stale Ohio county helper');
forbid(migration, /update\s+public\.brinesearch_road_graph_builds\b/i, 'mapping receipt restamp');
forbid(migration, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route refresh, reconciliation, or graph activation');
forbid(migration, /(?:name_only|fuzzy_name|nearest_road)\s*['"]?\s*[:,=]\s*(?:true|1)/i,
  'guess resolution evidence');

const manifestPrefix = routeManifest.split(
  'create temporary table tmp_issue97_frozen_mapping_derived_routes',
)[0];
const routeIds = [...manifestPrefix.matchAll(/\('([0-9a-f-]{36})'\)[,;]/g)].map((match) => match[1]);
if (routeIds.length !== 379 || new Set(routeIds).size !== 379
    || md5([...routeIds].sort().join('|')) !== '836c1f57210e4d18c0f60d4c1ea77d7d') {
  throw new Error(`Frozen route manifest drifted: ${routeIds.length}`);
}
for (const token of [
  '<>379', "<>'836c1f57210e4d18c0f60d4c1ea77d7d'", "route.route_group='primary')<>320",
  "route.route_group='alternate')<>59", 'except select route_prep_id',
]) requireText(routeManifest, token);
forbid(routeManifest, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route manifest execution');

const builds = [...rehearsal.matchAll(
  /public\.brinesearch_issue97_rebuild_county_graph\('OH','([A-Z]{3})'\)/g,
)].map((match) => match[1]);
if (builds.join(',') !== 'BEL,CAR,COL,GUE,HAS,JEF,MOE,NOB') {
  throw new Error(`Exact serial rebuild plan drifted: ${builds.join(',')}`);
}
for (const token of [
  "set local statement_timeout='90min'", "set local lock_timeout='2min'",
  "'06705f5b35a6d37151bb2c0dc5ade9bd'",
  "where version='20260817193212'", "build.status<>'validated'",
  "build.activated_at is not null", "build.graph_digest=prior.graph_digest",
  "mapping_snapshot_digest'=prior.details->>'mapping_snapshot_digest'",
  "where target.identity_id=membership.identity_id",
  'rebuilt graph changed source topology beyond exact mapping road IDs',
  'brinesearch_issue97_graph_build_release_current(build.id)',
]) requireText(rehearsal, token);
if ((rehearsal.match(/^begin;/gmi) ?? []).length !== 1
    || (rehearsal.match(/^rollback;/gmi) ?? []).length !== 1
    || /^commit;/mi.test(rehearsal)) {
  throw new Error('Rollback rehearsal must have one BEGIN, one ROLLBACK, and zero COMMIT');
}
forbid(rehearsal, /brinesearch_issue97_(?:refresh|reconcile|activate)[a-z0-9_]*\s*\(/i,
  'route refresh, reconciliation, or activation in rehearsal');

console.log('Issue #97 frozen exact mapping-wave audit passed.');
console.log(`  frozen identities/roads: ${identities.length}/${roads.length}`);
console.log(`  evidence split: 28 designation / 18 base-NLF street-core`);
console.log(`  graph rebuild footprint: ${builds.join(',')}`);
console.log(`  exact future route closure: ${routeIds.length} (${md5([...routeIds].sort().join('|'))})`);
