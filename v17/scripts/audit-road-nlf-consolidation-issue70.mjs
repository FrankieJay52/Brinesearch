import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260811104449_issue70_nlf_road_manager_consolidation.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`Issue #70 NLF consolidation audit failed: ${message}`);
}

assert(migration.includes('private_verification.brinesearch_nlf_consolidation_issue70'), 'durable consolidation evidence must exist');
assert(migration.includes('force row level security'), 'private consolidation evidence must FORCE RLS');
assert(migration.includes('revoke all on private_verification.brinesearch_nlf_consolidation_issue70 from public,anon,authenticated'), 'browser roles must not read consolidation evidence');
assert(migration.includes('all_dup_groups<>24') && migration.includes('excess_rows<>29'), 'reviewed duplicate NLF set must fail closed on drift');
assert(migration.includes("catalog_segments=loaded_segments") && migration.includes('route_types=1') && migration.includes('route_numbers=1'), 'consolidation must require complete one-route official catalog proof');
assert(migration.includes("route_type not in ('CR','TR')"), 'automatic consolidation must remain limited to CR/TR identities');
assert(migration.includes("source_method='official_odot_issue70_nlf_consolidation'"), 'survivors must carry explicit ODOT consolidation provenance');
assert(migration.includes("extensions.st_unaryunion(extensions.st_collect(c.geom))"), 'survivor geometry must rebuild from the complete official NLF');
assert(migration.includes('prior street-name rows are preserved as aliases'), 'street-name identities must survive as aliases on the numbered road');

for (const ref of [
  'public.brinesearch_route_prep_steps',
  'public.brinesearch_pad_roads',
  'private_verification.brinesearch_driver_safety_facts_issue69',
  'private_verification.brinesearch_lbrs_catalog_gap_issue70',
  'private_verification.brinesearch_oh_context_resolutions_issue70',
  'private_verification.brinesearch_oh_road_matches_issue70',
  'private_verification.brinesearch_saved_alias_reconcile_issue70',
  'private_verification.brinesearch_source_conflict_corrections_issue70',
  'public.brinesearch_odot_context_resolutions',
  'public.brinesearch_odot_step_matches'
]) {
  assert(migration.includes(`update ${ref}`), `foreign/evidence references must be rewired before delete: ${ref}`);
}

assert(migration.includes("match_method='road_manager_exact_current_alias_issue70'"), 'post-consolidation exact matcher must have dedicated provenance');
assert(migration.includes('count(distinct rn.id) roads') && migration.includes('where roads=1'), 'literal alias convergence must require exactly one Road Manager identity');
assert(migration.includes("lower(coalesce(rn.county,''))=lower(coalesce(s.county,''))"), 'literal alias convergence must be county scoped');
assert(migration.includes("r.verification_status='verified'") && migration.includes("r.geometry_status in ('official_centerline_loaded','measured_from_official_centerline','owner_verified_complete')"), 'exact convergence must require verified trusted geometry');
assert(migration.includes('exact_links<>22'), 'rollback-proved exact convergence count must fail closed on drift');
assert(migration.includes("'fuzzy_matching',false") && migration.includes("'name_similarity_decision',false") && migration.includes("'nearest_road_fallback',false") && migration.includes("'spatial_fallback',false"), 'exact convergence must record no-guess behavior');
assert(!migration.includes('levenshtein') && !migration.includes('similarity('), 'NLF consolidation may not use fuzzy matching');
assert(!migration.includes('ST_DWithin') && !migration.includes('st_dwithin') && !migration.includes('ST_Distance') && !migration.includes('st_distance'), 'NLF consolidation may not use spatial proximity for identity');
assert(!migration.includes('brinesearch_publish_structured_route'), '#69 structured routes must not be published');
assert(!migration.includes('structured_route_steps='), '#69 pad route snapshots must not be written');

console.log(JSON.stringify({
  issue: 70,
  duplicateNlfGroups: 24,
  duplicateRoadRows: 53,
  excessRoadRowsRemoved: 29,
  postConsolidationExactLinks: 22,
  identity: 'exact ODOT NLF + county + one route type/number',
  aliases: 'prior Road Manager names + official ODOT street names',
  geometry: 'complete ODOT NLF union',
  matching: 'literal state/county-scoped unique identity only',
  routePublication: 'none; #69 untouched',
  result: 'pass'
}, null, 2));
