import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const decisionMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260811092921_issue70_corrected_source_conflict_decision.sql'),
  'utf8'
);
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260811093511_issue70_held_source_conflicts.sql'),
  'utf8'
);

function assert(condition, message) {
  if (!condition) throw new Error(`Issue #70 source-conflict audit failed: ${message}`);
}

assert(decisionMigration.includes("'corrected_source_conflict'::text"), 'resolved source conflicts need a distinct durable decision state');
assert(decisionMigration.includes('brinesearch_saved_alias_reconcile_issue70_decision_check'), 'decision-state migration must replace the reconciliation check constraint');
assert(migration.includes('private_verification.brinesearch_source_conflict_corrections_issue70'), 'durable source-conflict evidence table must exist');
assert(migration.includes('force row level security'), 'source-conflict evidence must FORCE RLS');
assert(migration.includes('revoke all on private_verification.brinesearch_source_conflict_corrections_issue70 from public,anon,authenticated'), 'browser roles must not read source-conflict evidence');
assert(migration.includes('brinesearch_clear_stale_route_step_identity_issue70'), 'Route Prep stale step identity guard must exist');
assert(migration.includes("new.raw_text is distinct from old.raw_text"), 'stale identity guard must key on a changed step identity');
assert(migration.includes("new.road_id:=null"), 'generic refresh must clear stale road_id when pending step text changes');
assert(migration.includes("new.distance_miles:=null"), 'generic refresh must clear stale mileage when pending step text changes');
assert(migration.includes("'unmatched_saved_road_name'"), 'stale identity guard must cover unmatched generic refresh rows');
assert(migration.includes("'explicit_in_saved_directions'"), 'stale identity guard must clear an old road before a changed explicit highway is rematched');
assert(migration.includes('disable trigger brinesearch_direction_intelligence_refresh') && migration.includes('enable trigger brinesearch_direction_intelligence_refresh'), 'authoritative pad corrections must batch the expensive direction refresh safely');
assert(migration.includes('select public.brinesearch_refresh_all_direction_intelligence()'), 'derived direction intelligence must refresh once after the batched pad correction');

for (const nlfid of [
  'THASTR00135**C',
  'THASTR00137**C',
  'TCOLTR00776**C',
  'TCOLTR00879**C',
  'CHASCR00086**C',
  'CMOECR00064A*C',
  'CMOECR00064**C'
]) {
  assert(migration.includes(nlfid), `exact reviewed official LBRS NLF ${nlfid} must stay pinned`);
}

for (const corrected of [
  'TR-135 / Burrier Rd',
  'TR-137 / Dutch Ridge Rd',
  'TR-776 / Steubenville Pike Rd',
  'TR-879 / Hazel Run Rd',
  'CR-86 / Jamison Rd',
  'CR-64A / Cochran Hill Rd',
  'CR-64 / Cain Ridge Rd'
]) {
  assert(migration.includes(corrected), `corrected route identity must be persisted: ${corrected}`);
}

assert(migration.includes("'official_ohio_lbrs_issue70_source_conflict_correction'"), 'corrected Road Manager rows need explicit official-source provenance');
assert(migration.includes("'official_lbrs_source_conflict_correction_issue70'"), 'corrected Route Prep steps need dedicated exact provenance');
assert(migration.includes("geom_count<>feature_count"), 'all official LBRS features must carry geometry');
assert(migration.includes("f->'properties'->>'nlfid'<>rec.nlfid"), 'LBRS NLF identity must be revalidated exactly');
assert(migration.includes("f->'properties'->>'rd_num'<>rec.route_number"), 'LBRS route number must be revalidated exactly');
assert(migration.includes("f->'properties'->>'jurisdic'<>expected_jur"), 'LBRS jurisdiction must be revalidated exactly');
assert(migration.includes('twp_count=0'), 'expected township must be required');
assert(migration.includes('name_count=0'), 'exact official local street name must be required');
assert(migration.includes("'fuzzy_matching',false") && migration.includes("'name_similarity_decision',false") && migration.includes("'nearest_road_fallback',false"), 'correction evidence must explicitly record no-guess behavior');
assert(migration.includes("decision='corrected_source_conflict'"), 'resolved saved-alias conflicts must be durably marked corrected');

assert(migration.includes("structured_road_sequence='OH-7 → OH-39 → TR-776 / Steubenville Pike Rd → TR-879 / Hazel Run Rd → Lease Road'"), 'JANIE-TRUST parser-created OR/duplicate route must be structurally cleaned');
assert(migration.includes("structured_road_sequence='OH-78 → CR-64A / Cochran Hill Rd → CR-64 / Cain Ridge Rd → Lease Road'"), 'HOLLIDAY CR-64A/CR-64 source sequence must be structurally corrected');
assert(migration.includes("2.70") && migration.includes("0.43"), 'HOLLIDAY saved route mileage facts must be preserved');
assert(migration.includes('CB Channel 26 on Cochran Hill Rd'), 'HOLLIDAY driver-safety CB fact must be preserved');
assert(migration.includes("lower(local_alias)='fowler rd'") && migration.includes("decision='held_catalog_gap'"), 'Fowler must remain explicitly held rather than guessed');
assert(migration.includes('Topology is confirmation after exact identity, never the identity decision.'), 'spatial continuity may only confirm an already exact source identity');
assert(!migration.includes('levenshtein') && !migration.includes('similarity('), 'source-conflict correction may not use fuzzy matching');
assert(!migration.includes('brinesearch_publish_structured_route'), 'source-conflict correction must not publish #69 routes');
assert(!migration.includes('structured_route_steps='), 'source-conflict correction must not write #69 structured route snapshots');
assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(migration), 'migration must resolve durable pad/road identities instead of hard-coding generated UUIDs');

console.log(JSON.stringify({
  issue: 70,
  scope: 'held Ohio source conflicts + stale Route Prep step identity guard',
  correctedRoads: 7,
  correctedPads: 5,
  heldByDesign: ['KIDD / Fowler Rd'],
  identityDecision: 'exact official LBRS NLF/number/jurisdiction/township/name plus authoritative saved route context',
  spatialUse: 'post-identity continuity confirmation only',
  routePublication: 'none; #69 untouched',
  result: 'pass'
}, null, 2));
