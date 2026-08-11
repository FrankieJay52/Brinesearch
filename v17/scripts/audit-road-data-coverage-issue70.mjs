import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const root = path.resolve(v17Root, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260811034500_issue70_all_operator_oh_exact_road_coverage.sql');
const [migration, pkgText, issue69Runtime] = await Promise.all([
  fs.readFile(migrationPath, 'utf8'),
  fs.readFile(path.join(root, 'package.json'), 'utf8'),
  fs.readFile(path.join(v17Root, 'src/parts/21m-road-manager-runtime-hardening-issue69.js'), 'utf8')
]);
const pkg = JSON.parse(pkgText);
const lower = migration.toLowerCase();

for (const token of [
  'private_verification.brinesearch_oh_road_matches_issue70',
  'brinesearch_refresh_oh_road_matches_issue70',
  'brinesearch_load_oh_road_geometry_issue70',
  'brinesearch_apply_oh_road_matches_issue70',
  'brinesearch_oh_road_coverage_issue70',
  'force row level security',
  "set search_path=''",
  'public.is_brinesearch_owner',
  "upper(coalesce(p.state,'')) in ('oh','ohio')",
  "s.step_kind in ('local_road','county_road','township_road')",
  'street_match_key=b.step_key',
  'c.route_type=b.route_type_hint',
  'c.route_number_normalized=b.route_number_hint',
  'conflicting_exact_odot_matches',
  'multiple_exact_odot_matches',
  'rejected_generic_exact_name',
  'rejected_suffix_mismatch',
  "'fuzzy_matching',false",
  "'local_road_guessing',false",
  "match_status='unique_exact'",
  "geometry_status='complete'",
  'multiple_existing_road_manager_records_for_exact_identity',
  'ohio department of transportation',
  'road inventory',
  'objectids',
  'returngeometry',
  'owner_map_tap_v17328',
  "match_method='official_odot_issue70_unique_exact'",
  "match_confidence=1.0",
  "geometry_status='ready'",
  'road_manager_recalculate_route_readiness',
  'pg_catalog.strpos',
  'where r.source_record_id=v_identity'
]) assert.ok(lower.includes(token.toLowerCase()), `#70 migration missing ${token}`);

for (const forbidden of ['pg_catalog.position(', 'min(r.id)', 'similarity(', 'word_similarity(', 'levenshtein(', 'soundex(']) {
  assert.ok(!lower.includes(forbidden), `#70 migration contains forbidden/unsafe source: ${forbidden}`);
}

for (const functionName of [
  'brinesearch_refresh_oh_road_matches_issue70()',
  'brinesearch_load_oh_road_geometry_issue70(integer)',
  'brinesearch_apply_oh_road_matches_issue70()',
  'brinesearch_oh_road_coverage_issue70()'
]) {
  assert.ok(lower.includes(`revoke all on function public.${functionName} from public,anon;`), `#70 ${functionName} must revoke public/anon execute`);
  assert.ok(lower.includes(`grant execute on function public.${functionName} to authenticated;`), `#70 ${functionName} must expose only authenticated RPC access`);
}
assert.ok(lower.includes('revoke all on private_verification.brinesearch_oh_road_matches_issue70 from public,anon,authenticated;'));
assert.ok(lower.includes('grant select,insert,update,delete on private_verification.brinesearch_oh_road_matches_issue70 to service_role;'));

const refreshStart = lower.indexOf('create or replace function public.brinesearch_refresh_oh_road_matches_issue70');
const loaderStart = lower.indexOf('create or replace function public.brinesearch_load_oh_road_geometry_issue70');
const applyStart = lower.indexOf('create or replace function public.brinesearch_apply_oh_road_matches_issue70');
const coverageStart = lower.indexOf('create or replace function public.brinesearch_oh_road_coverage_issue70');
assert.ok(refreshStart >= 0 && loaderStart > refreshStart && applyStart > loaderStart && coverageStart > applyStart, '#70 function order is invalid');
const refresh = lower.slice(refreshStart, loaderStart);
const loader = lower.slice(loaderStart, applyStart);
const apply = lower.slice(applyStart, coverageStart);
assert.ok(refresh.includes('c.county_code=b.county_code'), '#70 exact matching must remain county-scoped');
assert.ok(refresh.includes("then 'ambiguous'"), '#70 ambiguity must fail closed');
assert.ok(refresh.includes("then 'conflict'"), '#70 conflicting exact identities must fail closed');
assert.ok(loader.includes('tims.dot.state.oh.us/ags/rest/services/roadway_information/road_inventory/featureserver/0/query'));
assert.ok(loader.includes("m.match_status='unique_exact'"));
for (const forbidden of ['openstreetmap.org', 'overpass', 'nominatim']) assert.ok(!loader.includes(forbidden), `#70 official geometry loader must not use ${forbidden}`);
assert.ok(apply.includes("where match_status='unique_exact'"));
assert.ok(apply.includes("and geometry_status='complete'"));
assert.ok(apply.includes("r.source_agency='openstreetmap' and r.source_method='owner_map_tap_v17328'"));
assert.ok(apply.includes("set match_status='held',geometry_status='held'"));

for (const token of ['routeIssue69ValidateStructuredPayload','is not exact geometry version 1','Exact route load failed closed','geometry unresolved:','routeIssue69PublishStructuredHardened']) {
  assert.ok(issue69Runtime.includes(token), `#70 baseline lost #69 fail-closed runtime token ${token}`);
}
assert.equal(pkg.scripts?.['verify:road-data-coverage'], 'node v17/scripts/audit-road-data-coverage-issue70.mjs');
assert.ok(pkg.scripts?.build?.includes('verify:road-data-coverage'));

console.log(JSON.stringify({issue:70,scope:'all-operator Ohio exact Road Manager identity + official centerline coverage',autoApply:'unique county-scoped ODOT identity only',ambiguity:'held; never guessed',geometry:'official ODOT object IDs only',routePublication:'none; #69 remains canonical/fail-closed',migration:'single independently executable reviewed file'}, null, 2));
console.log('GitHub #70 road-data coverage audit passed.');
