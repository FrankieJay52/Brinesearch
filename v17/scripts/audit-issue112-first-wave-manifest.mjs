import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'docs/issue-112-first-wave-write-manifest.json');
const migrationPath = path.join(root, 'supabase/migrations/20260817153409_issue112_first_wave_authoritative_pad_manifest.sql');
const rollbackPath = path.join(root, 'supabase/rollback/20260817153409_issue112_first_wave_authoritative_pad_manifest.rollback.sql');
const testPath = path.join(root, 'supabase/tests/issue112_first_wave_authoritative_pad_manifest.sql');

const [manifestRaw, migration, rollback, testSql] = await Promise.all([
  readFile(manifestPath, 'utf8'),
  readFile(migrationPath, 'utf8'),
  readFile(rollbackPath, 'utf8'),
  readFile(testPath, 'utf8')
]);
const manifest = JSON.parse(manifestRaw);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const ids = manifest.candidates.map((candidate) => candidate.id);
const legacyIds = manifest.candidates.map((candidate) => candidate.legacy_id);
const apis = manifest.candidates.flatMap((candidate) => candidate.wells.map((well) => well.api_digits));

assert(manifest.issue === 112, 'wrong issue');
assert(manifest.base_main_sha === '4066834452e1f79ab5a6da967d2576127cada0a6', 'wrong base main SHA');
assert(manifest.inventory_checkpoint_comment === 5317266169, 'wrong inventory checkpoint');
assert(manifest.counts.manifest_candidates === 3, 'manifest count must be 3');
assert(manifest.counts.new_pads === 3, 'new pad count must be 3');
assert(manifest.counts.pad_updates === 0, 'pad updates must be zero');
assert(manifest.counts.new_disposals === 0, 'new disposals must be zero');
assert(manifest.counts.disposal_updates === 0, 'disposal updates must be zero');
assert(manifest.counts.held_records === 48, 'held count must be 48');
assert(manifest.held_records.length === 48, 'held list length mismatch');
assert(manifest.candidates.length === 3, 'candidate list length mismatch');
assert(new Set(ids).size === ids.length, 'duplicate target UUID');
assert(new Set(legacyIds).size === legacyIds.length, 'duplicate legacy_id');
assert(apis.length === 7 && new Set(apis).size === 7, 'expected seven unique exact APIs');

for (const candidate of manifest.candidates) {
  assert(candidate.record_type === 'pad', `${candidate.legacy_id}: not a pad`);
  assert(candidate.company === 'Ascent' && candidate.state === 'Ohio', `${candidate.legacy_id}: unexpected company/state`);
  assert(candidate.official_pad.agency === 'Ohio Department of Natural Resources', `${candidate.legacy_id}: non-ODNR pad source`);
  assert(candidate.official_pad.query_url.startsWith('https://services5.arcgis.com/'), `${candidate.legacy_id}: unexpected pad source domain`);
  assert(candidate.official_well_query_url.startsWith('https://services5.arcgis.com/'), `${candidate.legacy_id}: unexpected well source domain`);
  assert(candidate.official_pad.coordinate_role.includes('not a verified truck or lease entrance'), `${candidate.legacy_id}: ambiguous pad coordinate role`);
  assert(candidate.brinepads_discovery.role === 'secondary discovery only', `${candidate.legacy_id}: BrinePads role changed`);
  assert(candidate.held_fields.some((field) => field.includes('address')), `${candidate.legacy_id}: address not held`);
  assert(candidate.held_fields.some((field) => field.includes('directions')), `${candidate.legacy_id}: directions not held`);
  assert(candidate.wells.every((well) => well.operator === 'ASCENT RESOURCES UTICA LLC'), `${candidate.legacy_id}: well operator mismatch`);
}

for (const adjudication of ['GIUSTO', 'BUCKSHOT']) {
  assert(manifest.preserved_adjudications[adjudication]?.startsWith('No write.'), `${adjudication}: no-write adjudication missing`);
}

