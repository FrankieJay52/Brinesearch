import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const migrations = path.join(root, 'supabase', 'migrations');
const base = fs.readFileSync(path.join(migrations, '20260811064436_issue70_saved_alias_reconciliation.sql'), 'utf8');
const runtime = fs.readFileSync(path.join(migrations, '20260811064449_issue70_saved_alias_reconciliation_runtime_fix.sql'), 'utf8');
const converge = fs.readFileSync(path.join(migrations, '20260811064504_issue70_saved_alias_reconciliation_converge.sql'), 'utf8');
const passCount = fs.readFileSync(path.join(migrations, '20260811064523_issue70_saved_alias_reconciliation_pass_count.sql'), 'utf8');
const split = fs.readFileSync(path.join(migrations, '20260811065144_issue70_split_cr10_cr12_identity.sql'), 'utf8');
const lockdown = fs.readFileSync(path.join(migrations, '20260811065448_issue70_saved_alias_reconciliation_rpc_lockdown.sql'), 'utf8');
const exactAlias = fs.readFileSync(path.join(migrations, '20260811071553_issue70_exact_existing_alias_reuse.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`Issue #70 road reconciliation audit failed: ${message}`);
}

assert(base.includes('private_verification.brinesearch_saved_alias_reconcile_issue70'), 'durable private evidence table must exist');
assert(base.includes('force row level security'), 'private reconciliation evidence must FORCE RLS');
assert(base.includes('revoke all on private_verification.brinesearch_saved_alias_reconcile_issue70 from public,anon,authenticated'), 'browser roles must not read reconciliation evidence');
assert(base.includes("'Step-by-step directions:'"), 'alias source must be restricted to the saved Road sequence reference before step prose');
assert(base.includes('authoritative_saved_clear_direction_explicit_alias_pair'), 'saved Clear Direction explicit-pair provenance must be recorded');
assert(base.includes("ps.local_key=u.raw_key"), 'unmatched route text must exactly match the saved local alias key');
assert(base.includes('source_identity_count<>1'), 'a local alias mapping to multiple numbered identities must fail closed');
assert(base.includes("r.existing_count>1"), 'multiple Road Manager candidates must fail closed');
assert(base.includes("r.official_route_type in ('CR','TR')"), 'automatic road create/upgrade must be limited to county/township identities');
assert(base.includes("official_nlf_count=1") && base.includes('official_geometry_complete'), 'new/upgrade roads must require one complete official ODOT NLF');
assert(base.includes("geometry_status in ('official_centerline_loaded','measured_from_official_centerline')"), 'existing Road Manager reuse must require trusted geometry');
assert(base.includes("match_method='saved_clear_explicit_alias_issue70'"), 'applied route-prep rows must carry the dedicated exact match method');
assert(base.includes("'fuzzy_matching',false") && base.includes("'nearest_road_fallback',false") && base.includes("'spatial_fallback',false"), 'applied evidence must explicitly record no-guess behavior');
assert(!base.includes('brinesearch_publish_structured_route'), 'reconciliation must not publish #69 routes');
assert(!base.includes('ST_DWithin') && !base.includes('st_dwithin') && !base.includes('ST_Distance') && !base.includes('st_distance'), 'reconciliation may not use spatial proximity as an identity decision');
assert(!base.includes('levenshtein') && !base.includes('similarity('), 'reconciliation may not use fuzzy text matching');

assert(runtime.includes('(min(rr.id::text))::uuid'), 'UUID aggregate runtime correction must be present');
assert(converge.includes('for v_pass in 1..5'), 'repeated occurrences must converge through a bounded re-stage loop');
assert(converge.includes('brinesearch_apply_saved_alias_reconcile_issue70()'), 'convergence must reuse the same exact single-pass contract');
assert(passCount.includes('v_passes:=v_pass') && passCount.includes("'passes',v_passes"), 'convergence diagnostics must report the actual bounded pass count');

assert(split.includes("'CJEFCR00012**C|route:CR:12'"), 'CR-12 must have a separate exact official identity');
assert(split.includes("route_number='10'"), 'CR-10 source row must be identified structurally');
assert(split.includes("s.raw_text ~* '^\\s*CR[ -]?12"), 'only explicit CR-12 route-prep rows may be moved');
assert(split.includes('removed CR-12 aliases'), 'CR-10 contamination cleanup must be documented');
assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(split), 'CR-10/CR-12 migration must not hard-code generated UUIDs');
assert(!split.includes('brinesearch_publish_structured_route'), 'identity split must not publish #69 routes');
assert(!split.includes('road_manager_recalculate_route_readiness()'), 'deploy-role CR-12 migration must leave Owner-only readiness recalculation to the maintenance RPC');

