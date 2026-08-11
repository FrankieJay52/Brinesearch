import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const v17Root = path.resolve(scriptDir, '..');
const root = path.resolve(v17Root, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260811042124_issue70_all_operator_oh_exact_road_coverage.sql');
const contextPath = path.join(root, 'supabase/migrations/20260811044841_issue70_oh_ambiguous_context_resolution.sql');
const neighborInvariantPath = path.join(root, 'supabase/migrations/20260811044903_issue70_context_neighbor_evidence_invariant.sql');
const [migration, contextMigration, neighborInvariantMigration, pkgText, issue69Runtime] = await Promise.all([
  fs.readFile(migrationPath, 'utf8'),
  fs.readFile(contextPath, 'utf8'),
  fs.readFile(neighborInvariantPath, 'utf8'),
  fs.readFile(path.join(root, 'package.json'), 'utf8'),
  fs.readFile(path.join(v17Root, 'src/parts/21m-road-manager-runtime-hardening-issue69.js'), 'utf8')
]);
const pkg = JSON.parse(pkgText);
const lower = migration.toLowerCase();
const context = contextMigration.toLowerCase();
const neighborInvariant = neighborInvariantMigration.toLowerCase();

for (const token of [
  'private_verification.brinesearch_oh_road_matches_issue70','brinesearch_refresh_oh_road_matches_issue70',
  'brinesearch_load_oh_road_geometry_issue70','brinesearch_apply_oh_road_matches_issue70','brinesearch_oh_road_coverage_issue70',
  'force row level security',"set search_path=''",'public.is_brinesearch_owner',"upper(coalesce(p.state,'')) in ('oh','ohio')",
  "s.step_kind in ('local_road','county_road','township_road')",'street_match_key=b.step_key','c.route_type=b.route_type_hint',
  'c.route_number_normalized=b.route_number_hint','conflicting_exact_odot_matches','multiple_exact_odot_matches',
  'rejected_generic_exact_name','rejected_suffix_mismatch',"'fuzzy_matching',false","'local_road_guessing',false",
  "match_status='unique_exact'","geometry_status='complete'",'multiple_existing_road_manager_records_for_exact_identity',
  'ohio department of transportation','road inventory','objectids','returngeometry','owner_map_tap_v17328',
  "match_method='official_odot_issue70_unique_exact'","match_confidence=1.0","geometry_status='ready'",
  'road_manager_recalculate_route_readiness','pg_catalog.strpos','where r.source_record_id=v_identity'
]) assert.ok(lower.includes(token.toLowerCase()), `#70 base migration missing ${token}`);

for (const forbidden of ['pg_catalog.position(', 'min(r.id)', 'similarity(', 'word_similarity(', 'levenshtein(', 'soundex(']) {
  assert.ok(!lower.includes(forbidden), `#70 base migration contains forbidden/unsafe source: ${forbidden}`);
}
for (const functionName of ['brinesearch_refresh_oh_road_matches_issue70()','brinesearch_load_oh_road_geometry_issue70(integer)','brinesearch_apply_oh_road_matches_issue70()','brinesearch_oh_road_coverage_issue70()']) {
  assert.ok(lower.includes(`revoke all on function public.${functionName} from public,anon;`));
  assert.ok(lower.includes(`grant execute on function public.${functionName} to authenticated;`));
}
assert.ok(lower.includes('revoke all on private_verification.brinesearch_oh_road_matches_issue70 from public,anon,authenticated;'));

const refreshStart = lower.indexOf('create or replace function public.brinesearch_refresh_oh_road_matches_issue70');
const loaderStart = lower.indexOf('create or replace function public.brinesearch_load_oh_road_geometry_issue70');
const applyStart = lower.indexOf('create or replace function public.brinesearch_apply_oh_road_matches_issue70');
const coverageStart = lower.indexOf('create or replace function public.brinesearch_oh_road_coverage_issue70');
assert.ok(refreshStart >= 0 && loaderStart > refreshStart && applyStart > loaderStart && coverageStart > applyStart);
const refresh = lower.slice(refreshStart, loaderStart);
const loader = lower.slice(loaderStart, applyStart);
const apply = lower.slice(applyStart, coverageStart);
assert.ok(refresh.includes('c.county_code=b.county_code'));
assert.ok(refresh.includes("then 'ambiguous'"));
assert.ok(loader.includes('tims.dot.state.oh.us/ags/rest/services/roadway_information/road_inventory/featureserver/0/query'));
for (const forbidden of ['openstreetmap.org', 'overpass', 'nominatim']) assert.ok(!loader.includes(forbidden));
assert.ok(apply.includes("where match_status='unique_exact'"));

for (const token of [
  'private_verification.brinesearch_oh_context_resolutions_issue70',
  'brinesearch_load_oh_ambiguous_geometry_issue70',
  'brinesearch_stage_oh_ambiguous_context_issue70',
  'brinesearch_apply_oh_ambiguous_context_issue70',
  "resolution_basis in ('both_verified_neighbors','pad_and_verified_neighbor','pad_endpoint')",
  "m.match_status='ambiguous'",
  'candidate_geometry_count=r.candidate_count',
  'neighbor_count=2 and r.neighbor_hits=2',
  'r.second_neighbor_m>=200',
  'r.pad_m<=100',
  'r.second_pad_m>=greatest(500,r.pad_m*5)',
  "'fuzzy_matching',false",
  "'name_similarity_decision',false",
  "'closest_pad_only',false",
  'candidate_geometry_digest',
  'prev_geometry_digest',
  'next_geometry_digest',
  "match_method='official_odot_issue70_strict_context'",
  'fresh strict spatial/topology resolutions'
]) assert.ok(context.includes(token.toLowerCase()), `#70 context migration missing ${token}`);
for (const forbidden of ['similarity(', 'word_similarity(', 'levenshtein(', 'soundex(', 'nearest road', 'closest road']) {
  assert.ok(!context.includes(forbidden), `#70 strict context resolver contains forbidden decision logic: ${forbidden}`);
}
for (const functionName of ['brinesearch_load_oh_ambiguous_geometry_issue70(integer)','brinesearch_stage_oh_ambiguous_context_issue70()','brinesearch_apply_oh_ambiguous_context_issue70()']) {
  assert.ok(context.includes(`revoke all on function public.${functionName} from public,anon;`));
  assert.ok(context.includes(`grant execute on function public.${functionName} to authenticated;`));
}
assert.ok(context.includes('force row level security'));
assert.ok(context.includes('revoke all on private_verification.brinesearch_oh_context_resolutions_issue70 from public,anon,authenticated;'));
assert.ok(context.includes('tims.dot.state.oh.us/ags/rest/services/roadway_information/road_inventory/featureserver/0/query'));
assert.ok(context.includes('extensions.st_collect(c.geom order by c.objectid)'), '#70 candidate geometry/digest aggregation must be deterministic.');

// A neighbor Road Manager ID is evidence only when an exact geometry digest was
// present. Pad-endpoint cases may have an adjacent step ID with no centerline;
// that metadata must be normalized away rather than turning into a false stale
// evidence dependency at apply time.
for (const token of [
  'brinesearch_normalize_context_neighbor_evidence_issue70',
  'if new.prev_geometry_digest is null then',
  'new.prev_road_id:=null',
  'if new.next_geometry_digest is null then',
  'new.next_road_id:=null',
  'brinesearch_oh_context_issue70_prev_evidence_pair',
  'brinesearch_oh_context_issue70_next_evidence_pair',
  'before insert or update of prev_road_id,next_road_id,prev_geometry_digest,next_geometry_digest'
]) assert.ok(neighborInvariant.includes(token.toLowerCase()), `#70 neighbor-evidence invariant missing ${token}`);
assert.ok(neighborInvariant.includes('revoke all on function private_verification.brinesearch_normalize_context_neighbor_evidence_issue70()'));

for (const token of ['routeIssue69ValidateStructuredPayload','is not exact geometry version 1','Exact route load failed closed','geometry unresolved:','routeIssue69PublishStructuredHardened']) {
  assert.ok(issue69Runtime.includes(token), `#70 baseline lost #69 fail-closed runtime token ${token}`);
}
assert.equal(pkg.scripts?.['verify:road-data-coverage'], 'node v17/scripts/audit-road-data-coverage-issue70.mjs');
assert.ok(pkg.scripts?.build?.includes('verify:road-data-coverage'));

console.log(JSON.stringify({issue:70,scope:'all-operator Ohio exact + strict ambiguity context Road Manager coverage',autoApply:'unique exact or strict complete-candidate topology/pad separation only',ambiguity:'all unqualified rows stay held',geometry:'official ODOT object IDs only',neighborEvidence:'Road Manager ID retained only when paired with geometry digest',routePublication:'none; #69 remains canonical/fail-closed'}, null, 2));
console.log('GitHub #70 road-data coverage audit passed.');