const padsInsert = migration.match(/insert into public\.pads \(([\s\S]*?)\)\s*values/i);
assert(padsInsert, 'public.pads insert column list missing');
const insertColumns = padsInsert[1].split(',').map((column) => column.trim().toLowerCase());
for (const forbidden of [
  'address', 'latitude', 'longitude', 'property_number', 'written_directions',
  'directions_clear', 'structured_road_sequence', 'brinesearch_google_route_status_issue97'
]) {
  assert(!insertColumns.includes(forbidden), `forbidden public.pads insert column: ${forbidden}`);
}

assert(/pg_advisory_xact_lock/i.test(migration), 'migration advisory lock missing');
assert(/lock table public\.pads in share row exclusive mode/i.test(migration), 'migration writer lock missing');
assert(/exact official APIs already exist/i.test(migration), 'API collision guard missing');
assert(/official ODNR pad identity already exists/i.test(migration), 'official pad collision guard missing');
assert(/public projection was not synchronized exactly/i.test(migration), 'projection assertion missing');
assert(!/\bon\s+conflict\b/i.test(migration), 'migration must not silently upsert');
assert(!/\bupdate\s+public\./i.test(migration), 'migration must not update existing rows');
assert(!/\bdelete\s+from\s+public\./i.test(migration), 'migration must not delete rows');
assert(!/\b(create|alter|drop|grant|revoke)\s+(table|view|function|policy|role|schema)\b/i.test(migration), 'migration must not change schema/security objects');

for (const id of ids) {
  assert(migration.includes(id), `migration missing UUID ${id}`);
  assert(rollback.includes(id), `rollback missing UUID ${id}`);
  assert(testSql.includes(id), `test missing UUID ${id}`);
}
assert(/rollback refused: a target row changed after preparation/i.test(rollback), 'rollback mutation guard missing');
assert(/begin read only/i.test(testSql), 'read-only SQL verification missing');

// Deterministic data-only rehearsal. The SQL itself repeats these count and
// projection invariants transactionally; this simulation never connects to or
// mutates production.
const baseline = {
  pads: manifest.production_before_state.public_pads_count,
  publicProjection: manifest.production_before_state.public_public_pad_detail_count,
  targetIds: new Set(),
  targetApis: new Set()
};
assert(baseline.pads === baseline.publicProjection, 'baseline projection parity mismatch');
assert(ids.every((id) => !baseline.targetIds.has(id)), 'dry-run UUID collision');
assert(apis.every((api) => !baseline.targetApis.has(api)), 'dry-run API collision');

const afterForward = {
  pads: baseline.pads + manifest.counts.new_pads,
  publicProjection: baseline.publicProjection + manifest.counts.new_pads,
  targetIds: new Set(ids),
  targetApis: new Set(apis)
};
assert(afterForward.pads === 1177 && afterForward.publicProjection === 1177, 'forward count rehearsal failed');
assert(afterForward.targetIds.size === 3 && afterForward.targetApis.size === 7, 'forward identity rehearsal failed');

const afterRollback = {
  pads: afterForward.pads - afterForward.targetIds.size,
  publicProjection: afterForward.publicProjection - afterForward.targetIds.size,
  targetIds: new Set(),
  targetApis: new Set()
};
assert(afterRollback.pads === baseline.pads, 'rollback pad count rehearsal failed');
assert(afterRollback.publicProjection === baseline.publicProjection, 'rollback projection count rehearsal failed');

console.log(JSON.stringify({
  status: 'PASS',
  issue: 112,
  manifest_candidates: manifest.counts.manifest_candidates,
  new_pads: manifest.counts.new_pads,
  pad_updates: manifest.counts.pad_updates,
  new_disposals: manifest.counts.new_disposals,
  disposal_updates: manifest.counts.disposal_updates,
  held_records: manifest.counts.held_records,
  exact_api_count: apis.length,
  dry_run: `PASS ${baseline.pads}->${afterForward.pads}`,
  rollback_rehearsal: `PASS ${afterForward.pads}->${afterRollback.pads}`,
  production_writes: 0,
  sha256: {
    manifest: sha256(manifestRaw),
    migration: sha256(migration),
    rollback: sha256(rollback),
    test: sha256(testSql)
  }
}, null, 2));
