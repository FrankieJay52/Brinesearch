import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '../..');
const migration = (await fs.readFile(
  path.join(root, 'supabase/migrations/20260811052516_issue70_verified_road_manager_alias_reuse.sql'),
  'utf8'
)).toLowerCase();
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'),'utf8'));

for (const token of [
  'private_verification.brinesearch_verified_alias_matches_issue70',
  'force row level security',
  'brinesearch_stage_verified_alias_matches_issue70',
  'brinesearch_apply_verified_alias_matches_issue70',
  "set search_path=''",
  'public.is_brinesearch_owner',
  "verification_status='verified'",
  "geometry_status in ('official_centerline_loaded','measured_from_official_centerline')",
  'not coalesce(r.candidate_only,false)',
  "'exact_canonical_name'::text",
  "'exact_stored_alias'::text",
  "'exact_slash_alias_component'::text",
  "pg_catalog.regexp_split_to_table(a,'/')",
  'having count(*)=1',
  'road_geometry_digest',
  "match_method='verified_road_manager_explicit_alias_issue70'",
  "match_confidence=1.0",
  "geometry_status='ready'",
  "'new_road_discovery',false",
  "'fuzzy_matching',false",
  "'normalized_core_decision',false",
  "'name_similarity_decision',false",
  "'spatial_fallback',false"
]) assert.ok(migration.includes(token.toLowerCase()), `#70 verified-alias migration missing ${token}`);

for (const forbidden of [
  'similarity(', 'word_similarity(', 'levenshtein(', 'soundex(',
  'st_distance(', 'st_dwithin(', 'st_closestpoint(',
  'insert into public.brinesearch_roads',
  'update public.brinesearch_roads',
  'brinesearch_publish_structured_route'
]) assert.ok(!migration.includes(forbidden), `#70 verified-alias reuse contains forbidden road discovery/guess/publish logic: ${forbidden}`);

for (const fn of [
  'brinesearch_stage_verified_alias_matches_issue70()',
  'brinesearch_apply_verified_alias_matches_issue70()'
]) {
  assert.ok(migration.includes(`revoke all on function public.${fn} from public,anon;`), `${fn} must revoke public/anon execute`);
  assert.ok(migration.includes(`grant execute on function public.${fn} to authenticated;`), `${fn} must expose only authenticated Owner RPC surface`);
}
assert.ok(migration.includes('revoke all on private_verification.brinesearch_verified_alias_matches_issue70 from public,anon,authenticated;'));
assert.ok(migration.includes('grant select,insert,update,delete on private_verification.brinesearch_verified_alias_matches_issue70 to service_role;'));

// Explicit alias evidence must compare the literal saved text. The core-normalized
// name is never used to create the relationship in this slice.
assert.ok(migration.includes('pg_catalog.lower(pg_catalog.btrim(m.raw_text)) as raw_exact'));
assert.ok(migration.includes('a.alias_exact=n.raw_exact'));
assert.ok(!migration.includes('brinesearch_road_name_core('), '#70 verified-alias reuse must not infer aliases from normalized road core.');

assert.equal(pkg.scripts?.['verify:verified-road-alias-reuse'], 'node v17/scripts/audit-verified-road-alias-reuse-issue70.mjs');
assert.ok(pkg.scripts?.build?.includes('verify:verified-road-alias-reuse'));

console.log(JSON.stringify({
  issue: 70,
  slice: 'verified existing Road Manager explicit alias reuse',
  autoApply: 'one trusted Road Manager road + literal canonical/alias/slash-component match',
  roadDiscovery: false,
  spatialFallback: false,
  fuzzyMatching: false,
  routePublication: false
}, null, 2));
console.log('GitHub #70 verified Road Manager alias reuse audit passed.');