for (const fn of [
  'brinesearch_stage_saved_alias_reconcile_issue70',
  'brinesearch_apply_saved_alias_reconcile_issue70',
  'brinesearch_apply_saved_alias_reconcile_all_issue70'
]) {
  assert(lockdown.includes(`revoke all on function public.${fn}() from public,anon,authenticated`), `${fn} must not remain an authenticated SECURITY DEFINER browser RPC`);
}

assert(exactAlias.includes("having count(distinct road_id)=1"), 'existing-alias reuse must require one distinct Road Manager road');
assert(exactAlias.includes("verification_status='verified'"), 'existing-alias reuse must require verified Road Manager data');
assert(exactAlias.includes("geometry_status in ('official_centerline_loaded','measured_from_official_centerline')"), 'existing-alias reuse must require trusted geometry');
assert(exactAlias.includes("pg_catalog.lower(pg_catalog.btrim(u.raw_text))=rn.exact_name"), 'existing-alias reuse must use literal canonical/stored alias equality');
assert(exactAlias.includes("regexp_split_to_table(a,'\\s*/\\s*')"), 'stored composite aliases may be split only into explicit components');
assert(exactAlias.includes("match_method='road_manager_exact_existing_alias_issue70'"), 'existing-alias links must have a dedicated exact provenance method');
assert(exactAlias.includes("'fuzzy_matching',false") && exactAlias.includes("'nearest_road_fallback',false") && exactAlias.includes("'spatial_fallback',false"), 'existing-alias evidence must record no-guess behavior');
assert(!exactAlias.includes('brinesearch_publish_structured_route'), 'existing-alias reuse must not publish #69 routes');
assert(!exactAlias.includes('road_manager_recalculate_route_readiness()'), 'data migration must remain deploy-role safe; readiness is recalculated in controlled Owner verification');
assert(!exactAlias.includes('ST_DWithin') && !exactAlias.includes('st_dwithin') && !exactAlias.includes('ST_Distance') && !exactAlias.includes('st_distance'), 'existing-alias identity may not use spatial proximity');
assert(!exactAlias.includes('levenshtein') && !exactAlias.includes('similarity('), 'existing-alias identity may not use fuzzy text matching');

console.log(JSON.stringify({
  issue: 70,
  source: 'authoritative saved Clear Direction explicit alias pairs + exact trusted Road Manager canonical/stored aliases',
  routeIdentity: 'exact numbered route + geographic scope + official ODOT evidence where creation/upgrade is required',
  existingRoadReuse: 'one distinct verified trusted-geometry road only',
  createUpgrade: 'CR/TR only, one complete official ODOT NLF',
  repeatedOccurrences: 'bounded exact re-stage convergence',
  exactExistingAlias: 'literal canonical/alias/composite-component equality only',
  contaminationRepair: 'Jefferson CR-10 and CR-12 split structurally',
  maintenanceSecurity: 'private evidence + maintenance-only SECURITY DEFINER reconciliation functions',
  routePublication: 'none; #69 remains canonical and fail-closed',
  result: 'pass'
}, null, 2));
